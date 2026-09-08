use super::engine::load_sound_font;
use super::synthesis::EngineRuntime;
use super::types::*;
use std::path::PathBuf;

#[test]
fn expression_zero_does_not_auto_restore_on_same_tick_note() {
    let mut runtime = EngineRuntime::new(None);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 90,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 0,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 2.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    assert_eq!(runtime.cc11[0], 0);
    assert_eq!(runtime.pending_cc11_restore[0], None);
}

#[test]
fn expression_zero_restores_on_later_note_on() {
    let mut runtime = EngineRuntime::new(None);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 90,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 0,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 3.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    assert_eq!(runtime.cc11[0], 90);
    assert_eq!(runtime.pending_cc11_restore[0], None);
}

#[test]
fn cc7_low_value_restores_on_later_note_on() {
    let mut runtime = EngineRuntime::new(None);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 100,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.5,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 55,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 20,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 3.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    assert_eq!(runtime.cc7[0], 127);
}

#[test]
fn cc7_low_value_without_active_notes_restores_on_next_note_on() {
    let mut runtime = EngineRuntime::new(None);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 100,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 20,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 3.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    assert_eq!(runtime.cc7[0], 127);
}

#[test]
fn cc7_zero_at_same_timestamp_restores_before_note_on() {
    let mut runtime = EngineRuntime::new(None);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 100,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 10.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 7,
            value: 0,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 10.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    assert_eq!(runtime.cc7[0], 127);
    assert_eq!(runtime.pending_cc7_restore[0], None);
}

#[test]
fn swell_restore_after_note_off() {
    let mut soundfont_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    soundfont_path.push("resources/soundfonts/default.sf2");
    let soundfont =
        load_sound_font(&soundfont_path).expect("default soundfont should be available for tests");
    let mut runtime = EngineRuntime::new(Some(soundfont));
    runtime.ensure_synth(44_100.0);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 80,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 2.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 0,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 3.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOff {
            key: 60,
            velocity: 0,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 3.5,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 80,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 4.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 64,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    let mut left = vec![0.0f32; 256];
    let mut right = vec![0.0f32; 256];
    if let Some(synth) = runtime.synth.as_mut() {
        synth.render(&mut left, &mut right);
    }
    assert_eq!(runtime.cc11[0], 80);
    assert_eq!(runtime.pending_cc11_restore[0], None);
}

#[test]
fn fadeout_does_not_mute_overlapping_note() {
    let mut soundfont_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    soundfont_path.push("resources/soundfonts/default.sf2");
    let soundfont =
        load_sound_font(&soundfont_path).expect("default soundfont should be available for tests");
    let mut runtime = EngineRuntime::new(Some(soundfont));
    runtime.ensure_synth(44_100.0);
    runtime.process_event(&AudioEventPayload {
        at_ms: 0.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 90,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 1.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 60,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 2.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::ControlChange {
            controller: 11,
            value: 20,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 2.5,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOn {
            key: 64,
            velocity: 100,
            vibrato: NoteVibrato::None,
        },
    });
    runtime.process_event(&AudioEventPayload {
        at_ms: 3.0,
        track_id: "track-0".to_string(),
        channel: 0,
        kind: AudioEventKind::NoteOff {
            key: 60,
            velocity: 0,
        },
    });
    assert!(runtime.active_notes[0] > 0);
    assert_eq!(runtime.cc11[0], 20);
    assert_eq!(runtime.pending_cc11_restore[0], None);
}

#[test]
fn seek_restores_cc7_after_note_ends() {
    let mut runtime = EngineRuntime::new(None);
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
            sample_time: 1_000.0,
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
            sample_time: 2_000.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
                track_id: "track-0".to_string(),
                channel: 0,
                kind: AudioEventKind::ControlChange {
                    controller: 7,
                    value: 21,
                },
            },
        },
        ScheduledEvent {
            sample_time: 3_000.0,
            payload: AudioEventPayload {
                at_ms: 0.0,
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
    runtime.seek_to_samples(4_000.0);
    assert_eq!(runtime.cc7[0], 96);
}
