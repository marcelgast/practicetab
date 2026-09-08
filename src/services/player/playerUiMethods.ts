import { selectNearestBeat, type BeatRect } from '../../domain/beatSnap';
import { clearLoopRange, setLoopRangeMs } from '../audioTabCommands';
import type { AlphaTabTrack } from './types';
import { getRectThreshold } from './utils';
import { tickToMs } from './tempoMap';
import type { PlayerState } from './playerState';
import { safeTrackIndex } from './playerState';
import {
  applyPlayheadMs,
  emitCursorRect,
  hasPlayerBeat,
  readCurrentBeat,
} from './playerHelpers';
import { resolveBeatStartTick } from './playerBeatResolvers';
import { applyStaffVisibility, renderSelectedTracks } from './playerScoreLoad';
import { buildVibratoWindows } from './vibrato';
import {
  buildBeatRectsByStartMs,
  type BeatBoundsLookup,
} from './beatRectIndex';
import { buildBeatNotesByStartMs } from './beatNotesIndex';

export function playerSeekToStart(
  s: PlayerState,
  opts?: { soft?: boolean },
  refreshLayout?: () => void,
): void {
  const { api } = s;
  const canSetTick = hasPlayerBeat(s) || !api.player;
  if (canSetTick) {
    try {
      api.tickPosition = 0;
    } catch {
      /* ignore */
    }
  }
  if (opts?.soft === false && refreshLayout) {
    refreshLayout();
  }
  emitCursorRect(s);
  applyPlayheadMs(s, 0, true);
  s.transportState = 'stopped';
}

export function playerRefreshBeatCache(s: PlayerState): void {
  const { api, container } = s;
  const containerRect = container.getBoundingClientRect();
  const nodes = container.querySelectorAll<HTMLElement>('.at-beat, .at-note');
  const rects: BeatRect[] = [];
  nodes.forEach((node) => {
    const r = node.getBoundingClientRect();
    if (r.height <= 0 || r.width <= 0) {
      return;
    }
    const left = r.left - containerRect.left;
    const top = r.top - containerRect.top;
    rects.push({
      systemIndex: 0,
      left,
      top,
      width: r.width,
      height: r.height,
      centerX: left + r.width / 2,
      centerY: top + r.height / 2,
    });
  });
  rects.sort((a, b) => a.centerY - b.centerY);
  let systemIndex = -1;
  let lastY = Number.NEGATIVE_INFINITY;
  rects.forEach((r) => {
    const threshold = getRectThreshold(new DOMRect(0, 0, r.width, r.height));
    if (Math.abs(r.centerY - lastY) > threshold) {
      systemIndex += 1;
      lastY = r.centerY;
    }
    r.systemIndex = systemIndex;
  });
  s.beatRects = rects;
  const score = s.cachedScore ?? api.score ?? null;
  const tickCache =
    (
      api as {
        tickCache?: {
          getBeatStart?: (beat: unknown) => number;
          getMasterBar?: (bar: unknown) => { start: number; end: number };
        };
      }
    ).tickCache ?? null;
  if (score && tickCache?.getBeatStart) {
    const beat = readCurrentBeat(s);
    const cacheStart = beat ? tickCache.getBeatStart(beat) : null;
    const absStart = (beat as { absolutePlaybackStart?: number } | null)
      ?.absolutePlaybackStart;
    const cacheLooksShifted =
      typeof cacheStart === 'number' &&
      typeof absStart === 'number' &&
      Math.abs(cacheStart - absStart) > s.midiDivision * 2;
    if (!s.vibratoWindowsTickCacheReady || cacheLooksShifted) {
      s.lastVibratoWindows = buildVibratoWindows({
        score,
        tempoMap: s.tempoMap,
        division: s.midiDivision,
        midiTickShift: s.midiTickShift,
        tickCache,
      });
      s.vibratoWindowsTickCacheReady = true;
    }
  }

  // Overlay cache (PR 3.6+): raw-1×-startMs → beat visualBounds.
  // Invariant across tempoFactor changes; consumers convert at lookup time.
  const boundsLookup =
    ((api as { renderer?: { boundsLookup?: unknown } }).renderer
      ?.boundsLookup as BeatBoundsLookup | null) ?? null;
  s.beatRectsByStartMs = buildBeatRectsByStartMs({
    score,
    tickCache,
    boundsLookup,
    midiDivision: s.midiDivision,
    tempoMap: s.tempoMap,
    midiTickShift: s.midiTickShift,
    activeTrackIndex: s.activeTrackIndex,
  });
  // Fretboard Panel cache (PR 4.2): share the same pass so both
  // caches refresh together. Build even when the rect-cache inputs
  // are missing — the notes index only needs `tickCache`, not the
  // renderer bounds lookup — so a headless test path still gets a
  // valid notes map.
  s.beatNotesByStartMs = buildBeatNotesByStartMs({
    score,
    tickCache,
    midiDivision: s.midiDivision,
    tempoMap: s.tempoMap,
    midiTickShift: s.midiTickShift,
    activeTrackIndex: s.activeTrackIndex,
  });
  s.options.onBeatCacheRefreshed?.(s.beatRectsByStartMs);
}

