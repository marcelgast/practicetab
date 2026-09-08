use std::collections::HashMap;

use super::types::{
    MetronomeSampleSet, MetronomeSoundMode, MetronomeTockVariant, METRONOME_NON_TOCK_GAIN_TRIM,
    METRONOME_TOCK_GAIN_TRIM, METRONOME_TOCK_MAX_PEAK,
};

// ── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_TOCK_HIGH_ACCENT: &[u8] = include_bytes!("metronome_samples/tock/accent_high.wav");
const SAMPLE_TOCK_CLICK: &[u8] = include_bytes!("metronome_samples/tock/normal.wav");
const SAMPLE_TOCK_LOW: &[u8] = include_bytes!("metronome_samples/tock/accent_low.wav");
const SAMPLE_TOCK_SUBDIVISION: &[u8] = include_bytes!("metronome_samples/tock/subdivision.wav");

const SAMPLE_DRUM_KIT_HIGH_ACCENT: &[u8] =
    include_bytes!("metronome_samples/drum_kit/accent_high.wav");
const SAMPLE_DRUM_KIT_CLICK: &[u8] = include_bytes!("metronome_samples/drum_kit/normal.wav");
const SAMPLE_DRUM_KIT_LOW: &[u8] = include_bytes!("metronome_samples/drum_kit/accent_low.wav");
const SAMPLE_DRUM_KIT_SUBDIVISION: &[u8] =
    include_bytes!("metronome_samples/drum_kit/subdivision.wav");

const SAMPLE_HYPE_HIGH_ACCENT: &[u8] = include_bytes!("metronome_samples/hype/accent_high.wav");
const SAMPLE_HYPE_CLICK: &[u8] = include_bytes!("metronome_samples/hype/normal.wav");
const SAMPLE_HYPE_LOW: &[u8] = include_bytes!("metronome_samples/hype/accent_low.wav");
const SAMPLE_HYPE_SUBDIVISION: &[u8] = include_bytes!("metronome_samples/hype/subdivision.wav");

const SAMPLE_METAL_KIT_HIGH_ACCENT: &[u8] =
    include_bytes!("metronome_samples/metal_kit/accent_high.wav");
const SAMPLE_METAL_KIT_CLICK: &[u8] = include_bytes!("metronome_samples/metal_kit/normal.wav");
const SAMPLE_METAL_KIT_LOW: &[u8] = include_bytes!("metronome_samples/metal_kit/accent_low.wav");
const SAMPLE_METAL_KIT_SUBDIVISION: &[u8] =
    include_bytes!("metronome_samples/metal_kit/subdivision.wav");

const SAMPLE_RIDE_KIT_HIGH_ACCENT: &[u8] =
    include_bytes!("metronome_samples/ride_kit/accent_high.wav");
const SAMPLE_RIDE_KIT_CLICK: &[u8] = include_bytes!("metronome_samples/ride_kit/normal.wav");
const SAMPLE_RIDE_KIT_LOW: &[u8] = include_bytes!("metronome_samples/ride_kit/accent_low.wav");
const SAMPLE_RIDE_KIT_SUBDIVISION: &[u8] =
    include_bytes!("metronome_samples/ride_kit/subdivision.wav");

// ── WAV decoding ─────────────────────────────────────────────────────────────

fn read_le_u16(data: &[u8], offset: usize) -> Option<u16> {
    data.get(offset..offset + 2)
        .and_then(|bytes| bytes.try_into().ok())
        .map(u16::from_le_bytes)
}

fn read_le_u32(data: &[u8], offset: usize) -> Option<u32> {
    data.get(offset..offset + 4)
        .and_then(|bytes| bytes.try_into().ok())
        .map(u32::from_le_bytes)
}

