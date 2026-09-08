use super::metronome::{
    sample_set_for_mode, tock_variant_for, MetronomeBlip, MetronomeConfig, MetronomeNoteOff,
    MetronomeTockHit,
};
use super::synthesis::EngineRuntime;
use super::types::{
    metronome_output_gain, MetronomeBeatState, MetronomeSoundMode, AUDIO_FADE_DURATION_SECS,
    METRONOME_BLIP_ENV_DECAY, METRONOME_BLIP_FREQ_ACCENT, METRONOME_BLIP_FREQ_LOW,
    METRONOME_BLIP_FREQ_NORMAL, METRONOME_BUS_LIMITER_ATTACK_MS, METRONOME_BUS_LIMITER_CEILING,
    METRONOME_BUS_LIMITER_RELEASE_MS, METRONOME_CHANNEL_DRUM, METRONOME_CHANNEL_MELODIC,
    METRONOME_CLICK_MS, METRONOME_SUBDIVISION_PITCH_OFFSET_HZ,
    METRONOME_SUBDIVISION_VELOCITY_SCALE,
};

impl EngineRuntime {
    pub(crate) fn set_metronome_config(&mut self, config: MetronomeConfig) {
        self.metronome_state.set_config(config);
    }

    pub(crate) fn clear_pending_metronome_events(&mut self) {
        self.metronome_state.pending_blips.clear();
        self.metronome_state.pending_note_offs.clear();
        self.metronome_state.pending_drum_hits.clear();
        self.metronome_state.pending_tocks.clear();
    }

    pub(crate) fn apply_metronome_bus_limiter(&mut self, left: f32, right: f32) -> (f32, f32) {
        let peak = left.abs().max(right.abs()).max(1.0e-9);
        let target_gain = if peak > METRONOME_BUS_LIMITER_CEILING {
            METRONOME_BUS_LIMITER_CEILING / peak
        } else {
            1.0
        };
        let sample_rate = self.sample_rate.max(1.0);
        let attack_coeff =
            (-1.0 / ((METRONOME_BUS_LIMITER_ATTACK_MS / 1000.0) * sample_rate)).exp() as f32;
        let release_coeff =
            (-1.0 / ((METRONOME_BUS_LIMITER_RELEASE_MS / 1000.0) * sample_rate)).exp() as f32;
        let coeff = if target_gain < self.metronome_bus_limiter_gain {
            attack_coeff
        } else {
            release_coeff
        };
        self.metronome_bus_limiter_gain =
            target_gain + coeff * (self.metronome_bus_limiter_gain - target_gain);
        let gain = self.metronome_bus_limiter_gain.clamp(0.0, 1.0);
        (left * gain, right * gain)
    }
    pub(crate) fn queue_metronome_blips(
        &mut self,
        count: u8,
        spacing_ms: f64,
        freq_hz: f32,
        click_ms: f64,
    ) {
        let click_samples = (click_ms / 1000.0) * self.sample_rate;
        let spacing_samples = (spacing_ms / 1000.0) * self.sample_rate;
        let start_sample = self.metronome_state.position_samples;
        for index in 0..count {
            let offset = spacing_samples * index as f64;
            self.metronome_state.pending_blips.push(MetronomeBlip {
                start_sample: start_sample + offset,
                end_sample: start_sample + offset + click_samples,
                freq_hz,
                amplitude: 0.9,
            });
        }
    }

    pub(crate) fn start_metronome(&mut self) {
        self.metronome_bus_limiter_gain = 1.0;
        self.metronome_fade_gain = 1.0;
        self.metronome_fade_step = 0.0;
        let was_running = self.metronome_state.running;
        if was_running {
            self.metronome_state.schedule_restart(self.sample_rate);
        } else {
            self.metronome_state.start(true);
        }
        if !was_running {
            if let Some(synth) = self.metronome_synth.as_mut() {
                synth.process_midi_message(METRONOME_CHANNEL_MELODIC, 0xB0, 0x7B, 0);
                synth.process_midi_message(METRONOME_CHANNEL_DRUM, 0xB0, 0x7B, 0);
            }
        }
    }

    pub(crate) fn stop_metronome(&mut self) {
        if !self.metronome_state.running {
            return;
        }
        // Initiate fade-out; render_metronome will complete the stop when gain reaches 0
        let fade_samples = (AUDIO_FADE_DURATION_SECS * self.sample_rate).max(1.0);
        self.metronome_fade_step = -(self.metronome_fade_gain as f64 / fade_samples) as f32;
    }

