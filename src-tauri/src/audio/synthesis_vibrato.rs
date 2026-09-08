use std::f32::consts::PI;

use rustysynth::Synthesizer;

use super::synthesis::EngineRuntime;
use super::types::{
    NoteVibrato, VibratoState, MIN_BEND_RANGE_SEMITONES, PITCH_BEND_CENTER, PITCH_BEND_MAX,
    VIBRATO_FADE_OUT_SECONDS, VIBRATO_FADE_SECONDS, VIBRATO_MAX_PB_DELTA, VIBRATO_SMOOTHING_HZ,
    VIB_RATE_HZ_DEFAULT, VIB_RATE_SCALE,
};

impl EngineRuntime {
    pub(crate) fn recompute_channel_vibrato(&mut self, channel_index: usize) {
        if channel_index >= Synthesizer::CHANNEL_COUNT {
            return;
        }
        let mut depth = 0.0_f32;
        let mut rate = 0.0_f32;
        for entry in &self.vibrato_notes[channel_index] {
            depth = depth.max(Self::vibrato_depth_semitones(*entry));
            rate = rate.max(entry.rate_hz());
        }
        if depth <= 0.0 {
            if self.vibrato[channel_index].active {
                let mut state = self.vibrato[channel_index];
                state.active = false;
                state.fade_out_remaining = VIBRATO_FADE_OUT_SECONDS;
                self.vibrato[channel_index] = state;
            } else {
                self.vibrato[channel_index] = VibratoState::inactive();
            }
            return;
        }
        let active = self.vibrato[channel_index].active;
        self.vibrato[channel_index] = VibratoState {
            active: true,
            depth_semitones: depth,
            rate_hz: rate.max(VIB_RATE_HZ_DEFAULT * VIB_RATE_SCALE),
            phase: if active {
                self.vibrato[channel_index].phase
            } else {
                self.next_vibrato_phase()
            },
            fade_elapsed: if active {
                self.vibrato[channel_index].fade_elapsed
            } else {
                0.0
            },
            fade_out_remaining: 0.0,
            smoothed_offset_semitones: if active {
                self.vibrato[channel_index].smoothed_offset_semitones
            } else {
                0.0
            },
        };
    }

    pub(crate) fn send_pitch_bend_range(
        synth: &mut Synthesizer,
        channel: usize,
        range_semitones: f32,
    ) {
        let range = range_semitones.max(MIN_BEND_RANGE_SEMITONES);
        let channel = channel as i32;
        synth.process_midi_message(channel, 0xB0, 0x65, 0);
        synth.process_midi_message(channel, 0xB0, 0x64, 0);
        synth.process_midi_message(channel, 0xB0, 0x06, range.round() as i32);
        synth.process_midi_message(channel, 0xB0, 0x26, 0);
        synth.process_midi_message(channel, 0xB0, 0x65, 0x7F);
        synth.process_midi_message(channel, 0xB0, 0x64, 0x7F);
    }

    pub(crate) fn bend_range_for_channel(&self, channel: usize) -> f32 {
        self.bend_range_semitones
            .get(channel)
            .copied()
            .unwrap_or(super::types::DEFAULT_BEND_RANGE_SEMITONES)
            .max(MIN_BEND_RANGE_SEMITONES)
    }

    pub(crate) fn next_vibrato_phase(&mut self) -> f32 {
        self.vibrato_seed = self
            .vibrato_seed
            .wrapping_mul(1664525)
            .wrapping_add(1013904223);
        let value = (self.vibrato_seed >> 8) as f32 / (u32::MAX >> 8) as f32;
        value * 2.0 * PI
    }

    pub(crate) fn normalize_bend_to_semitones_for_range(value: i16, range_semitones: f32) -> f32 {
        let offset = Self::pitch_bend_to_offset(value) as f32;
        (offset / PITCH_BEND_CENTER as f32) * range_semitones.max(MIN_BEND_RANGE_SEMITONES)
    }

    pub(crate) fn is_pitch_bend_range_rpn_selected(&self, channel: usize) -> bool {
        channel < Synthesizer::CHANNEL_COUNT
            && self.rpn_msb[channel] == 0
            && self.rpn_lsb[channel] == 0
    }

    pub(crate) fn update_registered_parameter_state(
        &mut self,
        channel: usize,
        controller: u8,
        value: u8,
    ) {
        if channel >= Synthesizer::CHANNEL_COUNT {
            return;
        }
        match controller {
            101 => self.rpn_msb[channel] = value,
            100 => self.rpn_lsb[channel] = value,
            6 => self.data_entry_msb[channel] = value,
            38 => self.data_entry_lsb[channel] = value,
            _ => return,
        }
        if (controller == 6 || controller == 38) && self.is_pitch_bend_range_rpn_selected(channel) {
            let coarse = self.data_entry_msb[channel] as f32;
            let fine = self.data_entry_lsb[channel] as f32 / 100.0;
            let range = (coarse + fine).max(MIN_BEND_RANGE_SEMITONES);
            self.bend_range_semitones[channel] = range;
            self.pitch_range_initialized[channel] = true;
            let bend_value = self.last_pitch_bend[channel] as i16;
            self.base_pitch_semitones[channel] =
                Self::normalize_bend_to_semitones_for_range(bend_value, range);
        }
    }

