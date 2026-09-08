import type { BeatmapPlayedBarRow } from '../domain/beatmap';
import type { GpBeatmap } from './gpBeatmapBuilder';
import { buildScheduleFromBeatmap } from './beatmapMetronomeSync';
import {
  buildMetronomeSchedule,
  type MetronomeBarInfo,
} from './metronomeSchedule';

export type MetronomeSyncResolveReason =
  | 'play'
  | 'resume'
  | 'seek'
  | 'loop_toggle'
  | 'loop_range_change'
  | 'tempo_change'
  | 'sync_toggle';

export type MetronomeSyncResolveInput = {
  beatmap: GpBeatmap;
  tempoPercent: number;
  subdivisionsEnabled: boolean;
  subdivisionsValue: number;
  currentTick: number | null;
  currentMsOverride?: number | null;
  tickToMs: (tick: number) => number | null;
  bars?: MetronomeBarInfo[];
  loopRangeTicks?: { start: number; end: number } | null;
  renderedSignatureAtTick?: { top: number; bottom: number } | null;
  reason: MetronomeSyncResolveReason;
};

export type MetronomeSyncResolveResult = {
  schedule: Array<{ offsetMs: number; kind: 'accent' | 'normal' | 'low' }>;
  scheduleLoopMs: number;
  scheduleStartOffsetMs: number;
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
  debug: {
    reason: MetronomeSyncResolveReason;
    path: 'beatmap_full' | 'loop_tick_range';
    currentTick: number;
    currentMs: number;
  };
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function roundMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1000) / 1000;
}

function wrapOffsetMs(value: number, loopMs: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(loopMs) || loopMs <= 0) {
    return 0;
  }
  const wrapped = value % loopMs;
  return wrapped < 0 ? wrapped + loopMs : wrapped;
}

function safeRows(beatmap: GpBeatmap): BeatmapPlayedBarRow[] {
  if (beatmap.playedBars.length > 0) {
    return beatmap.playedBars;
  }
  return [
    {
      playedBarIndex: 1,
      notationBarIndex: 1,
      repeatPass: 0,
      playedBarLabel: '1',
      bpm: beatmap.startBpm,
      timeSigTop: beatmap.startTimeSigTop,
      timeSigBottom: beatmap.startTimeSigBottom,
    },
  ];
}

function safeRowBpm(row: BeatmapPlayedBarRow, tempoPercent: number): number {
  const scale = Math.max(1, tempoPercent) / 100;
  return Math.max(20, row.bpm * scale);
}

function resolveCurrentTick(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function resolveCurrentMs(
  currentTick: number,
  currentMsOverride: number | null | undefined,
  tickToMs: (tick: number) => number | null,
): number {
  if (
    typeof currentMsOverride === 'number' &&
    Number.isFinite(currentMsOverride) &&
    currentMsOverride >= 0
  ) {
    return currentMsOverride;
  }
  const ms = tickToMs(currentTick);
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return 0;
  }
  return Math.max(0, ms);
}

function resolveRowAtOffset(
  rows: BeatmapPlayedBarRow[],
  offsetMs: number,
): BeatmapPlayedBarRow {
  let cursorMs = 0;
  for (const row of rows) {
    const top = Math.max(1, clamp(row.timeSigTop, 1, 32));
    const bottom = [1, 2, 4, 8, 16, 32].includes(Math.round(row.timeSigBottom))
      ? Math.round(row.timeSigBottom)
      : 4;
    // Use original BPM — offsets are in score-time
    const beatMs = (60_000 / Math.max(20, row.bpm)) * (4 / bottom);
    const barMs = beatMs * top;
    const next = cursorMs + barMs;
    if (offsetMs >= cursorMs && offsetMs < next) {
      return row;
    }
    cursorMs = next;
  }
  return rows[0];
}

function resolveSignatureAtTick(
  tick: number,
  bars: MetronomeBarInfo[] | undefined,
): { top: number; bottom: number } | null {
  if (!bars || bars.length === 0) {
    return null;
  }
  for (const bar of bars) {
    if (tick >= bar.startTick && tick < bar.endTick) {
      return {
        top: Math.max(1, Math.round(bar.timeSigTop)),
        bottom: Math.max(1, Math.round(bar.timeSigBottom)),
      };
    }
  }
  const first = bars[0];
  return first
    ? {
        top: Math.max(1, Math.round(first.timeSigTop)),
        bottom: Math.max(1, Math.round(first.timeSigBottom)),
      }
    : null;
}

