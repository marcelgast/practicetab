use serde::Serialize;

/// Raw decoded audio data (internal use).
#[allow(dead_code)]
pub struct DecodedAudio {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_ms: f64,
}

/// Waveform peak data sent to the frontend.
#[derive(Debug, Serialize)]
pub struct WaveformPeaks {
    pub peaks: Vec<f32>,
    pub duration_ms: f64,
    pub sample_rate: u32,
}
