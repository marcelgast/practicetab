import type { BeatmapScheduledEvent } from '../services/beatmapMetronomeSync';

/**
 * Snap a millisecond position to the nearest beat in a beatmap schedule.
 * Only considers 'accent' and 'normal' events (not 'low' subdivisions).
 * Returns the raw ms value if no suitable events exist.
 */
export function snapToNearestBeat(
  ms: number,
  events: BeatmapScheduledEvent[],
): number {
  const beats = events.filter(
    (e) => e.kind === 'accent' || e.kind === 'normal',
  );
  if (beats.length === 0) return ms;

  // Binary search for the insertion point
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beats[mid].offsetMs < ms) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Compare candidates: beats[lo-1] and beats[lo]
  const before = lo > 0 ? beats[lo - 1] : null;
  const after = lo < beats.length ? beats[lo] : null;

  if (before === null && after !== null) return after.offsetMs;
  if (after === null && before !== null) return before.offsetMs;
  if (before !== null && after !== null) {
    const diffBefore = ms - before.offsetMs;
    const diffAfter = after.offsetMs - ms;
    return diffBefore <= diffAfter ? before.offsetMs : after.offsetMs;
  }

  return ms;
}
