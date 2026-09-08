use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

use super::engine::AudioEngine;
use super::song_stream::SongStreamHandle;
use super::types::{
    AlphaTabMetronomeTickPayload, AudioEventPayload, MetronomeConfigPayload, OutputDevice,
    ScheduledEvent, TempoPoint, TempoPointPayload, TrackState, TrackStatePayload,
    METRONOME_BEEP_CLICK_MS,
};

pub(crate) enum AudioCommand {
    List(Sender<Vec<OutputDevice>>),
    Refresh(Sender<Vec<OutputDevice>>),
    GetDevice(Sender<Option<String>>),
    SetDevice(Option<String>, Sender<Result<(), String>>),
    SetVolume(u8, Sender<Result<(), String>>),
    SetTabVolume(u8, Sender<Result<(), String>>),
    GetVolume(Sender<u8>),
    TabPrepare(Vec<String>, Sender<Result<(), String>>),
    TabSchedule(
        Vec<AudioEventPayload>,
        Vec<TempoPointPayload>,
        f64,
        Sender<Result<(), String>>,
    ),
    TabPlay(Sender<Result<(), String>>),
    TabPause(Sender<Result<(), String>>),
    TabStop(Sender<Result<(), String>>),
    TabSeek(f64, Sender<Result<(), String>>),
    TabSeekTick(i64, Sender<Result<(), String>>),
    TabSeekAndPlay(i64, Sender<Result<(), String>>),
    TabTempo(f64, Sender<Result<(), String>>),
    TabTrackState(TrackStatePayload, Sender<Result<(), String>>),
    TabSetLoopRange(f64, f64, Sender<Result<(), String>>),
    TabClearLoopRange(Sender<Result<(), String>>),
    TabGetPosition(Sender<f64>),
    TabSetTuning(i8, Sender<Result<(), String>>),
    MetronomeStart(MetronomeConfigPayload, Sender<Result<(), String>>),
    MetronomeStop(Sender<Result<(), String>>),
    MetronomeSetConfig(MetronomeConfigPayload, Sender<Result<(), String>>),
    MetronomeTickFromAlphaTab(AlphaTabMetronomeTickPayload, Sender<Result<(), String>>),
    MetronomeCancelScheduled(Sender<Result<(), String>>),
    MetronomeBeep(Sender<Result<(), String>>),

    // Song playback
    SongLoad {
        stream: Arc<Mutex<SongStreamHandle>>,
        reply: Sender<Result<(), String>>,
    },
    SongUnload(Sender<Result<(), String>>),
    SongPlay(Sender<Result<(), String>>),
    SongPlayDelayed {
        delay_ms: f64,
        reply: Sender<Result<(), String>>,
    },
    SongStretcherLatencyMs(Sender<f64>),
    SongPause(Sender<Result<(), String>>),
    SongStop(Sender<Result<(), String>>),
    SongSeek {
        position_ms: f64,
        reply: Sender<Result<(), String>>,
    },
    SongSetVolume {
        volume: f32,
        reply: Sender<Result<(), String>>,
    },
    SongSetSpeed {
        speed: f64,
        reply: Sender<Result<(), String>>,
    },
    SongSetTuning {
        semitones: i8,
        reply: Sender<Result<(), String>>,
    },
    SongSetLoop {
        start_ms: f64,
        end_ms: f64,
        reply: Sender<Result<(), String>>,
    },
    SongClearLoop(Sender<Result<(), String>>),
    SongGetPositionMs(Sender<f64>),
    GetSampleRate(Sender<u32>),
}

