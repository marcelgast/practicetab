export interface AutoFollowInput {
  cursorX: number;
  scrollLeft: number;
  viewportWidth: number;
  marginPx: number;
}

export function computeAutoFollowScrollLeft(
  input: AutoFollowInput,
): number | null {
  const { cursorX, scrollLeft, viewportWidth, marginPx } = input;
  if (!Number.isFinite(cursorX) || viewportWidth <= 0) {
    return null;
  }
  const min = scrollLeft + marginPx;
  const max = scrollLeft + viewportWidth - marginPx;
  if (cursorX < min) {
    return Math.max(0, cursorX - marginPx);
  }
  if (cursorX > max) {
    return Math.max(0, cursorX - (viewportWidth - marginPx));
  }
  return null;
}

export interface PageFlipFollowInput {
  /** Cursor X in scroller-content coordinates (already adjusted for scrollLeft). */
  cursorX: number;
  /** Current scrollLeft of the scrolling element. */
  scrollLeft: number;
  /** Visible viewport width of the scroller. */
  viewportWidth: number;
  /** `scrollWidth - clientWidth` — the maximum valid scrollLeft. */
  maxScrollLeft: number;
  /**
   * Fraction of the viewport the cursor traverses before the page
   * flips. `0.5` (default) means: cursor walks rightward through
   * half a viewport before scrollLeft snaps forward by the same
   * amount. Larger values → fewer, bigger jumps; smaller values →
   * more frequent, smaller jumps.
   */
  pageFraction: number;
  /**
   * Where the cursor lands AFTER a flip, as a fraction of viewport
   * width from the left edge. `0` = cursor at the very left;
   * `0.1` (default) = ~10% in, leaving a strip of just-played
   * notation visible to the cursor's left as a rear-view that helps
   * orient the user after the snap. Effectively clamped against
   * `pageFraction` so the cursor's walk (`leftMargin → leftMargin +
   * pageSize`) stays within the viewport.
   */
  leftMarginFraction: number;
}

/**
 * Page-flip / step-scroll model for the one-liner horizontal layout.
 *
 * Instead of gliding the tab continuously under a fixed anchor (the
 * old "teleprompter" model), this version keeps the scroll position
 * STATIC while the cursor walks across one page-width of content,
 * then snaps `scrollLeft` forward so the cursor jumps back to the
 * `leftMargin` anchor. The reading benefit: the content is still
 * while you're reading it — your eyes don't have to track moving
 * notation, and the strip of past notation to the cursor's left
 * (the rear-view) plus the still-not-played strip to its right (the
 * lookahead) both act as stable orientation regions.
 *
 * Layout in the viewport during a single page (excluding the very
 * first one — see below):
 *
 *   ┌──────────┬──────────────────────┬──────────────────────┐
 *   │ leftMargin │       pageSize        │       lookahead      │
 *   │ (rear-view)│   (cursor walks here) │   (preview region)   │
 *   └──────────┴──────────────────────┴──────────────────────┘
 *   0          L                    L+P                viewport
 *
 * Mathematically: `pageIndex = max(0, floor((cursorX - L) / P))`,
 * `scrollLeft = pageIndex * P`. The `max(0, ...)` clamp covers the
 * very first page (cursorX < L), where there's no past notation to
 * show as rear-view; cursor enters at viewport-x = 0 and walks
 * naturally past L into the page-walk region.
 *
 * Returns `null` when the scrollLeft is already at the right page
 * boundary (no change needed). Most frames during steady playback
 * return `null` — only the actual flip frames write — which is the
 * meaningful CPU-budget saving over per-frame sub-pixel updates.
 *
 * The margin-based `computeAutoFollowScrollLeft` stays the choice
 * for multi-line page layouts where snap-flip behaviour wouldn't
 * make sense (each line auto-wraps anyway).
 */
