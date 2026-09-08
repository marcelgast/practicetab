use super::synthesis::EngineRuntime;
use super::types::*;

#[test]
fn seek_restores_program_and_bank() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![
        ScheduledEvent {
            sample_time: 0.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::ControlChange {
                    controller: 0,
                    value: 5,
                },
            },
        },
        ScheduledEvent {
            sample_time: 0.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::ControlChange {
                    controller: 32,
                    value: 64,
                },
            },
        },
        ScheduledEvent {
            sample_time: 0.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::ProgramChange { program: 29 },
            },
        },
        ScheduledEvent {
            sample_time: 48_000.0,
            payload: AudioEventPayload {
                at_ms: 1000.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::NoteOn {
                    key: 60,
                    velocity: 100,
                    vibrato: NoteVibrato::None,
                },
            },
        },
    ];
    runtime.set_events(
        events,
        vec![TempoPoint {
            tick: 0,
            time_ms: 0.0,
            us_per_quarter: 500_000.0,
        }],
        480.0,
    );
    runtime.seek_to_tick(480);
    assert_eq!(runtime.bank_msb[0], 5);
    assert_eq!(runtime.bank_lsb[0], 64);
    assert_eq!(runtime.program[0], 29);
}

#[test]
fn seek_applies_program_at_exact_tick() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![
        ScheduledEvent {
            sample_time: 48_000.0,
            payload: AudioEventPayload {
                at_ms: 1000.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::ProgramChange { program: 42 },
            },
        },
        ScheduledEvent {
            sample_time: 48_000.0,
            payload: AudioEventPayload {
                at_ms: 1000.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::NoteOn {
                    key: 60,
                    velocity: 100,
                    vibrato: NoteVibrato::None,
                },
            },
        },
    ];
    runtime.set_events(
        events,
        vec![TempoPoint {
            tick: 0,
            time_ms: 0.0,
            us_per_quarter: 500_000.0,
        }],
        480.0,
    );
    runtime.seek_to_tick(960);
    assert_eq!(runtime.program[0], 42);
}

#[test]
fn events_sort_control_change_before_note_on_at_same_time() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![
        ScheduledEvent {
            sample_time: 48_000.0,
            payload: AudioEventPayload {
                at_ms: 1000.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::NoteOn {
                    key: 60,
                    velocity: 100,
                    vibrato: NoteVibrato::None,
                },
            },
        },
        ScheduledEvent {
            sample_time: 48_000.0,
            payload: AudioEventPayload {
                at_ms: 1000.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::ControlChange {
                    controller: 7,
                    value: 96,
                },
            },
        },
    ];
    runtime.set_events(
        events,
        vec![TempoPoint {
            tick: 0,
            time_ms: 0.0,
            us_per_quarter: 500_000.0,
        }],
        480.0,
    );
    assert!(matches!(
        runtime.events[0].payload.kind,
        AudioEventKind::ControlChange { .. }
    ));
    assert!(matches!(
        runtime.events[1].payload.kind,
        AudioEventKind::NoteOn { .. }
    ));
}

#[test]
fn pitch_bend_to_offset_handles_absolute_and_signed() {
    assert_eq!(EngineRuntime::pitch_bend_to_offset(0), -PITCH_BEND_CENTER);
    assert_eq!(EngineRuntime::pitch_bend_to_offset(8192), 0);
    assert_eq!(
        EngineRuntime::pitch_bend_to_offset(16383),
        PITCH_BEND_CENTER - 1
    );
    assert_eq!(EngineRuntime::pitch_bend_to_offset(-200), -200);
}

#[test]
fn normalize_bend_to_semitones_maps_full_step() {
    let range = 16.0;
    let raw = (PITCH_BEND_CENTER as f32 * (2.0 / range)).round() as i16 + PITCH_BEND_CENTER as i16;
    let semitones = EngineRuntime::normalize_bend_to_semitones_for_range(raw, range);
    assert!((semitones - 2.0).abs() < 0.01);
    let offset = EngineRuntime::semitones_to_pb_offset(semitones, 12.0);
    let expected = (2.0 / 12.0 * PITCH_BEND_CENTER as f32).round() as i32;
    assert_eq!(offset, expected);
}

