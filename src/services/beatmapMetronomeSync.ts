import type { BeatmapPlayedBarRow } from '../domain/beatmap';
import type { GpBeatmap } from './gpBeatmapBuilder';

export type BeatmapScheduledEvent = {
  offsetMs: number;
  kind: 'accent' | 'normal' | 'low';
};

export type BeatmapSchedule = {
  events: BeatmapScheduledEvent[];
  loopMs: number;
  startOffsetMs: number;
  startBpm: number;
  startTimeSigTop: number;
  startTimeSigBottom: number;
};

function roundMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeRowBpm(row: BeatmapPlayedBarRow, tempoPercent: number): number {
  const scale = Math.max(1, tempoPercent) / 100;
  return Math.max(20, row.bpm * scale);
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

function firstPlayedIndexForNotationBar(
  rows: BeatmapPlayedBarRow[],
  notationBarIndex: number,
): number {
  const target = Math.max(1, Math.round(notationBarIndex));
  const match = rows.find((row) => row.notationBarIndex === target);
  return match?.playedBarIndex ?? 1;
}

export function buildScheduleFromBeatmap(
  beatmap: GpBeatmap,
  options?: {
    startNotationBar?: number;
    tempoPercent?: number;
    subdivisionsEnabled?: boolean;
    subdivisionsValue?: number;
  },
): BeatmapSchedule {
  const tempoPercent = clamp(options?.tempoPercent ?? 100, 1, 400);
  const rows = safeRows(beatmap);
  const events: BeatmapScheduledEvent[] = [];
  const offsetsByPlayedBarIndex = new Map<number, number>();
  let cursorMs = 0;
  const subdivisionSteps =
    options?.subdivisionsEnabled === true
      ? Math.max(2, clamp(options?.subdivisionsValue ?? 2, 1, 7) + 1)
      : 1;

  rows.forEach((row) => {
    // Use original BPM (not tempo-scaled) so offsets are in score-time,
    // matching the audio engine's score-time clock.
    const bpm = Math.max(20, row.bpm);
    const top = Math.max(1, clamp(row.timeSigTop, 1, 32));
    const bottom = [1, 2, 4, 8, 16, 32].includes(Math.round(row.timeSigBottom))
      ? Math.round(row.timeSigBottom)
      : 4;
    const beatMs = (60_000 / bpm) * (4 / bottom);
    offsetsByPlayedBarIndex.set(row.playedBarIndex, roundMs(cursorMs));

    for (let beat = 0; beat < top; beat += 1) {
      const beatStart = cursorMs + beat * beatMs;
      events.push({
        offsetMs: roundMs(beatStart),
        kind: beat === 0 ? 'accent' : 'normal',
      });
      if (subdivisionSteps > 1) {
        const subdivisionMs = beatMs / subdivisionSteps;
        for (let step = 1; step < subdivisionSteps; step += 1) {
          events.push({
            offsetMs: roundMs(beatStart + subdivisionMs * step),
            kind: 'low',
          });
        }
      }
    }
    cursorMs += beatMs * top;
  });

  const loopMs = roundMs(cursorMs);
  const startNotationBar = Math.max(
    1,
    Math.round(options?.startNotationBar ?? 1),
  );
  const startPlayedIndex = firstPlayedIndexForNotationBar(
    rows,
    startNotationBar,
  );
  const startOffsetRaw = offsetsByPlayedBarIndex.get(startPlayedIndex) ?? 0;
  const startOffsetMs =
    loopMs > 0 ? roundMs(((startOffsetRaw % loopMs) + loopMs) % loopMs) : 0;
  const startRow =
    rows.find((row) => row.playedBarIndex === startPlayedIndex) ?? rows[0];

  return {
    events,
    loopMs,
    startOffsetMs,
    startBpm: Math.round(safeRowBpm(startRow, tempoPercent)),
    startTimeSigTop: Math.max(1, Math.round(startRow.timeSigTop)),
    startTimeSigBottom: [1, 2, 4, 8, 16, 32].includes(
      Math.round(startRow.timeSigBottom),
    )
      ? Math.round(startRow.timeSigBottom)
      : 4,
  };
}
