/**
 * Pure canvas-draw functions for the live-feedback overlay (PR 3.6).
 *
 * Contract:
 * - No Vue, no Pinia, no DOM queries. Only calls on the provided 2D context.
 * - Same inputs → same output calls. Fully unit-testable with a recording
 *   CanvasContext mock.
 * - The caller owns `save()`/`restore()` and clearing of the canvas — the
 *   painter assumes a fresh path state.
 *
 * Coordinate system:
 * - `rect` is in container-pixel space (same coordinates AlphaTab's
 *   `boundsLookup.visualBounds` uses). The overlay `<canvas>` is sized and
 *   positioned by the component to match the container, so these coordinates
 *   map 1:1 to canvas pixels.
 *
 * Visual language (matches DEVELOPMENT_PLAN.md § PR 3.6):
 * - A solid color dot above/below the beat communicates overall correctness.
 * - A horizontal arrow next to the dot indicates timing direction + magnitude.
 * - A vertical arrow above/below the dot indicates pitch direction + magnitude.
 * - A curved glyph (⌒) shows bend result when the note had a bend target.
 */

import type { BeatRectangle } from '../../services/player/beatRectIndex';
import type {
  AccuracyRating,
  BendResult,
  NoteResult,
  StrictnessConfig,
} from '../../domain/noteComparison';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal subset of `CanvasRenderingContext2D` the painter relies on. Defined
 * structurally so unit tests can pass a recording mock without constructing
 * a real canvas.
 */
export interface OverlayPaintContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/**
 * Single source of truth for the overlay's colour palette. Kept at
 * module scope (not inside a function) so consumers — overlay component,
 * streak badge, summary dialog — can reference the same values without
 * drifting apart.
 */
export const OVERLAY_COLORS = {
  /** Both pitch and timing landed in the "perfect" band. */
  perfect: '#22c55e',
  /** At least one of pitch/timing fell short of perfect but none is wrong. */
  good: '#eab308',
  /** Any of pitch/timing/bend is outright wrong, or a wrong note was played. */
  wrong: '#ef4444',
  /** Expected note had no detected pitch at all. */
  missed: '#6b7280',
  /** Pitch detected during a rest (outcome === 'extra'). */
  extra: '#eab308',
  /**
   * Placeholder colour for beats the user hasn't reached yet. Used to
   * paint a continuous neutral strip across the line so the feedback
   * bar is visible before any note has been played.
   */
  pending: 'rgba(148, 163, 184, 0.35)',
} as const;

/**
 * Pick the dominant colour for a result. Three-band mapping:
 * - All ratings `perfect` → green
 * - Any rating `wrong` → red
 * - Anything else (mix of perfect / good / acceptable, no wrong) → yellow
 *
 * `missed` and `extra` are their own outcomes and short-circuit above.
 */
export function colorForResult(result: NoteResult): string {
  if (result.outcome === 'missed') return OVERLAY_COLORS.missed;
  if (result.outcome === 'extra') return OVERLAY_COLORS.extra;

  const ratings: AccuracyRating[] = [];
  if (result.pitchAccuracy) ratings.push(result.pitchAccuracy);
  if (result.timingAccuracy) ratings.push(result.timingAccuracy);
  if (result.bendResult) {
    // Bend has a three-level rating that maps straight onto our
    // perfect / good / wrong bands (no "acceptable" mid-step).
    const bendRating: AccuracyRating =
      result.bendResult.bendAccuracy === 'wrong'
        ? 'wrong'
        : result.bendResult.bendAccuracy === 'perfect'
          ? 'perfect'
          : 'good';
    ratings.push(bendRating);
  }

  if (ratings.length === 0) return OVERLAY_COLORS.missed;
  if (ratings.some((r) => r === 'wrong')) return OVERLAY_COLORS.wrong;
  if (ratings.every((r) => r === 'perfect')) return OVERLAY_COLORS.perfect;
  return OVERLAY_COLORS.good;
}

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

/** Height of the feedback bar's segment strip in px. */
export const SEGMENT_HEIGHT_PX = 5;
/** Gap between the top staff line (realTopY) and the bottom of the bar
 * in page (multi-line) mode. Each staff line's bar clearly belongs to
 * it, but 8 px was too tight — bumped to 16 so the strip visually
 * separates from the notation. */
