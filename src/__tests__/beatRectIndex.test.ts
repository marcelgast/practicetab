import { describe, expect, it } from 'vitest';
import {
  buildBeatRectsByStartMs,
  rawStartMsFromExpected,
  type BeatBoundsLookup,
} from '../services/player/beatRectIndex';
import type { AlphaTabScore, TempoPoint } from '../services/player/types';
import type { ATBeat, ATTickCache } from '../services/player/alphaTabTypes';

// ---------------------------------------------------------------------------
// Helpers — build a minimal score graph + companion tickCache + boundsLookup
// ---------------------------------------------------------------------------

interface FixtureBeat {
  beat: ATBeat;
  /** Tick position the fake tickCache returns for this beat. */
  tick: number;
  /** Visual bounds the fake boundsLookup returns for this beat. */
  bounds: { x: number; y: number; w: number; h: number } | null;
}

function makeFixture(trackBeats: FixtureBeat[][]): {
  score: AlphaTabScore;
  tickCache: ATTickCache;
  boundsLookup: BeatBoundsLookup;
} {
  // One stave, one bar, one voice per track — enough to exercise the walker.
  const score: AlphaTabScore = {
    tracks: trackBeats.map((beats) => ({
      staves: [
        {
          bars: [{ voices: [{ beats: beats.map((b) => b.beat) }] }],
        },
      ],
    })),
  };

  const allBeats = trackBeats.flat();

  const tickCache: ATTickCache = {
    getBeatStart: (beat) => {
      const entry = allBeats.find((b) => b.beat === beat);
      if (!entry) throw new Error('beat not in fixture');
      return entry.tick;
    },
  };

  const boundsLookup: BeatBoundsLookup = {
    findBeat: (beat) => {
      const entry = allBeats.find((b) => b.beat === beat);
      if (!entry) return null;
      return entry.bounds ? { visualBounds: entry.bounds } : null;
    },
  };

  return { score, tickCache, boundsLookup };
}

/**
 * Tempo map for a constant 120 BPM (500_000 µs/quarter).
 * With division=480, tick 480 = 1 beat = 500 ms.
 */
