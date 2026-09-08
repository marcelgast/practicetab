import { importer } from '@coderline/alphatab';
import {
  formatPlayedBarLabel,
  normalizeLoopEvents,
  normalizeTimeEvents,
  type BeatmapLoopEvent,
  type BeatmapPlayedBarRow,
  type BeatmapTimeEvent,
} from '../domain/beatmap';

type AlphaTabMasterBar = {
  index?: number;
  timeSignatureNumerator?: number;
  timeSignatureDenominator?: number;
  tempoAutomations?: Array<{ value?: number }>;
  isRepeatStart?: boolean;
  repeatCount?: number;
  alternateEndings?: number;
  repeatGroup?: {
    opening?: { index?: number };
  };
};

type AlphaTabScore = {
  tempo?: number;
  masterBars?: unknown[];
};

type BarState = {
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
};

type RepeatGroupLike = {
  opening?: { index?: number };
  closings?: Array<{ index?: number }>;
  isClosed?: boolean;
};

type RepeatState = {
  key: string;
  openingIndex: number;
  closingIndexes: number[];
  iterations: number[];
  closingIndex: number;
};

export type GpBeatmap = {
  startBpm: number;
  startTimeSigTop: number;
  startTimeSigBottom: number;
  endBar: number;
  timeEvents: BeatmapTimeEvent[];
  loopEvents: BeatmapLoopEvent[];
  playedBars: BeatmapPlayedBarRow[];
};

const MAX_PLAYED_BAR_ROWS = 200_000;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function toMasterBars(score: AlphaTabScore): AlphaTabMasterBar[] {
  return ((score.masterBars ?? []) as AlphaTabMasterBar[]).filter(Boolean);
}

function openingIndexForBar(bar: AlphaTabMasterBar, fallback: number): number {
  const fromGroup = bar.repeatGroup?.opening?.index;
  if (typeof fromGroup === 'number' && Number.isFinite(fromGroup)) {
    return Math.max(0, Math.round(fromGroup));
  }
  return fallback;
}

function buildBarStates(
  score: AlphaTabScore,
  bars: AlphaTabMasterBar[],
): BarState[] {
  let tempo = clamp(score.tempo ?? 0, 20, 400);
  let top = 4;
  let bottom = 4;
  const validBottom = new Set([1, 2, 4, 8, 16, 32]);

  return bars.map((bar) => {
    const automations = Array.isArray(bar.tempoAutomations)
      ? bar.tempoAutomations
      : [];
    const tempoValue = automations.find(
      (entry) =>
        typeof entry?.value === 'number' && Number.isFinite(entry.value),
    )?.value;
    if (typeof tempoValue === 'number') {
      tempo = clamp(tempoValue, 20, 400);
    }

    if (
      typeof bar.timeSignatureNumerator === 'number' &&
      Number.isFinite(bar.timeSignatureNumerator)
    ) {
      top = clamp(bar.timeSignatureNumerator, 1, 32);
    }

    if (
      typeof bar.timeSignatureDenominator === 'number' &&
      Number.isFinite(bar.timeSignatureDenominator)
    ) {
      const rounded = Math.round(bar.timeSignatureDenominator);
      bottom = validBottom.has(rounded) ? rounded : 4;
    }

    return {
      bpm: tempo,
      timeSigTop: top,
      timeSigBottom: bottom,
    };
  });
}

function buildTimeEvents(states: BarState[]): BeatmapTimeEvent[] {
  if (states.length === 0) {
    return [];
  }

  const rawEvents: BeatmapTimeEvent[] = [];
  states.forEach((state, index) => {
    const barIndex = index + 1;
    if (index === 0) {
      rawEvents.push({
        barIndex,
        bpm: state.bpm,
        timeSigTop: state.timeSigTop,
        timeSigBottom: state.timeSigBottom,
      });
      return;
    }
    const previous = states[index - 1];
    const changed =
      previous.bpm !== state.bpm ||
      previous.timeSigTop !== state.timeSigTop ||
      previous.timeSigBottom !== state.timeSigBottom;
    if (changed) {
      rawEvents.push({
        barIndex,
        bpm: state.bpm,
        timeSigTop: state.timeSigTop,
        timeSigBottom: state.timeSigBottom,
      });
    }
  });

  return normalizeTimeEvents(rawEvents, {
    bpm: states[0].bpm,
    timeSigTop: states[0].timeSigTop,
    timeSigBottom: states[0].timeSigBottom,
  });
}

function buildLoopEventsFromBars(
  bars: AlphaTabMasterBar[],
): BeatmapLoopEvent[] {
  const raw: BeatmapLoopEvent[] = [];

  bars.forEach((bar, index) => {
    const repeatCount = clamp(bar.repeatCount ?? 0, 0, Number.MAX_SAFE_INTEGER);
    if (repeatCount <= 0) {
      return;
    }
    const opening = openingIndexForBar(bar, index);
    const startBar = opening + 1;
    const endBar = index + 1;
    if (startBar > endBar) {
      return;
    }
    raw.push({
      startBar,
      endBar,
      repeatCount,
    });
  });

  const dedupedByRange = new Map<string, BeatmapLoopEvent>();
  raw.forEach((loop) => {
    const key = `${loop.startBar}:${loop.endBar}`;
    const existing = dedupedByRange.get(key);
    if (!existing || existing.repeatCount < loop.repeatCount) {
      dedupedByRange.set(key, loop);
    }
  });

  return normalizeLoopEvents(Array.from(dedupedByRange.values()));
}

