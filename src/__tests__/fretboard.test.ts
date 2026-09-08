import { describe, expect, it } from 'vitest';

import {
  type FretPosition,
  findFrettingsAtStartMs,
  midiToPitchClass,
  resolveFretCount,
  resolveStringLabels,
  scanMaxFret,
} from '../domain/fretboard';
import type { AlphaTabScore } from '../services/player/types';

// ---------------------------------------------------------------------------
// scanMaxFret — once-per-tab max-fret analysis
// ---------------------------------------------------------------------------

describe('scanMaxFret', () => {
  it('returns 0 for an empty / null / notation-only score', () => {
    expect(scanMaxFret(null)).toBe(0);
    expect(scanMaxFret(undefined)).toBe(0);
    expect(scanMaxFret({ tracks: [] } as AlphaTabScore)).toBe(0);
  });

  it('returns the single fret value for a one-note tab', () => {
    const score = {
      tracks: [
        {
          staves: [
            { bars: [{ voices: [{ beats: [{ notes: [{ fret: 7 }] }] }] }] },
          ],
        },
      ],
    } as unknown as AlphaTabScore;
    expect(scanMaxFret(score)).toBe(7);
  });

  it('finds the max across tracks, staves, bars, voices and beats', () => {
    const score = {
      tracks: [
        {
          // Track 0: low frets only.
          staves: [
            {
              bars: [
                {
                  voices: [
                    {
                      beats: [
                        { notes: [{ fret: 2 }, { fret: 5 }] },
                        { notes: [{ fret: 3 }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          // Track 1: a 24th-fret stretch.
          staves: [
            {
              bars: [
                {
                  voices: [
                    { beats: [{ notes: [{ fret: 12 }, { fret: 24 }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as AlphaTabScore;
    expect(scanMaxFret(score)).toBe(24);
  });

  it('skips rest beats and ignores non-finite fret values', () => {
    const score = {
      tracks: [
        {
          staves: [
            {
              bars: [
                {
                  voices: [
                    {
                      beats: [
                        { isRest: true, notes: [{ fret: 99 }] }, // skipped
                        { notes: [{ fret: Number.NaN }] }, // skipped
                        { notes: [{ fret: 4 }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as AlphaTabScore;
    expect(scanMaxFret(score)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// findFrettingsAtStartMs — cursor → active notes lookup
// ---------------------------------------------------------------------------

describe('findFrettingsAtStartMs', () => {
  function pos(stringIndex: number, fret: number, midiNote = 40): FretPosition {
    return { stringIndex, fret, midiNote };
  }

  const MAP = new Map<number, readonly FretPosition[]>([
    [0, [pos(5, 3, 67)]],
    [500, [pos(4, 5, 62), pos(3, 5, 57)]], // chord
    [1000, [pos(5, 0, 64)]],
    [1500, [pos(5, 12, 76)]],
  ]);

  it('returns [] for empty map / non-finite cursor', () => {
    expect(findFrettingsAtStartMs(new Map(), 500)).toEqual([]);
    expect(findFrettingsAtStartMs(MAP, Number.NaN)).toEqual([]);
  });

  it('returns [] when the cursor is before the first beat', () => {
    expect(findFrettingsAtStartMs(MAP, -100)).toEqual([]);
  });

  it('matches exactly on a beat boundary', () => {
    expect(findFrettingsAtStartMs(MAP, 500)).toHaveLength(2);
    expect(findFrettingsAtStartMs(MAP, 1000)[0]!.stringIndex).toBe(5);
    expect(findFrettingsAtStartMs(MAP, 1000)[0]!.fret).toBe(0);
  });

  it('"sticks" the previous beat while the cursor sits mid-beat', () => {
    // 750 ms is between 500 and 1000 → we still show the 500 ms chord.
    const result = findFrettingsAtStartMs(MAP, 750);
    expect(result).toHaveLength(2);
    expect(result[0]!.fret).toBe(5);
  });

  it('returns the last beat when cursor has moved past it', () => {
    const result = findFrettingsAtStartMs(MAP, 9_999_999);
    expect(result).toHaveLength(1);
    expect(result[0]!.fret).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// midiToPitchClass
// ---------------------------------------------------------------------------

describe('midiToPitchClass', () => {
  it('maps sharp chromatic pitch classes starting from C', () => {
    expect(midiToPitchClass(60)).toBe('C'); // middle C
    expect(midiToPitchClass(61)).toBe('C#');
    expect(midiToPitchClass(62)).toBe('D');
    expect(midiToPitchClass(67)).toBe('G');
    expect(midiToPitchClass(69)).toBe('A'); // A4
  });

  it('ignores the octave — just the pitch class', () => {
    expect(midiToPitchClass(12)).toBe('C'); // C0
    expect(midiToPitchClass(72)).toBe('C'); // C5
  });

  it('returns empty string for junk inputs', () => {
    expect(midiToPitchClass(Number.NaN)).toBe('');
    expect(midiToPitchClass(-1)).toBe('');
    expect(midiToPitchClass(128)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// resolveStringLabels — tab tuning × user offset → string labels
// ---------------------------------------------------------------------------

describe('resolveStringLabels', () => {
  // AlphaTab orders tunings top-tab-line-first = highest-pitched first.
  // Standard-E 6-string guitar:
  const STANDARD_E_GUITAR = [64, 59, 55, 50, 45, 40] as const;
  // 4-string bass standard EADG (low to high sounding):
  //   E1=28, A1=33, D2=38, G2=43
  // AlphaTab order = top-tab-line-first (highest) → [43, 38, 33, 28].
  const STANDARD_BASS = [43, 38, 33, 28] as const;

  it('returns labels lowest-pitched first (stringIndex 0 = low E)', () => {
    const labels = resolveStringLabels(STANDARD_E_GUITAR, 0);
    expect(labels).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
  });

  it("Marcel's worked example — 1-step-down tab + user offset -2 → low string = C", () => {
    // "1 step down" = -2 semitones from standard, applied IN the tab's
    // own tuning. So `tabTuning` is standard minus 2:
    //   [62, 57, 53, 48, 43, 38]  = D4 A3 F3 C3 G2 D2
    const tabTuning = STANDARD_E_GUITAR.map((m) => m - 2);
    const labels = resolveStringLabels(tabTuning, -2);
    // After user offset -2 applied on top, low-E string sounds as C2
    // (MIDI 36). Label = pitch class "C".
    expect(labels[0]).toBe('C');
  });

  it('respects the user offset on every string', () => {
    const labels = resolveStringLabels(STANDARD_E_GUITAR, 2);
    // +2 semitones — every string one whole step up.
    expect(labels).toEqual(['F#', 'B', 'E', 'A', 'C#', 'F#']);
  });

  it('handles 4-string bass tuning', () => {
    const labels = resolveStringLabels(STANDARD_BASS, 0);
    expect(labels).toEqual(['E', 'A', 'D', 'G']);
  });

  it('handles 5-string bass (BEADG) with user offset', () => {
    // 5-string bass = low B added: B0=23, E1=28, A1=33, D2=38, G2=43
    // AlphaTab order (top-tab = highest) = [43, 38, 33, 28, 23].
    const fiveString = [43, 38, 33, 28, 23];
    const labels = resolveStringLabels(fiveString, 0);
    expect(labels).toEqual(['B', 'E', 'A', 'D', 'G']);
  });

  it('returns [] for missing / empty tuning', () => {
    expect(resolveStringLabels(null, 0)).toEqual([]);
    expect(resolveStringLabels(undefined, 0)).toEqual([]);
    expect(resolveStringLabels([], 0)).toEqual([]);
  });

  it('treats non-finite offset as 0', () => {
    const labels = resolveStringLabels(STANDARD_E_GUITAR, Number.NaN);
    expect(labels).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
  });
});

// ---------------------------------------------------------------------------
// resolveFretCount — how many frets the neck SVG renders
// ---------------------------------------------------------------------------

describe('resolveFretCount', () => {
  it('defaults to 24 when max is missing / non-finite', () => {
    expect(resolveFretCount(null)).toBe(24);
    expect(resolveFretCount(undefined)).toBe(24);
    expect(resolveFretCount(Number.NaN)).toBe(24);
  });

  it('clamps to the floor (12) for low-usage tabs', () => {
    expect(resolveFretCount(0)).toBe(12);
    expect(resolveFretCount(5)).toBe(12);
    expect(resolveFretCount(11)).toBe(12);
  });

  it('adds +1 headroom beyond the highest used fret', () => {
    expect(resolveFretCount(14)).toBe(15);
    expect(resolveFretCount(21)).toBe(22);
  });

  it('clamps to the ceiling (28) for absurd inputs', () => {
    expect(resolveFretCount(28)).toBe(28);
    expect(resolveFretCount(36)).toBe(28);
    expect(resolveFretCount(1_000)).toBe(28);
  });
});
