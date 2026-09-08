export interface RectLike {
  left: number;
  top: number;
  height: number;
}

export interface PlayheadStyle {
  left: number;
  top: number;
  height: number;
}

export interface PlayheadCss {
  left: number;
  top: number;
  height: number;
}

export function mapRectToCss(
  rect: PlayheadStyle,
  scrollLeft: number,
  scrollTop: number,
  mode: 'content' | 'viewport' = 'content',
): PlayheadCss {
  if (mode === 'viewport') {
    return {
      left: rect.left - scrollLeft,
      top: rect.top - scrollTop,
      height: rect.height,
    };
  }
  return {
    left: rect.left,
    top: rect.top,
    height: rect.height,
  };
}

export function computePlayheadStyle(
  cursorRect: RectLike,
  containerRect: RectLike,
): PlayheadStyle | null {
  const height = cursorRect.height;
  if (!Number.isFinite(height) || height <= 0) {
    return null;
  }
  const left = cursorRect.left - containerRect.left;
  const top = cursorRect.top - containerRect.top;
  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    height,
  };
}

export function computePlayheadFromCursor(
  cursorRect: RectLike,
  areaRect: RectLike,
  scrollLeft: number,
  scrollTop: number,
): PlayheadStyle | null {
  const height = cursorRect.height;
  if (!Number.isFinite(height) || height <= 0) {
    return null;
  }
  const left = cursorRect.left - areaRect.left + scrollLeft;
  const top = cursorRect.top - areaRect.top + scrollTop;
  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    height,
  };
}

export function isValidCursorRect(rect: RectLike | null): rect is RectLike {
  if (!rect) {
    return false;
  }
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.height) &&
    rect.height >= 40 &&
    rect.left >= 0 &&
    rect.top >= 0 &&
    (rect.left > 0 || rect.top > 0)
  );
}

export function smoothApproach(
  current: number,
  target: number,
  factor: number,
): number {
  const clamped = Math.max(0, Math.min(1, factor));
  return current + (target - current) * clamped;
}

export function smoothApproachTime(
  current: number,
  target: number,
  dtMs: number,
  halfLifeMs = 140,
): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) {
    return current;
  }
  const safeHalfLife = Math.max(40, halfLifeMs);
  const lambda = Math.log(2) / safeHalfLife;
  const alpha = 1 - Math.exp(-lambda * dtMs);
  return current + (target - current) * alpha;
}

export function shouldSnapVertical(
  currentTop: number,
  targetTop: number,
  threshold = 24,
): boolean {
  return Math.abs(targetTop - currentTop) >= threshold;
}

export function applyClickPlayhead(rect: PlayheadStyle): {
  target: PlayheadStyle;
  rendered: PlayheadStyle;
} {
  return {
    target: rect,
    rendered: rect,
  };
}

export function syncRenderedFromTarget(
  playing: boolean,
  rendered: PlayheadStyle | null,
  target: PlayheadStyle | null,
  snapThreshold = 24,
): PlayheadStyle | null {
  if (!target) {
    return null;
  }
  if (!playing || !rendered) {
    return target;
  }
  if (shouldSnapVertical(rendered.top, target.top, snapThreshold)) {
    return {
      ...rendered,
      left: target.left,
      top: target.top,
      height: target.height,
    };
  }
  return rendered;
}

export function computePlayheadFromContentPoint(
  contentX: number,
  contentY: number,
  height: number,
): PlayheadStyle {
  return {
    left: Number.isFinite(contentX) ? contentX : 0,
    top: Number.isFinite(contentY) ? contentY : 0,
    height: Number.isFinite(height) && height > 0 ? height : 120,
  };
}

export function mapContainerRectToAlphaArea(
  rect: RectLike,
  containerRect: RectLike,
  alphaRect: RectLike,
  scrollLeft: number,
  scrollTop: number,
): PlayheadStyle | null {
  if (!Number.isFinite(rect.height) || rect.height <= 0) {
    return null;
  }
  const left = rect.left + containerRect.left - alphaRect.left + scrollLeft;
  const top = rect.top + containerRect.top - alphaRect.top + scrollTop;
  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    height: rect.height,
  };
}

export function computePlayheadXFromClick(
  clientX: number,
  containerLeft: number,
  scrollLeft: number,
): number {
  const raw = clientX - containerLeft + scrollLeft;
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.round(raw));
}

export function computeContentPoint(
  clientX: number,
  clientY: number,
  containerLeft: number,
  containerTop: number,
  scrollLeft: number,
  scrollTop: number,
): { x: number; y: number } {
  const x = clientX - containerLeft + scrollLeft;
  const y = clientY - containerTop + scrollTop;
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

export function normalizeSelectionRect(
  start: PlayheadStyle,
  end: PlayheadStyle,
): { left: number; top: number; width: number; height: number } {
  const startBottom = start.top + start.height;
  const endBottom = end.top + end.height;
  const left = Math.min(start.left, end.left);
  const right = Math.max(start.left, end.left);
  const top = Math.min(start.top, end.top);
  const bottom = Math.max(startBottom, endBottom);
  const width = Math.max(2, right - left);
  const height = Math.max(20, bottom - top);
  return { left, top, width, height };
}
export function computeFallbackPlayheadStyle(
  containerHeight?: number,
  left = 12,
  top = 24,
): PlayheadStyle {
  let height = 120;
  if (Number.isFinite(containerHeight) && containerHeight) {
    height = Math.round(containerHeight * 0.25);
    height = Math.max(80, Math.min(160, height));
  }
  return {
    left: Number.isFinite(left) ? left : 0,
    top: Number.isFinite(top) ? top : 0,
    height: Number.isFinite(height) && height > 0 ? height : 120,
  };
}
