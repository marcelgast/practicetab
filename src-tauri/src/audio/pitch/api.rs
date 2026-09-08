//! Tauri-facing API for the pitch detection engine. Thin wrappers around the
//! `PitchCommand` mpsc channel owned by the worker thread.

use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use tauri::AppHandle;

use super::engine::{spawn_pitch_worker, PitchCommand};
use super::types::PitchConfig;
use crate::audio::input::{AudioInputBridge, AudioInputCommand, AudioInputState};

pub struct AudioPitchState {
    tx: Mutex<Option<Sender<PitchCommand>>>,
}

impl AudioPitchState {
    pub fn new(bridge: Arc<AudioInputBridge>, app: AppHandle) -> Self {
        let (tx, rx) = channel();
        spawn_pitch_worker(bridge, app, rx);
        Self {
            tx: Mutex::new(Some(tx)),
        }
    }

    fn sender(&self) -> Result<Sender<PitchCommand>, String> {
        self.tx
            .lock()
            .map_err(|_| "audio_pitch_sender_lock_failed".to_string())?
            .clone()
            .ok_or_else(|| "audio_pitch_sender_missing".to_string())
    }
}

#[tauri::command]
pub fn audio_start_pitch_detection(
    state: tauri::State<'_, AudioPitchState>,
    input_state: tauri::State<'_, AudioInputState>,
) -> Result<(), String> {
    // Pitch detection requires a live input stream — orchestrate both here
    // so callers cannot land in a "listening but not capturing" state
    // (PR 3.2 review finding 1). Input is started first so the worker's
    // first tick already sees a valid sample rate from the bridge; on
    // failure of the pitch start we roll the input back to avoid leaving
    // it running unnecessarily.
    //
    // NOTE: once other subsystems start consuming the input stream this
    // becomes ref-counted. For PR 3.2 the pitch detector is the sole
    // consumer so unconditional start/stop is safe and idempotent
    // (InputEngine::start returns Ok(()) when already running).
    send_input_command(&input_state, InputLifecycle::Start)?;
    let pitch_result = state
        .sender()?
        .send(PitchCommand::Start)
        .map_err(|_| "audio_pitch_command_failed".to_string());
    if pitch_result.is_err() {
        // Roll input back so the user doesn't end up with an orphan
        // capture after a pitch start failure.
        let _ = send_input_command(&input_state, InputLifecycle::Stop);
    }
    pitch_result
}

#[tauri::command]
pub fn audio_stop_pitch_detection(
    state: tauri::State<'_, AudioPitchState>,
    input_state: tauri::State<'_, AudioInputState>,
) -> Result<(), String> {
    // Stop pitch first so the worker releases the analyzer before the
    // input stream tears down the ring.
    let pitch_stop = state
        .sender()?
        .send(PitchCommand::Stop)
        .map_err(|_| "audio_pitch_command_failed".to_string());
    // Input stop is best-effort — a dead input sender should not mask a
    // successful pitch stop, and vice versa.
    let _ = send_input_command(&input_state, InputLifecycle::Stop);
    pitch_stop
}

enum InputLifecycle {
    Start,
    Stop,
}

fn send_input_command(
    input_state: &tauri::State<'_, AudioInputState>,
    kind: InputLifecycle,
) -> Result<(), String> {
    let sender = input_state
        .command_sender()
        .ok_or_else(|| "audio_input_sender_missing".to_string())?;
    let (reply_tx, reply_rx) = channel();
    let command = match kind {
        InputLifecycle::Start => AudioInputCommand::Start(reply_tx),
        InputLifecycle::Stop => AudioInputCommand::Stop(reply_tx),
    };
    sender
        .send(command)
        .map_err(|_| "audio_input_command_failed".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "audio_input_reply_failed".to_string())?
}

#[tauri::command]
pub fn audio_set_pitch_config(
    state: tauri::State<'_, AudioPitchState>,
    config: PitchConfig,
) -> Result<(), String> {
    // Never trust the frontend-provided config verbatim — sanitise at the
    // boundary so zero/huge window sizes, NaN thresholds, or hops > window
    // can never drive `PitchAnalyzer::new` into pathological state.
    let sanitized = config.normalized();
    state
        .sender()?
        .send(PitchCommand::SetConfig(sanitized))
        .map_err(|_| "audio_pitch_command_failed".to_string())
}

#[tauri::command]
pub fn audio_is_pitch_listening(state: tauri::State<'_, AudioPitchState>) -> bool {
    let Ok(sender) = state.sender() else {
        return false;
    };
    let (reply_tx, reply_rx) = channel();
    if sender.send(PitchCommand::IsListening(reply_tx)).is_err() {
        return false;
    }
    reply_rx.recv().unwrap_or(false)
}
