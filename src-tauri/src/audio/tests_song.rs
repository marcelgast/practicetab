use std::sync::{Arc, Mutex};

use super::song_stream::SongStreamHandle;
use super::synthesis::EngineRuntime;

fn make_stream(samples: Vec<[f32; 2]>, sample_rate: u32) -> Arc<Mutex<SongStreamHandle>> {
    Arc::new(Mutex::new(SongStreamHandle::from_samples(
        samples,
        sample_rate,
    )))
}

#[test]
fn song_load_resets_position() {
    let mut runtime = EngineRuntime::new(None);
    runtime.song_position = 1000.0;
    runtime.song_playing = true;

    let stream = make_stream(vec![[0.0f32, 0.0]; 100], 44100);
    runtime.song_load(stream);

    assert_eq!(runtime.song_position, 0.0);
    assert!(!runtime.song_playing);
    assert!(runtime.song_stream.is_some());
}

#[test]
fn song_unload_clears_state() {
    let mut runtime = EngineRuntime::new(None);
    let stream = make_stream(vec![[0.5f32, -0.5]; 100], 44100);
    runtime.song_load(stream);
    runtime.song_playing = true;
    runtime.song_position = 50.0;

    runtime.song_unload();

    assert!(runtime.song_stream.is_none());
    assert_eq!(runtime.song_position, 0.0);
    assert!(!runtime.song_playing);
}

#[test]
fn song_play_pause_stop() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44100.0;
    let stream = make_stream(vec![[0.1f32, 0.1]; 1000], 44100);
    runtime.song_load(stream);

    runtime.song_play();
    assert!(runtime.song_playing);

    // Pause without any rendered frames (gain is 0) completes immediately
    runtime.song_pause();
    assert!(!runtime.song_playing);

    // Now test fade-out after actual audio has been rendered
    runtime.song_play();
    let frames = 512;
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];
    runtime.render_song(frames, &mut left, &mut right);
    assert!(
        runtime.song_fade_gain > 0.0,
        "gain should be > 0 after rendering"
    );
    assert!(runtime.song_playing);

    // Pause with active audio initiates fade-out
    runtime.song_pause();
    assert!(runtime.song_fade_step < 0.0, "fade-out should be active");
    // Render to complete fade
    let mut left2 = vec![0.0f32; frames];
    let mut right2 = vec![0.0f32; frames];
    runtime.render_song(frames, &mut left2, &mut right2);
    assert!(!runtime.song_playing);

    // Stop when already paused resets position immediately
    runtime.song_position = 42.0;
    runtime.song_stop();
    assert!(!runtime.song_playing);
    assert_eq!(runtime.song_position, 0.0);
}

#[test]
fn song_seek_ms_converts_correctly() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44100.0;

    runtime.song_seek_ms(1000.0);
    assert!((runtime.song_position - 44100.0).abs() < 1.0);

    runtime.song_seek_ms(0.0);
    assert_eq!(runtime.song_position, 0.0);

    // Negative clamps to 0
    runtime.song_seek_ms(-500.0);
    assert_eq!(runtime.song_position, 0.0);
}

#[test]
fn song_get_position_ms_round_trips() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44100.0;

    runtime.song_seek_ms(2500.0);
    let pos = runtime.song_get_position_ms();
    assert!((pos - 2500.0).abs() < 0.1);
}

#[test]
fn song_set_volume_clamps() {
    let mut runtime = EngineRuntime::new(None);

    runtime.song_set_volume(0.5);
    assert!((runtime.song_volume - 0.5).abs() < 1e-6);

    runtime.song_set_volume(1.5);
    assert!((runtime.song_volume - 1.0).abs() < 1e-6);

    runtime.song_set_volume(-0.5);
    assert!((runtime.song_volume).abs() < 1e-6);
}

#[test]
fn song_set_speed_validates() {
    let mut runtime = EngineRuntime::new(None);

    runtime.song_set_speed(2.0);
    assert!((runtime.song_speed - 2.0).abs() < 1e-6);

    // Too low — should not change
    runtime.song_set_speed(0.01);
    assert!((runtime.song_speed - 2.0).abs() < 1e-6);

    // Infinite — should not change
    runtime.song_set_speed(f64::INFINITY);
    assert!((runtime.song_speed - 2.0).abs() < 1e-6);
}

#[test]
fn song_set_tuning_clamps() {
    let mut runtime = EngineRuntime::new(None);

    runtime.song_set_tuning(3);
    assert!((runtime.song_tuning_semitones - 3.0).abs() < 1e-6);

    runtime.song_set_tuning(-5);
    assert!((runtime.song_tuning_semitones - (-5.0)).abs() < 1e-6);

    // Clamped to [-12, 12]
    runtime.song_set_tuning(15);
    assert!((runtime.song_tuning_semitones - 12.0).abs() < 1e-6);

    runtime.song_set_tuning(-20);
    assert!((runtime.song_tuning_semitones - (-12.0)).abs() < 1e-6);

    // Zero resets
    runtime.song_set_tuning(0);
    assert!(runtime.song_tuning_semitones.abs() < 1e-6);
}

#[test]
fn render_song_mixes_audio() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44100.0;

    let stream = make_stream(vec![[0.5f32, -0.3]; 1000], 44100);
    runtime.song_load(stream);
    runtime.song_play();
    runtime.song_volume = 1.0;
    runtime.song_speed = 1.0;

    let frames = 10;
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];

    runtime.render_song(frames, &mut left, &mut right);

    // Should have mixed in the song audio
    assert!(left[0] > 0.0);
    assert!(right[0] < 0.0);
    assert!(runtime.song_position > 0.0);
}

#[test]
fn render_song_stops_at_end() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44100.0;

    let stream = make_stream(vec![[0.1f32, 0.1]; 5], 44100);
    runtime.song_load(stream);
    runtime.song_play();
    runtime.song_speed = 1.0;

    let frames = 20;
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];

    runtime.render_song(frames, &mut left, &mut right);

    assert!(!runtime.song_playing);
}

#[test]
fn render_song_respects_loop() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44100.0;

    let stream = make_stream(vec![[0.1f32, 0.1]; 100], 44100);
    runtime.song_load(stream);
    runtime.song_play();
    runtime.song_speed = 1.0;
    runtime.song_loop_start = Some(10.0);
    runtime.song_loop_end = Some(20.0);
    runtime.song_position = 18.0;

    let frames = 5;
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];

    runtime.render_song(frames, &mut left, &mut right);

    // Should have looped back near the start
    assert!(runtime.song_position < 20.0);
    assert!(runtime.song_playing);
}

#[test]
fn render_song_no_output_when_paused() {
    let mut runtime = EngineRuntime::new(None);
    runtime.sample_rate = 44100.0;

    let stream = make_stream(vec![[0.5f32, 0.5]; 100], 44100);
    runtime.song_load(stream);
    // Not playing

    let frames = 10;
    let mut left = vec![0.0f32; frames];
    let mut right = vec![0.0f32; frames];

    runtime.render_song(frames, &mut left, &mut right);

    assert!(left.iter().all(|&v| v == 0.0));
    assert!(right.iter().all(|&v| v == 0.0));
}
