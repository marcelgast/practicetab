//! Regression tests for the boundary validation on `PitchConfig`. These
//! are pure (no cpal / Tauri) and lock in the behaviour that analyzer
//! inputs can never hit `PitchAnalyzer::new` with a zero window, a hop
//! larger than the window, or an out-of-range / NaN threshold.

use super::types::{PitchConfig, MAX_WINDOW_SIZE, MIN_HOP_SIZE, MIN_WINDOW_SIZE};

#[test]
fn default_config_is_already_normalized() {
    let cfg = PitchConfig::default();
    assert_eq!(cfg.normalized(), cfg);
}

#[test]
fn zero_window_clamps_to_min_window() {
    let cfg = PitchConfig {
        window_size: 0,
        hop_size: 0,
        clarity_threshold: 0.85,
        rms_threshold: 0.01,
    }
    .normalized();
    assert_eq!(cfg.window_size, MIN_WINDOW_SIZE);
    assert_eq!(cfg.hop_size, MIN_HOP_SIZE);
}

#[test]
fn huge_window_clamps_to_max_window() {
    let cfg = PitchConfig {
        window_size: 10_000_000,
        hop_size: 10_000_000,
        clarity_threshold: 0.5,
        rms_threshold: 0.5,
    }
    .normalized();
    assert_eq!(cfg.window_size, MAX_WINDOW_SIZE);
    assert_eq!(cfg.hop_size, MAX_WINDOW_SIZE);
}

#[test]
fn hop_larger_than_window_is_clamped_to_window() {
    let cfg = PitchConfig {
        window_size: 2048,
        hop_size: 8192,
        clarity_threshold: 0.8,
        rms_threshold: 0.01,
    }
    .normalized();
    assert_eq!(cfg.window_size, 2048);
    assert_eq!(cfg.hop_size, 2048);
}

#[test]
fn thresholds_are_clamped_to_unit_interval() {
    let cfg = PitchConfig {
        window_size: 2048,
        hop_size: 512,
        clarity_threshold: 7.5,
        rms_threshold: -1.0,
    }
    .normalized();
    assert_eq!(cfg.clarity_threshold, 1.0);
    assert_eq!(cfg.rms_threshold, 0.0);
}

#[test]
fn non_finite_thresholds_become_zero() {
    let cfg = PitchConfig {
        window_size: 2048,
        hop_size: 512,
        clarity_threshold: f32::NAN,
        rms_threshold: f32::INFINITY,
    }
    .normalized();
    assert_eq!(cfg.clarity_threshold, 0.0);
    assert_eq!(cfg.rms_threshold, 0.0);
}

#[test]
fn normalizing_twice_is_idempotent() {
    let raw = PitchConfig {
        window_size: 0,
        hop_size: 99_999,
        clarity_threshold: f32::NAN,
        rms_threshold: 2.0,
    };
    let once = raw.normalized();
    let twice = once.normalized();
    assert_eq!(once, twice);
}
