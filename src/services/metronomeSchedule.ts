import type { BeatState, MetronomeScheduleEvent } from './metronomeCommands';

export type MetronomeBarInfo = {
  startTick: number;
  endTick: number;
  timeSigTop: number;
  timeSigBottom: number;
  beatTicks: number;
};

export type MetronomeSchedule = {
  events: MetronomeScheduleEvent[];
  loopMs: number;
  startOffsetMs: number;
};

type ScheduleInput = {
  loopRange: { start: number; end: number };
  bars: MetronomeBarInfo[];
  subdivisionsEnabled: boolean;
  subdivisionsValue: number;
  tickToMs: (tick: number) => number;
  currentTick: number;
};

function clampLoopOffset(offset: number, loopMs: number): number {
  if (!Number.isFinite(offset) || loopMs <= 0) {
    return 0;
  }
  const wrapped = offset % loopMs;
  return wrapped < 0 ? wrapped + loopMs : wrapped;
}

export function buildMetronomeSchedule(
  input: ScheduleInput,
): MetronomeSchedule | null {
  const loopStart = Math.round(input.loopRange.start);
  const loopEnd = Math.round(input.loopRange.end);
  if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd)) {
    return null;
  }
  if (loopEnd <= loopStart) {
    return null;
  }
  const loopStartMs = input.tickToMs(loopStart);
  const loopEndMs = input.tickToMs(loopEnd);
  const loopMs = loopEndMs - loopStartMs;
  if (!Number.isFinite(loopMs) || loopMs <= 0) {
    return null;
  }
  const events: MetronomeScheduleEvent[] = [];
  const steps = input.subdivisionsEnabled
    ? Math.max(1, Math.round(input.subdivisionsValue + 1))
    : 1;

  input.bars.forEach((bar) => {
    const barStart = Math.round(bar.startTick);
    const barEnd = Math.round(bar.endTick);
    if (!Number.isFinite(barStart) || !Number.isFinite(barEnd)) {
      return;
    }
    if (barEnd <= loopStart || barStart >= loopEnd) {
      return;
    }
    const beatTicks = Math.max(1, Math.round(bar.beatTicks));
    let beatIndex = 0;
    for (let beatTick = barStart; beatTick < barEnd; beatTick += beatTicks) {
      if (beatTick >= loopStart && beatTick < loopEnd) {
        const kind: BeatState = beatIndex === 0 ? 'accent' : 'normal';
        const offsetMs = input.tickToMs(beatTick) - loopStartMs;
        if (offsetMs >= 0 && offsetMs < loopMs) {
          events.push({ offsetMs, kind });
        }
      }
      if (steps > 1) {
        const subTicks = beatTicks / steps;
        for (let subIndex = 1; subIndex < steps; subIndex += 1) {
          const subTick = beatTick + subIndex * subTicks;
          if (subTick >= loopStart && subTick < loopEnd) {
            const offsetMs = input.tickToMs(subTick) - loopStartMs;
            if (offsetMs >= 0 && offsetMs < loopMs) {
              events.push({
                offsetMs,
                kind: 'low',
              });
            }
          }
        }
      }
      beatIndex += 1;
    }
  });

  events.sort((a, b) => a.offsetMs - b.offsetMs);

  const startOffsetMs = clampLoopOffset(
    input.tickToMs(input.currentTick) - loopStartMs,
    loopMs,
  );

  return {
    events,
    loopMs,
    startOffsetMs,
  };
}
