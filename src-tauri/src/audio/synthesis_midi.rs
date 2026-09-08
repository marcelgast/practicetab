use rustysynth::Synthesizer;

use crate::dev_log::dev_append_log_line;

use super::metronome::{sample_set_for_mode, tock_variant_for, MetronomeBlip, MetronomeTockHit};
use super::synthesis::EngineRuntime;
use super::types::{
    program_gain, tab_drum_output_gain, AlphaTabMetronomeTickPayload, AudioEventKind,
    AudioEventPayload, MetronomeBeatState, MetronomeBeatStatePayload, MetronomeSoundMode,
    MetronomeSoundModePayload, NoteVibrato, METRONOME_BLIP_FREQ_ACCENT, METRONOME_BLIP_FREQ_LOW,
    METRONOME_BLIP_FREQ_NORMAL, METRONOME_CLICK_MS, METRONOME_SUBDIVISION_PITCH_OFFSET_HZ,
    METRONOME_SUBDIVISION_VELOCITY_SCALE, PITCH_BEND_CENTER,
};

macro_rules! pitch_debug {
    ($endpoint:expr, $label:expr, $time:expr, $expected:expr, $actual:expr) => {
        let _ = ($endpoint, $label, $time, $expected, $actual);
    };
}

impl EngineRuntime {
    pub(crate) fn process_event(&mut self, payload: &AudioEventPayload) {
        let channel = payload.channel as i32;
        match &payload.kind {
            AudioEventKind::NoteOn {
                key,
                velocity,
                vibrato,
            } => {
                let channel_index = payload.channel as usize;
                let tuned_key = self.tuned_key(*key, payload.channel);
                self.restore_pending_controllers(channel_index, channel, Some(payload.at_ms));
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    let cc7 = self.cc7[channel_index];
                    let last = self.last_cc7_nonzero[channel_index];
                    if cc7 < last && last > 0 {
                        self.cc7[channel_index] = last;
                        if let Some(synth) = &mut self.synth {
                            synth.process_midi_message(channel, 0xB0, 0x07, last as i32);
                        }
                    }
                }
                if channel_index < Synthesizer::CHANNEL_COUNT
                    && self.active_notes[channel_index] > 0
                    && self.cc11[channel_index] == 0
                    && self.last_cc11_nonzero[channel_index] > 0
                {
                    let restored = self.last_cc11_nonzero[channel_index];
                    self.cc11[channel_index] = restored;
                    if let Some(synth) = &mut self.synth {
                        synth.process_midi_message(channel, 0xB0, 0x0B, restored as i32);
                    }
                }
                let volume = self.effective_volume(&payload.track_id);
                if cfg!(debug_assertions) {
                    if let Some(state) = &mut self.debug_seek_note_log {
                        if payload.at_ms <= state.until_ms && state.remaining > 0 {
                            let channel_index = payload.channel as usize;
                            let cc7 = self.cc7.get(channel_index).copied().unwrap_or(0);
                            let cc11 = self.cc11.get(channel_index).copied().unwrap_or(0);
                            let program = self.program.get(channel_index).copied().unwrap_or(0);
                            dev_append_log_line(&format!(
                                "audio_seek_note_on track_id={} ch={} key={} vel={} at_ms={:.3} effective_vol={:.3} cc7={} cc11={} program={}",
                                payload.track_id,
                                payload.channel,
                                key,
                                velocity,
                                payload.at_ms,
                                volume,
                                cc7,
                                cc11,
                                program
                            ));
                            state.remaining -= 1;
                            if state.remaining == 0 && state.remaining_bend == 0 {
                                self.debug_seek_note_log = None;
                            }
                        }
                    }
                }
                if volume <= 0.0 {
                    return;
                }
                if channel_index < Synthesizer::CHANNEL_COUNT
                    && !self.pitch_range_initialized[channel_index]
                {
                    let range = self.bend_range_for_channel(channel_index);
                    if let Some(synth) = &mut self.synth {
                        Self::send_pitch_bend_range(synth, channel_index, range);
                        self.pitch_range_initialized[channel_index] = true;
                    }
                }
                if channel_index < Synthesizer::CHANNEL_COUNT
                    && self.base_pitch_semitones[channel_index].abs() <= f32::EPSILON
                    && self.last_pitch_bend[channel_index] != PITCH_BEND_CENTER
                    && !self.vibrato[channel_index].active
                {
                    let last_change = self.last_pitch_bend_change_at_ms[channel_index];
                    if !last_change.is_finite() || payload.at_ms - last_change > 100.0 {
                        self.apply_pitch_bend(channel_index, PITCH_BEND_CENTER);
                    }
                }
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    self.active_notes[channel_index] =
                        self.active_notes[channel_index].saturating_add(1);
                    if let Some(slot) = self.vibrato_notes.get_mut(channel_index) {
                        if let Some(entry) = slot.get_mut(tuned_key as usize) {
                            *entry = *vibrato;
                        }
                    }
                    if *vibrato != NoteVibrato::None {
                        self.recompute_channel_vibrato(channel_index);
                    }
                }
                self.note_on_count = self.note_on_count.saturating_add(1);
                let expr = self.cc11.get(channel_index).copied().unwrap_or(127).max(1);
                let cc7 = self.cc7.get(channel_index).copied().unwrap_or(127);
                let expr_gain = f32::from(expr) / 127.0;
                let cc7_gain = f32::from(cc7) / 127.0;
                let program = self.program.get(channel_index).copied().unwrap_or(0);
                let program_gain = program_gain(program);
                let drum_gain = tab_drum_output_gain(payload.channel);
                let scaled = (f32::from(*velocity)
                    * volume
                    * expr_gain
                    * cc7_gain
                    * program_gain
                    * drum_gain)
                    .round()
                    .clamp(1.0, 127.0) as i32;
                let Some(synth) = &mut self.synth else {
                    return;
                };
                synth.process_midi_message(channel, 0x90, i32::from(tuned_key), scaled);
            }
            AudioEventKind::NoteOff { key, velocity } => {
                let channel_index = payload.channel as usize;
                let tuned_key = self.tuned_key(*key, payload.channel);
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    self.active_notes[channel_index] =
                        self.active_notes[channel_index].saturating_sub(1);
                    let mut had_vibrato = false;
                    if let Some(slot) = self.vibrato_notes.get_mut(channel_index) {
                        if let Some(entry) = slot.get_mut(tuned_key as usize) {
                            had_vibrato = *entry != NoteVibrato::None;
                            *entry = NoteVibrato::None;
                        }
                    }
                    if had_vibrato {
                        self.recompute_channel_vibrato(channel_index);
                    }
                    if self.active_notes[channel_index] == 0 {
                        self.restore_pending_controllers(
                            channel_index,
                            channel,
                            Some(payload.at_ms),
                        );
                    }
                }
                let Some(synth) = &mut self.synth else {
                    return;
                };
                synth.process_midi_message(
                    channel,
                    0x80,
                    i32::from(tuned_key),
                    i32::from(*velocity),
                );
            }
            AudioEventKind::ProgramChange { program } => {
                let channel_index = payload.channel as usize;
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    self.program[channel_index] = *program;
                }
                let range = self.bend_range_for_channel(channel_index);
                let Some(synth) = &mut self.synth else {
                    return;
                };
                synth.process_midi_message(channel, 0xC0, i32::from(*program), 0);
                Self::send_pitch_bend_range(synth, channel_index, range);
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    self.pitch_range_initialized[channel_index] = true;
                }
            }
            AudioEventKind::ControlChange { controller, value } => {
                let channel_index = payload.channel as usize;
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    self.update_registered_parameter_state(channel_index, *controller, *value);
                    if *controller == 0 {
                        self.bank_msb[channel_index] = *value;
                    }
                    if *controller == 32 {
                        self.bank_lsb[channel_index] = *value;
                    }
                    if *controller == 7 {
                        let mut suppress_cc7 = false;
                        let guard_until = self.cc7_seek_guard_until_ms[channel_index];
                        if guard_until.is_finite() {
                            if payload.at_ms > guard_until {
                                self.cc7_seek_guard_until_ms[channel_index] = f64::NAN;
                            } else if *value < self.cc7_seek_guard_min[channel_index] {
                                suppress_cc7 = true;
                                if cfg!(debug_assertions) {
                                    dev_append_log_line(&format!(
                                        "audio_seek_cc7_suppress ch={} at_ms={:.3} value={} baseline={}",
                                        channel_index,
                                        payload.at_ms,
                                        *value,
                                        self.cc7_seek_guard_min[channel_index]
                                    ));
                                }
                            }
                        }
                        if suppress_cc7 {
                            return;
                        }
                        let last = self.last_cc7_nonzero[channel_index];
                        if self.active_notes[channel_index] > 0 || *value == 0 {
                            if last > 0 {
                                self.pending_cc7_restore[channel_index] = Some(last);
                            }
                        } else {
                            if *value < last && last > 0 {
                                // Keep the channel baseline volume stable and restore it on next note.
                                self.pending_cc7_restore[channel_index] = Some(last);
                            } else {
                                self.pending_cc7_restore[channel_index] = None;
                            }
                            self.last_cc7_nonzero[channel_index] =
                                self.last_cc7_nonzero[channel_index].max(*value);
                        }
                        self.cc7[channel_index] = *value;
                        self.last_cc7_change_at_ms[channel_index] = payload.at_ms;
                    }
                    if *controller == 11 {
                        let last = self.last_cc11_nonzero[channel_index];
                        if *value > 0 {
                            self.last_cc11_nonzero[channel_index] = *value;
                            self.pending_cc11_restore[channel_index] = None;
                        } else {
                            if last > 0 {
                                self.pending_cc11_restore[channel_index] = Some(last);
                            } else {
                                self.pending_cc11_restore[channel_index] = None;
                            }
                            self.last_cc11_zero_at_ms[channel_index] = payload.at_ms;
                        }
                        if *value > 0 {
                            self.last_cc11_zero_at_ms[channel_index] = f64::NAN;
                        }
                        self.cc11[channel_index] = *value;
                    }
                }
                let Some(synth) = &mut self.synth else {
                    return;
                };
                synth.process_midi_message(
                    channel,
                    0xB0,
                    i32::from(*controller),
                    i32::from(*value),
                );
            }
            AudioEventKind::PitchBend {
                value,
                endpoint,
                label,
            } => {
                let channel_index = payload.channel as usize;
                if channel_index < Synthesizer::CHANNEL_COUNT {
                    let range = self.bend_range_for_channel(channel_index);
                    let semitones = Self::normalize_bend_to_semitones_for_range(*value, range);
                    self.base_pitch_semitones[channel_index] = semitones;
                    self.last_pitch_bend_change_at_ms[channel_index] = payload.at_ms;
                    let offset_semitones = self.current_vibrato_offset_semitones(channel_index);
                    let combined_semitones = semitones + offset_semitones;
                    let offset = Self::semitones_to_pb_offset(combined_semitones, range);
                    self.apply_pitch_bend(channel_index, PITCH_BEND_CENTER + offset);
                    pitch_debug!(
                        endpoint,
                        label,
                        payload.at_ms,
                        PITCH_BEND_CENTER + Self::semitones_to_pb_offset(semitones, range),
                        PITCH_BEND_CENTER + offset
                    );
                }
                if cfg!(debug_assertions) {
                    let range = self.bend_range_for_channel(channel_index);
                    let base = self
                        .base_pitch_semitones
                        .get(channel_index)
                        .copied()
                        .unwrap_or(0.0);
                    if let Some(state) = &mut self.debug_seek_note_log {
                        if payload.at_ms <= state.until_ms && state.remaining_bend > 0 {
                            dev_append_log_line(&format!(
                                "audio_seek_pitch_bend ch={} at_ms={:.3} value={} range={:.2} base_semitones={:.3}",
                                payload.channel,
                                payload.at_ms,
                                value,
                                range,
                                base
                            ));
                            state.remaining_bend -= 1;
                            if state.remaining_bend == 0 && state.remaining == 0 {
                                self.debug_seek_note_log = None;
                            }
                        }
                    }
                }
            }
            AudioEventKind::AllNotesOff => {
                let Some(synth) = &mut self.synth else {
                    return;
                };
                synth.process_midi_message(channel, 0xB0, 0x7B, 0);
            }
            AudioEventKind::Reset => {
                self.all_notes_off();
            }
        }
    }

    pub(crate) fn queue_alphatab_metronome_tick(&mut self, payload: AlphaTabMetronomeTickPayload) {
        let beat_duration_ms =
            if payload.beat_duration_ms.is_finite() && payload.beat_duration_ms > 0.0 {
                payload.beat_duration_ms as f64
            } else {
                let bpm = self.metronome_state.config.bpm.max(1.0) as f64;
                (60_000.0 / bpm).max(1.0)
            };
        let steps = payload.subdivisions.max(1) as usize;
        let main_state = match payload.beat_type {
            MetronomeBeatStatePayload::Accent => MetronomeBeatState::Accent,
            MetronomeBeatStatePayload::Normal => MetronomeBeatState::Normal,
            MetronomeBeatStatePayload::Low => MetronomeBeatState::Low,
            MetronomeBeatStatePayload::Mute => MetronomeBeatState::Mute,
        };
        let sound_mode = match payload.sound_mode {
            MetronomeSoundModePayload::Blip => MetronomeSoundMode::Blip,
            MetronomeSoundModePayload::DrumKit => MetronomeSoundMode::DrumKit,
            MetronomeSoundModePayload::Tock => MetronomeSoundMode::Tock,
            MetronomeSoundModePayload::Hype => MetronomeSoundMode::Hype,
            MetronomeSoundModePayload::MetalKit => MetronomeSoundMode::MetalKit,
            MetronomeSoundModePayload::RideKit => MetronomeSoundMode::RideKit,
        };
        let volume_scalar = payload.volume_scalar.clamp(0.0, 1.0);
        if volume_scalar <= 0.0 {
            self.clear_pending_metronome_events();
            return;
        }
        let now_sample = self.metronome_state.position_samples;
        let click_samples = (METRONOME_CLICK_MS / 1000.0) * self.sample_rate;
        let subdivision_step_ms = beat_duration_ms / steps as f64;
        // Defensively drop previous queued subdivisions to avoid overlap/drift.
        self.clear_pending_metronome_events();
        let queue_click = |runtime: &mut EngineRuntime,
                           at_sample: f64,
                           beat_state: MetronomeBeatState,
                           subdivision: bool| {
            if matches!(beat_state, MetronomeBeatState::Mute) {
                return;
            }
            match sound_mode {
                MetronomeSoundMode::Blip => {
                    let freq_hz = if subdivision {
                        (METRONOME_BLIP_FREQ_NORMAL + METRONOME_SUBDIVISION_PITCH_OFFSET_HZ)
                            .max(40.0)
                    } else {
                        match beat_state {
                            MetronomeBeatState::Accent => METRONOME_BLIP_FREQ_ACCENT,
                            MetronomeBeatState::Normal => METRONOME_BLIP_FREQ_NORMAL,
                            MetronomeBeatState::Low => METRONOME_BLIP_FREQ_LOW,
                            MetronomeBeatState::Mute => METRONOME_BLIP_FREQ_NORMAL,
                        }
                    };
                    let mut amplitude = if subdivision {
                        0.6 * METRONOME_SUBDIVISION_VELOCITY_SCALE
                    } else {
                        match beat_state {
                            MetronomeBeatState::Accent => 0.9,
                            MetronomeBeatState::Normal => 0.6,
                            MetronomeBeatState::Low => 0.45,
                            MetronomeBeatState::Mute => 0.0,
                        }
                    };
                    amplitude *= volume_scalar;
                    runtime.metronome_state.pending_blips.push(MetronomeBlip {
                        start_sample: at_sample,
                        end_sample: at_sample + click_samples,
                        freq_hz,
                        amplitude,
                    });
                }
                MetronomeSoundMode::DrumKit
                | MetronomeSoundMode::Tock
                | MetronomeSoundMode::Hype
                | MetronomeSoundMode::MetalKit
                | MetronomeSoundMode::RideKit => {
                    let Some(sample_set) = sample_set_for_mode(sound_mode) else {
                        return;
                    };
                    let variant = tock_variant_for(beat_state, subdivision);
                    runtime
                        .metronome_state
                        .pending_tocks
                        .push(MetronomeTockHit {
                            sample_time: at_sample,
                            end_sample: at_sample,
                            sample_set,
                            variant,
                            amplitude: volume_scalar,
                        });
                }
            }
        };
        queue_click(self, now_sample, main_state, false);
        if steps > 1 {
            for subdivision_index in 1..steps {
                let at_ms = subdivision_step_ms * subdivision_index as f64;
                let at_sample = now_sample + (at_ms / 1000.0) * self.sample_rate;
                queue_click(self, at_sample, MetronomeBeatState::Low, true);
            }
        }
    }
}
