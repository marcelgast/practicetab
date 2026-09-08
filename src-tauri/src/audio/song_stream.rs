use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions};
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

use crate::error::AppError;

/// How many seconds of audio to keep buffered ahead of the read position.
const BUFFER_AHEAD_SECONDS: f64 = 2.0;

/// Streaming audio reader that decodes chunks on demand.
///
/// Instead of decoding an entire audio file into memory, this opens the file,
/// reads metadata instantly, and decodes small windows as playback advances.
pub struct SongStream {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    source_sample_rate: u32,
    target_sample_rate: u32,
    duration_ms: f64,
    /// Ring buffer of decoded stereo frames (at target sample rate).
    buffer: Vec<[f32; 2]>,
    /// The sample index (in target sample rate) that `buffer[0]` corresponds to.
    buffer_start_sample: usize,
    /// Total samples in the file at the target sample rate.
    total_samples: usize,
    /// Whether we have hit end-of-stream during decoding.
    eos_reached: bool,
}

/// In-memory variant for tests — no file I/O needed.
#[allow(dead_code)]
pub struct SongStreamMemory {
    samples: Vec<[f32; 2]>,
    sample_rate: u32,
}

/// Unified handle that render_song uses.
pub enum SongStreamHandle {
    File(SongStream),
    #[allow(dead_code)]
    Memory(SongStreamMemory),
}

impl SongStream {
    /// Open an audio file, read metadata, create a decoder. Does NOT decode audio.
    /// Returns instantly.
    pub fn open(path: &str, target_sample_rate: u32) -> Result<Self, AppError> {
        let file_path = Path::new(path);
        let file = File::open(file_path)
            .map_err(|e| AppError::AudioDecode(format!("song_open_failed: {e}")))?;

        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                mss,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .map_err(|e| AppError::AudioDecode(format!("song_probe_failed: {e}")))?;

        let format_reader = probed.format;

        let track = format_reader
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
            .ok_or_else(|| AppError::AudioDecode("song_no_audio_track".to_string()))?;

        let codec_params = track.codec_params.clone();
        let track_id = track.id;

        let source_sample_rate = codec_params
            .sample_rate
            .ok_or_else(|| AppError::AudioDecode("song_unknown_sample_rate".to_string()))?;

        // Calculate total samples from codec params if available
        let source_n_frames = codec_params.n_frames.unwrap_or(0);
        let duration_ms = if source_sample_rate > 0 && source_n_frames > 0 {
            (source_n_frames as f64 / source_sample_rate as f64) * 1000.0
        } else {
            // Fallback: try time_base * n_frames
            codec_params
                .time_base
                .map(|tb| {
                    let time = tb.calc_time(source_n_frames);
                    time.seconds as f64 * 1000.0 + time.frac * 1000.0
                })
                .unwrap_or(0.0)
        };

        let total_samples = if target_sample_rate > 0 && source_sample_rate > 0 {
            let ratio = target_sample_rate as f64 / source_sample_rate as f64;
            (source_n_frames as f64 * ratio).ceil() as usize
        } else {
            0
        };

        let decoder = symphonia::default::get_codecs()
            .make(&codec_params, &DecoderOptions::default())
            .map_err(|e| AppError::AudioDecode(format!("song_codec_init_failed: {e}")))?;

        Ok(Self {
            format: format_reader,
            decoder,
            track_id,
            source_sample_rate,
            target_sample_rate,
            duration_ms,
            buffer: Vec::new(),
            buffer_start_sample: 0,
            total_samples,
            eos_reached: false,
        })
    }

    /// Ensure the buffer covers `[start_sample .. start_sample + num_frames]`.
    /// Decodes packets as needed. Non-blocking in the sense that it will not
    /// block on I/O beyond what symphonia does for a few packets.
    pub fn ensure_buffered(&mut self, start_sample: usize, num_frames: usize) {
        let buffer_ahead = (BUFFER_AHEAD_SECONDS * self.target_sample_rate as f64).ceil() as usize;
        let needed_end = start_sample
            .saturating_add(num_frames)
            .max(start_sample.saturating_add(buffer_ahead));

        // Check if the requested range is already buffered
        let buffer_end = self.buffer_start_sample + self.buffer.len();
        if start_sample >= self.buffer_start_sample && needed_end <= buffer_end {
            return;
        }

        // If start_sample is before our buffer, we need to seek
        if start_sample < self.buffer_start_sample {
            self.seek_to_sample(start_sample);
            return;
        }

        // If start_sample is way past our buffer end, trim and decode forward
        if start_sample > buffer_end {
            // We need to seek forward
            self.seek_to_sample(start_sample);
            return;
        }

        // Trim buffer: discard samples before start_sample (keep some margin)
        let trim_to = start_sample.saturating_sub(self.buffer_start_sample);
        if trim_to > 0 && trim_to < self.buffer.len() {
            self.buffer.drain(..trim_to);
            self.buffer_start_sample += trim_to;
        }

        // Decode until we have enough
        self.decode_until(needed_end);
    }