    pub(crate) fn semitones_to_pb_offset(semitones: f32, range_semitones: f32) -> i32 {
        let range = range_semitones.max(MIN_BEND_RANGE_SEMITONES);
        let offset = (semitones / range * PITCH_BEND_CENTER as f32).round() as i32;
        offset.clamp(-PITCH_BEND_CENTER, PITCH_BEND_CENTER - 1)
    }

    pub(crate) fn vibrato_depth_semitones(vibrato: NoteVibrato) -> f32 {
        if vibrato == NoteVibrato::None {
            return 0.0;
        }
        vibrato.depth_cents() / 100.0
    }

    pub(crate) fn pitch_bend_to_offset(value: i16) -> i32 {
        let value_i32 = i32::from(value);
        if value_i32 < 0 {
            return value_i32.clamp(-PITCH_BEND_CENTER, PITCH_BEND_CENTER - 1);
        }
        value_i32
            .clamp(0, PITCH_BEND_MAX)
            .saturating_sub(PITCH_BEND_CENTER)
    }

    pub(crate) fn apply_pitch_bend(&mut self, channel: usize, value: i32) {
        let clamped = value.clamp(0, PITCH_BEND_MAX);
        if channel < Synthesizer::CHANNEL_COUNT {
            self.last_pitch_bend[channel] = clamped;
        }
        if let Some(synth) = &mut self.synth {
            let lsb = clamped & 0x7F;
            let msb = (clamped >> 7) & 0x7F;
            synth.process_midi_message(channel as i32, 0xE0, lsb, msb);
        }
    }

    pub(crate) fn current_vibrato_offset_semitones(&self, channel: usize) -> f32 {
        if channel >= Synthesizer::CHANNEL_COUNT {
            return 0.0;
        }
        let state = self.vibrato[channel];
        if (state.active && self.active_notes[channel] > 0) || state.fade_out_remaining > 0.0 {
            state.smoothed_offset_semitones
        } else {
            0.0
        }
    }

    pub(crate) fn apply_vibrato_for_block(&mut self, frames: usize) {
        let duration = frames as f32 / self.sample_rate as f32;
        for channel in 0..Synthesizer::CHANNEL_COUNT {
            let state = self.vibrato[channel];
            let has_notes = self.active_notes[channel] > 0;
            let mut offset_semitones = 0.0_f32;
            if state.active && has_notes {
                let fade = if VIBRATO_FADE_SECONDS > 0.0 {
                    let elapsed = (state.fade_elapsed + duration).min(VIBRATO_FADE_SECONDS);
                    self.vibrato[channel].fade_elapsed = elapsed;
                    (elapsed / VIBRATO_FADE_SECONDS).min(1.0)
                } else {
                    1.0
                };
                offset_semitones = (state.phase).sin() * state.depth_semitones * fade;
            } else if state.fade_out_remaining > 0.0 {
                let remaining = (state.fade_out_remaining - duration).max(0.0);
                let fade = if VIBRATO_FADE_OUT_SECONDS > 0.0 {
                    remaining / VIBRATO_FADE_OUT_SECONDS
                } else {
                    0.0
                };
                self.vibrato[channel].fade_out_remaining = remaining;
                offset_semitones = (state.phase).sin() * state.depth_semitones * fade;
            }
            let alpha = (duration * VIBRATO_SMOOTHING_HZ).clamp(0.0, 1.0);
            let smoothed = state.smoothed_offset_semitones
                + alpha * (offset_semitones - state.smoothed_offset_semitones);
            self.vibrato[channel].smoothed_offset_semitones = smoothed;
            let range = self.bend_range_for_channel(channel);
            let combined_semitones = self.base_pitch_semitones[channel] + smoothed;
            let offset = Self::semitones_to_pb_offset(combined_semitones, range);
            let mut target = PITCH_BEND_CENTER + offset;
            if self.base_pitch_semitones[channel].abs() <= f32::EPSILON {
                let last = self.last_pitch_bend[channel];
                let delta = (target - last).clamp(-VIBRATO_MAX_PB_DELTA, VIBRATO_MAX_PB_DELTA);
                target = last + delta;
            }
            self.apply_pitch_bend(channel, target);
            if state.active && has_notes {
                let advance = 2.0 * PI * state.rate_hz * duration;
                let next = state.phase + advance;
                self.vibrato[channel].phase = if next > 2.0 * PI {
                    next - 2.0 * PI
                } else {
                    next
                };
            } else if state.fade_out_remaining <= 0.0 {
                self.vibrato[channel].phase = 0.0;
                self.vibrato[channel].fade_elapsed = 0.0;
                self.vibrato[channel].smoothed_offset_semitones = 0.0;
            }
        }
    }
}
