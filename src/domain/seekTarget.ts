export type SeekRect = {
  left: number;
  top: number;
  height: number;
  cursorTick?: number;
  cursorMs?: number;
};

export function resolveSeekTarget(
  awaited: SeekRect | null,
  hit: SeekRect | null,
): { rect: SeekRect | null; cursorTick?: number; cursorMs?: number } {
  const rect = awaited ?? hit ?? null;
  const cursorTick =
    typeof hit?.cursorTick === 'number' ? hit.cursorTick : awaited?.cursorTick;
  const cursorMs =
    typeof hit?.cursorMs === 'number' ? hit.cursorMs : awaited?.cursorMs;
  return { rect, cursorTick, cursorMs };
}

export function normalizeSeekTarget(
  target: { cursorTick?: number; cursorMs?: number },
  options?: { ignoreZeroTick?: boolean },
): { cursorTick?: number; cursorMs?: number } {
  if (options?.ignoreZeroTick && target.cursorTick === 0) {
    return { ...target, cursorTick: undefined };
  }
  return target;
}

export function selectFallbackTick(params: {
  beatTick?: number | null;
  barTick?: number | null;
  barIndex?: number | null;
  currentTick?: number | null;
  recentPointerTick?: number | null;
}): number | null {
  const beatTick = typeof params.beatTick === 'number' ? params.beatTick : null;
  const barIndex = typeof params.barIndex === 'number' ? params.barIndex : null;
  const barTick = typeof params.barTick === 'number' ? params.barTick : null;
  const currentTick =
    typeof params.currentTick === 'number' ? params.currentTick : null;
  const recentPointerTick =
    typeof params.recentPointerTick === 'number'
      ? params.recentPointerTick
      : null;

  const hasBeatTick = typeof beatTick === 'number';
  const useBeatTick = hasBeatTick && beatTick > 0;
  if (useBeatTick) {
    if (
      typeof barIndex === 'number' &&
      barIndex > 0 &&
      typeof currentTick === 'number' &&
      currentTick > 0 &&
      beatTick < currentTick
    ) {
      return currentTick;
    }
    return beatTick;
  }
  if (
    typeof barIndex === 'number' &&
    barIndex > 0 &&
    typeof barTick === 'number' &&
    barTick > 0
  ) {
    return barTick;
  }
  if (typeof barTick === 'number' && barTick > 0) {
    return barTick;
  }
  if (typeof recentPointerTick === 'number' && recentPointerTick > 0) {
    return recentPointerTick;
  }
  if (typeof currentTick === 'number' && currentTick > 0) {
    return currentTick;
  }
  return null;
}

export function resolveSeekCommand(target: {
  cursorTick?: number;
  cursorMs?: number;
}): { mode: 'tick' | 'ms'; value: number } | null {
  if (typeof target.cursorTick === 'number') {
    return { mode: 'tick', value: target.cursorTick };
  }
  if (typeof target.cursorMs === 'number') {
    return { mode: 'ms', value: target.cursorMs };
  }
  return null;
}

export function resolveSeekCommandWithFallback(
  target: { cursorTick?: number; cursorMs?: number },
  fallbackTick: number | null,
): { mode: 'tick' | 'ms'; value: number } | null {
  const direct = resolveSeekCommand(target);
  if (direct) {
    return direct;
  }
  if (typeof fallbackTick === 'number' && fallbackTick > 0) {
    return { mode: 'tick', value: fallbackTick };
  }
  return null;
}

export function selectSeekTick(params: {
  cursorTick?: number;
  resolvedTick?: number | null;
  fallbackTick?: number | null;
}): number | null {
  const cursorTick =
    typeof params.cursorTick === 'number' ? params.cursorTick : null;
  const resolvedTick =
    typeof params.resolvedTick === 'number' ? params.resolvedTick : null;
  const fallbackTick =
    typeof params.fallbackTick === 'number' ? params.fallbackTick : null;
  if (cursorTick !== null) {
    return cursorTick;
  }
  if (resolvedTick !== null) {
    return resolvedTick;
  }
  if (fallbackTick !== null) {
    return fallbackTick;
  }
  return null;
}
