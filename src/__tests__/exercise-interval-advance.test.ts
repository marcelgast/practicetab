import { describe, it, expect } from 'vitest';
import {
  resolveIntervalBpm,
  resolvePlaybackMode,
} from '../services/exerciseIntervalAdvance';

describe('resolveIntervalBpm', () => {
  it('returns interval BPM when set', () => {
    expect(resolveIntervalBpm({ bpm: 120 }, 100, 80, 90)).toBe(120);
  });

  it('falls back to exercise BPM', () => {
    expect(resolveIntervalBpm({ bpm: null }, 100, 80, 90)).toBe(100);
  });

  it('falls back to song BPM', () => {
    expect(resolveIntervalBpm({ bpm: null }, null, 80, 90)).toBe(80);
  });

  it('falls back to tab base BPM', () => {
    expect(resolveIntervalBpm({ bpm: null }, null, null, 90)).toBe(90);
  });

  it('returns null when nothing available', () => {
    expect(resolveIntervalBpm(null, null, null, null)).toBeNull();
  });

  it('returns null for null interval', () => {
    expect(resolveIntervalBpm(null, null)).toBeNull();
  });

  it('skips null songBpm and tabBaseBpm', () => {
    expect(resolveIntervalBpm({ bpm: null }, null, null)).toBeNull();
  });

  it('uses interval BPM over all fallbacks', () => {
    expect(resolveIntervalBpm({ bpm: 60 }, 80, 100, 120)).toBe(60);
  });
});

describe('resolvePlaybackMode', () => {
  const base = {
    linkedTabId: null as string | null,
    linkedAudioId: null as string | null,
    preferredSource: undefined as 'tab' | 'audio' | 'both' | undefined,
  };

  it('returns "none" when no sources linked', () => {
    expect(resolvePlaybackMode(base, false, false)).toBe('none');
  });

  it('returns "tab" when only tab linked', () => {
    expect(
      resolvePlaybackMode({ ...base, linkedTabId: 'x' }, true, false),
    ).toBe('tab');
  });

  it('returns "audio" when only audio linked', () => {
    expect(
      resolvePlaybackMode({ ...base, linkedAudioId: 'x' }, false, true),
    ).toBe('audio');
  });

  it('defaults to "tab" when both linked and no preference', () => {
    expect(
      resolvePlaybackMode(
        { ...base, linkedTabId: 'x', linkedAudioId: 'y' },
        true,
        true,
      ),
    ).toBe('tab');
  });

  it('returns "audio" when preferred and both linked', () => {
    expect(
      resolvePlaybackMode(
        {
          ...base,
          linkedTabId: 'x',
          linkedAudioId: 'y',
          preferredSource: 'audio',
        },
        true,
        true,
      ),
    ).toBe('audio');
  });

  it('returns "both" when preferred and both linked', () => {
    expect(
      resolvePlaybackMode(
        {
          ...base,
          linkedTabId: 'x',
          linkedAudioId: 'y',
          preferredSource: 'both',
        },
        true,
        true,
      ),
    ).toBe('both');
  });

  it('returns "tab" when preferred is "both" but only tab linked', () => {
    expect(
      resolvePlaybackMode(
        { ...base, linkedTabId: 'x', preferredSource: 'both' },
        true,
        false,
      ),
    ).toBe('tab');
  });

  it('returns "audio" when preferred is "both" but only audio linked', () => {
    expect(
      resolvePlaybackMode(
        { ...base, linkedAudioId: 'y', preferredSource: 'both' },
        false,
        true,
      ),
    ).toBe('audio');
  });
});