    fn complete_metronome_stop(&mut self) {
        self.metronome_fade_gain = 1.0;
        self.metronome_fade_step = 0.0;
        self.metronome_bus_limiter_gain = 1.0;
        self.metronome_state.stop();
        self.metronome_state.pending_blips.clear();
        self.metronome_state.pending_tocks.clear();
        self.metronome_state.pending_drum_hits.clear();
        if let Some(synth) = self.metronome_synth.as_mut() {
            synth.process_midi_message(METRONOME_CHANNEL_MELODIC, 0xB0, 0x7B, 0);
            synth.process_midi_message(METRONOME_CHANNEL_DRUM, 0xB0, 0x7B, 0);
        }
    }

    pub(crate) fn render_metronome(&mut self, frames: usize, left: &mut [f32], right: &mut [f32]) {
        let has_pending = !self.metronome_state.pending_blips.is_empty()
            || !self.metronome_state.pending_note_offs.is_empty()
            || !self.metronome_state.pending_drum_hits.is_empty()
            || !self.metronome_state.pending_tocks.is_empty();
        if !self.metronome_state.running && !has_pending {
            return;
        }
        let sound_mode = self.metronome_state.config.sound_mode;
        let use_synth = false;
        let use_tock = sample_set_for_mode(sound_mode).is_some();
        if use_synth {
            self.ensure_metronome_synth(self.sample_rate);
            if self.metronome_synth.is_none() && self.metronome_state.pending_blips.is_empty() {
                return;
            }
        }
        if use_tock {
            self.ensure_metronome_tock_cache(self.sample_rate);
        }
        let click_samples = (METRONOME_CLICK_MS / 1000.0) * self.sample_rate;
        let tempo_factor = self.tempo_factor.max(0.05);
        if self.metronome_state.running {
            if let Some(restart) = self.metronome_state.pending_restart.take() {
                self.metronome_state.count_in_remaining = 0;
                self.metronome_state.beat_index = restart.beat_index;
                self.metronome_state.sub_index = restart.sub_index;
                if let Some(offset_samples) = restart.schedule_offset_samples {
                    // Schedule mode: only reposition the score-time clock
                    self.metronome_state.schedule_position_samples = offset_samples;
                } else {
                    self.metronome_state.next_event_sample =
                        self.metronome_state.position_samples + restart.start_delay_samples;
                }
            }
            if !self.metronome_state.schedule_enabled() {
                if self.metronome_state.count_in_remaining == 0
                    && self.metronome_state.position_samples == 0.0
                    && self.metronome_state.next_event_sample == 0.0
                    && self.metronome_state.config.start_delay_ms > 0.0
                {
                    self.metronome_state.next_event_sample =
                        (self.metronome_state.config.start_delay_ms as f64 / 1000.0)
                            * self.sample_rate;
                }
            } else if self.metronome_state.schedule_position_samples == 0.0
                && self.metronome_state.config.schedule_start_offset_ms > 0.0
            {
                // Score-time offset: positions us within the schedule loop
                self.metronome_state.schedule_position_samples = self
                    .metronome_state
                    .schedule_offset_samples(self.sample_rate);
            }
        }
        // Render window: real-time for sound output
        let render_start = self.metronome_state.position_samples;
        let render_end = render_start + frames as f64;
        // Schedule window: score-time for event matching
        let schedule_start = self.metronome_state.schedule_position_samples;
        let schedule_end = schedule_start + frames as f64 * tempo_factor;

        self.metronome_state
            .pending_blips
            .retain(|blip| blip.end_sample > render_start);
        if let Some(cache) = self.metronome_tock_cache.as_ref() {
            self.metronome_state.pending_tocks.retain(|hit| {
                let end_sample = hit
                    .end_sample
                    .max(hit.sample_time + cache.buffer(hit.sample_set, hit.variant).len() as f64);
                end_sample > render_start
            });
        }

        if self.metronome_state.running && self.metronome_state.schedule_enabled() {
            self.render_metronome_schedule(
                schedule_start,
                schedule_end,
                render_start,
                tempo_factor,
                sound_mode,
                click_samples,
            );
        } else if self.metronome_state.running {
            self.render_metronome_steady(render_end, sound_mode, click_samples);
        }

        if let Some(synth) = self.metronome_synth.as_mut() {
            let mut remaining_hits = Vec::new();
            let mut drained = std::mem::take(&mut self.metronome_state.pending_drum_hits);
            for hit in drained.drain(..) {
                if hit.sample_time <= render_end {
                    synth.process_midi_message(hit.channel, 0x90, hit.key, hit.velocity);
                    self.metronome_state
                        .pending_note_offs
                        .push(MetronomeNoteOff {
                            sample_time: hit.off_sample,
                            channel: hit.channel,
                            key: hit.key,
                        });
                } else {
                    remaining_hits.push(hit);
                }
            }
            self.metronome_state.pending_drum_hits = remaining_hits;
        }

        let mut met_left = vec![0.0_f32; frames];
        let mut met_right = vec![0.0_f32; frames];
        if let Some(synth) = self.metronome_synth.as_mut() {
            synth.render(&mut met_left, &mut met_right);
        }
        if sound_mode == MetronomeSoundMode::Blip || !self.metronome_state.pending_blips.is_empty()
        {
            for idx in 0..frames {
                let sample_time = render_start + idx as f64;
                let mut sample = 0.0f32;
                for blip in self.metronome_state.pending_blips.iter() {
                    if sample_time < blip.start_sample || sample_time > blip.end_sample {
                        continue;
                    }
                    let t = ((sample_time - blip.start_sample) / self.sample_rate) as f32;
                    let env = (-t * METRONOME_BLIP_ENV_DECAY).exp();
                    sample += (2.0 * std::f32::consts::PI * blip.freq_hz * t).sin()
                        * env
                        * blip.amplitude;
                }
                met_left[idx] += sample;
                met_right[idx] += sample;
            }
        }
        if use_tock || !self.metronome_state.pending_tocks.is_empty() {
            if let Some(cache) = self.metronome_tock_cache.as_ref() {
                for idx in 0..frames {
                    let sample_time = render_start + idx as f64;
                    let mut sample = 0.0f32;
                    for hit in self.metronome_state.pending_tocks.iter() {
                        if sample_time < hit.sample_time {
                            continue;
                        }
                        let pos = (sample_time - hit.sample_time).floor() as usize;
                        let buffer = cache.buffer(hit.sample_set, hit.variant);
                        if pos >= buffer.len() {
                            continue;
                        }
                        sample +=
                            buffer[pos] * hit.amplitude * cache.gain(hit.sample_set, hit.variant);
                    }
                    met_left[idx] += sample;
                    met_right[idx] += sample;
                }
            }
        }
        let metronome_gain = metronome_output_gain(sound_mode, self.metronome_state.config.volume);
        let is_fading = self.metronome_fade_step < 0.0;
        for idx in 0..frames {
            // Advance fade envelope
            if is_fading {
                self.metronome_fade_gain =
                    (self.metronome_fade_gain + self.metronome_fade_step).clamp(0.0, 1.0);
                if self.metronome_fade_gain <= 0.0 {
                    self.complete_metronome_stop();
                    break;
                }
            }
            let fade = self.metronome_fade_gain;
            let ml = met_left[idx] * metronome_gain * fade;
            let mr = met_right[idx] * metronome_gain * fade;
            let (limited_l, limited_r) = self.apply_metronome_bus_limiter(ml, mr);
            left[idx] += limited_l;
            right[idx] += limited_r;
        }
        if let Some(synth) = self.metronome_synth.as_mut() {
            self.metronome_state.pending_note_offs.retain(|off| {
                if off.sample_time <= render_end {
                    synth.process_midi_message(off.channel, 0x80, off.key, 0);
                    false
                } else {
                    true
                }
            });
        }
        self.metronome_state.position_samples = render_end;
        self.metronome_state.schedule_position_samples = schedule_end;
    }

