import { describe, it, expect } from 'vitest';
import {
  buildFeedbackSummary,
  serializeNoteDetails,
} from '../domain/feedbackSummary';
import type { NoteResult } from '../domain/noteComparison';
import type { ExpectedNote } from '../domain/expectedNoteTimeline';

function expectedNote(): ExpectedNote {
  return {
    startMs: 0,
    endMs: 500,
    midiNote: 64,
    frequency: 329.63,
    noteName: 'E4',
    trackId: 'track-0',
    barIndex: 0,
    beatIndex: 0,
    stringIndex: null,
    fretNumber: null,
    bend: null,
    vibrato: null,
    tempoFactor: 1,
  } as ExpectedNote;
}

function hit(overrides: Partial<NoteResult> = {}): NoteResult {
  return {
    expectedNote: expectedNote(),
    outcome: 'hit',
    pitchAccuracy: 'perfect',
    centsOff: 0,
    timingAccuracy: 'perfect',
    timingOffsetMs: 0,
    bendResult: null,
    ...overrides,
  };
}

function missed(): NoteResult {
  return {
    expectedNote: expectedNote(),
    outcome: 'missed',
    pitchAccuracy: null,
    centsOff: null,
    timingAccuracy: null,
    timingOffsetMs: null,
    bendResult: null,
  };
}

describe('buildFeedbackSummary', () => {
  it('returns zeros for an empty run', () => {
    const s = buildFeedbackSummary([]);
    expect(s.totalNotes).toBe(0);
    expect(s.overallScore).toBe(0);
    expect(s.suggestSlowDown).toBe(false);
    expect(s.longestStreak).toBe(0);
  });

  it('counts hit/missed/extra correctly', () => {
    const results: NoteResult[] = [
      hit(),
      missed(),
      {
        expectedNote: expectedNote(),
        outcome: 'extra',
        pitchAccuracy: 'wrong',
        centsOff: null,
        timingAccuracy: null,
        timingOffsetMs: null,
        bendResult: null,
      },
    ];
    const s = buildFeedbackSummary(results);
    expect(s.hitCount).toBe(1);
    expect(s.missedCount).toBe(1);
    expect(s.extraCount).toBe(1);
    expect(s.totalNotes).toBe(2); // extras don't count toward totalNotes
  });

  it('computes pitch and timing histograms only over hits', () => {
    const results: NoteResult[] = [
      hit({ pitchAccuracy: 'perfect', timingAccuracy: 'good' }),
      hit({ pitchAccuracy: 'good', timingAccuracy: 'acceptable' }),
      hit({ pitchAccuracy: 'wrong', timingAccuracy: 'wrong' }),
      missed(),
    ];
    const s = buildFeedbackSummary(results);
    expect(s.pitchHistogram).toEqual({
      perfect: 1,
      good: 1,
      acceptable: 0,
      wrong: 1,
    });
    expect(s.timingHistogram).toEqual({
      perfect: 0,
      good: 1,
      acceptable: 1,
      wrong: 1,
    });
  });

  it('tracks the longest streak even when broken by a miss', () => {
    const results: NoteResult[] = [hit(), hit(), hit(), missed(), hit(), hit()];
    const s = buildFeedbackSummary(results);
    expect(s.longestStreak).toBe(3);
  });

  it('returns a perfect overall score when every note is perfect', () => {
    const s = buildFeedbackSummary([hit(), hit(), hit()]);
    expect(s.overallScore).toBe(100);
    expect(s.suggestSlowDown).toBe(false);
  });

  it('flags suggestSlowDown when score drops below threshold', () => {
    const results: NoteResult[] = [
      hit({ pitchAccuracy: 'wrong', timingAccuracy: 'wrong' }),
      hit({ pitchAccuracy: 'wrong', timingAccuracy: 'wrong' }),
      missed(),
    ];
    const s = buildFeedbackSummary(results);
    expect(s.overallScore).toBeLessThan(60);
    expect(s.suggestSlowDown).toBe(true);
  });

  it('penalises missed notes via the overall score', () => {
    const allHits = buildFeedbackSummary([hit(), hit(), hit(), hit()]);
    const mixed = buildFeedbackSummary([hit(), hit(), missed(), missed()]);
    expect(mixed.overallScore).toBeLessThan(allHits.overallScore);
  });

  it('flags suggestStringMuting when missed ratio is high and user hit some notes', () => {
    // 5 hits, 5 missed — the pitch pipeline rejects unclear notes as
    // missed, so a clean-tone play-through with 50% missed is a
    // strong technique signal.
    const results: NoteResult[] = [
      hit(),
      hit(),
      hit(),
      hit(),
      hit(),
      missed(),
      missed(),
      missed(),
      missed(),
      missed(),
    ];
    const s = buildFeedbackSummary(results);
    expect(s.suggestStringMuting).toBe(true);
  });

  it('does NOT suggest string-muting below the 30% missed ratio', () => {
    // 8 hits, 1 missed → 11% missed. Not enough signal to blame
    // technique.
    const results: NoteResult[] = [
      hit(),
      hit(),
      hit(),
      hit(),
      hit(),
      hit(),
      hit(),
      hit(),
      missed(),
    ];
    const s = buildFeedbackSummary(results);
    expect(s.suggestStringMuting).toBe(false);
  });

  it('does NOT suggest string-muting when the user never hit anything', () => {
    // All missed → likely the user didn't play rather than a
    // technique problem. The hint would be misleading.
    const results: NoteResult[] = [missed(), missed(), missed()];
    const s = buildFeedbackSummary(results);
    expect(s.suggestStringMuting).toBe(false);
  });
});

describe('serializeNoteDetails', () => {
  it('produces the compact per-note shape for each result', () => {
    const result: NoteResult = hit({
      centsOff: -7,
      timingAccuracy: 'good',
      timingOffsetMs: 45,
    });
    // Shape matches the persisted JSON contract exactly — single-letter
    // keys keep a full run under ~300 KB.
    expect(serializeNoteDetails([result])).toEqual([
      {
        t: 0,
        n: 'E4',
        o: 'hit',
        pa: 'perfect',
        co: -7,
        ta: 'good',
        to: 45,
      },
    ]);
  });

  it('preserves input order (emission order = timeline order)', () => {
    // The detail-view timeline chart reads this back and plots against
    // t, so order doesn't matter for rendering. But we also rely on
    // the order in tests / debugging, so pin it.
    const order = serializeNoteDetails([hit(), missed(), hit()]).map(
      (n) => n.o,
    );
    expect(order).toEqual(['hit', 'missed', 'hit']);
  });

  it('passes through null pitch / timing fields for missed results', () => {
    const [entry] = serializeNoteDetails([missed()]);
    expect(entry.pa).toBeNull();
    expect(entry.co).toBeNull();
    expect(entry.ta).toBeNull();
    expect(entry.to).toBeNull();
  });

  it('returns an empty array for an empty run', () => {
    expect(serializeNoteDetails([])).toEqual([]);
  });
});
