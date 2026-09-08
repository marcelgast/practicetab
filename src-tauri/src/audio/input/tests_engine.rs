//! Engine lifecycle tests construct a real `InputEngine`, which probes the
//! cpal host for devices — on some driver setups this blocks. They are
//! `#[ignore]`d and run explicitly via `cargo test -- --ignored`. Pure
//! buffer-size negotiation is tested below without touching cpal state.

use std::sync::Arc;

use super::bridge::AudioInputBridge;
use super::engine::{
    negotiate_buffer_size, pick_best_config_range, push_mono, rank_config_candidate, InputEngine,
};
use super::ring::spsc;
use super::types::{DEFAULT_INPUT_BUFFER_FRAMES, INPUT_RING_CAPACITY};
use cpal::{SampleFormat, SampleRate, SupportedBufferSize, SupportedStreamConfigRange};

fn make_engine() -> InputEngine {
    InputEngine::new(Arc::new(AudioInputBridge::new()))
}

#[test]
#[ignore = "constructs real cpal InputEngine"]
fn new_engine_reports_stopped_status() {
    let engine = make_engine();
    let status = engine.status();
    assert!(!status.running);
    assert_eq!(status.sample_rate, 0);
    assert_eq!(status.channels, 0);
}

#[test]
#[ignore = "constructs real cpal InputEngine"]
fn set_device_while_stopped_only_records_preference() {
    let mut engine = make_engine();
    assert!(engine
        .set_device(Some("non-existent|fake|0".into()))
        .is_ok());
    assert_eq!(
        engine.selected_device().as_deref(),
        Some("non-existent|fake|0")
    );
    assert!(!engine.status().running);
}

#[test]
#[ignore = "constructs real cpal InputEngine"]
fn set_device_none_clears_preference() {
    let mut engine = make_engine();
    engine
        .set_device(Some("pref|mic|0".into()))
        .expect("set_device failed");
    engine.set_device(None).expect("clear failed");
    assert!(engine.selected_device().is_none());
}

#[test]
#[ignore = "constructs real cpal InputEngine"]
fn stop_when_not_running_is_idempotent() {
    let mut engine = make_engine();
    assert!(engine.stop().is_ok());
    assert!(engine.stop().is_ok());
    assert!(!engine.status().running);
}

#[test]
#[ignore = "constructs real cpal InputEngine"]
fn list_devices_returns_cached_then_refreshed() {
    let mut engine = make_engine();
    let first = engine.list_devices();
    let refreshed = engine.refresh_devices();
    assert_eq!(first.len(), refreshed.len());
}

// ── Pure-logic tests (no hardware) ───────────────────────────────────────

#[test]
fn negotiate_buffer_prefers_default_when_in_range() {
    let chosen = negotiate_buffer_size(cpal::SupportedBufferSize::Range { min: 64, max: 1024 });
    match chosen {
        cpal::BufferSize::Fixed(frames) => assert_eq!(frames, DEFAULT_INPUT_BUFFER_FRAMES),
        other => panic!("expected Fixed, got {other:?}"),
    }
}

#[test]
fn negotiate_buffer_clamps_up_when_default_below_min() {
    let chosen = negotiate_buffer_size(cpal::SupportedBufferSize::Range {
        min: 512,
        max: 2048,
    });
    match chosen {
        cpal::BufferSize::Fixed(frames) => assert_eq!(frames, 512),
        other => panic!("expected Fixed, got {other:?}"),
    }
}

#[test]
fn negotiate_buffer_clamps_down_when_default_above_max() {
    let chosen = negotiate_buffer_size(cpal::SupportedBufferSize::Range { min: 16, max: 64 });
    match chosen {
        cpal::BufferSize::Fixed(frames) => assert_eq!(frames, 64),
        other => panic!("expected Fixed, got {other:?}"),
    }
}

#[test]
fn negotiate_buffer_falls_back_to_default_when_unknown() {
    let chosen = negotiate_buffer_size(cpal::SupportedBufferSize::Unknown);
    assert!(matches!(chosen, cpal::BufferSize::Default));
}

/// Pull every sample the consumer side currently holds into a Vec so
/// tests can assert on the ring contents without the cpal machinery.
fn drain_ring(consumer: super::ring::RingConsumer) -> Vec<f32> {
    let mut out = Vec::new();
    let mut buf = [0.0_f32; 64];
    loop {
        let n = consumer.pop_slice(&mut buf);
        if n == 0 {
            return out;
        }
        out.extend_from_slice(&buf[..n]);
    }
}

#[test]
fn push_mono_mono_stream_passes_samples_through_unchanged() {
    let (producer, consumer) = spsc(INPUT_RING_CAPACITY);
    let samples = [0.1_f32, 0.2, -0.3, 0.4];
    push_mono(&producer, &samples, 1, None);
    assert_eq!(drain_ring(consumer), samples);
}

#[test]
fn push_mono_stereo_mixdown_averages_channels() {
    let (producer, consumer) = spsc(INPUT_RING_CAPACITY);
    // Two frames of stereo: L=0.4/R=0.0, L=-0.2/R=0.6.
    let samples = [0.4_f32, 0.0, -0.2, 0.6];
    push_mono(&producer, &samples, 2, None);
    let drained = drain_ring(consumer);
    assert_eq!(drained.len(), 2);
    assert!((drained[0] - 0.2).abs() < 1e-6);
    assert!((drained[1] - 0.2).abs() < 1e-6);
}

