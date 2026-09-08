use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

// ── Constants ────────────────────────────────────────────────────────────────

pub const MASTER_GAIN_BOOST: f32 = 50.0;
pub(crate) const STEEL_GUITAR_PROGRAM: u8 = 30;
pub(crate) const STEEL_GUITAR_GAIN: f32 = 1.6;
pub(crate) const BASS_PROGRAM_MIN: u8 = 32;
pub(crate) const BASS_PROGRAM_MAX: u8 = 39;
pub(crate) const BASS_PROGRAM_GAIN: f32 = 1.45;
pub(crate) const LISTEN_DUCKING: f32 = 0.35;
pub(crate) const DEFAULT_BLOCK_SIZE: usize = 64;
pub(crate) const DEFAULT_POLYPHONY: usize = 256;
pub(crate) const PITCH_BEND_CENTER: i32 = 8192;
pub(crate) const PITCH_BEND_MAX: i32 = 16383;
pub(crate) const VIB_RATE_HZ_DEFAULT: f32 = 4.8;
pub(crate) const VIB_RATE_HZ_WIDE: f32 = 4.8;
pub(crate) const VIB_RATE_SCALE: f32 = 1.0;
pub(crate) const VIB_DEPTH_CENTS_DEFAULT: f32 = 1.6;
pub(crate) const VIB_DEPTH_CENTS_WIDE: f32 = 3.0;
pub(crate) const VIBRATO_FADE_SECONDS: f32 = 0.12;
pub(crate) const VIBRATO_SMOOTHING_HZ: f32 = 18.0;
pub(crate) const VIBRATO_FADE_OUT_SECONDS: f32 = 0.06;
pub(crate) const VIBRATO_MAX_PB_DELTA: i32 = 400;
pub(crate) const DEFAULT_BEND_RANGE_SEMITONES: f32 = 12.0;
pub(crate) const MIN_BEND_RANGE_SEMITONES: f32 = 0.5;
pub(crate) const METRONOME_CLICK_MS: f64 = 30.0;
pub(crate) const METRONOME_BEEP_CLICK_MS: f64 = 140.0;
pub(crate) const METRONOME_OUTPUT_GAIN: f32 = 1.35;
pub(crate) const METRONOME_TOCK_GAIN_TRIM: f32 = 2.64;
pub(crate) const METRONOME_NON_TOCK_GAIN_TRIM: f32 = 0.9;
pub(crate) const METRONOME_BUS_LIMITER_CEILING: f32 = 0.707_945_76; // -3 dBFS
pub(crate) const METRONOME_BUS_LIMITER_ATTACK_MS: f64 = 2.0;
pub(crate) const METRONOME_BUS_LIMITER_RELEASE_MS: f64 = 80.0;
pub(crate) const TAB_OUTPUT_GAIN: f32 = 0.192;
pub(crate) const SONG_OUTPUT_GAIN: f32 = 0.1;
/// Duration of fade applied when song or metronome starts/stops, in seconds.
/// 10 ms is short enough to be inaudible but prevents discontinuity pops.
pub(crate) const AUDIO_FADE_DURATION_SECS: f64 = 0.010;
/// Number of samples for crossfade at song loop boundaries (direct path).
/// 256 samples ≈ 6ms at 44100Hz — short enough to be inaudible, long
/// enough to eliminate discontinuity pops.
pub(crate) const SONG_LOOP_XFADE_SAMPLES: u32 = 256;
pub(crate) const TAB_DRUM_OUTPUT_GAIN: f32 = 1.0;
pub(crate) const CHANNEL_GAIN_MAX_BOOST: f32 = 1.2;
pub(crate) const MASTER_LIMITER_CEILING: f32 = 0.944_060_86; // -0.5 dBFS
pub(crate) const MASTER_BUS_LIMITER_ATTACK_MS: f64 = 1.5;
pub(crate) const MASTER_BUS_LIMITER_RELEASE_MS: f64 = 90.0;
pub(crate) const MAX_TRACK_STATE_VOLUME: f32 = 1.8;
pub(crate) const METRONOME_CHANNEL_MELODIC: i32 = 0;
pub(crate) const METRONOME_CHANNEL_DRUM: i32 = 9;
pub(crate) const METRONOME_BLIP_FREQ_ACCENT: f32 = 1000.0;
pub(crate) const METRONOME_BLIP_FREQ_NORMAL: f32 = 800.0;
pub(crate) const METRONOME_BLIP_FREQ_LOW: f32 = 450.0;
pub(crate) const METRONOME_BLIP_ENV_DECAY: f32 = 45.0;
pub(crate) const METRONOME_SUBDIVISION_VELOCITY_SCALE: f32 = 0.8;
pub(crate) const METRONOME_SUBDIVISION_PITCH_OFFSET_HZ: f32 = -50.0;
pub(crate) const METRONOME_TOCK_MAX_PEAK: f32 = 0.891_250_97;
pub(crate) const TUNING_MIN_SEMITONES: i8 = -12;
pub(crate) const TUNING_MAX_SEMITONES: i8 = 12;
pub(crate) const SEEK_MIN_CC7: u8 = 64;
pub(crate) const SEEK_GUARD_MIN_CC7: u8 = 127;

