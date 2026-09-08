import { describe, expect, it } from 'vitest';
import { selectNearestBeat } from '../domain/beatSnap';

describe('selectNearestBeat', () => {
  it('picks nearest beat within the closest system', () => {
    const rects = [
      {
        systemIndex: 0,
        left: 40,
        top: 20,
        width: 10,
        height: 30,
        centerX: 45,
        centerY: 35,
      },
      {
        systemIndex: 1,
        left: 80,
        top: 140,
        width: 10,
        height: 30,
        centerX: 85,
        centerY: 155,
      },
      {
        systemIndex: 1,
        left: 140,
        top: 140,
        width: 10,
        height: 30,
        centerX: 145,
        centerY: 155,
      },
    ];
    const nearest = selectNearestBeat(rects, { x: 130, y: 150 });
    expect(nearest?.left).toBe(140);
    expect(nearest?.systemIndex).toBe(1);
  });
});
