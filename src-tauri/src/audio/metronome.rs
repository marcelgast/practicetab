use super::types::{
    MetronomeBeatState, MetronomeBeatStatePayload, MetronomeConfigPayload, MetronomeSampleSet,
    MetronomeSoundMode, MetronomeSoundModePayload, MetronomeTockVariant,
};

// Re-export items from metronome_samples for backward compatibility
pub(crate) use super::metronome_samples::{
    sample_set_for_mode, tock_variant_for, MetronomeSampleCache,
};

// ── Metronome structs ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(crate) struct MetronomeConfig {
    pub(crate) bpm: f32,
    pub(crate) time_sig_top: u8,
    pub(crate) time_sig_bottom: u8,
    pub(crate) volume: u8,
    pub(crate) beat_states: Vec<MetronomeBeatState>,
    pub(crate) subdivisions_enabled: bool,
    pub(crate) subdivisions_value: u8,
    pub(crate) sound_mode: MetronomeSoundMode,
    pub(crate) count_in_bars: Vec<u8>,
    pub(crate) count_in_enabled: bool,
    pub(crate) start_beat_index: u8,
    pub(crate) start_sub_index: u8,
    pub(crate) start_delay_ms: f32,
    pub(crate) schedule: Vec<MetronomeScheduledEvent>,
    pub(crate) schedule_loop_ms: Option<f64>,
    pub(crate) schedule_start_offset_ms: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct MetronomeScheduledEvent {
    pub(crate) offset_ms: f64,
    pub(crate) kind: MetronomeBeatState,
}

#[derive(Debug, Clone)]
pub(crate) struct MetronomeNoteOff {
    pub(crate) sample_time: f64,
    pub(crate) channel: i32,
    pub(crate) key: i32,
}

#[derive(Debug, Clone)]
pub(crate) struct MetronomeBlip {
    pub(crate) start_sample: f64,
    pub(crate) end_sample: f64,
    pub(crate) freq_hz: f32,
    pub(crate) amplitude: f32,
}

#[derive(Debug, Clone)]
pub(crate) struct MetronomeDrumHit {
    pub(crate) sample_time: f64,
    pub(crate) off_sample: f64,
    pub(crate) channel: i32,
    pub(crate) key: i32,
    pub(crate) velocity: i32,
}

#[derive(Debug, Clone)]
pub(crate) struct MetronomeTockHit {
    pub(crate) sample_time: f64,
    pub(crate) end_sample: f64,
    pub(crate) sample_set: MetronomeSampleSet,
    pub(crate) variant: MetronomeTockVariant,
    pub(crate) amplitude: f32,
}

#[derive(Debug, Clone)]
pub(crate) struct MetronomeState {
    pub(crate) running: bool,
    pub(crate) config: MetronomeConfig,
    pub(crate) position_samples: f64,
    /// Score-time position for schedule matching. Advances by `frames * tempo_factor`.
    pub(crate) schedule_position_samples: f64,
    pub(crate) next_event_sample: f64,
    pub(crate) beat_index: usize,
    pub(crate) sub_index: usize,
    pub(crate) count_in_remaining: u8,
    pub(crate) pending_restart: Option<MetronomeRestart>,
    pub(crate) pending_note_offs: Vec<MetronomeNoteOff>,
    pub(crate) pending_blips: Vec<MetronomeBlip>,
    pub(crate) pending_drum_hits: Vec<MetronomeDrumHit>,
    pub(crate) pending_tocks: Vec<MetronomeTockHit>,
    pub(crate) start_sample: f64,
    pub(crate) total_steps: u64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct MetronomeRestart {
    pub(crate) beat_index: usize,
    pub(crate) sub_index: usize,
    pub(crate) start_delay_samples: f64,
    pub(crate) schedule_offset_samples: Option<f64>,
}

impl MetronomeState {
    pub(crate) fn new() -> Self {
        Self {
            running: false,
            config: MetronomeConfig::default(),
            position_samples: 0.0,
            schedule_position_samples: 0.0,
            next_event_sample: 0.0,
            beat_index: 0,
            sub_index: 0,
            count_in_remaining: 0,
            pending_restart: None,
            pending_note_offs: Vec::new(),
            pending_blips: Vec::new(),
            pending_drum_hits: Vec::new(),
            pending_tocks: Vec::new(),
            start_sample: 0.0,
            total_steps: 0,
        }
    }

