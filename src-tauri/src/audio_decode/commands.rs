use std::path::Path;

use crate::error::AppError;

use super::decoder::decode_audio_file;
use super::types::WaveformPeaks;
use super::waveform::compute_waveform_peaks;

/// Tauri command: decode an audio file and return waveform peaks.
#[tauri::command]
pub fn audio_decode_waveform(path: String, num_peaks: usize) -> Result<WaveformPeaks, AppError> {
    let file_path = Path::new(&path);

    if !file_path.is_file() {
        return Err(AppError::AudioDecode(format!("file not found: {path}")));
    }

    let decoded = decode_audio_file(file_path)?;

    let peaks = compute_waveform_peaks(&decoded.samples, num_peaks);

    Ok(WaveformPeaks {
        peaks,
        duration_ms: decoded.duration_ms,
        sample_rate: decoded.sample_rate,
    })
}