    fn render_metronome_schedule(
        &mut self,
        schedule_start: f64,
        schedule_end: f64,
        render_start: f64,
        tempo_factor: f64,
        sound_mode: MetronomeSoundMode,
        click_samples: f64,
    ) {
        let loop_ms = self.metronome_state.config.schedule_loop_ms.unwrap_or(0.0);
        let loop_samples = (loop_ms / 1000.0) * self.sample_rate;
        if loop_samples <= 0.0 {
            return;
        }
        let mut cycle_start = (schedule_start / loop_samples).floor() * loop_samples;
        let max_cycles = ((schedule_end - schedule_start) / loop_samples)
            .ceil()
            .max(0.0) as usize
            + 1;
        for _ in 0..max_cycles {
            if cycle_start >= schedule_end {
                break;
            }
            for event in &self.metronome_state.config.schedule {
                let event_schedule_sample =
                    cycle_start + (event.offset_ms / 1000.0) * self.sample_rate;
                if event_schedule_sample >= schedule_start && event_schedule_sample < schedule_end {
                    // Convert score-time position to real-time render position
                    let render_sample =
                        render_start + (event_schedule_sample - schedule_start) / tempo_factor;
                    let beat_state = event.kind;
                    let is_subdivision = matches!(beat_state, MetronomeBeatState::Low)
                        && self.metronome_state.config.subdivisions_enabled;
                    if matches!(beat_state, MetronomeBeatState::Mute)
                        || self.metronome_state.config.volume == 0
                    {
                        continue;
                    }
                    match sound_mode {
                        MetronomeSoundMode::Blip => {
                            let freq_hz = if is_subdivision {
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
                            let mut amplitude = match if is_subdivision {
                                MetronomeBeatState::Normal
                            } else {
                                beat_state
                            } {
                                MetronomeBeatState::Accent => 0.9,
                                MetronomeBeatState::Normal => 0.6,
                                MetronomeBeatState::Low => 0.45,
                                MetronomeBeatState::Mute => 0.0,
                            };
                            if is_subdivision {
                                amplitude *= METRONOME_SUBDIVISION_VELOCITY_SCALE;
                            }
                            self.metronome_state.pending_blips.push(MetronomeBlip {
                                start_sample: render_sample,
                                end_sample: render_sample + click_samples,
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
                                continue;
                            };
                            let variant = tock_variant_for(beat_state, is_subdivision);
                            self.metronome_state.pending_tocks.push(MetronomeTockHit {
                                sample_time: render_sample,
                                end_sample: render_sample,
                                sample_set,
                                variant,
                                amplitude: 1.0,
                            });
                        }
                    }
                }
            }
            cycle_start += loop_samples;
        }
    }

    fn render_metronome_steady(
        &mut self,
        buffer_end: f64,
        sound_mode: MetronomeSoundMode,
        click_samples: f64,
    ) {
        let step_samples = self.metronome_state.step_samples(self.sample_rate);
        while self.metronome_state.next_event_sample <= buffer_end {
            let beat_state = self.metronome_state.beat_state_for_event();
            let is_subdivision = self.metronome_state.sub_index > 0;
            if !matches!(beat_state, MetronomeBeatState::Mute)
                && self.metronome_state.config.volume > 0
            {
                match sound_mode {
                    MetronomeSoundMode::Blip => {
                        let freq_hz = if is_subdivision {
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
                        let mut amplitude = match if is_subdivision {
                            MetronomeBeatState::Normal
                        } else {
                            beat_state
                        } {
                            MetronomeBeatState::Accent => 0.9,
                            MetronomeBeatState::Normal => 0.6,
                            MetronomeBeatState::Low => 0.45,
                            MetronomeBeatState::Mute => 0.0,
                        };
                        if is_subdivision {
                            amplitude *= METRONOME_SUBDIVISION_VELOCITY_SCALE;
                        }
                        self.metronome_state.pending_blips.push(MetronomeBlip {
                            start_sample: self.metronome_state.next_event_sample,
                            end_sample: self.metronome_state.next_event_sample + click_samples,
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
                            self.metronome_state.advance_step();
                            self.metronome_state.next_event_sample += step_samples;
                            continue;
                        };
                        let variant = tock_variant_for(beat_state, is_subdivision);
                        self.metronome_state.pending_tocks.push(MetronomeTockHit {
                            sample_time: self.metronome_state.next_event_sample,
                            end_sample: self.metronome_state.next_event_sample,
                            sample_set,
                            variant,
                            amplitude: 1.0,
                        });
                    }
                }
            }
            self.metronome_state.advance_step();
            // Compute next event from total step count to avoid accumulated float drift
            let total_steps = self.metronome_state.total_steps_elapsed();
            self.metronome_state.next_event_sample =
                self.metronome_state.start_sample + (total_steps as f64) * step_samples;
        }
    }
}
