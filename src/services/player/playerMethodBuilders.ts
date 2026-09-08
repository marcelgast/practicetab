import type { AlphaTabTrack } from './types';
import { resolveTimeSignatureFromSource } from './utils';
import { hasMeaningfulTempoChanges } from './tempoMap';
import type { PlayerState } from './playerState';
import { normalizeBarCacheTick, resolveMasterBarBounds } from './playerHelpers';

export {
  getBeatAtPosition,
  getFirstNoteTick,
  getFirstTrackWithNotesIndex,
} from './playerTrackQueries';

export {
  setPlaybackRangeFromBeats,
  setPlaybackRangeFromBarIndex,
} from './playerPlaybackRange';

export function getBarTimeSignature(
  s: PlayerState,
  barIndex: number,
): { top: number; bottom: number } | null {
  if (!Number.isFinite(barIndex)) {
    return null;
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  const masterBars = (score?.masterBars as unknown[] | undefined) ?? [];
  const mb = masterBars[barIndex] ?? null;
  if (!mb) {
    return null;
  }
  return resolveTimeSignatureFromSource(mb);
}

export function hasTempoChangesCheck(s: PlayerState): boolean {
  return hasMeaningfulTempoChanges(s.tempoMap);
}

export function getBarStartTick(
  s: PlayerState,
  barIndex: number,
): number | null {
  if (!Number.isFinite(barIndex)) {
    return null;
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  const masterBars = (score?.masterBars as unknown[] | undefined) ?? [];
  const masterBar = masterBars[barIndex] ?? null;
  if (!masterBar) {
    return null;
  }
  const tickCache =
    (s.api as { tickCache?: { getMasterBarStart?: (bar: unknown) => number } })
      .tickCache ?? null;
  const rawTick =
    s.tickCacheRef?.getMasterBarStart?.(masterBar) ??
    tickCache?.getMasterBarStart?.(masterBar);
  if (typeof rawTick !== 'number' || !Number.isFinite(rawTick)) {
    return null;
  }
  return normalizeBarCacheTick(s, rawTick, masterBar);
}

export function getBarRangeTicks(
  s: PlayerState,
  barIndex: number,
): { start: number; end: number } | null {
  if (!Number.isFinite(barIndex)) {
    return null;
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  const masterBars = (score?.masterBars as unknown[] | undefined) ?? [];
  const masterBar = masterBars[barIndex] ?? null;
  if (!masterBar) {
    return null;
  }
  const tickCache =
    (
      s.api as {
        tickCache?: {
          getMasterBar?: (bar: unknown) => { start: number; end: number };
        };
      }
    ).tickCache ?? null;
  const lookup = tickCache?.getMasterBar?.(masterBar) ?? null;
  if (!lookup) {
    return null;
  }
  const start = normalizeBarCacheTick(s, lookup.start, masterBar);
  const end = normalizeBarCacheTick(s, lookup.end, masterBar);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { start, end };
}

export function getBeatDurationTicksAtTick(
  s: PlayerState,
  tick: number,
): number | null {
  if (!Number.isFinite(tick)) {
    return null;
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  const tracks =
    ((score?.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [];
  const tickCache = (s.api as { tickCache?: unknown }).tickCache as
    | {
        findBeat?: (
          tracks: Set<number>,
          tick: number,
        ) => {
          beatLookup?: { duration?: number };
          tickDuration?: number;
        } | null;
      }
    | undefined;
  if (!tickCache?.findBeat) {
    return null;
  }
  const trackIndexes = new Set<number>();
  if (typeof s.activeTrackIndex === 'number') {
    trackIndexes.add(s.activeTrackIndex);
  } else {
    tracks.forEach((track: AlphaTabTrack, idx: number) => {
      if (!track) {
        return;
      }
      if (typeof track.index === 'number') {
        trackIndexes.add(track.index);
        return;
      }
      trackIndexes.add(idx);
    });
  }
  const rawTick = tick + s.midiTickShift;
  const lookup = tickCache.findBeat(trackIndexes, rawTick);
  const duration = lookup?.beatLookup?.duration ?? lookup?.tickDuration ?? 0;
  if (!Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return duration;
}

export function getBarStartTickAtTick(
  s: PlayerState,
  tick: number,
): number | null {
  if (!Number.isFinite(tick)) {
    return null;
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  const masterBars = (score?.masterBars as unknown[] | undefined) ?? [];
  let lastStart: number | null = null;
  for (let i = 0; i < masterBars.length; i += 1) {
    const masterBar = masterBars[i];
    const nextMasterBar = masterBars[i + 1] ?? null;
    const bounds = resolveMasterBarBounds(
      s,
      masterBar,
      nextMasterBar ?? undefined,
    );
    if (!bounds) {
      continue;
    }
    const { start, end } = bounds;
    if (tick >= start) {
      lastStart = start;
    }
    if (tick >= start && (end === null || tick < end)) {
      return start;
    }
  }
  return lastStart;
}

export function getBarIndexAtPosition(
  s: PlayerState,
  x: number,
  y: number,
): number | null {
  const renderer = (s.api as { renderer?: { boundsLookup?: unknown } })
    .renderer;
  const lookup = renderer?.boundsLookup as
    | {
        staffSystems?: Array<{
          realBounds?: { x: number; y: number; w: number; h: number };
          visualBounds?: { x: number; y: number; w: number; h: number };
          findBarAtPos?: (x: number) => { index?: number } | null;
        }>;
      }
    | undefined;
  const systems = lookup?.staffSystems ?? [];
  const system = systems.find((item) => {
    const bounds = item.realBounds ?? item.visualBounds;
    if (!bounds) {
      return false;
    }
    return y >= bounds.y && y <= bounds.y + bounds.h;
  });
  if (!system?.findBarAtPos) {
    return null;
  }
  const barBounds = system.findBarAtPos(x);
  return typeof barBounds?.index === 'number' ? barBounds.index : null;
}

export function getBarBoundsByIndex(
  s: PlayerState,
  index: number,
): { x: number; y: number; w: number; h: number } | null {
  const renderer = (s.api as { renderer?: { boundsLookup?: unknown } })
    .renderer;
  const lookup = renderer?.boundsLookup as
    | {
        findMasterBarByIndex?: (index: number) => {
          visualBounds?: { x: number; y: number; w: number; h: number };
          realBounds?: { x: number; y: number; w: number; h: number };
          lineAlignedBounds?: { x: number; y: number; w: number; h: number };
        } | null;
      }
    | undefined;
  const bounds = lookup?.findMasterBarByIndex?.(index) ?? null;
  const rect =
    bounds?.visualBounds ?? bounds?.lineAlignedBounds ?? bounds?.realBounds;
  if (!rect) {
    return null;
  }
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}