#[test]
fn semitones_to_pb_offset_matches_range_two() {
    assert_eq!(EngineRuntime::semitones_to_pb_offset(2.0, 2.0), 8191);
    assert_eq!(EngineRuntime::semitones_to_pb_offset(1.0, 2.0), 4096);
}

#[test]
fn vibrato_resets_pitch_bend_on_note_end() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::Wide,
        },
    });
    runtime.vibrato[0].phase = std::f32::consts::FRAC_PI_2;
    runtime.vibrato[0].fade_elapsed = VIBRATO_FADE_SECONDS;
    runtime.apply_vibrato_for_block(1920);
    assert_ne!(runtime.last_pitch_bend[0], PITCH_BEND_CENTER);
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOff {
            key: 60,
            velocity: 0,
        },
    });
    runtime.apply_vibrato_for_block((runtime.sample_rate * 0.1) as usize);
    assert_eq!(runtime.last_pitch_bend[0], PITCH_BEND_CENTER);
}

#[test]
fn notes_without_vibrato_do_not_bend() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    for _ in 0..4 {
        runtime.apply_vibrato_for_block(480);
    }
    assert_eq!(runtime.last_pitch_bend[0], PITCH_BEND_CENTER);
}

#[test]
fn bend_range_affects_semitone_offsets() {
    let offset_range2 = EngineRuntime::semitones_to_pb_offset(1.0, 2.0).abs();
    let offset_range12 = EngineRuntime::semitones_to_pb_offset(1.0, 12.0).abs();
    assert!(offset_range12 < offset_range2);
}

#[test]
fn vibrato_depth_is_independent_of_bend_range() {
    let slight = EngineRuntime::vibrato_depth_semitones(NoteVibrato::Slight);
    let wide = EngineRuntime::vibrato_depth_semitones(NoteVibrato::Wide);
    assert!(slight > 0.0);
    assert!(wide > slight);
}

#[test]
fn rpn_pitch_bend_range_updates_runtime_mapping() {
    let mut runtime = EngineRuntime::new(None);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 101,
            value: 0,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 100,
            value: 0,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 6,
            value: 16,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::PitchBend {
            value: (PITCH_BEND_CENTER + 512) as i16,
            endpoint: false,
            label: None,
        },
    });
    let expected = EngineRuntime::normalize_bend_to_semitones_for_range(
        (PITCH_BEND_CENTER + 512) as i16,
        16.0,
    );
    assert!((runtime.bend_range_for_channel(0) - 16.0).abs() < 0.001);
    assert!((runtime.base_pitch_semitones[0] - expected).abs() < 0.0001);
}

#[test]
fn vibrato_is_centered_and_bounded() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.vibrato[0] = VibratoState {
        active: true,
        depth_semitones: EngineRuntime::vibrato_depth_semitones(NoteVibrato::Wide),
        rate_hz: VIB_RATE_HZ_WIDE * VIB_RATE_SCALE,
        phase: 0.0,
        fade_elapsed: VIBRATO_FADE_SECONDS,
        fade_out_remaining: 0.0,
        smoothed_offset_semitones: 0.0,
    };
    runtime.active_notes[0] = 1;
    runtime.apply_vibrato_for_block(4800);
    assert_eq!(runtime.last_pitch_bend[0], PITCH_BEND_CENTER);
    runtime.vibrato[0].phase = std::f32::consts::FRAC_PI_2;
    runtime.apply_vibrato_for_block(4800);
    let offset = runtime.last_pitch_bend[0] - PITCH_BEND_CENTER;
    let expected = EngineRuntime::semitones_to_pb_offset(
        EngineRuntime::vibrato_depth_semitones(NoteVibrato::Wide),
        runtime.bend_range_for_channel(0),
    );
    assert_eq!(offset, expected);
}

