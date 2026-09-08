import { nextTick, type Ref } from 'vue';
import type { LibraryItem } from '../../domain/library';
import {
  bpmToPercent,
  playerPlay,
  playerPause,
  playerSetBaseBpm,
  playerSetBpm,
  playerSetTempo,
  playerStartLoading,
  playerStop,
  type PlayerModel,
} from '../../domain/player';
import { isTauri, libraryFileOps } from '../../services/libraryFileOps';
import { practicePersistence } from '../../services/practicePersistence';
import {
  alphatabPlayer as alphatabPlayerSingleton,
  base64ToUint8Array,
} from '../../services/alphatabPlayer';
import { metronomeCancelScheduled } from '../../services/metronomeCommands';
import type { useAppStore } from '../app';
import type { useMetronomeStore, TimeSigBottom } from '../metronome';
import type { createMetronomeSync } from './metronomeSync';
import { useNoteRecognitionStore } from '../noteRecognition';
import { useLibraryStore } from '../library';

type PlaybackSource = 'library' | 'practice';

const toTimeSigBottom = (value: number): TimeSigBottom =>
  ([1, 2, 4, 8, 16, 32].includes(value) ? value : 4) as TimeSigBottom;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error ?? 'Unknown error');
}

export interface PlaybackControlDeps {
  alphatabPlayer: typeof alphatabPlayerSingleton;
  appStore: ReturnType<typeof useAppStore>;
  metronomeStore: ReturnType<typeof useMetronomeStore>;
  model: Ref<PlayerModel>;
  tuning: Ref<number>;
  countInBars: Ref<number[]>;
  isLoopEnabled: Ref<boolean>;
  autoFollowEnabled: Ref<boolean>;
  allowExternalMetronome: Ref<boolean>;
  playbackSource: Ref<PlaybackSource>;
  unsupportedAudioTrackNoticeToken: Ref<number>;
  currentLibraryKey: Ref<string | null>;
  trackVolumeTouched: Ref<Record<string, boolean>>;
  metSync: ReturnType<typeof createMetronomeSync>;
  setError: (message: string) => void;
  reset: () => void;
  persistSelectedTrackForCurrentLibrary: () => void;
}

