//! InputEngine: owns the cpal input stream lifecycle and the ring producer.
//! The consumer side is published via `AudioInputBridge` so a downstream
//! analyzer (the pitch detector in PR 3.2) can read from it on its own
//! thread. All mutations go through the command worker thread — this struct
//! is not `Sync`.

use std::sync::Arc;

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};

use super::bridge::AudioInputBridge;
use super::devices::{list_input_devices, resolve_input_device, select_input_host};
use super::ring::{spsc, RingProducer};
use super::types::{InputDevice, InputStatus, DEFAULT_INPUT_BUFFER_FRAMES, INPUT_RING_CAPACITY};

pub(crate) struct InputEngine {
    host: cpal::Host,
    devices_cache: Vec<InputDevice>,
    selected_device_id: Option<String>,
    /// 0-indexed channel the user picked for pitch analysis. `None`
    /// means "mix all channels to mono" (legacy behaviour and the
    /// right default for built-in mics / mono devices). `Some(i)`
    /// picks channel `i` out of each interleaved frame and ignores
    /// the rest — critical for multi-input interfaces where the
    /// guitar only occupies one channel and averaging drags its
    /// level down by `-20 log10(channels)` dB while adding the
    /// other channels' noise.
    selected_channel: Option<u16>,
    stream: Option<Stream>,
    bridge: Arc<AudioInputBridge>,
    status: InputStatus,
}

impl InputEngine {
    pub(crate) fn new(bridge: Arc<AudioInputBridge>) -> Self {
        let host = select_input_host();
        let devices_cache = list_input_devices(&host);
        Self {
            host,
            devices_cache,
            selected_device_id: None,
            selected_channel: None,
            stream: None,
            bridge,
            status: InputStatus::stopped(),
        }
    }

    pub(crate) fn list_devices(&mut self) -> Vec<InputDevice> {
        if self.devices_cache.is_empty() {
            self.refresh_devices();
        }
        self.devices_cache.clone()
    }

    pub(crate) fn refresh_devices(&mut self) -> Vec<InputDevice> {
        self.devices_cache = list_input_devices(&self.host);
        self.devices_cache.clone()
    }

    pub(crate) fn selected_device(&self) -> Option<String> {
        self.selected_device_id.clone()
    }

    pub(crate) fn selected_channel(&self) -> Option<u16> {
        self.selected_channel
    }

    pub(crate) fn status(&self) -> InputStatus {
        self.status
    }

    /// Switch the selected device id. If the input stream is running the
    /// stream is rebuilt on the new device; otherwise only the preference is
    /// recorded and the next `start()` will use it.
    pub(crate) fn set_device(&mut self, id: Option<String>) -> Result<(), String> {
        self.selected_device_id = id;
        if self.stream.is_some() {
            self.stop_stream();
            self.start_stream()?;
        }
        Ok(())
    }

    /// Switch the channel picked out of the interleaved input stream.
    /// `None` = mix all channels to mono (default). `Some(i)` picks
    /// channel `i` (0-indexed). Rebuilds the stream if one is running
    /// so the change takes effect immediately without the user having
    /// to stop/start pitch detection manually.
    pub(crate) fn set_channel(&mut self, channel: Option<u16>) -> Result<(), String> {
        self.selected_channel = channel;
        if self.stream.is_some() {
            self.stop_stream();
            self.start_stream()?;
        }
        Ok(())
    }

