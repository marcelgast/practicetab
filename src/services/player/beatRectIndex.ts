/**
 * Build a `startMs → BeatRectangle` index of all renderable beats for the
 * live-feedback overlay (PR 3.6+).
 *
 * The map is keyed by the **raw 1×-speed startMs** of each beat so the cache
 * is invariant across speed-trainer `tempoFactor` changes — the overlay
 * converts at lookup time via `expectedNote.startMs * timeline.tempoFactor`.
 *
 * Chord handling: if multiple beats share the same `startMs` (e.g. across
 * staves/voices or simultaneous strikes), the first encountered rect wins.
 * That matches the NoteComparisonEngine's v1 chord handling (one result per
 * chord).
 *
 * Pure: no I/O, no Vue reactivity, no DOM constructors (stays usable in a
 * plain node test env). Container-relative coordinates come directly from
 * AlphaTab's `boundsLookup.findBeat(beat).visualBounds` which is already in
 * render-target (container) coordinates.
 */

import type { AlphaTabScore, AlphaTabTrack, TempoPoint } from './types';
import { tickToMs } from './tempoMap';
import { safeArray, safeTrackStaves } from './utils';
import type { ATBar, ATBeat, ATTickCache, ATVoice } from './alphaTabTypes';
import { appendDevLog } from '../devLog';

/**
 * Subset of AlphaTab's `BoundsLookup.findBeat` we rely on. Kept structural
 * so tests can mock it without pulling in the full AlphaTab type graph.
 *
 * `onNotesX` is AlphaTab's "x-position where the timely center of the
 * notes for this beat is" — i.e. the exact x of the note-head / tab
 * number. Using this for cell tiling keeps the feedback bar's cells
 * centred on the notes themselves rather than on the beat's full
 * visual box (which can include leading whitespace, bar numbers, etc.).
 */
/**
 * AlphaTab's `MasterBarBounds.lineAlignedBounds` are "exactly aligned
 * with the lines of the staffs" (AlphaTab docs) — that's the y we
 * want the feedback bar to pin to. Exposing it via two resolution
 * paths:
 * 1. Walk up from `BeatBounds.barBounds.masterBarBounds` (same object
 *    the find-beat call returns — cheapest when it's populated).
 * 2. Call `findMasterBar(masterBar)` directly using the ATBeat's
 *    `voice.bar.masterBar` back-reference (reliable fallback when
 *    the boundsLookup doesn't expose the parent chain on the beat).
 */
interface MasterBarBoundsShape {
  lineAlignedBounds?: { x: number; y: number; w: number; h: number };
  visualBounds?: { x: number; y: number; w: number; h: number };
  realBounds?: { x: number; y: number; w: number; h: number };
}

export interface BeatBoundsLookup {
  findBeat?: (beat: unknown) => {
    visualBounds?: { x: number; y: number; w: number; h: number };
    realBounds?: { x: number; y: number; w: number; h: number };
    onNotesX?: number;
    barBounds?: {
      masterBarBounds?: MasterBarBoundsShape;
    };
  } | null;
  findMasterBar?: (masterBar: unknown) => MasterBarBoundsShape | null;
}

/**
 * Plain-object rectangle type used as the value in `beatRectsByStartMs`.
 * Mirrors AlphaTab's own `{ x, y, w, h }` shape and is test-env-agnostic
 * (no DOM constructors required). `onNotesX` is the x-coord of the
 * beat's note head — used for tiling feedback-bar cells at midpoints
 * between notes.
 *
 * `realTopY` is the top of the **real** bounds (the full beat cell
 * including the whole staff column), as opposed to `y` which is the
 * top of the **visual** bounds (tight box around the note head /
 * ornaments). The two agree for simple staves but diverge on taller
 * rendering like a 6/7/8-string tab where visualBounds.y sits in the
 * middle of the tab while realBounds.y sits above the topmost
 * staff line. The feedback-bar painter uses `realTopY` when pinning
 * the bar above the score in horizontal layout.
 */
export interface BeatRectangle {
  x: number;
  y: number;
  w: number;
  h: number;
  onNotesX: number;
  realTopY: number;
}

