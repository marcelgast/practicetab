use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use rustysynth::{SoundFont, Synthesizer, SynthesizerSettings};
use signalsmith_stretch::Stretch;

use super::song_stream::SongStreamHandle;
use super::types::{AUDIO_FADE_DURATION_SECS, SONG_LOOP_XFADE_SAMPLES, SONG_OUTPUT_GAIN};

use crate::dev_log::dev_append_log_line;

use super::metronome::{MetronomeSampleCache, MetronomeState};
use super::types::{
    event_priority, NoteVibrato, ScheduledEvent, SeekNoteLogState, TempoPoint, TrackState,
    TrackStatePayload, VibratoState, CHANNEL_GAIN_MAX_BOOST, DEFAULT_BEND_RANGE_SEMITONES,
    DEFAULT_BLOCK_SIZE, DEFAULT_POLYPHONY, LISTEN_DUCKING, MAX_TRACK_STATE_VOLUME,
    METRONOME_CHANNEL_DRUM, PITCH_BEND_CENTER, SEEK_MIN_CC7, TAB_OUTPUT_GAIN, TUNING_MAX_SEMITONES,
    TUNING_MIN_SEMITONES,
};

pub(crate) struct EngineRuntime {
    pub(crate) synth: Option<Synthesizer>,
    pub(crate) sound_font: Option<Arc<SoundFont>>,
    pub(crate) sample_rate: f64,
    pub(crate) channels: usize,
    pub(crate) events: Vec<ScheduledEvent>,
    pub(crate) next_event_index: usize,
    pub(crate) position_samples: f64,
    pub(crate) loop_start_samples: Option<f64>,
    pub(crate) loop_end_samples: Option<f64>,
    pub(crate) loop_start_ms: Option<f64>,
    pub(crate) loop_end_ms: Option<f64>,
    pub(crate) playing: bool,
    pub(crate) tempo_factor: f64,
    pub(crate) tempo_map: Vec<TempoPoint>,
    pub(crate) midi_division: f64,
    pub(crate) track_states: HashMap<String, TrackState>,
    pub(crate) listen_track_id: Option<String>,
    pub(crate) output_latency_samples: f64,
    pub(crate) current_tick: i64,
    pub(crate) cc7: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) cc11: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) bank_msb: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) bank_lsb: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) program: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) base_pitch_semitones: [f32; Synthesizer::CHANNEL_COUNT],
    pub(crate) bend_range_semitones: [f32; Synthesizer::CHANNEL_COUNT],
    pub(crate) rpn_msb: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) rpn_lsb: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) data_entry_msb: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) data_entry_lsb: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) vibrato: [VibratoState; Synthesizer::CHANNEL_COUNT],
    pub(crate) vibrato_notes: [[NoteVibrato; 128]; Synthesizer::CHANNEL_COUNT],
    pub(crate) last_cc7_nonzero: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) last_cc11_nonzero: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) pending_cc7_restore: [Option<u8>; Synthesizer::CHANNEL_COUNT],
    pub(crate) pending_cc11_restore: [Option<u8>; Synthesizer::CHANNEL_COUNT],
    pub(crate) last_cc7_change_at_ms: [f64; Synthesizer::CHANNEL_COUNT],
    pub(crate) last_cc11_zero_at_ms: [f64; Synthesizer::CHANNEL_COUNT],
    pub(crate) last_pitch_bend_change_at_ms: [f64; Synthesizer::CHANNEL_COUNT],
    pub(crate) cc7_seek_guard_until_ms: [f64; Synthesizer::CHANNEL_COUNT],
    pub(crate) cc7_seek_guard_min: [u8; Synthesizer::CHANNEL_COUNT],
    pub(crate) active_notes: [u16; Synthesizer::CHANNEL_COUNT],
    pub(crate) last_pitch_bend: [i32; Synthesizer::CHANNEL_COUNT],
    pub(crate) vibrato_seed: u32,
    pub(crate) pitch_range_initialized: [bool; Synthesizer::CHANNEL_COUNT],
    pub(crate) note_on_count: u64,
    pub(crate) metronome_synth: Option<Synthesizer>,
    pub(crate) metronome_tock_cache: Option<MetronomeSampleCache>,
    pub(crate) metronome_state: MetronomeState,
    pub(crate) metronome_bus_limiter_gain: f32,
    pub(crate) tab_volume_gain: f32,
    pub(crate) tuning_semitones: i8,
    pub(crate) debug_seek_note_log: Option<SeekNoteLogState>,

    // Song playback
    pub(crate) song_stream: Option<Arc<Mutex<SongStreamHandle>>>,
    pub(crate) song_position: f64,
    pub(crate) song_playing: bool,
    pub(crate) song_volume: f32,
    pub(crate) song_speed: f64,
    pub(crate) song_tuning_semitones: f32,
    pub(crate) song_loop_start: Option<f64>,
    pub(crate) song_loop_end: Option<f64>,
    /// Per-sample fade gain for song audio (1.0 = full, ramping to 0.0 on stop).
    pub(crate) song_fade_gain: f32,
    pub(crate) song_fade_step: f32,
    /// Samples to wait before actually starting playback (count-in delay).
    song_start_delay_samples: f64,
    /// Crossfade counter for seamless loop wraps (0 = no crossfade active).
    song_loop_xfade_remaining: u32,
    song_loop_xfade_total: u32,
    /// Pitch-preserving time-stretcher for song speed/tuning changes.
    song_stretcher: Option<Stretch>,
    song_stretcher_rate: f64,
    /// True while the stretched render path is in use — prevents mid-playback
    /// switch to the direct path when tuning/speed return to neutral.
    song_stretcher_active: bool,
    /// Per-sample fade gain for metronome audio.
    pub(crate) metronome_fade_gain: f32,
    pub(crate) metronome_fade_step: f32,
}

