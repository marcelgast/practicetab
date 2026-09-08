use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;
use uuid::Uuid;

use super::commands::{now_iso, open_repo};
use super::repository::{LibraryItem, SongMap, SongSection, WaveformPeaksRow};
use crate::audio_decode::decoder::decode_audio_file;
use crate::audio_decode::waveform::compute_waveform_peaks;
use crate::error::AppError;
use crate::library_fs::{file_metadata, read_file_base64, FileMetadata, PickedFile};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItemPayload {
    pub id: String,
    pub title: String,
    pub source: LibrarySourcePayload,
    pub metadata: FileMetadata,
    pub created_at: String,
    pub updated_at: String,
    pub last_known_ok: bool,
    pub missing_reason: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LibrarySourcePayload {
    Reference {
        path: String,
    },
    Imported {
        managed_path: String,
        original_path: Option<String>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMapSaveInput {
    pub start_offset_ms: f64,
    pub sections: Vec<SongSectionInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongSectionInput {
    pub id: Option<String>,
    pub label: String,
    pub color: String,
    pub timestamp_ms: f64,
    pub sort_order: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMapPayload {
    pub library_item_id: String,
    pub start_offset_ms: f64,
    pub sections: Vec<SongSection>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformPeaksPayload {
    pub peaks: Vec<f32>,
    pub duration_ms: f64,
    pub sample_rate: u32,
}

fn peaks_blob_to_f32(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

fn peaks_f32_to_blob(peaks: &[f32]) -> Vec<u8> {
    peaks.iter().flat_map(|f| f.to_le_bytes()).collect()
}

#[tauri::command]
pub fn library_list(app_handle: AppHandle) -> Result<Vec<LibraryItemPayload>, AppError> {
    let repo = open_repo(&app_handle)?;
    let items = repo.list_library_items()?;
    Ok(items.into_iter().map(to_payload).collect())
}

#[tauri::command]
pub fn library_upsert(app_handle: AppHandle, item: LibraryItemPayload) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let repo_item = from_payload(item);
    repo.upsert_library_item(&repo_item)?;
    Ok(())
}

#[tauri::command]
pub fn library_delete(app_handle: AppHandle, id: String) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.delete_library_item(&id)?;
    Ok(())
}

#[tauri::command]
pub async fn library_pick_gp_files(app_handle: AppHandle) -> Result<Vec<PickedFile>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("Guitar Pro", &["gp3", "gp4", "gp5", "gpx", "gp"])
        .pick_files(move |files| {
            let _ = sender.send(files);
        });

    let files = receiver.await.map_err(|_| AppError::DialogFailed)?;
    let Some(files) = files else {
        return Ok(Vec::new());
    };

    let mut picks = Vec::new();
    for file_path in files {
        let path = file_path
            .into_path()
            .map_err(|e| AppError::Other(e.to_string()))?;
        let metadata = file_metadata(&path)?;
        picks.push(PickedFile {
            path: path.to_string_lossy().to_string(),
            metadata,
        });
    }
    Ok(picks)
}

#[tauri::command]
pub async fn library_pick_audio_files(app_handle: AppHandle) -> Result<Vec<PickedFile>, AppError> {
    let (sender, receiver) = oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("Audio Files", &["mp3", "wav", "flac", "ogg", "aac", "m4a"])
        .pick_files(move |files| {
            let _ = sender.send(files);
        });

    let files = receiver.await.map_err(|_| AppError::DialogFailed)?;
    let Some(files) = files else {
        return Ok(Vec::new());
    };

    let mut picks = Vec::new();
    for file_path in files {
        let path = file_path
            .into_path()
            .map_err(|e| AppError::Other(e.to_string()))?;
        let metadata = file_metadata(&path)?;
        picks.push(PickedFile {
            path: path.to_string_lossy().to_string(),
            metadata,
        });
    }
    Ok(picks)
}

#[tauri::command]
pub fn library_stat(path: String) -> Result<FileMetadata, AppError> {
    file_metadata(std::path::Path::new(&path))
}

#[tauri::command]
pub fn library_read_file_base64(path: String) -> Result<String, AppError> {
    read_file_base64(std::path::Path::new(&path))
}

#[tauri::command]
pub fn song_map_get(
    app_handle: AppHandle,
    library_item_id: String,
) -> Result<Option<SongMapPayload>, AppError> {
    let repo = open_repo(&app_handle)?;
    let Some(map) = repo.get_song_map(&library_item_id)? else {
        return Ok(None);
    };
    let sections = repo.list_song_sections(&library_item_id)?;
    Ok(Some(SongMapPayload {
        library_item_id: map.library_item_id,
        start_offset_ms: map.start_offset_ms,
        sections,
        created_at: map.created_at,
        updated_at: map.updated_at,
    }))
}

#[tauri::command]
pub fn song_map_save(
    app_handle: AppHandle,
    library_item_id: String,
    input: SongMapSaveInput,
) -> Result<SongMapPayload, AppError> {
    let repo = open_repo(&app_handle)?;
    let now = now_iso();
    let existing = repo.get_song_map(&library_item_id)?;
    let created_at = existing
        .map(|m| m.created_at)
        .unwrap_or_else(|| now.clone());

    let map = SongMap {
        library_item_id: library_item_id.clone(),
        start_offset_ms: input.start_offset_ms,
        created_at: created_at.clone(),
        updated_at: now.clone(),
    };
    repo.upsert_song_map(&map)?;

    let sections: Vec<SongSection> = input
        .sections
        .into_iter()
        .map(|s| SongSection {
            id: s.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            library_item_id: library_item_id.clone(),
            label: s.label,
            color: s.color,
            timestamp_ms: s.timestamp_ms,
            sort_order: s.sort_order,
            created_at: now.clone(),
        })
        .collect();

    repo.replace_song_sections(&library_item_id, &sections)?;

    Ok(SongMapPayload {
        library_item_id,
        start_offset_ms: map.start_offset_ms,
        sections,
        created_at,
        updated_at: now,
    })
}

#[tauri::command]
pub fn song_map_delete(app_handle: AppHandle, library_item_id: String) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.delete_song_map(&library_item_id)?;
    Ok(())
}

#[tauri::command]
pub async fn waveform_compute_and_store(
    app_handle: AppHandle,
    library_item_id: String,
    path: String,
    num_peaks: usize,
) -> Result<WaveformPeaksPayload, AppError> {
    let handle = app_handle.clone();
    tokio::task::spawn_blocking(move || {
        let file_path = Path::new(&path);
        if !file_path.is_file() {
            return Err(AppError::AudioDecode(format!("file not found: {path}")));
        }

        let decoded = decode_audio_file(file_path)?;
        let peaks = compute_waveform_peaks(&decoded.samples, num_peaks);

        let row = WaveformPeaksRow {
            library_item_id,
            peaks: peaks_f32_to_blob(&peaks),
            duration_ms: decoded.duration_ms,
            sample_rate: decoded.sample_rate,
            created_at: now_iso(),
        };

        let repo = open_repo(&handle)?;
        repo.upsert_waveform_peaks(&row)?;

        Ok(WaveformPeaksPayload {
            peaks,
            duration_ms: decoded.duration_ms,
            sample_rate: decoded.sample_rate,
        })
    })
    .await
    .map_err(|e| AppError::AudioDecode(format!("task join error: {e}")))?
}

#[tauri::command]
pub fn waveform_get_stored(
    app_handle: AppHandle,
    library_item_id: String,
) -> Result<Option<WaveformPeaksPayload>, AppError> {
    let repo = open_repo(&app_handle)?;
    let Some(row) = repo.get_waveform_peaks(&library_item_id)? else {
        return Ok(None);
    };
    Ok(Some(WaveformPeaksPayload {
        peaks: peaks_blob_to_f32(&row.peaks),
        duration_ms: row.duration_ms,
        sample_rate: row.sample_rate,
    }))
}

#[tauri::command]
pub fn waveform_delete_stored(
    app_handle: AppHandle,
    library_item_id: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.delete_waveform_peaks(&library_item_id)?;
    Ok(())
}

#[tauri::command]
pub fn waveform_store(
    app_handle: AppHandle,
    library_item_id: String,
    peaks: Vec<f32>,
    duration_ms: f64,
    sample_rate: u32,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let row = WaveformPeaksRow {
        library_item_id,
        peaks: peaks_f32_to_blob(&peaks),
        duration_ms,
        sample_rate,
        created_at: now_iso(),
    };
    repo.upsert_waveform_peaks(&row)?;
    Ok(())
}

pub(crate) fn to_payload(item: LibraryItem) -> LibraryItemPayload {
    let source = if item.source_kind == "imported" {
        LibrarySourcePayload::Imported {
            managed_path: item.source_path,
            original_path: item.original_path,
        }
    } else {
        LibrarySourcePayload::Reference {
            path: item.source_path,
        }
    };

    LibraryItemPayload {
        id: item.id,
        title: item.title,
        source,
        metadata: FileMetadata {
            file_name: item.file_name,
            size: item.size as u64,
            modified_ms: item.modified_ms as u64,
        },
        created_at: item.created_at,
        updated_at: item.updated_at,
        last_known_ok: item.last_known_ok,
        missing_reason: item.missing_reason,
    }
}

pub(crate) fn from_payload(item: LibraryItemPayload) -> LibraryItem {
    let (source_kind, source_path, original_path) = match item.source {
        LibrarySourcePayload::Reference { path } => ("reference".to_string(), path, None),
        LibrarySourcePayload::Imported {
            managed_path,
            original_path,
        } => ("imported".to_string(), managed_path, original_path),
    };

    LibraryItem {
        id: item.id,
        title: item.title,
        source_kind,
        source_path,
        original_path,
        file_name: item.metadata.file_name,
        size: item.metadata.size as i64,
        modified_ms: item.metadata.modified_ms as i64,
        created_at: item.created_at,
        updated_at: item.updated_at,
        last_known_ok: item.last_known_ok,
        missing_reason: item.missing_reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn library_payload_roundtrip() {
        let item = LibraryItem {
            id: "item-1".to_string(),
            title: "Song".to_string(),
            source_kind: "reference".to_string(),
            source_path: "/tmp/song.gp".to_string(),
            original_path: None,
            file_name: "song.gp".to_string(),
            size: 123,
            modified_ms: 456,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
            last_known_ok: true,
            missing_reason: None,
        };

        let payload = to_payload(item.clone());
        assert_eq!(payload.title, item.title);
        let back = from_payload(payload);
        assert_eq!(back.source_kind, item.source_kind);
        assert_eq!(back.source_path, item.source_path);
    }

    #[test]
    fn library_payload_imported_roundtrip() {
        let item = LibraryItem {
            id: "item-2".to_string(),
            title: "Imported Song".to_string(),
            source_kind: "imported".to_string(),
            source_path: "/managed/song.gp".to_string(),
            original_path: Some("/original/song.gp".to_string()),
            file_name: "song.gp".to_string(),
            size: 321,
            modified_ms: 654,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
            last_known_ok: false,
            missing_reason: Some("moved".to_string()),
        };

        let payload = to_payload(item.clone());
        match &payload.source {
            LibrarySourcePayload::Imported {
                managed_path,
                original_path,
            } => {
                assert_eq!(managed_path, &item.source_path);
                assert_eq!(original_path.as_deref(), item.original_path.as_deref());
            }
            _ => panic!("expected imported payload"),
        }
        let back = from_payload(payload);
        assert_eq!(back.source_kind, "imported");
        assert_eq!(back.source_path, item.source_path);
        assert_eq!(back.original_path, item.original_path);
        assert_eq!(back.missing_reason, item.missing_reason);
    }

    #[test]
    fn library_stat_reads_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.gp");
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(b"abc").unwrap();

        let metadata = library_stat(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(metadata.file_name, "song.gp");
        assert_eq!(metadata.size, 3);
        assert!(metadata.modified_ms > 0);
    }

    #[test]
    fn library_stat_returns_not_found() {
        let missing = std::env::temp_dir()
            .join(format!("missing_{}.gp", uuid::Uuid::new_v4()))
            .to_string_lossy()
            .to_string();
        let result = library_stat(missing);
        assert_eq!(result.unwrap_err().to_string(), "not_found");
    }

    #[test]
    fn library_read_file_base64_encodes_contents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("song.gp");
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(b"abc").unwrap();

        let encoded = library_read_file_base64(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(encoded, "YWJj");
    }
}
