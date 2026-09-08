// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createIntervalRunner } from '../services/intervalRunner';
import type { PracticeInterval } from '../domain/practice';

describe('interval runner', () => {
  it('ticks through intervals and signals completion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    const intervals: PracticeInterval[] = [
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'A',
        durationSeconds: 1,
        bpm: null,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
      {
        id: 'int-2',
        exerciseId: 'ex-1',
        name: 'B',
        durationSeconds: 1,
        bpm: null,
        sortIndex: 1,
        done: false,
        createdAt: 2,
      },
    ];

    const intervalEnds: number[] = [];
    const done = vi.fn();
    const runner = createIntervalRunner(
      intervals,
      () => {},
      (index) => intervalEnds.push(index),
      done,
      320,
    );

    runner.start();
    vi.advanceTimersByTime(1100);
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(1100);

    expect(intervalEnds).toEqual([0, 1]);
    expect(done).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
