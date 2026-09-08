use rustysynth::Synthesizer;

use super::synthesis::EngineRuntime;
use super::types::{
    ActiveNoteSnapshot, AudioEventKind, NoteVibrato, DEFAULT_BEND_RANGE_SEMITONES,
    MIN_BEND_RANGE_SEMITONES, PITCH_BEND_CENTER, PITCH_BEND_MAX,
};

impl EngineRuntime {
    pub(crate) fn apply_controller_state_at_position(&mut self) -> Vec<ActiveNoteSnapshot> {
        let mut cc7 = [127u8; Synthesizer::CHANNEL_COUNT];
        let mut cc11 = [127u8; Synthesizer::CHANNEL_COUNT];
        let mut bank_msb = [0u8; Synthesizer::CHANNEL_COUNT];
        let mut bank_lsb = [0u8; Synthesizer::CHANNEL_COUNT];
        let mut program = [0u8; Synthesizer::CHANNEL_COUNT];
        let mut bend_range = [DEFAULT_BEND_RANGE_SEMITONES; Synthesizer::CHANNEL_COUNT];
        let mut rpn_msb = [0x7Fu8; Synthesizer::CHANNEL_COUNT];
        let mut rpn_lsb = [0x7Fu8; Synthesizer::CHANNEL_COUNT];
        let mut data_entry_msb = [0u8; Synthesizer::CHANNEL_COUNT];
        let mut data_entry_lsb = [0u8; Synthesizer::CHANNEL_COUNT];
        let mut pitch_bend = [0.0f32; Synthesizer::CHANNEL_COUNT];
        let mut last_cc7_nonzero = [127u8; Synthesizer::CHANNEL_COUNT];
        let mut last_cc11_nonzero = [127u8; Synthesizer::CHANNEL_COUNT];
        let mut pending_cc7_restore = [None; Synthesizer::CHANNEL_COUNT];
        let mut pending_cc11_restore = [None; Synthesizer::CHANNEL_COUNT];
        let mut active_notes = [0u16; Synthesizer::CHANNEL_COUNT];
        let mut vibrato_notes = [[NoteVibrato::None; 128]; Synthesizer::CHANNEL_COUNT];
        let mut active_note_counts = [[0u16; 128]; Synthesizer::CHANNEL_COUNT];
        let mut last_note_on_ms = [[f64::NAN; 128]; Synthesizer::CHANNEL_COUNT];
        let mut last_note_on_velocity = [[0u8; 128]; Synthesizer::CHANNEL_COUNT];
        let mut last_note_on_vibrato = [[NoteVibrato::None; 128]; Synthesizer::CHANNEL_COUNT];
        let mut last_note_on_track = vec![vec![None; 128]; Synthesizer::CHANNEL_COUNT];
        for event in &self.events {
            if event.sample_time > self.position_samples {
                break;
            }
            let channel = event.payload.channel as usize;
            if channel >= Synthesizer::CHANNEL_COUNT {
                continue;
            }
            match event.payload.kind {
                AudioEventKind::NoteOn { key, vibrato, .. } => {
                    if active_notes[channel] == 0 {
                        if let Some(value) = pending_cc7_restore[channel].take() {
                            cc7[channel] = value;
                            last_cc7_nonzero[channel] = value;
                        }
                        if let Some(value) = pending_cc11_restore[channel].take() {
                            cc11[channel] = value;
                            last_cc11_nonzero[channel] = value;
                        }
                    }
                    active_notes[channel] = active_notes[channel].saturating_add(1);
                    if let Some(count) = active_note_counts
                        .get_mut(channel)
                        .and_then(|row| row.get_mut(key as usize))
                    {
                        *count = count.saturating_add(1);
                    }
                    if let Some(row) = last_note_on_ms.get_mut(channel) {
                        if let Some(slot) = row.get_mut(key as usize) {
                            *slot = event.payload.at_ms;
                        }
                    }
                    if let Some(row) = last_note_on_velocity.get_mut(channel) {
                        if let Some(slot) = row.get_mut(key as usize) {
                            *slot = match event.payload.kind {
                                AudioEventKind::NoteOn { velocity, .. } => velocity,
                                _ => 0,
                            };
                        }
                    }
                    if let Some(row) = last_note_on_vibrato.get_mut(channel) {
                        if let Some(slot) = row.get_mut(key as usize) {
                            *slot = vibrato;
                        }
                    }
                    if let Some(row) = last_note_on_track.get_mut(channel) {
                        if let Some(slot) = row.get_mut(key as usize) {
                            *slot = Some(event.payload.track_id.clone());
                        }
                    }
                    if let Some(note) = vibrato_notes[channel].get_mut(key as usize) {
                        *note = vibrato;
                    }
                }
                AudioEventKind::NoteOff { key, .. } => {
                    active_notes[channel] = active_notes[channel].saturating_sub(1);
                    if let Some(count) = active_note_counts
                        .get_mut(channel)
                        .and_then(|row| row.get_mut(key as usize))
                    {
                        *count = count.saturating_sub(1);
                    }
                    if let Some(note) = vibrato_notes[channel].get_mut(key as usize) {
                        *note = NoteVibrato::None;
                    }
                    if active_notes[channel] == 0 {
                        if let Some(value) = pending_cc7_restore[channel].take() {
                            cc7[channel] = value;
                            last_cc7_nonzero[channel] = value;
                        }
                        if let Some(value) = pending_cc11_restore[channel].take() {
                            cc11[channel] = value;
                            last_cc11_nonzero[channel] = value;
                        }
                    }
                }
                AudioEventKind::ControlChange { controller, value } => match controller {
                    0 => bank_msb[channel] = value,
                    32 => bank_lsb[channel] = value,
                    101 => rpn_msb[channel] = value,
                    100 => rpn_lsb[channel] = value,
                    6 => {
                        data_entry_msb[channel] = value;
                        if rpn_msb[channel] == 0 && rpn_lsb[channel] == 0 {
                            bend_range[channel] = (value as f32
                                + data_entry_lsb[channel] as f32 / 100.0)
                                .max(MIN_BEND_RANGE_SEMITONES);
                        }
                    }
                    38 => {
                        data_entry_lsb[channel] = value;
                        if rpn_msb[channel] == 0 && rpn_lsb[channel] == 0 {
                            bend_range[channel] = (data_entry_msb[channel] as f32
                                + value as f32 / 100.0)
                                .max(MIN_BEND_RANGE_SEMITONES);
                        }
                    }
                    7 => {
                        cc7[channel] = value;
                        if active_notes[channel] > 0 || value == 0 {
                            if last_cc7_nonzero[channel] > 0 {
                                pending_cc7_restore[channel] = Some(last_cc7_nonzero[channel]);
                            }
                        } else {
                            last_cc7_nonzero[channel] = value;
                            pending_cc7_restore[channel] = None;
                        }
                    }
                    11 => {
                        cc11[channel] = value;
                        if active_notes[channel] > 0 || value == 0 {
                            if last_cc11_nonzero[channel] > 0 {
                                pending_cc11_restore[channel] = Some(last_cc11_nonzero[channel]);
                            }
                        } else {
                            last_cc11_nonzero[channel] = value;
                            pending_cc11_restore[channel] = None;
                        }
                    }
                    _ => {}
                },
                AudioEventKind::PitchBend { value, .. } => {
                    let range = bend_range[channel];
                    pitch_bend[channel] = Self::normalize_bend_to_semitones_for_range(value, range);
                }
                AudioEventKind::ProgramChange { program: value } => {
                    program[channel] = value;
                }
                _ => {}
            }
        }
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            if active_notes[channel] == 0 {
                if let Some(value) = pending_cc7_restore[channel].take() {
                    cc7[channel] = value;
                    last_cc7_nonzero[channel] = value;
                }
                if let Some(value) = pending_cc11_restore[channel].take() {
                    cc11[channel] = value;
                    last_cc11_nonzero[channel] = value;
                }
            }
        }
        self.cc7 = cc7;
        self.cc11 = cc11;
        self.bank_msb = bank_msb;
        self.bank_lsb = bank_lsb;
        self.program = program;
        self.rpn_msb = rpn_msb;
        self.rpn_lsb = rpn_lsb;
        self.data_entry_msb = data_entry_msb;
        self.data_entry_lsb = data_entry_lsb;
        self.bend_range_semitones = bend_range;
        self.base_pitch_semitones = pitch_bend;
        self.last_cc7_nonzero = last_cc7_nonzero;
        self.last_cc11_nonzero = last_cc11_nonzero;
        self.pending_cc7_restore = pending_cc7_restore;
        self.pending_cc11_restore = pending_cc11_restore;
        self.last_cc7_change_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.last_cc11_zero_at_ms = [f64::NAN; Synthesizer::CHANNEL_COUNT];
        self.vibrato_notes = vibrato_notes;
        self.active_notes = [0u16; Synthesizer::CHANNEL_COUNT];
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            let range = bend_range[channel];
            let offset = Self::semitones_to_pb_offset(pitch_bend[channel], range);
            self.last_pitch_bend[channel] = (PITCH_BEND_CENTER + offset).clamp(0, PITCH_BEND_MAX);
        }
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            self.recompute_channel_vibrato(channel);
        }
        let bend_ranges = self.bend_range_semitones;
        if let Some(synth) = &mut self.synth {
            for channel in 0..Synthesizer::CHANNEL_COUNT {
                synth.process_midi_message(channel as i32, 0xB0, 0x00, bank_msb[channel] as i32);
                synth.process_midi_message(channel as i32, 0xB0, 0x20, bank_lsb[channel] as i32);
                synth.process_midi_message(channel as i32, 0xC0, program[channel] as i32, 0);
                Self::send_pitch_bend_range(synth, channel, bend_ranges[channel]);
                self.pitch_range_initialized[channel] = true;
                synth.process_midi_message(channel as i32, 0xB0, 0x07, cc7[channel] as i32);
                synth.process_midi_message(channel as i32, 0xB0, 0x0B, cc11[channel] as i32);
            }
        }
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            let bend_value = self.last_pitch_bend[channel];
            self.apply_pitch_bend(channel, bend_value);
        }
        self.apply_vibrato_for_block(0);
        let mut snapshots = Vec::new();
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            for key in 0..128 {
                let count = active_note_counts[channel][key];
                if count == 0 {
                    continue;
                }
                let Some(track_id) = last_note_on_track[channel][key].clone() else {
                    continue;
                };
                let velocity = last_note_on_velocity[channel][key].max(1);
                snapshots.push(ActiveNoteSnapshot {
                    track_id,
                    channel: channel as u8,
                    key: key as u8,
                    velocity,
                    on_ms: last_note_on_ms[channel][key],
                    vibrato: last_note_on_vibrato[channel][key],
                });
            }
        }
        snapshots
    }
}
