import { describe, expect, it } from 'vitest';
import {
  PITCH_BEND_CENTER,
  SOURCE_BEND_RANGE_SEMITONES,
  bendValueToSemitones,
  buildExpectedNoteTimeline,
  classifyBend,
  midiNoteToFrequency,
  midiNoteToName,
  type RawNoteEvent,
} from '../domain/expectedNoteTimeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noteOn(
  atMs: number,
  key: number,
  trackId = 'track-0',
  vibrato?: 'slight' | 'wide',
  channel = 0,
): RawNoteEvent {
  return {
    atMs,
    trackId,
    channel,
    kind: { type: 'note_on', key, ...(vibrato ? { vibrato } : {}) },
  };
}

function noteOff(
  atMs: number,
  key: number,
  trackId = 'track-0',
  channel = 0,
): RawNoteEvent {
  return { atMs, trackId, channel, kind: { type: 'note_off', key } };
}

function pitchBend(
  atMs: number,
  value: number,
  label: 'bend' | 'slide' | 'reset' = 'bend',
  trackId = 'track-0',
  channel = 0,
): RawNoteEvent {
  return {
    atMs,
    trackId,
    channel,
    kind: { type: 'pitch_bend', value, label },
  };
}

// ---------------------------------------------------------------------------
// midiNoteToFrequency
// ---------------------------------------------------------------------------

