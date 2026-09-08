//! Pure pipeline tests for `PitchAnalyzer`. No cpal / threading / Tauri —
//! synthetic sine waves drive the analyzer directly.

use super::analyzer::PitchAnalyzer;
use super::types::PitchConfig;

const SAMPLE_RATE: u32 = 44_100;

fn sine(freq: f32, samples: usize, amplitude: f32) -> Vec<f32> {
    let dt = 1.0 / SAMPLE_RATE as f32;
    (0..samples)
        .map(|i| amplitude * (2.0 * std::f32::consts::PI * freq * i as f32 * dt).sin())
        .collect()
}

fn config() -> PitchConfig {
    PitchConfig::default()
}

#[test]
fn sine_440_is_detected_as_a4() {
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    // Two full windows of audio so the analyzer sees a full window plus a
    // hop and runs at least one analysis.
    let signal = sine(440.0, cfg.window_size * 2, 0.5);
    let mut last = None;
    // Push in hop-sized chunks to mimic the live worker.
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 100.0) {
            last = Some(result);
        }
    }
    let result = last.expect("analyzer should emit at least one result");
    assert_eq!(
        result.midi_note, 69,
        "expected A4, got {}",
        result.note_name
    );
    assert_eq!(result.note_name, "A4");
    assert!(result.clarity > 0.85, "clarity = {}", result.clarity);
    assert!(
        result.cents_offset.abs() < 5.0,
        "cents_offset = {}",
        result.cents_offset
    );
    assert!((result.frequency - 440.0).abs() < 2.0);
}

#[test]
fn sine_82_hz_is_detected_as_e2() {
    // Low E2 (open low string on guitar / 4-string bass). Default
    // 8192-sample window fits E2's 12 ms period ~15 times.
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let signal = sine(82.4069, cfg.window_size * 2, 0.5);
    let mut last = None;
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 50.0) {
            last = Some(result);
        }
    }
    let result = last.expect("analyzer should emit at least one result");
    assert_eq!(result.midi_note, 40);
    assert_eq!(result.note_name, "E2");
}

#[test]
fn sine_41_hz_is_detected_as_e1() {
    // Low E1: open low string on a 4-string bass (41.2 Hz, period
    // 24.3 ms). Default 8192-sample window fits ~7.7 periods —
    // comfortably above MPM's ~2.5-period minimum.
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let signal = sine(41.2034, cfg.window_size * 2, 0.5);
    let mut last = None;
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 50.0) {
            last = Some(result);
        }
    }
    let result = last.expect("analyzer should emit at least one result");
    assert_eq!(
        result.midi_note, 28,
        "expected E1 (MIDI 28), got {}",
        result.note_name
    );
    assert_eq!(result.note_name, "E1");
    assert!(result.clarity > 0.6, "clarity = {}", result.clarity);
}

#[test]
fn sine_31_hz_is_detected_as_b0() {
    // B0: open low string on a 5-string bass (30.87 Hz, period
    // 32.4 ms). Default 8192-sample window fits ~5.7 periods.
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let signal = sine(30.8677, cfg.window_size * 2, 0.5);
    let mut last = None;
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 50.0) {
            last = Some(result);
        }
    }
    let result = last.expect("analyzer should emit at least one result");
    assert_eq!(
        result.midi_note, 23,
        "expected B0 (MIDI 23), got {}",
        result.note_name
    );
    assert_eq!(result.note_name, "B0");
}

#[test]
fn sine_23_hz_is_detected_as_f_sharp_0() {
    // F#0 = 23.12 Hz, period 43.25 ms. Represents a 5-string bass
    // detuned ~5 semitones below B0 (user request: "tune my bass
    // down 5 semitones to F#-1" in Yamaha octave convention).
    // Default 8192 window fits ~4.3 periods.
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let signal = sine(23.1247, cfg.window_size * 2, 0.5);
    let mut last = None;
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 50.0) {
            last = Some(result);
        }
    }
    let result = last.expect("analyzer should emit at least one result");
    assert_eq!(
        result.midi_note, 18,
        "expected F#0 (MIDI 18), got {}",
        result.note_name
    );
    assert_eq!(result.note_name, "F#0");
}

#[test]
fn silence_emits_silent_result() {
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let silent = vec![0.0_f32; cfg.window_size * 2];
    let mut last = None;
    for chunk in silent.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 0.0) {
            last = Some(result);
        }
    }
    let result = last.expect("analyzer should still tick on silence");
    assert_eq!(result.frequency, 0.0);
    assert_eq!(result.midi_note, 0);
    assert!(result.note_name.is_empty());
    assert!(!result.onset_detected);
}

#[test]
fn first_confident_reading_flags_onset() {
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let signal = sine(329.6276, cfg.window_size * 2, 0.5); // E4
    let mut first_valid = None;
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 0.0) {
            if result.frequency > 0.0 && first_valid.is_none() {
                first_valid = Some(result);
            }
        }
    }
    let result = first_valid.expect("expected at least one pitched result");
    assert!(
        result.onset_detected,
        "first confident reading must be onset"
    );
}

#[test]
fn sustained_note_does_not_retrigger_onset() {
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let signal = sine(329.6276, cfg.window_size * 4, 0.5);
    let mut results = Vec::new();
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 0.0) {
            results.push(result);
        }
    }
    let pitched: Vec<_> = results.into_iter().filter(|r| r.frequency > 0.0).collect();
    assert!(pitched.len() >= 2, "expected multiple pitched results");
    let onsets = pitched.iter().filter(|r| r.onset_detected).count();
    assert_eq!(onsets, 1, "sustained note should only flag one onset");
}

#[test]
fn sub_threshold_signal_reports_actual_rms() {
    // A very quiet sine — well below the default RMS gate. The analyzer
    // must still pass the measured RMS through so the frontend can
    // distinguish "mic delivers nothing" from "mic delivers something
    // too quiet to analyse".
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 0.0);
    let signal = sine(440.0, cfg.window_size * 2, 0.0005);
    let mut last = None;
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 0.0) {
            last = Some(result);
        }
    }
    let result = last.expect("analyzer should still tick on quiet input");
    assert!(
        result.rms > 0.0,
        "rms should be reported, got {}",
        result.rms
    );
    assert!(result.rms < cfg.rms_threshold, "rms should be below gate");
    assert_eq!(result.frequency, 0.0, "gated window emits silent frequency");
    assert!(result.note_name.is_empty());
}

#[test]
fn timestamp_is_relative_to_start_instant() {
    let cfg = config();
    let mut analyzer = PitchAnalyzer::new(cfg, SAMPLE_RATE, 1_000.0);
    let signal = sine(440.0, cfg.window_size * 2, 0.5);
    let mut last_ts = None;
    for chunk in signal.chunks(cfg.hop_size) {
        if let Some(result) = analyzer.push_samples(chunk, 1_050.0) {
            last_ts = Some(result.timestamp_ms);
        }
    }
    assert_eq!(last_ts, Some(50.0));
}