    pub(crate) fn set_config(&mut self, config: MetronomeConfig) {
        let old_steps_per_beat = self.steps_per_beat();
        self.config = config;
        if self.beat_index >= self.config.time_sig_top as usize {
            self.beat_index = 0;
        }
        if !self.running {
            self.count_in_remaining = self.config.count_in_value();
        }
        // When subdivisions change while running, recalculate total_steps
        // to avoid a jump in next_event_sample (which uses total_steps * step_samples).
        let new_steps_per_beat = self.steps_per_beat();
        if self.running && old_steps_per_beat != new_steps_per_beat && old_steps_per_beat > 0 {
            let elapsed_beats = self.total_steps / old_steps_per_beat as u64;
            self.total_steps = elapsed_beats * new_steps_per_beat as u64;
            self.sub_index = 0;
        }
    }

    pub(crate) fn start(&mut self, reset_pending: bool) {
        self.running = true;
        self.position_samples = 0.0;
        self.schedule_position_samples = 0.0;
        self.total_steps = 0;
        if self.schedule_enabled() {
            self.count_in_remaining = 0;
            self.beat_index = 0;
            self.sub_index = 0;
            self.position_samples = 0.0;
            self.schedule_position_samples = 0.0;
            self.next_event_sample = 0.0;
            self.start_sample = 0.0;
        } else {
            self.count_in_remaining = self.config.count_in_value();
            if self.count_in_remaining > 0 {
                self.beat_index = 0;
                self.sub_index = 0;
            } else {
                self.beat_index =
                    (self.config.start_beat_index as usize) % self.config.time_sig_top as usize;
                self.sub_index = self
                    .config
                    .start_sub_index
                    .min(self.steps_per_beat().saturating_sub(1) as u8)
                    as usize;
            }
            // Use a small offset so the first beat fires in the first render
            // buffer rather than at stream-start sample 0.
            if self.config.start_delay_ms == 0.0 && self.count_in_remaining == 0 {
                self.next_event_sample = 1.0;
                self.start_sample = 1.0;
            } else {
                self.next_event_sample = 0.0;
                self.start_sample = 0.0;
            }
        }
        if reset_pending {
            self.pending_note_offs.clear();
            self.pending_blips.clear();
            self.pending_drum_hits.clear();
            self.pending_tocks.clear();
        }
        self.pending_restart = None;
    }

    pub(crate) fn stop(&mut self) {
        self.running = false;
        self.count_in_remaining = self.config.count_in_value();
        self.pending_note_offs.clear();
        self.pending_blips.clear();
        self.pending_drum_hits.clear();
        self.pending_tocks.clear();
        self.pending_restart = None;
        self.position_samples = 0.0;
        self.schedule_position_samples = 0.0;
        self.next_event_sample = 0.0;
        self.beat_index = 0;
        self.sub_index = 0;
        self.start_sample = 0.0;
        self.total_steps = 0;
    }

    pub(crate) fn schedule_restart(&mut self, sample_rate: f64) {
        let delay_samples = (self.config.start_delay_ms as f64 / 1000.0) * sample_rate;
        let (beat_index, sub_index, schedule_offset_samples) = if self.schedule_enabled() {
            (0, 0, Some(self.schedule_offset_samples(sample_rate)))
        } else if self.config.count_in_value() > 0 {
            (0, 0, None)
        } else {
            (
                (self.config.start_beat_index as usize) % self.config.time_sig_top.max(1) as usize,
                self.config
                    .start_sub_index
                    .min(self.steps_per_beat().saturating_sub(1) as u8) as usize,
                None,
            )
        };
        self.pending_restart = Some(MetronomeRestart {
            beat_index,
            sub_index,
            start_delay_samples: delay_samples,
            schedule_offset_samples,
        });
        self.pending_note_offs.clear();
        self.pending_blips.clear();
        self.pending_drum_hits.clear();
        self.pending_tocks.clear();
    }

    pub(crate) fn schedule_enabled(&self) -> bool {
        self.config.schedule_loop_ms.is_some() && !self.config.schedule.is_empty()
    }

    pub(crate) fn schedule_offset_samples(&self, sample_rate: f64) -> f64 {
        (self.config.schedule_start_offset_ms.max(0.0) / 1000.0) * sample_rate
    }

