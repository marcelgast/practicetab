use super::note::frequency_to_note;

#[test]
fn a4_is_midi_69_zero_cents() {
    let (midi, name, cents) = frequency_to_note(440.0);
    assert_eq!(midi, 69);
    assert_eq!(name, "A4");
    assert!(cents.abs() < 0.01, "cents = {cents}");
}

#[test]
fn e2_open_low_e_string() {
    let (midi, name, cents) = frequency_to_note(82.4069);
    assert_eq!(midi, 40);
    assert_eq!(name, "E2");
    assert!(cents.abs() < 0.5, "cents = {cents}");
}

#[test]
fn e1_open_low_bass_string() {
    // 4-string bass low E.
    let (midi, name, cents) = frequency_to_note(41.2034);
    assert_eq!(midi, 28);
    assert_eq!(name, "E1");
    assert!(cents.abs() < 0.5, "cents = {cents}");
}

#[test]
fn b0_open_low_5string_bass() {
    // 5-string bass low B.
    let (midi, name, cents) = frequency_to_note(30.8677);
    assert_eq!(midi, 23);
    assert_eq!(name, "B0");
    assert!(cents.abs() < 0.5, "cents = {cents}");
}

#[test]
fn f_sharp_0_detuned_5string_bass() {
    // 5-string bass detuned 5 semitones below B0 (23.12 Hz).
    // The lowest practical fundamental we aim to recognise.
    let (midi, name, cents) = frequency_to_note(23.1247);
    assert_eq!(midi, 18);
    assert_eq!(name, "F#0");
    assert!(cents.abs() < 0.5, "cents = {cents}");
}

#[test]
fn e4_open_high_e_string() {
    let (midi, name, _) = frequency_to_note(329.6276);
    assert_eq!(midi, 64);
    assert_eq!(name, "E4");
}

#[test]
fn midi_c4_middle_c() {
    let (midi, name, _) = frequency_to_note(261.6256);
    assert_eq!(midi, 60);
    assert_eq!(name, "C4");
}

#[test]
fn slightly_flat_a4_has_negative_cents() {
    let (midi, _, cents) = frequency_to_note(437.0);
    assert_eq!(midi, 69);
    assert!(cents < 0.0 && cents > -20.0, "cents = {cents}");
}

#[test]
fn slightly_sharp_a4_has_positive_cents() {
    let (midi, _, cents) = frequency_to_note(443.0);
    assert_eq!(midi, 69);
    assert!(cents > 0.0 && cents < 20.0, "cents = {cents}");
}

#[test]
fn non_positive_frequency_is_silent() {
    let (midi, name, cents) = frequency_to_note(0.0);
    assert_eq!(midi, 0);
    assert!(name.is_empty());
    assert_eq!(cents, 0.0);
}

#[test]
fn non_finite_frequency_is_silent() {
    let (midi, name, cents) = frequency_to_note(f32::NAN);
    assert_eq!(midi, 0);
    assert!(name.is_empty());
    assert_eq!(cents, 0.0);
}
