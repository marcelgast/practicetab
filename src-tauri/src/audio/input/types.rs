use serde::Serialize;

/// Minimum ring buffer capacity (samples, mono, f32).
///
/// At 48 kHz this holds ~85 ms of audio, which is ample head-room for the
/// downstream analyzer (tuner) without wasting memory. Rounded up to the
/// next power of two by the ring implementation.
pub(crate) const INPUT_RING_CAPACITY: usize = 4096;

/// Requested cpal buffer size in frames per callback.
///
/// Kept deliberately low (< 256 per project constraints) to minimise
/// capture-to-analysis latency. Drivers may clamp this to a device-specific
/// range — the final chosen value is observed via `StreamConfig.buffer_size`.
pub(crate) const DEFAULT_INPUT_BUFFER_FRAMES: u32 = 128;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    /// Maximum number of input channels the device exposes across
    /// every supported configuration. Surfaced to the frontend so
    /// the Settings page can populate a channel picker when
    /// `channels > 1` (multi-input interfaces like a Scarlett 4i4)
    /// and hide it when `channels <= 1`. `0` means "unknown" — the
    /// device enumerated but supported configs couldn't be read; the
    /// picker should be hidden in that case.
    pub channels: u16,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputStatus {
    pub running: bool,
    pub sample_rate: u32,
    pub channels: u16,
    /// Audio callback buffer size in frames per callback. `0` means
    /// "device default" (cpal couldn't expose a supported range, so
    /// we fell back to `BufferSize::Default` and let the driver
    /// pick). Exposed for diagnostics: users reporting latency
    /// issues can see the actual figure rather than having to guess.
    /// At 48 kHz, 128 frames ≈ 2.7 ms per callback.
    pub buffer_frames: u32,
}

impl InputStatus {
    pub(crate) fn stopped() -> Self {
        Self {
            running: false,
            sample_rate: 0,
            channels: 0,
            buffer_frames: 0,
        }
    }
}