    pub(crate) fn steps_per_beat(&self) -> usize {
        if self.config.subdivisions_enabled {
            self.config.subdivisions_value.max(1) as usize
        } else {
            1
        }
    }

    pub(crate) fn beat_samples(&self, sample_rate: f64) -> f64 {
        let bpm = f64::from(self.config.bpm.max(1.0));
        let beat_unit = 4.0 / f64::from(self.config.time_sig_bottom.max(1));
        (60.0 / bpm) * beat_unit * sample_rate
    }

    pub(crate) fn step_samples(&self, sample_rate: f64) -> f64 {
        self.beat_samples(sample_rate) / self.steps_per_beat() as f64
    }

    pub(crate) fn beat_state_for_event(&self) -> MetronomeBeatState {
        if self.count_in_remaining > 0 {
            if self.sub_index == 0 {
                if self.beat_index == 0 {
                    return MetronomeBeatState::Accent;
                }
                return MetronomeBeatState::Normal;
            }
            return MetronomeBeatState::Low;
        }
        if self.sub_index > 0 {
            return MetronomeBeatState::Low;
        }
        self.config
            .beat_states
            .get(self.beat_index)
            .copied()
            .unwrap_or(MetronomeBeatState::Normal)
    }

    pub(crate) fn advance_step(&mut self) {
        self.total_steps += 1;
        let steps = self.steps_per_beat();
        if self.sub_index + 1 >= steps {
            self.sub_index = 0;
            self.beat_index += 1;
            if self.beat_index >= self.config.time_sig_top as usize {
                self.beat_index = 0;
                if self.count_in_remaining > 0 {
                    self.count_in_remaining = self.count_in_remaining.saturating_sub(1);
                }
            }
        } else {
            self.sub_index += 1;
        }
    }

    pub(crate) fn total_steps_elapsed(&self) -> u64 {
        self.total_steps
    }