// ── Utility functions ────────────────────────────────────────────────────────

pub(crate) fn clamp_gain(value: f32) -> f32 {
    value.clamp(0.0, MASTER_GAIN_BOOST)
}

pub(crate) fn program_gain(program: u8) -> f32 {
    match program {
        STEEL_GUITAR_PROGRAM => STEEL_GUITAR_GAIN,
        BASS_PROGRAM_MIN..=BASS_PROGRAM_MAX => BASS_PROGRAM_GAIN,
        _ => 1.0,
    }
}

pub(crate) fn tab_drum_output_gain(channel: u8) -> f32 {
    if i32::from(channel) == METRONOME_CHANNEL_DRUM {
        TAB_DRUM_OUTPUT_GAIN
    } else {
        1.0
    }
}

pub fn map_master_gain(percent: u8) -> f32 {
    let clamped = percent.min(100) as f32 / 100.0;
    clamp_gain(clamped * MASTER_GAIN_BOOST)
}

pub(crate) fn metronome_output_gain(sound_mode: MetronomeSoundMode, volume: u8) -> f32 {
    let _ = sound_mode;
    (volume as f32 / 100.0) * METRONOME_OUTPUT_GAIN
}

pub(crate) fn f32_from_bits(value: u32) -> f32 {
    f32::from_bits(value)
}

pub(crate) fn f32_to_bits(value: f32) -> u32 {
    value.to_bits()
}

// ── Public payload structs/enums ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AudioEventKind {
    NoteOn {
        key: u8,
        velocity: u8,
        #[serde(default)]
        vibrato: NoteVibrato,
    },
    NoteOff {
        key: u8,
        velocity: u8,
    },
    ProgramChange {
        program: u8,
    },
    ControlChange {
        controller: u8,
        value: u8,
    },
    PitchBend {
        value: i16,
        #[serde(default)]
        endpoint: bool,
        #[serde(default)]
        label: Option<String>,
    },
    AllNotesOff,
    Reset,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum NoteVibrato {
    #[default]
    None,
    Slight,
    Wide,
}

impl NoteVibrato {
    pub(crate) fn depth_cents(self) -> f32 {
        match self {
            NoteVibrato::None => 0.0,
            NoteVibrato::Slight => VIB_DEPTH_CENTS_DEFAULT,
            NoteVibrato::Wide => VIB_DEPTH_CENTS_WIDE,
        }
    }

