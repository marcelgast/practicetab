use std::path::PathBuf;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use super::commands::{spawn_engine, AudioCommand};
use super::song_stream::SongStreamHandle;
use super::types::{
    AlphaTabMetronomeTickPayload, AudioEventPayload, MetronomeConfigPayload, OutputDevice,
    TempoPointPayload, TrackStatePayload,
};

#[derive(Default)]
pub struct AudioState {
    tx: Mutex<Option<Sender<AudioCommand>>>,
    current_midi_smf: Mutex<Option<Vec<u8>>>,
}

impl AudioState {
    pub fn new(sound_font_path: PathBuf) -> Self {
        Self {
            tx: Mutex::new(Some(spawn_engine(sound_font_path))),
            current_midi_smf: Mutex::new(None),
        }
    }

    fn sender(&self) -> Result<Sender<AudioCommand>, crate::error::AppError> {
        self.tx
            .lock()
            .map_err(|_| crate::error::AppError::AudioStateLockFailed)
            .and_then(|guard| {
                guard.clone().ok_or(crate::error::AppError::Audio(
                    "audio_sender_missing".to_string(),
                ))
            })
    }

    fn set_current_midi_smf(&self, midi_bytes: Vec<u8>) -> Result<(), crate::error::AppError> {
        if !is_valid_smf(&midi_bytes) {
            return Err(crate::error::AppError::Audio(
                "invalid_midi_smf".to_string(),
            ));
        }
        let mut guard = self
            .current_midi_smf
            .lock()
            .map_err(|_| crate::error::AppError::AudioStateLockFailed)?;
        *guard = Some(midi_bytes);
        Ok(())
    }
}

impl AudioState {
    fn get_sample_rate(&self) -> Result<u32, crate::error::AppError> {
        let sender = self.sender()?;
        let (reply_tx, reply_rx) = channel();
        sender
            .send(AudioCommand::GetSampleRate(reply_tx))
            .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
        reply_rx
            .recv()
            .map_err(|_| crate::error::AppError::Audio("sample_rate_query_failed".to_string()))
    }
}

pub(crate) fn is_valid_smf(midi_bytes: &[u8]) -> bool {
    midi_bytes.len() >= 14 && midi_bytes.starts_with(b"MThd")
}

#[tauri::command]
pub fn audio_list_output_devices(state: tauri::State<'_, AudioState>) -> Vec<OutputDevice> {
    let Ok(sender) = state.sender() else {
        return Vec::new();
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioCommand::List(reply_tx));
    reply_rx.recv().unwrap_or_default()
}

#[tauri::command]
pub fn audio_refresh_output_devices(state: tauri::State<'_, AudioState>) -> Vec<OutputDevice> {
    let Ok(sender) = state.sender() else {
        return Vec::new();
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioCommand::Refresh(reply_tx));
    reply_rx.recv().unwrap_or_default()
}

#[tauri::command]
pub fn audio_get_output_device(state: tauri::State<'_, AudioState>) -> Option<String> {
    let Ok(sender) = state.sender() else {
        return None;
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioCommand::GetDevice(reply_tx));
    reply_rx.recv().ok().flatten()
}

