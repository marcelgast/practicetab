export type BarBounds = { x: number; y: number; w: number; h: number };

export function findBarIndexAtPoint(
  barCount: number,
  getBounds: (index: number) => BarBounds | null,
  point: { x: number; y: number },
): number | null {
  if (!Number.isFinite(barCount) || barCount <= 0) {
    return null;
  }
  let nearestIndex: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < barCount; index += 1) {
    const bounds = getBounds(index);
    if (!bounds) {
      continue;
    }
    const inside =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.w &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.h;
    if (inside) {
      return index;
    }
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;
    const dx = centerX - point.x;
    const dy = centerY - point.y;
    const dist = dx * dx + dy * dy;
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}
