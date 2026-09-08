use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::error::AppError;

/// Result of decoding and resampling a song file.
/// Retained for waveform generation and testing; playback uses streaming.
#[allow(dead_code)]
pub(crate) struct DecodedSong {
    pub(crate) samples: Vec<[f32; 2]>,
    pub(crate) duration_ms: f64,
}

/// Decode an audio file and resample to the target sample rate as stereo frames.
/// Retained for waveform generation and testing; playback uses streaming.
#[allow(dead_code)]
pub(crate) fn decode_and_resample(
    path: &str,
    target_sample_rate: u32,
) -> Result<DecodedSong, AppError> {
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

    let mut format_reader = probed.format;

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

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| AppError::AudioDecode(format!("song_codec_init_failed: {e}")))?;

    let mut stereo_frames: Vec<[f32; 2]> = Vec::new();

    loop {
        let packet = match format_reader.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => {
                return Err(AppError::AudioDecode(format!("song_read_packet: {e}")));
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(buf) => buf,
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => {
                return Err(AppError::AudioDecode(format!("song_decode_failed: {e}")));
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

        for frame_idx in 0..num_frames {
            let offset = frame_idx * num_channels;
            let left = interleaved[offset];
            let right = if num_channels >= 2 {
                interleaved[offset + 1]
            } else {
                left
            };
            stereo_frames.push([left, right]);
        }
    }

    // Resample if needed
    let resampled = if source_sample_rate == target_sample_rate {
        stereo_frames
    } else {
        resample_linear(&stereo_frames, source_sample_rate, target_sample_rate)
    };

    let duration_ms = if target_sample_rate > 0 {
        (resampled.len() as f64 / target_sample_rate as f64) * 1000.0
    } else {
        0.0
    };

    Ok(DecodedSong {
        samples: resampled,
        duration_ms,
    })
}

/// Linear interpolation resampler for stereo frames.
fn resample_linear(source: &[[f32; 2]], source_rate: u32, target_rate: u32) -> Vec<[f32; 2]> {
    if source.is_empty() || source_rate == 0 || target_rate == 0 {
        return Vec::new();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let output_len = ((source.len() as f64) / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos as usize;
        let frac = (src_pos - idx as f64) as f32;

        if idx + 1 < source.len() {
            let s0 = source[idx];
            let s1 = source[idx + 1];
            output.push([
                s0[0] + (s1[0] - s0[0]) * frac,
                s0[1] + (s1[1] - s0[1]) * frac,
            ]);
        } else if idx < source.len() {
            output.push(source[idx]);
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_same_rate_is_noop() {
        let source = vec![[0.5, -0.5], [1.0, -1.0]];
        let result = resample_linear(&source, 44100, 44100);
        assert_eq!(result.len(), source.len());
        assert!((result[0][0] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn resample_upsample_doubles_length() {
        let source = vec![[0.0, 0.0], [1.0, 1.0]];
        let result = resample_linear(&source, 22050, 44100);
        // Upsampling by 2x should roughly double the length
        assert!(result.len() >= 3);
    }

    #[test]
    fn resample_empty_source() {
        let result = resample_linear(&[], 44100, 48000);
        assert!(result.is_empty());
    }

    #[test]
    fn decode_nonexistent_file_returns_error() {
        let result = decode_and_resample("/nonexistent/path/to/song.mp3", 44100);
        assert!(result.is_err());
    }
}
