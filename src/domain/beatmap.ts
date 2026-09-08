export type BeatmapTimeEvent = {
  barIndex: number;
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
};

export type BeatmapLoopEvent = {
  startBar: number;
  endBar: number;
  repeatCount: number;
};

export type BeatmapTempoState = {
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
};

export type BeatmapPlayedBarRow = {
  playedBarIndex: number;
  notationBarIndex: number;
  repeatPass: number;
  playedBarLabel: string;
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
};

const VALID_TIME_SIG_BOTTOMS = new Set([1, 2, 4, 8, 16, 32]);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeTimeSigBottom(value: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : 4;
  return VALID_TIME_SIG_BOTTOMS.has(rounded) ? rounded : 4;
}

export function formatPlayedBarLabel(
  notationBarIndex: number,
  repeatPass: number,
): string {
  const notation = Math.max(1, Math.round(notationBarIndex));
  const pass = Math.max(0, Math.round(repeatPass));
  return pass === 0 ? String(notation) : `${notation}.${pass}`;
}

export function normalizeTimeEvents(
  events: BeatmapTimeEvent[],
  fallback: BeatmapTempoState,
): BeatmapTimeEvent[] {
  const normalized = events
    .map((event) => ({
      barIndex: clamp(event.barIndex, 1, Number.MAX_SAFE_INTEGER),
      bpm: clamp(event.bpm, 20, 400),
      timeSigTop: clamp(event.timeSigTop, 1, 32),
      timeSigBottom: normalizeTimeSigBottom(event.timeSigBottom),
    }))
    .sort((left, right) => left.barIndex - right.barIndex);

  const deduped = new Map<number, BeatmapTimeEvent>();
  normalized.forEach((event) => {
    deduped.set(event.barIndex, event);
  });
  const result = Array.from(deduped.values()).sort(
    (left, right) => left.barIndex - right.barIndex,
  );

  if (result.length === 0 || result[0]?.barIndex !== 1) {
    result.unshift({
      barIndex: 1,
      bpm: clamp(fallback.bpm, 20, 400),
      timeSigTop: clamp(fallback.timeSigTop, 1, 32),
      timeSigBottom: normalizeTimeSigBottom(fallback.timeSigBottom),
    });
  }

  return result;
}

export function normalizeLoopEvents(
  loops: BeatmapLoopEvent[],
): BeatmapLoopEvent[] {
  const sorted = loops
    .map((loop) => ({
      startBar: clamp(loop.startBar, 1, Number.MAX_SAFE_INTEGER),
      endBar: clamp(loop.endBar, 1, Number.MAX_SAFE_INTEGER),
      repeatCount: clamp(loop.repeatCount, 1, Number.MAX_SAFE_INTEGER),
    }))
    .filter((loop) => loop.startBar <= loop.endBar)
    .sort((left, right) => {
      if (left.startBar !== right.startBar) {
        return left.startBar - right.startBar;
      }
      return left.endBar - right.endBar;
    });

  const accepted: BeatmapLoopEvent[] = [];
  sorted.forEach((loop) => {
    const overlaps = accepted.some(
      (candidate) =>
        loop.startBar <= candidate.endBar && loop.endBar >= candidate.startBar,
    );
    if (!overlaps) {
      accepted.push(loop);
    }
  });
  return accepted;
}

export function tempoStateAtNotationBar(
  notationBarIndex: number,
  events: BeatmapTimeEvent[],
): BeatmapTempoState {
  const normalizedBar = Math.max(1, Math.round(notationBarIndex));
  const sorted = [...events].sort((a, b) => a.barIndex - b.barIndex);
  if (sorted.length === 0) {
    return { bpm: 20, timeSigTop: 4, timeSigBottom: 4 };
  }
  let active = sorted[0];

  for (const event of sorted) {
    if (event.barIndex <= normalizedBar) {
      active = event;
      continue;
    }
    break;
  }

  return {
    bpm: active.bpm,
    timeSigTop: active.timeSigTop,
    timeSigBottom: active.timeSigBottom,
  };
}

export function mapPlayedBarToNotationBar(
  playedBarIndex: number,
  loops: BeatmapLoopEvent[],
): { notationBarIndex: number; repeatPass: number } {
  const playedBar = Math.max(1, Math.round(playedBarIndex));
  const normalizedLoops = normalizeLoopEvents(loops);

  let remaining = playedBar;
  let currentReadBar = 1;

  for (const loop of normalizedLoops) {
    const barsBeforeLoop = Math.max(0, loop.startBar - currentReadBar);
    if (remaining <= barsBeforeLoop) {
      return {
        notationBarIndex: currentReadBar + remaining - 1,
        repeatPass: 0,
      };
    }
    remaining -= barsBeforeLoop;

    const loopLength = loop.endBar - loop.startBar + 1;
    const totalLoopPlays = loop.repeatCount + 1;
    const loopPlayedBars = loopLength * totalLoopPlays;
    if (remaining <= loopPlayedBars) {
      const zeroBased = remaining - 1;
      const pass = Math.floor(zeroBased / loopLength);
      const offset = zeroBased % loopLength;
      return {
        notationBarIndex: loop.startBar + offset,
        repeatPass: Math.max(0, pass),
      };
    }

    remaining -= loopPlayedBars;
    currentReadBar = loop.endBar + 1;
  }

  return {
    notationBarIndex: currentReadBar + remaining - 1,
    repeatPass: 0,
  };
}

export function findFirstPlayedBarForNotationBar(
  notationBarIndex: number,
  loops: BeatmapLoopEvent[],
  fromPlayedBar = 1,
): number | null {
  const target = Math.max(1, Math.round(notationBarIndex));
  const start = Math.max(1, Math.round(fromPlayedBar));
  const limit = start + 200_000;

  for (let playedBar = start; playedBar <= limit; playedBar += 1) {
    const mapped = mapPlayedBarToNotationBar(playedBar, loops);
    if (mapped.notationBarIndex === target) {
      return playedBar;
    }
  }

  return null;
}
