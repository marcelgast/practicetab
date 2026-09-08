use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use super::bridge::AudioInputBridge;
use super::commands::{spawn_input_engine, AudioInputCommand};
use super::types::{InputDevice, InputStatus};

pub struct AudioInputState {
    tx: Mutex<Option<Sender<AudioInputCommand>>>,
    bridge: Arc<AudioInputBridge>,
}

impl AudioInputState {
    pub fn new() -> Self {
        let bridge = Arc::new(AudioInputBridge::new());
        Self {
            tx: Mutex::new(Some(spawn_input_engine(Arc::clone(&bridge)))),
            bridge,
        }
    }

    /// Shared bridge handle so downstream analyzers (pitch detector) can
    /// poll the live ring consumer without going through the command worker.
    pub(crate) fn bridge(&self) -> Arc<AudioInputBridge> {
        Arc::clone(&self.bridge)
    }

    /// Clone of the command sender for other audio subsystems (pitch
    /// detector) that need to orchestrate input start/stop as part of
    /// their own lifecycle without holding a `tauri::State` reference.
    pub(crate) fn command_sender(&self) -> Option<Sender<AudioInputCommand>> {
        self.tx.lock().ok().and_then(|guard| guard.clone())
    }

    fn sender(&self) -> Result<Sender<AudioInputCommand>, ()> {
        self.tx
            .lock()
            .map_err(|_| ())
            .and_then(|guard| guard.clone().ok_or(()))
    }
}

#[tauri::command]
pub fn audio_list_input_devices(state: tauri::State<'_, AudioInputState>) -> Vec<InputDevice> {
    let Ok(sender) = state.sender() else {
        return Vec::new();
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioInputCommand::List(reply_tx));
    reply_rx.recv().unwrap_or_default()
}

#[tauri::command]
pub fn audio_refresh_input_devices(state: tauri::State<'_, AudioInputState>) -> Vec<InputDevice> {
    let Ok(sender) = state.sender() else {
        return Vec::new();
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioInputCommand::Refresh(reply_tx));
    reply_rx.recv().unwrap_or_default()
}

#[tauri::command]
pub fn audio_get_input_device(state: tauri::State<'_, AudioInputState>) -> Option<String> {
    let Ok(sender) = state.sender() else {
        return None;
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioInputCommand::GetDevice(reply_tx));
    reply_rx.recv().ok().flatten()
}

#[tauri::command]
pub fn audio_set_input_device(
    state: tauri::State<'_, AudioInputState>,
    device_id: Option<String>,
) -> Result<(), String> {
    let sender = state
        .sender()
        .map_err(|_| "audio_input_sender_missing".to_string())?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioInputCommand::SetDevice(device_id, reply_tx))
        .map_err(|_| "audio_input_command_failed".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "audio_input_reply_failed".to_string())?
}

#[tauri::command]
pub fn audio_get_input_channel(state: tauri::State<'_, AudioInputState>) -> Option<u16> {
    let Ok(sender) = state.sender() else {
        return None;
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioInputCommand::GetChannel(reply_tx));
    reply_rx.recv().ok().flatten()
}

#[tauri::command]
pub fn audio_set_input_channel(
    state: tauri::State<'_, AudioInputState>,
    channel: Option<u16>,
) -> Result<(), String> {
    // Rename the incoming `channel` so it doesn't shadow the
    // `std::sync::mpsc::channel` constructor imported at the top.
    let selected = channel;
    let sender = state
        .sender()
        .map_err(|_| "audio_input_sender_missing".to_string())?;
    let (reply_tx, reply_rx) = std::sync::mpsc::channel();
    sender
        .send(AudioInputCommand::SetChannel(selected, reply_tx))
        .map_err(|_| "audio_input_command_failed".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "audio_input_reply_failed".to_string())?
}

#[tauri::command]
pub fn audio_start_input(state: tauri::State<'_, AudioInputState>) -> Result<(), String> {
    let sender = state
        .sender()
        .map_err(|_| "audio_input_sender_missing".to_string())?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioInputCommand::Start(reply_tx))
        .map_err(|_| "audio_input_command_failed".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "audio_input_reply_failed".to_string())?
}

#[tauri::command]
pub fn audio_stop_input(state: tauri::State<'_, AudioInputState>) -> Result<(), String> {
    let sender = state
        .sender()
        .map_err(|_| "audio_input_sender_missing".to_string())?;
    let (reply_tx, reply_rx) = channel();
    sender
        .send(AudioInputCommand::Stop(reply_tx))
        .map_err(|_| "audio_input_command_failed".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "audio_input_reply_failed".to_string())?
}

#[tauri::command]
pub fn audio_get_input_status(state: tauri::State<'_, AudioInputState>) -> InputStatus {
    let Ok(sender) = state.sender() else {
        return InputStatus::stopped();
    };
    let (reply_tx, reply_rx) = channel();
    let _ = sender.send(AudioInputCommand::GetStatus(reply_tx));
    reply_rx.recv().unwrap_or_else(|_| InputStatus::stopped())
}

/// Current OS-level microphone permission status. On Windows /
/// Linux the permission module returns `Authorized` because there
/// is no per-app prompt model we'd integrate with — see
/// `permission.rs` for the rationale.
#[tauri::command]
pub fn audio_input_permission_status() -> super::permission::MicPermissionStatus {
    super::permission::current_status()
}

/// Trigger the OS permission prompt (macOS) and resolve once the
/// user accepts or declines. Returns `true` when access is granted
/// (either now or already-granted), `false` when denied or
/// restricted. On Windows / Linux the call resolves to `true`
/// immediately — same reasoning as `audio_input_permission_status`.
///
/// Apple's API only shows the prompt when the current status is
/// `NotDetermined`; once the user has decided, the prompt is gone
/// for good and the only way to flip the verdict is System
/// Settings → Privacy & Security → Microphone. The frontend uses
/// the status check to decide which UX to show (prompt-now button
/// vs deeplink-to-settings).
#[tauri::command]
pub async fn audio_input_request_permission() -> bool {
    super::permission::request_access().await
}

/// Open the OS-level microphone privacy settings pane.
///
/// We can't use `tauri-plugin-opener` for this because its default
/// permission set rejects custom URI schemes
/// (`x-apple.systempreferences:`, `ms-settings:`) before they reach
/// the OS. The native helper shells out to `open` / `cmd /C start`
/// directly — see `permission::open_microphone_settings` for the
/// platform-specific deeplink rationale.
#[tauri::command]
pub fn audio_input_open_system_settings() -> Result<(), String> {
    super::permission::open_microphone_settings()
}