    pub(crate) fn start(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Ok(());
        }
        self.start_stream()
    }

    pub(crate) fn stop(&mut self) -> Result<(), String> {
        self.stop_stream();
        Ok(())
    }

    fn stop_stream(&mut self) {
        if let Some(stream) = self.stream.take() {
            let _ = stream.pause();
            drop(stream);
        }
        // Drop the bridged consumer so stale samples never bleed across
        // sessions and downstream readers observe a clean "no input" state.
        self.bridge.clear();
        self.status = InputStatus::stopped();
    }

    fn start_stream(&mut self) -> Result<(), String> {
        let device = resolve_input_device(&self.host, self.selected_device_id.as_deref())?;

        let supported = resolve_input_stream_config(&device, self.selected_channel)?;
        let sample_format = supported.sample_format();
        let supported_buffer = *supported.buffer_size();

        let mut config: StreamConfig = supported.config();
        config.buffer_size = negotiate_buffer_size(supported_buffer);

        let channels = config.channels;
        let sample_rate = config.sample_rate.0;
        // Extract the concrete buffer frame count for diagnostics.
        // `BufferSize::Fixed(n)` is what we normally end up with;
        // `Default` means the driver didn't expose a range and will
        // pick its own, which we surface as `0` so the UI can show
        // "device default" instead of a misleading number.
        let buffer_frames = match config.buffer_size {
            cpal::BufferSize::Fixed(n) => n,
            cpal::BufferSize::Default => 0,
        };
        // Defensive re-clamp after the config resolver: the resolver
        // already fell back to the default config (and `None`) if it
        // couldn't find one with enough channels, but we still want
        // `push_mono` to see `None` when the index lands out of range
        // for the config we actually got — drivers occasionally
        // renegotiate the channel count at `play()` time.
        let selected_channel = self.selected_channel.filter(|&ch| ch < channels);

        // Fresh ring per stream start — prevents stale samples from leaking
        // across device switches or start/stop cycles.
        let (producer, consumer) = spsc(INPUT_RING_CAPACITY);

        let err_fn = |err| {
            // Keep silent per audio-architecture rule (no debug noise).
            let _ = err;
        };

        let stream = match sample_format {
            SampleFormat::F32 => build_stream_f32(
                &device,
                &config,
                producer,
                channels,
                selected_channel,
                err_fn,
            ),
            SampleFormat::I16 => build_stream_i16(
                &device,
                &config,
                producer,
                channels,
                selected_channel,
                err_fn,
            ),
            SampleFormat::U16 => build_stream_u16(
                &device,
                &config,
                producer,
                channels,
                selected_channel,
                err_fn,
            ),
            other => Err(format!("audio_input_unsupported_format: {other:?}")),
        }?;

        stream
            .play()
            .map_err(|e| format!("audio_input_stream_play_failed: {e}"))?;

        self.bridge.install(consumer, sample_rate, channels);
        self.stream = Some(stream);
        self.status = InputStatus {
            running: true,
            sample_rate,
            channels,
            buffer_frames,
        };
        Ok(())
    }
}

/// Negotiate the cpal input buffer size against the device's supported range.
///
/// Prefers the low-latency default (`DEFAULT_INPUT_BUFFER_FRAMES`) but clamps
/// to the device-supported `[min, max]` when available; some drivers reject a
/// fixed size outside that range. Falls back to `BufferSize::Default` when
/// cpal reports `Unknown`.
pub(crate) fn negotiate_buffer_size(supported: cpal::SupportedBufferSize) -> cpal::BufferSize {
    match supported {
        cpal::SupportedBufferSize::Range { min, max } => {
            let clamped = DEFAULT_INPUT_BUFFER_FRAMES.clamp(min, max);
            cpal::BufferSize::Fixed(clamped)
        }
        cpal::SupportedBufferSize::Unknown => cpal::BufferSize::Default,
    }
}

/// Build a concrete `SupportedStreamConfig` that can carry the user's
/// selected channel. If the device's default config already has
/// enough channels (or no channel was picked) we use it directly —
/// zero behaviour change from the pre-channel-picker world. When the
/// picked channel index is beyond the default config's channel count
/// (e.g. Scarlett 4i4 defaults to stereo but the user picked input
/// 3) we scan `supported_input_configs()` and pick the best-matching
/// config that actually covers that channel.
///
/// Ranking for the alternate config is format-first, sample-rate
/// second: keeping the same `SampleFormat` means the stream-build
/// `match` below hits the same branch as usual (no conversion path
/// re-introduced), and keeping the sample rate in the new config's
/// range avoids a pitch-detector resample step. When no supported
/// config covers the picked channel, we fall back to the default and
/// let `push_mono`'s clamp route the (now out-of-range) pick to the
/// mixdown path rather than fail the stream start.
fn resolve_input_stream_config(
    device: &cpal::Device,
    selected_channel: Option<u16>,
) -> Result<cpal::SupportedStreamConfig, String> {
    let default = device
        .default_input_config()
        .map_err(|e| format!("audio_input_default_config_failed: {e}"))?;
    let required_channels = match selected_channel {
        Some(ch) => ch.saturating_add(1),
        None => return Ok(default),
    };
    if default.channels() >= required_channels {
        return Ok(default);
    }
    let Ok(configs) = device.supported_input_configs() else {
        return Ok(default);
    };
    let candidates: Vec<cpal::SupportedStreamConfigRange> = configs
        .filter(|cfg| cfg.channels() >= required_channels)
        .collect();
    let Some(best) = pick_best_config_range(
        candidates.iter(),
        default.sample_format(),
        default.sample_rate(),
    ) else {
        return Ok(default);
    };
    let chosen_sr = if best.min_sample_rate() <= default.sample_rate()
        && default.sample_rate() <= best.max_sample_rate()
    {
        default.sample_rate()
    } else {
        best.max_sample_rate()
    };
    Ok((*best).with_sample_rate(chosen_sr))
}