    pub(crate) fn resync_to_position(&mut self, position_samples: f64, sample_rate: f64) {
        if !self.running {
            return;
        }
        let step_samples = self.step_samples(sample_rate);
        if step_samples <= 0.0 {
            return;
        }
        let steps_per_beat = self.steps_per_beat();
        let beats_per_bar = self.config.time_sig_top.max(1) as usize;
        let steps_per_bar = steps_per_beat * beats_per_bar;
        let elapsed_steps = ((position_samples - self.start_sample) / step_samples)
            .floor()
            .max(0.0) as u64;
        let bar_step = (elapsed_steps as usize) % steps_per_bar;
        self.beat_index = bar_step / steps_per_beat;
        self.sub_index = bar_step % steps_per_beat;
        self.total_steps = elapsed_steps;
        self.next_event_sample = self.start_sample + ((elapsed_steps + 1) as f64) * step_samples;
    }
}

impl Default for MetronomeConfig {
    fn default() -> Self {
        Self {
            bpm: 60.0,
            time_sig_top: 4,
            time_sig_bottom: 4,
            volume: 80,
            beat_states: vec![
                MetronomeBeatState::Accent,
                MetronomeBeatState::Normal,
                MetronomeBeatState::Normal,
                MetronomeBeatState::Normal,
            ],
            subdivisions_enabled: false,
            subdivisions_value: 2,
            sound_mode: MetronomeSoundMode::Tock,
            count_in_bars: Vec::new(),
            count_in_enabled: false,
            start_beat_index: 0,
            start_sub_index: 0,
            start_delay_ms: 0.0,
            schedule: Vec::new(),
            schedule_loop_ms: None,
            schedule_start_offset_ms: 0.0,
        }
    }
}

impl MetronomeConfig {
    pub(crate) fn count_in_value(&self) -> u8 {
        if !self.count_in_enabled {
            return 0;
        }
        self.count_in_bars
            .iter()
            .copied()
            .filter(|value| *value > 0)
            .min()
            .unwrap_or(0)
    }
}

impl From<MetronomeConfigPayload> for MetronomeConfig {
    fn from(value: MetronomeConfigPayload) -> Self {
        let bpm = if value.bpm.is_finite() && value.bpm > 0.0 {
            value.bpm
        } else {
            60.0
        };
        let time_sig_top = value.time_sig_top.clamp(1, 32);
        let time_sig_bottom = match value.time_sig_bottom {
            1 | 2 | 4 | 8 | 16 | 32 => value.time_sig_bottom,
            _ => 4,
        };
        let beat_states = if value.beat_states.is_empty() {
            let mut defaults = vec![MetronomeBeatState::Normal; time_sig_top as usize];
            if let Some(first) = defaults.first_mut() {
                *first = MetronomeBeatState::Accent;
            }
            defaults
        } else {
            value
                .beat_states
                .into_iter()
                .map(|state| match state {
                    MetronomeBeatStatePayload::Accent => MetronomeBeatState::Accent,
                    MetronomeBeatStatePayload::Normal => MetronomeBeatState::Normal,
                    MetronomeBeatStatePayload::Low => MetronomeBeatState::Low,
                    MetronomeBeatStatePayload::Mute => MetronomeBeatState::Mute,
                })
                .collect()
        };
        let sound_mode = match value.sound_mode {
            MetronomeSoundModePayload::Blip => MetronomeSoundMode::Blip,
            MetronomeSoundModePayload::DrumKit => MetronomeSoundMode::DrumKit,
            MetronomeSoundModePayload::Tock => MetronomeSoundMode::Tock,
            MetronomeSoundModePayload::Hype => MetronomeSoundMode::Hype,
            MetronomeSoundModePayload::MetalKit => MetronomeSoundMode::MetalKit,
            MetronomeSoundModePayload::RideKit => MetronomeSoundMode::RideKit,
        };
        let schedule_loop_ms = value.schedule_loop_ms.and_then(|value| {
            if value.is_finite() && value > 0.0 {
                Some(value)
            } else {
                None
            }
        });
        let schedule = if let Some(loop_ms) = schedule_loop_ms {
            value
                .schedule
                .into_iter()
                .filter_map(|event| {
                    if !event.offset_ms.is_finite() || event.offset_ms < 0.0 {
                        return None;
                    }
                    if event.offset_ms >= loop_ms {
                        return None;
                    }
                    let kind = match event.kind {
                        MetronomeBeatStatePayload::Accent => MetronomeBeatState::Accent,
                        MetronomeBeatStatePayload::Normal => MetronomeBeatState::Normal,
                        MetronomeBeatStatePayload::Low => MetronomeBeatState::Low,
                        MetronomeBeatStatePayload::Mute => MetronomeBeatState::Mute,
                    };
                    Some(MetronomeScheduledEvent {
                        offset_ms: event.offset_ms as f64,
                        kind,
                    })
                })
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        let mut schedule_start_offset_ms = value.schedule_start_offset_ms.unwrap_or(0.0);
        if let Some(loop_ms) = schedule_loop_ms {
            if !schedule_start_offset_ms.is_finite() {
                schedule_start_offset_ms = 0.0;
            }
            if schedule_start_offset_ms >= loop_ms {
                schedule_start_offset_ms %= loop_ms;
            }
        } else {
            schedule_start_offset_ms = 0.0;
        }
        let mut normalized = MetronomeConfig {
            bpm,
            time_sig_top,
            time_sig_bottom,
            volume: value.volume.min(100),
            beat_states,
            subdivisions_enabled: value.subdivisions_enabled,
            subdivisions_value: value.subdivisions_value.max(1),
            sound_mode,
            count_in_bars: value.count_in_bars,
            count_in_enabled: value.count_in_enabled,
            start_beat_index: value.start_beat_index,
            start_sub_index: value.start_sub_index,
            start_delay_ms: value.start_delay_ms,
            schedule,
            schedule_loop_ms: schedule_loop_ms.map(f64::from),
            schedule_start_offset_ms: schedule_start_offset_ms as f64,
        };
        if normalized.beat_states.len() < normalized.time_sig_top as usize {
            normalized.beat_states.extend(std::iter::repeat_n(
                MetronomeBeatState::Normal,
                normalized.time_sig_top as usize - normalized.beat_states.len(),
            ));
        }
        normalized
            .beat_states
            .truncate(normalized.time_sig_top as usize);
        if normalized.beat_states.is_empty() {
            normalized
                .beat_states
                .resize(normalized.time_sig_top as usize, MetronomeBeatState::Normal);
        }
        normalized.schedule.sort_by(|a, b| {
            a.offset_ms
                .partial_cmp(&b.offset_ms)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        normalized
    }
}
