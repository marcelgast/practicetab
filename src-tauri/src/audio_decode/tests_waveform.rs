use super::waveform::compute_waveform_peaks;

#[test]
fn known_data_two_peaks() {
    let samples = vec![0.5, -1.0, 0.3, 0.7];
    let peaks = compute_waveform_peaks(&samples, 2);
    assert_eq!(peaks.len(), 2);
    // Bucket 0: [0.5, -1.0] → max abs = 1.0 → normalized = 1.0
    // Bucket 1: [0.3, 0.7]  → max abs = 0.7 → normalized = 0.7
    assert!((peaks[0] - 1.0).abs() < f32::EPSILON);
    assert!((peaks[1] - 0.7).abs() < f32::EPSILON);
}

#[test]
fn empty_input_returns_empty() {
    let peaks = compute_waveform_peaks(&[], 10);
    assert!(peaks.is_empty());
}

#[test]
fn zero_peaks_returns_empty() {
    let samples = vec![1.0, 2.0, 3.0];
    let peaks = compute_waveform_peaks(&samples, 0);
    assert!(peaks.is_empty());
}

#[test]
fn single_sample() {
    let samples = vec![0.5];
    let peaks = compute_waveform_peaks(&samples, 1);
    assert_eq!(peaks.len(), 1);
    // Single sample normalized to 1.0
    assert!((peaks[0] - 1.0).abs() < f32::EPSILON);
}

#[test]
fn more_peaks_than_samples() {
    let samples = vec![0.3, -0.6];
    let peaks = compute_waveform_peaks(&samples, 10);
    // Should return one peak per sample when num_peaks >= samples.len()
    assert_eq!(peaks.len(), 2);
    // 0.3 / 0.6 = 0.5, 0.6 / 0.6 = 1.0
    assert!((peaks[0] - 0.5).abs() < f32::EPSILON);
    assert!((peaks[1] - 1.0).abs() < f32::EPSILON);
}

#[test]
fn all_zeros_returns_zeros() {
    let samples = vec![0.0, 0.0, 0.0, 0.0];
    let peaks = compute_waveform_peaks(&samples, 2);
    assert_eq!(peaks.len(), 2);
    assert!((peaks[0]).abs() < f32::EPSILON);
    assert!((peaks[1]).abs() < f32::EPSILON);
}
