import type { BeatState } from './metronomeCommands';
import type { AlphaTabBeatInfo } from './alphatabPlayer';

export type LoopRangeTicks = { start: number; end: number } | null;

export type PositionSyncInput = {
  tick: number;
  beatInfo: AlphaTabBeatInfo | null;
  barStartTickOverride?: number | null;
  tempo: number;
  signature: { top: number; bottom: number };
  division: number;
  subdivisionsEnabled: boolean;
  subdivisionsValue: number;
  loopRange: LoopRangeTicks;
};

export type PositionSyncResult = {
  tempo: number;
  signature: { top: number; bottom: number };
  startBeatIndex: number;
  startSubIndex: number;
  startDelayMs: number;
  beatStates: BeatState[];
  barStartTick: number | null;
  effectiveTick: number;
};

function buildDefaultBeatStates(top: number): BeatState[] {
  return Array.from({ length: top }, (_, index) =>
    index === 0 ? 'accent' : 'normal',
  );
}

function clampBeatIndex(index: number, top: number): number {
  if (!Number.isFinite(index) || top <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(top - 1, Math.floor(index)));
}

function computeLoopBeatStates(
  top: number,
  barStartTick: number | null,
  beatTicks: number,
  loopRange: LoopRangeTicks,
): BeatState[] {
  const base = buildDefaultBeatStates(top);
  if (!loopRange || barStartTick === null) {
    return base;
  }
  return base.map((state, index) => {
    const beatStart = barStartTick + index * beatTicks;
    const beatEnd = beatStart + beatTicks;
    const overlaps = beatEnd > loopRange.start && beatStart < loopRange.end;
    return overlaps ? state : 'mute';
  });
}

function findNextUnmutedBeat(
  beatStates: BeatState[],
  startIndex: number,
): { index: number; skipped: number } {
  if (beatStates.length === 0) {
    return { index: 0, skipped: 0 };
  }
  const total = beatStates.length;
  let skipped = 0;
  let idx = ((startIndex % total) + total) % total;
  while (skipped < total && beatStates[idx] === 'mute') {
    idx = (idx + 1) % total;
    skipped += 1;
  }
  return { index: idx, skipped };
}

export function computePositionSync(
  input: PositionSyncInput,
): PositionSyncResult {
  const tempo = Math.max(1, Math.round(input.tempo));
  const signature = {
    top: Math.max(1, Math.round(input.signature.top)),
    bottom: Math.max(1, Math.round(input.signature.bottom)),
  };
  const tick = Number.isFinite(input.tick) ? input.tick : 0;
  const barStartTick = Number.isFinite(input.barStartTickOverride)
    ? (input.barStartTickOverride as number)
    : Number.isFinite(input.beatInfo?.barStartTick)
      ? (input.beatInfo?.barStartTick as number)
      : Number.isFinite(input.beatInfo?.beatStartTick)
        ? (input.beatInfo?.beatStartTick as number)
        : 0;
  const beatStartTick = input.beatInfo?.beatStartTick ?? barStartTick;
  const effectiveTick = tick > 0 ? tick : beatStartTick;
  const division = input.division > 0 ? input.division : 480;
  const beatTicks = Math.max(1, Math.round((division * 4) / signature.bottom));
  const beatStates = computeLoopBeatStates(
    signature.top,
    barStartTick,
    beatTicks,
    input.loopRange,
  );
  const positionInBar = Math.max(0, effectiveTick - barStartTick);
  const beatIndexFromTick = Math.floor(positionInBar / beatTicks);
  const beatIndex =
    Number.isFinite(input.barStartTickOverride) || !input.beatInfo
      ? beatIndexFromTick
      : (input.beatInfo.beatIndex ?? beatIndexFromTick);
  const clampedBeatIndex = clampBeatIndex(beatIndex, signature.top);
  const beatOffsetTicks = positionInBar - clampedBeatIndex * beatTicks;
  const beatSeconds = (60 / tempo) * (4 / signature.bottom);
  const steps =
    input.subdivisionsEnabled && input.subdivisionsValue > 0
      ? input.subdivisionsValue + 1
      : 1;
  const subTicks = beatTicks / steps;
  const subIndex = Math.floor(beatOffsetTicks / subTicks);
  const subOffsetTicks = beatOffsetTicks - subIndex * subTicks;
  let startDelayMs = 0;
  let startBeatIndex = clampedBeatIndex;
  let startSubIndex = Math.max(0, Math.min(steps - 1, subIndex));
  if (subOffsetTicks > 0) {
    const remainingTicks = subTicks - subOffsetTicks;
    const subSeconds = beatSeconds / steps;
    startDelayMs = (remainingTicks / subTicks) * subSeconds * 1000;
    let nextSubIndex = subIndex + 1;
    let nextBeatIndex = clampedBeatIndex;
    if (nextSubIndex >= steps) {
      nextSubIndex = 0;
      nextBeatIndex = (clampedBeatIndex + 1) % signature.top;
    }
    startBeatIndex = Math.max(0, Math.min(signature.top - 1, nextBeatIndex));
    startSubIndex = Math.max(0, Math.min(steps - 1, nextSubIndex));
  }
  if (input.loopRange && beatStates[startBeatIndex] === 'mute') {
    const { index, skipped } = findNextUnmutedBeat(beatStates, startBeatIndex);
    if (skipped > 0 && skipped < beatStates.length) {
      startBeatIndex = index;
      startSubIndex = 0;
      startDelayMs += skipped * beatSeconds * 1000;
    }
  }
  return {
    tempo,
    signature,
    startBeatIndex,
    startSubIndex,
    startDelayMs,
    beatStates,
    barStartTick: Number.isFinite(barStartTick) ? barStartTick : null,
    effectiveTick,
  };
}
