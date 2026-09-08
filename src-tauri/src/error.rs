use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Db(#[from] rusqlite::Error),

    #[error("not_found")]
    IoNotFound,

    #[error("no_permission")]
    IoPermissionDenied,

    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Base64(#[from] base64::DecodeError),

    #[error("{0}")]
    Tauri(#[from] tauri::Error),

    #[error("dialog_failed")]
    DialogFailed,

    #[error("invalid_relative_path")]
    InvalidRelativePath,

    #[error("audio_command_failed")]
    AudioCommandFailed,

    #[error("audio_runtime_lock_failed")]
    AudioRuntimeLockFailed,

    #[error("audio_state_lock_failed")]
    AudioStateLockFailed,

    #[error("{0}")]
    Audio(String),

    #[error("{0}")]
    AudioDecode(String),

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Maps `std::io::Error` to semantic `AppError` variants.
pub fn map_io_error(error: std::io::Error) -> AppError {
    match error.kind() {
        std::io::ErrorKind::NotFound => AppError::IoNotFound,
        std::io::ErrorKind::PermissionDenied => AppError::IoPermissionDenied,
        _ => AppError::Io(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_not_found_displays_as_not_found() {
        assert_eq!(AppError::IoNotFound.to_string(), "not_found");
    }

    #[test]
    fn io_permission_denied_displays_as_no_permission() {
        assert_eq!(AppError::IoPermissionDenied.to_string(), "no_permission");
    }

    #[test]
    fn dialog_failed_displays_correctly() {
        assert_eq!(AppError::DialogFailed.to_string(), "dialog_failed");
    }

    #[test]
    fn map_io_error_maps_common_kinds() {
        let not_found = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert!(matches!(map_io_error(not_found), AppError::IoNotFound));

        let denied = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        assert!(matches!(map_io_error(denied), AppError::IoPermissionDenied));

        let other = std::io::Error::other("boom");
        assert!(matches!(map_io_error(other), AppError::Io(_)));
    }

    #[test]
    fn serialize_produces_string() {
        let json = serde_json::to_string(&AppError::IoNotFound).unwrap();
        assert_eq!(json, "\"not_found\"");
    }
}