    /// Get a stereo frame at the given sample index (in target sample rate).
    pub fn get_frame(&self, sample_index: usize) -> Option<[f32; 2]> {
        if sample_index < self.buffer_start_sample {
            return None;
        }
        let offset = sample_index - self.buffer_start_sample;
        self.buffer.get(offset).copied()
    }

    /// Seek to a specific sample position. Clears the buffer and re-decodes.
    pub fn seek_to_sample(&mut self, sample: usize) {
        self.buffer.clear();
        self.buffer_start_sample = sample;
        self.eos_reached = false;

        // Convert target sample index to source time
        let time_seconds = if self.target_sample_rate > 0 {
            sample as f64 / self.target_sample_rate as f64
        } else {
            0.0
        };

        let seek_to = SeekTo::Time {
            time: Time::new(time_seconds as u64, time_seconds.fract()),
            track_id: Some(self.track_id),
        };

        if self.format.seek(SeekMode::Coarse, seek_to).is_err() {
            // If seek fails, mark as EOS — we'll produce silence
            self.eos_reached = true;
            return;
        }

        // Reset decoder after seek
        self.decoder.reset();

        // Pre-fill buffer
        let buffer_ahead = (BUFFER_AHEAD_SECONDS * self.target_sample_rate as f64).ceil() as usize;
        self.decode_until(sample + buffer_ahead);
    }

    pub fn duration_ms(&self) -> f64 {
        self.duration_ms
    }

    pub fn total_samples(&self) -> usize {
        self.total_samples
    }

    /// Update total_samples if we discover the file is longer than metadata indicated.
    fn maybe_extend_total(&mut self) {
        let actual_end = self.buffer_start_sample + self.buffer.len();
        if actual_end > self.total_samples {
            self.total_samples = actual_end;
        }
    }

    /// Decode packets until buffer covers up to `target_end` (sample index at target rate).
    fn decode_until(&mut self, target_end: usize) {
        if self.eos_reached {
            return;
        }

        let resample_ratio = if self.source_sample_rate > 0 {
            self.target_sample_rate as f64 / self.source_sample_rate as f64
        } else {
            1.0
        };
        let needs_resample = self.source_sample_rate != self.target_sample_rate;

        while (self.buffer_start_sample + self.buffer.len()) < target_end {
            let packet = match self.format.next_packet() {
                Ok(p) => p,
                Err(symphonia::core::errors::Error::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    self.eos_reached = true;
                    break;
                }
                Err(_) => {
                    self.eos_reached = true;
                    break;
                }
            };

            if packet.track_id() != self.track_id {
                continue;
            }

            let decoded = match self.decoder.decode(&packet) {
                Ok(buf) => buf,
                Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
                Err(_) => {
                    self.eos_reached = true;
                    break;
                }
            };

            let spec = *decoded.spec();
            let num_channels = spec.channels.count();
            let num_frames = decoded.frames();
            if num_frames == 0 {
                continue;
            }

            let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
            sample_buf.copy_interleaved_ref(decoded);
            let interleaved = sample_buf.samples();

            // Collect source stereo frames
            let mut source_frames = Vec::with_capacity(num_frames);
            for frame_idx in 0..num_frames {
                let offset = frame_idx * num_channels;
                let left = interleaved[offset];
                let right = if num_channels >= 2 {
                    interleaved[offset + 1]
                } else {
                    left // mono -> duplicate to stereo
                };
                source_frames.push([left, right]);
            }

            // Resample if needed, then append to buffer
            if needs_resample && !source_frames.is_empty() {
                let output_len = (source_frames.len() as f64 * resample_ratio).ceil() as usize;
                self.buffer.reserve(output_len);
                for i in 0..output_len {
                    let src_pos = i as f64 / resample_ratio;
                    let idx = src_pos as usize;
                    let frac = (src_pos - idx as f64) as f32;
                    if idx + 1 < source_frames.len() {
                        let s0 = source_frames[idx];
                        let s1 = source_frames[idx + 1];
                        self.buffer.push([
                            s0[0] + (s1[0] - s0[0]) * frac,
                            s0[1] + (s1[1] - s0[1]) * frac,
                        ]);
                    } else if idx < source_frames.len() {
                        self.buffer.push(source_frames[idx]);
                    }
                }
            } else {
                self.buffer.extend_from_slice(&source_frames);
            }
        }

        self.maybe_extend_total();

        // If we reached EOS, update duration based on actual decoded length
        if self.eos_reached && self.target_sample_rate > 0 {
            let actual_total = self.buffer_start_sample + self.buffer.len();
            if actual_total > self.total_samples {
                self.total_samples = actual_total;
            }
            self.duration_ms =
                (self.total_samples as f64 / self.target_sample_rate as f64) * 1000.0;
        }
    }
}

