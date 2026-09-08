//! Pure frequency → MIDI / note-name / cent-offset mapping. No hardware or
//! cpal dependencies — cheap to unit test.

/// A4 = 440 Hz anchor. MIDI note 69 corresponds to A4.
const A4_HZ: f32 = 440.0;
const A4_MIDI: f32 = 69.0;

const NOTE_NAMES: [&str; 12] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/// Map a fundamental frequency in Hz to `(midi_note, note_name, cents_offset)`.
///
/// `cents_offset` is the signed deviation from the nearest equal-tempered
/// semitone, in `(-50.0, +50.0]`. Non-finite or non-positive inputs return a
/// neutral `(0, "", 0.0)` triple so callers can forward "silent" readings
/// without branching.
pub(crate) fn frequency_to_note(frequency: f32) -> (u8, String, f32) {
    if !frequency.is_finite() || frequency <= 0.0 {
        return (0, String::new(), 0.0);
    }
    let midi_float = A4_MIDI + 12.0 * (frequency / A4_HZ).log2();
    let midi_rounded = midi_float.round();
    let cents = (midi_float - midi_rounded) * 100.0;
    let midi_clamped = midi_rounded.clamp(0.0, 127.0) as i32;
    let name_index = midi_clamped.rem_euclid(12) as usize;
    let octave = (midi_clamped / 12) - 1;
    let note_name = format!("{}{}", NOTE_NAMES[name_index], octave);
    (midi_clamped as u8, note_name, cents)
}