pub(crate) fn decode_wav_mono_f32(bytes: &[u8]) -> Option<(u32, Vec<f32>)> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut cursor = 12usize;
    let mut fmt_audio_format = 0u16;
    let mut fmt_channels = 0u16;
    let mut fmt_sample_rate = 0u32;
    let mut fmt_bits_per_sample = 0u16;
    let mut data_chunk: Option<&[u8]> = None;
    while cursor + 8 <= bytes.len() {
        let chunk_id = bytes.get(cursor..cursor + 4)?;
        let chunk_size = read_le_u32(bytes, cursor + 4)? as usize;
        let chunk_start = cursor + 8;
        let chunk_end = chunk_start.saturating_add(chunk_size);
        if chunk_end > bytes.len() {
            break;
        }
        if chunk_id == b"fmt " {
            fmt_audio_format = read_le_u16(bytes, chunk_start)?;
            fmt_channels = read_le_u16(bytes, chunk_start + 2)?;
            fmt_sample_rate = read_le_u32(bytes, chunk_start + 4)?;
            fmt_bits_per_sample = read_le_u16(bytes, chunk_start + 14)?;
        } else if chunk_id == b"data" {
            data_chunk = bytes.get(chunk_start..chunk_end);
        }
        let padded = if chunk_size.is_multiple_of(2) {
            chunk_size
        } else {
            chunk_size + 1
        };
        cursor = chunk_start.saturating_add(padded);
    }
    let pcm = data_chunk?;
    if fmt_channels == 0 || fmt_sample_rate == 0 {
        return None;
    }
    let bytes_per_sample = (fmt_bits_per_sample / 8) as usize;
    let frame_size = bytes_per_sample.saturating_mul(fmt_channels as usize);
    if frame_size == 0 {
        return None;
    }
    let mut out = Vec::with_capacity(pcm.len() / frame_size);
    let mut offset = 0usize;
    while offset + frame_size <= pcm.len() {
        let sample = match (fmt_audio_format, fmt_bits_per_sample) {
            (1, 16) => {
                let value = i16::from_le_bytes([pcm[offset], pcm[offset + 1]]);
                value as f32 / 32768.0
            }
            (1, 24) => {
                let b0 = pcm[offset] as u32;
                let b1 = (pcm[offset + 1] as u32) << 8;
                let b2 = (pcm[offset + 2] as u32) << 16;
                let mut value = (b0 | b1 | b2) as i32;
                if value & 0x0080_0000 != 0 {
                    value |= !0x00FF_FFFF;
                }
                value as f32 / 8_388_608.0
            }
            (1, 32) => {
                let value = i32::from_le_bytes([
                    pcm[offset],
                    pcm[offset + 1],
                    pcm[offset + 2],
                    pcm[offset + 3],
                ]);
                value as f32 / 2_147_483_648.0
            }
            (3, 32) => f32::from_le_bytes([
                pcm[offset],
                pcm[offset + 1],
                pcm[offset + 2],
                pcm[offset + 3],
            ]),
            _ => return None,
        };
        out.push(sample);
        offset += frame_size;
    }
    Some((fmt_sample_rate, out))
}

pub(crate) fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if input.is_empty() || from_rate == 0 || to_rate == 0 {
        return Vec::new();
    }
    if from_rate == to_rate {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = ((input.len() as f64) / ratio).max(1.0).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for index in 0..out_len {
        let src_pos = index as f64 * ratio;
        let left = src_pos.floor() as usize;
        let right = (left + 1).min(input.len().saturating_sub(1));
        let frac = (src_pos - left as f64) as f32;
        let sample = input[left] * (1.0 - frac) + input[right] * frac;
        out.push(sample);
    }
    out
}

// ── Sample rendering ─────────────────────────────────────────────────────────

fn render_metronome_sample_raw(
    sample_set: MetronomeSampleSet,
    variant: MetronomeTockVariant,
    sample_rate: u32,
) -> Vec<f32> {
    let (source_rate, source_samples) =
        match decode_wav_mono_f32(metronome_sample_bytes(sample_set, variant)) {
            Some(value) => value,
            None => return vec![0.0; 1],
        };
    let mut out = resample_linear(&source_samples, source_rate, sample_rate);
    if out.is_empty() {
        out.push(0.0);
    }
    out
}

