use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use rustysynth::SoundFont;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use super::devices::{host_id_string, list_devices, select_output_host};
use super::synthesis::EngineRuntime;
use super::types::{
    f32_from_bits, f32_to_bits, map_master_gain, GainState, OutputDevice,
    MASTER_BUS_LIMITER_ATTACK_MS, MASTER_BUS_LIMITER_RELEASE_MS, MASTER_LIMITER_CEILING,
};

pub(crate) struct AudioEngine {
    pub(crate) host: cpal::Host,
    pub(crate) devices_cache: Vec<OutputDevice>,
    pub(crate) selected_device_id: Option<String>,
    pub(crate) stream: Option<cpal::Stream>,
    pub(crate) gain_state: GainState,
    pub(crate) master_volume_percent: u8,
    pub(crate) runtime: Arc<Mutex<EngineRuntime>>,
}

impl AudioEngine {
    pub(crate) fn new(sound_font_path: PathBuf) -> Self {
        let host = select_output_host();
        let devices_cache = list_devices(&host);
        let gain_state = GainState::new();
        let master_volume_percent = 80;
        gain_state.set_target(map_master_gain(master_volume_percent));
        let runtime = Arc::new(Mutex::new(EngineRuntime::new(load_sound_font(
            &sound_font_path,
        ))));
        Self {
            host,
            devices_cache,
            selected_device_id: None,
            stream: None,
            gain_state,
            master_volume_percent,
            runtime,
        }
    }

    pub(crate) fn refresh_devices(&mut self) -> Vec<OutputDevice> {
        self.devices_cache = list_devices(&self.host);
        self.devices_cache.clone()
    }

    pub(crate) fn list_devices(&mut self) -> Vec<OutputDevice> {
        if self.devices_cache.is_empty() {
            self.refresh_devices();
        }
        self.devices_cache.clone()
    }

    pub(crate) fn set_master_volume(&mut self, percent: u8) {
        let clamped = percent.min(100);
        self.master_volume_percent = clamped;
        let gain = map_master_gain(clamped);
        self.gain_state.set_target(gain);
    }

    pub(crate) fn master_volume(&self) -> u8 {
        self.master_volume_percent
    }

    pub(crate) fn set_tuning(&mut self, value: i8) -> Result<(), String> {
        let mut runtime = self
            .runtime
            .lock()
            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
        runtime.set_tuning(value);
        Ok(())
    }

    pub(crate) fn selected_device(&self) -> Option<String> {
        self.selected_device_id.clone()
    }

    pub(crate) fn set_output_device(&mut self, device_id: Option<String>) -> Result<(), String> {
        self.selected_device_id = device_id.clone();
        match self.restart_stream(device_id.clone()) {
            Ok(()) => Ok(()),
            Err(err) => {
                if self.restart_stream(None).is_ok() {
                    Ok(())
                } else {
                    Err(err)
                }
            }
        }
    }

