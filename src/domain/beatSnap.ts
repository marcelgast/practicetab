export interface BeatRect {
  systemIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export function selectNearestBeat(
  rects: BeatRect[],
  point: { x: number; y: number },
): BeatRect | null {
  if (rects.length === 0) {
    return null;
  }
  let nearestSystem = rects[0].systemIndex;
  let nearestSystemDistance = Math.abs(rects[0].centerY - point.y);
  rects.forEach((rect) => {
    const distance = Math.abs(rect.centerY - point.y);
    if (distance < nearestSystemDistance) {
      nearestSystemDistance = distance;
      nearestSystem = rect.systemIndex;
    }
  });
  const systemRects = rects.filter(
    (rect) => rect.systemIndex === nearestSystem,
  );
  let best = systemRects[0];
  let bestDistance = Math.abs(best.centerX - point.x);
  systemRects.forEach((rect) => {
    const distance = Math.abs(rect.centerX - point.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = rect;
    }
  });
  return best;
}