export const SEGMENT_GAP_PX = 16;
/** Gap in horizontal (one-liner) mode. Bigger than page mode because
 * the one-liner layout has more vertical headroom above the staff
 * (title/tempo/bar-numbers region) and a tighter gap made the bar
 * look "inside" the score. 44 px lifts the bar clearly above the
 * staff and into the header padding without dangling near the very
 * top of the rendered area. */
export const SEGMENT_GAP_HORIZONTAL_PX = 44;

/** Vertical space between a pitch / timing arrow and the segment edge. */
const ARROW_VERTICAL_GAP_PX = 3;
const ARROW_LINE_WIDTH_PX = 2;
const ARROW_HEAD_SIZE_PX = 4;

// Arrow shaft lengths in px — three visible tiers. `perfect` stays
// invisible because the bar colour (green) already says "on the
// money"; any other rating gets a direction hint whose length scales
// with how far off the user was. Originally `good` was 0 too, which
// left yellow notes with no indication of what axis (pitch vs timing)
// slipped — Marcel's latest feedback called that out.
const ARROW_LENGTH_TINY_PX = 6;
const ARROW_LENGTH_SHORT_PX = 10;
const ARROW_LENGTH_LONG_PX = 18;
const ARROW_LENGTH_BY_RATING: Record<AccuracyRating, number> = {
  perfect: 0,
  good: ARROW_LENGTH_TINY_PX,
  acceptable: ARROW_LENGTH_SHORT_PX,
  wrong: ARROW_LENGTH_LONG_PX,
};

const BEND_GLYPH_WIDTH_PX = 20;
const BEND_GLYPH_HEIGHT_PX = 8;
const BEND_GLYPH_GAP_PX = 4;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Paint one beat's cell inside the feedback bar that runs above a
 * staff line.
 *
 * Layout (per beat):
 *
 *        ←       →         ← timing arrows above the segment
 *   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓    ← bar cell (tiled, butts up with neighbours)
 *        ↑       ↓         ← pitch arrows below the segment
 *   [   beat rect (tab)  ]
 *   ⌒⌒⌒                    ← bend glyph stays below the beat rect
 *
 * - Cells are *pre-tiled* by `groupBeatsIntoLines` (midpoints between
 *   consecutive `onNotesX` values), so consecutive calls paint a
 *   continuous bar with no visible seams. The caller does not need
 *   to compute positions — just pass the cell struct.
 * - `result` may be `null` for beats the user hasn't reached yet —
 *   those render as a neutral placeholder cell and no arrows/bend.
 * - Arrows are centred on the beat's note head (`rect.onNotesX`) so
 *   they sit directly above/below the tab number, regardless of how
 *   wide the cell itself is.
 */
export function paintNoteFeedback(
  ctx: OverlayPaintContext,
  cell: FeedbackBarCell,
  strictness: StrictnessConfig,
): void {
  const { x, y, w, h, rect, result } = cell;
  const color = result ? colorForResult(result) : OVERLAY_COLORS.pending;
  const cellBottom = y + h;
  const noteCenterX = rect.onNotesX;

  paintSegment(ctx, { x, y, w, h, color });

  if (!result) return;

  // Timing arrow (horizontal) sits ABOVE the cell, centred on the
  // note head. `left` / `right` variants share the same vertical
  // slot and horizontal centre — only the tip direction differs.
  if (result.outcome === 'hit' && result.timingOffsetMs !== null) {
    const rating = classifyByAbs(
      Math.abs(result.timingOffsetMs),
      strictness.timing,
    );
    const length = ARROW_LENGTH_BY_RATING[rating];
    if (length > 0) {
      const direction = result.timingOffsetMs >= 0 ? 'right' : 'left';
      const baseX =
        direction === 'right'
          ? noteCenterX - length / 2
          : noteCenterX + length / 2;
      paintHorizontalArrow(ctx, {
        anchorX: baseX,
        anchorY: y - ARROW_VERTICAL_GAP_PX - ARROW_HEAD_SIZE_PX,
        direction,
        length,
        color,
      });
    }
  }

  // Pitch arrow (vertical) sits BELOW the cell, centred on the note
  // head. `up` (sharp) and `down` (flat) share one slot — we flip
  // base/tip by setting the base anchor to the slot's bottom for
  // `up` and to the slot's top for `down`.
  if (result.outcome === 'hit' && result.centsOff !== null) {
    const rating = classifyByAbs(Math.abs(result.centsOff), strictness.pitch);
    const length = ARROW_LENGTH_BY_RATING[rating];
    if (length > 0) {
      const direction = result.centsOff >= 0 ? 'up' : 'down';
      const slotTop = cellBottom + ARROW_VERTICAL_GAP_PX;
      const slotBottom = slotTop + length;
      paintVerticalArrow(ctx, {
        anchorX: noteCenterX,
        anchorY: direction === 'up' ? slotBottom : slotTop,
        direction,
        length,
        color,
      });
    }
  }

  // Bend glyph stays below the beat rect so it doesn't collide with
  // the feedback bar or the arrows. Anchored on the note head.
  if (result.bendResult) {
    paintBendGlyph(ctx, {
      centerX: noteCenterX,
      topY: rect.y + rect.h + BEND_GLYPH_GAP_PX,
      bendResult: result.bendResult,
    });
  }
}

