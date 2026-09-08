use std::collections::HashMap;

use rustysynth::Synthesizer;

use crate::dev_log::dev_append_log_line;

use super::synthesis::EngineRuntime;
use super::types::{
    ActiveNoteSnapshot, AudioEventKind, AudioEventPayload, NoteVibrato, SeekNoteLogState,
    VibratoState, DEFAULT_BEND_RANGE_SEMITONES, PITCH_BEND_CENTER, SEEK_GUARD_MIN_CC7,
    SEEK_MIN_CC7,
};

impl EngineRuntime {
    pub(crate) fn tick_to_ms(&self, tick: i64) -> f64 {
        let tick = tick.max(0);
        if self.tempo_map.is_empty() {
            return (tick as f64 * 500000.0) / self.midi_division / 1000.0;
        }
        let mut point = &self.tempo_map[0];
        for candidate in &self.tempo_map {
            if candidate.tick <= tick {
                point = candidate;
            } else {
                break;
            }
        }
        let delta_ticks = (tick - point.tick) as f64;
        let delta_ms = (delta_ticks * point.us_per_quarter) / self.midi_division / 1000.0;
        point.time_ms + delta_ms
    }

    pub(crate) fn tempo_us_per_quarter_at_ms(&self, time_ms: f64) -> f64 {
        if self.tempo_map.is_empty() {
            return 500_000.0;
        }
        let mut point = &self.tempo_map[0];
        for candidate in &self.tempo_map {
            if candidate.time_ms <= time_ms {
                point = candidate;
            } else {
                break;
            }
        }
        point.us_per_quarter
    }

    pub(crate) fn cc7_guard_window_ms(&self, time_ms: f64) -> f64 {
        let quarter_ms = self.tempo_us_per_quarter_at_ms(time_ms) / 1000.0;
        let candidate = quarter_ms * 1.5;
        candidate.clamp(750.0, 2000.0)
    }

    pub(crate) fn ms_to_tick(&self, time_ms: f64) -> i64 {
        let clamped = time_ms.max(0.0);
        if self.tempo_map.is_empty() {
            return ((clamped * self.midi_division * 1000.0) / 500000.0).round() as i64;
        }
        let mut point = &self.tempo_map[0];
        for candidate in &self.tempo_map {
            if candidate.time_ms <= clamped {
                point = candidate;
            } else {
                break;
            }
        }
        let delta_ms = clamped - point.time_ms;
        let delta_ticks = (delta_ms * 1000.0 * self.midi_division) / point.us_per_quarter;
        (point.tick as f64 + delta_ticks).round().max(0.0) as i64
    }

    fn dev_log_seek_state(&self, position_ms: f64, active_notes: &[ActiveNoteSnapshot]) {
        if !cfg!(debug_assertions) {
            return;
        }
        let mut notes_by_track: HashMap<String, usize> = HashMap::new();
        let mut muted_notes = 0usize;
        for note in active_notes {
            *notes_by_track.entry(note.track_id.clone()).or_insert(0) += 1;
            if self.effective_volume(&note.track_id) <= 0.0 {
                muted_notes += 1;
            }
        }
        let any_solo = self.track_states.values().any(|state| state.solo);
        let listen = self.listen_track_id.clone().unwrap_or_default();
        let mut states: Vec<String> = Vec::new();
        for (track_id, state) in &self.track_states {
            states.push(format!(
                "{}:mute={} solo={} vol={:.3}",
                track_id, state.mute, state.solo, state.volume
            ));
        }
        states.sort();
        dev_append_log_line(&format!(
            "audio_seek_debug position_ms={position_ms:.3} active_notes={} muted_notes={} tracks_with_notes={:?} track_states={} any_solo={} listen={} states=[{}]",
            active_notes.len(),
            muted_notes,
            notes_by_track,
            self.track_states.len(),
            any_solo,
            listen,
            states.join(", ")
        ));
    }

    pub(crate) fn seek_to_ms(&mut self, position_ms: f64) {
        let position_samples = (position_ms.max(0.0) / 1000.0) * self.sample_rate;
        self.position_samples = position_samples;
        self.next_event_index = self
            .events
            .iter()
            .position(|event| event.sample_time >= self.position_samples)
            .unwrap_or(self.events.len());
        self.current_tick = self.ms_to_tick(position_ms);
        self.kill_all_voices();
        self.reset_synth_state();
        let active_notes = self.apply_controller_state_at_position();
        self.dev_log_seek_state(position_ms, &active_notes);
        self.seek_common(position_ms, active_notes);
        if self.metronome_state.running {
            self.metronome_state
                .resync_to_position(position_samples, self.sample_rate);
        }
    }