export interface BuildBeatRectsByStartMsParams {
  score: AlphaTabScore | null;
  tickCache: ATTickCache | null;
  boundsLookup: BeatBoundsLookup | null;
  midiDivision: number;
  tempoMap: TempoPoint[];
  midiTickShift: number;
  /**
   * If provided, only beats of this track are indexed. Matches the overlay's
   * behaviour (only the active track's expected notes are compared). When
   * `null`, all tracks are indexed (useful in tests).
   */
  activeTrackIndex: number | null;
}

/**
 * Build a `rawStartMs → DOMRect` map of all beat visual bounds for the
 * given score. Returns an empty map when required inputs are missing
 * (no score, no tickCache, no boundsLookup) — callers should treat this as
 * "cache not yet populated" rather than an error.
 */
export function buildBeatRectsByStartMs(
  params: BuildBeatRectsByStartMsParams,
): Map<number, BeatRectangle> {
  const {
    score,
    tickCache,
    boundsLookup,
    midiDivision,
    tempoMap,
    midiTickShift,
    activeTrackIndex,
  } = params;

  const result = new Map<number, BeatRectangle>();
  if (!score) return result;
  if (!tickCache?.getBeatStart) return result;
  if (!boundsLookup?.findBeat) return result;
  if (!Number.isFinite(midiDivision) || midiDivision <= 0) return result;

  const tracks = safeArray<AlphaTabTrack>(() => score.tracks);
  // Match either the array position OR the AlphaTab `track.index` — other
  // player code (e.g. track visibility, expected-note timeline keyed by
  // `track-${track.index}`) uses the AlphaTab index, so scoping by array
  // position only would put the overlay on the wrong staff for scores
  // where the two diverge.
  const scopedTracks =
    activeTrackIndex !== null && activeTrackIndex >= 0
      ? tracks.filter((track, idx) => {
          const trackIdx = (track as { index?: unknown }).index;
          return (
            idx === activeTrackIndex ||
            (typeof trackIdx === 'number' && trackIdx === activeTrackIndex)
          );
        })
      : tracks;

  // Cache masterBarBounds lookups so we call `findMasterBar` once per
  // bar instead of once per beat. WeakMap keys by masterBar instance.
  const masterBarCache = new WeakMap<object, MasterBarBoundsShape | null>();
  const diagSlot: { emitted: boolean } = { emitted: false };
  const iterStats: IterStats = {
    total: 0,
    rests: 0,
    tickMissing: 0,
    boundsMissing: 0,
    dupeKey: 0,
  };

  for (const track of scopedTracks) {
    const staves = safeTrackStaves(track);
    for (const staff of staves) {
      const bars = safeArray<ATBar>(() => staff?.bars);
      for (const bar of bars) {
        const voices = safeArray<ATVoice>(() => bar?.voices);
        for (const voice of voices) {
          const beats = safeArray<ATBeat>(() => voice?.beats);
          for (const beat of beats) {
            indexBeat({
              beat,
              tickCache,
              boundsLookup,
              midiDivision,
              tempoMap,
              midiTickShift,
              result,
              masterBarCache,
              diagSlot,
              iterStats,
            });
          }
        }
      }
    }
  }

  // One-shot coverage log — how many beats we iterated vs how many
  // ended up in the cache, and where the drops happened. Makes it
  // easy to tell whether "feedback bar doesn't reach the last note"
  // is a missing-cache-entries issue (beats rejected here) or a
  // paint-side issue (beats present, painter clips).
  logCoverage(iterStats, result.size);

  return result;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

interface IterStats {
  total: number;
  rests: number;
  tickMissing: number;
  boundsMissing: number;
  dupeKey: number;
}

interface IndexBeatParams {
  beat: ATBeat | undefined;
  tickCache: ATTickCache;
  boundsLookup: BeatBoundsLookup;
  midiDivision: number;
  tempoMap: TempoPoint[];
  midiTickShift: number;
  result: Map<number, BeatRectangle>;
  masterBarCache: WeakMap<object, MasterBarBoundsShape | null>;
  diagSlot: { emitted: boolean };
  iterStats: IterStats;
}

function indexBeat(params: IndexBeatParams): void {
  const {
    beat,
    tickCache,
    boundsLookup,
    midiDivision,
    tempoMap,
    midiTickShift,
    result,
    masterBarCache,
    diagSlot,
    iterStats,
  } = params;

  iterStats.total += 1;
  if (!beat) return;
  if (beat.isRest === true) {
    iterStats.rests += 1;
    return;
  }
  if (!tickCache.getBeatStart || !boundsLookup.findBeat) return;

  // NOTE: call methods directly on the host objects — extracting them into
  // locals loses the `this` binding AlphaTab's internals rely on (its
  // `MidiTickLookup.getBeatStart` reads `this.masterBarLookup`).
  let rawTick: number;
  try {
    rawTick = tickCache.getBeatStart(beat);
  } catch {
    iterStats.tickMissing += 1;
    return;
  }
  if (typeof rawTick !== 'number' || !Number.isFinite(rawTick)) {
    iterStats.tickMissing += 1;
    return;
  }

  const shiftedTick = rawTick - midiTickShift;
  if (shiftedTick < 0) {
    iterStats.tickMissing += 1;
    return;
  }

  const rawStartMs = tickToMs(shiftedTick, midiDivision, tempoMap);
  const keyMs = Math.round(rawStartMs);

  // Chord / duplicate guard: first rect wins (see module header).
  if (result.has(keyMs)) {
    iterStats.dupeKey += 1;
    return;
  }

  let bounds: ReturnType<NonNullable<BeatBoundsLookup['findBeat']>>;
  try {
    bounds = boundsLookup.findBeat(beat);
  } catch {
    iterStats.boundsMissing += 1;
    return;
  }
  if (!bounds) {
    iterStats.boundsMissing += 1;
    return;
  }
  const vb = bounds.visualBounds ?? bounds.realBounds;
  if (!vb) {
    iterStats.boundsMissing += 1;
    return;
  }
  if (!Number.isFinite(vb.x) || !Number.isFinite(vb.y)) {
    iterStats.boundsMissing += 1;
    return;
  }
  if (!Number.isFinite(vb.w) || !Number.isFinite(vb.h)) {
    iterStats.boundsMissing += 1;
    return;
  }
  if (vb.w <= 0 || vb.h <= 0) {
    iterStats.boundsMissing += 1;
    return;
  }

  // Prefer AlphaTab's `onNotesX` (the exact x of the note's timely
  // centre — i.e. where the playhead cursor sits while this beat is
  // played). Fall back to the visual-bounds midpoint when the lookup
  // didn't expose it, so older mocks and edge cases still work.
  const rawOnNotesX = bounds.onNotesX;
  const onNotesX =
    typeof rawOnNotesX === 'number' && Number.isFinite(rawOnNotesX)
      ? rawOnNotesX
      : vb.x + vb.w / 2;

  // `lineAlignedBounds` on the parent master-bar bounds is "exactly
  // aligned with the lines of the staffs" (AlphaTab docs) — its `.y`
  // is the top of the topmost staff line. That's what the feedback
  // bar pins to so the strip lands directly above the staff top line.
  //
  // We resolve the master-bar bounds via two paths:
  //   1. Walk up via the bounds chain returned by `findBeat`.
  //   2. Call `findMasterBar(beat.voice.bar.masterBar)` directly —
  //      some boundsLookup implementations don't populate the chain
  //      on individual BeatBounds but the master-bar lookup works.
  const chainMaster = bounds.barBounds?.masterBarBounds ?? null;
  const fallbackMaster = resolveMasterBarBounds(
    beat,
    boundsLookup,
    masterBarCache,
  );
  const master = chainMaster ?? fallbackMaster;
  const lineAligned = master?.lineAlignedBounds ?? null;
  // Pin exclusively to `lineAlignedBounds.y` — AlphaTab's
  // documented "exactly aligned with the lines of the staffs", i.e.
  // the y of the topmost staff line. Falling back to wider candidates
  // pushed the bar far above the staff into the system's empty
  // padding region (masterBar.realBounds sits above whitespace /
  // annotations), which is why the previous pass rendered the bar
  // floating in the void above the score.
  //
  // If lineAligned isn't populated for a given renderer, fall back
  // to visualBounds.y — tight to the beat content. That's not the
  // ideal staff-top anchor (for tabs it's mid-staff on middle-string
  // beats) but it's NEVER absurdly high, so the degraded fallback
  // is bounded.
  let realY = vb.y;
  let realYSource: 'lineAligned' | 'masterReal' | 'beatReal' | 'visual' =
    'visual';
  if (lineAligned && Number.isFinite(lineAligned.y)) {
    realY = lineAligned.y;
    realYSource = 'lineAligned';
  }

  // One-shot diagnostic (first beat only). Tells us at runtime which
  // resolution path is actually firing so "bar too low/high" reports
  // can be triaged without guessing.
  if (!diagSlot.emitted) {
    diagSlot.emitted = true;
    logBeatRectDiagnostic({
      vb,
      realY,
      realYSource,
      chainMasterPresent: Boolean(chainMaster),
      fallbackMasterPresent: Boolean(fallbackMaster),
      lineAlignedY: lineAligned?.y,
      masterRealY: master?.realBounds?.y,
      beatRealY: bounds.realBounds?.y,
    });
  }

  result.set(keyMs, {
    x: vb.x,
    y: vb.y,
    w: vb.w,
    h: vb.h,
    onNotesX,
    realTopY: realY,
  });
}

function resolveMasterBarBounds(
  beat: ATBeat,
  boundsLookup: BeatBoundsLookup,
  cache: WeakMap<object, MasterBarBoundsShape | null>,
): MasterBarBoundsShape | null {
  if (!boundsLookup.findMasterBar) return null;
  const masterBar = beat.voice?.bar?.masterBar;
  if (!masterBar || typeof masterBar !== 'object') return null;
  const cached = cache.get(masterBar);
  if (cached !== undefined) return cached;
  let resolved: MasterBarBoundsShape | null = null;
  try {
    resolved = boundsLookup.findMasterBar(masterBar) ?? null;
  } catch {
    resolved = null;
  }
  cache.set(masterBar, resolved);
  return resolved;
}

interface BeatRectDiagnostic {
  vb: { x: number; y: number; w: number; h: number };
  realY: number;
  realYSource: 'lineAligned' | 'masterReal' | 'beatReal' | 'visual';
  chainMasterPresent: boolean;
  fallbackMasterPresent: boolean;
  lineAlignedY: number | undefined;
  masterRealY: number | undefined;
  beatRealY: number | undefined;
}

function logCoverage(stats: IterStats, cacheSize: number): void {
  // Emit once per build. Counts how many beats made it into the
  // cache vs how many were dropped at each gate. `boundsMissing`
  // is the canary for "feedback bar doesn't reach the last note" —
  // it means AlphaTab's boundsLookup returned no rect for a beat
  // (typically the tail of the score when the render hadn't fully
  // settled).
  appendDevLog(
    JSON.stringify({
      source: 'src/services/player/beatRectIndex.ts',
      fn: 'buildBeatRectsByStartMs',
      tag: 'beat_rect_coverage',
      iterated: stats.total,
      kept: cacheSize,
      rests: stats.rests,
      tickMissing: stats.tickMissing,
      boundsMissing: stats.boundsMissing,
      dupeKey: stats.dupeKey,
      ts: Date.now(),
    }),
  );
}

function logBeatRectDiagnostic(diag: BeatRectDiagnostic): void {
  appendDevLog(
    JSON.stringify({
      source: 'src/services/player/beatRectIndex.ts',
      fn: 'indexBeat',
      tag: 'beat_rect_diag',
      vb: diag.vb,
      realY: diag.realY,
      realYSource: diag.realYSource,
      chainMasterPresent: diag.chainMasterPresent,
      fallbackMasterPresent: diag.fallbackMasterPresent,
      lineAlignedY: diag.lineAlignedY,
      masterRealY: diag.masterRealY,
      beatRealY: diag.beatRealY,
      ts: Date.now(),
    }),
  );
}

/**
 * Convert an `ExpectedNote.startMs` (wall-clock, tempoFactor-scaled) back to
 * the raw 1× `startMs` used as the `beatRectsByStartMs` key.
 */
export function rawStartMsFromExpected(
  expectedStartMs: number,
  tempoFactor: number,
): number {
  const factor =
    Number.isFinite(tempoFactor) && tempoFactor > 0 ? tempoFactor : 1;
  return Math.round(expectedStartMs * factor);
}
