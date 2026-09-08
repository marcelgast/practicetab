use super::metronome::MetronomeConfig;
use super::metronome::MetronomeState;
use super::metronome_samples::{render_matched_sample_buffer, rms_non_silent};
use super::synthesis::EngineRuntime;
use super::types::*;

#[test]
fn metronome_bus_limiter_caps_linked_peak() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44_100.0;
    let mut left = 0.0f32;
    let mut right = 0.0f32;
    for _ in 0..4096 {
        (left, right) = runtime.apply_metronome_bus_limiter(0.9, -0.6);
    }
    assert!(left.abs() <= METRONOME_BUS_LIMITER_CEILING + 1.0e-4);
    assert!(right.abs() <= METRONOME_BUS_LIMITER_CEILING + 1.0e-4);
}

#[test]
fn metronome_step_samples_respects_subdivision() {
    let mut state = MetronomeState::new();
    state.set_config(MetronomeConfig {
        bpm: 60.0,
        time_sig_bottom: 4,
        subdivisions_enabled: true,
        subdivisions_value: 4,
        ..Default::default()
    });
    let step = state.step_samples(1000.0);
    assert!((step - 250.0).abs() < 0.001);
}

#[test]
fn metronome_count_in_duration_matches_bars() {
    let mut state = MetronomeState::new();
    state.set_config(MetronomeConfig {
        bpm: 120.0,
        time_sig_top: 3,
        time_sig_bottom: 4,
        count_in_bars: vec![2],
        ..Default::default()
    });
    let beat_samples = state.beat_samples(1000.0);
    let total = beat_samples * 6.0;
    assert!((total - 3000.0).abs() < 0.001);
}

#[test]
fn metronome_beat_samples_respects_denominator() {
    let mut state = MetronomeState::new();
    state.set_config(MetronomeConfig {
        bpm: 60.0,
        time_sig_top: 4,
        time_sig_bottom: 8,
        ..Default::default()
    });
    let beat_samples = state.beat_samples(1000.0);
    assert!((beat_samples - 500.0).abs() < 0.001);
    let bar_samples = beat_samples * 4.0;
    assert!((bar_samples - 2000.0).abs() < 0.001);
}

#[test]
fn metronome_count_in_respects_enabled_flag() {
    let mut config = MetronomeConfig {
        count_in_bars: vec![2],
        count_in_enabled: false,
        ..Default::default()
    };
    assert_eq!(config.count_in_value(), 0);
    config.count_in_enabled = true;
    assert_eq!(config.count_in_value(), 2);
}

#[test]
fn metronome_steps_per_beat_defaults() {
    let state = MetronomeState::new();
    assert_eq!(state.steps_per_beat(), 1);
}

#[test]
fn metronome_preserves_low_accent_on_first_beat() {
    let payload = MetronomeConfigPayload {
        bpm: 60.0,
        time_sig_top: 4,
        time_sig_bottom: 4,
        volume: 80,
        beat_states: vec![
            MetronomeBeatStatePayload::Low,
            MetronomeBeatStatePayload::Normal,
            MetronomeBeatStatePayload::Normal,
            MetronomeBeatStatePayload::Normal,
        ],
        subdivisions_enabled: false,
        subdivisions_value: 1,
        sound_mode: MetronomeSoundModePayload::Blip,
        count_in_bars: Vec::new(),
        count_in_enabled: false,
        start_beat_index: 0,
        start_sub_index: 0,
        start_delay_ms: 0.0,
        schedule: Vec::new(),
        schedule_loop_ms: None,
        schedule_start_offset_ms: None,
    };
    let config = MetronomeConfig::from(payload);
    assert!(matches!(config.beat_states[0], MetronomeBeatState::Low));
}

