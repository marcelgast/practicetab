import { describe, expect, it } from 'vitest';
import {
  nowIso,
  toLocalDateKey,
  toLocalDateKeyFromIso,
  todayKey,
} from '../utils/date';

describe('nowIso', () => {
  it('returns a valid ISO 8601 string', () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  it('uses custom clock when provided', () => {
    const iso = nowIso(() => '2025-06-15T12:00:00.000Z');
    expect(iso).toBe('2025-06-15T12:00:00.000Z');
  });
});

describe('toLocalDateKey', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    const date = new Date(2025, 0, 5); // Jan 5, 2025
    expect(toLocalDateKey(date)).toBe('2025-01-05');
  });

  it('pads single-digit month and day', () => {
    const date = new Date(2025, 2, 3); // Mar 3, 2025
    expect(toLocalDateKey(date)).toBe('2025-03-03');
  });

  it('handles December correctly', () => {
    const date = new Date(2025, 11, 31); // Dec 31, 2025
    expect(toLocalDateKey(date)).toBe('2025-12-31');
  });
});

describe('toLocalDateKeyFromIso', () => {
  it('converts ISO string to local date key', () => {
    // Use a midday time to avoid timezone edge cases
    const key = toLocalDateKeyFromIso('2025-06-15T12:00:00.000Z');
    // Result depends on local timezone, but format should be correct
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('todayKey', () => {
  it('returns today as YYYY-MM-DD', () => {
    const key = todayKey();
    const expected = toLocalDateKey(new Date());
    expect(key).toBe(expected);
  });
});