export function resolveMetronomeSyncFromBeatmap(
  input: MetronomeSyncResolveInput,
): MetronomeSyncResolveResult | null {
  const currentTick = resolveCurrentTick(input.currentTick);
  const currentMs = resolveCurrentMs(
    currentTick,
    input.currentMsOverride,
    input.tickToMs,
  );
  if (
    input.loopRangeTicks &&
    input.bars &&
    input.bars.length > 0 &&
    input.loopRangeTicks.end > input.loopRangeTicks.start
  ) {
    const loopSchedule = buildMetronomeSchedule({
      loopRange: input.loopRangeTicks,
      bars: input.bars,
      subdivisionsEnabled: input.subdivisionsEnabled,
      subdivisionsValue: input.subdivisionsValue,
      tickToMs: (tick) => {
        const ms = input.tickToMs(tick);
        return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
      },
      currentTick,
    });
    if (
      loopSchedule &&
      loopSchedule.events.length > 0 &&
      loopSchedule.loopMs > 0
    ) {
      const rows = safeRows(input.beatmap);
      const activeRow = resolveRowAtOffset(rows, currentMs);
      const signatureFromBars =
        input.renderedSignatureAtTick ??
        resolveSignatureAtTick(currentTick, input.bars);
      const timeSigTop =
        signatureFromBars?.top ?? Math.max(1, Math.round(activeRow.timeSigTop));
      const timeSigBottomRaw =
        signatureFromBars?.bottom ?? Math.round(activeRow.timeSigBottom);
      const timeSigBottom = [1, 2, 4, 8, 16, 32].includes(timeSigBottomRaw)
        ? timeSigBottomRaw
        : 4;
      return {
        schedule: loopSchedule.events
          .filter((event) => event.kind !== 'mute')
          .map((event) => ({
            offsetMs: event.offsetMs,
            kind: event.kind as 'accent' | 'normal' | 'low',
          })),
        scheduleLoopMs: loopSchedule.loopMs,
        scheduleStartOffsetMs: roundMs(loopSchedule.startOffsetMs),
        bpm: Math.round(safeRowBpm(activeRow, input.tempoPercent)),
        timeSigTop,
        timeSigBottom,
        debug: {
          reason: input.reason,
          path: 'loop_tick_range',
          currentTick,
          currentMs: roundMs(currentMs),
        },
      };
    }
  }

  const schedule = buildScheduleFromBeatmap(input.beatmap, {
    tempoPercent: input.tempoPercent,
    subdivisionsEnabled: input.subdivisionsEnabled,
    subdivisionsValue: input.subdivisionsValue,
  });
  if (schedule.events.length === 0 || schedule.loopMs <= 0) {
    return null;
  }

  const rows = safeRows(input.beatmap);
  const scheduleStartOffsetMs = roundMs(
    wrapOffsetMs(currentMs, schedule.loopMs),
  );
  const activeRow = resolveRowAtOffset(rows, scheduleStartOffsetMs);
  const signatureFromBars =
    input.renderedSignatureAtTick ??
    resolveSignatureAtTick(currentTick, input.bars);
  const timeSigTop =
    signatureFromBars?.top ?? Math.max(1, Math.round(activeRow.timeSigTop));
  const timeSigBottomRaw =
    signatureFromBars?.bottom ?? Math.round(activeRow.timeSigBottom);
  const timeSigBottom = [1, 2, 4, 8, 16, 32].includes(timeSigBottomRaw)
    ? timeSigBottomRaw
    : 4;
  return {
    schedule: schedule.events,
    scheduleLoopMs: schedule.loopMs,
    scheduleStartOffsetMs,
    bpm: Math.round(safeRowBpm(activeRow, input.tempoPercent)),
    timeSigTop,
    timeSigBottom,
    debug: {
      reason: input.reason,
      path: 'beatmap_full',
      currentTick,
      currentMs: roundMs(currentMs),
    },
  };
}