#[test]
fn metronome_sound_modes_use_same_output_gain_curve() {
    let base = metronome_output_gain(MetronomeSoundMode::Blip, 80);
    let drum = metronome_output_gain(MetronomeSoundMode::DrumKit, 80);
    let hype = metronome_output_gain(MetronomeSoundMode::Hype, 80);
    let metal = metronome_output_gain(MetronomeSoundMode::MetalKit, 80);
    let ride = metronome_output_gain(MetronomeSoundMode::RideKit, 80);
    assert!((drum - base).abs() < 1e-6);
    assert!((hype - base).abs() < 1e-6);
    assert!((metal - base).abs() < 1e-6);
    assert!((ride - base).abs() < 1e-6);
}

#[test]
fn metronome_default_sound_mode_is_tock() {
    let config = MetronomeConfig::default();
    assert!(matches!(config.sound_mode, MetronomeSoundMode::Tock));
}

#[test]
fn metronome_config_payload_accepts_tock_mode() {
    let payload = MetronomeConfigPayload {
        bpm: 120.0,
        time_sig_top: 4,
        time_sig_bottom: 4,
        volume: 80,
        beat_states: vec![
            MetronomeBeatStatePayload::Accent,
            MetronomeBeatStatePayload::Normal,
            MetronomeBeatStatePayload::Normal,
            MetronomeBeatStatePayload::Normal,
        ],
        subdivisions_enabled: true,
        subdivisions_value: 2,
        sound_mode: MetronomeSoundModePayload::Tock,
        count_in_bars: Vec::new(),
        count_in_enabled: false,
        start_beat_index: 0,
        start_sub_index: 0,
        start_delay_ms: 0.0,
        schedule: Vec::new(),
        schedule_loop_ms: None,
        schedule_start_offset_ms: None,
    };
    let config = MetronomeConfig::from(payload);
    assert!(matches!(config.sound_mode, MetronomeSoundMode::Tock));
}

#[test]
fn metronome_config_payload_accepts_new_sample_modes() {
    let payload = MetronomeConfigPayload {
        bpm: 120.0,
        time_sig_top: 4,
        time_sig_bottom: 4,
        volume: 80,
        beat_states: vec![
            MetronomeBeatStatePayload::Accent,
            MetronomeBeatStatePayload::Normal,
            MetronomeBeatStatePayload::Normal,
            MetronomeBeatStatePayload::Normal,
        ],
        subdivisions_enabled: true,
        subdivisions_value: 2,
        sound_mode: MetronomeSoundModePayload::RideKit,
        count_in_bars: Vec::new(),
        count_in_enabled: false,
        start_beat_index: 0,
        start_sub_index: 0,
        start_delay_ms: 0.0,
        schedule: Vec::new(),
        schedule_loop_ms: None,
        schedule_start_offset_ms: None,
    };
    let config = MetronomeConfig::from(payload);
    assert!(matches!(config.sound_mode, MetronomeSoundMode::RideKit));
}

#[test]
fn metronome_tock_buffer_is_non_silent() {
    let sample_rate = 44_100u32;
    let variants = [
        MetronomeTockVariant::HighAccent,
        MetronomeTockVariant::LowAccent,
        MetronomeTockVariant::Click,
        MetronomeTockVariant::Subdivision,
    ];
    for variant in variants {
        let tock = render_matched_sample_buffer(MetronomeSampleSet::Tock, sample_rate, variant);
        let tock_rms = rms_non_silent(&tock).max(1.0e-9);
        assert!(tock_rms > 0.0, "variant {:?} rendered as silence", variant);
    }
}

#[test]
fn metronome_tock_peak_keeps_headroom() {
    let sample_rate = 44_100u32;
    let variants = [
        MetronomeTockVariant::HighAccent,
        MetronomeTockVariant::LowAccent,
        MetronomeTockVariant::Click,
        MetronomeTockVariant::Subdivision,
    ];
    for variant in variants {
        let tock = render_matched_sample_buffer(MetronomeSampleSet::Tock, sample_rate, variant);
        let peak = tock
            .iter()
            .fold(0.0f32, |max: f32, sample: &f32| max.max(sample.abs()));
        assert!(
            peak <= METRONOME_TOCK_MAX_PEAK + 1.0e-5,
            "variant {:?} exceeded headroom limit: {}",
            variant,
            peak
        );
    }
}

