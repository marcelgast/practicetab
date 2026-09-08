export function resolveTickFromBeatAndBar(
  beatTick: number | null,
  barTick: number | null,
): number | null {
  const beat = Number.isFinite(beatTick as number)
    ? Math.max(0, Math.round(beatTick as number))
    : null;
  const bar = Number.isFinite(barTick as number)
    ? Math.max(0, Math.round(barTick as number))
    : null;
  if (beat === null && bar === null) {
    return null;
  }
  if (beat === null && bar !== null) {
    return bar;
  }
  if (beat !== null && bar === null) {
    return beat;
  }
  if (beat === 0 && bar !== null) {
    return bar;
  }
  if (beat !== null && bar !== null) {
    if (beat < bar) {
      return bar + beat;
    }
    return beat;
  }
  return null;
}
