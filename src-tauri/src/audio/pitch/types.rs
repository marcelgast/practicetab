//! Public types emitted from the pitch detection engine.

use serde::{Deserialize, Serialize};

/// Single pitch observation emitted to the frontend via Tauri events.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchResult {
    /// Fundamental frequency in Hz. `0.0` when no pitch was detected
    /// (below power threshold or clarity gate).
    pub frequency: f32,
    /// MPM clarity score `[0.0, 1.0]`. Higher = more confident.
    pub clarity: f32,
    /// Linear RMS signal level of the analysis window.
    pub rms: f32,
    /// Nearest MIDI note number (0–127). `0` when `frequency == 0`.
    pub midi_note: u8,
    /// Concert-pitch note name, e.g. `"A4"`, `"E2"`. Empty when silent.
    pub note_name: String,
    /// Cent deviation from the nearest equal-tempered semitone,
    /// range `(-50.0, +50.0]`.
    pub cents_offset: f32,
    /// Monotonic timestamp in milliseconds since engine start.
    pub timestamp_ms: f64,
    /// `true` when this observation is the attack of a new note
    /// (clarity/rms jumped from below the gates).
    pub onset_detected: bool,
}

/// Analyzer configuration. Defaults match the numbers documented in the
/// DEVELOPMENT_PLAN for the v1.2.1 tuner.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchConfig {
    /// MPM analysis window in samples. `2048` ≈ 46 ms @ 44.1 kHz.
    pub window_size: usize,
    /// Hop between analyses in samples. `512` ≈ 11.6 ms @ 44.1 kHz.
    pub hop_size: usize,
    /// MPM clarity gate (`0.0`–`1.0`).
    pub clarity_threshold: f32,
    /// RMS gate (linear); roughly `-40 dB` = `0.01`.
    pub rms_threshold: f32,
}

impl Default for PitchConfig {
    fn default() -> Self {
        Self {
            // 8192 samples ≈ 186 ms @ 44.1 kHz. One shared window
            // for both tuner and live feedback — see the block
            // comment on `PitchConfig` for the full rationale.
            // Sized for heavily-detuned bass: McLeod autocorrelation
            // needs ≥ ~2.5 periods of the fundamental to lock in.
            // The floor is a bass tuned several semitones below B0
            // (e.g. F#0 / "F#-1" in Yamaha octave convention,
            // 23.12 Hz, period 43.25 ms) — 8192 samples fits ~4.3
            // periods comfortably, with headroom down to ~C0
            // (16 Hz, 3 periods).
            window_size: 8192,
            // Hop scaled with window to keep the analysis rate
            // roughly unchanged (~43 Hz). Smaller hops mean more
            // redundant work since each window overlaps its
            // predecessor.
            hop_size: 1024,
            // MPM clarity of 0.85 is fine for clean line-in instrument
            // tones but far too strict for voice or an internal laptop
            // mic, where the harmonic content is noisier. 0.6 still
            // rejects pure noise while letting realistic speaking /
            // singing voice clear the gate.
            clarity_threshold: 0.6,
            // ~ -60 dBFS. Low enough that a laptop internal mic at
            // normal distance can clear the gate when the user talks
            // or plays acoustically. MPM's clarity threshold is the
            // real noise filter.
            rms_threshold: 0.001,
        }
    }
}

// Background on the single-window choice (tuner + feedback share
// one analyzer config):
//
// A bigger window pushes onset timestamps later by roughly
// `window / sample_rate` because MPM can only report a confident
// pitch after the window is full of the note. Reviewer finding on
// PR #51 flagged that 8192 @ 44.1 kHz adds ~186 ms latency on top
// of hardware capture, which used to blow past the frontend
// `LatencyCompensator`'s 150 ms cap and its 8-sample warmup —
// biasing the first notes of a run "late".
//
// Two fixes landed together so the one-window approach stays
// timing-correct:
// 1. The feedback toggle starts the mic EAGERLY (on toggle click,
//    not on playback start), so the analyzer's buffer is warm by
//    the time the first note plays — no first-detection delay.
// 2. `LatencyCompensator` warms up after 3 samples (was 8), its
//    cap is 240 ms (was 150), and it accepts an initial
//    `estimatedLatencyMs` seed so the first notes land close to
//    calibrated instead of a full window late. See
//    `src/domain/noteComparison.ts`.
//
// Splitting tuner vs feedback configs was explored and rejected —
// it'd require swapping configs at runtime every time the modal
// opens/closes, and would re-introduce the "first 3 notes late
// after every switch" problem. One config keeps the analyzer's
// behaviour stable across the whole session.

/// Lower bound on the analysis window. Below this MPM cannot reliably
/// estimate any useful pitch (≈2.9 ms @ 44.1 kHz).
pub(crate) const MIN_WINDOW_SIZE: usize = 128;
/// Upper bound on the analysis window. ~371 ms @ 44.1 kHz — ample for
/// low-string guitar and keeps detector buffers bounded so malicious or
/// buggy callers can't push the worker into pathological allocations.
pub(crate) const MAX_WINDOW_SIZE: usize = 16_384;
/// Lower bound on the hop. `1` keeps semantics trivial and still enforces
/// non-zero progress per analysis.
pub(crate) const MIN_HOP_SIZE: usize = 1;

impl PitchConfig {
    /// Clamp every field into a range that the analyzer can actually
    /// handle. Called at the Tauri boundary so arbitrary frontend (or
    /// test) input can never drive `PitchAnalyzer::new` with a
    /// zero-sized window, an out-of-range threshold, or a hop larger
    /// than the window.
    pub fn normalized(self) -> Self {
        let window_size = self.window_size.clamp(MIN_WINDOW_SIZE, MAX_WINDOW_SIZE);
        let hop_size = self.hop_size.clamp(MIN_HOP_SIZE, window_size);
        let clarity_threshold = clamp_unit_interval(self.clarity_threshold);
        let rms_threshold = clamp_unit_interval(self.rms_threshold);
        Self {
            window_size,
            hop_size,
            clarity_threshold,
            rms_threshold,
        }
    }
}

fn clamp_unit_interval(value: f32) -> f32 {
    if !value.is_finite() {
        return 0.0;
    }
    value.clamp(0.0, 1.0)
}

impl PitchResult {
    pub(crate) fn silent(timestamp_ms: f64) -> Self {
        Self {
            frequency: 0.0,
            clarity: 0.0,
            rms: 0.0,
            midi_note: 0,
            note_name: String::new(),
            cents_offset: 0.0,
            timestamp_ms,
            onset_detected: false,
        }
    }
}