#[test]
fn metronome_subdivision_blip_is_quieter() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_metronome_config(
        MetronomeConfigPayload {
            bpm: 120.0,
            time_sig_top: 4,
            time_sig_bottom: 4,
            volume: 80,
            beat_states: vec![
                MetronomeBeatStatePayload::Accent,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
            ],
            subdivisions_enabled: true,
            subdivisions_value: 2,
            sound_mode: MetronomeSoundModePayload::Blip,
            count_in_bars: Vec::new(),
            count_in_enabled: false,
            start_beat_index: 0,
            start_sub_index: 0,
            start_delay_ms: 0.0,
            schedule: Vec::new(),
            schedule_loop_ms: None,
            schedule_start_offset_ms: None,
        }
        .into(),
    );
    runtime.start_metronome();
    let frames = (runtime.metronome_state.step_samples(runtime.sample_rate) * 2.0) as usize + 2;
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];
    runtime.render_metronome(frames, &mut left, &mut right);
    let expected = 0.6 * METRONOME_SUBDIVISION_VELOCITY_SCALE;
    let sub_blip = runtime
        .metronome_state
        .pending_blips
        .iter()
        .find(|blip| (blip.amplitude - expected).abs() < 1e-4);
    let Some(sub_blip) = sub_blip else {
        panic!("missing subdivision blip");
    };
    assert_eq!(
        sub_blip.freq_hz,
        METRONOME_BLIP_FREQ_NORMAL + METRONOME_SUBDIVISION_PITCH_OFFSET_HZ
    );
}

#[test]
fn metronome_schedule_subdivision_blip_is_quieter() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_metronome_config(
        MetronomeConfigPayload {
            bpm: 120.0,
            time_sig_top: 4,
            time_sig_bottom: 4,
            volume: 80,
            beat_states: vec![
                MetronomeBeatStatePayload::Accent,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
            ],
            subdivisions_enabled: true,
            subdivisions_value: 2,
            sound_mode: MetronomeSoundModePayload::Blip,
            count_in_bars: Vec::new(),
            count_in_enabled: false,
            start_beat_index: 0,
            start_sub_index: 0,
            start_delay_ms: 0.0,
            schedule: vec![MetronomeScheduledEventPayload {
                offset_ms: 0.0,
                kind: MetronomeBeatStatePayload::Low,
            }],
            schedule_loop_ms: Some(1000.0),
            schedule_start_offset_ms: Some(0.0),
        }
        .into(),
    );
    runtime.start_metronome();
    let mut left = vec![0.0f32; 1000];
    let mut right = vec![0.0f32; 1000];
    runtime.render_metronome(1000, &mut left, &mut right);
    let expected = 0.6 * METRONOME_SUBDIVISION_VELOCITY_SCALE;
    let sub_blip = runtime
        .metronome_state
        .pending_blips
        .iter()
        .find(|blip| (blip.amplitude - expected).abs() < 1e-4);
    let Some(sub_blip) = sub_blip else {
        panic!("missing subdivision blip");
    };
    assert_eq!(
        sub_blip.freq_hz,
        METRONOME_BLIP_FREQ_NORMAL + METRONOME_SUBDIVISION_PITCH_OFFSET_HZ
    );
}