pub(crate) fn render_matched_sample_buffer(
    sample_set: MetronomeSampleSet,
    sample_rate: u32,
    variant: MetronomeTockVariant,
) -> Vec<f32> {
    let mut buffer = render_metronome_sample_raw(sample_set, variant, sample_rate);
    if matches!(sample_set, MetronomeSampleSet::Tock) {
        return buffer;
    }
    let peak = buffer
        .iter()
        .fold(0.0f32, |max, sample| max.max(sample.abs()));
    if peak > METRONOME_TOCK_MAX_PEAK {
        let scale = METRONOME_TOCK_MAX_PEAK / peak;
        for sample in &mut buffer {
            *sample *= scale;
        }
    }
    buffer
}

pub(crate) fn tock_variant_for(
    beat_state: super::types::MetronomeBeatState,
    is_subdivision: bool,
) -> MetronomeTockVariant {
    if is_subdivision {
        return MetronomeTockVariant::Subdivision;
    }
    match beat_state {
        super::types::MetronomeBeatState::Accent => MetronomeTockVariant::HighAccent,
        super::types::MetronomeBeatState::Low => MetronomeTockVariant::LowAccent,
        super::types::MetronomeBeatState::Normal | super::types::MetronomeBeatState::Mute => {
            MetronomeTockVariant::Click
        }
    }
}

pub(crate) fn rms_non_silent(buffer: &[f32]) -> f32 {
    let mut sum = 0.0f32;
    let mut count = 0usize;
    for sample in buffer {
        if sample.abs() < 1.0e-5 {
            continue;
        }
        sum += sample * sample;
        count += 1;
    }
    if count == 0 {
        return 0.0;
    }
    (sum / count as f32).sqrt()
}

pub(crate) fn sample_set_for_mode(sound_mode: MetronomeSoundMode) -> Option<MetronomeSampleSet> {
    match sound_mode {
        MetronomeSoundMode::Tock => Some(MetronomeSampleSet::Tock),
        MetronomeSoundMode::DrumKit => Some(MetronomeSampleSet::DrumKit),
        MetronomeSoundMode::Hype => Some(MetronomeSampleSet::Hype),
        MetronomeSoundMode::MetalKit => Some(MetronomeSampleSet::MetalKit),
        MetronomeSoundMode::RideKit => Some(MetronomeSampleSet::RideKit),
        MetronomeSoundMode::Blip => None,
    }
}

pub(crate) fn metronome_sample_bytes(
    sample_set: MetronomeSampleSet,
    variant: MetronomeTockVariant,
) -> &'static [u8] {
    match (sample_set, variant) {
        (MetronomeSampleSet::Tock, MetronomeTockVariant::HighAccent) => SAMPLE_TOCK_HIGH_ACCENT,
        (MetronomeSampleSet::Tock, MetronomeTockVariant::LowAccent) => SAMPLE_TOCK_LOW,
        (MetronomeSampleSet::Tock, MetronomeTockVariant::Click) => SAMPLE_TOCK_CLICK,
        (MetronomeSampleSet::Tock, MetronomeTockVariant::Subdivision) => SAMPLE_TOCK_SUBDIVISION,
        (MetronomeSampleSet::DrumKit, MetronomeTockVariant::HighAccent) => {
            SAMPLE_DRUM_KIT_HIGH_ACCENT
        }
        (MetronomeSampleSet::DrumKit, MetronomeTockVariant::LowAccent) => SAMPLE_DRUM_KIT_LOW,
        (MetronomeSampleSet::DrumKit, MetronomeTockVariant::Click) => SAMPLE_DRUM_KIT_CLICK,
        (MetronomeSampleSet::DrumKit, MetronomeTockVariant::Subdivision) => {
            SAMPLE_DRUM_KIT_SUBDIVISION
        }
        (MetronomeSampleSet::Hype, MetronomeTockVariant::HighAccent) => SAMPLE_HYPE_HIGH_ACCENT,
        (MetronomeSampleSet::Hype, MetronomeTockVariant::LowAccent) => SAMPLE_HYPE_LOW,
        (MetronomeSampleSet::Hype, MetronomeTockVariant::Click) => SAMPLE_HYPE_CLICK,
        (MetronomeSampleSet::Hype, MetronomeTockVariant::Subdivision) => SAMPLE_HYPE_SUBDIVISION,
        (MetronomeSampleSet::MetalKit, MetronomeTockVariant::HighAccent) => {
            SAMPLE_METAL_KIT_HIGH_ACCENT
        }
        (MetronomeSampleSet::MetalKit, MetronomeTockVariant::LowAccent) => SAMPLE_METAL_KIT_LOW,
        (MetronomeSampleSet::MetalKit, MetronomeTockVariant::Click) => SAMPLE_METAL_KIT_CLICK,
        (MetronomeSampleSet::MetalKit, MetronomeTockVariant::Subdivision) => {
            SAMPLE_METAL_KIT_SUBDIVISION
        }
        (MetronomeSampleSet::RideKit, MetronomeTockVariant::HighAccent) => {
            SAMPLE_RIDE_KIT_HIGH_ACCENT
        }
        (MetronomeSampleSet::RideKit, MetronomeTockVariant::LowAccent) => SAMPLE_RIDE_KIT_LOW,
        (MetronomeSampleSet::RideKit, MetronomeTockVariant::Click) => SAMPLE_RIDE_KIT_CLICK,
        (MetronomeSampleSet::RideKit, MetronomeTockVariant::Subdivision) => {
            SAMPLE_RIDE_KIT_SUBDIVISION
        }
    }
}