export function computePageFlipScrollLeft(
  input: PageFlipFollowInput,
): number | null {
  const {
    cursorX,
    scrollLeft,
    viewportWidth,
    maxScrollLeft,
    pageFraction,
    leftMarginFraction,
  } = input;
  if (!Number.isFinite(cursorX) || viewportWidth <= 0) {
    return null;
  }
  const safeFraction = Number.isFinite(pageFraction)
    ? Math.max(0.05, Math.min(1, pageFraction))
    : 0.5;
  // Cap leftMargin so the walk region (margin + pageSize) fits the
  // viewport. Without this clamp the cursor would visibly leave the
  // viewport mid-walk on large margin values.
  const safeMargin = Number.isFinite(leftMarginFraction)
    ? Math.max(0, Math.min(1 - safeFraction, leftMarginFraction))
    : 0.1;
  const pageSize = viewportWidth * safeFraction;
  const leftMargin = viewportWidth * safeMargin;
  if (pageSize <= 0) {
    return null;
  }
  // Quantise to page boundaries. Subtracting `leftMargin` shifts the
  // reference frame so cursor at content-x = leftMargin lands at
  // pageIndex 0 with scrollLeft 0 — i.e. at the start of the song,
  // cursor enters at viewport-x = 0 and naturally walks past the
  // anchor into the page-walk region. `max(0, ...)` keeps that
  // first-page behaviour stable; without it cursorX < leftMargin
  // would pick a negative pageIndex and try to scroll left of the
  // tab origin.
  const pageIndex = Math.max(0, Math.floor((cursorX - leftMargin) / pageSize));
  const target = pageIndex * pageSize;
  const clamped = Math.max(0, Math.min(Math.max(0, maxScrollLeft), target));
  // Sub-pixel equivalence — most frames hit this branch and short-
  // circuit, which is exactly the perf-budget win over the old
  // teleprompter model.
  if (Math.abs(clamped - scrollLeft) < 0.5) {
    return null;
  }
  return clamped;
}

/**
 * A single beat entry used by `interpolateBeatCursorX`. Pre-sorted
 * by `rawStartMs` ascending. `x` is the content-space x of the note
 * head (i.e. `BeatRectangle.onNotesX`).
 */
export interface BeatAnchor {
  rawStartMs: number;
  x: number;
}

/**
 * Interpolate a continuous cursor X-position from `rawMs` using the
 * provided sorted beat anchors. Returns the beat's `onNotesX` when
 * `rawMs` sits exactly on a beat, linear-interpolates between
 * neighbouring beats when between, and clamps to the first/last
 * beat's x outside the range. Returns `null` when there are no
 * anchors.
 *
 * This decouples scroll position from AlphaTab's discrete cursor
 * emit cadence — a 60 Hz rAF loop can read a smoothly-changing x
 * while the playhead advances continuously. That's the whole point:
 * without interpolation, the one-liner scroll jumps once per emit
 * (~33 ms) which reads as visible stepping. With time-based
 * interpolation, the scroll advances by sub-pixel deltas every
 * frame and the tab glides smoothly under a fixed-anchor cursor.
 *
 * `anchors` MUST be sorted by `rawStartMs` ascending; callers
 * usually cache the sorted array and only re-sort when the beat-
 * rect map changes.
 */
export function interpolateBeatCursorX(
  rawMs: number,
  anchors: readonly BeatAnchor[],
): number | null {
  if (!Number.isFinite(rawMs) || anchors.length === 0) {
    return null;
  }
  if (rawMs <= anchors[0]!.rawStartMs) {
    return anchors[0]!.x;
  }
  const last = anchors[anchors.length - 1]!;
  if (rawMs >= last.rawStartMs) {
    return last.x;
  }
  // Binary search for the last anchor with rawStartMs <= rawMs.
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (anchors[mid]!.rawStartMs <= rawMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const prev = anchors[lo]!;
  const next = anchors[lo + 1] ?? prev;
  const span = next.rawStartMs - prev.rawStartMs;
  if (span <= 0) {
    return prev.x;
  }
  const t = (rawMs - prev.rawStartMs) / span;
  return prev.x + (next.x - prev.x) * t;
}

export interface AutoFollowVerticalInput {
  playheadTop: number;
  playheadBottom: number;
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  marginPx: number;
}

export function computeAutoFollowScrollTop(
  input: AutoFollowVerticalInput,
): number | null {
  const {
    playheadTop,
    playheadBottom,
    scrollTop,
    viewportHeight,
    scrollHeight,
    marginPx,
  } = input;
  if (
    !Number.isFinite(playheadTop) ||
    !Number.isFinite(playheadBottom) ||
    viewportHeight <= 0
  ) {
    return null;
  }
  const minVisible = scrollTop + marginPx;
  const maxVisible = scrollTop + viewportHeight - marginPx;
  if (playheadTop < minVisible) {
    const nextScrollTop = Math.max(0, playheadTop - marginPx);
    return Number.isFinite(nextScrollTop) && nextScrollTop !== scrollTop
      ? nextScrollTop
      : null;
  }
  if (playheadBottom <= maxVisible) {
    return null;
  }
  const viewportBottom = scrollTop + viewportHeight;
  const desiredBottom = Math.max(marginPx, viewportBottom - marginPx);
  const delta = playheadBottom - desiredBottom;
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  const nextScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop + delta));
  if (!Number.isFinite(nextScrollTop) || nextScrollTop === scrollTop) {
    return null;
  }
  return nextScrollTop;
}
