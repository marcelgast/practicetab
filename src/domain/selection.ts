export function selectionRectFromBeatRects(
  start: { left: number; top: number; width: number; height: number },
  end: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  const left = Math.min(start.left, end.left);
  const right = Math.max(start.left + start.width, end.left + end.width);
  const top = Math.min(start.top, end.top);
  const bottom = Math.max(start.top + start.height, end.top + end.height);
  const width = Math.max(2, right - left);
  const height = Math.max(2, bottom - top);
  return { left, top, width, height };
}
