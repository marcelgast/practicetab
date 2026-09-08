//! Rolling-window pitch analyzer. Buffers incoming mono audio, runs the
//! McLeod Pitch Method every `hop_size` samples, applies RMS + clarity
//! gates, performs simple onset detection, and returns `PitchResult`s ready
//! to emit. All logic is pure: no cpal / Tauri / threading — so the full
//! pipeline is unit-testable with synthetic sine waves.

use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector;

use super::note::frequency_to_note;
use super::types::{PitchConfig, PitchResult};

/// How much of the previous window's clarity has to be "under" the gate
/// before we flag the next confident reading as an onset. Prevents a steady
/// sustained note from re-triggering every hop.
const ONSET_RESET_CLARITY: f32 = 0.50;

pub(crate) struct PitchAnalyzer {
    config: PitchConfig,
    sample_rate: u32,
    window: Vec<f32>,
    detector: McLeodDetector<f32>,
    samples_since_last_analysis: usize,
    last_clarity: f32,
    start_instant_ms: f64,
}

impl PitchAnalyzer {
    pub(crate) fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub(crate) fn config(&self) -> PitchConfig {
        self.config
    }

    pub(crate) fn new(config: PitchConfig, sample_rate: u32, start_instant_ms: f64) -> Self {
        let detector = McLeodDetector::<f32>::new(config.window_size, config.window_size / 2);
        Self {
            config,
            sample_rate,
            window: Vec::with_capacity(config.window_size),
            detector,
            samples_since_last_analysis: 0,
            last_clarity: 0.0,
            start_instant_ms,
        }
    }

    /// Push new samples and return `Some(result)` when a hop crossed a
    /// new analysis boundary.
    pub(crate) fn push_samples(&mut self, fresh: &[f32], now_ms: f64) -> Option<PitchResult> {
        if fresh.is_empty() {
            return None;
        }
        self.window.extend_from_slice(fresh);
        let ws = self.config.window_size;
        if self.window.len() > ws {
            let overflow = self.window.len() - ws;
            self.window.drain(0..overflow);
        }
        self.samples_since_last_analysis =
            self.samples_since_last_analysis.saturating_add(fresh.len());
        if self.window.len() < ws || self.samples_since_last_analysis < self.config.hop_size {
            return None;
        }
        self.samples_since_last_analysis = 0;
        Some(self.analyze_window(now_ms))
    }

    fn analyze_window(&mut self, now_ms: f64) -> PitchResult {
        let rms = compute_rms(&self.window);
        let timestamp_ms = now_ms - self.start_instant_ms;
        if rms < self.config.rms_threshold {
            self.last_clarity = 0.0;
            // Report the actual RMS even when the gate rejects the
            // window — without this the frontend cannot distinguish
            // "no audio at all" (mic permission denied, wrong device)
            // from "audio present but too quiet" (gain too low).
            return PitchResult {
                rms,
                timestamp_ms,
                ..PitchResult::silent(timestamp_ms)
            };
        }
        // Power threshold passed to MPM; keep permissive since we already
        // RMS-gated. The crate expects raw signal power (sum of squares).
        let power_threshold =
            (self.config.rms_threshold * self.config.rms_threshold) * self.window.len() as f32;
        let pitch = self.detector.get_pitch(
            &self.window,
            self.sample_rate as usize,
            power_threshold,
            self.config.clarity_threshold,
        );
        let Some(pitch) = pitch else {
            self.last_clarity = 0.0;
            return PitchResult {
                rms,
                timestamp_ms,
                ..PitchResult::silent(timestamp_ms)
            };
        };
        let onset_detected = self.last_clarity < ONSET_RESET_CLARITY;
        self.last_clarity = pitch.clarity;
        let (midi_note, note_name, cents_offset) = frequency_to_note(pitch.frequency);
        PitchResult {
            frequency: pitch.frequency,
            clarity: pitch.clarity,
            rms,
            midi_note,
            note_name,
            cents_offset,
            timestamp_ms,
            onset_detected,
        }
    }
}

fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}
