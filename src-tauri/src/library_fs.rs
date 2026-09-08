use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::error::{map_io_error, AppError};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub file_name: String,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    pub path: String,
    pub metadata: FileMetadata,
}

pub fn file_metadata(path: &Path) -> Result<FileMetadata, AppError> {
    let metadata = std::fs::metadata(path).map_err(map_io_error)?;
    let size = metadata.len();
    let modified = metadata
        .modified()
        .map_err(map_io_error)?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AppError::Other(e.to_string()))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown.gp")
        .to_string();

    Ok(FileMetadata {
        file_name,
        size,
        modified_ms: modified.as_millis() as u64,
    })
}

pub fn read_file_bytes(path: &Path) -> Result<Vec<u8>, AppError> {
    std::fs::read(path).map_err(map_io_error)
}

pub fn read_file_base64(path: &Path) -> Result<String, AppError> {
    let bytes = read_file_bytes(path)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn file_metadata_reads_size() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("song.gp5");
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(b"abc").unwrap();

        let metadata = file_metadata(&file_path).unwrap();
        assert_eq!(metadata.file_name, "song.gp5");
        assert_eq!(metadata.size, 3);
        assert!(metadata.modified_ms > 0);
    }

    #[test]
    fn read_file_base64_encodes() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("song.gp5");
        let mut file = std::fs::File::create(&file_path).unwrap();
        file.write_all(b"abc").unwrap();

        let encoded = read_file_base64(&file_path).unwrap();
        assert_eq!(encoded, "YWJj");
    }
}