    pub(crate) fn seek_to_samples(&mut self, position_samples: f64) {
        self.position_samples = position_samples.max(0.0);
        self.next_event_index = self
            .events
            .iter()
            .position(|event| event.sample_time >= self.position_samples)
            .unwrap_or(self.events.len());
        let position_ms = (self.position_samples / self.sample_rate) * 1000.0;
        self.current_tick = self.ms_to_tick(position_ms);
        self.kill_all_voices();
        self.reset_synth_state();
        let active_notes = self.apply_controller_state_at_position();
        self.dev_log_seek_state(position_ms, &active_notes);
        self.seek_common(position_ms, active_notes);
        if self.metronome_state.running {
            self.metronome_state
                .resync_to_position(self.position_samples, self.sample_rate);
        }
    }

    fn seek_common(&mut self, position_ms: f64, active_notes: Vec<ActiveNoteSnapshot>) {
        let mut guard_channels = [false; Synthesizer::CHANNEL_COUNT];
        let mut bend_restart_channels = [false; Synthesizer::CHANNEL_COUNT];
        for note in &active_notes {
            let channel_index = note.channel as usize;
            if channel_index < Synthesizer::CHANNEL_COUNT {
                guard_channels[channel_index] = true;
            }
        }
        let guard_window_ms = self.cc7_guard_window_ms(position_ms);
        let bend_lookahead_ms = guard_window_ms.clamp(500.0, 2000.0);
        let guard_window_samples =
            self.position_samples + (guard_window_ms / 1000.0) * self.sample_rate;
        let bend_window_samples =
            self.position_samples + (bend_lookahead_ms / 1000.0) * self.sample_rate;
        let mut note_on_before_bend = [false; Synthesizer::CHANNEL_COUNT];
        for event in self.events.iter().skip(self.next_event_index) {
            if event.sample_time > guard_window_samples {
                break;
            }
            if let AudioEventKind::NoteOn { velocity, .. } = event.payload.kind {
                if velocity == 0 {
                    continue;
                }
                let channel_index = event.payload.channel as usize;
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    guard_channels[channel_index] = true;
                    note_on_before_bend[channel_index] = true;
                }
            }
        }
        for event in self.events.iter().skip(self.next_event_index) {
            if event.sample_time > bend_window_samples {
                break;
            }
            let channel_index = event.payload.channel as usize;
            if channel_index >= Synthesizer::CHANNEL_COUNT {
                continue;
            }
            match event.payload.kind {
                AudioEventKind::NoteOn { velocity, .. } => {
                    if velocity > 0 {
                        note_on_before_bend[channel_index] = true;
                    }
                }
                AudioEventKind::PitchBend { .. } => {
                    if !note_on_before_bend[channel_index] {
                        bend_restart_channels[channel_index] = true;
                    }
                }
                _ => {}
            }
        }
        if cfg!(debug_assertions) {
            self.debug_seek_note_log = Some(SeekNoteLogState {
                until_ms: position_ms + 500.0,
                remaining: 32,
                remaining_bend: 32,
            });
        }
        self.restore_pending_controllers_after_seek();
        self.normalize_cc7_after_seek();
        self.arm_cc7_seek_guard(position_ms, &guard_channels);
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            if self.last_pitch_bend[channel] != PITCH_BEND_CENTER {
                self.last_pitch_bend_change_at_ms[channel] = position_ms;
            } else {
                self.last_pitch_bend_change_at_ms[channel] = f64::NAN;
            }
        }
        self.restart_active_notes_after_seek(position_ms, active_notes, bend_restart_channels);
    }

    pub(crate) fn seek_to_tick(&mut self, tick: i64) {
        let clamped = tick.max(0);
        let position_ms = self.tick_to_ms(clamped);
        let was_playing = self.playing;
        self.playing = false;
        self.seek_to_ms(position_ms);
        self.current_tick = clamped;
        self.playing = was_playing;
    }

    pub(crate) fn seek_and_play(&mut self, tick: i64) {
        self.seek_to_tick(tick);
        self.playing = true;
    }

    pub(crate) fn set_loop_range_ms(&mut self, start_ms: f64, end_ms: f64) {
        if !start_ms.is_finite() || !end_ms.is_finite() {
            return;
        }
        self.loop_start_ms = Some(start_ms.max(0.0));
        self.loop_end_ms = Some(end_ms.max(0.0));
        let start_samples = (start_ms.max(0.0) / 1000.0) * self.sample_rate;
        let end_samples = (end_ms.max(0.0) / 1000.0) * self.sample_rate;
        let (start, end) = if end_samples <= start_samples {
            (start_samples, start_samples + 1.0)
        } else {
            (start_samples, end_samples)
        };
        self.loop_start_samples = Some(start);
        self.loop_end_samples = Some(end);
        if self.position_samples >= end || self.position_samples < start {
            self.seek_to_samples(start);
        }
    }

    pub(crate) fn clear_loop_range(&mut self) {
        self.loop_start_samples = None;
        self.loop_end_samples = None;
        self.loop_start_ms = None;
        self.loop_end_ms = None;
    }

    pub(crate) fn refresh_loop_samples(&mut self) {
        let (Some(start_ms), Some(end_ms)) = (self.loop_start_ms, self.loop_end_ms) else {
            return;
        };
        let start_samples = (start_ms.max(0.0) / 1000.0) * self.sample_rate;
        let end_samples = (end_ms.max(0.0) / 1000.0) * self.sample_rate;
        let (start, end) = if end_samples <= start_samples {
            (start_samples, start_samples + 1.0)
        } else {
            (start_samples, end_samples)
        };
        self.loop_start_samples = Some(start);
        self.loop_end_samples = Some(end);
    }

    pub(crate) fn all_notes_off(&mut self) {
        if let Some(synth) = &mut self.synth {
            for channel in 0..Synthesizer::CHANNEL_COUNT {
                synth.process_midi_message(channel as i32, 0xB0, 0x7B, 0);
            }
        }
    }

    pub(crate) fn kill_all_voices(&mut self) {
        if let Some(synth) = &mut self.synth {
            for channel in 0..Synthesizer::CHANNEL_COUNT {
                synth.process_midi_message(channel as i32, 0xB0, 0x40, 0);
                synth.process_midi_message(channel as i32, 0xB0, 0x78, 0);
                synth.process_midi_message(channel as i32, 0xB0, 0x7B, 0);
            }
        }
    }

    pub(crate) fn reset_synth_state(&mut self) {
        let bend_ranges = self.bend_range_semitones;
        if let Some(synth) = &mut self.synth {
            for (channel, &bend_range) in bend_ranges
                .iter()
                .enumerate()
                .take(Synthesizer::CHANNEL_COUNT)
            {
                synth.process_midi_message(channel as i32, 0xB0, 0x79, 0);
                synth.process_midi_message(channel as i32, 0xB0, 0x00, 0);
                synth.process_midi_message(channel as i32, 0xB0, 0x20, 0);
                synth.process_midi_message(channel as i32, 0xC0, 0, 0);
                Self::send_pitch_bend_range(synth, channel, bend_range);
                self.pitch_range_initialized[channel] = true;
                synth.process_midi_message(channel as i32, 0xB0, 0x07, 127);
                synth.process_midi_message(channel as i32, 0xB0, 0x0B, 127);
                synth.process_midi_message(channel as i32, 0xE0, 0x00, 0x40);
            }
        }
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
        self.active_notes = [0u16; Synthesizer::CHANNEL_COUNT];
        self.last_pitch_bend = [PITCH_BEND_CENTER; Synthesizer::CHANNEL_COUNT];
        self.vibrato_seed = 0x9E3779B9;
        self.note_on_count = 0;
    }

    pub(crate) fn restore_pending_controllers(
        &mut self,
        channel_index: usize,
        channel: i32,
        current_at_ms: Option<f64>,
    ) {
        if channel_index >= Synthesizer::CHANNEL_COUNT {
            return;
        }
        if let Some(value) = self.pending_cc7_restore[channel_index].take() {
            self.cc7[channel_index] = value;
            self.last_cc7_nonzero[channel_index] = value;
            if let Some(synth) = &mut self.synth {
                synth.process_midi_message(channel, 0xB0, 0x07, value as i32);
            }
        }
        if let Some(value) = self.pending_cc11_restore[channel_index].take() {
            if let Some(at_ms) = current_at_ms {
                let zero_at_ms = self.last_cc11_zero_at_ms[channel_index];
                if zero_at_ms.is_finite() && (at_ms - zero_at_ms).abs() <= 1.5 {
                    self.pending_cc11_restore[channel_index] = None;
                    return;
                }
            }
            self.cc11[channel_index] = value;
            self.last_cc11_nonzero[channel_index] = value;
            self.last_cc11_zero_at_ms[channel_index] = f64::NAN;
            if let Some(synth) = &mut self.synth {
                synth.process_midi_message(channel, 0xB0, 0x0B, value as i32);
            }
        }
    }

    pub(crate) fn restore_pending_controllers_after_seek(&mut self) {
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            self.restore_pending_controllers(channel, channel as i32, None);
        }
    }

    pub(crate) fn normalize_cc7_after_seek(&mut self) {
        let mut updates: Vec<(usize, u8)> = Vec::new();
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            let current = self.cc7[channel];
            if current >= SEEK_MIN_CC7 {
                continue;
            }
            let baseline = self.last_cc7_nonzero[channel].max(SEEK_MIN_CC7);
            if baseline == current {
                continue;
            }
            self.cc7[channel] = baseline;
            updates.push((channel, baseline));
        }
        if let Some(synth) = &mut self.synth {
            for (channel, value) in &updates {
                synth.process_midi_message(*channel as i32, 0xB0, 0x07, *value as i32);
            }
        }
        if cfg!(debug_assertions) && !updates.is_empty() {
            dev_append_log_line(&format!("audio_seek_cc7_normalized channels={:?}", updates));
        }
    }

    pub(crate) fn arm_cc7_seek_guard(
        &mut self,
        position_ms: f64,
        channel_has_note: &[bool; Synthesizer::CHANNEL_COUNT],
    ) {
        let mut guarded: Vec<(usize, u8)> = Vec::new();
        for (channel, &has_note) in channel_has_note
            .iter()
            .enumerate()
            .take(Synthesizer::CHANNEL_COUNT)
        {
            if has_note {
                let baseline = self.last_cc7_nonzero[channel].max(SEEK_GUARD_MIN_CC7);
                if self.cc7[channel] < baseline {
                    self.cc7[channel] = baseline;
                }
                if self.last_cc7_nonzero[channel] < baseline {
                    self.last_cc7_nonzero[channel] = baseline;
                }
                self.pending_cc7_restore[channel] = None;
                self.cc7_seek_guard_min[channel] = baseline;
                self.cc7_seek_guard_until_ms[channel] = position_ms + 750.0;
                guarded.push((channel, baseline));
            } else {
                self.cc7_seek_guard_until_ms[channel] = f64::NAN;
                self.cc7_seek_guard_min[channel] = SEEK_MIN_CC7;
            }
        }
        if let Some(synth) = &mut self.synth {
            for (channel, baseline) in &guarded {
                synth.process_midi_message(*channel as i32, 0xB0, 0x07, *baseline as i32);
            }
        }
        if cfg!(debug_assertions) && !guarded.is_empty() {
            dev_append_log_line(&format!(
                "audio_seek_cc7_guard start_ms={position_ms:.3} guard={guarded:?}"
            ));
        }
    }

    pub(crate) fn restart_active_notes_after_seek(
        &mut self,
        position_ms: f64,
        active_notes: Vec<ActiveNoteSnapshot>,
        bend_restart_channels: [bool; Synthesizer::CHANNEL_COUNT],
    ) {
        const NOTE_RESTART_EPSILON_MS: f64 = 0.5;
        const NOTE_RESTART_MAX_AGE_MS: f64 = 120.0;
        if active_notes.is_empty() {
            return;
        }
        for note in active_notes {
            if !note.on_ms.is_finite() {
                continue;
            }
            if note.on_ms + NOTE_RESTART_EPSILON_MS >= position_ms {
                continue;
            }
            let channel_index = note.channel as usize;
            let allow_bend_restart = bend_restart_channels
                .get(channel_index)
                .copied()
                .unwrap_or(false);
            if !allow_bend_restart && position_ms - note.on_ms > NOTE_RESTART_MAX_AGE_MS {
                continue;
            }
            let payload = AudioEventPayload {
                at_ms: position_ms,
                track_id: note.track_id,
                channel: note.channel,
                kind: AudioEventKind::NoteOn {
                    key: note.key,
                    velocity: note.velocity,
                    vibrato: note.vibrato,
                },
            };
            self.process_event(&payload);
        }
    }
}