/// Rank `SupportedStreamConfigRange` candidates against a reference
/// format + sample rate. Higher score = closer to the reference.
///
/// Extracted as a pure function so the selection policy can be
/// exercised by unit tests — the cpal types are cheap-to-construct
/// ranges, no hardware needed.
pub(crate) fn rank_config_candidate(
    candidate: &cpal::SupportedStreamConfigRange,
    reference_format: cpal::SampleFormat,
    reference_sample_rate: cpal::SampleRate,
) -> u8 {
    let format_matches = candidate.sample_format() == reference_format;
    let sr_in_range = candidate.min_sample_rate() <= reference_sample_rate
        && reference_sample_rate <= candidate.max_sample_rate();
    ((format_matches as u8) << 1) | (sr_in_range as u8)
}

/// Pick the best-ranked config range from an iterator. Ties are
/// broken by the higher channel count — on a Scarlett 18i20 that
/// means the true 18-channel config wins over any 2-channel bonded
/// profile the driver happens to also expose.
pub(crate) fn pick_best_config_range<'a, I>(
    candidates: I,
    reference_format: cpal::SampleFormat,
    reference_sample_rate: cpal::SampleRate,
) -> Option<&'a cpal::SupportedStreamConfigRange>
where
    I: IntoIterator<Item = &'a cpal::SupportedStreamConfigRange>,
{
    candidates.into_iter().max_by(|a, b| {
        let sa = rank_config_candidate(a, reference_format, reference_sample_rate);
        let sb = rank_config_candidate(b, reference_format, reference_sample_rate);
        sa.cmp(&sb).then_with(|| a.channels().cmp(&b.channels()))
    })
}

/// Pick a single channel from the interleaved stream, or downmix all
/// channels to mono when `selected_channel` is `None`. Picking one
/// channel is the right behaviour for multi-input interfaces where
/// the guitar only occupies one input (the other channels add noise
/// and the mixdown drops level by `-20 log10(channels)` dB).
pub(crate) fn push_mono(
    producer: &RingProducer,
    samples: &[f32],
    channels: u16,
    selected_channel: Option<u16>,
) {
    if channels <= 1 {
        producer.push_slice(samples);
        return;
    }
    let ch = channels as usize;
    let frames = samples.len() / ch;
    let mut mono = Vec::with_capacity(frames);
    if let Some(pick) = selected_channel {
        // Defensive re-clamp: the caller already dropped out-of-range
        // picks, but the channel count can shift between ticks if
        // the driver renegotiates under us.
        let idx = (pick as usize).min(ch - 1);
        for frame in 0..frames {
            mono.push(samples[frame * ch + idx]);
        }
    } else {
        for frame in 0..frames {
            let mut sum = 0.0_f32;
            for c in 0..ch {
                sum += samples[frame * ch + c];
            }
            mono.push(sum / ch as f32);
        }
    }
    producer.push_slice(&mono);
}

fn build_stream_f32(
    device: &cpal::Device,
    config: &StreamConfig,
    producer: RingProducer,
    channels: u16,
    selected_channel: Option<u16>,
    err_fn: fn(cpal::StreamError),
) -> Result<Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[f32], _| push_mono(&producer, data, channels, selected_channel),
            err_fn,
            None,
        )
        .map_err(|e| format!("audio_input_build_stream_failed: {e}"))
}

fn build_stream_i16(
    device: &cpal::Device,
    config: &StreamConfig,
    producer: RingProducer,
    channels: u16,
    selected_channel: Option<u16>,
    err_fn: fn(cpal::StreamError),
) -> Result<Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _| {
                let floats: Vec<f32> = data.iter().map(|v| *v as f32 / i16::MAX as f32).collect();
                push_mono(&producer, &floats, channels, selected_channel);
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("audio_input_build_stream_failed: {e}"))
}

fn build_stream_u16(
    device: &cpal::Device,
    config: &StreamConfig,
    producer: RingProducer,
    channels: u16,
    selected_channel: Option<u16>,
    err_fn: fn(cpal::StreamError),
) -> Result<Stream, String> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _| {
                let floats: Vec<f32> = data
                    .iter()
                    .map(|v| (*v as f32 / u16::MAX as f32) * 2.0 - 1.0)
                    .collect();
                push_mono(&producer, &floats, channels, selected_channel);
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("audio_input_build_stream_failed: {e}"))
}
