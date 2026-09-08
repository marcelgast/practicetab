import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

import {
  createPlayerModel,
  playerError,
  playerReady,
  type PlayerModel,
} from '../domain/player';
import type { FretPosition } from '../domain/fretboard';
import { alphatabPlayer } from '../services/alphatabPlayer';
import { useAppStore } from './app';
import { useBeatmapStore } from './beatmap';
import { useMetronomeStore, type TimeSigBottom } from './metronome';
import { createTrackMixing } from './player/trackMixing';
import { createMetronomeSync } from './player/metronomeSync';
import { createPlaybackControl } from './player/playbackControl';
import { practicePersistence } from '../services/practicePersistence';
import { useNoteRecognitionStore } from './noteRecognition';

export interface TrackMeta {
  id: string;
  index: number;
  name: string;
  isPercussion?: boolean;
  /**
   * MIDI open-string notes of the tab's first stringed staff,
   * ordered top-tab-line-first (= highest-pitched first). Missing
   * on non-stringed tracks. Consumed by the Fretboard Panel
   * (PR 4.2) for string-count + label resolution.
   */
  tuning?: number[];
  /**
   * GM program number. Used alongside `tuning` to detect
   * fretted-instrument tracks (guitar 24-31, bass 32-39).
   */
  program?: number;
}

export interface TrackMixState {
  mute: boolean;
  solo: boolean;
  listen: boolean;
  volume: number;
}

const toTimeSigBottom = (value: number): TimeSigBottom =>
  ([1, 2, 4, 8, 16, 32].includes(value) ? value : 4) as TimeSigBottom;

