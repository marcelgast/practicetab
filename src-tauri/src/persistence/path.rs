use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri::Runtime;

pub const DB_FILE_NAME: &str = "practicetab.sqlite";

pub fn db_path_from_app_data(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DB_FILE_NAME)
}

pub fn resolve_db_path<R: Runtime>(app_handle: &tauri::AppHandle<R>) -> tauri::Result<PathBuf> {
    let app_data = app_handle.path().app_data_dir()?;
    Ok(db_path_from_app_data(&app_data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_path_uses_app_data_dir() {
        let base = PathBuf::from("/tmp/app-data");
        let path = db_path_from_app_data(&base);
        assert_eq!(path, base.join(DB_FILE_NAME));
    }
}
