import { describe, expect, it } from 'vitest';
import {
  nextPendingInterval,
  parseMinutesToSeconds,
} from '../domain/intervals';
import { formatDurationMmss } from '../domain/time';

describe('interval parsing', () => {
  it('parses decimal minutes into seconds and formats mm:ss', () => {
    const seconds = parseMinutesToSeconds('2.5');
    expect(seconds).toBe(150);
    expect(formatDurationMmss(seconds ?? 0)).toBe('02:30');
  });

  it('rounds to nearest second for short intervals', () => {
    const seconds = parseMinutesToSeconds('0.1');
    expect(seconds).toBe(6);
    expect(formatDurationMmss(seconds ?? 0)).toBe('00:06');
  });

  it('selects the next pending interval', () => {
    const intervals = [
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'A',
        durationSeconds: 60,
        bpm: null,
        sortIndex: 0,
        done: true,
        createdAt: 1,
      },
      {
        id: 'int-2',
        exerciseId: 'ex-1',
        name: 'B',
        durationSeconds: 90,
        bpm: null,
        sortIndex: 1,
        done: false,
        createdAt: 2,
      },
    ];

    const next = nextPendingInterval(intervals);
    expect(next?.id).toBe('int-2');
  });
});