#[test]
fn metronome_schedule_does_not_double_click_at_loop_end() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_metronome_config(
        MetronomeConfigPayload {
            bpm: 120.0,
            time_sig_top: 4,
            time_sig_bottom: 4,
            volume: 80,
            beat_states: vec![
                MetronomeBeatStatePayload::Accent,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
            ],
            subdivisions_enabled: false,
            subdivisions_value: 1,
            sound_mode: MetronomeSoundModePayload::Blip,
            count_in_bars: Vec::new(),
            count_in_enabled: false,
            start_beat_index: 0,
            start_sub_index: 0,
            start_delay_ms: 0.0,
            schedule: vec![MetronomeScheduledEventPayload {
                offset_ms: 0.0,
                kind: MetronomeBeatStatePayload::Accent,
            }],
            schedule_loop_ms: Some(1000.0),
            schedule_start_offset_ms: Some(0.0),
        }
        .into(),
    );
    runtime.start_metronome();
    let mut left = vec![0.0f32; 1000];
    let mut right = vec![0.0f32; 1000];
    runtime.render_metronome(1000, &mut left, &mut right);
    assert_eq!(runtime.metronome_state.pending_blips.len(), 1);
}

#[test]
fn metronome_resync_to_position_computes_correct_beat_index() {
    let mut state = MetronomeState::new();
    state.set_config(MetronomeConfig {
        bpm: 120.0,
        time_sig_top: 4,
        time_sig_bottom: 4,
        ..Default::default()
    });
    state.start(true);
    let sample_rate = 44_100.0;
    // At 120 BPM, 4/4 time: beat_samples = (60/120) * (4/4) * 44100 = 22050
    // Seek to the middle of beat 2 (i.e. 2.5 beats in = 2.5 * 22050 = 55125 samples)
    let seek_pos = 55125.0 + state.start_sample;
    state.resync_to_position(seek_pos, sample_rate);
    assert_eq!(state.beat_index, 2);
    assert_eq!(state.sub_index, 0);
    // next_event_sample should be at step 3 (beat 3)
    let step_samples = state.step_samples(sample_rate);
    let expected_next = state.start_sample + 3.0 * step_samples;
    assert!(
        (state.next_event_sample - expected_next).abs() < 0.01,
        "next_event_sample {} != expected {}",
        state.next_event_sample,
        expected_next
    );
}

#[test]
fn metronome_no_drift_after_many_beats_at_300bpm() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44_100.0;
    runtime.set_metronome_config(
        MetronomeConfigPayload {
            bpm: 300.0,
            time_sig_top: 4,
            time_sig_bottom: 4,
            volume: 80,
            beat_states: vec![
                MetronomeBeatStatePayload::Accent,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
                MetronomeBeatStatePayload::Normal,
            ],
            subdivisions_enabled: false,
            subdivisions_value: 1,
            sound_mode: MetronomeSoundModePayload::Blip,
            count_in_bars: Vec::new(),
            count_in_enabled: false,
            start_beat_index: 0,
            start_sub_index: 0,
            start_delay_ms: 0.0,
            schedule: Vec::new(),
            schedule_loop_ms: None,
            schedule_start_offset_ms: None,
        }
        .into(),
    );
    runtime.start_metronome();
    // Render many small buffers to accumulate steps
    let chunk = 512;
    for _ in 0..2000 {
        let mut left = vec![0.0f32; chunk];
        let mut right = vec![0.0f32; chunk];
        runtime.render_metronome(chunk, &mut left, &mut right);
    }
    let total_steps = runtime.metronome_state.total_steps_elapsed();
    let step_samples = runtime.metronome_state.step_samples(runtime.sample_rate);
    let theoretical = runtime.metronome_state.start_sample + (total_steps as f64) * step_samples;
    let drift = (runtime.metronome_state.next_event_sample - theoretical).abs();
    assert!(
        drift <= 1.0,
        "drift {} samples exceeds 1 sample threshold after {} steps",
        drift,
        total_steps
    );
}

#[test]
fn metronome_first_beat_does_not_fire_at_sample_zero() {
    let mut state = MetronomeState::new();
    state.set_config(MetronomeConfig {
        bpm: 120.0,
        time_sig_top: 4,
        time_sig_bottom: 4,
        start_delay_ms: 0.0,
        count_in_enabled: false,
        count_in_bars: Vec::new(),
        ..Default::default()
    });
    state.start(true);
    assert!(
        state.next_event_sample > 0.0,
        "first beat should not fire at sample 0, got {}",
        state.next_event_sample
    );
}
