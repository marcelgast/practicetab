import { describe, expect, it } from 'vitest';
import { selectionRectFromBeatRects } from '../domain/selection';

describe('selectionRectFromBeatRects', () => {
  it('spans both beat rectangles', () => {
    const rect = selectionRectFromBeatRects(
      { left: 20, top: 30, width: 40, height: 10 },
      { left: 70, top: 80, width: 20, height: 30 },
    );
    expect(rect.left).toBe(20);
    expect(rect.top).toBe(30);
    expect(rect.width).toBe(70);
    expect(rect.height).toBe(80);
  });
});
