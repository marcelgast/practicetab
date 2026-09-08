import { describe, expect, it } from 'vitest';

import { buildBeatNotesByStartMs } from '../services/player/beatNotesIndex';
import type {
  ATBeat,
  ATNote,
  ATTickCache,
} from '../services/player/alphaTabTypes';
import type { AlphaTabScore, TempoPoint } from '../services/player/types';

// 120 BPM: 1 quarter note = 500ms at division 480 (500_000 µs/quarter).
const TEMPO_120_BPM: TempoPoint[] = [
  { tick: 0, timeMs: 0, usPerQuarter: 500_000 },
];

function makeScore(opts: {
  tuning: number[];
  beats: Array<{
    tick: number;
    notes: Array<Partial<ATNote>> | null;
    isRest?: boolean;
  }>;
}): { score: AlphaTabScore; tickCache: ATTickCache } {
  const tickLookup = new Map<ATBeat, number>();
  const beats: ATBeat[] = opts.beats.map(({ tick, notes, isRest }) => {
    const beat: ATBeat = {
      isRest,
      notes: notes ? (notes as ATNote[]) : undefined,
    };
    tickLookup.set(beat, tick);
    return beat;
  });
  const score: AlphaTabScore = {
    tracks: [
      {
        staves: [
          {
            tuning: opts.tuning,
            bars: [{ voices: [{ beats }] }],
          } as never,
        ],
      },
    ],
  };
  const tickCache: ATTickCache = {
    getBeatStart: (beat: unknown) =>
      tickLookup.get(beat as ATBeat) ?? Number.NaN,
  };
  return { score, tickCache };
}

