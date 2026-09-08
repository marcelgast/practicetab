import { describe, expect, it } from 'vitest';
import { resolveMetronomeSyncFromBeatmap } from '../services/metronomeSyncResolver';
import type { GpBeatmap } from '../services/gpBeatmapBuilder';

function beatmapFixture(): GpBeatmap {
  return {
    startBpm: 120,
    startTimeSigTop: 4,
    startTimeSigBottom: 4,
    endBar: 3,
    timeEvents: [
      { barIndex: 1, bpm: 120, timeSigTop: 4, timeSigBottom: 4 },
      { barIndex: 3, bpm: 60, timeSigTop: 3, timeSigBottom: 4 },
    ],
    loopEvents: [{ startBar: 2, endBar: 3, repeatCount: 1 }],
    playedBars: [
      {
        playedBarIndex: 1,
        notationBarIndex: 1,
        repeatPass: 0,
        playedBarLabel: '1',
        bpm: 120,
        timeSigTop: 4,
        timeSigBottom: 4,
      },
      {
        playedBarIndex: 2,
        notationBarIndex: 2,
        repeatPass: 0,
        playedBarLabel: '2',
        bpm: 120,
        timeSigTop: 4,
        timeSigBottom: 4,
      },
      {
        playedBarIndex: 3,
        notationBarIndex: 3,
        repeatPass: 0,
        playedBarLabel: '3',
        bpm: 60,
        timeSigTop: 3,
        timeSigBottom: 4,
      },
      {
        playedBarIndex: 4,
        notationBarIndex: 2,
        repeatPass: 1,
        playedBarLabel: '2.1',
        bpm: 120,
        timeSigTop: 4,
        timeSigBottom: 4,
      },
      {
        playedBarIndex: 5,
        notationBarIndex: 3,
        repeatPass: 1,
        playedBarLabel: '3.1',
        bpm: 60,
        timeSigTop: 3,
        timeSigBottom: 4,
      },
    ],
  };
}

describe('metronomeSyncResolver', () => {
  it('resolves schedule offset from current tick instead of notation bar', () => {
    const result = resolveMetronomeSyncFromBeatmap({
      beatmap: beatmapFixture(),
      tempoPercent: 100,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      currentTick: 4500,
      tickToMs: (tick) => tick,
      reason: 'seek',
    });

    expect(result).not.toBeNull();
    expect(result?.scheduleLoopMs).toBe(12000);
    expect(result?.scheduleStartOffsetMs).toBe(4500);
    expect(result?.bpm).toBe(60);
    expect(result?.timeSigTop).toBe(3);
    expect(result?.timeSigBottom).toBe(4);
  });

  it('wraps offset by loop duration and resolves row state from wrapped position', () => {
    const result = resolveMetronomeSyncFromBeatmap({
      beatmap: beatmapFixture(),
      tempoPercent: 100,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      currentTick: 13000,
      tickToMs: (tick) => tick,
      reason: 'play',
    });

    expect(result).not.toBeNull();
    expect(result?.scheduleStartOffsetMs).toBe(1000);
    expect(result?.bpm).toBe(120);
    expect(result?.timeSigTop).toBe(4);
  });

  it('falls back to synthetic start row when played bars are missing', () => {
    const empty: GpBeatmap = {
      startBpm: 120,
      startTimeSigTop: 4,
      startTimeSigBottom: 4,
      endBar: 0,
      timeEvents: [],
      loopEvents: [],
      playedBars: [],
    };
    const result = resolveMetronomeSyncFromBeatmap({
      beatmap: empty,
      tempoPercent: 100,
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      currentTick: 0,
      tickToMs: () => 0,
      reason: 'play',
    });
    expect(result).not.toBeNull();
    expect(result?.scheduleLoopMs).toBeGreaterThan(0);
  });
});
