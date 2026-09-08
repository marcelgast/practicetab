import { describe, expect, it } from 'vitest';
import { resolveTickFromBeatAndBar } from '../domain/seekTick';

describe('resolveTickFromBeatAndBar', () => {
  it('returns bar tick when beat tick is zero', () => {
    expect(resolveTickFromBeatAndBar(0, 26880)).toBe(26880);
  });

  it('treats beat ticks as relative when less than bar tick', () => {
    expect(resolveTickFromBeatAndBar(1200, 26880)).toBe(28080);
  });

  it('uses beat tick when already absolute', () => {
    expect(resolveTickFromBeatAndBar(37440, 34560)).toBe(37440);
  });

  it('falls back when only one source is present', () => {
    expect(resolveTickFromBeatAndBar(null, 480)).toBe(480);
    expect(resolveTickFromBeatAndBar(960, null)).toBe(960);
  });
});
