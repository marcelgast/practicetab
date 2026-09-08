import { describe, expect, it, beforeEach } from 'vitest';
import { NoteComparisonEngine } from '../domain/noteComparisonEngine';
import { STRICTNESS_PRESETS } from '../domain/noteComparison';
import type {
  ExpectedNote,
  ExpectedNoteTimeline,
} from '../domain/expectedNoteTimeline';
import type { PitchResult } from '../services/pitchDetectionCommands';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(
  startMs: number,
  endMs: number,
  midiNote = 64,
  frequency = 329.63,
  overrides: Partial<ExpectedNote> = {},
): ExpectedNote {
  return {
    startMs,
    endMs,
    midiNote,
    frequency,
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

function makeTimeline(notes: ExpectedNote[]): ExpectedNoteTimeline {
  return { notes, trackId: 'track-0', tempoFactor: 1 };
}

function makePitch(overrides: Partial<PitchResult> = {}): PitchResult {
  return {
    frequency: 329.63, // E4 — exact match
    clarity: 0.95,
    rms: 0.1,
    midiNote: 64,
    noteName: 'E4',
    centsOffset: 0,
    timestampMs: 100,
    onsetDetected: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NoteComparisonEngine', () => {
  let engine: NoteComparisonEngine;

  beforeEach(() => {
    engine = new NoteComparisonEngine();
    engine.setStrictness(STRICTNESS_PRESETS.beginner);
  });

  // -------------------------------------------------------------------------
  // Basic lifecycle
  // -------------------------------------------------------------------------

  it('returns empty results when no timeline is set', () => {
    expect(engine.advancePlayhead(500)).toEqual([]);
    expect(engine.processPitchResult(makePitch(), 100)).toEqual([]);
  });

  it('returns empty results before any notes start', () => {
    engine.setTimeline(makeTimeline([makeNote(1000, 1500)]));
    expect(engine.advancePlayhead(500)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Hit: note played correctly
  // -------------------------------------------------------------------------

  it('emits a hit result when note ends with matching pitch', () => {
    const note = makeNote(0, 500);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(100);
    engine.processPitchResult(
      makePitch({ onsetDetected: true, frequency: 329.63 }),
      100,
    );
    const results = engine.advancePlayhead(501); // advance past note end

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('hit');
    expect(results[0].pitchAccuracy).toBe('perfect');
    expect(results[0].expectedNote).toBe(note);
  });

  it('uses the best pitch accuracy seen during the note', () => {
    const note = makeNote(0, 500);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(0);
    // First: 60¢ off → wrong
    engine.processPitchResult(
      makePitch({ frequency: 329.63 * Math.pow(2, 0.6 / 12) }),
      100,
    );
    // Then: exact match → perfect
    engine.processPitchResult(makePitch({ frequency: 329.63 }), 300);
    const results = engine.advancePlayhead(501);

    expect(results[0].pitchAccuracy).toBe('perfect');
  });

  // -------------------------------------------------------------------------
  // Missed note
  // -------------------------------------------------------------------------

  it('emits a missed result when note ends with no pitch detected', () => {
    // The warmup guard suppresses missed for notes that close before
    // any valid pitch was ever observed. Arm the engine with a valid
    // pitch on a played first note, then drive the playhead
    // continuously through a silent second note so it isn't opened
    // and closed in the same tick (that path is treated as a seek and
    // also skipped).
    const n1 = makeNote(0, 200); // played — arms the warmup guard
    const n2 = makeNote(500, 1000); // silent — should emit `missed`
    engine.setTimeline(makeTimeline([n1, n2]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch(), 100);
    engine.advancePlayhead(201);

    // Step past n2's startMs to open it, then past its endMs to close.
    engine.advancePlayhead(501);
    const results = engine.advancePlayhead(1001);
    expect(results).toHaveLength(1);
    expect(results[0].expectedNote).toBe(n2);
    expect(results[0].outcome).toBe('missed');
    expect(results[0].pitchAccuracy).toBeNull();
    expect(results[0].timingAccuracy).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Timing
  // -------------------------------------------------------------------------

  it('records timing offset from onset', () => {
    const note = makeNote(0, 500);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(0);
    // Onset at 100ms (note started at 0ms) → raw offset = 100ms.
    // The compensator seeds with `DEFAULT_LATENCY_SEED_MS = 140` so
    // the reported offset is `100 - 140 = -40` (user played slightly
    // early after compensating for analyzer lag). This is what we
    // want: even the very first onset is corrected, not a full
    // analyzer-window late.
    engine.processPitchResult(makePitch({ onsetDetected: true }), 100);
    const results = engine.advancePlayhead(501);

    expect(results[0].timingOffsetMs).not.toBeNull();
    expect(results[0].timingOffsetMs!).toBeCloseTo(-40, 0);
  });

  it('classifies on-time onset as perfect', () => {
    const note = makeNote(0, 500);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(0);
    // Onset exactly at note start
    engine.processPitchResult(makePitch({ onsetDetected: true }), 0);
    const results = engine.advancePlayhead(501);

    expect(results[0].timingAccuracy).toBe('perfect');
  });

  // -------------------------------------------------------------------------
  // Multiple sequential notes
  // -------------------------------------------------------------------------

  it('handles sequential notes correctly', () => {
    const n1 = makeNote(0, 400);
    const n2 = makeNote(500, 900, 69, 440); // A4
    engine.setTimeline(makeTimeline([n1, n2]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch(), 200);
    engine.advancePlayhead(401);

    engine.advancePlayhead(500);
    engine.processPitchResult(makePitch({ frequency: 440, midiNote: 69 }), 600);
    const results = engine.advancePlayhead(901);

    // n1 was emitted at advancePlayhead(401), n2 at 901
    // We only get n2 from the last call
    expect(results).toHaveLength(1);
    expect(results[0].expectedNote).toBe(n2);
    expect(results[0].outcome).toBe('hit');
  });

  it('falls back to soft-onset timing when the detector never flags onsetDetected', () => {
    // The common case in Marcel's dev log: 23 of 26 hits arrived with
    // `onset:false`, so the real onset detector never fired. Without
    // this fallback timing stays null on every note and drags the
    // summary score down. The first valid in-tune pitch's position
    // acts as the implicit attack.
    const note = makeNote(0, 500);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(0);
    // First in-tune pitch at t=80 — no onset flag.
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: false }),
      80,
    );
    // Later samples don't move the soft-onset (first-match-wins).
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: false }),
      300,
    );

    const results = engine.advancePlayhead(501);
    expect(results).toHaveLength(1);
    expect(results[0].pitchAccuracy).toBe('perfect');
    // Soft onset at 80ms, note.startMs=0, minus the fixed 40ms
    // pipeline-latency compensation → reported offset 40ms.
    expect(results[0].timingOffsetMs).toBe(40);
    expect(results[0].timingAccuracy).not.toBeNull();
  });

  it('prefers the real onset over the soft fallback when both are present', () => {
    // Guardrail: a real `onsetDetected` at t=20 should win over a
    // later-observed matching pitch. We record the real offset and
    // never overwrite it with soft-onset. The raw 20 ms is reduced
    // to `20 - DEFAULT_LATENCY_SEED_MS` after the compensator
    // corrects for analyzer lag (see the seed rationale in
    // `noteComparison.ts`).
    const note = makeNote(0, 500);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(0);
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      20,
    );
    // Another valid pitch later — must not shift the recorded onset.
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: false }),
      200,
    );

    const results = engine.advancePlayhead(501);
    expect(results[0].timingOffsetMs).toBeCloseTo(-120, 0);
  });

  it('accepts lower-clarity pitch for chord voices (blended chord signal)', () => {
    // Single-note gate is 0.6; chord-voice gate is 0.45. A 0.5
    // clarity sample is noise on a single note (rejected) but the
    // common case on a chord strum (accepted, promotes to hasPitch).
    const singleNote = makeNote(0, 500);
    const chordVoice = makeNote(0, 500, 67, 391.99, { isChord: true });
    engine.setTimeline(makeTimeline([singleNote]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch({ clarity: 0.5 }), 100);
    const singleRes = engine.advancePlayhead(501);
    // Single note with only a 0.5-clarity sample → no hasPitch →
    // finalised as missed (or skipped by warmup guard; in either
    // case no successful hit).
    expect(singleRes.find((r) => r.outcome === 'hit')).toBeUndefined();

    // Same stimulus on a chord voice → accepted, finalises as hit.
    const chordEngine = new NoteComparisonEngine();
    chordEngine.setStrictness(STRICTNESS_PRESETS.beginner);
    chordEngine.setTimeline(makeTimeline([chordVoice]));
    chordEngine.advancePlayhead(0);
    chordEngine.processPitchResult(
      makePitch({ frequency: 391.99, clarity: 0.5 }),
      100,
    );
    const chordRes = chordEngine.advancePlayhead(501);
    expect(chordRes).toHaveLength(1);
    expect(chordRes[0].outcome).toBe('hit');
  });

  it('does not soft-onset when all pitch samples were wrong (keeps timing null)', () => {
    // If the user never actually matched the note's pitch, there's no
    // defensible implicit attack time — timing should stay null so
    // the bar doesn't claim a fake-good timing reading.
    const note = makeNote(0, 500, 64, 329.63);
    engine.setStrictness(STRICTNESS_PRESETS.pro);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(0);
    // 392Hz (G4) against an E4 note → 3 semitones off → wrong band.
    engine.processPitchResult(
      makePitch({ frequency: 392, onsetDetected: false }),
      100,
    );

    const results = engine.advancePlayhead(501);
    expect(results[0].outcome).toBe('hit');
    expect(results[0].timingOffsetMs).toBeNull();
    expect(results[0].timingAccuracy).toBeNull();
  });

  it('emits both results for sequential notes across two advances', () => {
    const n1 = makeNote(0, 400);
    const n2 = makeNote(500, 900, 69, 440);
    engine.setTimeline(makeTimeline([n1, n2]));

    engine.advancePlayhead(200);
    engine.processPitchResult(makePitch(), 200);
    const r1 = engine.advancePlayhead(401); // closes n1

    engine.advancePlayhead(600);
    engine.processPitchResult(makePitch({ frequency: 440 }), 600);
    const r2 = engine.advancePlayhead(901); // closes n2

    expect(r1).toHaveLength(1);
    expect(r1[0].expectedNote).toBe(n1);
    expect(r2).toHaveLength(1);
    expect(r2[0].expectedNote).toBe(n2);
  });

  // -------------------------------------------------------------------------
  // Chord (simultaneous notes)
  // -------------------------------------------------------------------------

  it('tracks simultaneous notes as a chord independently', () => {
    const n1 = makeNote(0, 500, 64, 329.63); // E4
    const n2 = makeNote(0, 500, 67, 392.0); // G4
    engine.setTimeline(makeTimeline([n1, n2]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch({ frequency: 329.63 }), 100);
    const results = engine.advancePlayhead(501);

    expect(results).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Pitch gating (clarity / RMS)
  // -------------------------------------------------------------------------

  it('ignores low-clarity pitch results (does not count as hasPitch)', () => {
    // Arm the warmup guard with a valid pitch on a throwaway first
    // note so a subsequent "silent" note still emits `missed`; then
    // verify that a low-clarity sample during the target note does
    // NOT promote it to `hit`.
    const armer = makeNote(0, 100);
    const target = makeNote(500, 1000);
    engine.setTimeline(makeTimeline([armer, target]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch(), 50);
    engine.advancePlayhead(101);

    // Only sample during target's window is low-clarity → ignored.
    engine.advancePlayhead(500);
    engine.processPitchResult(makePitch({ clarity: 0.5 }), 600);
    const results = engine.advancePlayhead(1001);

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('missed');
  });

  it('ignores low-RMS pitch results (does not count as hasPitch)', () => {
    const armer = makeNote(0, 100);
    const target = makeNote(500, 1000);
    engine.setTimeline(makeTimeline([armer, target]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch(), 50);
    engine.advancePlayhead(101);

    engine.advancePlayhead(500);
    engine.processPitchResult(makePitch({ rms: 0.001 }), 600);
    const results = engine.advancePlayhead(1001);

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('missed');
  });

  // -------------------------------------------------------------------------
  // Bend tracking
  // -------------------------------------------------------------------------

  it('produces a BendResult for a note with a bend', () => {
    const note = makeNote(0, 500, 64, 329.63, {
      bend: { type: 'bend', startPitchOffset: 0, endPitchOffset: 2 },
    });
    engine.setTimeline(makeTimeline([note]));
    engine.setStrictness(STRICTNESS_PRESETS.beginner);

    engine.advancePlayhead(0);
    // Simulate bend reaching ~200¢ (2 semitones)
    engine.processPitchResult(makePitch({ frequency: 329.63 }), 100); // 0¢
    engine.processPitchResult(
      makePitch({ frequency: 329.63 * Math.pow(2, 2 / 12) }),
      300,
    ); // ~200¢
    const results = engine.advancePlayhead(501);

    expect(results[0].bendResult).not.toBeNull();
    expect(results[0].bendResult!.bendAccuracy).toBe('perfect');
  });

  it('produces null BendResult for a note without a bend', () => {
    const note = makeNote(0, 500);
    engine.setTimeline(makeTimeline([note]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch(), 100);
    const results = engine.advancePlayhead(501);

    expect(results[0].bendResult).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Strictness
  // -------------------------------------------------------------------------

  it('same note: beginner rates 60¢ as good, pro rates it as wrong', () => {
    function runWithStrictness(preset: keyof typeof STRICTNESS_PRESETS) {
      const eng = new NoteComparisonEngine();
      eng.setStrictness(STRICTNESS_PRESETS[preset]);
      const note = makeNote(0, 500);
      eng.setTimeline(makeTimeline([note]));
      eng.advancePlayhead(0);
      // 60¢ sharp — lands in beginner's `good` band (perfect ≤40,
      // good ≤70) and comfortably past pro's `acceptable` cap (25).
      eng.processPitchResult(
        makePitch({ frequency: 329.63 * Math.pow(2, 0.6 / 12) }),
        100,
      );
      return eng.advancePlayhead(501)[0];
    }

    const begResult = runWithStrictness('beginner');
    const proResult = runWithStrictness('pro');

    expect(begResult.pitchAccuracy).toBe('good');
    expect(proResult.pitchAccuracy).toBe('wrong');
  });

  // -------------------------------------------------------------------------
  // Tuning offset
  // -------------------------------------------------------------------------

  it('compares against the tuned expected frequency when setTuningSemitones != 0', () => {
    // Tab written as E4 (329.63 Hz). User tuned down 2 semitones
    // plays what sounds like D4 (293.66 Hz). Without the tuning
    // offset the 293.66 → 329.63 comparison is 200¢ off → wrong.
    // With setTuningSemitones(-2) the engine compares against
    // 329.63 * 2^(-2/12) ≈ 293.66 → perfect.
    const note = makeNote(0, 500, 64, 329.63); // E4 written
    engine.setTimeline(makeTimeline([note]));
    engine.setTuningSemitones(-2);
    engine.advancePlayhead(0);
    engine.processPitchResult(
      makePitch({ frequency: 293.66, onsetDetected: true }),
      100,
    );
    const results = engine.advancePlayhead(501);
    expect(results[0].pitchAccuracy).toBe('perfect');
  });

  // -------------------------------------------------------------------------
  // Octave-agnostic pitch comparison
  // -------------------------------------------------------------------------

  it('accepts a detected pitch that is one octave off the expected (harmonic mis-lock)', () => {
    // User fingered E4 but the pitch detector locked on the 2nd
    // harmonic (E5 ≈ 659.26 Hz). Without octave folding that's
    // +1200¢ off → wrong. With folding → near-zero → perfect.
    const note = makeNote(0, 500, 64, 329.63);
    engine.setTimeline(makeTimeline([note]));
    engine.advancePlayhead(0);
    engine.processPitchResult(
      makePitch({ frequency: 659.26, onsetDetected: true }),
      100,
    );
    const results = engine.advancePlayhead(501);
    expect(results[0].pitchAccuracy).toBe('perfect');
  });

  it('applies wider pitch tolerance to chord voices', () => {
    // Intermediate pitch bands: perfect ≤10¢, good ≤25¢, acceptable ≤50¢.
    // On a chord voice, the 3.0× scaling means a 60¢ raw reading
    // classifies at effective 20¢ → `good`, not `wrong`.
    const chordVoice = makeNote(0, 500, 64, 329.63, { isChord: true });
    engine.setStrictness(STRICTNESS_PRESETS.intermediate);
    engine.setTimeline(makeTimeline([chordVoice]));
    engine.advancePlayhead(0);
    engine.processPitchResult(
      makePitch({
        frequency: 329.63 * Math.pow(2, 60 / 1200),
        onsetDetected: true,
      }),
      100,
    );
    const results = engine.advancePlayhead(501);
    expect(results[0].pitchAccuracy).toBe('good');
    // centsOff stores the RAW deviation, not the scaled one — so the
    // arrow in the overlay still shows the real offset.
    expect(results[0].centsOff).toBeCloseTo(60, 0);
  });

  it('promotes a wrong chord voice when a sibling scored better', () => {
    // Three-voice chord: E (64/329.63), G (67/391.99), C (72/523.25).
    // Pitch detector locks on the E (bass), reports 329.63 Hz. E
    // voice → perfect. G and C voices → wrong (their expected
    // frequencies are different). The promotion pass lifts G and C
    // to perfect too — the chord WAS played, the detector just
    // can't see the other voices.
    const voiceE = makeNote(0, 500, 64, 329.63, { isChord: true });
    const voiceG = makeNote(0, 500, 67, 391.99, { isChord: true });
    const voiceC = makeNote(0, 500, 72, 523.25, { isChord: true });
    engine.setStrictness(STRICTNESS_PRESETS.intermediate);
    engine.setTimeline(makeTimeline([voiceE, voiceG, voiceC]));
    engine.advancePlayhead(0);
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      100,
    );
    const results = engine.advancePlayhead(501);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.pitchAccuracy).toBe('perfect');
    }
  });

  it('does NOT promote when every chord voice was wrong', () => {
    // Two voices spaced a minor third apart — detector reports
    // Bb4 (466 Hz), which is a tritone from E and a minor third
    // from G, so even with the 3.0× chord tolerance both voices
    // stay in the `wrong` bucket (600¢/3 = 200¢ and 300¢/3 = 100¢,
    // both above the 50¢ `acceptable` threshold). Promotion must
    // do nothing.
    const voiceE = makeNote(0, 500, 64, 329.63, { isChord: true });
    const voiceG = makeNote(0, 500, 67, 391.99, { isChord: true });
    engine.setStrictness(STRICTNESS_PRESETS.intermediate);
    engine.setTimeline(makeTimeline([voiceE, voiceG]));
    engine.advancePlayhead(0);
    engine.processPitchResult(
      makePitch({ frequency: 466, onsetDetected: true }),
      100,
    );
    const results = engine.advancePlayhead(501);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.pitchAccuracy).toBe('wrong');
    }
  });

  it('emits at most one `extra` result per rest region (decay tail dedupe)', () => {
    // Two notes with a big rest between them. User stops playing
    // but their guitar rings out — the pitch detector reports pitch
    // on every frame during the rest. Intermediate strictness
    // penalises extras; without dedupe we'd get one result per
    // frame instead of one per rest.
    const n1 = makeNote(0, 200);
    const n2 = makeNote(2000, 2200);
    engine.setStrictness(STRICTNESS_PRESETS.intermediate);
    engine.setTimeline(makeTimeline([n1, n2]));
    engine.advancePlayhead(0);

    // Play n1 normally — arm the warmup guard.
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      50,
    );
    engine.advancePlayhead(201);

    // Ten pitch frames of decay during the [200, 2000] rest. The
    // engine should emit exactly ONE `extra` across all of them.
    let extraCount = 0;
    for (let t = 400; t < 1400; t += 100) {
      const out = engine.processPitchResult(
        makePitch({ frequency: 329.63 }),
        t,
      );
      extraCount += out.filter((r) => r.outcome === 'extra').length;
    }
    expect(extraCount).toBe(1);
  });

  it('re-arms the extra reporter after every closed note', () => {
    // Two rests separated by a played note — each rest must get
    // its own extra, the flag must reset when the middle note
    // closes.
    const n1 = makeNote(0, 200);
    const n2 = makeNote(1000, 1200);
    const n3 = makeNote(2000, 2200);
    const eng = new NoteComparisonEngine();
    eng.setStrictness(STRICTNESS_PRESETS.intermediate);
    eng.setTimeline(makeTimeline([n1, n2, n3]));
    eng.advancePlayhead(0);

    // Play n1.
    eng.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      50,
    );
    eng.advancePlayhead(201);

    // First rest — one extra.
    const rest1a = eng.processPitchResult(
      makePitch({ frequency: 329.63 }),
      500,
    );
    const rest1b = eng.processPitchResult(
      makePitch({ frequency: 329.63 }),
      700,
    );

    // Play n2.
    eng.advancePlayhead(1000);
    eng.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      1050,
    );
    eng.advancePlayhead(1201);

    // Second rest — one extra.
    const rest2a = eng.processPitchResult(
      makePitch({ frequency: 329.63 }),
      1500,
    );
    const rest2b = eng.processPitchResult(
      makePitch({ frequency: 329.63 }),
      1700,
    );

    expect(
      [...rest1a, ...rest1b].filter((r) => r.outcome === 'extra'),
    ).toHaveLength(1);
    expect(
      [...rest2a, ...rest2b].filter((r) => r.outcome === 'extra'),
    ).toHaveLength(1);
  });

  it('still rejects a semitone-off note (folding does not hide a real wrong note)', () => {
    // User played F4 (349.23) against an E4 expectation. 100¢ off
    // — not near any octave boundary — must still land as wrong.
    const note = makeNote(0, 500, 64, 329.63);
    engine.setStrictness(STRICTNESS_PRESETS.intermediate);
    engine.setTimeline(makeTimeline([note]));
    engine.advancePlayhead(0);
    engine.processPitchResult(
      makePitch({ frequency: 349.23, onsetDetected: true }),
      100,
    );
    const results = engine.advancePlayhead(501);
    expect(results[0].pitchAccuracy).toBe('wrong');
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  it('reset clears active state so notes can replay', () => {
    const note = makeNote(0, 500);
    const timeline = makeTimeline([note]);
    engine.setTimeline(timeline);

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch(), 100);
    engine.advancePlayhead(501); // finalises note

    // Reset and replay from beginning
    engine.reset();
    engine.setTimeline(timeline);
    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch(), 100);
    const results = engine.advancePlayhead(501);

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe('hit');
  });

  // -------------------------------------------------------------------------
  // setTimeline clears state
  // -------------------------------------------------------------------------

  it('setTimeline clears previous state', () => {
    const timeline1 = makeTimeline([makeNote(0, 500)]);
    engine.setTimeline(timeline1);
    engine.advancePlayhead(200);

    // Switch to a new timeline mid-playback
    const note2 = makeNote(0, 400, 69, 440);
    engine.setTimeline(makeTimeline([note2]));
    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch({ frequency: 440 }), 100);
    const results = engine.advancePlayhead(401);

    expect(results).toHaveLength(1);
    expect(results[0].expectedNote).toBe(note2);
  });

  // -------------------------------------------------------------------------
  // Lenient scoring for slide-start / last-note
  // -------------------------------------------------------------------------

  it('freezes pitch rating on the last note after onset — vibrato drift does not downgrade', () => {
    // A very long window mimics a user sustaining the final note with
    // wide vibrato. Even if later samples land far off-pitch, the note
    // must stay at the onset-time rating.
    const last = makeNote(0, 2000, 64, 329.63, { isLastNote: true });
    engine.setStrictness(STRICTNESS_PRESETS.pro);
    engine.setTimeline(makeTimeline([last]));
    engine.advancePlayhead(0);

    // Perfect onset at t=10ms
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      10,
    );

    // Wide vibrato later — would otherwise flip pitch to `wrong`.
    engine.processPitchResult(
      makePitch({ frequency: 370, onsetDetected: false }),
      800,
    );
    engine.processPitchResult(
      makePitch({ frequency: 290, onsetDetected: false }),
      1200,
    );

    const results = engine.advancePlayhead(2001);
    expect(results).toHaveLength(1);
    expect(results[0].pitchAccuracy).toBe('perfect');
  });

  it('freezes pitch rating on slide-start notes the same way as last-note', () => {
    const slide = makeNote(0, 500, 64, 329.63, { isSlideStart: true });
    engine.setStrictness(STRICTNESS_PRESETS.pro);
    engine.setTimeline(makeTimeline([slide]));
    engine.advancePlayhead(0);

    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      10,
    );
    // Slide-out moves the pitch up — must not downgrade the rating.
    engine.processPitchResult(
      makePitch({ frequency: 392, onsetDetected: false }),
      250,
    );
    engine.processPitchResult(
      makePitch({ frequency: 440, onsetDetected: false }),
      400,
    );

    const results = engine.advancePlayhead(501);
    expect(results).toHaveLength(1);
    expect(results[0].pitchAccuracy).toBe('perfect');
  });

  it('ignores late vibrato onsets on the last note (no fake timing miss)', () => {
    // Exactly the bug from the dev log: user plucks a sustained last
    // note on pitch, engine gets no onset on the attack, then a
    // vibrato excursion fires `onsetDetected` 700ms into the window.
    // The late-onset guard must reject that 700ms onset.
    //
    // Soft-onset fallback then kicks in and picks up the very first
    // in-tune pitch sample (20ms into the window) as the implicit
    // onset — so timing reports a near-perfect 20ms offset rather
    // than a 700ms wrong reading. That's the correct answer: the
    // user DID play on time; the real attack was continuous with
    // the previous note (hence no onset flag), not late.
    const last = makeNote(0, 1000, 64, 329.63, { isLastNote: true });
    engine.setStrictness(STRICTNESS_PRESETS.pro);
    engine.setTimeline(makeTimeline([last]));
    engine.advancePlayhead(0);

    // Sustained correct pitch across the note — no onset flag.
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: false }),
      20,
    );
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: false }),
      300,
    );
    // Late "onset" triggered by vibrato — must be ignored by the
    // late-onset guard, leaving the soft-onset at 20ms intact.
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      700,
    );

    const results = engine.advancePlayhead(1001);
    expect(results).toHaveLength(1);
    expect(results[0].pitchAccuracy).toBe('perfect');
    // Soft-onset at 20ms, note.startMs=0, minus 40ms pipeline-latency
    // compensation → reported offset -20ms (slightly early after
    // compensation, which is a perfectly-on-time play in practice).
    expect(results[0].timingOffsetMs).toBe(-20);
    // |-20| vs pro timing.acceptable=120 → comfortably inside.
    expect(['perfect', 'good', 'acceptable']).toContain(
      results[0].timingAccuracy,
    );
  });

  it('still accepts the onset on the last note when it fires within the reaction window', () => {
    // User plucks the last note 250ms late — genuine late attack,
    // still inside the 300ms lenient-onset guard, must score.
    // After `DEFAULT_LATENCY_SEED_MS = 140` compensation the
    // reported offset is `250 - 140 = 110` ms — beginner's
    // `timing.perfect = 200` ms, so that still counts as `perfect`.
    const last = makeNote(0, 1000, 64, 329.63, { isLastNote: true });
    engine.setStrictness(STRICTNESS_PRESETS.beginner);
    engine.setTimeline(makeTimeline([last]));
    engine.advancePlayhead(0);

    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      250,
    );

    const results = engine.advancePlayhead(1001);
    expect(results).toHaveLength(1);
    expect(results[0].timingOffsetMs).not.toBeNull();
    expect(results[0].timingAccuracy).toBe('perfect');
  });

  // -------------------------------------------------------------------------
  // Startup-lag guard
  // -------------------------------------------------------------------------

  it('skips missed results for notes whose entire window fell behind the first position update', () => {
    // Reproduces the dev-log signature: Rust engine delivers the first
    // `positionMs` value at ~512ms; the first note [0, 500] and the
    // second [500, 1000] were both open+close in the same tick before
    // any pitch event arrived. Emitting `missed` for them paints the
    // overlay red for notes the user never had a chance to play.
    const n1 = makeNote(0, 500);
    const n2 = makeNote(500, 1000, 67, 391.99);
    const n3 = makeNote(1000, 1500, 69, 440);
    engine.setTimeline(makeTimeline([n1, n2, n3]));

    // First position poll lands at 512 — n1 is fully behind us, n2 is
    // mid-window (opens + remains active), n3 hasn't started yet.
    const first = engine.advancePlayhead(512);
    // n1 was opened+closed in THIS tick with no pitch → skipped silently.
    // n2 opens, stays active → no result yet.
    expect(first).toHaveLength(0);

    // User plays n2 in time — should still score normally.
    engine.processPitchResult(
      makePitch({ frequency: 391.99, onsetDetected: true }),
      600,
    );
    const second = engine.advancePlayhead(1001);
    expect(second).toHaveLength(1);
    expect(second[0].expectedNote).toBe(n2);
    expect(second[0].outcome).toBe('hit');
  });

  it('skips missed for notes that close before the first valid pitch arrives', () => {
    // Reproduces the Marcel-reported case: engine opens note 1 at
    // ~10ms (first real position update), the note stays active
    // through its [0, 500] window with no valid pitch samples
    // (mic / pitch pipeline warmup + human reaction time), and finally
    // closes at 501ms. The same-tick guard doesn't fire because
    // open and close happened in DIFFERENT advancePlayhead calls —
    // the warmup guard must handle this instead.
    const n1 = makeNote(0, 500);
    const n2 = makeNote(500, 1000, 67, 391.99);
    engine.setTimeline(makeTimeline([n1, n2]));

    engine.advancePlayhead(10); // opens n1
    // No pitch events arrive during [0, 500] — the pipeline is
    // still warming up.
    const closeN1 = engine.advancePlayhead(501);
    expect(closeN1).toHaveLength(0); // skipped, not `missed`

    // First valid pitch lands at 650ms, inside n2's window.
    engine.processPitchResult(
      makePitch({ frequency: 391.99, onsetDetected: true }),
      650,
    );
    const closeN2 = engine.advancePlayhead(1001);
    expect(closeN2).toHaveLength(1);
    expect(closeN2[0].expectedNote).toBe(n2);
    expect(closeN2[0].outcome).toBe('hit');
  });

  it('still emits missed for a note the user simply did not play in real time', () => {
    // Guardrail: once a valid pitch has been observed, subsequent
    // silent notes must still emit `missed` — only the warmup window
    // is lenient.
    const n1 = makeNote(0, 500);
    const n2 = makeNote(500, 1000, 67, 391.99);
    engine.setTimeline(makeTimeline([n1, n2]));

    engine.advancePlayhead(0); // opens n1
    // First pitch arrives early, valid — warmup guard disarms.
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: true }),
      100,
    );
    const closeN1 = engine.advancePlayhead(501);
    expect(closeN1).toHaveLength(1);
    expect(closeN1[0].outcome).toBe('hit');

    // n2: user stops playing → genuine miss, must be emitted.
    const closeN2 = engine.advancePlayhead(1001);
    expect(closeN2).toHaveLength(1);
    expect(closeN2[0].outcome).toBe('missed');
  });

  it('treats low-clarity/low-RMS pitch as not-yet-started (warmup stays armed)', () => {
    // A pitch event with clarity 0 / tiny RMS is silence, not a valid
    // detection. It must NOT disarm the warmup guard — otherwise the
    // first real note would be marked missed as soon as the mic emits
    // its first below-threshold sample.
    const n1 = makeNote(0, 500);
    engine.setTimeline(makeTimeline([n1]));

    engine.advancePlayhead(0);
    engine.processPitchResult(makePitch({ clarity: 0, rms: 0.0005 }), 50);
    const closeN1 = engine.advancePlayhead(501);
    expect(closeN1).toHaveLength(0); // still treated as warmup
  });

  it('still updates rating on normal notes when later samples are better', () => {
    // Guardrail: the lock only kicks in for slide/last notes. A plain
    // note that starts wrong but corrects itself must still be able
    // to climb to `perfect`.
    const normal = makeNote(0, 500, 64, 329.63);
    engine.setStrictness(STRICTNESS_PRESETS.pro);
    engine.setTimeline(makeTimeline([normal]));
    engine.advancePlayhead(0);

    // Onset off-pitch
    engine.processPitchResult(
      makePitch({ frequency: 392, onsetDetected: true }),
      10,
    );
    // User corrects to the right pitch
    engine.processPitchResult(
      makePitch({ frequency: 329.63, onsetDetected: false }),
      200,
    );

    const results = engine.advancePlayhead(501);
    expect(results).toHaveLength(1);
    expect(results[0].pitchAccuracy).toBe('perfect');
  });
});