export function playerSnapToNearestBeat(
  s: PlayerState,
  contentX: number,
  contentY: number,
  getBeatAtPosition: (x: number, y: number) => unknown | null,
  refreshBeatCache: () => void,
  hitTestToCursorRect: (
    x: number,
    y: number,
  ) => { left: number; top: number; height: number } | null,
): {
  left: number;
  top: number;
  height: number;
  cursorMs?: number;
  cursorTick?: number;
} | null {
  let snappedMs: number | null = null;
  let snappedTick: number | null = null;
  try {
    const beat = getBeatAtPosition(contentX, contentY);
    if (beat) {
      const tick = resolveBeatStartTick(s, beat);
      if (typeof tick === 'number') {
        const ms = tickToMs(tick, s.midiDivision, s.tempoMap);
        if (s.playing) {
          s.lastAudioSyncMs = ms;
          s.lastAudioSyncAt = performance.now();
        }
        snappedMs = ms;
        snappedTick = tick;
      }
    }
  } catch {
    /* ignore */
  }
  if (s.beatRects.length === 0) {
    refreshBeatCache();
  }
  if (s.beatRects.length === 0) {
    const r = hitTestToCursorRect(contentX, contentY);
    if (!r) {
      return null;
    }
    return {
      left: r.left,
      top: r.top,
      height: r.height,
      cursorMs: snappedMs ?? undefined,
      cursorTick: snappedTick ?? undefined,
    };
  }
  const nearest = selectNearestBeat(s.beatRects, {
    x: contentX,
    y: contentY,
  });
  if (!nearest) {
    return null;
  }
  return {
    left: nearest.left,
    top: nearest.top,
    height: nearest.height,
    cursorMs: snappedMs ?? undefined,
    cursorTick: snappedTick ?? undefined,
  };
}

export function playerHitTestToCursorRect(
  s: PlayerState,
  contentX: number,
  contentY: number,
): { left: number; top: number; height: number } | null {
  const { api } = s;
  const anyApi = api as unknown as {
    hitTest?: (x: number, y: number) => unknown;
    scoreRenderer?: { hitTest?: (x: number, y: number) => unknown };
  };
  const result =
    anyApi.hitTest?.(contentX, contentY) ??
    anyApi.scoreRenderer?.hitTest?.(contentX, contentY);
  if (!result || typeof result !== 'object') {
    return null;
  }
  const resultObj = result as Record<string, unknown>;
  const bounds = resultObj.bounds ?? resultObj.rect ?? resultObj.region ?? null;
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }
  const raw = bounds as {
    x?: number;
    y?: number;
    left?: number;
    top?: number;
    height?: number;
    h?: number;
  };
  const left =
    typeof raw.x === 'number' && Number.isFinite(raw.x)
      ? raw.x
      : Number(raw.left ?? 0);
  const top =
    typeof raw.y === 'number' && Number.isFinite(raw.y)
      ? raw.y
      : Number(raw.top ?? 0);
  const height =
    typeof raw.height === 'number' && Number.isFinite(raw.height)
      ? raw.height
      : Number(raw.h ?? 0);
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  return { left, top, height };
}

