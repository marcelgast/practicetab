/// Compute waveform peaks by dividing samples into buckets and taking the
/// max absolute value per bucket, then normalizing so the global peak = 1.0.
pub fn compute_waveform_peaks(samples: &[f32], num_peaks: usize) -> Vec<f32> {
    if samples.is_empty() || num_peaks == 0 {
        return Vec::new();
    }

    if num_peaks >= samples.len() {
        // More peaks requested than samples: one peak per sample
        let peaks: Vec<f32> = samples.iter().map(|s| s.abs()).collect();
        return normalize_peaks(peaks);
    }

    let bucket_size = samples.len() as f64 / num_peaks as f64;
    let mut peaks = Vec::with_capacity(num_peaks);

    for i in 0..num_peaks {
        let start = (i as f64 * bucket_size) as usize;
        let end = (((i + 1) as f64) * bucket_size) as usize;
        let end = end.min(samples.len());

        let max_abs = samples[start..end]
            .iter()
            .fold(0.0_f32, |acc, &s| acc.max(s.abs()));

        peaks.push(max_abs);
    }

    normalize_peaks(peaks)
}

fn normalize_peaks(mut peaks: Vec<f32>) -> Vec<f32> {
    let global_max = peaks.iter().fold(0.0_f32, |acc, &p| acc.max(p));

    if global_max > 0.0 {
        for p in &mut peaks {
            *p /= global_max;
        }
    }

    peaks
}
