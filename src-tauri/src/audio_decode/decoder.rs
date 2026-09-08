use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::error::AppError;

use super::types::DecodedAudio;

/// Decode an audio file at `path` into mono f32 samples.
pub fn decode_audio_file(path: &Path) -> Result<DecodedAudio, AppError> {
    let file =
        File::open(path).map_err(|e| AppError::AudioDecode(format!("failed to open file: {e}")))?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| AppError::AudioDecode(format!("probe failed: {e}")))?;

    let mut format_reader = probed.format;

    let track = format_reader
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or_else(|| AppError::AudioDecode("no audio track found".to_string()))?;

    let codec_params = track.codec_params.clone();
    let track_id = track.id;

    let sample_rate = codec_params
        .sample_rate
        .ok_or_else(|| AppError::AudioDecode("unknown sample rate".to_string()))?;

    let channels = codec_params.channels.map(|c| c.count() as u16).unwrap_or(1);

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| AppError::AudioDecode(format!("codec init failed: {e}")))?;

    let mut mono_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format_reader.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => {
                return Err(AppError::AudioDecode(format!("read packet failed: {e}")));
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(buf) => buf,
            Err(symphonia::core::errors::Error::DecodeError(_)) => {
                // Skip corrupted frames silently
                continue;
            }
            Err(e) => {
                return Err(AppError::AudioDecode(format!("decode failed: {e}")));
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

        // Downmix to mono
        if num_channels == 1 {
            mono_samples.extend_from_slice(interleaved);
        } else {
            for frame_idx in 0..num_frames {
                let offset = frame_idx * num_channels;
                let mut sum: f32 = 0.0;
                for ch in 0..num_channels {
                    sum += interleaved[offset + ch];
                }
                mono_samples.push(sum / num_channels as f32);
            }
        }
    }

    let duration_ms = if sample_rate > 0 {
        (mono_samples.len() as f64 / sample_rate as f64) * 1000.0
    } else {
        0.0
    };

    Ok(DecodedAudio {
        samples: mono_samples,
        sample_rate,
        channels,
        duration_ms,
    })
}
