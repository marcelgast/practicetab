import { setLoopRangeMs } from '../audioTabCommands';
import { tickToMs } from './tempoMap';
import type { PlayerState } from './playerState';
import { normalizeBarCacheTick, normalizeBeatCacheTick } from './playerHelpers';

export function setPlaybackRangeFromBeats(
  s: PlayerState,
  startBeat: unknown,
  endBeat: unknown,
): boolean {
  if (!startBeat || !endBeat) {
    return false;
  }
  const tickCache = (s.api as { tickCache?: unknown }).tickCache as
    | {
        getBeatStart?: (beat: unknown) => number;
        findBeat?: (
          tracks: Set<number>,
          tick: number,
        ) => {
          beatLookup?: { duration?: number };
          tickDuration?: number;
        } | null;
        getMasterBar?: (bar: unknown) => { start: number; end: number };
      }
    | undefined;
  const score = s.cachedScore ?? s.api.score ?? null;
  if (!tickCache?.getBeatStart) {
    return false;
  }
  const startTickRaw = tickCache.getBeatStart(startBeat);
  const endTickRaw = tickCache.getBeatStart(endBeat);
  const startTick = normalizeBeatCacheTick(s, startTickRaw, startBeat);
  const endTickBase = normalizeBeatCacheTick(s, endTickRaw, endBeat);
  const resolveBeatEndRaw = (): number => {
    if (!tickCache.getMasterBar) {
      return 0;
    }
    const masterBars = (score?.masterBars as unknown[] | undefined) ?? [];
    // A drag that lands exactly on a bar boundary (e.g. beat 1 of the next
    // bar) used to fall into the next bar's lookup and get extended by one
    // metric beat — so the loop ran a beat past where the user released
    // and the last eighth of the previous bar got clipped on wrap-around.
    // If endTickBase equals a master-bar start tick, the user's release
    // point IS the boundary; the loop ends there, nothing more.
    for (const masterBar of masterBars) {
      const lu = tickCache.getMasterBar(masterBar);
      if (!lu) {
        continue;
      }
      const barStartRaw = normalizeBarCacheTick(s, lu.start, masterBar);
      if (endTickBase === barStartRaw) {
        return barStartRaw;
      }
    }
    for (const masterBar of masterBars) {
      const lu = tickCache.getMasterBar(masterBar);
      if (!lu) {
        continue;
      }
      const barStartRaw = normalizeBarCacheTick(s, lu.start, masterBar);
      const barEndRaw = normalizeBarCacheTick(s, lu.end, masterBar);
      if (endTickBase < barStartRaw || endTickBase >= barEndRaw) {
        continue;
      }
      const barAny = masterBar as
        | {
            timeSignatureNumerator?: number;
            timeSignature?: { numerator?: number };
          }
        | undefined;
      const top =
        barAny?.timeSignatureNumerator ?? barAny?.timeSignature?.numerator;
      const numerator =
        typeof top === 'number' && Number.isFinite(top)
          ? Math.max(1, Math.min(32, Math.round(top)))
          : 4;
      const beatLen = (barEndRaw - barStartRaw) / numerator;
      if (!Number.isFinite(beatLen) || beatLen <= 0) {
        return 0;
      }
      const beatIndex = Math.min(
        numerator - 1,
        Math.max(0, Math.floor((endTickBase - barStartRaw) / beatLen)),
      );
      return Math.round(barStartRaw + (beatIndex + 1) * beatLen);
    }
    return 0;
  };
  const snappedEndRaw = resolveBeatEndRaw();
  const endDuration =
    (endBeat as { playbackDuration?: number })?.playbackDuration ??
    (endBeat as { displayDuration?: number })?.displayDuration ??
    (endBeat as { duration?: number })?.duration ??
    0;
  const endDurationTicks =
    typeof endDuration === 'number' &&
    Number.isFinite(endDuration) &&
    endDuration > 0
      ? Math.round(endDuration)
      : 0;
  const computedEnd =
    snappedEndRaw > 0
      ? snappedEndRaw
      : endTickBase + Math.max(1, endDurationTicks);
  const rangeStart = Math.min(startTick, endTickBase);
  const rangeEnd = Math.max(startTick, computedEnd);
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
    return false;
  }
  s.api.playbackRange = {
    startTick: Math.max(0, Math.floor(rangeStart)),
    endTick: Math.max(1, Math.floor(rangeEnd)),
  };
  const startMs = tickToMs(rangeStart, s.midiDivision, s.tempoMap);
  const endMs = tickToMs(rangeEnd, s.midiDivision, s.tempoMap);
  s.loopRangeMs = { startMs, endMs };
  s.loopRangeTicks = {
    start: Math.max(0, Math.floor(rangeStart)),
    end: Math.max(1, Math.floor(rangeEnd)),
  };
  void setLoopRangeMs(startMs, endMs);
  return true;
}

export function setPlaybackRangeFromBarIndex(
  s: PlayerState,
  startIndex: number,
  endIndex: number,
): boolean {
  const score = s.cachedScore ?? s.api.score ?? null;
  const masterBars = (score?.masterBars as unknown[] | undefined) ?? [];
  const tickCache = (s.api as { tickCache?: unknown }).tickCache as
    | { getMasterBar?: (bar: unknown) => { start: number; end: number } }
    | undefined;
  if (!tickCache?.getMasterBar) {
    return false;
  }
  const startBar = masterBars[startIndex] ?? null;
  const endBar = masterBars[endIndex] ?? null;
  if (!startBar || !endBar) {
    return false;
  }
  const startLookup = tickCache.getMasterBar(startBar);
  const endLookup = tickCache.getMasterBar(endBar);
  if (!startLookup || !endLookup) {
    return false;
  }
  const rangeStart = Math.min(
    normalizeBarCacheTick(s, startLookup.start, startBar),
    normalizeBarCacheTick(s, endLookup.start, endBar),
  );
  const rangeEnd = Math.max(
    normalizeBarCacheTick(s, endLookup.end, endBar),
    normalizeBarCacheTick(s, startLookup.end, startBar),
  );
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
    return false;
  }
  s.api.playbackRange = {
    startTick: Math.max(0, Math.floor(rangeStart)),
    endTick: Math.max(1, Math.floor(rangeEnd)),
  };
  const startMs = tickToMs(rangeStart, s.midiDivision, s.tempoMap);
  const endMs = tickToMs(rangeEnd, s.midiDivision, s.tempoMap);
  s.loopRangeMs = { startMs, endMs };
  s.loopRangeTicks = {
    start: Math.max(0, Math.floor(rangeStart)),
    end: Math.max(1, Math.floor(rangeEnd)),
  };
  void setLoopRangeMs(startMs, endMs);
  return true;
}
