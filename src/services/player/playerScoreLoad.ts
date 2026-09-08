import type { AlphaTabTrack } from './types';
import type { PlayerState } from './playerState';
import { safeTrackIndex } from './playerState';
import { devLog } from './playerHelpers';

export { rebuildMidi } from './playerMidiRebuild';

export function applyStaffVisibility(s: PlayerState, enabled: boolean): void {
  let percussionForcedCount = 0;
  const applyTrack = (track: AlphaTabTrack | null | undefined) => {
    if (!track) {
      return;
    }
    let staves: Array<{ showStandardNotation?: boolean }> | undefined;
    try {
      staves = (track as { staves?: unknown }).staves as
        | Array<{ showStandardNotation?: boolean }>
        | undefined;
    } catch {
      return;
    }
    if (!Array.isArray(staves)) {
      return;
    }
    let trackIsPercussion = false;
    try {
      trackIsPercussion =
        (track as { isPercussion?: unknown }).isPercussion === true;
    } catch {
      trackIsPercussion = false;
    }
    staves.forEach((staff) => {
      if (!staff) {
        return;
      }
      const staffAny = staff as {
        isPercussion?: unknown;
        showStandardNotation?: boolean;
        showTablature?: boolean;
        stringTuning?: { tunings?: unknown[] } | null;
      };
      const staffIsPercussion =
        staffAny.isPercussion === true || trackIsPercussion;
      if (staffIsPercussion) {
        const tunings = staffAny.stringTuning?.tunings;
        const hasTablatureCapability =
          Array.isArray(tunings) && tunings.length > 0;
        if (hasTablatureCapability) {
          staffAny.showStandardNotation = enabled;
          if (typeof staffAny.showTablature === 'boolean') {
            staffAny.showTablature = true;
          }
        } else {
          staffAny.showStandardNotation = true;
          if (typeof staffAny.showTablature === 'boolean') {
            staffAny.showTablature = false;
          }
        }
        percussionForcedCount += 1;
        return;
      }
      staffAny.showStandardNotation = enabled;
    });
  };
  const scoreTracks = (
    (s.cachedScore?.tracks ?? s.api.score?.tracks ?? []) as AlphaTabTrack[]
  ).filter(Boolean);
  const apiTracks = ((s.api.tracks ?? []) as AlphaTabTrack[]).filter(Boolean);
  scoreTracks.forEach(applyTrack);
  apiTracks.forEach(applyTrack);
  devLog('apply_staff_visibility', {
    enabled,
    scoreTrackCount: scoreTracks.length,
    apiTrackCount: apiTracks.length,
    percussionForcedCount,
  });
}

export function renderSelectedTracks(s: PlayerState): void {
  if (s.isScoreLoading) {
    return;
  }
  const tracks =
    (s.cachedTracks.length > 0
      ? s.cachedTracks
      : ((s.api.tracks ?? []) as AlphaTabTrack[])) ?? [];
  const filtered = tracks.filter(Boolean) as AlphaTabTrack[];
  const selectedIndexes = s.selectedRenderTrackIndexes ?? [];
  const isSelectedTrack = (track: AlphaTabTrack, idx: number): boolean => {
    if (selectedIndexes.length === 0) {
      return true;
    }
    const byPosition = selectedIndexes.includes(idx);
    const trackIndex = safeTrackIndex(track, idx);
    return byPosition || selectedIndexes.includes(trackIndex);
  };
  const selected = filtered.filter(isSelectedTrack);
  if (s.api.renderTracks && !s.renderTracksUnavailable) {
    try {
      s.api.renderTracks(selected.length > 0 ? selected : filtered);
      return;
    } catch {
      s.renderTracksUnavailable = true;
    }
  }
  const score = s.cachedScore ?? s.api.score ?? null;
  if (!s.api.renderScore || !score) {
    return;
  }
  const selectedPositions = filtered
    .map((track, idx) => ({ track, idx }))
    .filter(({ track, idx }) => isSelectedTrack(track, idx))
    .map(({ idx }) => idx);
  if (selectedPositions.length === 0) {
    try {
      s.api.renderScore(score);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    s.api.renderScore(score, selectedPositions);
    return;
  } catch {
    /* ignore */
  }
  try {
    s.api.renderScore(score);
  } catch {
    /* ignore */
  }
}

export function prepareForScoreLoad(
  s: PlayerState,
  source: 'base64' | 'bytes',
  bytes: number,
): void {
  devLog('alphatab_load_started', {
    source,
    bytes,
    cachedTrackCount: s.cachedTracks.length,
    hadCachedScore: Boolean(s.cachedScore),
    activeTrackIndex: s.activeTrackIndex,
  });
  s.isScoreLoading = true;
  s.pendingActiveTrackIndex = s.activeTrackIndex;
  s.cachedScore = null;
  s.cachedTracks = [];
  s.hasUnsupportedBackingTrack = false;
  s.selectedRenderTrackIndexes = null;
  s.renderTracksUnavailable = false;
  s.tickCacheBeatTicksAreShifted = null;
  s.tickCacheBarTicksAreShifted = null;
}
