import { computed, type Ref } from 'vue';
import type { TrackMeta, TrackMixState } from '../player';
import { normalizeVolume } from '../../domain/mixer';
import { alphatabPlayer as alphatabPlayerSingleton } from '../../services/alphatabPlayer';
import {
  setMasterVolume as setAudioMasterVolume,
  setTabVolume as setAudioTabVolume,
} from '../../services/audioCommands';
import { setTrackState } from '../../services/audioTabCommands';
import {
  loadSelectedTrackIndex,
  saveSelectedTrackIndex,
} from '../../services/trackSelectionPersistence';

const LISTEN_DUCKING_FACTOR = 0.7;
export const MAX_PLAYER_VOLUME = 0.18;
export const MAX_CHANNEL_BOOST = 1.2;

const DEFAULT_TRACK_VOLUME = 50;
const ACTIVE_TRACK_VOLUME = 80;
const DEFAULT_DRUM_VOLUME = 80;
const DRUM_OUTPUT_BOOST = 1.8;
const MAX_TRACK_OUTPUT_VOLUME = 180;

export interface TrackMixingDeps {
  alphatabPlayer: typeof alphatabPlayerSingleton;
  tracks: Ref<TrackMeta[]>;
  selectedTrackIds: Ref<string[]>;
  activeTrackId: Ref<string | null>;
  trackMix: Ref<Record<string, TrackMixState>>;
  trackVolumeTouched: Ref<Record<string, boolean>>;
  volume: Ref<number>;
  masterVolume: Ref<number>;
  currentLibraryKey: Ref<string | null>;
}

