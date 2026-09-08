import { describe, expect, it } from 'vitest';
import { findBarIndexAtPoint } from '../domain/barIndex';

describe('findBarIndexAtPoint', () => {
  it('finds the bar that contains the point', () => {
    const bounds = [
      { x: 0, y: 0, w: 50, h: 20 },
      { x: 60, y: 0, w: 50, h: 20 },
    ];
    const index = findBarIndexAtPoint(
      bounds.length,
      (idx) => bounds[idx] ?? null,
      { x: 65, y: 10 },
    );
    expect(index).toBe(1);
  });

  it('falls back to nearest bar when point is outside', () => {
    const bounds = [
      { x: 0, y: 0, w: 50, h: 20 },
      { x: 60, y: 0, w: 50, h: 20 },
    ];
    const index = findBarIndexAtPoint(
      bounds.length,
      (idx) => bounds[idx] ?? null,
      { x: 200, y: 10 },
    );
    expect(index).toBe(1);
  });
});
