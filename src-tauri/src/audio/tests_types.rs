use super::types::*;

#[test]
fn master_gain_mapping_clamps() {
    assert!((map_master_gain(100) - 50.0).abs() < 0.0001);
    assert!((map_master_gain(50) - 25.0).abs() < 0.0001);
    assert_eq!(map_master_gain(0), 0.0);
}

#[test]
fn master_gain_clamps_above_range() {
    assert!((map_master_gain(200) - 50.0).abs() < 0.0001);
}

#[test]
fn steel_guitar_program_gain_is_boosted() {
    assert!((program_gain(STEEL_GUITAR_PROGRAM) - STEEL_GUITAR_GAIN).abs() < 0.0001);
    assert_eq!(program_gain(0), 1.0);
    assert_eq!(program_gain(24), 1.0);
}

#[test]
fn bass_program_range_gain_is_boosted() {
    assert!((program_gain(32) - BASS_PROGRAM_GAIN).abs() < 0.0001);
    assert!((program_gain(39) - BASS_PROGRAM_GAIN).abs() < 0.0001);
    assert_eq!(program_gain(31), 1.0);
    assert_eq!(program_gain(40), 1.0);
}

#[test]
fn accepts_valid_smf_header() {
    use super::api::is_valid_smf;
    let mut midi = b"MThd".to_vec();
    midi.extend_from_slice(&[0, 0, 0, 6, 0, 1, 0, 1, 1, 224]);
    assert!(is_valid_smf(&midi));
}

#[test]
fn rejects_invalid_smf_header() {
    use super::api::is_valid_smf;
    assert!(!is_valid_smf(&[]));
    assert!(!is_valid_smf(b"not-a-midi-file"));
}

#[test]
fn master_limiter_ceiling_matches_minus_half_dbfs() {
    let expected = 10f32.powf(-0.5 / 20.0);
    assert!((MASTER_LIMITER_CEILING - expected).abs() < 1.0e-5);
}

#[test]
fn tab_drum_output_gain_applies_only_to_drum_channel() {
    assert!((tab_drum_output_gain(METRONOME_CHANNEL_DRUM as u8) - 1.0).abs() < 1e-6);
    assert!((tab_drum_output_gain(0) - 1.0).abs() < 1e-6);
}
