import type { AlphaTabBeatInfo, AlphaTabTrack } from './types';
import { resolveTimeSignatureFromSource } from './utils';
import type { PlayerState } from './playerState';
import {
  getCurrentCursorRectInternal,
  normalizeBeatCacheTick,
  readCurrentBeat,
  readCurrentTickPosition,
  resolveMasterBarBounds,
} from './playerHelpers';

export function resolveBeatStartTick(
  s: PlayerState,
  beat: unknown,
): number | null {
  const beatAny = beat as {
    absolutePlaybackStart?: number;
    playbackStart?: number;
    start?: number;
    voice?: { bar?: { masterBar?: unknown } };
  } | null;
  const tickCache =
    (s.api as { tickCache?: { getBeatStart?: (beat: unknown) => number } })
      .tickCache ?? null;
  const cacheStart = tickCache?.getBeatStart?.(beat);
  if (typeof cacheStart === 'number' && Number.isFinite(cacheStart)) {
    return normalizeBeatCacheTick(s, cacheStart, beat);
  }
  if (beatAny && typeof beatAny.absolutePlaybackStart === 'number') {
    const masterBarBds = resolveMasterBarBounds(
      s,
      beatAny.voice?.bar?.masterBar ?? null,
    );
    if (
      masterBarBds &&
      typeof beatAny.playbackStart === 'number' &&
      Number.isFinite(beatAny.playbackStart)
    ) {
      return Math.max(
        0,
        Math.round(masterBarBds.start + beatAny.playbackStart),
      );
    }
    return Math.max(
      0,
      Math.round(beatAny.absolutePlaybackStart - s.midiTickShift),
    );
  }
  if (beatAny && typeof beatAny.playbackStart === 'number') {
    const readMbStart = (bar: unknown): number | null => {
      const barAny = bar as
        | { start?: number; startTick?: number; tick?: number }
        | undefined;
      if (!barAny) {
        return null;
      }
      const raw = barAny.start ?? barAny.startTick ?? barAny.tick;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return null;
      }
      return Math.max(0, Math.round(raw - s.midiTickShift));
    };
    const masterBarStart = readMbStart(beatAny.voice?.bar?.masterBar ?? null);
    if (typeof masterBarStart === 'number') {
      return Math.max(0, Math.round(masterBarStart + beatAny.playbackStart));
    }
    return Math.max(0, Math.round(beatAny.playbackStart - s.midiTickShift));
  }
  if (beatAny && typeof beatAny.start === 'number') {
    return Math.max(0, Math.round(beatAny.start - s.midiTickShift));
  }
  return null;
}

export function resolveBarIndexFromBeat(beat: unknown): number | null {
  const bar = (
    beat as {
      voice?: { bar?: { index?: number; masterBar?: { index?: number } } };
    }
  )?.voice?.bar;
  const masterIndex =
    typeof bar?.masterBar?.index === 'number' ? bar.masterBar.index : null;
  if (masterIndex !== null) {
    return masterIndex;
  }
  return typeof bar?.index === 'number' ? bar.index : null;
}

function resolveBeatIndex(beat: unknown): number | null {
  const beatAny = beat as {
    index?: number;
    beatIndex?: number;
    voice?: { beats?: unknown[] };
  };
  const index =
    Number.isFinite(beatAny.index) && beatAny.index !== null
      ? Number(beatAny.index)
      : Number.isFinite(beatAny.beatIndex)
        ? Number(beatAny.beatIndex)
        : null;
  if (index !== null) {
    return Math.max(0, Math.round(index));
  }
  const beats = beatAny.voice?.beats;
  if (Array.isArray(beats)) {
    const found = beats.indexOf(beat);
    if (found >= 0) {
      return found;
    }
  }
  return null;
}

function resolveBeatDurationTicks(beat: unknown): number | null {
  const beatAny = beat as {
    playbackDuration?: number;
    displayDuration?: number;
    duration?: number;
  };
  const candidate =
    beatAny.playbackDuration ?? beatAny.displayDuration ?? beatAny.duration;
  if (
    typeof candidate === 'number' &&
    Number.isFinite(candidate) &&
    candidate > 0
  ) {
    return Math.round(candidate);
  }
  return null;
}

function resolveMasterBarFromBeat(beat: unknown): unknown | null {
  const bar = (
    beat as {
      voice?: { bar?: { masterBar?: unknown } };
    }
  )?.voice?.bar;
  const masterBar = (bar as { masterBar?: unknown } | null | undefined)
    ?.masterBar;
  return masterBar ?? bar ?? null;
}

