import { describe, expect, it } from 'vitest';
import { computeBpmFromTaps, useTapTempo } from '../composables/useTapTempo';

describe('tap tempo', () => {
  it('does not compute bpm before minimum taps', () => {
    let now = 0;
    const tempo = useTapTempo({
      now: () => now,
    });
    now = 0;
    expect(tempo.tap()).toBeNull();
    now = 500;
    expect(tempo.tap()).toBeNull();
    now = 1000;
    expect(tempo.tap()).toBeNull();
  });

  it('computes bpm from four taps at 500ms intervals', () => {
    let now = 0;
    const tempo = useTapTempo({
      now: () => now,
    });
    now = 0;
    tempo.tap();
    now = 500;
    tempo.tap();
    now = 1000;
    tempo.tap();
    now = 1500;
    expect(tempo.tap()).toBe(120);
  });

  it('resets after long pause', () => {
    let now = 0;
    const tempo = useTapTempo({
      now: () => now,
      resetMs: 2000,
    });
    now = 0;
    tempo.tap();
    now = 500;
    tempo.tap();
    now = 3000;
    tempo.tap();
    expect(tempo.tapCount.value).toBe(1);
  });

  it('ignores outlier intervals outside bpm range', () => {
    const taps = [0, 500, 1000, 1100, 1500];
    const bpm = computeBpmFromTaps(taps, 30, 240);
    expect(bpm).toBe(120);
  });
});