#[test]
fn push_mono_picks_selected_channel_and_ignores_others() {
    let (producer, consumer) = spsc(INPUT_RING_CAPACITY);
    // 4-channel interleaved, two frames. Guitar on channel 2 (0-indexed).
    let samples = [
        0.0_f32, 0.0, 0.9, 0.0, // frame 0: ch2 = 0.9
        0.0, 0.0, -0.5, 0.0, // frame 1: ch2 = -0.5
    ];
    push_mono(&producer, &samples, 4, Some(2));
    let drained = drain_ring(consumer);
    assert_eq!(drained, vec![0.9, -0.5]);
}

#[test]
fn push_mono_clamps_out_of_range_channel_to_last() {
    let (producer, consumer) = spsc(INPUT_RING_CAPACITY);
    // Stereo, but test asks for channel 5 — must clamp to ch 1 (last).
    let samples = [0.0_f32, 0.7, 0.0, -0.3];
    push_mono(&producer, &samples, 2, Some(5));
    let drained = drain_ring(consumer);
    assert_eq!(drained, vec![0.7, -0.3]);
}

// ── Config-range ranker (pure logic, no hardware) ───────────────────────

fn make_range(
    channels: u16,
    min_sr: u32,
    max_sr: u32,
    format: SampleFormat,
) -> SupportedStreamConfigRange {
    SupportedStreamConfigRange::new(
        channels,
        SampleRate(min_sr),
        SampleRate(max_sr),
        SupportedBufferSize::Unknown,
        format,
    )
}

#[test]
fn rank_prefers_matching_format_over_sample_rate() {
    // Same SR range but different formats: format match wins.
    let a = make_range(2, 44_100, 48_000, SampleFormat::F32);
    let b = make_range(2, 44_100, 48_000, SampleFormat::I16);
    let score_a = rank_config_candidate(&a, SampleFormat::F32, SampleRate(48_000));
    let score_b = rank_config_candidate(&b, SampleFormat::F32, SampleRate(48_000));
    assert!(score_a > score_b);
}

#[test]
fn rank_prefers_matching_sample_rate_when_formats_tie() {
    let a = make_range(2, 48_000, 48_000, SampleFormat::F32);
    let b = make_range(2, 8_000, 16_000, SampleFormat::F32);
    let score_a = rank_config_candidate(&a, SampleFormat::F32, SampleRate(48_000));
    let score_b = rank_config_candidate(&b, SampleFormat::F32, SampleRate(48_000));
    assert!(score_a > score_b);
}

#[test]
fn pick_best_breaks_ties_on_channel_count() {
    // Both match format + SR; the 18-channel one wins over the
    // 2-channel one. Mirrors the Scarlett 18i20 case where the
    // driver exposes both a bonded stereo profile and the full
    // multi-channel config — we want the multi-channel one.
    let two = make_range(2, 48_000, 48_000, SampleFormat::F32);
    let eighteen = make_range(18, 48_000, 48_000, SampleFormat::F32);
    let candidates = [&two, &eighteen];
    let best = pick_best_config_range(candidates, SampleFormat::F32, SampleRate(48_000))
        .expect("expected a winner");
    assert_eq!(best.channels(), 18);
}

#[test]
fn pick_best_returns_none_on_empty_candidates() {
    let empty: [&SupportedStreamConfigRange; 0] = [];
    assert!(pick_best_config_range(empty, SampleFormat::F32, SampleRate(48_000)).is_none());
}

#[test]
fn pick_best_prefers_format_match_even_at_lower_channel_count() {
    // A 4-channel I16 config vs. an 8-channel F32 config: format
    // match is worth more than raw channel count, because a format
    // mismatch forces the stream-build match to fall into a
    // different branch (i16/u16 → f32 conversion path). The ranker
    // must favour the F32 one.
    let i16_four = make_range(4, 48_000, 48_000, SampleFormat::I16);
    let f32_eight = make_range(8, 48_000, 48_000, SampleFormat::F32);
    let candidates = [&i16_four, &f32_eight];
    let best = pick_best_config_range(candidates, SampleFormat::F32, SampleRate(48_000))
        .expect("expected a winner");
    assert_eq!(best.channels(), 8);
    assert_eq!(best.sample_format(), SampleFormat::F32);
}

#[test]
#[ignore = "constructs real cpal InputEngine"]
fn set_channel_while_stopped_only_records_preference() {
    let mut engine = make_engine();
    assert!(engine.set_channel(Some(2)).is_ok());
    assert_eq!(engine.selected_channel(), Some(2));
    assert!(!engine.status().running);
}

#[test]
#[ignore = "constructs real cpal InputEngine"]
fn set_channel_none_clears_preference() {
    let mut engine = make_engine();
    engine.set_channel(Some(1)).expect("set_channel failed");
    engine.set_channel(None).expect("clear failed");
    assert!(engine.selected_channel().is_none());
}
