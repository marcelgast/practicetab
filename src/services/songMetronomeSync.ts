import type { GpBeatmap } from './gpBeatmapBuilder';
import { metronomeStart, metronomeStop } from './metronomeCommands';
import type { SoundMode } from './metronomeCommands';
import { buildScheduleFromBeatmap } from './beatmapMetronomeSync';

export type SongMetronomeContext = {
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  countInBars: number[];
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
  volume: number;
  subdivisionsEnabled: boolean;
  subdivisionsValue: number;
  soundMode: SoundMode;
};

export function getBeatmapConfig(
  beatmap: GpBeatmap | undefined | null,
): { bpm: number; timeSigTop: number; timeSigBottom: number } | null {
  if (!beatmap?.timeEvents?.length) return null;
  return beatmap.timeEvents[0];
}

export function countInDurationMs(ctx: SongMetronomeContext): number {
  if (!ctx.countInEnabled || ctx.countInBars.length === 0) return 0;
  const totalBars = ctx.countInBars.reduce((a, b) => a + b, 0);
  const msPerBeat = 60_000 / ctx.bpm;
  return totalBars * ctx.timeSigTop * msPerBeat;
}

export async function startSongMetronome(
  beatmap: GpBeatmap,
  ctx: SongMetronomeContext,
  options: {
    skipCountIn?: boolean;
    positionMs: number;
  },
): Promise<void> {
  if (!ctx.metronomeEnabled) return;
  const cfg = getBeatmapConfig(beatmap);
  if (!cfg) return;

  const schedule = buildScheduleFromBeatmap(beatmap, {
    subdivisionsEnabled: ctx.subdivisionsEnabled,
    subdivisionsValue: ctx.subdivisionsValue,
  });

  const scheduleStartOffsetMs =
    schedule.loopMs > 0 ? options.positionMs % schedule.loopMs : 0;

  const activeBpm = ctx.bpm;
  const activeTimeSigTop = ctx.timeSigTop;
  const activeTimeSigBottom = ctx.timeSigBottom;

  // Scale schedule offsets if exercise BPM differs from beatmap BPM
  const speedRatio = cfg.bpm > 0 ? activeBpm / cfg.bpm : 1.0;
  const needsScale = Math.abs(speedRatio - 1.0) > 0.001;
  const scaledEvents = needsScale
    ? schedule.events.map((e) => ({
        offsetMs: e.offsetMs / speedRatio,
        kind: e.kind,
      }))
    : schedule.events;
  const scaledLoopMs = needsScale
    ? schedule.loopMs / speedRatio
    : schedule.loopMs;
  const scaledStartOffset = needsScale
    ? scheduleStartOffsetMs / speedRatio
    : scheduleStartOffsetMs;

  const useCountIn = !options.skipCountIn && ctx.countInEnabled;

  await metronomeStart({
    bpm: activeBpm,
    timeSigTop: activeTimeSigTop,
    timeSigBottom: activeTimeSigBottom,
    volume: ctx.volume,
    beatStates: Array.from({ length: activeTimeSigTop }, (_, i) =>
      i === 0 ? 'accent' : 'normal',
    ),
    subdivisionsEnabled: ctx.subdivisionsEnabled,
    subdivisionsValue: ctx.subdivisionsValue,
    soundMode: ctx.soundMode,
    countInBars: useCountIn ? ctx.countInBars : [],
    countInEnabled: useCountIn,
    startBeatIndex: 0,
    startSubIndex: 0,
    startDelayMs: 0,
    schedule: scaledEvents,
    scheduleLoopMs: scaledLoopMs,
    scheduleStartOffsetMs: scaledStartOffset,
  });
}

export { metronomeStop };