impl EngineRuntime {
    pub(crate) fn new(sound_font: Option<Arc<SoundFont>>) -> Self {
        Self {
            synth: None,
            sound_font,
            sample_rate: 44100.0,
            channels: 2,
            events: Vec::new(),
            next_event_index: 0,
            position_samples: 0.0,
            loop_start_samples: None,
            loop_end_samples: None,
            loop_start_ms: None,
            loop_end_ms: None,
            playing: false,
            tempo_factor: 1.0,
            tempo_map: Vec::new(),
            midi_division: 480.0,
            track_states: HashMap::new(),
            listen_track_id: None,
            output_latency_samples: 0.0,
            current_tick: 0,
            cc7: [127u8; Synthesizer::CHANNEL_COUNT],
            cc11: [127u8; Synthesizer::CHANNEL_COUNT],
            bank_msb: [0u8; Synthesizer::CHANNEL_COUNT],
            bank_lsb: [0u8; Synthesizer::CHANNEL_COUNT],
            program: [0u8; Synthesizer::CHANNEL_COUNT],
            base_pitch_semitones: [0.0; Synthesizer::CHANNEL_COUNT],
            bend_range_semitones: [DEFAULT_BEND_RANGE_SEMITONES; Synthesizer::CHANNEL_COUNT],
            rpn_msb: [0x7F; Synthesizer::CHANNEL_COUNT],
            rpn_lsb: [0x7F; Synthesizer::CHANNEL_COUNT],
            data_entry_msb: [0u8; Synthesizer::CHANNEL_COUNT],
            data_entry_lsb: [0u8; Synthesizer::CHANNEL_COUNT],
            vibrato: [VibratoState::inactive(); Synthesizer::CHANNEL_COUNT],
            vibrato_notes: [[NoteVibrato::None; 128]; Synthesizer::CHANNEL_COUNT],
            last_cc7_nonzero: [127u8; Synthesizer::CHANNEL_COUNT],
            last_cc11_nonzero: [127u8; Synthesizer::CHANNEL_COUNT],
            pending_cc7_restore: [None; Synthesizer::CHANNEL_COUNT],
            pending_cc11_restore: [None; Synthesizer::CHANNEL_COUNT],
            last_cc7_change_at_ms: [f64::NAN; Synthesizer::CHANNEL_COUNT],
            last_cc11_zero_at_ms: [f64::NAN; Synthesizer::CHANNEL_COUNT],
            last_pitch_bend_change_at_ms: [f64::NAN; Synthesizer::CHANNEL_COUNT],
            cc7_seek_guard_until_ms: [f64::NAN; Synthesizer::CHANNEL_COUNT],
            cc7_seek_guard_min: [SEEK_MIN_CC7; Synthesizer::CHANNEL_COUNT],
            active_notes: [0u16; Synthesizer::CHANNEL_COUNT],
            last_pitch_bend: [PITCH_BEND_CENTER; Synthesizer::CHANNEL_COUNT],
            vibrato_seed: 0x9E3779B9,
            pitch_range_initialized: [false; Synthesizer::CHANNEL_COUNT],
            note_on_count: 0,
            metronome_synth: None,
            metronome_tock_cache: None,
            metronome_state: MetronomeState::new(),
            metronome_bus_limiter_gain: 1.0,
            tab_volume_gain: 1.0,
            tuning_semitones: 0,
            debug_seek_note_log: None,
            song_stream: None,
            song_position: 0.0,
            song_playing: false,
            song_volume: 0.8,
            song_speed: 1.0,
            song_tuning_semitones: 0.0,
            song_loop_start: None,
            song_loop_end: None,
            song_fade_gain: 0.0,
            song_fade_step: 0.0,
            song_start_delay_samples: 0.0,
            song_loop_xfade_remaining: 0,
            song_loop_xfade_total: 0,
            song_stretcher: None,
            song_stretcher_rate: 44100.0,
            song_stretcher_active: false,
            metronome_fade_gain: 1.0,
            metronome_fade_step: 0.0,
        }
    }