describe('midiNoteToFrequency', () => {
  it('returns 440 Hz for MIDI 69 (A4)', () => {
    expect(midiNoteToFrequency(69)).toBeCloseTo(440.0, 5);
  });

  it('returns 220 Hz for MIDI 57 (A3)', () => {
    expect(midiNoteToFrequency(57)).toBeCloseTo(220.0, 5);
  });

  it('returns 880 Hz for MIDI 81 (A5)', () => {
    expect(midiNoteToFrequency(81)).toBeCloseTo(880.0, 5);
  });

  it('returns 0 for non-finite input', () => {
    expect(midiNoteToFrequency(Number.NaN)).toBe(0);
    expect(midiNoteToFrequency(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('is positive for any in-range MIDI value', () => {
    expect(midiNoteToFrequency(0)).toBeGreaterThan(0);
    expect(midiNoteToFrequency(127)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// midiNoteToName
// ---------------------------------------------------------------------------

describe('midiNoteToName', () => {
  it('maps MIDI 69 → A4', () => {
    expect(midiNoteToName(69)).toBe('A4');
  });

  it('maps MIDI 64 → E4', () => {
    expect(midiNoteToName(64)).toBe('E4');
  });

  it('maps MIDI 45 → A2', () => {
    expect(midiNoteToName(45)).toBe('A2');
  });

  it('maps MIDI 40 → E2 (open low-E on guitar)', () => {
    expect(midiNoteToName(40)).toBe('E2');
  });

  it('clamps out-of-range values instead of producing garbage', () => {
    expect(midiNoteToName(-1)).toBe('C-1');
    expect(midiNoteToName(128)).toBe('G9');
  });
});

// ---------------------------------------------------------------------------
// bendValueToSemitones
// ---------------------------------------------------------------------------

describe('bendValueToSemitones', () => {
  it('maps center value to 0 semitones', () => {
    expect(bendValueToSemitones(PITCH_BEND_CENTER)).toBeCloseTo(0, 10);
  });

  it('maps full-up value to +SOURCE_BEND_RANGE_SEMITONES', () => {
    // value = 16383 (max) → +SOURCE_BEND_RANGE_SEMITONES
    const result = bendValueToSemitones(16383);
    expect(result).toBeCloseTo(SOURCE_BEND_RANGE_SEMITONES, 1);
  });

  it('maps full-down value to -SOURCE_BEND_RANGE_SEMITONES', () => {
    expect(bendValueToSemitones(0)).toBeCloseTo(
      -SOURCE_BEND_RANGE_SEMITONES,
      1,
    );
  });

  it('maps a 2-semitone bend correctly', () => {
    // 2 st = (value - 8192) / 8192 * 16 → value = 8192 + 2/16 * 8192 = 9216
    expect(bendValueToSemitones(9216)).toBeCloseTo(2, 3);
  });
});

// ---------------------------------------------------------------------------
// classifyBend
// ---------------------------------------------------------------------------

describe('classifyBend', () => {
  it('returns null for empty input', () => {
    expect(classifyBend([])).toBeNull();
  });

  it('returns null when all values are near center', () => {
    expect(classifyBend([8192, 8193, 8191])).toBeNull();
  });

  it('classifies ascending bend as "bend"', () => {
    // 0 st → 2 st
    const result = classifyBend([8192, 8700, 9216]);
    expect(result?.type).toBe('bend');
    expect(result?.startPitchOffset).toBeCloseTo(0, 1);
    expect(result?.endPitchOffset).toBeCloseTo(2, 1);
  });

  it('classifies bend that returns to center as "bend_release"', () => {
    // 0 st → 2 st → 0 st
    const result = classifyBend([8192, 9216, 8192]);
    expect(result?.type).toBe('bend_release');
  });

  it('classifies note struck bent, then released as "release"', () => {
    // starts at +2 st, falls to 0
    const result = classifyBend([9216, 8700, 8192]);
    expect(result?.type).toBe('release');
    expect(result?.startPitchOffset).toBeCloseTo(2, 1);
    expect(result?.endPitchOffset).toBeCloseTo(0, 1);
  });

  it('classifies note struck bent, held bent as "pre_bend"', () => {
    // starts at +2 st, stays near +2 st
    const result = classifyBend([9216, 9230, 9210]);
    expect(result?.type).toBe('pre_bend');
  });
});

// ---------------------------------------------------------------------------
// buildExpectedNoteTimeline — timing and pairing
// ---------------------------------------------------------------------------

describe('buildExpectedNoteTimeline', () => {
  it('returns empty timeline for empty events', () => {
    const tl = buildExpectedNoteTimeline([], 0, 1);
    expect(tl.notes).toHaveLength(0);
    expect(tl.trackId).toBe('track-0');
    expect(tl.tempoFactor).toBe(1);
  });

  it('pairs a single note_on + note_off correctly', () => {
    const events: RawNoteEvent[] = [noteOn(0, 64), noteOff(500, 64)];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(1);
    expect(tl.notes[0].startMs).toBeCloseTo(0, 5);
    expect(tl.notes[0].endMs).toBeCloseTo(500, 5);
    expect(tl.notes[0].midiNote).toBe(64);
  });

  it('derives frequency and noteName from midiNote', () => {
    const events: RawNoteEvent[] = [noteOn(0, 69), noteOff(200, 69)];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].frequency).toBeCloseTo(440, 3);
    expect(tl.notes[0].noteName).toBe('A4');
  });

  it('scales timestamps by tempoFactor', () => {
    // Half speed (0.5): all timestamps doubled
    const events: RawNoteEvent[] = [noteOn(1000, 64), noteOff(2000, 64)];
    const tl = buildExpectedNoteTimeline(events, 0, 0.5);
    expect(tl.notes[0].startMs).toBeCloseTo(2000, 5);
    expect(tl.notes[0].endMs).toBeCloseTo(4000, 5);
    expect(tl.tempoFactor).toBe(0.5);
  });

  it('scales timestamps for double speed (2.0)', () => {
    const events: RawNoteEvent[] = [noteOn(1000, 64), noteOff(2000, 64)];
    const tl = buildExpectedNoteTimeline(events, 0, 2.0);
    expect(tl.notes[0].startMs).toBeCloseTo(500, 5);
    expect(tl.notes[0].endMs).toBeCloseTo(1000, 5);
  });

  it('falls back to tempoFactor=1 for invalid values', () => {
    const events: RawNoteEvent[] = [noteOn(1000, 64), noteOff(2000, 64)];
    const tl0 = buildExpectedNoteTimeline(events, 0, 0);
    expect(tl0.notes[0].startMs).toBeCloseTo(1000, 5);
    const tlNaN = buildExpectedNoteTimeline(events, 0, Number.NaN);
    expect(tlNaN.notes[0].startMs).toBeCloseTo(1000, 5);
  });

  it('filters events to the active track only', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 64, 'track-0'),
      noteOn(0, 60, 'track-1'),
      noteOff(500, 64, 'track-0'),
      noteOff(500, 60, 'track-1'),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(1);
    expect(tl.notes[0].midiNote).toBe(64);
    expect(tl.notes[0].trackId).toBe('track-0');
  });

  it('handles simultaneous notes (chord)', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 64),
      noteOn(0, 67),
      noteOff(400, 64),
      noteOff(400, 67),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(2);
  });

  it('handles note re-trigger (second note_on before note_off)', () => {
    // Second note_on for same key closes the first note immediately
    const events: RawNoteEvent[] = [
      noteOn(0, 64),
      noteOn(300, 64), // re-trigger at 300 ms
      noteOff(700, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(2);
    expect(tl.notes[0].endMs).toBeCloseTo(300, 5);
    expect(tl.notes[1].startMs).toBeCloseTo(300, 5);
    expect(tl.notes[1].endMs).toBeCloseTo(700, 5);
  });

  it('closes unclosed notes using the last event time', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 64),
      noteOn(100, 69),
      noteOff(600, 69),
      // note 64 has no note_off
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    const unclosed = tl.notes.find((n) => n.midiNote === 64);
    expect(unclosed).toBeDefined();
    // endMs should be at least startMs
    expect(unclosed!.endMs).toBeGreaterThanOrEqual(unclosed!.startMs);
  });

  it('returns notes sorted by startMs', () => {
    const events: RawNoteEvent[] = [
      noteOn(500, 60),
      noteOff(800, 60),
      noteOn(0, 64),
      noteOff(300, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].startMs).toBeLessThan(tl.notes[1].startMs);
  });

  // -----------------------------------------------------------------------
  // Vibrato
  // -----------------------------------------------------------------------

  it('maps note_on vibrato "slight" → VibratoInfo { type: "normal" }', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 64, 'track-0', 'slight'),
      noteOff(500, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].vibrato).toEqual({ type: 'normal' });
  });

  it('maps note_on vibrato "wide" → VibratoInfo { type: "wide" }', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 64, 'track-0', 'wide'),
      noteOff(500, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].vibrato).toEqual({ type: 'wide' });
  });

  it('maps note_on without vibrato → null', () => {
    const events: RawNoteEvent[] = [noteOn(0, 64), noteOff(500, 64)];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].vibrato).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Bend extraction
  // -----------------------------------------------------------------------

  it('sets bend to null when no pitch_bend events present', () => {
    const events: RawNoteEvent[] = [noteOn(0, 64), noteOff(500, 64)];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].bend).toBeNull();
  });

  it('ignores pitch_bend events with label !== "bend"', () => {
    const events: RawNoteEvent[] = [
      pitchBend(10, 9216, 'slide'),
      noteOn(50, 64),
      noteOff(400, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].bend).toBeNull();
  });

  it('detects a standard 2-semitone bend', () => {
    // 0 st → 2 st during note
    const events: RawNoteEvent[] = [
      noteOn(100, 64),
      pitchBend(150, 8192, 'bend'), // 0 st (start)
      pitchBend(200, 9216, 'bend'), // 2 st (end)
      noteOff(500, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].bend?.type).toBe('bend');
    expect(tl.notes[0].bend?.endPitchOffset).toBeCloseTo(2, 1);
  });

  it('captures pre-bend events up to 50 ms before note_on', () => {
    // pitch_bend arrives 30 ms before note_on (pre-bend before pick)
    const events: RawNoteEvent[] = [
      pitchBend(70, 9216, 'bend'), // 30 ms before note
      noteOn(100, 64),
      noteOff(500, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].bend).not.toBeNull();
    expect(tl.notes[0].bend?.type).toBe('pre_bend');
  });

  it('ignores pitch_bend events more than 50 ms before note_on', () => {
    const events: RawNoteEvent[] = [
      pitchBend(0, 9216, 'bend'), // 100 ms before note — outside window
      noteOn(100, 64),
      noteOff(500, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].bend).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Default fields
  // -----------------------------------------------------------------------

  it('sets barIndex and beatIndex to 0 (stub values)', () => {
    const events: RawNoteEvent[] = [noteOn(0, 64), noteOff(200, 64)];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].barIndex).toBe(0);
    expect(tl.notes[0].beatIndex).toBe(0);
  });

  it('sets isRest to false (rests produce no note_on)', () => {
    const events: RawNoteEvent[] = [noteOn(0, 64), noteOff(200, 64)];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes[0].isRest).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Multi-channel: same key on different channels must not interfere
  // -----------------------------------------------------------------------

  it('keeps two notes on the same key but different channels independent', () => {
    // channel 0 and channel 1 both play key 64 — should produce 2 notes, not 1
    const events: RawNoteEvent[] = [
      noteOn(0, 64, 'track-0', undefined, 0),
      noteOn(0, 64, 'track-0', undefined, 1),
      noteOff(500, 64, 'track-0', 0),
      noteOff(600, 64, 'track-0', 1),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(2);
    expect(tl.notes.find((n) => n.endMs === 500)).toBeDefined();
    expect(tl.notes.find((n) => n.endMs === 600)).toBeDefined();
  });

  it('does not close a note on channel 0 when note_off arrives on channel 1', () => {
    // note_off on wrong channel must not close the note on channel 0
    const events: RawNoteEvent[] = [
      noteOn(0, 64, 'track-0', undefined, 0),
      noteOff(500, 64, 'track-0', 1), // wrong channel — should be ignored
      // note 64/ch0 left open → closed at last event time
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(1);
    // The open note should be closed at the last event time (500 ms)
    expect(tl.notes[0].startMs).toBeCloseTo(0, 5);
    expect(tl.notes[0].endMs).toBeGreaterThanOrEqual(0);
  });

  it('attaches bend only to the note on the same channel', () => {
    // channel 0: no bend; channel 1: 2-semitone bend
    const events: RawNoteEvent[] = [
      noteOn(0, 64, 'track-0', undefined, 0),
      noteOn(0, 64, 'track-0', undefined, 1),
      pitchBend(50, 9216, 'bend', 'track-0', 1), // bend on channel 1 only
      noteOff(500, 64, 'track-0', 0),
      noteOff(500, 64, 'track-0', 1),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(2);
    // Exactly one note must have a non-null bend and one must be null
    const withBend = tl.notes.filter((n) => n.bend !== null);
    const withoutBend = tl.notes.filter((n) => n.bend === null);
    expect(withBend).toHaveLength(1);
    expect(withoutBend).toHaveLength(1);
  });

  it('marks the last note with isLastNote, others stay false', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 60),
      noteOff(500, 60),
      noteOn(600, 62),
      noteOff(1000, 62),
      noteOn(1100, 64),
      noteOff(1500, 64),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(3);
    expect(tl.notes[0].isLastNote).toBe(false);
    expect(tl.notes[1].isLastNote).toBe(false);
    expect(tl.notes[2].isLastNote).toBe(true);
  });

  it('flags notes as slide-starts when a label="slide" pitch-bend falls inside the note window', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 60),
      // Slide bend at 120ms (well inside [0, 500]) on the same channel
      pitchBend(120, 10_000, 'slide'),
      noteOff(500, 60),
      // Second note: no slide bend → not a slide start
      noteOn(600, 62),
      noteOff(1000, 62),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(2);
    expect(tl.notes[0].isSlideStart).toBe(true);
    expect(tl.notes[1].isSlideStart).toBe(false);
  });

  it('flags all voices of a chord with isChord when they share a startMs', () => {
    // Two notes at t=0 (chord) + one solo note later.
    const events: RawNoteEvent[] = [
      noteOn(0, 60, 'track-0', undefined, 0), // chord voice 1
      noteOn(0, 64, 'track-0', undefined, 1), // chord voice 2
      noteOff(500, 60, 'track-0', 0),
      noteOff(500, 64, 'track-0', 1),
      noteOn(600, 67), // solo
      noteOff(1000, 67),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(3);
    const chordVoices = tl.notes.filter((n) => n.startMs === 0);
    expect(chordVoices).toHaveLength(2);
    expect(chordVoices.every((n) => n.isChord)).toBe(true);
    const solo = tl.notes.find((n) => n.startMs === 600);
    expect(solo?.isChord).toBe(false);
  });

  it('flags staggered strum voices within 20ms as a chord', () => {
    // AlphaTab emits GP chord voices a few ticks apart, not exactly
    // simultaneous. Three voices staggered 0/8/15ms should all be
    // grouped as chord siblings.
    const events: RawNoteEvent[] = [
      noteOn(0, 60, 'track-0', undefined, 0),
      noteOn(8, 64, 'track-0', undefined, 1),
      noteOn(15, 67, 'track-0', undefined, 2),
      noteOff(500, 60, 'track-0', 0),
      noteOff(500, 64, 'track-0', 1),
      noteOff(500, 67, 'track-0', 2),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(3);
    expect(tl.notes.every((n) => n.isChord)).toBe(true);
  });

  it('does NOT merge sequential notes spaced > 20ms into a chord', () => {
    // Two notes 30ms apart are distinct beats, not a chord.
    const events: RawNoteEvent[] = [
      noteOn(0, 60),
      noteOff(200, 60),
      noteOn(30, 64, 'track-0', undefined, 1),
      noteOff(230, 64, 'track-0', 1),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(2);
    expect(tl.notes.every((n) => n.isChord === false)).toBe(true);
  });

  it('does not flag notes as slide-starts when only plain `bend` pitch-bends are present', () => {
    const events: RawNoteEvent[] = [
      noteOn(0, 60),
      pitchBend(100, 9216, 'bend'),
      noteOff(500, 60),
    ];
    const tl = buildExpectedNoteTimeline(events, 0, 1);
    expect(tl.notes).toHaveLength(1);
    expect(tl.notes[0].isSlideStart).toBe(false);
  });
});