const TEMPO_120_BPM: TempoPoint[] = [
  { tick: 0, timeMs: 0, usPerQuarter: 500_000 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildBeatRectsByStartMs', () => {
  it('returns an empty map when score is null', () => {
    const result = buildBeatRectsByStartMs({
      score: null,
      tickCache: { getBeatStart: () => 0 },
      boundsLookup: { findBeat: () => null },
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(0);
  });

  it('returns an empty map when tickCache.getBeatStart is missing', () => {
    const { score, boundsLookup } = makeFixture([[]]);
    const result = buildBeatRectsByStartMs({
      score,
      tickCache: {},
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(0);
  });

  it('returns an empty map when boundsLookup.findBeat is missing', () => {
    const { score, tickCache } = makeFixture([[]]);
    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup: {},
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(0);
  });

  it('indexes all beats of the active track by raw startMs (1×)', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      [
        {
          beat: { notes: [{ midiNote: 64 }] },
          tick: 0,
          bounds: { x: 10, y: 20, w: 30, h: 40 },
        },
        {
          beat: { notes: [{ midiNote: 67 }] },
          tick: 480,
          bounds: { x: 50, y: 20, w: 30, h: 40 },
        },
        {
          beat: { notes: [{ midiNote: 72 }] },
          tick: 960,
          bounds: { x: 90, y: 20, w: 30, h: 40 },
        },
      ],
    ]);

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect(result.size).toBe(3);
    // 120 BPM, div=480 → 1 beat = 500 ms. The fixture's fake
    // boundsLookup returns `visualBounds` without `onNotesX`, so we
    // fall back to the visual-bounds midpoint (x + w/2).
    expect(result.get(0)).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      onNotesX: 25,
      realTopY: 20,
    });
    expect(result.get(500)).toEqual({
      x: 50,
      y: 20,
      w: 30,
      h: 40,
      onNotesX: 65,
      realTopY: 20,
    });
    expect(result.get(1000)).toEqual({
      x: 90,
      y: 20,
      w: 30,
      h: 40,
      onNotesX: 105,
      realTopY: 20,
    });
  });

  it('captures onNotesX from the bounds lookup when provided', () => {
    const beatA: ATBeat = { notes: [{ midiNote: 64 }] };
    const beatB: ATBeat = { notes: [{ midiNote: 67 }] };
    const score: AlphaTabScore = {
      tracks: [
        {
          staves: [{ bars: [{ voices: [{ beats: [beatA, beatB] }] }] }],
        },
      ],
    };
    const tickCache: ATTickCache = {
      getBeatStart: (beat) => (beat === beatA ? 0 : 480),
    };
    const boundsLookup: BeatBoundsLookup = {
      findBeat: (beat) =>
        beat === beatA
          ? {
              visualBounds: { x: 10, y: 20, w: 30, h: 40 },
              onNotesX: 17,
            }
          : {
              visualBounds: { x: 50, y: 20, w: 30, h: 40 },
              onNotesX: 63,
            },
    };

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect(result.get(0)?.onNotesX).toBe(17);
    expect(result.get(500)?.onNotesX).toBe(63);
  });

  it('pins realTopY to lineAlignedBounds.y (ignores wider masterBar bounds)', () => {
    // lineAlignedBounds.y is the top staff line — that's the only
    // source we anchor on. masterBar.realBounds.y extends further
    // up into the system padding and must NOT be picked, otherwise
    // the feedback bar floats way above the score.
    const beat: ATBeat = { notes: [{ midiNote: 64 }] };
    const score: AlphaTabScore = {
      tracks: [
        {
          staves: [{ bars: [{ voices: [{ beats: [beat] }] }] }],
        },
      ],
    };
    const tickCache: ATTickCache = { getBeatStart: () => 0 };
    const boundsLookup: BeatBoundsLookup = {
      findBeat: () => ({
        visualBounds: { x: 10, y: 80, w: 20, h: 30 },
        onNotesX: 20,
        barBounds: {
          masterBarBounds: {
            lineAlignedBounds: { x: 5, y: 50, w: 100, h: 80 },
            realBounds: { x: 5, y: 20, w: 100, h: 110 },
          },
        },
      }),
    };

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    // lineAlignedBounds.y (50) wins; realBounds.y (20) is ignored.
    expect(result.get(0)?.realTopY).toBe(50);
  });

  it('falls back to visualBounds.y when lineAlignedBounds is absent', () => {
    const beat: ATBeat = { notes: [{ midiNote: 64 }] };
    const score: AlphaTabScore = {
      tracks: [
        {
          staves: [{ bars: [{ voices: [{ beats: [beat] }] }] }],
        },
      ],
    };
    const tickCache: ATTickCache = { getBeatStart: () => 0 };
    const boundsLookup: BeatBoundsLookup = {
      findBeat: () => ({
        visualBounds: { x: 10, y: 80, w: 20, h: 30 },
        onNotesX: 20,
      }),
    };

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect(result.get(0)?.realTopY).toBe(80);
  });

  it('falls back via findMasterBar when the beat-bounds chain is empty', () => {
    // Simulates AlphaTab renderers that populate the master-bar
    // lookup but not the beat-bounds parent chain. `findMasterBar`
    // must be called using the beat's voice.bar.masterBar back-ref.
    const masterBar = { tick: 0 };
    const beat: ATBeat = {
      notes: [{ midiNote: 64 }],
      voice: { bar: { masterBar } },
    };
    const score: AlphaTabScore = {
      tracks: [
        {
          staves: [{ bars: [{ masterBar, voices: [{ beats: [beat] }] }] }],
        },
      ],
    };
    const tickCache: ATTickCache = { getBeatStart: () => 0 };
    let findMasterBarCalls = 0;
    const boundsLookup: BeatBoundsLookup = {
      findBeat: () => ({
        visualBounds: { x: 10, y: 80, w: 20, h: 30 },
        onNotesX: 20,
        // Intentionally no `barBounds` — mirrors renderers that
        // skip populating the parent chain on BeatBounds.
      }),
      findMasterBar: (mb) => {
        findMasterBarCalls += 1;
        if (mb !== masterBar) return null;
        return { lineAlignedBounds: { x: 0, y: 42, w: 500, h: 60 } };
      },
    };

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });

    expect(result.get(0)?.realTopY).toBe(42);
    expect(findMasterBarCalls).toBe(1);
  });

  it('scopes to the active track when multiple tracks exist', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      // track 0
      [
        {
          beat: { notes: [{ midiNote: 64 }] },
          tick: 0,
          bounds: { x: 1, y: 1, w: 10, h: 10 },
        },
      ],
      // track 1 — must be ignored when activeTrackIndex=0
      [
        {
          beat: { notes: [{ midiNote: 60 }] },
          tick: 240,
          bounds: { x: 2, y: 2, w: 10, h: 10 },
        },
      ],
    ]);

    const onlyTrack0 = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(onlyTrack0.size).toBe(1);
    expect(onlyTrack0.has(0)).toBe(true);
    expect(onlyTrack0.has(250)).toBe(false);

    const onlyTrack1 = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 1,
    });
    expect(onlyTrack1.size).toBe(1);
    expect(onlyTrack1.has(250)).toBe(true);
  });

  // Review finding 2: other player code resolves the active track via the
  // AlphaTab `track.index`, not the array position. The cache must match
  // either convention so the overlay rects line up with the rendered staff.
  it('scopes by AlphaTab track.index when array position and track.index diverge', () => {
    const tickCacheMap = new Map<ATBeat, number>();
    const beatTrack5 = { notes: [{ midiNote: 64 }] } as ATBeat;
    const beatTrack9 = { notes: [{ midiNote: 60 }] } as ATBeat;
    tickCacheMap.set(beatTrack5, 0);
    tickCacheMap.set(beatTrack9, 480);

    // Track at array position 0 carries track.index=5, position 1 → index=9.
    const score: AlphaTabScore = {
      tracks: [
        {
          index: 5,
          staves: [{ bars: [{ voices: [{ beats: [beatTrack5] }] }] }],
        },
        {
          index: 9,
          staves: [{ bars: [{ voices: [{ beats: [beatTrack9] }] }] }],
        },
      ],
    };
    const tickCache: ATTickCache = {
      getBeatStart: (beat) => {
        const tick = tickCacheMap.get(beat as ATBeat);
        if (tick === undefined) throw new Error('beat not in fixture');
        return tick;
      },
    };
    const boundsLookup: BeatBoundsLookup = {
      findBeat: (beat) => {
        if (beat === beatTrack5) {
          return { visualBounds: { x: 55, y: 0, w: 10, h: 10 } };
        }
        if (beat === beatTrack9) {
          return { visualBounds: { x: 99, y: 0, w: 10, h: 10 } };
        }
        return null;
      },
    };

    // activeTrackIndex=9 must pick the track whose track.index is 9,
    // not the track at array position 9 (doesn't exist).
    const byTrackIndex = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 9,
    });
    expect(byTrackIndex.size).toBe(1);
    expect(byTrackIndex.get(500)?.x).toBe(99);

    // activeTrackIndex=5 must pick the other track.
    const byOtherTrackIndex = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 5,
    });
    expect(byOtherTrackIndex.size).toBe(1);
    expect(byOtherTrackIndex.get(0)?.x).toBe(55);
  });

  it('also matches activeTrackIndex against array position (fallback)', () => {
    // Track has no `index` property at all — matching must fall back to idx.
    const beat = { notes: [{ midiNote: 64 }] } as ATBeat;
    const score: AlphaTabScore = {
      tracks: [{ staves: [{ bars: [{ voices: [{ beats: [beat] }] }] }] }],
    };
    const tickCache: ATTickCache = { getBeatStart: () => 0 };
    const boundsLookup: BeatBoundsLookup = {
      findBeat: () => ({ visualBounds: { x: 3, y: 3, w: 10, h: 10 } }),
    };
    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(1);
    expect(result.get(0)?.x).toBe(3);
  });

  it('indexes all tracks when activeTrackIndex is null', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      [
        {
          beat: { notes: [{ midiNote: 64 }] },
          tick: 0,
          bounds: { x: 1, y: 1, w: 10, h: 10 },
        },
      ],
      [
        {
          beat: { notes: [{ midiNote: 60 }] },
          tick: 480,
          bounds: { x: 2, y: 2, w: 10, h: 10 },
        },
      ],
    ]);

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: null,
    });
    expect(result.size).toBe(2);
  });

  it('skips rests', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      [
        {
          beat: { isRest: true },
          tick: 0,
          bounds: { x: 1, y: 1, w: 10, h: 10 },
        },
        {
          beat: { notes: [{ midiNote: 64 }] },
          tick: 480,
          bounds: { x: 2, y: 2, w: 10, h: 10 },
        },
      ],
    ]);

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(false);
    expect(result.has(500)).toBe(true);
  });

  it('skips beats with no bounds (unrendered)', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      [
        { beat: { notes: [{ midiNote: 64 }] }, tick: 0, bounds: null },
        {
          beat: { notes: [{ midiNote: 67 }] },
          tick: 480,
          bounds: { x: 5, y: 5, w: 10, h: 10 },
        },
      ],
    ]);
    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(1);
    expect(result.has(500)).toBe(true);
  });

  it('skips beats with zero-size bounds', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      [
        {
          beat: { notes: [{ midiNote: 64 }] },
          tick: 0,
          bounds: { x: 10, y: 10, w: 0, h: 20 },
        },
        {
          beat: { notes: [{ midiNote: 67 }] },
          tick: 480,
          bounds: { x: 5, y: 5, w: 10, h: 10 },
        },
      ],
    ]);
    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(false);
  });

  it('chord handling: first rect wins when two beats share a startMs', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      [
        {
          beat: { notes: [{ midiNote: 64 }] },
          tick: 0,
          bounds: { x: 10, y: 10, w: 20, h: 20 }, // first wins
        },
        {
          beat: { notes: [{ midiNote: 67 }] },
          tick: 0,
          bounds: { x: 99, y: 99, w: 20, h: 20 }, // dropped
        },
      ],
    ]);
    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(1);
    expect(result.get(0)?.x).toBe(10);
  });

  it('applies midiTickShift to the tick before converting to ms', () => {
    const { score, tickCache, boundsLookup } = makeFixture([
      [
        {
          // With shift=240, this tick becomes 0 (dropped? no — 240-240=0 is valid)
          beat: { notes: [{ midiNote: 64 }] },
          tick: 240,
          bounds: { x: 1, y: 1, w: 10, h: 10 },
        },
        {
          beat: { notes: [{ midiNote: 67 }] },
          tick: 720,
          bounds: { x: 2, y: 2, w: 10, h: 10 },
        },
        {
          // Tick < shift → skipped (pre-roll)
          beat: { notes: [{ midiNote: 60 }] },
          tick: 0,
          bounds: { x: 3, y: 3, w: 10, h: 10 },
        },
      ],
    ]);

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 240,
      activeTrackIndex: 0,
    });
    // shiftedTick 0 → 0 ms; shiftedTick 480 → 500 ms; shiftedTick -240 dropped.
    expect(result.size).toBe(2);
    expect(result.has(0)).toBe(true);
    expect(result.has(500)).toBe(true);
  });

  it('swallows throwing getBeatStart / findBeat without crashing', () => {
    const beatA = { notes: [{ midiNote: 64 }] };
    const beatB = { notes: [{ midiNote: 67 }] };
    const score: AlphaTabScore = {
      tracks: [
        {
          staves: [{ bars: [{ voices: [{ beats: [beatA, beatB] }] }] }],
        },
      ],
    };
    const tickCache: ATTickCache = {
      getBeatStart: (beat) => {
        if (beat === beatA) throw new Error('boom');
        return 480;
      },
    };
    const boundsLookup: BeatBoundsLookup = {
      findBeat: (beat) => {
        if (beat === beatB) {
          return { visualBounds: { x: 9, y: 9, w: 10, h: 10 } };
        }
        return null;
      },
    };

    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(1);
    expect(result.get(500)?.x).toBe(9);
  });

  it('falls back to realBounds when visualBounds is absent', () => {
    const beat = { notes: [{ midiNote: 64 }] };
    const score: AlphaTabScore = {
      tracks: [{ staves: [{ bars: [{ voices: [{ beats: [beat] }] }] }] }],
    };
    const tickCache: ATTickCache = { getBeatStart: () => 0 };
    const boundsLookup: BeatBoundsLookup = {
      findBeat: () => ({ realBounds: { x: 7, y: 8, w: 9, h: 10 } }),
    };
    const result = buildBeatRectsByStartMs({
      score,
      tickCache,
      boundsLookup,
      midiDivision: 480,
      tempoMap: TEMPO_120_BPM,
      midiTickShift: 0,
      activeTrackIndex: 0,
    });
    expect(result.size).toBe(1);
    expect(result.get(0)?.x).toBe(7);
  });
});

describe('rawStartMsFromExpected', () => {
  it('inverts the tempoFactor scaling applied in buildExpectedNoteTimeline', () => {
    // At 0.5× speed: wallClock 2000ms = raw 1000ms → key should be 1000
    expect(rawStartMsFromExpected(2000, 0.5)).toBe(1000);
    // At 1× speed: identity
    expect(rawStartMsFromExpected(500, 1)).toBe(500);
    // At 2× speed: wallClock 250ms = raw 500ms
    expect(rawStartMsFromExpected(250, 2)).toBe(500);
  });

  it('defaults to 1× when tempoFactor is invalid', () => {
    expect(rawStartMsFromExpected(500, 0)).toBe(500);
    expect(rawStartMsFromExpected(500, -1)).toBe(500);
    expect(rawStartMsFromExpected(500, Number.NaN)).toBe(500);
  });
});
