import type { PracticeInterval } from './practice';

export const MAX_INTERVAL_MINUTES = 240;

export function parseMinutesToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed <= 0 || parsed > MAX_INTERVAL_MINUTES) {
    return null;
  }
  return Math.round(parsed * 60);
}

export function nextPendingInterval(
  intervals: PracticeInterval[],
): PracticeInterval | null {
  return intervals.find((interval) => !interval.done) ?? null;
}
