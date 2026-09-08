import { describe, expect, it } from 'vitest';
import {
  calcElapsedSec,
  formatDuration,
  formatDurationHms,
} from '../domain/time';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('formats hours when needed', () => {
    expect(formatDuration(3605)).toBe('1:00:05');
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });
});

describe('formatDurationHms', () => {
  it('formats with leading zeros', () => {
    expect(formatDurationHms(5)).toBe('00:00:05');
    expect(formatDurationHms(65)).toBe('00:01:05');
    expect(formatDurationHms(3661)).toBe('01:01:01');
  });
});

describe('calcElapsedSec', () => {
  it('returns zero for invalid start time', () => {
    expect(calcElapsedSec('invalid', 1000)).toBe(0);
  });

  it('computes elapsed seconds', () => {
    const startedAt = '2025-01-01T10:00:00.000Z';
    const nowMs = Date.parse('2025-01-01T10:00:05.500Z');
    expect(calcElapsedSec(startedAt, nowMs)).toBe(5);
  });
});
