use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::{fs::OpenOptions, io::Write};

fn resolve_repo_root_from_cwd(cwd: &Path) -> PathBuf {
    if cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
        return cwd
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| cwd.to_path_buf());
    }
    cwd.to_path_buf()
}

#[tauri::command]
pub fn dev_get_log_path() -> Result<String, AppError> {
    let cwd = std::env::current_dir()?;
    let repo_root = resolve_repo_root_from_cwd(&cwd);
    let log_dir = repo_root.join("var").join("logs");
    std::fs::create_dir_all(&log_dir)?;
    let path = log_dir.join("dev.log");
    Ok(path.to_string_lossy().to_string())
}

pub fn dev_append_log_line(line: &str) {
    if !cfg!(debug_assertions) {
        return;
    }
    if line.trim().is_empty() {
        return;
    }
    let cwd = match std::env::current_dir() {
        Ok(value) => value,
        Err(_) => return,
    };
    let repo_root = resolve_repo_root_from_cwd(&cwd);
    let log_dir = repo_root.join("var").join("logs");
    if std::fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let path = log_dir.join("dev.log");
    let mut file = match OpenOptions::new().create(true).append(true).open(path) {
        Ok(handle) => handle,
        Err(_) => return,
    };
    let _ = writeln!(file, "{line}");
}

#[cfg(test)]
mod tests {
    use super::resolve_repo_root_from_cwd;
    use std::path::PathBuf;

    #[test]
    fn resolves_repo_root_from_src_tauri() {
        let cwd = PathBuf::from("/Users/test/practicetab/src-tauri");
        let root = resolve_repo_root_from_cwd(&cwd);
        assert_eq!(root, PathBuf::from("/Users/test/practicetab"));
    }

    #[test]
    fn keeps_repo_root_when_not_src_tauri() {
        let cwd = PathBuf::from("/Users/test/practicetab");
        let root = resolve_repo_root_from_cwd(&cwd);
        assert_eq!(root, PathBuf::from("/Users/test/practicetab"));
    }
}