function repeatGroupKey(group: RepeatGroupLike | undefined): string | null {
  if (!group) {
    return null;
  }
  const opening = openingIndexForBar(
    {
      repeatGroup: group,
    } as AlphaTabMasterBar,
    -1,
  );
  if (opening < 0) {
    return null;
  }
  const closings = Array.isArray(group.closings)
    ? group.closings
        .map((entry) =>
          typeof entry?.index === 'number' && Number.isFinite(entry.index)
            ? Math.max(0, Math.round(entry.index))
            : null,
        )
        .filter((index): index is number => index !== null)
        .sort((left, right) => left - right)
    : [];
  return `${opening}:${closings.join(',')}`;
}

function makeRepeatState(group: RepeatGroupLike): RepeatState | null {
  const key = repeatGroupKey(group);
  if (!key) {
    return null;
  }
  const openingIndex = openingIndexForBar(
    {
      repeatGroup: group,
    } as AlphaTabMasterBar,
    -1,
  );
  if (openingIndex < 0) {
    return null;
  }
  const closingIndexes = Array.isArray(group.closings)
    ? group.closings
        .map((entry) =>
          typeof entry?.index === 'number' && Number.isFinite(entry.index)
            ? Math.max(0, Math.round(entry.index))
            : null,
        )
        .filter((index): index is number => index !== null)
        .sort((left, right) => left - right)
    : [];
  return {
    key,
    openingIndex,
    closingIndexes,
    iterations: closingIndexes.map(() => 0),
    closingIndex: 0,
  };
}

function expandPlayedBars(
  bars: AlphaTabMasterBar[],
  states: BarState[],
): BeatmapPlayedBarRow[] {
  const playedRows: BeatmapPlayedBarRow[] = [];
  const repeatStack: RepeatState[] = [];
  const repeatGroupsOnStack = new Set<string>();
  let previousAlternateEndings = 0;
  let currentIndex = 0;
  let guard = 0;

  while (
    currentIndex >= 0 &&
    currentIndex < bars.length &&
    playedRows.length < MAX_PLAYED_BAR_ROWS &&
    guard < MAX_PLAYED_BAR_ROWS * 4
  ) {
    guard += 1;
    const bar = bars[currentIndex];
    const repeatGroup = bar.repeatGroup as RepeatGroupLike | undefined;

    if (
      repeatGroup &&
      repeatGroup.isClosed === true &&
      repeatGroup.opening === bar
    ) {
      const repeat = makeRepeatState(repeatGroup);
      if (repeat && !repeatGroupsOnStack.has(repeat.key)) {
        repeatStack.push(repeat);
        repeatGroupsOnStack.add(repeat.key);
        previousAlternateEndings = 0;
      }
    }

    let effectiveAlternateMask = clamp(
      bar.alternateEndings ?? 0,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (effectiveAlternateMask === 0) {
      effectiveAlternateMask = previousAlternateEndings;
    }

    const activeRepeat = repeatStack[repeatStack.length - 1];
    const currentIteration = activeRepeat
      ? (activeRepeat.iterations[activeRepeat.closingIndex] ?? 0)
      : 0;
    const shouldPlay =
      !activeRepeat ||
      effectiveAlternateMask === 0 ||
      (effectiveAlternateMask & (1 << currentIteration)) !== 0;

    if (activeRepeat && effectiveAlternateMask !== 0) {
      previousAlternateEndings = effectiveAlternateMask;
    }

    if (shouldPlay) {
      const notationBarIndex = currentIndex + 1;
      const repeatPass = Math.max(0, currentIteration);
      const state = states[currentIndex] ?? states[0];
      playedRows.push({
        playedBarIndex: playedRows.length + 1,
        notationBarIndex,
        repeatPass,
        playedBarLabel: formatPlayedBarLabel(notationBarIndex, repeatPass),
        bpm: state.bpm,
        timeSigTop: state.timeSigTop,
        timeSigBottom: state.timeSigBottom,
      });
    }

    const repeatCount = clamp(bar.repeatCount ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const repeatCountAsJumps = Math.max(0, repeatCount - 1);
    if (activeRepeat && repeatCountAsJumps > 0) {
      const iteration = activeRepeat.iterations[activeRepeat.closingIndex] ?? 0;
      if (iteration < repeatCountAsJumps) {
        activeRepeat.iterations[activeRepeat.closingIndex] = iteration + 1;
        for (let i = 0; i < activeRepeat.closingIndex; i += 1) {
          activeRepeat.iterations[i] = 0;
        }
        activeRepeat.closingIndex = 0;
        previousAlternateEndings = 0;
        currentIndex = activeRepeat.openingIndex;
        continue;
      }

      if (activeRepeat.closingIndex < activeRepeat.closingIndexes.length - 1) {
        activeRepeat.closingIndex += 1;
        currentIndex += 1;
        continue;
      }

      repeatStack.pop();
      repeatGroupsOnStack.delete(activeRepeat.key);
    }

    currentIndex += 1;
  }

  return playedRows;
}

export function buildGpBeatmapFromBytes(bytes: Uint8Array): GpBeatmap {
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes) as AlphaTabScore;
  const masterBars = toMasterBars(score);
  if (masterBars.length === 0) {
    throw new Error('score_has_no_master_bars');
  }

  const barStates = buildBarStates(score, masterBars);
  const timeEvents = buildTimeEvents(barStates);
  const loopEvents = buildLoopEventsFromBars(masterBars);
  const playedBars = expandPlayedBars(masterBars, barStates);

  const firstState = barStates[0];
  return {
    startBpm: firstState.bpm,
    startTimeSigTop: firstState.timeSigTop,
    startTimeSigBottom: firstState.timeSigBottom,
    endBar: masterBars.length,
    timeEvents,
    loopEvents,
    playedBars,
  };
}