impl SongStreamMemory {
    #[allow(dead_code)]
    pub fn new(samples: Vec<[f32; 2]>, sample_rate: u32) -> Self {
        Self {
            samples,
            sample_rate,
        }
    }
}

impl SongStreamHandle {
    /// Create a file-backed stream (instant — no decoding).
    pub fn open_file(path: &str, target_sample_rate: u32) -> Result<Self, AppError> {
        Ok(Self::File(SongStream::open(path, target_sample_rate)?))
    }

    /// Create an in-memory stream (for tests).
    #[allow(dead_code)]
    pub fn from_samples(samples: Vec<[f32; 2]>, sample_rate: u32) -> Self {
        Self::Memory(SongStreamMemory::new(samples, sample_rate))
    }

    pub fn duration_ms(&self) -> f64 {
        match self {
            Self::File(s) => s.duration_ms(),
            Self::Memory(m) => {
                if m.sample_rate > 0 {
                    (m.samples.len() as f64 / m.sample_rate as f64) * 1000.0
                } else {
                    0.0
                }
            }
        }
    }

    pub fn total_samples(&self) -> usize {
        match self {
            Self::File(s) => s.total_samples(),
            Self::Memory(m) => m.samples.len(),
        }
    }

    pub fn ensure_buffered(&mut self, start_sample: usize, num_frames: usize) {
        match self {
            Self::File(s) => s.ensure_buffered(start_sample, num_frames),
            Self::Memory(_) => {} // Everything is already in memory
        }
    }

    pub fn get_frame(&self, sample_index: usize) -> Option<[f32; 2]> {
        match self {
            Self::File(s) => s.get_frame(sample_index),
            Self::Memory(m) => m.samples.get(sample_index).copied(),
        }
    }

    pub fn seek_to_sample(&mut self, sample: usize) {
        match self {
            Self::File(s) => s.seek_to_sample(sample),
            Self::Memory(_) => {} // No-op, random access is always available
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_stream_total_samples() {
        let samples = vec![[0.1, 0.2]; 500];
        let handle = SongStreamHandle::from_samples(samples, 44100);
        assert_eq!(handle.total_samples(), 500);
    }

    #[test]
    fn memory_stream_duration_ms() {
        let samples = vec![[0.0, 0.0]; 44100];
        let handle = SongStreamHandle::from_samples(samples, 44100);
        let dur = handle.duration_ms();
        assert!((dur - 1000.0).abs() < 0.1);
    }

    #[test]
    fn memory_stream_get_frame() {
        let samples = vec![[0.5, -0.3], [0.7, -0.1]];
        let handle = SongStreamHandle::from_samples(samples, 44100);
        assert_eq!(handle.get_frame(0), Some([0.5, -0.3]));
        assert_eq!(handle.get_frame(1), Some([0.7, -0.1]));
        assert_eq!(handle.get_frame(2), None);
    }

    #[test]
    fn memory_stream_ensure_buffered_is_noop() {
        let samples = vec![[0.0, 0.0]; 10];
        let mut handle = SongStreamHandle::from_samples(samples, 44100);
        // Should not panic or do anything
        handle.ensure_buffered(0, 5);
        assert_eq!(handle.get_frame(0), Some([0.0, 0.0]));
    }

    #[test]
    fn file_stream_nonexistent_returns_error() {
        let result = SongStreamHandle::open_file("/nonexistent/path.mp3", 44100);
        assert!(result.is_err());
    }
}
