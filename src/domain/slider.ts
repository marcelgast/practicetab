export function toSliderValues(value: number, fallback: number): number[] {
  return [Number.isFinite(value) ? value : fallback];
}

export function fromSliderValues(
  value: number[] | null | undefined,
  fallback: number,
): number {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const nextValue = value[0];
  return Number.isFinite(nextValue) ? nextValue : fallback;
}