describe('buildBeatNotesByStartMs', () => {
  it('returns an empty map when required inputs are missing', () => {
    expect(
      buildBeatNotesByStartMs({
        score: null,
        tickCache: null,
        midiDivision: 480,
        tempoMap: TEMPO_120_BPM,
        midiTickShift: 0,
        activeTrackIndex: 0,
      }).size,
    ).toBe(0);

    expect(
      buildBeatNotesByStartMs({
        score: { tracks: [] } as AlphaTabScore,
        tickCache: { getBeatStart: () => 0 },
        midiDivision: 480,
        tempoMap: TEMPO_120_BPM,
        midiTickShift: 0,
        activeTrackIndex: 0,
      }).size,
    ).toBe(0);
  });

  it('normalises AlphaTab 1-indexed `string` to 0-indexed lowest-first', () => {
    // Standard 6-string guitar; `string: 1` = low E = PracticeTab's
    // `stringIndex: 0`. `string: 6` = high E = `stringIndex: 5`.
    const { score, tickCache } = makeScore({
      tuning: [64, 59, 55, 50, 45, 40],
      beats: [
        {
          tick: 0,
          notes: [
            { string: 1, fret: 3, realValue: 43 }, // low E, fret 3 → G2
            { string: 6, fret: 7, realValue: 71 }, // high E, fret 7 → B4
          ],
        },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    const notes = map.get(0);
    expect(notes).toHaveLength(2);
    expect(notes![0]!.stringIndex).toBe(0); // low E
    expect(notes![0]!.fret).toBe(3);
    expect(notes![1]!.stringIndex).toBe(5); // high E
    expect(notes![1]!.fret).toBe(7);
  });

  it('keys beats by rawStartMs derived from the tempo map (1× speed)', () => {
    // At 120 BPM with division 480: beat N starts at N * 500 ms.
    const { score, tickCache } = makeScore({
      tuning: [64, 59, 55, 50, 45, 40],
      beats: [
        { tick: 0, notes: [{ string: 2, fret: 0 }] },
        { tick: 480, notes: [{ string: 2, fret: 2 }] },
        { tick: 960, notes: [{ string: 2, fret: 4 }] },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect([...map.keys()].sort((a, b) => a - b)).toEqual([0, 500, 1000]);
    expect(map.get(1000)![0]!.fret).toBe(4);
  });

  it('keeps chord voicings together on one startMs entry', () => {
    // Single beat with a three-note chord: A major, open position.
    const { score, tickCache } = makeScore({
      tuning: [64, 59, 55, 50, 45, 40],
      beats: [
        {
          tick: 0,
          notes: [
            { string: 5, fret: 0 }, // A2 open
            { string: 4, fret: 2 }, // E3 fret 2
            { string: 3, fret: 2 }, // A3 fret 2
            { string: 2, fret: 2 }, // C#4 fret 2
          ],
        },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect(map.get(0)).toHaveLength(4);
  });

  it('skips rest beats and notes with missing string/fret', () => {
    const { score, tickCache } = makeScore({
      tuning: [64, 59, 55, 50, 45, 40],
      beats: [
        { tick: 0, isRest: true, notes: [{ string: 1, fret: 0 }] },
        {
          tick: 480,
          notes: [
            { string: 3, fret: 5 },
            { fret: 5 }, // no string → dropped
            { string: 2 }, // no fret → dropped
          ],
        },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect(map.has(0)).toBe(false); // rest → dropped entirely
    const surviving = map.get(500);
    expect(surviving).toHaveLength(1);
    expect(surviving![0]!.fret).toBe(5);
  });

  it('drops notes whose string number exceeds the tuning count (malformed tabs)', () => {
    // 4-string bass tuning but a note claims string 6 — bogus.
    const { score, tickCache } = makeScore({
      tuning: [43, 38, 33, 28],
      beats: [
        {
          tick: 0,
          notes: [
            { string: 1, fret: 3 }, // valid
            { string: 6, fret: 3 }, // beyond the 4-string neck → dropped
          ],
        },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect(map.get(0)).toHaveLength(1);
    expect(map.get(0)![0]!.stringIndex).toBe(0);
  });

  it('merges voices that share the same startMs into one entry', () => {
    // Two voices (or a chord/melody split) laid out at the same
    // tick — unlike the rect cache, the fretboard map is the
    // musical content and must carry every note from every voice,
    // otherwise chord shapes paint incomplete.
    const { score, tickCache } = makeScore({
      tuning: [64, 59, 55, 50, 45, 40],
      beats: [
        { tick: 0, notes: [{ string: 1, fret: 3 }] },
        { tick: 0, notes: [{ string: 6, fret: 7 }] },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    const merged = map.get(0);
    expect(merged).toHaveLength(2);
    const pairs = merged!.map((p) => `${p.stringIndex}:${p.fret}`).sort();
    expect(pairs).toEqual(['0:3', '5:7']);
  });

  it('deduplicates identical (string, fret) pairs across voices at the same startMs', () => {
    // Two voices happen to play the same physical position — e.g.
    // a unison across overlapping voice lines. Merging must not
    // paint the same dot twice.
    const { score, tickCache } = makeScore({
      tuning: [64, 59, 55, 50, 45, 40],
      beats: [
        { tick: 0, notes: [{ string: 3, fret: 2 }] },
        {
          tick: 0,
          notes: [
            { string: 3, fret: 2 }, // duplicate — dropped
            { string: 2, fret: 3 }, // novel — kept
          ],
        },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    const merged = map.get(0);
    expect(merged).toHaveLength(2);
    const pairs = merged!.map((p) => `${p.stringIndex}:${p.fret}`).sort();
    // string 3 → stringIndex 2, string 2 → stringIndex 1.
    expect(pairs).toEqual(['1:3', '2:2']);
  });

  it('carries the sounding MIDI note through realValue → midiNote → note fallback chain', () => {
    const { score, tickCache } = makeScore({
      tuning: [64, 59, 55, 50, 45, 40],
      beats: [
        {
          tick: 0,
          notes: [
            { string: 1, fret: 0, realValue: 40 }, // realValue preferred
            { string: 2, fret: 0, midiNote: 45 }, // fallback to midiNote
            { string: 3, fret: 0, note: 50 }, // fallback to note
            { string: 4, fret: 0 }, // nothing → 0
          ],
        },
      ],
    });

    const map = buildBeatNotesByStartMs({
      score,
      tickCache,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    const notes = map.get(0);
    expect(notes![0]!.midiNote).toBe(40);
    expect(notes![1]!.midiNote).toBe(45);
    expect(notes![2]!.midiNote).toBe(50);
    expect(notes![3]!.midiNote).toBe(0);
  });
});
