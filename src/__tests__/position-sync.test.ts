import { describe, expect, it } from 'vitest';
import { computePositionSync } from '../services/positionSync';
import type { AlphaTabBeatInfo } from '../services/alphatabPlayer';

function makeBeatInfo(overrides: Partial<AlphaTabBeatInfo>): AlphaTabBeatInfo {
  return {
    beat: {},
    barIndex: 0,
    barStartTick: 0,
    beatIndex: 0,
    beatStartTick: 0,
    beatDurationTicks: 480,
    timeSignature: { top: 4, bottom: 4 },
    currentTick: 0,
    ...overrides,
  };
}

describe('position sync', () => {
  it('resolves beat index and time signature from beat info', () => {
    const beatInfo = makeBeatInfo({
      beatIndex: 1,
      beatStartTick: 480,
      timeSignature: { top: 3, bottom: 4 },
      currentTick: 480,
    });
    const sync = computePositionSync({
      tick: 480,
      beatInfo,
      tempo: 120,
      signature: beatInfo.timeSignature,
      division: 480,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      loopRange: null,
    });
    expect(sync.startBeatIndex).toBe(1);
    expect(sync.signature.top).toBe(3);
    expect(sync.beatStates).toHaveLength(3);
  });

  it('mutes beats outside the loop range', () => {
    const beatInfo = makeBeatInfo({
      timeSignature: { top: 4, bottom: 4 },
      barStartTick: 0,
    });
    const sync = computePositionSync({
      tick: 0,
      beatInfo,
      tempo: 120,
      signature: beatInfo.timeSignature,
      division: 480,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      loopRange: { start: 480, end: 1440 },
    });
    expect(sync.beatStates).toEqual(['mute', 'normal', 'normal', 'mute']);
  });

  it('starts from the correct beat when playhead is mid-bar', () => {
    const beatInfo = makeBeatInfo({
      timeSignature: { top: 4, bottom: 4 },
      barStartTick: 0,
      beatIndex: 1,
      beatStartTick: 480,
      currentTick: 720,
    });
    const sync = computePositionSync({
      tick: 720,
      beatInfo,
      tempo: 120,
      signature: beatInfo.timeSignature,
      division: 480,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      loopRange: null,
    });
    expect(sync.startBeatIndex).toBe(2);
    expect(Math.round(sync.startDelayMs)).toBe(250);
  });

  it('prefers tick-based beat when bar start is overridden', () => {
    const beatInfo = makeBeatInfo({
      timeSignature: { top: 4, bottom: 4 },
      barStartTick: 0,
      beatIndex: 0,
      beatStartTick: 0,
      currentTick: 0,
    });
    const sync = computePositionSync({
      tick: 1440,
      beatInfo,
      barStartTickOverride: 0,
      tempo: 120,
      signature: beatInfo.timeSignature,
      division: 480,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      loopRange: null,
    });
    expect(sync.startBeatIndex).toBe(3);
    expect(sync.startDelayMs).toBe(0);
  });

  it('skips muted beats when loop range mutes the next beat', () => {
    const beatInfo = makeBeatInfo({
      timeSignature: { top: 4, bottom: 4 },
      barStartTick: 0,
      beatIndex: 3,
      beatStartTick: 1440,
      currentTick: 1910,
    });
    const sync = computePositionSync({
      tick: 1910,
      beatInfo,
      tempo: 120,
      signature: beatInfo.timeSignature,
      division: 480,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      loopRange: { start: 960, end: 1920 },
    });
    expect(sync.beatStates).toEqual(['mute', 'mute', 'normal', 'normal']);
    expect(sync.startBeatIndex).toBe(2);
    expect(sync.startDelayMs).toBeGreaterThan(0);
  });
});