    pub(crate) fn ensure_synth(&mut self, sample_rate: f64) {
        self.sample_rate = sample_rate;
        if self.synth.is_some() {
            return;
        }
        let Some(sound_font) = self.sound_font.clone() else {
            return;
        };
        let mut settings = SynthesizerSettings::new(sample_rate as i32);
        settings.block_size = DEFAULT_BLOCK_SIZE;
        settings.maximum_polyphony = DEFAULT_POLYPHONY;
        settings.enable_reverb_and_chorus = false;
        if let Ok(synth) = Synthesizer::new(&sound_font, &settings) {
            let mut synth = synth;
            for channel in 0..Synthesizer::CHANNEL_COUNT {
                let range = self.bend_range_for_channel(channel);
                Self::send_pitch_bend_range(&mut synth, channel, range);
                self.pitch_range_initialized[channel] = true;
            }
            self.synth = Some(synth);
        }
    }

    pub(crate) fn ensure_metronome_synth(&mut self, sample_rate: f64) {
        if self.metronome_synth.is_some() {
            return;
        }
        let Some(sound_font) = self.sound_font.clone() else {
            return;
        };
        let mut settings = SynthesizerSettings::new(sample_rate as i32);
        settings.block_size = DEFAULT_BLOCK_SIZE;
        settings.maximum_polyphony = 32;
        settings.enable_reverb_and_chorus = false;
        if let Ok(synth) = Synthesizer::new(&sound_font, &settings) {
            self.metronome_synth = Some(synth);
        }
    }

    pub(crate) fn ensure_metronome_tock_cache(&mut self, sample_rate: f64) {
        let rounded_rate = sample_rate.round().max(1.0) as u32;
        if self
            .metronome_tock_cache
            .as_ref()
            .is_some_and(|cache| cache.sample_rate == rounded_rate)
        {
            return;
        }
        self.metronome_tock_cache = Some(MetronomeSampleCache::new(rounded_rate));
    }

    pub(crate) fn clear_events(&mut self) {
        self.events.clear();
        self.next_event_index = 0;
        self.position_samples = 0.0;
        self.current_tick = 0;
        self.tempo_map.clear();
        self.midi_division = 480.0;
        self.base_pitch_semitones = [0.0; Synthesizer::CHANNEL_COUNT];
        self.bend_range_semitones = [DEFAULT_BEND_RANGE_SEMITONES; Synthesizer::CHANNEL_COUNT];
        self.rpn_msb = [0x7F; Synthesizer::CHANNEL_COUNT];
        self.rpn_lsb = [0x7F; Synthesizer::CHANNEL_COUNT];
        self.data_entry_msb = [0u8; Synthesizer::CHANNEL_COUNT];
        self.data_entry_lsb = [0u8; Synthesizer::CHANNEL_COUNT];
        self.vibrato = [VibratoState::inactive(); Synthesizer::CHANNEL_COUNT];
        self.vibrato_notes = [[NoteVibrato::None; 128]; Synthesizer::CHANNEL_COUNT];
        self.cc7 = [127u8; Synthesizer::CHANNEL_COUNT];
        self.cc11 = [127u8; Synthesizer::CHANNEL_COUNT];
        self.last_cc7_nonzero = [127u8; Synthesizer::CHANNEL_COUNT];
        self.last_cc11_nonzero = [127u8; Synthesizer::CHANNEL_COUNT];
        self.pending_cc7_restore = [None; Synthesizer::CHANNEL_COUNT];
        self.pending_cc11_restore = [None; Synthesizer::CHANNEL_COUNT];
        self.last_cc7_change_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.last_cc11_zero_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.last_pitch_bend_change_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.last_pitch_bend_change_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.cc7_seek_guard_until_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.cc7_seek_guard_min = [SEEK_MIN_CC7; Synthesizer::CHANNEL_COUNT];
        self.active_notes = [0u16; Synthesizer::CHANNEL_COUNT];
        self.last_pitch_bend = [PITCH_BEND_CENTER; Synthesizer::CHANNEL_COUNT];
        self.note_on_count = 0;
        self.vibrato_seed = 0x9E3779B9;
        self.pitch_range_initialized = [false; Synthesizer::CHANNEL_COUNT];
    }