// ---------------------------------------------------------------------------
// Per-line grouping + cell tiling
// ---------------------------------------------------------------------------

/** One beat entry as fed into `groupBeatsIntoLines`. */
export interface FeedbackBarEntry {
  rect: BeatRectangle;
  result: NoteResult | null;
}

/** A tiled cell in the feedback bar — output of `groupBeatsIntoLines`. */
export interface FeedbackBarCell {
  /** Tiled cell left edge in container-px. */
  x: number;
  /** Tiled cell top (== line `barTop`). */
  y: number;
  /** Tiled cell width (butts up against the next cell's x). */
  w: number;
  /** Tiled cell height (== `SEGMENT_HEIGHT_PX`). */
  h: number;
  /** Original beat rect — needed for bend-glyph vertical placement. */
  rect: BeatRectangle;
  /** Note result, or `null` for a beat the user hasn't reached yet. */
  result: NoteResult | null;
}

/** A staff line of pre-tiled feedback-bar cells. */
export interface FeedbackBarLine {
  cells: FeedbackBarCell[];
  /** Shared y-coord of the feedback bar's top (= every cell's `y`). */
  barTop: number;
}

/**
 * Options for `groupBeatsIntoLines` that change how the feedback
 * bar is positioned vertically.
 */
export interface GroupBeatsOptions {
  /**
   * When `true`, every beat is collapsed into a single line whose
   * vertical position sits just above the topmost staff line of the
   * whole score. Derived dynamically from `min(rect.realTopY)` across
   * all beats so it works for 4-, 6-, 7-, 8-, and 9-string tabs,
   * single-staff, staff+tab, whatever — no per-instrument constants.
   * Used by the one-liner horizontal layout.
   */
  anchorAtTop?: boolean;
}

/**
 * Group a flat list of beat entries into staff lines and pre-tile
 * each line into a continuous feedback bar.
 *
 * Lines — beats are bucketed by rounded `rect.y + rect.h`: beats on
 * the same staff line share a baseline, beats on different lines
 * have clearly separated baselines. Rounding absorbs sub-pixel
 * jitter. When `anchorAtTop` is set, the buckets are merged into
 * one line whose top sits above the entire score's topmost rect.
 *
 * `barTop` per line (default) — `max(rect.y)` across the line. A
 * beat whose `visualBounds` include an annotation block above it
 * has a smaller `rect.y` (the rect extends further up); the max
 * picks a beat whose top sits at the true staff edge, so annotated
 * beats don't lift the bar upward.
 *
 * `barTop` in top-anchor mode — `min(rect.y)` across ALL beats,
 * minus gap + height. The bar sits above the topmost visible glyph
 * regardless of how many staff systems are present.
 *
 * Cell tiling — beats are sorted by `rect.onNotesX` (note-head x)
 * and neighbouring cells share a boundary at the midpoint of two
 * adjacent note heads. The first cell extends leftward by half the
 * gap to the next note; the last cell extends rightward by half
 * the gap from the previous note. The resulting strip is
 * continuous (cells butt up exactly) and every cell is centred on
 * its note head.
 *
 * Single-beat line falls back to `rect.x`..`rect.x + rect.w` so the
 * single cell still has a sensible width.
 */