export const usePlayerStore = defineStore('player', () => {
  const appStore = useAppStore();
  const metronomeStore = useMetronomeStore();
  const beatmapStore = useBeatmapStore();
  const model = ref<PlayerModel>({
    ...createPlayerModel(),
    metronomeEnabled: appStore.metronomeEnabled,
    countInEnabled: appStore.countInEnabled,
  });
  const isLoopEnabled = ref(appStore.loopEnabled);
  const loopPreviousState = ref<boolean | null>(null);
  const autoFollowEnabled = ref(true);
  const volume = ref(0.8);
  const masterVolume = ref(0.8);
  const metronomeVolume = ref(appStore.metronomeVolume);
  const countInBars = ref<number[]>([...appStore.countInBars]);
  const tracks = ref<TrackMeta[]>([]);
  const selectedTrackIds = ref<string[]>([]);
  const activeTrackId = ref<string | null>(null);
  const trackMix = ref<Record<string, TrackMixState>>({});
  const trackVolumeTouched = ref<Record<string, boolean>>({});
  const currentLibraryKey = ref<string | null>(null);
  const tuning = ref(appStore.tuning);
  const overlayLocked = ref(false);
  const fretboardOpen = ref(false);
  const beatNotesByStartMs = ref<ReadonlyMap<number, readonly FretPosition[]>>(
    new Map(),
  );
  const unsupportedAudioTrackNoticeToken = ref(0);
  const playbackSource = ref<'library' | 'practice'>('library');
  const allowExternalMetronome = ref(false);
  /**
   * Score header text pulled from AlphaTab's loaded score on
   * `setReady` (= once per tab load). AlphaTab renders the title
   * inside the score area in Page (multi-line) layout, but its
   * Horizontal (one-liner) layout suppresses the header — we
   * render our own title strip above the score for that case. Empty
   * string when the score has no title set OR no tab is loaded.
   */
  const currentScoreTitle = ref('');

  const showStandardNotation = computed(() => appStore.showStaff);
  const horizontalLayout = computed(() => appStore.horizontalLayout);

  // --- Track mixing module ---
  const trackMixing = createTrackMixing({
    alphatabPlayer,
    tracks,
    selectedTrackIds,
    activeTrackId,
    trackMix,
    trackVolumeTouched,
    volume,
    masterVolume,
    currentLibraryKey,
  });

  // --- Metronome sync module ---
  const metSync = createMetronomeSync({
    alphatabPlayer,
    appStore,
    metronomeStore,
    beatmapStore,
    model,
    isLoopEnabled,
  });

  function reset(): void {
    model.value = {
      ...createPlayerModel(),
      metronomeEnabled: appStore.metronomeEnabled,
      countInEnabled: appStore.countInEnabled,
    };
    isLoopEnabled.value = appStore.loopEnabled;
    loopPreviousState.value = null;
    metronomeVolume.value = appStore.metronomeVolume;
    countInBars.value = [...appStore.countInBars];
    tracks.value = [];
    selectedTrackIds.value = [];
    activeTrackId.value = null;
    trackMix.value = {};
    trackVolumeTouched.value = {};
    currentLibraryKey.value = null;
    overlayLocked.value = false;
    fretboardOpen.value = false;
    beatNotesByStartMs.value = new Map();
    metSync.countInActive.value = false;
    playbackSource.value = 'library';
    metSync.pendingMetronomeSyncAnchorTick.value = null;
    unsupportedAudioTrackNoticeToken.value = 0;
    currentScoreTitle.value = '';
    metSync.cancelPendingSyncedMetronomeStart();
    metSync.clearMetronomePlaybackStopTimer();
    metronomeStore.setTabLoaded(false);
  }

  // --- Playback control module ---
  const playbackCtrl = createPlaybackControl({
    alphatabPlayer,
    appStore,
    metronomeStore,
    model,
    tuning,
    countInBars,
    isLoopEnabled,
    autoFollowEnabled,
    allowExternalMetronome,
    playbackSource,
    unsupportedAudioTrackNoticeToken,
    currentLibraryKey,
    trackVolumeTouched,
    metSync,
    setError,
    reset,
    persistSelectedTrackForCurrentLibrary:
      trackMixing.persistSelectedTrackForCurrentLibrary,
  });

  function setReady(): void {
    model.value = playerReady(model.value);
    metSync.applyMetronomeSettings();
    metronomeStore.setTabLoaded(true);
    metSync.applyBeatmapToMetronomeScreen();
    // Apply the persisted horizontal-layout preference AFTER the
    // alphatab player finishes initializing — an earlier call would
    // hit the `activePlayer === null` guard and no-op. Subsequent
    // toggles go through the watch below.
    alphatabPlayer.setLayoutMode(appStore.horizontalLayout);
    // Snapshot the score's title now that alphatab has the parsed
    // score — the one-liner layout doesn't render alphatab's own
    // title block, so PlayerPanel reads this ref to show its own
    // title strip when in horizontal mode.
    const ctx = alphatabPlayer.getCurrentScoreContext?.();
    currentScoreTitle.value = (ctx?.score?.title ?? '').trim();
  }

  function setError(message: string): void {
    model.value = playerError(model.value, message);
  }

  function toggleMetronome(): void {
    const nextEnabled = !model.value.metronomeEnabled;
    model.value = {
      ...model.value,
      metronomeEnabled: nextEnabled,
    };
    appStore.setMetronomeEnabled(nextEnabled);
    // Remember per-tab sync preference only for Library-opened tabs;
    // Practice-opened tabs always force sync ON on the next open, so
    // persisting a toggle would be overwritten anyway.
    const currentId = model.value.currentLibraryItemId;
    if (currentId && playbackSource.value === 'library') {
      appStore.setLibrarySyncPref(currentId, nextEnabled);
    }
    metSync.applyMetronomeSettings();
  }

  function toggleCountIn(): void {
    const nextEnabled = !model.value.countInEnabled;
    model.value = {
      ...model.value,
      countInEnabled: nextEnabled,
    };
    if (nextEnabled && countInBars.value.length === 0) {
      const defaultBars = [2];
      countInBars.value = defaultBars;
      appStore.setCountInBars(defaultBars);
    }
    appStore.setCountInEnabled(model.value.countInEnabled);
    metSync.applyMetronomeSettings();
  }

  function setMetronomeVolume(value: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    metronomeVolume.value = clamped;
    appStore.setMetronomeVolume(clamped);
    metSync.applyMetronomeSettings();
  }

  function setTuning(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const clamped = Math.max(-12, Math.min(12, Math.round(value)));
    tuning.value = clamped;
    appStore.setTuning(clamped);
    alphatabPlayer.setTuning(clamped);
    // Note: the note-recognition engine's tuning is updated via the
    // `watch(tuning, …)` below — no explicit forward needed here.
  }

  function adjustTuning(delta: number): void {
    setTuning(tuning.value + delta);
  }

  function setOverlayLock(value: boolean): void {
    overlayLocked.value = value;
  }

  function setFretboardOpen(value: boolean): void {
    fretboardOpen.value = value;
  }

  function updateBeatNotesCache(
    next: ReadonlyMap<number, readonly FretPosition[]>,
  ): void {
    beatNotesByStartMs.value = next;
  }

  function setCountInBars(value: number[]): void {
    countInBars.value = value;
    appStore.setCountInBars(value);
  }

  function applyLoopState(enabled: boolean): void {
    isLoopEnabled.value = enabled;
    appStore.setLoopEnabled(enabled);
    alphatabPlayer.setLooping(enabled);
    if (
      appStore.metronomeEnabled &&
      model.value.playback === 'playing' &&
      metronomeStore.isRunning
    ) {
      void metSync.refreshSyncedMetronomeAtCurrentPosition('loop_toggle');
    } else if (enabled) {
      metSync.clearMetronomePlaybackStopTimer();
    }
    if (enabled && model.value.currentLibraryItemId) {
      void practicePersistence.incrementLibraryItemLoopCount(
        model.value.currentLibraryItemId,
      );
    }
  }

  function toggleLoop(): void {
    // Explicit user choice — invalidate any pending snapshot.
    loopPreviousState.value = null;
    applyLoopState(!isLoopEnabled.value);
  }

  /** Turn loop on for a new drawn range; remember the previous state so a
   * later dismiss can restore it. Idempotent on repeat draws. */
  function enableLoopForDrawnRange(): void {
    if (loopPreviousState.value === null) {
      loopPreviousState.value = isLoopEnabled.value;
    }
    if (!isLoopEnabled.value) {
      applyLoopState(true);
    }
  }

  /** Restore the loop state captured by enableLoopForDrawnRange.
   * No-op if no snapshot exists. */
  function restoreLoopFromDrawnRange(): void {
    if (loopPreviousState.value === null) {
      return;
    }
    const restored = loopPreviousState.value;
    loopPreviousState.value = null;
    if (restored !== isLoopEnabled.value) {
      applyLoopState(restored);
    }
  }

  function toggleAutoFollow(): void {
    autoFollowEnabled.value = !autoFollowEnabled.value;
  }

  function applyNotationRule(showStaff: boolean): void {
    alphatabPlayer.setShowStandardNotation(showStaff);
    alphatabPlayer.setTabRhythm(!showStaff);
  }

  function setTracks(nextTracks: TrackMeta[]): void {
    trackMixing.setTracks(nextTracks, {
      applyNotationRule,
      showStandardNotation: showStandardNotation.value,
    });
  }

  function setShowStandardNotation(enabled: boolean): void {
    appStore.setShowStaff(enabled);
    applyNotationRule(enabled);
    trackMixing.applyTrackSelection();
  }

  function setHorizontalLayout(enabled: boolean): void {
    // Push to the store ONLY — the watcher below picks up the
    // change and forwards it to the alphatab player. Calling
    // `setLayoutMode` here too would render the score twice per
    // toggle: each `api.render()` rebuilds the beat-rect cache
    // and triggers `boundsLookup`, which is visibly flickery and
    // briefly desynchronises the autofollow source-identity
    // short-circuit. Single source of truth (the store ref) +
    // single sink (the watcher) keeps the pipeline simple.
    appStore.setHorizontalLayout(enabled);
  }

  // Re-apply the horizontal-layout preference whenever the user
  // flips the toggle. The initial push happens in `setReady()`
  // because the alphatab player isn't constructed yet when the
  // store first mounts — an immediate watch would hit the no-op
  // branch of the singleton.
  //
  // After flipping the layout we want a clean alphatab instance:
  // earlier attempts (just calling `seekToStart` after the layout
  // switch) left subtle inherited state in the render context that
  // produced visible glitches and audio/visual desync. Marcel asked
  // for a hard tab-file reload so the new layout starts from a
  // clean alphatab — no stale beat-rect cache, no orphan cursor
  // position, no carried-over audio buffers. The reload preserves
  // user-facing state (feedback toggle, track selection, tempo)
  // but resets playback to bar 1 / stopped.
  //
  // If a tab is loaded the reload is the SOLE path that re-applies
  // the layout — `openLibraryItem` → `setReady()` calls
  // `setLayoutMode(appStore.horizontalLayout)` once on the new
  // alphatab instance. Calling `setLayoutMode` here too would
  // render the OLD in-memory score with the new layout (just to
  // throw it away when the reload fires moments later) — visible
  // flicker for no benefit. So gate the direct call on having no
  // loaded tab.
  watch(
    () => appStore.horizontalLayout,
    (enabled) => {
      if (model.value.currentLibraryItemId) {
        void playbackCtrl.reloadCurrentLibraryItem();
      } else {
        // No tab loaded — nothing to reload. Push the layout
        // setting through alphatab so it's already in place when
        // the next score loads.
        alphatabPlayer.setLayoutMode(enabled);
      }
    },
  );

  watch(
    () => appStore.metronomeEnabled,
    (enabled) => {
      if (model.value.metronomeEnabled !== enabled) {
        model.value = {
          ...model.value,
          metronomeEnabled: enabled,
        };
      }
      if (!enabled) {
        metSync.clearMetronomePlaybackStopTimer();
        if (metronomeStore.isRunning) {
          void metronomeStore.stopSynced();
        }
        return;
      }
      if (
        model.value.status === 'ready' &&
        model.value.playback === 'playing'
      ) {
        const config = metSync.buildBeatmapSyncedConfig('sync_toggle');
        if (config) {
          metronomeStore.applySyncedState({
            bpm: config.bpm,
            timeSigTop: config.timeSigTop,
            timeSigBottom: toTimeSigBottom(config.timeSigBottom),
          });
          metSync.startSyncedMetronome(config);
        }
      }
    },
  );

  watch(
    () => appStore.metronomeVolume,
    (value) => {
      metronomeVolume.value = value;
      metSync.applyMetronomeSettings();
    },
  );

  watch(
    () => model.value.status,
    (status) => {
      if (status !== 'ready' && metronomeStore.isRunning) {
        metSync.clearMetronomePlaybackStopTimer();
        void metronomeStore.stopSynced();
      }
    },
  );

  // Keep the note-recognition engine's tuning in sync with the player's
  // tuning, including the persisted value on app start. `immediate:
  // true` covers the initial-load case — without it, a user who
  // previously set tuning to -2 would only have it forwarded after
  // their first tuning-button click.
  watch(
    tuning,
    (value) => {
      useNoteRecognitionStore().setTuningSemitones(value);
    },
    { immediate: true },
  );

  // Reset the fretboard toggle when switching to a different tab so
  // a previous-session open state doesn't surprise the user on a new
  // piece. Also drop the stale notes cache — the new tab will rebuild
  // it on its first `refreshBeatCache`. Playback start intentionally
  // does NOT close the panel — users asked to keep it visible while
  // playing so they can follow the chord shape live.
  watch(
    () => model.value.currentLibraryItemId,
    (id, prev) => {
      if (id !== prev) {
        fretboardOpen.value = false;
        beatNotesByStartMs.value = new Map();
      }
    },
  );

  // Rebuild the expected-note timeline whenever the active track changes.
  // The cached event list from the last MIDI rebuild is reused — only the
  // track filter changes, so no MIDI regeneration is needed.
  watch(activeTrackId, (newId) => {
    if (!newId) return;
    const trackIndex = tracks.value.find((t) => t.id === newId)?.index;
    if (typeof trackIndex === 'number') {
      useNoteRecognitionStore().buildForTrack(trackIndex);
    }
  });

  return {
    model,
    isLoopEnabled,
    autoFollowEnabled,
    volume,
    masterVolume,
    metronomeVolume,
    countInBars,
    playbackSource: computed(() => playbackSource.value),
    tracks,
    selectedTrackIds,
    activeTrackId,
    activeTrackLabel: trackMixing.activeTrackLabel,
    trackMix,
    listenTrackId: trackMixing.listenTrackId,
    tuning,
    overlayLocked,
    fretboardOpen,
    beatNotesByStartMs,
    currentScoreTitle,
    unsupportedAudioTrackNoticeToken: computed(
      () => unsupportedAudioTrackNoticeToken.value,
    ),
    setTuning,
    adjustTuning,
    handleAlphaTabPlayerStateChanged: metSync.handleAlphaTabPlayerStateChanged,
    setOverlayLock,
    setFretboardOpen,
    updateBeatNotesCache,
    toggleListenForActiveTrack: trackMixing.toggleListenForActiveTrack,
    toggleListenForTrack: trackMixing.toggleListenForTrack,
    showStandardNotation,
    horizontalLayout,
    metronomeEnabled: computed(() => appStore.metronomeEnabled),
    countInEnabled: computed(() => appStore.countInEnabled),
    clearSelection: playbackCtrl.clearSelection,
    setReady,
    setError,
    setBaseBpm: playbackCtrl.setBaseBpm,
    openLibraryItem: playbackCtrl.openLibraryItem,
    reloadCurrentLibraryItem: playbackCtrl.reloadCurrentLibraryItem,
    setPlaybackSource: playbackCtrl.setPlaybackSource,
    setTempoPercent: playbackCtrl.setTempoPercent,
    hasLoadedTabTempoChanges: playbackCtrl.hasLoadedTabTempoChanges,
    setBpm: playbackCtrl.setBpm,
    applyMetronomeSettings: metSync.applyMetronomeSettings,
    toggleMetronome,
    toggleCountIn,
    setMetronomeVolume,
    setCountInBars,
    play: playbackCtrl.play,
    playWithCountInBars: playbackCtrl.playWithCountInBars,
    pause: playbackCtrl.pause,
    togglePlayPause: playbackCtrl.togglePlayPause,
    stop: playbackCtrl.stop,
    countInPending: metSync.countInPending,
    toggleLoop,
    enableLoopForDrawnRange,
    restoreLoopFromDrawnRange,
    toggleAutoFollow,
    setVolume: trackMixing.setVolume,
    setMasterVolume: trackMixing.setMasterVolume,
    applyVolume: trackMixing.applyVolume,
    setTracks,
    setTrackMute: trackMixing.setTrackMute,
    toggleTrackSolo: trackMixing.toggleTrackSolo,
    setTrackVolume: trackMixing.setTrackVolume,
    effectiveTrackVolume: trackMixing.effectiveTrackVolume,
    getEffectiveMix: trackMixing.getEffectiveMix,
    setSelectedTracks: trackMixing.setSelectedTracks,
    toggleTrack: trackMixing.toggleTrack,
    selectAllTracks: trackMixing.selectAllTracks,
    selectOnlyTrack: trackMixing.selectOnlyTrack,
    reapplyTrackSelection: trackMixing.reapplyTrackSelection,
    setShowStandardNotation,
    setHorizontalLayout,
    allowExternalMetronomeOnce: playbackCtrl.allowExternalMetronomeOnce,
    refreshSyncedMetronomeAtCurrentPosition:
      metSync.refreshSyncedMetronomeAtCurrentPosition,
    setMetronomeSyncAnchorTick: metSync.setMetronomeSyncAnchorTick,
  };
});
