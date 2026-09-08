import { describe, expect, it } from 'vitest';
import {
  STRICTNESS_PRESETS,
  addOnsetOffset,
  buildBendResult,
  buildExtraResult,
  buildMissedResult,
  classifyBendAccuracy,
  classifyPitch,
  classifyTiming,
  compensateOffset,
  createLatencyCompensator,
  frequencyToCentsOff,
  frequencyToCentsOffOctaveAgnostic,
  noteResultRank,
  pickBetterResult,
  type NoteResult,
} from '../domain/noteComparison';
import type { ExpectedNote } from '../domain/expectedNoteTimeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const beginner = STRICTNESS_PRESETS.beginner;
const intermediate = STRICTNESS_PRESETS.intermediate;
const pro = STRICTNESS_PRESETS.pro;

function makeNote(overrides: Partial<ExpectedNote> = {}): ExpectedNote {
  return {
    startMs: 0,
    endMs: 500,
    midiNote: 64,
    frequency: 329.63,
    noteName: 'E4',
    trackId: 'track-0',
    barIndex: 0,
    beatIndex: 0,
    isRest: false,
    bend: null,
    vibrato: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// frequencyToCentsOff
// ---------------------------------------------------------------------------

describe('frequencyToCentsOff', () => {
  it('returns 0 for exact match', () => {
    expect(frequencyToCentsOff(440, 440)).toBeCloseTo(0, 5);
  });

  it('returns +100 for one semitone sharp', () => {
    // One semitone sharp: detected = expected * 2^(1/12)
    const expected = 440;
    const detected = expected * Math.pow(2, 1 / 12);
    expect(frequencyToCentsOff(detected, expected)).toBeCloseTo(100, 2);
  });

  it('returns -100 for one semitone flat', () => {
    const expected = 440;
    const detected = expected * Math.pow(2, -1 / 12);
    expect(frequencyToCentsOff(detected, expected)).toBeCloseTo(-100, 2);
  });

  it('returns 0 for invalid frequencies', () => {
    expect(frequencyToCentsOff(0, 440)).toBe(0);
    expect(frequencyToCentsOff(440, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// frequencyToCentsOffOctaveAgnostic
// ---------------------------------------------------------------------------

describe('frequencyToCentsOffOctaveAgnostic', () => {
  it('folds an octave-up detection back to near-zero', () => {
    // Detector locked on the 2nd harmonic — user fingered A4 (440),
    // detector reported A5 (880). Raw cents = +1200; folded → 0.
    expect(frequencyToCentsOffOctaveAgnostic(880, 440)).toBeCloseTo(0, 5);
  });

  it('folds an octave-down detection back to near-zero', () => {
    // User played A4; detector confused and reported A3 (220). Raw
    // cents = -1200; folded → 0.
    expect(frequencyToCentsOffOctaveAgnostic(220, 440)).toBeCloseTo(0, 5);
  });

  it('keeps small deviations within the same octave unchanged', () => {
    // 10 cents sharp at A4 stays 10 cents — nothing to fold.
    const raw = frequencyToCentsOff(440 * Math.pow(2, 10 / 1200), 440);
    const folded = frequencyToCentsOffOctaveAgnostic(
      440 * Math.pow(2, 10 / 1200),
      440,
    );
    expect(folded).toBeCloseTo(raw, 5);
    expect(folded).toBeCloseTo(10, 5);
  });

  it('folds within ±600¢ (half-octave)', () => {
    // 700¢ off (perfect fifth up) folds to -500¢ (the closest
    // octave is +1200, so 700 - 1200 = -500).
    const folded = frequencyToCentsOffOctaveAgnostic(
      440 * Math.pow(2, 700 / 1200),
      440,
    );
    expect(folded).toBeCloseTo(-500, 5);
  });

  it('a wrong note that is a full semitone off stays flagged as wrong', () => {
    // Folding must NOT help a user who played the wrong pitch class
    // — 100¢ (semitone) is not near any octave boundary.
    const folded = frequencyToCentsOffOctaveAgnostic(
      440 * Math.pow(2, 100 / 1200),
      440,
    );
    expect(Math.abs(folded)).toBeCloseTo(100, 5);
  });
});

// ---------------------------------------------------------------------------
// classifyPitch
// ---------------------------------------------------------------------------

describe('classifyPitch', () => {
  // Preset bands after the beginner loosening:
  //   beginner:      40 / 70 / 120
  //   intermediate:  10 / 25 / 50
  //   pro:            5 / 10 / 25

  it('beginner: ≤40¢ → perfect', () => {
    expect(classifyPitch(40, beginner)).toBe('perfect');
    expect(classifyPitch(0, beginner)).toBe('perfect');
  });

  it('beginner: 41–70¢ → good', () => {
    expect(classifyPitch(50, beginner)).toBe('good');
    expect(classifyPitch(70, beginner)).toBe('good');
  });

  it('beginner: 71–120¢ → acceptable', () => {
    expect(classifyPitch(90, beginner)).toBe('acceptable');
    expect(classifyPitch(120, beginner)).toBe('acceptable');
  });

  it('beginner: >120¢ → wrong', () => {
    expect(classifyPitch(121, beginner)).toBe('wrong');
    expect(classifyPitch(200, beginner)).toBe('wrong');
  });

  it('pro: 30¢ → wrong (beginner would be perfect)', () => {
    expect(classifyPitch(30, pro)).toBe('wrong');
    expect(classifyPitch(30, beginner)).toBe('perfect');
  });

  it('intermediate: 10¢ → perfect, 30¢ → acceptable', () => {
    expect(classifyPitch(10, intermediate)).toBe('perfect');
    expect(classifyPitch(30, intermediate)).toBe('acceptable');
  });
});

// ---------------------------------------------------------------------------
// classifyTiming
// ---------------------------------------------------------------------------

describe('classifyTiming', () => {
  // Preset bands after the rebalancing:
  //   beginner:      200 / 320 / 450  (much looser — basics only)
  //   intermediate:   60 / 110 / 180  (the sweet spot)
  //   pro:            45 /  85 / 140  (minimally tighter than intermediate)

  it('beginner: ≤200ms → perfect', () => {
    expect(classifyTiming(0, beginner)).toBe('perfect');
    expect(classifyTiming(200, beginner)).toBe('perfect');
  });

  it('beginner: 201–320ms → good', () => {
    expect(classifyTiming(260, beginner)).toBe('good');
  });

  it('beginner: 451ms → wrong', () => {
    expect(classifyTiming(451, beginner)).toBe('wrong');
  });

  it('pro: 60ms late → good', () => {
    // pro: perfect ≤45ms, good ≤85ms
    expect(classifyTiming(60, pro)).toBe('good');
  });

  it('pro: 120ms late → acceptable', () => {
    // pro: acceptable ≤140ms
    expect(classifyTiming(120, pro)).toBe('acceptable');
  });

  it('pro: 150ms late → wrong', () => {
    expect(classifyTiming(150, pro)).toBe('wrong');
  });

  it('intermediate: on-time → perfect, 90ms → good, 200ms → wrong', () => {
    expect(classifyTiming(0, intermediate)).toBe('perfect');
    expect(classifyTiming(90, intermediate)).toBe('good');
    expect(classifyTiming(200, intermediate)).toBe('wrong');
  });
});

// ---------------------------------------------------------------------------
// classifyBendAccuracy
// ---------------------------------------------------------------------------

describe('classifyBendAccuracy', () => {
  // Beginner bend bands were widened alongside pitch / timing
  // (beginner is the "get the basics" mode): perfect ≤60¢, good ≤100¢.
  it('beginner: ≤60¢ from target → perfect', () => {
    expect(classifyBendAccuracy(60, beginner)).toBe('perfect');
    expect(classifyBendAccuracy(0, beginner)).toBe('perfect');
  });

  it('beginner: 61–100¢ from target → good', () => {
    expect(classifyBendAccuracy(80, beginner)).toBe('good');
  });

  it('beginner: >100¢ → wrong', () => {
    expect(classifyBendAccuracy(101, beginner)).toBe('wrong');
  });

  it('pro: ≤8¢ → perfect, 16¢ → wrong', () => {
    expect(classifyBendAccuracy(8, pro)).toBe('perfect');
    expect(classifyBendAccuracy(16, pro)).toBe('wrong');
  });
});

// ---------------------------------------------------------------------------
// buildMissedResult
// ---------------------------------------------------------------------------

describe('buildMissedResult', () => {
  it('outcome is missed with null accuracy fields', () => {
    const note = makeNote();
    const result = buildMissedResult(note);
    expect(result.outcome).toBe('missed');
    expect(result.pitchAccuracy).toBeNull();
    expect(result.timingAccuracy).toBeNull();
    expect(result.centsOff).toBeNull();
    expect(result.timingOffsetMs).toBeNull();
    expect(result.bendResult).toBeNull();
    expect(result.expectedNote).toBe(note);
  });
});

// ---------------------------------------------------------------------------
// buildExtraResult
// ---------------------------------------------------------------------------

describe('buildExtraResult', () => {
  it('returns null for beginner (ignore penalty)', () => {
    const note = makeNote({ isRest: true });
    expect(buildExtraResult(note, beginner)).toBeNull();
  });

  it('returns extra result for intermediate (deduct penalty)', () => {
    const note = makeNote({ isRest: true });
    const result = buildExtraResult(note, intermediate);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('extra');
    expect(result!.pitchAccuracy).toBe('wrong');
  });

  it('returns extra result for pro (fail penalty)', () => {
    const note = makeNote({ isRest: true });
    const result = buildExtraResult(note, pro);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('extra');
  });
});

// ---------------------------------------------------------------------------
// buildBendResult
// ---------------------------------------------------------------------------

describe('buildBendResult', () => {
  const bend2st = {
    type: 'bend' as const,
    startPitchOffset: 0,
    endPitchOffset: 2, // target: +2 semitones = +200 cents
  };

  it('perfect bend: samples reach target ±8¢ (pro)', () => {
    // Target 200¢, last sample 205¢ → 5¢ off
    const result = buildBendResult(bend2st, [100, 150, 200, 205], pro);
    expect(result.bendAccuracy).toBe('perfect');
    expect(result.targetCentsOff).toBeCloseTo(5, 1);
  });

  it('good bend: samples reach within 30¢ (pro threshold)', () => {
    // Target 200¢, last sample 220¢ → 20¢ off → good for pro (≤15 = perfect, ≤30 = good? wait pro.bend.good=15)
    // Actually pro: perfect ≤8, good ≤15. 20¢ off → wrong for pro
    const result = buildBendResult(bend2st, [100, 200, 220], pro);
    expect(result.bendAccuracy).toBe('wrong');
  });

  it('good bend for intermediate: 25¢ off → good', () => {
    // intermediate: perfect ≤15¢, good ≤30¢. 25¢ off → good
    const result = buildBendResult(bend2st, [100, 175], intermediate);
    expect(result.bendAccuracy).toBe('good');
    expect(result.targetCentsOff).toBeCloseTo(25, 1);
  });

  it('tracks maxPitchOffsetSt correctly', () => {
    // Samples up to 300¢ = 3 semitones
    const result = buildBendResult(bend2st, [100, 200, 300, 200], beginner);
    expect(result.maxPitchOffsetSt).toBeCloseTo(3, 1);
  });

  it('returns wrong with max 0 for empty samples', () => {
    const result = buildBendResult(bend2st, [], beginner);
    expect(result.bendAccuracy).toBe('wrong');
    expect(result.maxPitchOffsetSt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// LatencyCompensator
// ---------------------------------------------------------------------------

describe('LatencyCompensator', () => {
  it('seeds with the default estimate for the shipping 8192 window', () => {
    // Bare call uses the default seed (~¾ of the analyzer's window
    // lag at 44.1 kHz) so early-run notes are corrected without
    // waiting for MIN_SAMPLES of live data.
    const state = createLatencyCompensator();
    expect(state.estimatedLatencyMs).toBe(140);
  });

  it('accepts an explicit seed overriding the default', () => {
    const state = createLatencyCompensator(40);
    expect(state.estimatedLatencyMs).toBe(40);
  });

  it('clamps the seed to the hard cap and to non-negative values', () => {
    // Absurd seeds collapse to the 240 ms ceiling / 0 floor.
    expect(createLatencyCompensator(10_000).estimatedLatencyMs).toBe(240);
    expect(createLatencyCompensator(-50).estimatedLatencyMs).toBe(0);
    expect(createLatencyCompensator(Number.NaN).estimatedLatencyMs).toBe(0);
  });

  it('keeps the seed until MIN_SAMPLES real readings land', () => {
    // Below-threshold samples don't overwrite the seeded estimate —
    // the seed remains the best guess until the rolling median can
    // actually converge.
    let state = createLatencyCompensator(60);
    state = addOnsetOffset(state, 48);
    state = addOnsetOffset(state, 52);
    expect(state.estimatedLatencyMs).toBe(60);
  });

  it('estimates latency as median after MIN_SAMPLES (3) samples', () => {
    let state = createLatencyCompensator(0);
    const offsets = [48, 52, 50];
    for (const o of offsets) {
      state = addOnsetOffset(state, o);
    }
    expect(state.estimatedLatencyMs).toBeCloseTo(50, 0);
  });

  it('median is robust against outliers', () => {
    let state = createLatencyCompensator(0);
    const offsets = [45, 48, 120, 46, 50, 47, 49, 48]; // outlier 120ms
    for (const o of offsets) {
      state = addOnsetOffset(state, o);
    }
    // Median should be around 47-48, not influenced by 120
    expect(state.estimatedLatencyMs).toBeLessThan(55);
  });

  it('caps compensation at 240ms', () => {
    let state = createLatencyCompensator(0);
    for (let i = 0; i < 20; i++) {
      state = addOnsetOffset(state, 400); // all 400ms — above cap
    }
    expect(state.estimatedLatencyMs).toBe(240);
  });

  it('compensateOffset subtracts estimated latency', () => {
    let state = createLatencyCompensator(0);
    const offsets = Array(10).fill(50);
    for (const o of offsets) {
      state = addOnsetOffset(state, o);
    }
    // estimatedLatency ≈ 50ms
    expect(compensateOffset(state, 50)).toBeCloseTo(0, 0);
    expect(compensateOffset(state, 80)).toBeCloseTo(30, 0);
  });

  it('rolls over oldest entries when window is full', () => {
    let state = createLatencyCompensator(0);
    // Fill with 50ms offsets
    for (let i = 0; i < 20; i++) {
      state = addOnsetOffset(state, 50);
    }
    expect(state.estimatedLatencyMs).toBeCloseTo(50, 0);

    // Now feed 10ms offsets — window should shift
    for (let i = 0; i < 20; i++) {
      state = addOnsetOffset(state, 10);
    }
    expect(state.estimatedLatencyMs).toBeCloseTo(10, 0);
  });
});

// ---------------------------------------------------------------------------
// noteResultRank / pickBetterResult — chord collapse helper
// ---------------------------------------------------------------------------

describe('noteResultRank + pickBetterResult', () => {
  const hit = (overrides: Partial<NoteResult> = {}): NoteResult => ({
    expectedNote: makeNote(),
    outcome: 'hit',
    pitchAccuracy: 'perfect',
    centsOff: 0,
    timingAccuracy: 'perfect',
    timingOffsetMs: 0,
    bendResult: null,
    ...overrides,
  });

  it('ranks hit/perfect better than hit/good', () => {
    expect(noteResultRank(hit({ pitchAccuracy: 'perfect' }))).toBeLessThan(
      noteResultRank(hit({ pitchAccuracy: 'good' })),
    );
  });

  it('ranks hit (any) better than extra, and extra better than missed', () => {
    const missed: NoteResult = {
      expectedNote: makeNote(),
      outcome: 'missed',
      pitchAccuracy: null,
      centsOff: null,
      timingAccuracy: null,
      timingOffsetMs: null,
      bendResult: null,
    };
    const extra: NoteResult = {
      expectedNote: makeNote(),
      outcome: 'extra',
      pitchAccuracy: 'wrong',
      centsOff: null,
      timingAccuracy: null,
      timingOffsetMs: null,
      bendResult: null,
    };
    expect(noteResultRank(hit({ pitchAccuracy: 'wrong' }))).toBeLessThan(
      noteResultRank(extra),
    );
    expect(noteResultRank(extra)).toBeLessThan(noteResultRank(missed));
  });

  it('pickBetterResult keeps the chord voice with the best rating', () => {
    // A chord of E / G / C: user strikes the chord, pitch detector
    // locks on the E voice. E scores hit/perfect; G and C score
    // hit/wrong because the fundamental doesn't match them. The bar
    // cell must reflect that the chord WAS played, so best wins.
    const voiceE = hit({ pitchAccuracy: 'perfect' });
    const voiceG = hit({ pitchAccuracy: 'wrong', centsOff: 300 });
    const voiceC = hit({ pitchAccuracy: 'wrong', centsOff: 700 });
    const best = [voiceG, voiceE, voiceC].reduce(pickBetterResult);
    expect(best).toBe(voiceE);
  });

  it('pickBetterResult stable-picks the first arg on ties', () => {
    const a = hit({ pitchAccuracy: 'good' });
    const b = hit({ pitchAccuracy: 'good' });
    expect(pickBetterResult(a, b)).toBe(a);
  });
});
