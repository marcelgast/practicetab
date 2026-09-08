import { describe, expect, it } from 'vitest';
import { buildMetronomeSchedule } from '../services/metronomeSchedule';

const tickToMs = (tick: number) => tick;

describe('buildMetronomeSchedule', () => {
  it('builds events across bars with time signature changes', () => {
    const schedule = buildMetronomeSchedule({
      loopRange: { start: 960, end: 2880 },
      bars: [
        {
          startTick: 0,
          endTick: 1920,
          timeSigTop: 4,
          timeSigBottom: 4,
          beatTicks: 480,
        },
        {
          startTick: 1920,
          endTick: 3360,
          timeSigTop: 3,
          timeSigBottom: 4,
          beatTicks: 480,
        },
      ],
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      tickToMs,
      currentTick: 1440,
    });

    expect(schedule).not.toBeNull();
    expect(schedule?.loopMs).toBe(1920);
    expect(schedule?.events.map((event) => event.offsetMs)).toEqual([
      0, 480, 960, 1440,
    ]);
    expect(schedule?.events.map((event) => event.kind)).toEqual([
      'normal',
      'normal',
      'accent',
      'normal',
    ]);
    expect(schedule?.startOffsetMs).toBe(480);
  });

  it('includes subdivision events when enabled', () => {
    const schedule = buildMetronomeSchedule({
      loopRange: { start: 0, end: 960 },
      bars: [
        {
          startTick: 0,
          endTick: 1920,
          timeSigTop: 4,
          timeSigBottom: 4,
          beatTicks: 480,
        },
      ],
      subdivisionsEnabled: true,
      subdivisionsValue: 2,
      tickToMs,
      currentTick: 0,
    });

    expect(schedule?.events.map((event) => event.offsetMs)).toEqual([
      0, 160, 320, 480, 640, 800,
    ]);
    expect(schedule?.events.map((event) => event.kind)).toEqual([
      'accent',
      'low',
      'low',
      'normal',
      'low',
      'low',
    ]);
  });

  it('does not exclude events near the loop end (no epsilon)', () => {
    const loopMs = 1000;
    const schedule = buildMetronomeSchedule({
      loopRange: { start: 0, end: 1000 },
      bars: [
        {
          startTick: 0,
          endTick: 2000,
          timeSigTop: 4,
          timeSigBottom: 4,
          beatTicks: 250,
        },
      ],
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      tickToMs: (tick) => tick,
      currentTick: 0,
    });

    expect(schedule).not.toBeNull();
    // An event at offsetMs = loopMs - 0.1 should NOT be excluded
    // With the old epsilon of 0.5, events within 0.5ms of the end were dropped.
    // Verify that events very close to the end are included.
    const nearEndOffset = loopMs - 0.1;
    void nearEndOffset;
    // 999.9 is < 1000 and should be included if such a beat exists.
    // For this specific input, beats are at 0, 250, 500, 750 — all well within range.
    // Let's test directly with a custom tickToMs that puts a beat near the end.
    const schedule2 = buildMetronomeSchedule({
      loopRange: { start: 0, end: 1000 },
      bars: [
        {
          startTick: 0,
          endTick: 1000,
          timeSigTop: 2,
          timeSigBottom: 4,
          beatTicks: 500,
        },
      ],
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      tickToMs: (tick) => {
        if (tick === 0) return 0;
        if (tick === 500) return nearEndOffset;
        if (tick === 1000) return loopMs;
        return tick;
      },
      currentTick: 0,
    });

    expect(schedule2).not.toBeNull();
    const offsets2 = schedule2?.events.map((e) => e.offsetMs) ?? [];
    expect(offsets2).toContain(nearEndOffset);
  });

  it('drops events that round onto the loop end', () => {
    const schedule = buildMetronomeSchedule({
      loopRange: { start: 0, end: 100 },
      bars: [
        {
          startTick: 0,
          endTick: 200,
          timeSigTop: 2,
          timeSigBottom: 4,
          beatTicks: 100,
        },
      ],
      subdivisionsEnabled: false,
      subdivisionsValue: 2,
      tickToMs: (tick) => {
        if (tick === 0) return 0;
        if (tick === 100) return 100;
        if (tick === 50) return 100;
        return tick;
      },
      currentTick: 0,
    });

    expect(schedule?.loopMs).toBe(100);
    expect(schedule?.events.map((event) => event.offsetMs)).toEqual([0]);
  });
});