    pub(crate) fn set_events(
        &mut self,
        events: Vec<ScheduledEvent>,
        tempo_map: Vec<TempoPoint>,
        midi_division: f64,
    ) {
        self.events = events;
        self.events.sort_by(|a, b| {
            let time_order = a
                .sample_time
                .partial_cmp(&b.sample_time)
                .unwrap_or(std::cmp::Ordering::Equal);
            if time_order != std::cmp::Ordering::Equal {
                return time_order;
            }
            event_priority(&a.payload).cmp(&event_priority(&b.payload))
        });
        self.next_event_index = 0;
        self.position_samples = 0.0;
        self.current_tick = 0;
        self.tempo_map = tempo_map;
        self.midi_division = if midi_division.is_finite() && midi_division > 0.0 {
            midi_division
        } else {
            480.0
        };
        self.loop_start_samples = None;
        self.loop_end_samples = None;
        self.loop_start_ms = None;
        self.loop_end_ms = None;
        self.cc7 = [127u8; Synthesizer::CHANNEL_COUNT];
        self.cc11 = [127u8; Synthesizer::CHANNEL_COUNT];
        self.bank_msb = [0u8; Synthesizer::CHANNEL_COUNT];
        self.bank_lsb = [0u8; Synthesizer::CHANNEL_COUNT];
        self.program = [0u8; Synthesizer::CHANNEL_COUNT];
        self.base_pitch_semitones = [0.0; Synthesizer::CHANNEL_COUNT];
        self.bend_range_semitones = [DEFAULT_BEND_RANGE_SEMITONES; Synthesizer::CHANNEL_COUNT];
        self.rpn_msb = [0x7F; Synthesizer::CHANNEL_COUNT];
        self.rpn_lsb = [0x7F; Synthesizer::CHANNEL_COUNT];
        self.data_entry_msb = [0u8; Synthesizer::CHANNEL_COUNT];
        self.data_entry_lsb = [0u8; Synthesizer::CHANNEL_COUNT];
        self.vibrato = [VibratoState::inactive(); Synthesizer::CHANNEL_COUNT];
        self.vibrato_notes = [[NoteVibrato::None; 128]; Synthesizer::CHANNEL_COUNT];
        self.last_cc7_nonzero = [127u8; Synthesizer::CHANNEL_COUNT];
        self.last_cc11_nonzero = [127u8; Synthesizer::CHANNEL_COUNT];
        self.pending_cc7_restore = [None; Synthesizer::CHANNEL_COUNT];
        self.pending_cc11_restore = [None; Synthesizer::CHANNEL_COUNT];
        self.last_cc7_change_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.last_cc11_zero_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.last_pitch_bend_change_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.cc7_seek_guard_until_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.cc7_seek_guard_min = [SEEK_MIN_CC7; Synthesizer::CHANNEL_COUNT];
        self.active_notes = [0u16; Synthesizer::CHANNEL_COUNT];
        self.last_pitch_bend = [PITCH_BEND_CENTER; Synthesizer::CHANNEL_COUNT];
        self.note_on_count = 0;
        self.vibrato_seed = 0x9E3779B9;
    }

    pub(crate) fn clamp_tuning(value: i8) -> i8 {
        value.clamp(TUNING_MIN_SEMITONES, TUNING_MAX_SEMITONES)
    }

    pub(crate) fn tuned_key(&self, key: u8, channel: u8) -> u8 {
        if self.is_drum_channel(channel) {
            return key;
        }
        let tuned = i16::from(key) + i16::from(self.tuning_semitones);
        tuned.clamp(0, 127) as u8
    }

    pub(crate) fn is_drum_channel(&self, channel: u8) -> bool {
        i32::from(channel) == METRONOME_CHANNEL_DRUM
    }