// ── MetronomeSampleCache ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(crate) struct MetronomeSampleCache {
    pub(crate) sample_rate: u32,
    buffers: HashMap<(MetronomeSampleSet, MetronomeTockVariant), Vec<f32>>,
    gains: HashMap<(MetronomeSampleSet, MetronomeTockVariant), f32>,
}

impl MetronomeSampleCache {
    pub(crate) fn new(sample_rate: u32) -> Self {
        let mut buffers = HashMap::new();
        let mut gains = HashMap::new();
        let sets = [
            MetronomeSampleSet::Tock,
            MetronomeSampleSet::DrumKit,
            MetronomeSampleSet::Hype,
            MetronomeSampleSet::MetalKit,
            MetronomeSampleSet::RideKit,
        ];
        let variants = [
            MetronomeTockVariant::HighAccent,
            MetronomeTockVariant::LowAccent,
            MetronomeTockVariant::Click,
            MetronomeTockVariant::Subdivision,
        ];
        for sample_set in sets {
            for variant in variants {
                buffers.insert(
                    (sample_set, variant),
                    render_matched_sample_buffer(sample_set, sample_rate, variant),
                );
            }
        }
        for variant in variants {
            let mut sum = 0.0f32;
            let mut count = 0u32;
            for sample_set in sets {
                if let Some(buffer) = buffers.get(&(sample_set, variant)) {
                    let rms = rms_non_silent(buffer);
                    if rms > 0.0 {
                        sum += rms;
                        count += 1;
                    }
                }
            }
            let target_rms = if count > 0 { sum / count as f32 } else { 0.0 };
            for sample_set in sets {
                let gain = if let Some(buffer) = buffers.get(&(sample_set, variant)) {
                    let rms = rms_non_silent(buffer);
                    if target_rms > 0.0 && rms > 0.0 {
                        let base_gain = (target_rms / rms).clamp(0.35, 2.5);
                        if matches!(sample_set, MetronomeSampleSet::Tock) {
                            (base_gain * METRONOME_TOCK_GAIN_TRIM).clamp(0.35, 2.5)
                        } else {
                            (base_gain * METRONOME_NON_TOCK_GAIN_TRIM).clamp(0.35, 2.5)
                        }
                    } else {
                        1.0
                    }
                } else {
                    1.0
                };
                gains.insert((sample_set, variant), gain);
            }
        }
        Self {
            sample_rate,
            buffers,
            gains,
        }
    }

    pub(crate) fn buffer(
        &self,
        sample_set: MetronomeSampleSet,
        variant: MetronomeTockVariant,
    ) -> &[f32] {
        self.buffers
            .get(&(sample_set, variant))
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub(crate) fn gain(
        &self,
        sample_set: MetronomeSampleSet,
        variant: MetronomeTockVariant,
    ) -> f32 {
        self.gains
            .get(&(sample_set, variant))
            .copied()
            .unwrap_or(1.0)
    }
}