    pub(crate) fn rate_hz(self) -> f32 {
        match self {
            NoteVibrato::None => 0.0,
            NoteVibrato::Slight => VIB_RATE_HZ_DEFAULT * VIB_RATE_SCALE,
            NoteVibrato::Wide => VIB_RATE_HZ_WIDE * VIB_RATE_SCALE,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEventPayload {
    pub at_ms: f64,
    pub track_id: String,
    pub channel: u8,
    pub kind: AudioEventKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoPointPayload {
    pub tick: i64,
    pub time_ms: f64,
    pub us_per_quarter: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackStatePayload {
    pub track_id: String,
    pub mute: bool,
    pub solo: bool,
    pub volume: f32,
    pub listen: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MetronomeBeatStatePayload {
    Accent,
    Normal,
    Low,
    Mute,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MetronomeSoundModePayload {
    Blip,
    DrumKit,
    Tock,
    Hype,
    MetalKit,
    RideKit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetronomeConfigPayload {
    pub bpm: f32,
    pub time_sig_top: u8,
    pub time_sig_bottom: u8,
    pub volume: u8,
    pub beat_states: Vec<MetronomeBeatStatePayload>,
    pub subdivisions_enabled: bool,
    pub subdivisions_value: u8,
    pub sound_mode: MetronomeSoundModePayload,
    pub count_in_bars: Vec<u8>,
    pub count_in_enabled: bool,
    pub start_beat_index: u8,
    pub start_sub_index: u8,
    pub start_delay_ms: f32,
    #[serde(default)]
    pub schedule: Vec<MetronomeScheduledEventPayload>,
    #[serde(default)]
    pub schedule_loop_ms: Option<f32>,
    #[serde(default)]
    pub schedule_start_offset_ms: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetronomeScheduledEventPayload {
    pub offset_ms: f32,
    pub kind: MetronomeBeatStatePayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlphaTabMetronomeTickPayload {
    pub beat_index: u8,
    pub beat_duration_ms: f32,
    pub subdivisions: u8,
    pub sound_mode: MetronomeSoundModePayload,
    pub beat_type: MetronomeBeatStatePayload,
    pub volume_scalar: f32,
}

// ── Internal structs/enums ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(crate) struct ScheduledEvent {
    pub(crate) sample_time: f64,
    pub(crate) payload: AudioEventPayload,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub(crate) struct ActiveNoteSnapshot {
    pub(crate) track_id: String,
    pub(crate) channel: u8,
    pub(crate) key: u8,
    pub(crate) velocity: u8,
    pub(crate) on_ms: f64,
    pub(crate) vibrato: NoteVibrato,
}

#[derive(Debug, Clone)]
pub(crate) struct TrackState {
    pub(crate) mute: bool,
    pub(crate) solo: bool,
    pub(crate) volume: f32,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum MetronomeBeatState {
    Accent,
    Normal,
    Low,
    Mute,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum MetronomeSoundMode {
    Blip,
    DrumKit,
    Tock,
    Hype,
    MetalKit,
    RideKit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum MetronomeSampleSet {
    Tock,
    DrumKit,
    Hype,
    MetalKit,
    RideKit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum MetronomeTockVariant {
    HighAccent,
    LowAccent,
    Click,
    Subdivision,
}

// ── GainState ────────────────────────────────────────────────────────────────

pub(crate) struct GainState {
    pub(crate) target: Arc<AtomicU32>,
    pub(crate) current: Arc<AtomicU32>,
}

impl GainState {
    pub(crate) fn new() -> Self {
        Self {
            target: Arc::new(AtomicU32::new(f32_to_bits(1.0))),
            current: Arc::new(AtomicU32::new(f32_to_bits(1.0))),
        }
    }

    pub(crate) fn set_target(&self, value: f32) {
        self.target.store(f32_to_bits(value), Ordering::Relaxed);
    }
}

// ── VibratoState ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub(crate) struct VibratoState {
    pub(crate) active: bool,
    pub(crate) depth_semitones: f32,
    pub(crate) rate_hz: f32,
    pub(crate) phase: f32,
    pub(crate) fade_elapsed: f32,
    pub(crate) fade_out_remaining: f32,
    pub(crate) smoothed_offset_semitones: f32,
}

impl VibratoState {
    pub(crate) fn inactive() -> Self {
        Self {
            active: false,
            depth_semitones: 0.0,
            rate_hz: VIB_RATE_HZ_DEFAULT * VIB_RATE_SCALE,
            phase: 0.0,
            fade_elapsed: 0.0,
            fade_out_remaining: 0.0,
            smoothed_offset_semitones: 0.0,
        }
    }
}

// ── SeekNoteLogState ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub(crate) struct SeekNoteLogState {
    pub(crate) until_ms: f64,
    pub(crate) remaining: usize,
    pub(crate) remaining_bend: usize,
}

// ── TempoPoint ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(crate) struct TempoPoint {
    pub(crate) tick: i64,
    pub(crate) time_ms: f64,
    pub(crate) us_per_quarter: f64,
}

// ── event_priority ───────────────────────────────────────────────────────────

pub(crate) fn event_priority(payload: &AudioEventPayload) -> u8 {
    match payload.kind {
        AudioEventKind::Reset => 0,
        AudioEventKind::AllNotesOff => 1,
        AudioEventKind::ControlChange { .. } => 2,
        AudioEventKind::ProgramChange { .. } => 3,
        AudioEventKind::PitchBend { .. } => 4,
        AudioEventKind::NoteOff { .. } => 5,
        AudioEventKind::NoteOn { .. } => 6,
    }
}
