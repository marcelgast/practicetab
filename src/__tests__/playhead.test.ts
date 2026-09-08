import { describe, expect, it } from 'vitest';
import {
  computePlayheadStyle,
  computePlayheadFromCursor,
  computePlayheadXFromClick,
  computePlayheadFromContentPoint,
  computeContentPoint,
  normalizeSelectionRect,
  computeFallbackPlayheadStyle,
  smoothApproach,
  smoothApproachTime,
  shouldSnapVertical,
  mapRectToCss,
  mapContainerRectToAlphaArea,
  applyClickPlayhead,
  syncRenderedFromTarget,
  isValidCursorRect,
} from '../domain/playhead';

describe('computePlayheadStyle', () => {
  it('computes playhead offsets relative to container', () => {
    const style = computePlayheadStyle(
      { left: 120, top: 80, height: 40 },
      { left: 100, top: 50, height: 200 },
    );
    expect(style).toEqual({ left: 20, top: 30, height: 40 });
  });

  it('returns null for invalid height', () => {
    const style = computePlayheadStyle(
      { left: 10, top: 10, height: 0 },
      { left: 0, top: 0, height: 100 },
    );
    expect(style).toBeNull();
  });
});

describe('computePlayheadXFromClick', () => {
  it('computes a scroll-aware playhead x position', () => {
    const x = computePlayheadXFromClick(120, 100, 40);
    expect(x).toBe(60);
  });

  it('clamps negative values to zero', () => {
    const x = computePlayheadXFromClick(10, 50, 0);
    expect(x).toBe(0);
  });
});

describe('computePlayheadFromCursor', () => {
  it('maps cursor rect into scroll-aware coordinates', () => {
    const style = computePlayheadFromCursor(
      { left: 120, top: 80, height: 40 },
      { left: 100, top: 50, height: 200 },
      20,
      10,
    );
    expect(style).toEqual({ left: 40, top: 40, height: 40 });
  });
});

describe('computePlayheadFromContentPoint', () => {
  it('maps content coordinates into a playhead style', () => {
    const style = computePlayheadFromContentPoint(120, 80, 60);
    expect(style).toEqual({ left: 120, top: 80, height: 60 });
  });
});

describe('mapContainerRectToAlphaArea', () => {
  it('converts container rects into alpha-area content coords', () => {
    const style = mapContainerRectToAlphaArea(
      { left: 40, top: 20, height: 50 },
      { left: 200, top: 100, height: 300 },
      { left: 150, top: 80, height: 400 },
      30,
      10,
    );
    expect(style).toEqual({ left: 120, top: 50, height: 50 });
  });
});

describe('computeContentPoint', () => {
  it('translates client coordinates into content space', () => {
    const point = computeContentPoint(140, 90, 100, 50, 20, 10);
    expect(point).toEqual({ x: 60, y: 50 });
  });
});

describe('normalizeSelectionRect', () => {
  it('creates a bounding rect for selection', () => {
    const rect = normalizeSelectionRect(
      { left: 120, top: 80, height: 40 },
      { left: 200, top: 150, height: 50 },
    );
    expect(rect.left).toBe(120);
    expect(rect.top).toBe(80);
    expect(rect.width).toBe(80);
    expect(rect.height).toBe(120);
  });
});

describe('computeFallbackPlayheadStyle', () => {
  it('returns a reasonable default size', () => {
    const style = computeFallbackPlayheadStyle();
    expect(style.height).toBe(120);
    expect(style.left).toBe(12);
    expect(style.top).toBe(24);
  });

  it('clamps fallback height based on container', () => {
    expect(computeFallbackPlayheadStyle(200).height).toBe(80);
    expect(computeFallbackPlayheadStyle(400).height).toBe(100);
    expect(computeFallbackPlayheadStyle(1200).height).toBe(160);
  });
});

describe('smoothApproach', () => {
  it('moves toward target by a smoothing factor', () => {
    expect(smoothApproach(0, 100, 0.2)).toBe(20);
  });
});

describe('smoothApproachTime', () => {
  it('moves toward target based on elapsed time', () => {
    const result = smoothApproachTime(0, 100, 140, 140);
    expect(result).toBeGreaterThan(40);
    expect(result).toBeLessThan(70);
  });

  it('returns current when dt is non-positive', () => {
    expect(smoothApproachTime(10, 100, 0, 140)).toBe(10);
  });
});

describe('shouldSnapVertical', () => {
  it('snaps when vertical delta exceeds threshold', () => {
    expect(shouldSnapVertical(0, 30, 20)).toBe(true);
    expect(shouldSnapVertical(0, 10, 20)).toBe(false);
  });
});

describe('mapRectToCss', () => {
  it('maps content-space rect directly', () => {
    const css = mapRectToCss(
      { left: 10, top: 20, height: 30 },
      5,
      5,
      'content',
    );
    expect(css).toEqual({ left: 10, top: 20, height: 30 });
  });

  it('maps viewport-space rect with scroll offsets', () => {
    const css = mapRectToCss(
      { left: 10, top: 20, height: 30 },
      5,
      6,
      'viewport',
    );
    expect(css).toEqual({ left: 5, top: 14, height: 30 });
  });
});

describe('applyClickPlayhead', () => {
  it('sets rendered and target to the same rect', () => {
    const rect = { left: 20, top: 10, height: 40 };
    const result = applyClickPlayhead(rect);
    expect(result.target).toEqual(rect);
    expect(result.rendered).toEqual(rect);
  });
});

describe('syncRenderedFromTarget', () => {
  it('copies target when not playing', () => {
    const target = { left: 40, top: 20, height: 50 };
    const rendered = syncRenderedFromTarget(false, null, target, 24);
    expect(rendered).toEqual(target);
  });

  it('keeps x when playing on same line', () => {
    const target = { left: 80, top: 20, height: 50 };
    const rendered = syncRenderedFromTarget(
      true,
      { left: 40, top: 20, height: 50 },
      target,
      24,
    );
    expect(rendered?.left).toBe(40);
  });

  it('snaps x on line change', () => {
    const target = { left: 80, top: 100, height: 50 };
    const rendered = syncRenderedFromTarget(
      true,
      { left: 40, top: 20, height: 50 },
      target,
      24,
    );
    expect(rendered?.left).toBe(80);
    expect(rendered?.top).toBe(100);
  });
});

describe('isValidCursorRect', () => {
  it('accepts rects with positive height', () => {
    expect(isValidCursorRect({ left: 10, top: 20, height: 40 })).toBe(true);
  });

  it('rejects invalid rects', () => {
    expect(isValidCursorRect(null)).toBe(false);
    expect(isValidCursorRect({ left: 10, top: 20, height: 0 })).toBe(false);
    expect(isValidCursorRect({ left: -1, top: 20, height: 40 })).toBe(false);
    expect(isValidCursorRect({ left: 10, top: -1, height: 40 })).toBe(false);
    expect(isValidCursorRect({ left: 0, top: 0, height: 40 })).toBe(false);
  });
});