export function groupBeatsIntoLines(
  entries: FeedbackBarEntry[],
  options: GroupBeatsOptions = {},
): FeedbackBarLine[] {
  const byBaseline = new Map<number, FeedbackBarEntry[]>();
  if (options.anchorAtTop) {
    // One bucket covers everything — horizontal layout collapses
    // all beats into a single continuous strip above the score.
    if (entries.length > 0) {
      byBaseline.set(0, [...entries]);
    }
  } else {
    for (const entry of entries) {
      const key = Math.round(entry.rect.y + entry.rect.h);
      let bucket = byBaseline.get(key);
      if (!bucket) {
        bucket = [];
        byBaseline.set(key, bucket);
      }
      bucket.push(entry);
    }
  }

  const lines: FeedbackBarLine[] = [];
  for (const bucket of byBaseline.values()) {
    // Sort by note-head x so midpoint tiling works.
    bucket.sort((a, b) => a.rect.onNotesX - b.rect.onNotesX);

    // Single placement strategy for both modes: use `min(rect.realTopY)`
    // across the bucket, where `realTopY` is AlphaTab's
    // `masterBarBounds.lineAlignedBounds.y` — the y of the topmost
    // staff line itself (not the tight note-head visualBounds). Works
    // for 4/6/7/8/9-string tabs, staff + tab combos, standard notation
    // — every layout puts the bar a consistent gap above the staff.
    //
    // anchorAtTop just controls the bucketing: one bucket for the
    // whole score (one-liner horizontal) vs per-staff-line buckets
    // (multi-line page layout).
    let staffReference = Infinity;
    for (const { rect } of bucket) {
      if (rect.realTopY < staffReference) staffReference = rect.realTopY;
    }
    if (!Number.isFinite(staffReference)) continue;
    const gap = options.anchorAtTop
      ? SEGMENT_GAP_HORIZONTAL_PX
      : SEGMENT_GAP_PX;
    const barTop = staffReference - gap - SEGMENT_HEIGHT_PX;

    const cells: FeedbackBarCell[] = [];
    const n = bucket.length;
    for (let i = 0; i < n; i++) {
      const here = bucket[i].rect.onNotesX;
      let left: number;
      let right: number;
      if (n === 1) {
        // Single beat — fall back to the visual bounds so the cell
        // still has a width that matches the beat rect.
        left = bucket[i].rect.x;
        right = bucket[i].rect.x + bucket[i].rect.w;
      } else if (i === 0) {
        const next = bucket[i + 1].rect.onNotesX;
        const halfGap = (next - here) / 2;
        left = here - halfGap;
        right = here + halfGap;
      } else if (i === n - 1) {
        const prev = bucket[i - 1].rect.onNotesX;
        const halfGap = (here - prev) / 2;
        left = here - halfGap;
        right = here + halfGap;
      } else {
        const prev = bucket[i - 1].rect.onNotesX;
        const next = bucket[i + 1].rect.onNotesX;
        left = (prev + here) / 2;
        right = (here + next) / 2;
      }
      cells.push({
        x: left,
        y: barTop,
        w: right - left,
        h: SEGMENT_HEIGHT_PX,
        rect: bucket[i].rect,
        result: bucket[i].result,
      });
    }

    lines.push({ cells, barTop });
  }
  // Order top-to-bottom so consumers iterating the result draw in a
  // predictable order (useful for tests).
  lines.sort((a, b) => a.barTop - b.barTop);
  return lines;
}

// ---------------------------------------------------------------------------
// Primitive drawing helpers (internal, exported for focused unit tests)
// ---------------------------------------------------------------------------

/**
 * Paint one filled cell of the feedback bar. Square corners are
 * intentional — adjacent cells butt up against each other to form a
 * single continuous bar; rounded corners would leave visible notches
 * at every cell boundary. The painter restores the fill style on
 * exit so it can be called without an explicit save/restore bracket.
 */