export function createTrackMixing(deps: TrackMixingDeps) {
  const {
    alphatabPlayer,
    tracks,
    selectedTrackIds,
    activeTrackId,
    trackMix,
    trackVolumeTouched,
    volume,
    masterVolume,
    currentLibraryKey,
  } = deps;

  const listenTrackId = computed(() => {
    const entry = Object.entries(trackMix.value).find(([, mix]) => mix.listen);
    return entry?.[0] ?? null;
  });

  const activeTrackLabel = computed(() => {
    if (tracks.value.length === 0) {
      return '—';
    }
    const match = tracks.value.find(
      (track) => track.id === activeTrackId.value,
    );
    return match?.name ?? tracks.value[0]?.name ?? 'Track';
  });

  function defaultTrackVolume(
    track: TrackMeta,
    options?: { isDisplayed?: boolean },
  ): number {
    if (options?.isDisplayed && !track.isPercussion) {
      return ACTIVE_TRACK_VOLUME;
    }
    return track.isPercussion ? DEFAULT_DRUM_VOLUME : DEFAULT_TRACK_VOLUME;
  }

  function initializeTrackMix(nextTracks: TrackMeta[]): void {
    const previousMix = trackMix.value;
    const previousTouched = trackVolumeTouched.value;
    const nextMix: Record<string, TrackMixState> = {};
    const nextTouched: Record<string, boolean> = {};
    nextTracks.forEach((track) => {
      const existing = previousMix[track.id];
      const touched = previousTouched[track.id] === true;
      nextMix[track.id] = {
        mute: existing?.mute ?? false,
        solo: existing?.solo ?? false,
        listen: existing?.listen ?? false,
        volume:
          existing?.volume ??
          defaultTrackVolume(track, {
            isDisplayed: activeTrackId.value === track.id,
          }),
      };
      nextTouched[track.id] = touched;
    });
    trackMix.value = nextMix;
    trackVolumeTouched.value = nextTouched;
    applyTrackMix();
  }

  function effectiveTrackMuted(trackId: string): boolean {
    const mix = trackMix.value[trackId];
    if (!mix) {
      return false;
    }
    const soloed = Object.values(trackMix.value).filter((entry) => entry.solo);
    if (soloed.length > 0) {
      return !mix.solo;
    }
    return mix.mute;
  }

  function effectiveTrackVolume(trackId: string): number {
    const mix = trackMix.value[trackId];
    if (!mix) {
      return 0;
    }
    const baseVolume = mix.volume;
    const listenTracks = Object.values(trackMix.value).filter(
      (entry) => entry.listen,
    );
    if (listenTracks.length === 0) {
      return baseVolume;
    }
    if (mix.listen) {
      return baseVolume;
    }
    return Math.round(baseVolume * LISTEN_DUCKING_FACTOR);
  }

  function outputTrackVolume(trackId: string, volumeValue: number): number {
    const track = tracks.value.find((candidate) => candidate.id === trackId);
    if (!track?.isPercussion) {
      return volumeValue;
    }
    return Math.min(
      MAX_TRACK_OUTPUT_VOLUME,
      Math.round(volumeValue * DRUM_OUTPUT_BOOST),
    );
  }

  function applyTrackMix(): void {
    tracks.value.forEach((track) => {
      const mix = trackMix.value[track.id];
      if (!mix) {
        return;
      }
      const effectiveMute = effectiveTrackMuted(track.id);
      if (alphatabPlayer.supportsTrackMute) {
        alphatabPlayer.setTrackMute(track.index, effectiveMute);
      }
      if (alphatabPlayer.supportsTrackSolo) {
        alphatabPlayer.setTrackSolo(track.index, mix.solo);
      }
      const effVolume = effectiveTrackVolume(track.id);
      const outVolume = outputTrackVolume(track.id, effVolume);
      if (alphatabPlayer.supportsTrackVolume) {
        alphatabPlayer.setTrackVolume(
          track.index,
          Math.min(1, outVolume / 100),
        );
      }
      void setTrackState({
        trackId: track.id,
        mute: effectiveMute,
        solo: mix.solo,
        volume: outVolume / 100,
        listen: mix.listen,
      });
    });
  }

  function applyAutoVolumeForActiveTrackChange(
    previousActiveId: string | null,
    nextActiveId: string | null,
  ): void {
    if (previousActiveId === nextActiveId) {
      return;
    }
    const nextMix: Record<string, TrackMixState> = { ...trackMix.value };
    let changed = false;
    if (previousActiveId) {
      const previousTrack = tracks.value.find(
        (track) => track.id === previousActiveId,
      );
      const previousMix = nextMix[previousActiveId];
      const previousTouched =
        trackVolumeTouched.value[previousActiveId] === true;
      if (previousTrack && previousMix && !previousTouched) {
        const resetVolume = defaultTrackVolume(previousTrack, {
          isDisplayed: false,
        });
        if (previousMix.volume !== resetVolume) {
          nextMix[previousActiveId] = {
            ...previousMix,
            volume: resetVolume,
          };
          changed = true;
        }
      }
    }
    if (nextActiveId) {
      const nextTrack = tracks.value.find((track) => track.id === nextActiveId);
      const nextMixEntry = nextMix[nextActiveId];
      const nextTouched = trackVolumeTouched.value[nextActiveId] === true;
      if (
        nextTrack &&
        nextMixEntry &&
        !nextTouched &&
        !nextTrack.isPercussion &&
        nextMixEntry.volume !== ACTIVE_TRACK_VOLUME
      ) {
        nextMix[nextActiveId] = {
          ...nextMixEntry,
          volume: ACTIVE_TRACK_VOLUME,
        };
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    trackMix.value = nextMix;
    applyTrackMix();
  }

  function setTrackMode(
    trackId: string,
    mode: 'mute' | 'solo' | 'listen',
  ): void {
    const mix = trackMix.value[trackId];
    if (!mix) {
      return;
    }
    const isActive = mix[mode];
    const nextMix: Record<string, TrackMixState> = { ...trackMix.value };
    if (mode === 'listen' && !isActive) {
      // Listen mode always disengages solo modes globally first.
      Object.entries(nextMix).forEach(([id, entry]) => {
        nextMix[id] = { ...entry, solo: false };
      });
    }
    nextMix[trackId] = {
      ...mix,
      mute: false,
      solo: false,
      listen: false,
      [mode]: !isActive,
    };
    trackMix.value = nextMix;
    applyTrackMix();
  }

  function setTrackMute(trackId: string, muted: boolean): void {
    if (!trackMix.value[trackId]) {
      return;
    }
    if (muted) {
      setTrackMode(trackId, 'mute');
      return;
    }
    const mix = trackMix.value[trackId];
    if (!mix?.mute) {
      return;
    }
    trackMix.value = {
      ...trackMix.value,
      [trackId]: { ...mix, mute: false },
    };
    applyTrackMix();
  }

  function toggleTrackSolo(trackId: string): void {
    setTrackMode(trackId, 'solo');
  }

  function toggleListenForTrack(trackId: string): void {
    setTrackMode(trackId, 'listen');
  }

  function toggleListenForActiveTrack(): void {
    if (!activeTrackId.value) {
      return;
    }
    toggleListenForTrack(activeTrackId.value);
  }

  function setTrackVolume(trackId: string, volumeValue: number): void {
    const mix = trackMix.value[trackId];
    if (!mix) {
      return;
    }
    const clamped = Math.round(normalizeVolume(volumeValue / 100) * 100);
    if (mix.volume === clamped) {
      return;
    }
    trackVolumeTouched.value = {
      ...trackVolumeTouched.value,
      [trackId]: true,
    };
    trackMix.value = {
      ...trackMix.value,
      [trackId]: { ...mix, volume: clamped },
    };
    applyTrackMix();
  }

  function getEffectiveMix(trackId: string): TrackMixState & {
    effectiveMute: boolean;
  } {
    const track = tracks.value.find((candidate) => candidate.id === trackId);
    const mix = trackMix.value[trackId] ?? {
      mute: false,
      solo: false,
      listen: false,
      volume: track ? defaultTrackVolume(track) : DEFAULT_TRACK_VOLUME,
    };
    const effectiveMute = effectiveTrackMuted(trackId);
    return {
      ...mix,
      effectiveMute,
      volume: effectiveTrackVolume(trackId),
    };
  }

  function setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    volume.value = clamped;
    const scaled = clamped * MAX_CHANNEL_BOOST;
    void setAudioTabVolume(Math.round(scaled * 100));
  }

  function setMasterVolume(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    masterVolume.value = clamped;
    const scaled = clamped * MAX_PLAYER_VOLUME * MAX_CHANNEL_BOOST;
    void setAudioMasterVolume(Math.round(scaled * 100));
  }

  function applyVolume(): void {
    setVolume(volume.value);
    setMasterVolume(masterVolume.value);
  }

  function persistSelectedTrackForCurrentLibrary(): void {
    const fileKey = currentLibraryKey.value;
    if (!fileKey || !activeTrackId.value) {
      return;
    }
    const active = tracks.value.find(
      (track) => track.id === activeTrackId.value,
    );
    if (!active) {
      return;
    }
    saveSelectedTrackIndex(fileKey, active.index);
  }

  function applyTrackSelection(): void {
    const selectedIndexes = tracks.value
      .filter((track) => selectedTrackIds.value.includes(track.id))
      .map((track) => track.index);
    if (selectedTrackIds.value.length === 1) {
      alphatabPlayer.setActiveTrack(selectedIndexes[0] ?? null);
      return;
    }
    if (selectedTrackIds.value.length === 0) {
      alphatabPlayer.setActiveTrack(null);
      return;
    }
    if (selectedTrackIds.value.length === tracks.value.length) {
      alphatabPlayer.setActiveTrack(null);
      return;
    }
    alphatabPlayer.setVisibleTracks(selectedIndexes);
  }

  function setSelectedTracks(ids: string[]): void {
    const previousActiveId = activeTrackId.value;
    selectedTrackIds.value = ids;
    activeTrackId.value = ids.length === 1 ? ids[0] : null;
    applyAutoVolumeForActiveTrackChange(previousActiveId, activeTrackId.value);
    applyTrackSelection();
    persistSelectedTrackForCurrentLibrary();
  }

  function toggleTrack(id: string): void {
    const previousActiveId = activeTrackId.value;
    if (selectedTrackIds.value.includes(id)) {
      selectedTrackIds.value = selectedTrackIds.value.filter(
        (trackId) => trackId !== id,
      );
    } else {
      selectedTrackIds.value = [...selectedTrackIds.value, id];
    }
    activeTrackId.value =
      selectedTrackIds.value.length === 1 ? selectedTrackIds.value[0] : null;
    applyAutoVolumeForActiveTrackChange(previousActiveId, activeTrackId.value);
    applyTrackSelection();
    persistSelectedTrackForCurrentLibrary();
  }

  function selectAllTracks(): void {
    selectedTrackIds.value = tracks.value.map((track) => track.id);
    activeTrackId.value = null;
    applyTrackSelection();
  }

  function selectOnlyTrack(id: string): void {
    const previousActiveId = activeTrackId.value;
    selectedTrackIds.value = [id];
    activeTrackId.value = id;
    applyAutoVolumeForActiveTrackChange(previousActiveId, id);
    applyTrackSelection();
    persistSelectedTrackForCurrentLibrary();
  }

  function reapplyTrackSelection(): void {
    applyTrackSelection();
  }

  function setTracks(
    nextTracks: TrackMeta[],
    options: {
      applyNotationRule: (showStaff: boolean) => void;
      showStandardNotation: boolean;
    },
  ): void {
    tracks.value = nextTracks;
    const preferredTrackIndex = currentLibraryKey.value
      ? loadSelectedTrackIndex(currentLibraryKey.value)
      : null;
    const preferredByPersistence =
      typeof preferredTrackIndex === 'number'
        ? (nextTracks.find((track) => track.index === preferredTrackIndex) ??
          null)
        : null;
    const firstTrackWithNotesIndex = (
      alphatabPlayer as { getFirstTrackWithNotesIndex?: () => number | null }
    ).getFirstTrackWithNotesIndex?.();
    const preferredByNotes =
      typeof firstTrackWithNotesIndex === 'number'
        ? (nextTracks.find(
            (track) => track.index === firstTrackWithNotesIndex,
          ) ?? null)
        : null;
    const fallbackPreferred =
      nextTracks.find((track) => !track.isPercussion) ?? nextTracks[0] ?? null;
    const preferred =
      preferredByPersistence ?? preferredByNotes ?? fallbackPreferred;
    activeTrackId.value = preferred?.id ?? null;
    selectedTrackIds.value = activeTrackId.value ? [activeTrackId.value] : [];
    applyTrackSelection();
    initializeTrackMix(nextTracks);
    options.applyNotationRule(options.showStandardNotation);
    // Re-apply explicit track selection because alphaTab notation rendering
    // may re-render all tracks internally.
    applyTrackSelection();
  }

  return {
    // computeds
    listenTrackId,
    activeTrackLabel,
    // functions
    initializeTrackMix,
    applyTrackMix,
    effectiveTrackVolume,
    applyAutoVolumeForActiveTrackChange,
    setTrackMute,
    toggleTrackSolo,
    toggleListenForTrack,
    toggleListenForActiveTrack,
    setTrackVolume,
    getEffectiveMix,
    setVolume,
    setMasterVolume,
    applyVolume,
    persistSelectedTrackForCurrentLibrary,
    applyTrackSelection,
    setSelectedTracks,
    toggleTrack,
    selectAllTracks,
    selectOnlyTrack,
    reapplyTrackSelection,
    setTracks,
  };
}
