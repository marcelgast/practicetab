use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalSize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub fullscreen: bool,
    pub maximized: bool,
}

pub fn logical_size_from_physical(size: PhysicalSize<u32>, scale: f64) -> LogicalSize<u32> {
    let logical: LogicalSize<f64> = size.to_logical(scale.max(1.0));
    LogicalSize::new(
        logical.width.round().max(1.0) as u32,
        logical.height.round().max(1.0) as u32,
    )
}

pub fn window_state_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("window-state.json"))
}

pub fn load_window_state(path: &Path) -> Option<WindowState> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn save_window_state(path: &Path, state: &WindowState) -> Result<(), std::io::Error> {
    let data = serde_json::to_vec_pretty(state).map_err(std::io::Error::other)?;
    fs::write(path, data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::PhysicalSize;
    use tempfile::tempdir;

    #[test]
    fn saves_and_loads_window_state() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("state.json");
        let state = WindowState {
            width: 1280,
            height: 720,
            fullscreen: false,
            maximized: true,
        };
        save_window_state(&path, &state).expect("save");
        let loaded = load_window_state(&path).expect("load");
        assert_eq!(loaded, state);
    }

    #[test]
    fn converts_physical_to_logical_size() {
        let physical = PhysicalSize::new(1500, 900);
        let logical = logical_size_from_physical(physical, 1.5);
        assert_eq!(logical.width, 1000);
        assert_eq!(logical.height, 600);
    }
}