#[tauri::command]
pub fn audio_set_output_device(
    state: tauri::State<'_, AudioState>,
    device_id: Option<String>,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SetDevice(device_id, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_set_master_volume(
    state: tauri::State<'_, AudioState>,
    percent0to100: u8,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SetVolume(percent0to100, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_set_tab_volume(
    state: tauri::State<'_, AudioState>,
    percent0to100: u8,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SetTabVolume(percent0to100, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_get_master_volume(state: tauri::State<'_, AudioState>) -> u8 {
    let Ok(sender) = state.sender() else {
        return 100;
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioCommand::GetVolume(reply_tx));
    reply_rx.recv().unwrap_or(100)
}

#[tauri::command]
pub fn audio_tab_prepare(
    state: tauri::State<'_, AudioState>,
    track_ids: Vec<String>,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabPrepare(track_ids, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_schedule_events(
    state: tauri::State<'_, AudioState>,
    events: Vec<AudioEventPayload>,
    tempo_map: Vec<TempoPointPayload>,
    midi_division: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabSchedule(
            events,
            tempo_map,
            midi_division,
            reply_tx,
        ))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_play(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabPlay(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_pause(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabPause(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_stop(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabStop(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_seek(
    state: tauri::State<'_, AudioState>,
    position_ms: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabSeek(position_ms, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn seek_to_tick(
    state: tauri::State<'_, AudioState>,
    tick: i64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabSeekTick(tick, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_seek(
    state: tauri::State<'_, AudioState>,
    tick: i64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabSeekTick(tick, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_seek_and_play(
    state: tauri::State<'_, AudioState>,
    tick: i64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabSeekAndPlay(tick, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_set_tempo_factor(
    state: tauri::State<'_, AudioState>,
    factor: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabTempo(factor, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_set_track_state(
    state: tauri::State<'_, AudioState>,
    payload: TrackStatePayload,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabTrackState(payload, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_set_loop_range(
    state: tauri::State<'_, AudioState>,
    start_ms: f64,
    end_ms: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabSetLoopRange(start_ms, end_ms, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_clear_loop_range(
    state: tauri::State<'_, AudioState>,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabClearLoopRange(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_get_position_ms(state: tauri::State<'_, AudioState>) -> f64 {
    let Ok(sender) = state.sender() else {
        return 0.0;
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioCommand::TabGetPosition(reply_tx));
    reply_rx.recv().unwrap_or(0.0)
}

#[tauri::command]
pub fn audio_tab_set_tuning(
    state: tauri::State<'_, AudioState>,
    tuning_semitones: i8,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::TabSetTuning(tuning_semitones, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_tab_set_current_midi(
    state: tauri::State<'_, AudioState>,
    midi_bytes: Vec<u8>,
) -> Result<(), crate::error::AppError> {
    state.set_current_midi_smf(midi_bytes)
}

#[tauri::command]
pub fn metronome_start(
    state: tauri::State<'_, AudioState>,
    config: MetronomeConfigPayload,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::MetronomeStart(config, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn metronome_stop(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::MetronomeStop(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn metronome_set_config(
    state: tauri::State<'_, AudioState>,
    config: MetronomeConfigPayload,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::MetronomeSetConfig(config, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn metronome_tick_from_alphatab(
    state: tauri::State<'_, AudioState>,
    payload: AlphaTabMetronomeTickPayload,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::MetronomeTickFromAlphaTab(payload, reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn metronome_cancel_scheduled(
    state: tauri::State<'_, AudioState>,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::MetronomeCancelScheduled(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn metronome_beep(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::MetronomeBeep(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

// ── Song playback commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn audio_song_load(
    state: tauri::State<'_, AudioState>,
    path: String,
) -> Result<f64, crate::error::AppError> {
    let sample_rate = state.get_sample_rate()?;

    // Instant: only opens the file and reads metadata, no decoding
    let stream = SongStreamHandle::open_file(&path, sample_rate)?;
    let duration_ms = stream.duration_ms();
    let stream = Arc::new(Mutex::new(stream));

    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongLoad {
            stream,
            reply: reply_tx,
        })
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)?;
    Ok(duration_ms)
}

#[tauri::command]
pub fn audio_song_unload(
    state: tauri::State<'_, AudioState>,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongUnload(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_play(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongPlay(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_play_delayed(
    state: tauri::State<'_, AudioState>,
    delay_ms: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongPlayDelayed {
            delay_ms,
            reply: reply_tx,
        })
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_stretcher_latency_ms(state: tauri::State<'_, AudioState>) -> f64 {
    let Ok(sender) = state.sender() else {
        return 0.0;
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioCommand::SongStretcherLatencyMs(reply_tx));
    reply_rx.recv().unwrap_or(0.0)
}

#[tauri::command]
pub fn audio_song_pause(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongPause(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_stop(state: tauri::State<'_, AudioState>) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongStop(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_seek(
    state: tauri::State<'_, AudioState>,
    position_ms: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongSeek {
            position_ms,
            reply: reply_tx,
        })
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_set_volume(
    state: tauri::State<'_, AudioState>,
    volume: f32,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongSetVolume {
            volume,
            reply: reply_tx,
        })
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_set_speed(
    state: tauri::State<'_, AudioState>,
    speed: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongSetSpeed {
            speed,
            reply: reply_tx,
        })
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_set_tuning(
    state: tauri::State<'_, AudioState>,
    semitones: i8,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongSetTuning {
            semitones,
            reply: reply_tx,
        })
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_set_loop(
    state: tauri::State<'_, AudioState>,
    start_ms: f64,
    end_ms: f64,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongSetLoop {
            start_ms,
            end_ms,
            reply: reply_tx,
        })
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_clear_loop(
    state: tauri::State<'_, AudioState>,
) -> Result<(), crate::error::AppError> {
    let sender = state.sender()?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioCommand::SongClearLoop(reply_tx))
        .map_err(|_| crate::error::AppError::AudioCommandFailed)?;
    reply_rx
        .recv()
        .unwrap_or_else(|_| Err("audio_command_failed".to_string()))
        .map_err(crate::error::AppError::Audio)
}

#[tauri::command]
pub fn audio_song_get_position_ms(state: tauri::State<'_, AudioState>) -> f64 {
    let Ok(sender) = state.sender() else {
        return 0.0;
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioCommand::SongGetPositionMs(reply_tx));
    reply_rx.recv().unwrap_or(0.0)
}
