import type { AlphaTabTrack } from './types';
import type { ATBar, ATVoice, ATBeat, ATNote } from './alphaTabTypes';
import { safeArray, safeTrackStaves } from './utils';
import type { PlayerState } from './playerState';
import { resolveBeatStartTick } from './playerBeatResolvers';

export function getBeatAtPosition(
  s: PlayerState,
  x: number,
  y: number,
): unknown | null {
  const { api } = s;
  const renderer = (api as { renderer?: { boundsLookup?: unknown } }).renderer;
  const lookup = renderer?.boundsLookup as
    | {
        getBeatAtPos?: (x: number, y: number) => unknown | null;
        staffSystems?: Array<{
          realBounds?: { x: number; y: number; w: number; h: number };
          visualBounds?: { x: number; y: number; w: number; h: number };
          findBarAtPos?: (x: number) => { index?: number } | null;
        }>;
      }
    | undefined;
  const directBeat = lookup?.getBeatAtPos?.(x, y) ?? null;
  if (directBeat) {
    return directBeat;
  }
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
  const barIndex =
    typeof barBounds?.index === 'number' ? barBounds.index : null;
  if (barIndex === null) {
    return null;
  }
  const score = s.cachedScore ?? api.score ?? null;
  const tracks =
    ((score?.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [];
  const findBeatInTrack = (track: {
    staves?: Array<{
      bars?: Array<{ voices?: Array<{ beats?: Array<unknown> }> }>;
    }>;
  }): unknown | null => {
    const staves = safeTrackStaves(track);
    for (const staff of staves) {
      const bar = safeArray<ATBar>(() => staff?.bars)[barIndex];
      const voices = safeArray<ATVoice>(() => bar?.voices);
      for (const voice of voices) {
        const beats = safeArray<ATBeat>(() => voice?.beats);
        if (beats.length > 0) {
          return beats[0];
        }
      }
    }
    return null;
  };
  if (typeof s.activeTrackIndex === 'number') {
    const activeTrack = tracks.find(
      (track: AlphaTabTrack, idx: number) =>
        s.activeTrackIndex === idx ||
        (typeof track.index === 'number' && track.index === s.activeTrackIndex),
    );
    const beat = activeTrack ? findBeatInTrack(activeTrack) : null;
    if (beat) {
      return beat;
    }
  }
  for (const track of tracks) {
    const beat = findBeatInTrack(track);
    if (beat) {
      return beat;
    }
  }
  const tickCache = (api as { tickCache?: unknown }).tickCache as
    | {
        findBeat?: (
          tracks: Set<number>,
          tick: number,
        ) => { beat?: unknown } | null;
        getMasterBarStart?: (bar: unknown) => number;
        getMasterBar?: (bar: unknown) => {
          firstBeat?: {
            getVisibleBeatAtStart?: (tracks: Set<number>) => unknown | null;
          } | null;
        } | null;
      }
    | undefined;
  const masterBars = (score?.masterBars as unknown[] | undefined) ?? [];
  const masterBar = masterBars[barIndex] ?? null;
  if (tickCache?.findBeat && tickCache.getMasterBarStart && masterBar) {
    const startTick = tickCache.getMasterBarStart(masterBar);
    const trackIndexes = buildTrackIndexSet(s, tracks);
    const result = tickCache.findBeat(trackIndexes, startTick);
    if (result?.beat) {
      return result.beat;
    }
  }
  if (tickCache?.getMasterBar && masterBar) {
    const trackIndexes = buildTrackIndexSet(s, tracks);
    const masterBarLookup = tickCache.getMasterBar(masterBar);
    const beatFromLookup =
      masterBarLookup?.firstBeat?.getVisibleBeatAtStart?.(trackIndexes) ?? null;
    if (beatFromLookup) {
      return beatFromLookup;
    }
  }
  return null;
}

export function buildTrackIndexSet(
  s: PlayerState,
  tracks: AlphaTabTrack[],
): Set<number> {
  const trackIndexes = new Set<number>();
  if (typeof s.activeTrackIndex === 'number') {
    trackIndexes.add(s.activeTrackIndex);
  } else {
    tracks.forEach((track: AlphaTabTrack, idx: number) => {
      if (typeof track.index === 'number') {
        trackIndexes.add(track.index);
        return;
      }
      trackIndexes.add(idx);
    });
  }
  return trackIndexes;
}

export function getFirstNoteTick(s: PlayerState): number | null {
  const score = (s.cachedScore ?? s.api.score ?? null) as {
    tracks?: AlphaTabTrack[];
  } | null;
  if (!score?.tracks?.length) {
    return null;
  }
  let minTick: number | null = null;
  (score.tracks as AlphaTabTrack[]).forEach((track) => {
    if (!track) {
      return;
    }
    safeTrackStaves(track).forEach((staff) => {
      safeArray<ATBar>(() => staff.bars).forEach((bar) => {
        safeArray<ATVoice>(() => bar.voices).forEach((voice) => {
          safeArray<ATBeat>(() => voice.beats).forEach((beat) => {
            if (beat?.isRest) {
              return;
            }
            const notes = safeArray<ATNote>(() => beat?.notes);
            const hasNote =
              notes.length === 0
                ? !beat?.isRest
                : notes.some((note) => !note?.isRest);
            if (!hasNote) {
              return;
            }
            const tick = resolveBeatStartTick(s, beat);
            if (typeof tick !== 'number') {
              return;
            }
            if (minTick === null || tick < minTick) {
              minTick = tick;
            }
          });
        });
      });
    });
  });
  return minTick;
}

export function getFirstTrackWithNotesIndex(s: PlayerState): number | null {
  const score = (s.cachedScore ?? s.api.score ?? null) as {
    tracks?: AlphaTabTrack[];
  } | null;
  if (!score?.tracks?.length) {
    return null;
  }
  for (let idx = 0; idx < score.tracks.length; idx += 1) {
    const track = score.tracks[idx];
    if (!track) {
      continue;
    }
    let hasPlayableNote = false;
    safeTrackStaves(track).forEach((staff) => {
      safeArray<ATBar>(() => staff.bars).forEach((bar) => {
        safeArray<ATVoice>(() => bar.voices).forEach((voice) => {
          safeArray<ATBeat>(() => voice.beats).forEach((beat) => {
            if (hasPlayableNote || beat?.isRest) {
              return;
            }
            const notes = safeArray<ATNote>(() => beat?.notes);
            const hasNote =
              notes.length === 0
                ? !beat?.isRest
                : notes.some((note) => !note?.isRest);
            if (hasNote) {
              hasPlayableNote = true;
            }
          });
        });
      });
    });
    if (!hasPlayableNote) {
      continue;
    }
    return typeof track.index === 'number' && Number.isFinite(track.index)
      ? track.index
      : idx;
  }
  return null;
}
