import { describe, expect, it } from 'vitest';
import { toAlphaContentPosition } from '../domain/alphaPosition';

describe('toAlphaContentPosition', () => {
  it('adds scroll offsets to click position', () => {
    const result = toAlphaContentPosition(
      { x: 120, y: 80 },
      { left: 300, top: 500 },
    );
    expect(result).toEqual({ x: 420, y: 580 });
  });
});