export function createPlaybackControl(deps: PlaybackControlDeps) {
  const {
    alphatabPlayer,
    appStore,
    metronomeStore,
    model,
    tuning,
    countInBars,
    isLoopEnabled,
    allowExternalMetronome,
    playbackSource,
    unsupportedAudioTrackNoticeToken,
    currentLibraryKey,
    trackVolumeTouched,
    metSync,
    setError,
    persistSelectedTrackForCurrentLibrary,
  } = deps;

  function setPlaybackSource(source: PlaybackSource): void {
    playbackSource.value = source;
  }

  function canStartPlayback(): boolean {
    if (
      typeof alphatabPlayer.hasUnsupportedBackingTrack === 'function' &&
      alphatabPlayer.hasUnsupportedBackingTrack()
    ) {
      unsupportedAudioTrackNoticeToken.value += 1;
      return false;
    }
    return true;
  }

  function setBaseBpm(baseBpm: number): void {
    const previousBpm = model.value.currentBpm;
    const previousTempoPercent = model.value.tempoPercent;
    model.value = playerSetBaseBpm(model.value, baseBpm);
    const roundedBase = Math.round(baseBpm);
    const shouldPreserveOverride =
      previousBpm !== null &&
      (previousTempoPercent !== 100 || previousBpm !== roundedBase);
    if (shouldPreserveOverride) {
      setBpm(previousBpm);
    } else if (model.value.currentBpm !== null) {
      setBpm(model.value.currentBpm);
    }
    metSync.applyMetronomeSettings();
    metSync.applyBeatmapToMetronomeScreen();
  }

  function setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) {
      return;
    }
    const next = playerSetBpm(model.value, bpm);
    if (next.baseBpm) {
      next.tempoPercent = bpmToPercent(next.baseBpm, bpm);
      alphatabPlayer.setBpm(next.currentBpm ?? bpm, next.baseBpm);
    }
    model.value = next;
    void metSync.refreshSyncedMetronomeAtCurrentPosition('tempo_change');
  }

  function setTempoPercent(tempoPercent: number): void {
    const updated = playerSetTempo(model.value, tempoPercent);
    model.value = updated;
    alphatabPlayer.setTempoPercent(updated.tempoPercent);
    void metSync.refreshSyncedMetronomeAtCurrentPosition('tempo_change');
    // Rescale the expected-note timeline for the new speed. The raw atMs
    // values in the event list stay at 1× — only wallClockMs changes.
    useNoteRecognitionStore().rescaleTimeline(updated.tempoPercent / 100);
  }

  function hasLoadedTabTempoChanges(): boolean {
    if (
      model.value.currentLibraryItemId === null ||
      model.value.status !== 'ready'
    ) {
      return false;
    }
    return alphatabPlayer.hasTempoChanges();
  }

  let tabPlayStartedAtMs: number | null = null;

  function flushTabLibraryItemTime(): void {
    if (tabPlayStartedAtMs !== null && model.value.currentLibraryItemId) {
      const elapsedSeconds = Math.round(
        (Date.now() - tabPlayStartedAtMs) / 1000,
      );
      if (elapsedSeconds > 0) {
        void practicePersistence.recordLibraryItemTime(
          model.value.currentLibraryItemId,
          elapsedSeconds,
        );
      }
      tabPlayStartedAtMs = null;
    }
  }

  function play(): void {
    if (metronomeStore.intervalModeEnabled) {
      return;
    }
    if (!alphatabPlayer.isInitialized()) {
      setError('Player is not initialized.');
      return;
    }
    if (!canStartPlayback()) {
      return;
    }
    // Track play count + start time for library item stats
    if (model.value.currentLibraryItemId) {
      void practicePersistence.incrementLibraryItemPlayCount(
        model.value.currentLibraryItemId,
      );
      tabPlayStartedAtMs = Date.now();
    }
    alphatabPlayer.setTuning(tuning.value, { force: true });
    metSync.cancelPendingSyncedMetronomeStart();
    const allowExternal = allowExternalMetronome.value;
    allowExternalMetronome.value = false;
    if (
      metronomeStore.isRunning &&
      !appStore.metronomeEnabled &&
      !allowExternal
    ) {
      void metronomeStore.setRunning(false);
    }
    const prePlaySyncConfig = appStore.metronomeEnabled
      ? metSync.buildBeatmapSyncedConfig('play')
      : null;
    if (appStore.metronomeEnabled) {
      if (metSync.countInTimer.value) {
        globalThis.clearTimeout(metSync.countInTimer.value);
        metSync.countInTimer.value = null;
        metSync.countInToken.value += 1;
        metSync.countInActive.value = false;
      }
      metSync.clearCountInPreviewTimers();
      const config = prePlaySyncConfig;
      const useCountIn = model.value.countInEnabled;
      const countInBarsValue = useCountIn
        ? Math.min(...(countInBars.value.length ? countInBars.value : [0]))
        : 0;
      metSync.countInActive.value = countInBarsValue > 0;
      const beatSeconds = config
        ? (60 / config.bpm) * (4 / config.timeSigBottom)
        : 0;
      const delayMs = config
        ? Math.max(0, countInBarsValue) * config.timeSigTop * beatSeconds * 1000
        : 0;
      if (delayMs > 0 && config) {
        metSync.countInActive.value = true;
        metSync.scheduleCountInPreview(
          countInBarsValue,
          config.bpm,
          config.timeSigTop,
          toTimeSigBottom(config.timeSigBottom),
        );
        const token = ++metSync.countInToken.value;
        metSync.countInTimer.value = globalThis.setTimeout(() => {
          if (metSync.countInToken.value !== token) {
            return;
          }
          metSync.clearCountInPreviewTimers();
          if (model.value.baseBpm !== null && model.value.currentBpm !== null) {
            alphatabPlayer.setBpm(model.value.currentBpm, model.value.baseBpm);
          }
          if (config) {
            alphatabPlayer.play();
            model.value = playerPlay(model.value);
            metSync.startSyncedMetronomeWhenTransportStarts('play', config);
          } else {
            alphatabPlayer.play();
            model.value = playerPlay(model.value);
          }
          useNoteRecognitionStore().startComparison();
          metSync.resetSyncPlaybackState();
          metSync.countInTimer.value = null;
        }, delayMs);
        return;
      }
    }
    metSync.clearCountInPreviewTimers();
    if (model.value.baseBpm !== null && model.value.currentBpm !== null) {
      alphatabPlayer.setBpm(model.value.currentBpm, model.value.baseBpm);
    }
    alphatabPlayer.play();
    model.value = playerPlay(model.value);
    useNoteRecognitionStore().startComparison();
    if (appStore.metronomeEnabled) {
      const config = prePlaySyncConfig;
      if (config) {
        metSync.startSyncedMetronomeWhenTransportStarts('play', config);
      }
    }
    metSync.resetSyncPlaybackState();
  }

  function playWithCountInBars(
    countInBarsOverride: number,
    explicitBpmOverride?: number,
  ): void {
    if (metronomeStore.intervalModeEnabled) {
      return;
    }
    if (!alphatabPlayer.isInitialized()) {
      setError('Player is not initialized.');
      return;
    }
    if (!canStartPlayback()) {
      return;
    }
    alphatabPlayer.seekToStart({ soft: false });
    alphatabPlayer.setTuning(tuning.value, { force: true });
    metSync.cancelPendingSyncedMetronomeStart();
    if (!appStore.metronomeEnabled) {
      play();
      return;
    }
    if (metSync.countInTimer.value) {
      globalThis.clearTimeout(metSync.countInTimer.value);
      metSync.countInTimer.value = null;
      metSync.countInToken.value += 1;
      metSync.countInActive.value = false;
    }
    metSync.clearCountInPreviewTimers();
    let config = metSync.buildBeatmapSyncedConfig('play');
    if (
      config &&
      explicitBpmOverride !== undefined &&
      explicitBpmOverride > 0
    ) {
      config = { ...config, bpm: Math.round(explicitBpmOverride) };
    }
    const countInBarsCount = Math.max(0, Math.round(countInBarsOverride));
    metSync.countInActive.value = countInBarsCount > 0;
    const beatSeconds = config
      ? (60 / config.bpm) * (4 / config.timeSigBottom)
      : 0;
    const delayMs = config
      ? Math.max(0, countInBarsCount) * config.timeSigTop * beatSeconds * 1000
      : 0;
    if (delayMs > 0 && config) {
      metSync.countInActive.value = true;
      metSync.scheduleCountInPreview(
        countInBarsCount,
        config.bpm,
        config.timeSigTop,
        toTimeSigBottom(config.timeSigBottom),
      );
      const token = ++metSync.countInToken.value;
      metSync.countInTimer.value = globalThis.setTimeout(() => {
        if (metSync.countInToken.value !== token) {
          return;
        }
        metSync.clearCountInPreviewTimers();
        alphatabPlayer.seekToStart({ soft: false });
        alphatabPlayer.setTuning(tuning.value, { force: true });
        if (model.value.baseBpm !== null && model.value.currentBpm !== null) {
          alphatabPlayer.setBpm(model.value.currentBpm, model.value.baseBpm);
        }
        if (config) {
          alphatabPlayer.play();
          model.value = playerPlay(model.value);
          metSync.startSyncedMetronomeWhenTransportStarts('play', config);
        } else {
          alphatabPlayer.play();
          model.value = playerPlay(model.value);
        }
        useNoteRecognitionStore().startComparison();
        metSync.resetSyncPlaybackState();
        metSync.countInTimer.value = null;
      }, delayMs);
      return;
    }
    metSync.clearCountInPreviewTimers();
    alphatabPlayer.seekToStart({ soft: false });
    alphatabPlayer.setTuning(tuning.value, { force: true });
    if (model.value.baseBpm !== null && model.value.currentBpm !== null) {
      alphatabPlayer.setBpm(model.value.currentBpm, model.value.baseBpm);
    }
    alphatabPlayer.play();
    model.value = playerPlay(model.value);
    useNoteRecognitionStore().startComparison();
    if (appStore.metronomeEnabled) {
      if (config) {
        metSync.startSyncedMetronomeWhenTransportStarts('play', config);
      }
    }
    metSync.resetSyncPlaybackState();
  }

  function pause(): void {
    flushTabLibraryItemTime();
    if (!alphatabPlayer.isInitialized()) {
      setError('Player is not initialized.');
      return;
    }
    if (metSync.countInTimer.value) {
      globalThis.clearTimeout(metSync.countInTimer.value);
      metSync.countInTimer.value = null;
      metSync.countInToken.value += 1;
      metSync.countInActive.value = false;
    }
    metSync.clearCountInPreviewTimers();
    metSync.cancelPendingSyncedMetronomeStart();
    alphatabPlayer.pause();
    model.value = playerPause(model.value);
    useNoteRecognitionStore().stopComparison();
    metSync.resetSyncPlaybackState();
    if (appStore.metronomeEnabled) {
      void metronomeCancelScheduled();
      metSync.clearMetronomePlaybackStopTimer();
      void metronomeStore.stopSynced();
    }
  }

  function stop(): void {
    flushTabLibraryItemTime();
    if (!alphatabPlayer.isInitialized()) {
      setError('Player is not initialized.');
      return;
    }
    if (metSync.countInTimer.value) {
      globalThis.clearTimeout(metSync.countInTimer.value);
      metSync.countInTimer.value = null;
      metSync.countInToken.value += 1;
      metSync.countInActive.value = false;
    }
    metSync.clearCountInPreviewTimers();
    metSync.cancelPendingSyncedMetronomeStart();
    alphatabPlayer.stop();
    model.value = playerStop(model.value);
    useNoteRecognitionStore().stopComparison();
    metSync.resetSyncPlaybackState();
    if (appStore.metronomeEnabled) {
      void metronomeCancelScheduled();
      metSync.clearMetronomePlaybackStopTimer();
      void metronomeStore.stopSynced();
    }
  }

  function togglePlayPause(): void {
    if (model.value.playback === 'playing') {
      pause();
      return;
    }
    play();
  }

  function allowExternalMetronomeOnce(): void {
    allowExternalMetronome.value = true;
  }

  async function openLibraryItem(
    item: LibraryItem,
    source: PlaybackSource = 'library',
  ): Promise<void> {
    const isChangingTab =
      currentLibraryKey.value &&
      model.value.currentLibraryItemId &&
      currentLibraryKey.value !== item.id;
    if (isChangingTab) {
      persistSelectedTrackForCurrentLibrary();
      trackVolumeTouched.value = {};
    }
    const transportState =
      (
        alphatabPlayer as { getTransportState?: () => string }
      ).getTransportState?.() ?? 'stopped';
    const wasActive =
      model.value.playback !== 'stopped' ||
      metSync.countInPending.value ||
      transportState !== 'stopped';
    if (wasActive) {
      // Stop BEFORE wiping the feedback timeline. The PlayerPanel
      // watcher fires on the stopped<-active transition and persists
      // the in-flight feedback run + opens the summary dialog —
      // calling clearTimeline first wipes `feedbackEnabled` and
      // `noteResults` synchronously, so by the time the watcher
      // (default 'pre' flush) fires it sees `enabled=false /
      // noteResults=[]` and silently drops the run. Awaiting the next
      // tick before clearing lets the watcher flush while the data
      // is still live.
      stop();
      await nextTick();
    }
    if (isChangingTab) {
      // Live-feedback is opt-in per tab: opening a different library
      // item must drop the toggle and clear any accumulated timeline
      // / results so the new piece starts with a clean slate. Now
      // safe to call after `await nextTick()` — the persistence
      // watcher has already captured a snapshot of noteResults via
      // `buildFeedbackSummary`, and the FeedbackSummaryDialog also
      // snapshots on `open=true` so the dialog stays populated even
      // after the wipe.
      useNoteRecognitionStore().clearTimeline();
    }
    currentLibraryKey.value = item.id;
    model.value = playerStartLoading(model.value, item.id);
    alphatabPlayer.setLooping(isLoopEnabled.value);
    metronomeStore.setTabLoaded(false);
    playbackSource.value = source;
    // Sync-to-tab defaults. Practice-path opens always force ON —
    // exercising with a tab implies the user wants the metronome aligned.
    // Library-path opens restore the per-tab user preference, defaulting
    // to ON when no preference has been saved yet.
    const nextSync =
      source === 'practice'
        ? true
        : (appStore.getLibrarySyncPref(item.id) ?? true);
    if (appStore.metronomeEnabled !== nextSync) {
      appStore.setMetronomeEnabled(nextSync);
    }
    model.value = {
      ...model.value,
      metronomeEnabled: nextSync,
    };

    if (!alphatabPlayer.isInitialized()) {
      setError('Player is not initialized.');
      return;
    }

    if (!isTauri()) {
      setError('File loading is available in Tauri dev only.');
      return;
    }

    const path =
      item.source.kind === 'imported'
        ? item.source.managedPath
        : item.source.path;
    try {
      const base64 = await libraryFileOps.readFileBase64(path);
      const bytes = base64ToUint8Array(base64);
      if (bytes.length === 0) {
        throw new Error('Loaded file is empty.');
      }
      alphatabPlayer.loadBytes(bytes);
      alphatabPlayer.setTuning(tuning.value, { force: true });
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  /**
   * Reload the currently-loaded library item from disk.
   *
   * Hard-resets AlphaTab + audio engine + cursor by going through
   * the same `openLibraryItem` path a fresh open uses — same item
   * id, so the "tab change" cleanup branches skip (preserving the
   * feedback toggle and any noteResults). What survives:
   *   - feedbackEnabled (the user just toggled it on or changed
   *     layout, they didn't deselect the tab)
   *   - track selection / mute / solo / volume
   *   - tempo / BPM / loop / sync settings
   * What resets:
   *   - playhead position → 0
   *   - playback state → stopped
   *   - alphatab's internal beat cache + render context
   *   - audio engine buffers
   *
   * This is the right hammer for situations where partial state
   * resets (seekToStart, manual position fixes) cause subtle
   * audio/visual desync — Marcel's "feedback ahead of audio when
   * armed mid-playback" bug pattern. A clean re-init guarantees
   * sync because there's no inherited state to drift.
   *
   * No-op when no library item is loaded, or when the loaded id
   * isn't in the library store any more (orphan from a delete).
   */
  async function reloadCurrentLibraryItem(): Promise<void> {
    const id = model.value.currentLibraryItemId;
    if (!id) return;
    const libraryStore = useLibraryStore();
    const item = libraryStore.items.find((entry) => entry.id === id);
    if (!item) return;
    await openLibraryItem(item, playbackSource.value);
  }

  async function clearSelection(): Promise<void> {
    persistSelectedTrackForCurrentLibrary();
    // Metronome cleanup is independent of the feedback persistence
    // path — keep it synchronous so callers that don't await still
    // observe the settled state on the next line.
    if (appStore.metronomeEnabled) {
      appStore.setMetronomeEnabled(false);
      void metronomeCancelScheduled();
      metSync.clearMetronomePlaybackStopTimer();
      void metronomeStore.stopSynced();
    }
    const wasActive = model.value.playback !== 'stopped';
    if (wasActive) {
      // Same ordering rule as openLibraryItem: stop before
      // clearTimeline, await nextTick so the PlayerPanel watcher
      // can persist the in-flight feedback run before its
      // dependencies (`feedbackEnabled` / `noteResults`) get wiped.
      stop();
      await nextTick();
    }
    useNoteRecognitionStore().clearTimeline();
    deps.reset();
  }

  return {
    setPlaybackSource,
    canStartPlayback,
    setBaseBpm,
    setBpm,
    setTempoPercent,
    hasLoadedTabTempoChanges,
    play,
    playWithCountInBars,
    pause,
    stop,
    togglePlayPause,
    allowExternalMetronomeOnce,
    openLibraryItem,
    reloadCurrentLibraryItem,
    clearSelection,
  };
}