#[test]
fn pitch_bend_mapping_center_and_endpoints() {
    let range = 2.0;
    assert_eq!(EngineRuntime::semitones_to_pb_offset(0.0, range), 0);
    assert_eq!(
        EngineRuntime::semitones_to_pb_offset(range, range),
        PITCH_BEND_CENTER - 1
    );
    assert_eq!(
        EngineRuntime::semitones_to_pb_offset(-range, range),
        -PITCH_BEND_CENTER
    );
}

#[test]
fn one_semitone_bend_matches_expected_offset() {
    let expected = (PITCH_BEND_CENTER as f32 / 12.0).round() as i32;
    let offset = EngineRuntime::semitones_to_pb_offset(1.0, 12.0).abs();
    assert_eq!(offset, expected);
}

#[test]
fn pitch_bend_and_vibrato_are_additive() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::Slight,
        },
    });
    runtime.vibrato[0].phase = std::f32::consts::FRAC_PI_2;
    runtime.vibrato[0].fade_elapsed = VIBRATO_FADE_SECONDS;
    runtime.vibrato[0].smoothed_offset_semitones =
        EngineRuntime::vibrato_depth_semitones(NoteVibrato::Slight);
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::PitchBend {
            value: (PITCH_BEND_CENTER + 512) as i16,
            endpoint: false,
            label: None,
        },
    });
    let semitones = EngineRuntime::normalize_bend_to_semitones_for_range(
        (PITCH_BEND_CENTER + 512) as i16,
        runtime.bend_range_for_channel(0),
    );
    let combined = semitones + EngineRuntime::vibrato_depth_semitones(NoteVibrato::Slight);
    let expected = PITCH_BEND_CENTER + EngineRuntime::semitones_to_pb_offset(combined, 12.0);
    assert_eq!(runtime.last_pitch_bend[0], expected);
}

#[test]
fn vibrato_steps_are_small_between_updates() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.active_notes[0] = 1;
    runtime.vibrato[0] = VibratoState {
        active: true,
        depth_semitones: EngineRuntime::vibrato_depth_semitones(NoteVibrato::Slight),
        rate_hz: VIB_RATE_HZ_DEFAULT * VIB_RATE_SCALE,
        phase: 0.0,
        fade_elapsed: VIBRATO_FADE_SECONDS,
        fade_out_remaining: 0.0,
        smoothed_offset_semitones: 0.0,
    };
    let mut last = PITCH_BEND_CENTER;
    for _ in 0..20 {
        runtime.apply_vibrato_for_block(480);
        let current = runtime.last_pitch_bend[0];
        let delta = (current - last).abs();
        assert!(delta <= VIBRATO_MAX_PB_DELTA);
        last = current;
    }
}

#[test]
fn vibrato_does_not_limit_after_bend() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.active_notes[0] = 1;
    runtime.base_pitch_semitones[0] = 1.0;
    runtime.vibrato[0] = VibratoState {
        active: true,
        depth_semitones: EngineRuntime::vibrato_depth_semitones(NoteVibrato::Wide),
        rate_hz: VIB_RATE_HZ_WIDE * VIB_RATE_SCALE,
        phase: std::f32::consts::FRAC_PI_2,
        fade_elapsed: VIBRATO_FADE_SECONDS,
        fade_out_remaining: 0.0,
        smoothed_offset_semitones: EngineRuntime::vibrato_depth_semitones(NoteVibrato::Wide),
    };
    runtime.apply_vibrato_for_block(0);
    let combined =
        runtime.base_pitch_semitones[0] + EngineRuntime::vibrato_depth_semitones(NoteVibrato::Wide);
    let expected = PITCH_BEND_CENTER
        + EngineRuntime::semitones_to_pb_offset(combined, runtime.bend_range_for_channel(0));
    assert_eq!(runtime.last_pitch_bend[0], expected);
}
