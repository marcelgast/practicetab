use super::synthesis::EngineRuntime;
use super::types::*;
use rustysynth::Synthesizer;

#[test]
fn track_state_volume_allows_drum_boost_headroom() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_track_state(TrackStatePayload {
        track_id: "drums".to_string(),
        mute: false,
        solo: false,
        volume: 2.0,
        listen: false,
    });
    assert!(
        (runtime.effective_volume("drums") - (MAX_TRACK_STATE_VOLUME * TAB_OUTPUT_GAIN)).abs()
            < 0.0001
    );
}

#[test]
fn tab_volume_supports_twenty_percent_headroom() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_tab_volume_percent(100);
    assert!((runtime.tab_volume_gain - CHANNEL_GAIN_MAX_BOOST).abs() < 0.0001);
}

#[test]
fn tempo_map_roundtrip_ticks() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_events(
        Vec::new(),
        vec![TempoPoint {
            tick: 0,
            time_ms: 0.0,
            us_per_quarter: 500_000.0,
        }],
        480.0,
    );
    let ms = runtime.tick_to_ms(960);
    assert!((ms - 1000.0).abs() < 0.01);
    let tick = runtime.ms_to_tick(1000.0);
    assert_eq!(tick, 960);
}

#[test]
fn seek_to_tick_updates_position() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.set_events(
        Vec::new(),
        vec![TempoPoint {
            tick: 0,
            time_ms: 0.0,
            us_per_quarter: 500_000.0,
        }],
        480.0,
    );
    runtime.seek_to_tick(480);
    assert_eq!(runtime.current_tick, 480);
    assert!((runtime.position_samples - 24_000.0).abs() < 0.01);
}

#[test]
fn seek_and_play_sets_tick_and_playing() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    runtime.set_events(
        Vec::new(),
        vec![TempoPoint {
            tick: 0,
            time_ms: 0.0,
            us_per_quarter: 500_000.0,
        }],
        480.0,
    );
    runtime.seek_and_play(960);
    assert_eq!(runtime.current_tick, 960);
    assert!(runtime.playing);
}

