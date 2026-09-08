use std::io::Write;

use super::decoder::decode_audio_file;

/// Create a minimal 16-bit PCM WAV file with the given mono samples.
fn create_wav_file(path: &std::path::Path, sample_rate: u32, samples: &[i16]) {
    let num_channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * u32::from(num_channels) * u32::from(bits_per_sample / 8);
    let block_align = num_channels * (bits_per_sample / 8);
    let data_size = (samples.len() * 2) as u32;
    let file_size = 36 + data_size;

    let mut buf: Vec<u8> = Vec::new();

    // RIFF header
    buf.write_all(b"RIFF").unwrap();
    buf.write_all(&file_size.to_le_bytes()).unwrap();
    buf.write_all(b"WAVE").unwrap();

    // fmt sub-chunk
    buf.write_all(b"fmt ").unwrap();
    buf.write_all(&16u32.to_le_bytes()).unwrap(); // sub-chunk size
    buf.write_all(&1u16.to_le_bytes()).unwrap(); // PCM format
    buf.write_all(&num_channels.to_le_bytes()).unwrap();
    buf.write_all(&sample_rate.to_le_bytes()).unwrap();
    buf.write_all(&byte_rate.to_le_bytes()).unwrap();
    buf.write_all(&block_align.to_le_bytes()).unwrap();
    buf.write_all(&bits_per_sample.to_le_bytes()).unwrap();

    // data sub-chunk
    buf.write_all(b"data").unwrap();
    buf.write_all(&data_size.to_le_bytes()).unwrap();
    for &sample in samples {
        buf.write_all(&sample.to_le_bytes()).unwrap();
    }

    std::fs::write(path, &buf).unwrap();
}

#[test]
fn decode_wav_file_basic() {
    let dir = tempfile::tempdir().unwrap();
    let wav_path = dir.path().join("test.wav");

    let sample_rate = 44100u32;
    // Simple sine-ish pattern: a few known samples
    let raw_samples: Vec<i16> = vec![0, 16384, 32767, 16384, 0, -16384, -32767, -16384];

    create_wav_file(&wav_path, sample_rate, &raw_samples);

    let result = decode_audio_file(&wav_path);
    assert!(result.is_ok(), "decode failed: {:?}", result.err());

    let decoded = result.unwrap();
    assert_eq!(decoded.sample_rate, sample_rate);
    assert_eq!(decoded.channels, 1);
    assert_eq!(decoded.samples.len(), raw_samples.len());

    // Duration should be ~0.18ms for 8 samples at 44100 Hz
    let expected_duration_ms = (raw_samples.len() as f64 / sample_rate as f64) * 1000.0;
    assert!((decoded.duration_ms - expected_duration_ms).abs() < 0.01);

    // Verify sample values are in expected range (i16 max = 32767 → ~1.0 in f32)
    let max_sample = decoded
        .samples
        .iter()
        .fold(0.0_f32, |acc, &s| acc.max(s.abs()));
    assert!(
        max_sample > 0.9,
        "max sample should be close to 1.0, got {max_sample}"
    );
}

#[test]
fn decode_nonexistent_file_returns_error() {
    let result = decode_audio_file(std::path::Path::new("/tmp/nonexistent_audio_file_xyz.wav"));
    assert!(result.is_err());
}

#[test]
fn decode_invalid_file_returns_error() {
    let dir = tempfile::tempdir().unwrap();
    let bad_path = dir.path().join("bad.wav");
    std::fs::write(&bad_path, b"this is not audio data").unwrap();

    let result = decode_audio_file(&bad_path);
    assert!(result.is_err());
}
