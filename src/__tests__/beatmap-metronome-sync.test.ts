import { describe, expect, it } from 'vitest';
import { buildScheduleFromBeatmap } from '../services/beatmapMetronomeSync';
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

describe('beatmap metronome schedule', () => {
  it('creates a looped schedule with dynamic bar durations', () => {
    const schedule = buildScheduleFromBeatmap(beatmapFixture(), {
      tempoPercent: 100,
    });
    expect(schedule.events.length).toBe(18);
    expect(schedule.loopMs).toBe(12000);
    expect(schedule.events[0]).toEqual({ offsetMs: 0, kind: 'accent' });
    expect(schedule.events[4]).toEqual({ offsetMs: 2000, kind: 'accent' });
    expect(schedule.events[8]).toEqual({ offsetMs: 4000, kind: 'accent' });
  });

  it('maps seek start to first played pass for a notation bar', () => {
    const schedule = buildScheduleFromBeatmap(beatmapFixture(), {
      startNotationBar: 3,
    });
    expect(schedule.startOffsetMs).toBe(4000);
  });

  it('adds subdivision events (offsets are score-time, independent of tempo)', () => {
    const schedule = buildScheduleFromBeatmap(beatmapFixture(), {
      tempoPercent: 50,
      subdivisionsEnabled: true,
      subdivisionsValue: 2,
    });
    // loopMs is score-time (original BPM), not scaled by tempoPercent
    expect(schedule.loopMs).toBe(12000);
    expect(schedule.events.some((event) => event.kind === 'low')).toBe(true);
  });
});