function resolveBarStartTickFromBeat(
  s: PlayerState,
  beat: unknown,
): number | null {
  const masterBar = resolveMasterBarFromBeat(beat);
  if (!masterBar) {
    return null;
  }
  const bounds = resolveMasterBarBounds(s, masterBar);
  return bounds ? bounds.start : null;
}

function resolveTimeSignatureFromBeat(
  beat: unknown,
): { top: number; bottom: number } | null {
  const masterBar = resolveMasterBarFromBeat(beat);
  if (!masterBar) {
    return null;
  }
  return resolveTimeSignatureFromSource(masterBar);
}

function findBeatAtTick(s: PlayerState, tick: number): unknown | null {
  if (!Number.isFinite(tick)) {
    return null;
  }
  const tickCache =
    (
      s.api as {
        tickCache?: {
          findBeat?: (
            tracks: Set<number>,
            tick: number,
          ) => { beat?: unknown } | null;
        };
      }
    ).tickCache ?? null;
  if (!tickCache?.findBeat) {
    return null;
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  const tracks =
    ((score?.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [];
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
  const rawTick = Math.max(0, Math.round(tick + s.midiTickShift));
  const result = tickCache.findBeat(trackIndexes, rawTick);
  return result?.beat ?? null;
}

export function resolveTimeSignatureAtTick(
  s: PlayerState,
  tick: number,
): { top: number; bottom: number } | null {
  if (!Number.isFinite(tick)) {
    return null;
  }
  const readTimeSignature = (
    source: unknown,
  ): { top: number; bottom: number } | null => {
    const barAny = source as
      | {
          timeSignatureNumerator?: number;
          timeSignatureDenominator?: number;
          timeSignature?: { numerator?: number; denominator?: number };
        }
      | undefined;
    if (!barAny) {
      return null;
    }
    const top =
      barAny.timeSignatureNumerator ?? barAny.timeSignature?.numerator;
    const bottom =
      barAny.timeSignatureDenominator ?? barAny.timeSignature?.denominator;
    if (typeof top !== 'number' || typeof bottom !== 'number') {
      return null;
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
      return null;
    }
    return {
      top: Math.max(1, Math.min(32, Math.round(top))),
      bottom: [1, 2, 4, 8, 16, 32].includes(Math.round(bottom))
        ? Math.round(bottom)
        : 4,
    };
  };
  if (s.transportState !== 'stopped') {
    const beat = readCurrentBeat(s);
    const bar = (beat as { voice?: { bar?: unknown } } | undefined)?.voice?.bar;
    const masterBar = (bar as { masterBar?: unknown } | undefined)?.masterBar;
    const fromBeat =
      readTimeSignature(masterBar) ??
      readTimeSignature(bar) ??
      readTimeSignature(beat);
    if (fromBeat) {
      return fromBeat;
    }
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  const masterBars =
    (score as { masterBars?: unknown[] } | null)?.masterBars ?? [];
  let lastTimeSignature: { top: number; bottom: number } | null = null;
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
      lastTimeSignature = readTimeSignature(masterBar) ?? { top: 4, bottom: 4 };
    }
    if (tick >= start && (end === null || tick < end)) {
      return readTimeSignature(masterBar) ?? { top: 4, bottom: 4 };
    }
  }
  return lastTimeSignature ?? { top: 4, bottom: 4 };
}

export function getCurrentBeatInfoInternal(
  s: PlayerState,
): AlphaTabBeatInfo | null {
  const tick = readCurrentTickPosition(s) ?? 0;
  const beat = s.playing
    ? (findBeatAtTick(s, tick) ?? readCurrentBeat(s))
    : ((() => {
        const cursorRect = getCurrentCursorRectInternal(s);
        return cursorRect && Number.isFinite(cursorRect.left)
          ? (s.api.getBeatAtPosition?.(
              cursorRect.left + 1,
              cursorRect.top + cursorRect.height / 2,
            ) ?? null)
          : null;
      })() ?? readCurrentBeat(s));
  if (!beat) {
    return null;
  }
  const beatStartTick = resolveBeatStartTick(s, beat);
  const currentTick = tick > 0 ? tick : (beatStartTick ?? 0);
  const timeSignature = resolveTimeSignatureFromBeat(beat) ??
    resolveTimeSignatureAtTick(s, currentTick) ?? {
      top: 4,
      bottom: 4,
    };
  return {
    beat,
    barIndex: resolveBarIndexFromBeat(beat),
    barStartTick: resolveBarStartTickFromBeat(s, beat),
    beatIndex: resolveBeatIndex(beat),
    beatStartTick,
    beatDurationTicks: resolveBeatDurationTicks(beat),
    timeSignature,
    currentTick,
  };
}
