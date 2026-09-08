import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCENT, normalizeHexColor } from '../domain/color';

describe('normalizeHexColor', () => {
  it('normalizes shorthand hex', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
  });

  it('accepts full hex', () => {
    expect(normalizeHexColor('#12Ef90')).toBe('#12EF90');
  });

  it('falls back on invalid values', () => {
    expect(normalizeHexColor('not-a-color')).toBe(DEFAULT_ACCENT);
  });
});
