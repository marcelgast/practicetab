import { describe, it, expect } from 'vitest';
import { snapToNearestBeat } from '../domain/songLoopSnap';
import type { BeatmapScheduledEvent } from '../services/beatmapMetronomeSync';

function beat(
  offsetMs: number,
  kind: 'accent' | 'normal' | 'low' = 'normal',
): BeatmapScheduledEvent {
  return { offsetMs, kind };
}

describe('snapToNearestBeat', () => {
  const events: BeatmapScheduledEvent[] = [
    beat(0, 'accent'),
    beat(250, 'low'),
    beat(500, 'normal'),
    beat(750, 'low'),
    beat(1000, 'accent'),
    beat(1250, 'low'),
    beat(1500, 'normal'),
    beat(1750, 'low'),
    beat(2000, 'accent'),
  ];

  it('returns raw ms when no events', () => {
    expect(snapToNearestBeat(123, [])).toBe(123);
  });

  it('snaps to exact beat position', () => {
    expect(snapToNearestBeat(500, events)).toBe(500);
    expect(snapToNearestBeat(1000, events)).toBe(1000);
  });

  it('snaps to nearest beat, ignoring subdivisions', () => {
    // 300 is between accent@0 and normal@500 → closer to 500
    expect(snapToNearestBeat(300, events)).toBe(500);
    // 200 is between accent@0 and normal@500 → closer to 0
    expect(snapToNearestBeat(200, events)).toBe(0);
  });

  it('snaps to earlier beat when equidistant', () => {
    // 250 is exactly between 0 and 500 → prefer earlier (0)
    expect(snapToNearestBeat(250, events)).toBe(0);
  });

  it('snaps to first beat when before all events', () => {
    expect(snapToNearestBeat(-100, events)).toBe(0);
  });

  it('snaps to last beat when after all events', () => {
    expect(snapToNearestBeat(3000, events)).toBe(2000);
  });

  it('ignores low (subdivision) events', () => {
    // 740 is very close to low@750 but should snap to normal@500 or accent@1000
    // Distance to 500: 240, distance to 1000: 260 → snaps to 500
    expect(snapToNearestBeat(740, events)).toBe(500);

    // 760 → distance to 500: 260, distance to 1000: 240 → snaps to 1000
    expect(snapToNearestBeat(760, events)).toBe(1000);
  });

  it('works with only accent events', () => {
    const accentsOnly = [beat(0, 'accent'), beat(1000, 'accent')];
    expect(snapToNearestBeat(400, accentsOnly)).toBe(0);
    expect(snapToNearestBeat(600, accentsOnly)).toBe(1000);
  });

  it('works with single beat event', () => {
    const single = [beat(500, 'accent')];
    expect(snapToNearestBeat(0, single)).toBe(500);
    expect(snapToNearestBeat(1000, single)).toBe(500);
  });

  it('returns raw ms when only subdivision events exist', () => {
    const subsOnly = [beat(250, 'low'), beat(750, 'low')];
    expect(snapToNearestBeat(400, subsOnly)).toBe(400);
  });
});
