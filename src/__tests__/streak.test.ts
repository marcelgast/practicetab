import { describe, it, expect } from 'vitest';
import { isStreakWorthy, type NoteResult } from '../domain/noteComparison';
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

describe('isStreakWorthy', () => {
  it('is true for perfect/perfect hits', () => {
    expect(isStreakWorthy(hit())).toBe(true);
  });

  it('is true for good/good hits', () => {
    expect(
      isStreakWorthy(hit({ pitchAccuracy: 'good', timingAccuracy: 'good' })),
    ).toBe(true);
  });

  it('is false when pitch is acceptable', () => {
    expect(isStreakWorthy(hit({ pitchAccuracy: 'acceptable' }))).toBe(false);
  });

  it('is false when timing is wrong', () => {
    expect(isStreakWorthy(hit({ timingAccuracy: 'wrong' }))).toBe(false);
  });

  it('is false for missed notes', () => {
    expect(
      isStreakWorthy({
        expectedNote: expectedNote(),
        outcome: 'missed',
        pitchAccuracy: null,
        centsOff: null,
        timingAccuracy: null,
        timingOffsetMs: null,
        bendResult: null,
      }),
    ).toBe(false);
  });

  it('is false for extra notes', () => {
    expect(
      isStreakWorthy({
        expectedNote: expectedNote(),
        outcome: 'extra',
        pitchAccuracy: 'wrong',
        centsOff: null,
        timingAccuracy: null,
        timingOffsetMs: null,
        bendResult: null,
      }),
    ).toBe(false);
  });

  it('is false when bend rating is wrong', () => {
    expect(
      isStreakWorthy(
        hit({
          bendResult: {
            expectedBend: {
              type: 'bend',
              startPitchOffset: 0,
              endPitchOffset: 2,
            },
            maxPitchOffsetSt: 2,
            targetCentsOff: 200,
            bendAccuracy: 'wrong',
          },
        }),
      ),
    ).toBe(false);
  });

  it('is true when bend rating is good', () => {
    expect(
      isStreakWorthy(
        hit({
          bendResult: {
            expectedBend: {
              type: 'bend',
              startPitchOffset: 0,
              endPitchOffset: 2,
            },
            maxPitchOffsetSt: 2,
            targetCentsOff: 10,
            bendAccuracy: 'good',
          },
        }),
      ),
    ).toBe(true);
  });
});