pub(crate) fn spawn_engine(sound_font_path: PathBuf) -> Sender<AudioCommand> {
    let (tx, rx): (Sender<AudioCommand>, Receiver<AudioCommand>) = channel();
    thread::spawn(move || {
        let mut engine = AudioEngine::new(sound_font_path);
        while let Ok(command) = rx.recv() {
            match command {
                AudioCommand::List(reply) => {
                    let _ = reply.send(engine.list_devices());
                }
                AudioCommand::Refresh(reply) => {
                    let _ = reply.send(engine.refresh_devices());
                }
                AudioCommand::GetDevice(reply) => {
                    let _ = reply.send(engine.selected_device());
                }
                AudioCommand::SetDevice(device_id, reply) => {
                    let result = engine.set_output_device(device_id);
                    let _ = reply.send(result);
                }
                AudioCommand::SetVolume(percent, reply) => {
                    engine.set_master_volume(percent);
                    let _ = reply.send(Ok(()));
                }
                AudioCommand::SetTabVolume(percent, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.set_tab_volume_percent(percent);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::GetVolume(reply) => {
                    let _ = reply.send(engine.master_volume());
                }
                AudioCommand::TabPrepare(track_ids, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.clear_events();
                        runtime.kill_all_voices();
                        runtime.track_states.clear();
                        for track_id in track_ids {
                            runtime.track_states.insert(
                                track_id,
                                TrackState {
                                    mute: false,
                                    solo: false,
                                    volume: 1.0,
                                },
                            );
                        }
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabSchedule(events, tempo_map, midi_division, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        let sample_rate = runtime.sample_rate;
                        let mut scheduled: Vec<ScheduledEvent> = events
                            .into_iter()
                            .map(|payload| ScheduledEvent {
                                sample_time: (payload.at_ms / 1000.0) * sample_rate,
                                payload,
                            })
                            .collect();
                        scheduled.sort_by(|a, b| {
                            a.sample_time
                                .partial_cmp(&b.sample_time)
                                .unwrap_or(std::cmp::Ordering::Equal)
                        });
                        let tempo_map = tempo_map
                            .into_iter()
                            .map(|point| TempoPoint {
                                tick: point.tick,
                                time_ms: point.time_ms,
                                us_per_quarter: point.us_per_quarter,
                            })
                            .collect();
                        runtime.set_events(scheduled, tempo_map, midi_division);
                        if std::env::var("PRACTICETAB_DEBUG_TRANSPORT").ok().as_deref() == Some("1")
                        {
                            let _ = ();
                        }
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabPlay(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.playing = true;
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabPause(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.playing = false;
                        runtime.kill_all_voices();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabStop(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.playing = false;
                        runtime.kill_all_voices();
                        runtime.seek_to_ms(0.0);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabSeek(position_ms, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.seek_to_ms(position_ms);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabSeekTick(tick, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.seek_to_tick(tick);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabSeekAndPlay(tick, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.seek_and_play(tick);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabTempo(factor, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.set_tempo_factor(factor);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabTrackState(state, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.set_track_state(state);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabSetLoopRange(start_ms, end_ms, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.set_loop_range_ms(start_ms, end_ms);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabClearLoopRange(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.clear_loop_range();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::TabGetPosition(reply) => {
                    let position = engine
                        .runtime
                        .lock()
                        .ok()
                        .map(|runtime| (runtime.position_samples / runtime.sample_rate) * 1000.0)
                        .unwrap_or(0.0);
                    let _ = reply.send(position);
                }
                AudioCommand::TabSetTuning(value, reply) => {
                    let result = engine
                        .ensure_stream()
                        .and_then(|_| engine.set_tuning(value));
                    let _ = reply.send(result);
                }
                AudioCommand::MetronomeStart(config, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.set_metronome_config(config.into());
                        runtime.start_metronome();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::MetronomeStop(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.stop_metronome();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::MetronomeSetConfig(config, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.set_metronome_config(config.into());
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::MetronomeTickFromAlphaTab(payload, reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.queue_alphatab_metronome_tick(payload);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::MetronomeCancelScheduled(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.clear_pending_metronome_events();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::MetronomeBeep(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.queue_metronome_blips(2, 180.0, 800.0, METRONOME_BEEP_CLICK_MS);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }

                // Song playback commands
                AudioCommand::SongLoad { stream, reply } => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_load(stream);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongUnload(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_unload();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongPlay(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_play();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongPlayDelayed { delay_ms, reply } => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_play_delayed(delay_ms);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongStretcherLatencyMs(reply) => {
                    let latency = engine
                        .runtime
                        .lock()
                        .ok()
                        .map(|mut r| r.song_stretcher_latency_ms())
                        .unwrap_or(0.0);
                    let _ = reply.send(latency);
                }
                AudioCommand::SongPause(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_pause();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongStop(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_stop();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongSeek { position_ms, reply } => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_seek_ms(position_ms);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongSetVolume { volume, reply } => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_set_volume(volume);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongSetSpeed { speed, reply } => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_set_speed(speed);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongSetTuning { semitones, reply } => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_set_tuning(semitones);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongSetLoop {
                    start_ms,
                    end_ms,
                    reply,
                } => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_set_loop_ms(start_ms, end_ms);
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongClearLoop(reply) => {
                    let result = engine.ensure_stream().and_then(|_| {
                        let mut runtime = engine
                            .runtime
                            .lock()
                            .map_err(|_| "audio_runtime_lock_failed".to_string())?;
                        runtime.song_clear_loop();
                        Ok(())
                    });
                    let _ = reply.send(result);
                }
                AudioCommand::SongGetPositionMs(reply) => {
                    let position = engine
                        .runtime
                        .lock()
                        .ok()
                        .map(|runtime| runtime.song_get_position_ms())
                        .unwrap_or(0.0);
                    let _ = reply.send(position);
                }
                AudioCommand::GetSampleRate(reply) => {
                    let rate = engine
                        .runtime
                        .lock()
                        .ok()
                        .map(|runtime| runtime.sample_rate.round().max(1.0) as u32)
                        .unwrap_or(44100);
                    let _ = reply.send(rate);
                }
            }
        }
    });
    tx
}