export interface SegmentParams {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export function paintSegment(
  ctx: OverlayPaintContext,
  params: SegmentParams,
): void {
  const { x, y, w, h, color } = params;
  if (w <= 0 || h <= 0) return;
  const prevFill = ctx.fillStyle;
  ctx.fillStyle = color;
  // Square-corner rect via primitive line ops — OverlayPaintContext
  // deliberately omits `rect`/`fillRect` so the painter stays minimal.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = prevFill;
}

interface HorizontalArrowParams {
  anchorX: number;
  anchorY: number;
  direction: 'left' | 'right';
  length: number;
  color: string;
}

export function paintHorizontalArrow(
  ctx: OverlayPaintContext,
  params: HorizontalArrowParams,
): void {
  const { anchorX, anchorY, direction, length, color } = params;
  const sign = direction === 'right' ? 1 : -1;
  // anchorX is the BASE of the shaft; tip lives `length` px further
  // along the direction. Callers add any gap from neighbouring
  // geometry themselves — keeps the primitive arithmetic obvious.
  const startX = anchorX;
  const endX = startX + sign * length;

  const prevStroke = ctx.strokeStyle;
  const prevLineWidth = ctx.lineWidth;
  const prevLineCap = ctx.lineCap;
  const prevFill = ctx.fillStyle;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = ARROW_LINE_WIDTH_PX;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(startX, anchorY);
  ctx.lineTo(endX, anchorY);
  ctx.stroke();

  // Head — solid triangle at the tip.
  ctx.beginPath();
  ctx.moveTo(endX, anchorY);
  ctx.lineTo(endX - sign * ARROW_HEAD_SIZE_PX, anchorY - ARROW_HEAD_SIZE_PX);
  ctx.lineTo(endX - sign * ARROW_HEAD_SIZE_PX, anchorY + ARROW_HEAD_SIZE_PX);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = prevStroke;
  ctx.fillStyle = prevFill;
  ctx.lineWidth = prevLineWidth;
  ctx.lineCap = prevLineCap;
}

interface VerticalArrowParams {
  anchorX: number;
  anchorY: number;
  direction: 'up' | 'down';
  length: number;
  color: string;
}

export function paintVerticalArrow(
  ctx: OverlayPaintContext,
  params: VerticalArrowParams,
): void {
  const { anchorX, anchorY, direction, length, color } = params;
  const sign = direction === 'down' ? 1 : -1;
  // anchorY is the BASE of the shaft; tip lives `length` px further
  // in the declared direction. Callers handle any gap themselves.
  const startY = anchorY;
  const endY = anchorY + sign * length;

  const prevStroke = ctx.strokeStyle;
  const prevLineWidth = ctx.lineWidth;
  const prevLineCap = ctx.lineCap;
  const prevFill = ctx.fillStyle;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = ARROW_LINE_WIDTH_PX;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(anchorX, startY);
  ctx.lineTo(anchorX, endY);
  ctx.stroke();

  // Head — solid triangle at the tip.
  ctx.beginPath();
  ctx.moveTo(anchorX, endY);
  ctx.lineTo(anchorX - ARROW_HEAD_SIZE_PX, endY - sign * ARROW_HEAD_SIZE_PX);
  ctx.lineTo(anchorX + ARROW_HEAD_SIZE_PX, endY - sign * ARROW_HEAD_SIZE_PX);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = prevStroke;
  ctx.fillStyle = prevFill;
  ctx.lineWidth = prevLineWidth;
  ctx.lineCap = prevLineCap;
}

interface BendGlyphParams {
  centerX: number;
  topY: number;
  bendResult: BendResult;
}

export function paintBendGlyph(
  ctx: OverlayPaintContext,
  params: BendGlyphParams,
): void {
  const { centerX, topY, bendResult } = params;
  // Three-band bend mapping mirrors the dot: wrong → red, good → yellow,
  // perfect → green. (Bend has no explicit "acceptable" band.)
  const color =
    bendResult.bendAccuracy === 'wrong'
      ? OVERLAY_COLORS.wrong
      : bendResult.bendAccuracy === 'good'
        ? OVERLAY_COLORS.good
        : OVERLAY_COLORS.perfect;

  const halfW = BEND_GLYPH_WIDTH_PX / 2;
  const leftX = centerX - halfW;
  const rightX = centerX + halfW;
  const peakY = topY;
  const baseY = topY + BEND_GLYPH_HEIGHT_PX;

  const prevStroke = ctx.strokeStyle;
  const prevLineWidth = ctx.lineWidth;
  const prevLineCap = ctx.lineCap;

  ctx.strokeStyle = color;
  ctx.lineWidth = ARROW_LINE_WIDTH_PX;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(leftX, baseY);
  ctx.quadraticCurveTo(centerX, peakY, rightX, baseY);
  ctx.stroke();

  ctx.strokeStyle = prevStroke;
  ctx.lineWidth = prevLineWidth;
  ctx.lineCap = prevLineCap;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

/**
 * Same shape as `classifyPitch` / `classifyTiming` but parameterised on
 * whichever band triple applies (pitch or timing). Kept local so the painter
 * stays self-contained and doesn't depend on the classification direction.
 */
function classifyByAbs(
  absValue: number,
  bands: { perfect: number; good: number; acceptable: number },
): AccuracyRating {
  if (absValue <= bands.perfect) return 'perfect';
  if (absValue <= bands.good) return 'good';
  if (absValue <= bands.acceptable) return 'acceptable';
  return 'wrong';
}