#[test]
fn seek_does_not_restart_active_notes() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![
        ScheduledEvent {
            sample_time: 0.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
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
                kind: AudioEventKind::NoteOff {
                    key: 60,
                    velocity: 0,
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
    runtime.seek_to_ms(500.0);
    assert_eq!(runtime.active_notes[0], 0);
}

#[test]
fn seek_does_not_restart_stale_notes() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![
        ScheduledEvent {
            sample_time: 0.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
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
            sample_time: 76_800.0,
            payload: AudioEventPayload {
                at_ms: 1600.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::NoteOn {
                    key: 62,
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
    runtime.seek_to_ms(2000.0);
    assert_eq!(runtime.active_notes[0], 0);
}

#[test]
fn seek_restarts_notes_when_bend_is_pending() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![
        ScheduledEvent {
            sample_time: 0.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
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
            sample_time: 38_400.0,
            payload: AudioEventPayload {
                at_ms: 800.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::PitchBend {
                    value: 4096,
                    endpoint: false,
                    label: None,
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
    runtime.seek_to_ms(500.0);
    assert_eq!(runtime.active_notes[0], 1);
}

#[test]
fn seek_applies_pitch_bend_state() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![ScheduledEvent {
        sample_time: 0.0,
        payload: AudioEventPayload {
            at_ms: 0.0,
            track_id: "track-0".to_string(),
            channel: 0,
            kind: AudioEventKind::PitchBend {
                value: 4096,
                endpoint: true,
                label: None,
            },
        },
    }];
    runtime.set_events(
        events,
        vec![TempoPoint {
            tick: 0,
            time_ms: 0.0,
            us_per_quarter: 500_000.0,
        }],
        480.0,
    );
    runtime.seek_to_ms(500.0);
    assert_ne!(runtime.last_pitch_bend[0], PITCH_BEND_CENTER);
}

#[test]
fn tuning_transposes_keys_and_clamps() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_tuning(-2);
    assert_eq!(runtime.tuned_key(60, 0), 58);
    runtime.set_tuning(12);
    assert_eq!(runtime.tuned_key(60, 0), 72);
    runtime.set_tuning(-12);
    assert_eq!(runtime.tuned_key(2, 0), 0);
    runtime.set_tuning(12);
    assert_eq!(runtime.tuned_key(125, 0), 127);
    runtime.set_tuning(5);
    assert_eq!(runtime.tuned_key(60, METRONOME_CHANNEL_DRUM as u8), 60);
}

#[test]
fn tuning_does_not_change_pitch_bend_mapping() {
    let mut runtime = EngineRuntime::new(None);
    runtime.set_tuning(7);
    let payload = AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::PitchBend {
            value: 4096,
            endpoint: true,
            label: None,
        },
    };
    let expected = EngineRuntime::normalize_bend_to_semitones_for_range(
        4096,
        runtime.bend_range_for_channel(0),
    );
    runtime.process_event(&payload);
    assert!((runtime.base_pitch_semitones[0] - expected).abs() < 0.0001);
}

#[test]
fn seek_positions_next_event_at_or_after_tick() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 48_000.0;
    let events = vec![
        ScheduledEvent {
            sample_time: 0.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
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
                kind: AudioEventKind::NoteOn {
                    key: 64,
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
    let next = runtime
        .events
        .get(runtime.next_event_index)
        .map(|event| event.payload.at_ms)
        .unwrap_or(0.0);
    assert!(next >= 1000.0);
}

#[test]
fn seek_restores_cc7_after_seek() {
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
                    controller: 7,
                    value: 96,
                },
            },
        },
        ScheduledEvent {
            sample_time: 24_000.0,
            payload: AudioEventPayload {
                at_ms: 500.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::ControlChange {
                    controller: 7,
                    value: 0,
                },
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
    runtime.seek_to_tick(720);
    assert!(runtime.cc7[0] >= SEEK_GUARD_MIN_CC7);
    assert_eq!(runtime.pending_cc7_restore[0], None);
}

#[test]
fn seek_normalizes_low_cc7() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 1000.0;
    runtime.events = vec![ScheduledEvent {
        sample_time: 500.0,
        payload: AudioEventPayload {
            at_ms: 500.0,
            track_id: "track-0".to_string(),
            channel: 4,
            kind: AudioEventKind::ControlChange {
                controller: 7,
                value: 8,
            },
        },
    }];
    runtime.seek_to_ms(1000.0);
    assert!(runtime.cc7[4] >= SEEK_MIN_CC7);
}

#[test]
fn seek_cc7_guard_suppresses_low_values() {
    let mut runtime = EngineRuntime::new(None);
    runtime.cc7[0] = 96;
    runtime.last_cc7_nonzero[0] = 96;
    runtime.cc7_seek_guard_until_ms[0] = 1000.0;
    runtime.cc7_seek_guard_min[0] = 64;
    let payload = AudioEventPayload {
        at_ms: 10.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 8,
        },
    };
    runtime.process_event(&payload);
    assert_eq!(runtime.cc7[0], 96);
}

#[test]
fn seek_cc7_guard_expires_and_allows_change() {
    let mut runtime = EngineRuntime::new(None);
    runtime.cc7[0] = 96;
    runtime.last_cc7_nonzero[0] = 96;
    runtime.cc7_seek_guard_until_ms[0] = 5.0;
    runtime.cc7_seek_guard_min[0] = 64;
    let payload = AudioEventPayload {
        at_ms: 10.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 80,
        },
    };
    runtime.process_event(&payload);
    assert_eq!(runtime.cc7[0], 80);
}

#[test]
fn seek_cc7_guard_bumps_state_to_baseline() {
    let mut runtime = EngineRuntime::new(None);
    runtime.cc7[3] = 32;
    runtime.last_cc7_nonzero[3] = 32;
    let mut channel_has_note = [false; Synthesizer::CHANNEL_COUNT];
    channel_has_note[3] = true;
    runtime.arm_cc7_seek_guard(0.0, &channel_has_note);
    assert!(runtime.cc7[3] >= SEEK_GUARD_MIN_CC7);
    assert!(runtime.last_cc7_nonzero[3] >= SEEK_GUARD_MIN_CC7);
}