    pub(crate) fn ensure_stream(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Ok(());
        }
        self.restart_stream(self.selected_device_id.clone())
    }

    fn restart_stream(&mut self, device_id: Option<String>) -> Result<(), String> {
        self.stop_stream();
        let device = self.resolve_device(device_id)?;
        let config = select_output_config(&device)?;
        let sample_rate = config.sample_rate().0 as f64;
        let channels = config.channels() as usize;
        let buffer_latency = match config.buffer_size() {
            cpal::SupportedBufferSize::Range { min, .. } => *min as f64,
            cpal::SupportedBufferSize::Unknown => 0.0,
        };
        if let Ok(mut runtime) = self.runtime.lock() {
            runtime.sample_rate = sample_rate;
            runtime.channels = channels;
            runtime.output_latency_samples = buffer_latency;
            runtime.synth = None;
            runtime.refresh_loop_samples();
        }
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => self.build_stream::<f32>(&device, &config.into()),
            cpal::SampleFormat::I16 => self.build_stream::<i16>(&device, &config.into()),
            cpal::SampleFormat::U16 => self.build_stream::<u16>(&device, &config.into()),
            format => Err(format!("unsupported_sample_format: {format:?}")),
        }?;
        stream
            .play()
            .map_err(|err| format!("stream_play_failed: {err}"))?;
        self.stream = Some(stream);
        Ok(())
    }

    fn resolve_device(&self, device_id: Option<String>) -> Result<cpal::Device, String> {
        let Some(id) = device_id else {
            return self
                .host
                .default_output_device()
                .ok_or_else(|| "default_output_device_missing".to_string());
        };
        let mut parts = id
            .split('|')
            .map(|part| part.to_string())
            .collect::<Vec<_>>();
        if parts.len() < 2 {
            return Err("output_device_id_invalid".to_string());
        }
        let index = parts
            .pop()
            .and_then(|part| part.parse::<usize>().ok())
            .unwrap_or(0);
        let device_name = parts.pop().unwrap_or_default();
        let host_key = parts.join("|");
        for host_id in cpal::available_hosts() {
            let host_str = host_id_string(host_id);
            if host_str != host_key {
                continue;
            }
            let host = cpal::host_from_id(host_id)
                .map_err(|_| "output_device_host_unavailable".to_string())?;
            let Ok(devices) = host.output_devices() else {
                return Err("output_devices_unavailable".to_string());
            };
            let mut matched = None;
            for (device_index, device) in devices.enumerate() {
                if device
                    .name()
                    .map(|name| name == device_name)
                    .unwrap_or(false)
                    && device_index == index
                {
                    matched = Some(device);
                    break;
                }
            }
            if let Some(device) = matched {
                return Ok(device);
            }
        }
        Err("output_device_not_found".to_string())
    }

    fn build_stream<T>(
        &self,
        device: &cpal::Device,
        config: &cpal::StreamConfig,
    ) -> Result<cpal::Stream, String>
    where
        T: cpal::Sample + cpal::SizedSample + FromSample<f32>,
    {
        let channels = config.channels as usize;
        let sample_rate = config.sample_rate.0 as f64;
        let target = self.gain_state.target.clone();
        let current = self.gain_state.current.clone();
        let runtime = Arc::clone(&self.runtime);
        let mut master_bus_limiter_gain = 1.0f32;
        let err_fn = |err| {
            let _ = err;
        };
        device
            .build_output_stream(
                config,
                move |data: &mut [T], _| {
                    let mut current_gain = f32_from_bits(current.load(Ordering::Relaxed));
                    let target_gain = f32_from_bits(target.load(Ordering::Relaxed));
                    let frames = if channels > 0 {
                        data.len() / channels
                    } else {
                        0
                    };
                    let step = if frames > 0 {
                        (target_gain - current_gain) / frames as f32
                    } else {
                        0.0
                    };
                    let mut left = vec![0.0_f32; frames];
                    let mut right = vec![0.0_f32; frames];
                    let mut runtime_guard = runtime.lock().ok();
                    if let Some(runtime_state) = runtime_guard.as_mut() {
                        runtime_state.channels = channels;
                        runtime_state.ensure_synth(sample_rate);
                        if runtime_state.playing {
                            if let (Some(loop_start), Some(loop_end)) = (
                                runtime_state.loop_start_samples,
                                runtime_state.loop_end_samples,
                            ) {
                                if runtime_state.position_samples >= loop_end {
                                    runtime_state.seek_to_samples(loop_start);
                                }
                            }
                            let buffer_end = runtime_state.position_samples
                                + frames as f64 * runtime_state.tempo_factor;
                            while runtime_state.next_event_index < runtime_state.events.len() {
                                let event =
                                    runtime_state.events[runtime_state.next_event_index].clone();
                                if event.sample_time <= buffer_end {
                                    runtime_state.process_event(&event.payload);
                                    runtime_state.next_event_index += 1;
                                } else {
                                    break;
                                }
                            }
                            runtime_state.apply_vibrato_for_block(frames);
                            if let Some(synth) = runtime_state.synth.as_mut() {
                                synth.render(&mut left, &mut right);
                            }
                            if runtime_state.tab_volume_gain != 1.0 {
                                for idx in 0..frames {
                                    left[idx] *= runtime_state.tab_volume_gain;
                                    right[idx] *= runtime_state.tab_volume_gain;
                                }
                            }
                            runtime_state.position_samples = buffer_end;
                            let position_ms =
                                (runtime_state.position_samples / sample_rate) * 1000.0;
                            runtime_state.current_tick = runtime_state.ms_to_tick(position_ms);
                        } else {
                            left.fill(0.0);
                            right.fill(0.0);
                        }
                        runtime_state.render_metronome(frames, &mut left, &mut right);
                        runtime_state.render_song(frames, &mut left, &mut right);
                    }
                    for frame in 0..frames {
                        current_gain += step;
                        let base = frame * channels;
                        let left_sample = left[frame];
                        let right_sample = right[frame];
                        let raw_l = left_sample * current_gain;
                        let raw_r = right_sample * current_gain;
                        let peak = raw_l.abs().max(raw_r.abs()).max(1.0e-9);
                        let target_gain = if peak > MASTER_LIMITER_CEILING {
                            MASTER_LIMITER_CEILING / peak
                        } else {
                            1.0
                        };
                        let attack_coeff = (-1.0
                            / ((MASTER_BUS_LIMITER_ATTACK_MS / 1000.0) * sample_rate))
                            .exp() as f32;
                        let release_coeff = (-1.0
                            / ((MASTER_BUS_LIMITER_RELEASE_MS / 1000.0) * sample_rate))
                            .exp() as f32;
                        let coeff = if target_gain < master_bus_limiter_gain {
                            attack_coeff
                        } else {
                            release_coeff
                        };
                        master_bus_limiter_gain =
                            target_gain + coeff * (master_bus_limiter_gain - target_gain);
                        let limiter_gain = master_bus_limiter_gain.clamp(0.0, 1.0);
                        let sample_l = raw_l * limiter_gain;
                        let sample_r = raw_r * limiter_gain;
                        for channel in 0..channels {
                            let value = if channels == 1 {
                                (sample_l + sample_r) * 0.5
                            } else if channel % 2 == 0 {
                                sample_l
                            } else {
                                sample_r
                            };
                            data[base + channel] = value.to_sample::<T>();
                        }
                    }
                    current.store(f32_to_bits(current_gain), Ordering::Relaxed);
                },
                err_fn,
                None,
            )
            .map_err(|err| format!("build_output_stream_failed: {err}"))
    }

    fn stop_stream(&mut self) {
        self.stream = None;
    }
}

pub(crate) fn select_output_config(
    device: &cpal::Device,
) -> Result<cpal::SupportedStreamConfig, String> {
    if let Ok(default_config) = device.default_output_config() {
        return Ok(default_config);
    }
    let configs = device
        .supported_output_configs()
        .map_err(|err| format!("supported_output_configs_failed: {err}"))?;
    let mut best: Option<cpal::SupportedStreamConfig> = None;
    for range in configs {
        let config = {
            let channels = range.channels();
            if channels >= 2 {
                let preferred = cpal::SampleRate(48000);
                if preferred >= range.min_sample_rate() && preferred <= range.max_sample_rate() {
                    range.with_sample_rate(preferred)
                } else {
                    range.with_max_sample_rate()
                }
            } else {
                range.with_max_sample_rate()
            }
        };
        best = Some(config);
        if best.as_ref().is_some_and(|cfg| cfg.channels() >= 2) {
            break;
        }
    }
    best.ok_or_else(|| "no_supported_output_config".to_string())
}

pub(crate) fn load_sound_font(path: &PathBuf) -> Option<Arc<SoundFont>> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).ok()?;
    let mut cursor = std::io::Cursor::new(buffer);
    SoundFont::new(&mut cursor).ok().map(Arc::new)
}
