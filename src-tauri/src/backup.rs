use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::sync::oneshot;

use crate::error::{map_io_error, AppError};

/// Awaits a dialog result and converts it to an optional path string.
async fn receive_file_path(
    receiver: oneshot::Receiver<Option<FilePath>>,
) -> Result<Option<String>, AppError> {
    let file = receiver.await.map_err(|_| AppError::DialogFailed)?;
    let Some(file) = file else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn backup_pick_save_file(app_handle: AppHandle) -> Result<Option<String>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("PracticeTab Backup", &["ptbackup"])
        .save_file(move |file| {
            let _ = sender.send(file);
        });
    receive_file_path(receiver).await
}

#[tauri::command]
pub async fn backup_pick_open_file(app_handle: AppHandle) -> Result<Option<String>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("PracticeTab Backup", &["ptbackup"])
        .pick_file(move |file| {
            let _ = sender.send(file);
        });
    receive_file_path(receiver).await
}

#[tauri::command]
pub async fn backup_pick_folder(app_handle: AppHandle) -> Result<Option<String>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle.dialog().file().pick_folder(move |folder| {
        let _ = sender.send(folder);
    });
    receive_file_path(receiver).await
}

#[tauri::command]
pub async fn share_pick_save_file(app_handle: AppHandle) -> Result<Option<String>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("PracticeTab Share", &["ptshare"])
        .save_file(move |file| {
            let _ = sender.send(file);
        });
    receive_file_path(receiver).await
}

#[tauri::command]
pub async fn share_pick_open_file(app_handle: AppHandle) -> Result<Option<String>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("PracticeTab Share", &["ptshare"])
        .pick_file(move |file| {
            let _ = sender.send(file);
        });
    receive_file_path(receiver).await
}

#[tauri::command]
pub async fn share_pick_tab_save_file(
    app_handle: AppHandle,
    file_name: String,
) -> Result<Option<String>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("Guitar Pro", &["gp3", "gp4", "gp5", "gpx", "gp"])
        .set_title("Save Tab File")
        .set_file_name(file_name)
        .save_file(move |file| {
            let _ = sender.send(file);
        });
    receive_file_path(receiver).await
}

#[tauri::command]
pub fn backup_read_file_base64(path: String) -> Result<String, AppError> {
    let bytes = std::fs::read(Path::new(&path)).map_err(map_io_error)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn backup_write_file_base64(path: String, data_base64: String) -> Result<(), AppError> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data_base64.as_bytes())?;
    std::fs::write(Path::new(&path), bytes).map_err(map_io_error)?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupWriteFileInput {
    pub relative_path: String,
    pub data_base64: String,
}

#[tauri::command]
pub fn backup_write_embedded_files(
    base_dir: String,
    files: Vec<BackupWriteFileInput>,
) -> Result<Vec<String>, AppError> {
    let base = PathBuf::from(&base_dir);
    std::fs::create_dir_all(&base).map_err(map_io_error)?;
    let mut written = Vec::new();

    for file in files {
        if file.relative_path.contains("..") {
            return Err(AppError::InvalidRelativePath);
        }
        let path = base.join(&file.relative_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(map_io_error)?;
        }
        let bytes =
            base64::engine::general_purpose::STANDARD.decode(file.data_base64.as_bytes())?;
        std::fs::write(&path, bytes).map_err(map_io_error)?;
        written.push(path.to_string_lossy().to_string());
    }

    Ok(written)
}