export function playerSetLooping(s: PlayerState, isLooping: boolean): void {
  const { api } = s;
  s.loopEnabled = isLooping;
  if (api.player) {
    api.player.isLooping = isLooping;
  }
  if (!isLooping) {
    s.loopRangeMs = null;
    s.loopRangeTicks = null;
    void clearLoopRange();
    return;
  }
  if (s.loopRangeMs) {
    void setLoopRangeMs(s.loopRangeMs.startMs, s.loopRangeMs.endMs);
  }
}

export function playerHighlightPlaybackRange(
  s: PlayerState,
  startBeat: unknown,
  endBeat: unknown,
): void {
  const { api } = s;
  const anyApi = api as unknown as {
    highlightPlaybackRange?: (s: unknown, e: unknown) => void;
    player?: unknown;
  };
  if (!startBeat || !endBeat) {
    return;
  }
  if (anyApi.player && !hasPlayerBeat(s)) {
    return;
  }
  try {
    anyApi.highlightPlaybackRange?.(startBeat, endBeat);
  } catch {
    /* ignore */
  }
}

export function playerApplyPlaybackRangeFromHighlight(s: PlayerState): void {
  const { api } = s;
  const anyApi = api as unknown as {
    applyPlaybackRangeFromHighlight?: () => void;
    player?: unknown;
  };
  if (anyApi.player && !hasPlayerBeat(s)) {
    return;
  }
  try {
    anyApi.applyPlaybackRangeFromHighlight?.();
  } catch {
    /* ignore */
  }
}

export function playerClearPlaybackRangeHighlight(s: PlayerState): void {
  (
    s.api as unknown as { clearPlaybackRangeHighlight?: () => void }
  ).clearPlaybackRangeHighlight?.();
}

export function playerClearPlaybackRange(s: PlayerState): void {
  const { api } = s;
  if ('playbackRange' in api) {
    (api as { playbackRange: unknown }).playbackRange = null;
  }
  s.loopRangeMs = null;
  s.loopRangeTicks = null;
  void clearLoopRange();
}

export function playerSetVisibleTracks(
  s: PlayerState,
  indexes: number[],
): void {
  const { api } = s;
  const validIndexes = new Set<number>(
    (
      (s.cachedTracks.length > 0
        ? s.cachedTracks
        : ((api.tracks ?? []) as AlphaTabTrack[])) ?? []
    )
      .filter(Boolean)
      .map((track, idx) => safeTrackIndex(track, idx)),
  );
  s.selectedRenderTrackIndexes = indexes.filter((idx) => validIndexes.has(idx));
  applyStaffVisibility(s, s.standardNotationEnabled);
  renderSelectedTracks(s);
}

export function playerSetActiveTrack(
  s: PlayerState,
  index: number | null,
): void {
  const { api } = s;
  if (s.isScoreLoading) {
    s.pendingActiveTrackIndex = index;
    s.activeTrackIndex = index;
    s.selectedRenderTrackIndexes = index === null ? null : [index];
    return;
  }
  const validIndexes = new Set<number>(
    (
      (s.cachedTracks.length > 0
        ? s.cachedTracks
        : ((api.tracks ?? []) as AlphaTabTrack[])) ?? []
    )
      .filter(Boolean)
      .map((track, idx) => safeTrackIndex(track, idx)),
  );
  const normalizedIndex =
    index !== null && validIndexes.has(index) ? index : null;
  s.activeTrackIndex = normalizedIndex;
  s.selectedRenderTrackIndexes =
    normalizedIndex === null ? null : [normalizedIndex];
  applyStaffVisibility(s, s.standardNotationEnabled);
  renderSelectedTracks(s);
}

export function playerSetShowStandardNotation(
  s: PlayerState,
  enabled: boolean,
): void {
  s.standardNotationEnabled = enabled;
  applyStaffVisibility(s, enabled);
  renderSelectedTracks(s);
}
