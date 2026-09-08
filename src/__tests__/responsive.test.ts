import { describe, expect, it } from 'vitest';
import { isSmallScreen, PLAYER_PANEL_BREAKPOINT } from '../services/responsive';

describe('responsive helpers', () => {
  it('detects small screens by threshold', () => {
    expect(isSmallScreen(PLAYER_PANEL_BREAKPOINT - 1)).toBe(true);
    expect(isSmallScreen(PLAYER_PANEL_BREAKPOINT)).toBe(false);
  });

  it('defaults to desktop when width is unavailable', () => {
    expect(isSmallScreen(undefined)).toBe(false);
  });
});