    pub(crate) fn set_tuning(&mut self, value: i8) {
        let clamped = Self::clamp_tuning(value);
        if self.tuning_semitones == clamped {
            return;
        }
        self.tuning_semitones = clamped;
        self.all_notes_off();
        self.active_notes = [0u16; Synthesizer::CHANNEL_COUNT];
        self.vibrato_notes = [[NoteVibrato::None; 128]; Synthesizer::CHANNEL_COUNT];
        self.base_pitch_semitones = [0.0; Synthesizer::CHANNEL_COUNT];
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            self.apply_pitch_bend(channel, PITCH_BEND_CENTER);
        }
    }

    pub(crate) fn set_track_state(&mut self, payload: TrackStatePayload) {
        let track_id = payload.track_id.clone();
        let state = TrackState {
            mute: payload.mute,
            solo: payload.solo,
            volume: payload.volume.clamp(0.0, MAX_TRACK_STATE_VOLUME),
        };
        if payload.listen {
            self.listen_track_id = Some(track_id.clone());
        } else if self.listen_track_id.as_ref() == Some(&track_id) {
            self.listen_track_id = None;
        }
        self.track_states.insert(track_id, state);
        if cfg!(debug_assertions) {
            dev_append_log_line(&format!(
                "audio_track_state track_id={} mute={} solo={} volume={:.3} listen={}",
                payload.track_id, payload.mute, payload.solo, payload.volume, payload.listen
            ));
        }
    }

    pub(crate) fn set_tempo_factor(&mut self, factor: f64) {
        if factor.is_finite() && factor > 0.05 {
            self.tempo_factor = factor;
            if self.metronome_state.running {
                let pos = self.metronome_state.position_samples;
                self.metronome_state
                    .resync_to_position(pos, self.sample_rate);
            }
        }
    }

    pub(crate) fn effective_volume(&self, track_id: &str) -> f32 {
        let any_solo = self.track_states.values().any(|state| state.solo);
        let state = self.track_states.get(track_id);
        let base = state.map_or(1.0, |state| state.volume.clamp(0.0, MAX_TRACK_STATE_VOLUME));
        let muted = state.is_some_and(|state| state.mute);
        let solo = state.is_some_and(|state| state.solo);
        if any_solo && !solo {
            return 0.0;
        }
        if muted {
            return 0.0;
        }
        if let Some(listen_id) = &self.listen_track_id {
            if listen_id != track_id {
                return base * LISTEN_DUCKING * TAB_OUTPUT_GAIN;
            }
        }
        base * TAB_OUTPUT_GAIN
    }

    pub(crate) fn set_tab_volume_percent(&mut self, percent: u8) {
        let clamped = percent.min(100) as f32 / 100.0;
        self.tab_volume_gain =
            (clamped * CHANNEL_GAIN_MAX_BOOST).clamp(0.0, CHANNEL_GAIN_MAX_BOOST);
    }

    // ── Song playback ────────────────────────────────────────────────────────

    pub(crate) fn song_load(&mut self, stream: Arc<Mutex<SongStreamHandle>>) {
        self.song_stream = Some(stream);
        self.song_position = 0.0;
        self.song_playing = false;
        self.song_fade_gain = 0.0;
        self.song_fade_step = 0.0;
        self.song_loop_start = None;
        self.song_loop_end = None;
        if let Some(ref mut s) = self.song_stretcher {
            s.reset();
        }
    }

    pub(crate) fn song_unload(&mut self) {
        // Immediately silence before removing the stream to prevent pops
        self.song_fade_gain = 0.0;
        self.song_fade_step = 0.0;
        self.song_playing = false;
        self.song_stream = None;
        self.song_position = 0.0;
        self.song_loop_start = None;
        self.song_loop_end = None;
    }

    fn song_fade_samples(&self) -> f64 {
        (AUDIO_FADE_DURATION_SECS * self.sample_rate).max(1.0)
    }

    pub(crate) fn song_play(&mut self) {
        self.song_play_delayed(0.0);
    }

    pub(crate) fn song_play_delayed(&mut self, delay_ms: f64) {
        // Re-prime stretcher on every play/resume so the pipeline is
        // correctly filled for the current position.
        self.reprime_song_stretcher();
        self.song_playing = true;
        let delay_samples = if delay_ms > 0.0 {
            (delay_ms / 1000.0) * self.sample_rate
        } else {
            0.0
        };
        self.song_start_delay_samples = delay_samples;
        if delay_samples <= 0.0 {
            // Start immediately with fade-in
            let fade_samples = self.song_fade_samples();
            self.song_fade_step = ((1.0 - self.song_fade_gain) as f64 / fade_samples) as f32;
            if self.song_fade_step < 1.0e-9 {
                self.song_fade_gain = 1.0;
                self.song_fade_step = 0.0;
            }
        }
        // else: render_song will count down delay, then start fade-in
    }

    pub(crate) fn song_pause(&mut self) {
        if !self.song_playing {
            return;
        }
        if self.song_fade_gain <= 0.0 {
            self.song_playing = false;
            self.song_fade_step = 0.0;
            return;
        }
        let fade_samples = self.song_fade_samples();
        self.song_fade_step = -(self.song_fade_gain as f64 / fade_samples) as f32;
    }

    pub(crate) fn song_stop(&mut self) {
        if !self.song_playing {
            self.song_position = 0.0;
            return;
        }
        if self.song_fade_gain <= 0.0 {
            self.song_playing = false;
            self.song_fade_step = 0.0;
            self.song_position = 0.0;
            return;
        }
        let fade_samples = self.song_fade_samples();
        self.song_fade_step = -(self.song_fade_gain as f64 / fade_samples) as f32;
    }

    pub(crate) fn song_seek_ms(&mut self, ms: f64) {
        // If a fade-out is in progress (pause/stop was called), complete it
        // immediately before changing position to prevent a content pop.
        if self.song_fade_step < 0.0 {
            self.song_fade_gain = 0.0;
            self.song_fade_step = 0.0;
            self.song_playing = false;
        }
        let sample_pos = (ms.max(0.0) / 1000.0) * self.sample_rate;
        self.song_position = sample_pos;
        if let Some(ref stream_arc) = self.song_stream {
            if let Ok(mut stream) = stream_arc.lock() {
                stream.seek_to_sample(sample_pos as usize);
            }
        }
        // Reset and re-prime stretcher to avoid artifacts and latency
        self.reprime_song_stretcher();
        // Drop stretcher if no longer needed (clean transition to direct path)
        if (self.song_speed - 1.0).abs() < 0.001 && self.song_tuning_semitones.abs() < 0.001 {
            self.song_stretcher = None;
            self.song_stretcher_active = false;
        }
    }

    pub(crate) fn song_set_volume(&mut self, vol: f32) {
        self.song_volume = vol.clamp(0.0, 1.0);
    }

    pub(crate) fn song_set_speed(&mut self, speed: f64) {
        if speed.is_finite() && speed > 0.05 {
            let changed = (self.song_speed - speed).abs() > 0.001;
            self.song_speed = speed;
            // Reset and re-prime stretcher on speed change
            if changed {
                self.reprime_song_stretcher();
            }
        }
    }

    pub(crate) fn song_set_tuning(&mut self, semitones: i8) {
        let value = semitones.clamp(TUNING_MIN_SEMITONES, TUNING_MAX_SEMITONES) as f32;
        self.song_tuning_semitones = value;
        if self.song_stretcher.is_some() {
            // Existing stretcher: apply transpose smoothly — signalsmith handles
            // real-time transitions without reset, so no reprime needed.
            if let Some(ref mut stretcher) = self.song_stretcher {
                stretcher.set_transpose_factor_semitones(value, None);
            }
        } else if value.abs() > 0.001 && self.song_playing {
            // No stretcher yet but tuning activated during playback: create one
            // and reprime with real audio so the first output block isn't silence.
            self.reprime_song_stretcher();
        }

        // When both tuning and speed are neutral and playback is stopped,
        // drop the stretcher so the next play starts on the direct path.
        let neutral = value.abs() < 0.001 && (self.song_speed - 1.0).abs() < 0.001;
        if neutral && !self.song_playing {
            self.song_stretcher = None;
            self.song_stretcher_active = false;
        }
    }

    pub(crate) fn song_set_loop_ms(&mut self, start_ms: f64, end_ms: f64) {
        if !start_ms.is_finite() || !end_ms.is_finite() {
            return;
        }
        let start_samples = (start_ms.max(0.0) / 1000.0) * self.sample_rate;
        let end_samples = (end_ms.max(0.0) / 1000.0) * self.sample_rate;
        let (start, end) = if end_samples <= start_samples {
            (start_samples, start_samples + 1.0)
        } else {
            (start_samples, end_samples)
        };
        self.song_loop_start = Some(start);
        self.song_loop_end = Some(end);
        // If currently outside the loop region, seek to loop start
        if self.song_position >= end || self.song_position < start {
            self.song_position = start;
            if let Some(ref stream_arc) = self.song_stream {
                if let Ok(mut stream) = stream_arc.lock() {
                    stream.seek_to_sample(start as usize);
                }
            }
            self.reprime_song_stretcher();
        }
    }

    pub(crate) fn song_clear_loop(&mut self) {
        self.song_loop_start = None;
        self.song_loop_end = None;
    }

    /// Compute per-sample crossfade gain for seamless loop wraps.
    /// Returns 1.0 when no loop is active or position is in the middle.
    /// Fades out over the last N samples before loop_end, fades in over
    /// the first N samples after loop_start (post-wrap).
    fn song_loop_xfade_gain(&mut self) -> f32 {
        // Post-wrap fade-in (triggered by the wrap itself)
        if self.song_loop_xfade_remaining > 0 {
            let progress = 1.0
                - (self.song_loop_xfade_remaining as f32
                    / self.song_loop_xfade_total.max(1) as f32);
            self.song_loop_xfade_remaining -= 1;
            return progress;
        }
        // Pre-wrap fade-out: approaching loop_end
        if let Some(end) = self.song_loop_end {
            let xfade = SONG_LOOP_XFADE_SAMPLES as f64;
            let dist_to_end = end - self.song_position;
            if dist_to_end >= 0.0 && dist_to_end < xfade {
                return (dist_to_end / xfade) as f32;
            }
        }
        1.0
    }

    pub(crate) fn song_stretcher_latency_ms(&mut self) -> f64 {
        self.ensure_song_stretcher();
        match &self.song_stretcher {
            Some(s) => {
                let latency_samples = s.output_latency() as f64;
                if self.sample_rate > 0.0 {
                    (latency_samples / self.sample_rate) * 1000.0
                } else {
                    0.0
                }
            }
            None => 0.0,
        }
    }

    fn reprime_song_stretcher(&mut self) {
        self.ensure_song_stretcher();
        let stretcher = match self.song_stretcher.as_mut() {
            Some(s) => s,
            None => return,
        };
        stretcher.reset();
        // Reapply tuning after reset since reset() clears transpose state.
        if self.song_tuning_semitones.abs() > 0.001 {
            stretcher.set_transpose_factor_semitones(self.song_tuning_semitones, None);
        }
        let latency = stretcher.output_latency();
        if latency == 0 {
            return;
        }
        // Feed actual audio from the current position as pre-roll so the
        // stretcher pipeline contains real content, not silence.
        let stream_arc = match self.song_stream.as_ref() {
            Some(s) => s,
            None => {
                let silent_in = vec![0.0f32; latency * 2];
                let mut discard = vec![0.0f32; latency * 2];
                stretcher.process(&silent_in, &mut discard);
                return;
            }
        };
        if let Ok(mut stream) = stream_arc.try_lock() {
            let total = stream.total_samples();
            let pos = self.song_position as usize;
            // Feed L*speed source frames (matching the render read-ahead)
            // and discard L output frames to prime the pipeline.
            let input_count = ((latency as f64) * self.song_speed).ceil() as usize;
            let input_count = input_count.max(latency); // at least L frames
            stream.ensure_buffered(pos, input_count + 1);
            let mut preroll = vec![0.0f32; input_count * 2];
            for i in 0..input_count {
                let idx = (pos + i).min(total.saturating_sub(1));
                if let Some(frame) = stream.get_frame(idx) {
                    preroll[i * 2] = frame[0];
                    preroll[i * 2 + 1] = frame[1];
                }
            }
            let mut discard = vec![0.0f32; latency * 2];
            stretcher.process(&preroll, &mut discard);
        } else {
            let silent_in = vec![0.0f32; latency * 2];
            let mut discard = vec![0.0f32; latency * 2];
            stretcher.process(&silent_in, &mut discard);
        }
    }

    fn ensure_song_stretcher(&mut self) {
        let rate = self.sample_rate;
        if self.song_stretcher.is_none() || (self.song_stretcher_rate - rate).abs() > 0.1 {
            let mut s = Stretch::preset_default(2, rate as u32);
            // Prime the stretcher pipeline with silence so the first real audio
            // comes out without latency offset.
            let latency = s.output_latency();
            if latency > 0 {
                let silent_in = vec![0.0f32; latency * 2];
                let mut discard = vec![0.0f32; latency * 2];
                s.process(&silent_in, &mut discard);
            }
            if self.song_tuning_semitones.abs() > 0.001 {
                s.set_transpose_factor_semitones(self.song_tuning_semitones, None);
            }
            self.song_stretcher = Some(s);
            self.song_stretcher_rate = rate;
        }
    }

    pub(crate) fn song_get_position_ms(&self) -> f64 {
        if self.sample_rate > 0.0 {
            (self.song_position / self.sample_rate) * 1000.0
        } else {
            0.0
        }
    }

    pub(crate) fn render_song(&mut self, frames: usize, left: &mut [f32], right: &mut [f32]) {
        let stream_arc = match &self.song_stream {
            Some(s) => Arc::clone(s),
            None => return,
        };
        let is_fading_out = self.song_fade_step < 0.0 && self.song_fade_gain > 0.0;
        if !self.song_playing && !is_fading_out {
            return;
        }
        // Count-in delay: count down samples before starting actual playback
        if self.song_start_delay_samples > 0.0 {
            self.song_start_delay_samples -= frames as f64;
            if self.song_start_delay_samples > 0.0 {
                return; // Still waiting
            }
            // Delay complete — start fade-in
            let fade_samples = self.song_fade_samples();
            self.song_fade_step = ((1.0 - self.song_fade_gain) as f64 / fade_samples) as f32;
            if self.song_fade_step < 1.0e-9 {
                self.song_fade_gain = 1.0;
                self.song_fade_step = 0.0;
            }
        }

        let mut stream = match stream_arc.try_lock() {
            Ok(s) => s,
            Err(_) => return,
        };

        let total = stream.total_samples();
        if total == 0 {
            return;
        }

        let needs_stretcher =
            (self.song_speed - 1.0).abs() > 0.001 || self.song_tuning_semitones.abs() > 0.001;
        // Keep stretcher active if it was already rendering — switching from
        // stretched→direct mid-playback pops because the stretcher's internal
        // latency means song_position is ahead of the actual audio output.
        // With speed=1.0 and transpose=0 the stretcher is passthrough.
        // The flag is cleared on seek/stop so next play starts on the correct path.
        let use_stretcher = needs_stretcher || self.song_stretcher_active;

        if use_stretcher {
            self.song_stretcher_active = true;
            self.render_song_stretched(frames, left, right, &mut stream, total);
        } else {
            self.render_song_direct(frames, left, right, &mut stream, total);
        }
    }

    /// Fast path: no time-stretch, per-sample interpolation at 1:1 speed.
    fn render_song_direct(
        &mut self,
        frames: usize,
        left: &mut [f32],
        right: &mut [f32],
        stream: &mut SongStreamHandle,
        total: usize,
    ) {
        // When a loop is active, buffer the entire loop region so that
        // wrapping from loop_end → loop_start never needs a file seek.
        if let (Some(ls), Some(le)) = (self.song_loop_start, self.song_loop_end) {
            let ls_sample = ls as usize;
            let range = (le as usize).saturating_sub(ls_sample) + frames + 2;
            stream.ensure_buffered(ls_sample, range);
        } else {
            let start_sample = self.song_position as usize;
            stream.ensure_buffered(start_sample, frames + 1);
        }

        for frame in 0..frames {
            if self.song_fade_step != 0.0 {
                self.song_fade_gain = (self.song_fade_gain + self.song_fade_step).clamp(0.0, 1.0);
                if self.song_fade_gain <= 0.0 {
                    self.song_fade_step = 0.0;
                    self.song_playing = false;
                    break;
                }
                if self.song_fade_gain >= 1.0 {
                    self.song_fade_step = 0.0;
                }
            }

            let pos = self.song_position;
            let idx = pos as usize;
            if idx + 1 >= total {
                self.song_fade_gain = 0.0;
                self.song_fade_step = 0.0;
                self.song_playing = false;
                break;
            }

            let frac = (pos - idx as f64) as f32;
            if let (Some(s0), Some(s1)) = (stream.get_frame(idx), stream.get_frame(idx + 1)) {
                let l = s0[0] + (s1[0] - s0[0]) * frac;
                let r = s0[1] + (s1[1] - s0[1]) * frac;
                // Loop crossfade: fade-out approaching loop_end,
                // fade-in after wrapping to loop_start
                let xfade_gain = self.song_loop_xfade_gain();
                let gain = self.song_volume * SONG_OUTPUT_GAIN * self.song_fade_gain * xfade_gain;
                left[frame] += l * gain;
                right[frame] += r * gain;
            }

            self.song_position += 1.0;

            if let (Some(start), Some(end)) = (self.song_loop_start, self.song_loop_end) {
                if self.song_position >= end {
                    self.song_position = start;
                    // No seek needed — ensure_buffered at top covers full loop range
                    self.song_loop_xfade_remaining = SONG_LOOP_XFADE_SAMPLES;
                    self.song_loop_xfade_total = SONG_LOOP_XFADE_SAMPLES;
                }
            }

            if self.song_position as usize >= total {
                self.song_fade_gain = 0.0;
                self.song_fade_step = 0.0;
                self.song_playing = false;
                break;
            }
        }
    }

    /// Pitch-preserving path: read source frames at song_speed rate, time-stretch
    /// to output frame count via signalsmith-stretch.
    fn render_song_stretched(
        &mut self,
        frames: usize,
        left: &mut [f32],
        right: &mut [f32],
        stream: &mut SongStreamHandle,
        total: usize,
    ) {
        self.ensure_song_stretcher();
        let stretcher = match self.song_stretcher.as_mut() {
            Some(s) => s,
            None => return,
        };

        // How many source frames we need to read to produce `frames` output
        let input_frames = ((frames as f64) * self.song_speed).ceil() as usize;
        if input_frames == 0 {
            return;
        }

        // Read-ahead: feed the stretcher from song_position ahead so that
        // after the pipeline delay, the output corresponds to song_position.
        // L*speed converts output-frame latency to source frames. The
        // additive 0.15*L term compensates for windowing/overlap-add delay
        // that is constant in source frames (does not scale with speed).
        let latency_out = stretcher.output_latency() as f64;
        let read_ahead = (latency_out * self.song_speed + latency_out * 0.15).ceil() as usize;
        let read_pos_start = self.song_position + read_ahead as f64;

        // When a loop is active, buffer the entire loop region so that
        // wrapping from loop_end → loop_start never needs a file seek.
        if let (Some(ls), Some(le)) = (self.song_loop_start, self.song_loop_end) {
            let ls_sample = ls as usize;
            let range = (le as usize).saturating_sub(ls_sample) + read_ahead + input_frames + 2;
            stream.ensure_buffered(ls_sample, range);
        } else {
            let start_sample = read_pos_start as usize;
            stream.ensure_buffered(start_sample, input_frames + 1);
        }

        // Build interleaved input buffer [L0, R0, L1, R1, ...]
        let mut input_buf = vec![0.0f32; input_frames * 2];
        let mut actual_input_frames = 0usize;
        let mut read_pos = read_pos_start;
        for i in 0..input_frames {
            let idx = (read_pos as usize).min(total.saturating_sub(1));
            if idx + 1 >= total {
                break;
            }
            if let (Some(s0), Some(s1)) = (stream.get_frame(idx), stream.get_frame(idx + 1)) {
                let frac = (read_pos - idx as f64) as f32;
                input_buf[i * 2] = s0[0] + (s1[0] - s0[0]) * frac;
                input_buf[i * 2 + 1] = s0[1] + (s1[1] - s0[1]) * frac;
                actual_input_frames += 1;
            }
            read_pos += 1.0;
            self.song_position += 1.0; // Advance logical position at source rate

            // Loop handling — don't reset the stretcher here; its overlap-add
            // windowing naturally smooths the content discontinuity at the
            // loop boundary, producing a click-free transition.
            if let (Some(start), Some(end)) = (self.song_loop_start, self.song_loop_end) {
                if self.song_position >= end {
                    let offset = self.song_position - end;
                    self.song_position = start + offset;
                    read_pos = self.song_position + read_ahead as f64;
                    // No seek needed — ensure_buffered at top covers full loop range
                }
            }
        }

        if actual_input_frames == 0 {
            self.song_fade_gain = 0.0;
            self.song_fade_step = 0.0;
            self.song_playing = false;
            return;
        }

        // Time-stretch: input_frames source → frames output (pitch preserved)
        let input_slice = &input_buf[..actual_input_frames * 2];
        let mut output_buf = vec![0.0f32; frames * 2];
        stretcher.process(input_slice, &mut output_buf);

        // Apply fade envelope + volume and mix into output
        let vol_gain = self.song_volume * SONG_OUTPUT_GAIN;
        for frame in 0..frames {
            if self.song_fade_step != 0.0 {
                self.song_fade_gain = (self.song_fade_gain + self.song_fade_step).clamp(0.0, 1.0);
                if self.song_fade_gain <= 0.0 {
                    self.song_fade_step = 0.0;
                    self.song_playing = false;
                    break;
                }
                if self.song_fade_gain >= 1.0 {
                    self.song_fade_step = 0.0;
                }
            }
            let gain = vol_gain * self.song_fade_gain;
            left[frame] += output_buf[frame * 2] * gain;
            right[frame] += output_buf[frame * 2 + 1] * gain;
        }

        // Check end of stream — the read-ahead position reaches the end
        // before the logical position does, so check the actual read cursor.
        if (self.song_position as usize + read_ahead) >= total {
            self.song_fade_gain = 0.0;
            self.song_fade_step = 0.0;
            self.song_playing = false;
        }
    }
}
