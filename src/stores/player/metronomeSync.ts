import { computed, ref, type Ref } from 'vue';
import { playerStop, type PlayerModel } from '../../domain/player';
import { alphatabPlayer as alphatabPlayerSingleton } from '../../services/alphatabPlayer';
import {
  metronomeCancelScheduled,
  metronomeTickFromAlphaTab,
  type MetronomeConfig,
} from '../../services/metronomeCommands';
import type { MetronomeSyncResolveReason } from '../../services/metronomeSyncResolver';
import type { useAppStore } from '../app';
import type { useBeatmapStore } from '../beatmap';
import type { useMetronomeStore, TimeSigBottom } from '../metronome';
import { createMetronomeSyncConfig } from './metronomeSyncConfig';

const toTimeSigBottom = (value: number): TimeSigBottom =>
  ([1, 2, 4, 8, 16, 32].includes(value) ? value : 4) as TimeSigBottom;

export interface MetronomeSyncDeps {
  alphatabPlayer: typeof alphatabPlayerSingleton;
  appStore: ReturnType<typeof useAppStore>;
  metronomeStore: ReturnType<typeof useMetronomeStore>;
  beatmapStore: ReturnType<typeof useBeatmapStore>;
  model: Ref<PlayerModel>;
  isLoopEnabled: Ref<boolean>;
}

export function createMetronomeSync(deps: MetronomeSyncDeps) {
  const {
    alphatabPlayer,
    appStore,
    metronomeStore,
    beatmapStore,
    model,
    isLoopEnabled,
  } = deps;

  const countInTimer = ref<number | null>(null);
  const countInPreviewTimers = ref<number[]>([]);
  const countInToken = ref(0);
  const countInActive = ref(false);
  const pendingStoppedVerificationTimer = ref<number | null>(null);
  const metronomePlaybackStopTimer = ref<number | null>(null);
  const pendingSyncedMetronomeStartTimer = ref<number | null>(null);
  const pendingSyncedMetronomeStartToken = ref(0);
  const pendingTransportStopSinceMs = ref<number | null>(null);
  const lastObservedTransportTick = ref<number | null>(null);
  const lastTransportTickAdvanceAtMs = ref<number>(0);
  const pendingMetronomeSyncAnchorTick = ref<number | null>(null);

  const countInPending = computed(() => countInTimer.value !== null);

  // Delegate tick resolution and config building to focused module
  const syncConfig = createMetronomeSyncConfig({
    alphatabPlayer,
    metronomeStore,
    beatmapStore,
    model,
    isLoopEnabled,
    pendingMetronomeSyncAnchorTick,
  });
  const {
    resolveCurrentSyncTick,
    collectMetronomeBarsFromAlphaTab,
    buildBeatmapSyncedConfig,
  } = syncConfig;

  function clearCountInPreviewTimers(): void {
    countInPreviewTimers.value.forEach((timerId) => {
      globalThis.clearTimeout(timerId);
    });
    countInPreviewTimers.value = [];
  }

  function scheduleCountInPreview(
    bars: number,
    bpm: number,
    top: number,
    bottom: TimeSigBottom,
  ): void {
    clearCountInPreviewTimers();
    const totalBeats = Math.max(0, bars) * Math.max(1, top);
    if (totalBeats <= 0) {
      return;
    }
    const beatDurationMs = (60 / bpm) * (4 / bottom) * 1000;
    const subdivisions = metronomeStore.subdivisionsEnabled
      ? Math.max(2, metronomeStore.subdivisionsValue + 1)
      : 1;
    const soundMode = metronomeStore.soundMode;
    // Volume is already applied by render_metronome via metronome_output_gain,
    // so pass 1.0 here to avoid double-scaling.
    const volumeScalar = 1.0;
    for (let beatOffset = 0; beatOffset < totalBeats; beatOffset += 1) {
      const beatIndex = beatOffset % Math.max(1, top);
      const beatType = beatIndex === 0 ? 'accent' : 'normal';
      const timerId = globalThis.setTimeout(
        () => {
          void metronomeTickFromAlphaTab({
            beatIndex,
            beatDurationMs,
            subdivisions,
            soundMode,
            beatType,
            volumeScalar,
          });
        },
        Math.round(beatDurationMs * beatOffset),
      );
      countInPreviewTimers.value.push(timerId);
    }
  }

  function clearMetronomePlaybackStopTimer(): void {
    if (metronomePlaybackStopTimer.value !== null) {
      globalThis.clearTimeout(metronomePlaybackStopTimer.value);
      metronomePlaybackStopTimer.value = null;
    }
  }

  function armMetronomePlaybackStopTimer(config: MetronomeConfig): void {
    clearMetronomePlaybackStopTimer();
    if (isLoopEnabled.value) {
      return;
    }
    const loopMs = Number(config.scheduleLoopMs ?? 0);
    if (!Number.isFinite(loopMs) || loopMs <= 0) {
      return;
    }
    const startOffsetRaw = Number(config.scheduleStartOffsetMs ?? 0);
    const startOffsetMs =
      Number.isFinite(startOffsetRaw) && loopMs > 0
        ? ((startOffsetRaw % loopMs) + loopMs) % loopMs
        : 0;
    const remainingMs = Math.max(0, loopMs - startOffsetMs);
    metronomePlaybackStopTimer.value = globalThis.setTimeout(
      () => {
        metronomePlaybackStopTimer.value = null;
        if (!appStore.metronomeEnabled || isLoopEnabled.value) {
          return;
        }
        if (model.value.playback !== 'playing') {
          return;
        }
        void metronomeCancelScheduled();
        void metronomeStore.stopSynced();
      },
      Math.ceil(remainingMs + 80),
    );
  }

  function startSyncedMetronome(config: MetronomeConfig): void {
    armMetronomePlaybackStopTimer(config);
    void metronomeStore.startSynced(config);
  }

  function cancelPendingSyncedMetronomeStart(): void {
    pendingSyncedMetronomeStartToken.value += 1;
    if (pendingSyncedMetronomeStartTimer.value !== null) {
      globalThis.clearTimeout(pendingSyncedMetronomeStartTimer.value);
      pendingSyncedMetronomeStartTimer.value = null;
    }
  }

  function startSyncedMetronomeWhenTransportStarts(
    reason: MetronomeSyncResolveReason,
    fallbackConfig?: MetronomeConfig | null,
  ): void {
    cancelPendingSyncedMetronomeStart();
    const token = pendingSyncedMetronomeStartToken.value;
    const startedAtMs = Date.now();
    const tryStart = () => {
      if (pendingSyncedMetronomeStartToken.value !== token) {
        return;
      }
      if (model.value.playback !== 'playing') {
        cancelPendingSyncedMetronomeStart();
        return;
      }
      const state = alphatabPlayer.getTransportState();
      const timedOut = Date.now() - startedAtMs >= 500;
      if (state === 'playing' || timedOut) {
        pendingSyncedMetronomeStartTimer.value = null;
        const liveConfig = buildBeatmapSyncedConfig(reason);
        const config = liveConfig ?? fallbackConfig ?? null;
        if (!config) {
          return;
        }
        startSyncedMetronome(config);
        // Hard re-anchor once transport has moved for a few frames to avoid
        // stale pre-start cursor snapshots on pause/seek resume.
        globalThis.setTimeout(() => {
          if (model.value.playback !== 'playing' || !metronomeStore.isRunning) {
            return;
          }
          void refreshSyncedMetronomeAtCurrentPosition(reason);
        }, 45);
        return;
      }
      pendingSyncedMetronomeStartTimer.value = globalThis.setTimeout(
        tryStart,
        12,
      );
    };
    tryStart();
  }

  async function refreshSyncedMetronomeAtCurrentPosition(
    reason: MetronomeSyncResolveReason = 'seek',
  ): Promise<void> {
    if (!appStore.metronomeEnabled || !metronomeStore.isRunning) {
      return;
    }
    const config = buildBeatmapSyncedConfig(reason);
    if (!config) {
      return;
    }
    metronomeStore.applySyncedState({
      bpm: config.bpm,
      timeSigTop: config.timeSigTop,
      timeSigBottom: toTimeSigBottom(config.timeSigBottom),
    });
    await metronomeStore.updateSyncedConfig(config);
    armMetronomePlaybackStopTimer(config);
  }

  function clearPendingStoppedVerification(): void {
    if (pendingStoppedVerificationTimer.value !== null) {
      globalThis.clearTimeout(pendingStoppedVerificationTimer.value);
      pendingStoppedVerificationTimer.value = null;
    }
  }

  async function handleAlphaTabPlayerStateChanged(event: {
    stopped: boolean;
  }): Promise<void> {
    if (!appStore.metronomeEnabled) {
      return;
    }
    if (countInPending.value && event.stopped) {
      return;
    }
    const currentTransportState = alphatabPlayer.getTransportState();
    if (
      event.stopped &&
      model.value.playback === 'playing' &&
      currentTransportState === 'playing'
    ) {
      return;
    }
    if (!event.stopped) {
      return;
    }
    clearPendingStoppedVerification();
    pendingStoppedVerificationTimer.value = globalThis.setTimeout(() => {
      pendingStoppedVerificationTimer.value = null;
      const transportState = alphatabPlayer.getTransportState();
      if (transportState === 'ended') {
        void metronomeCancelScheduled();
        clearMetronomePlaybackStopTimer();
        void metronomeStore.stopSynced();
        if (model.value.playback === 'playing') {
          model.value = playerStop(model.value);
        }
        return;
      }
      const transportStopped = transportState === 'stopped';
      const recentlyAdvanced =
        Date.now() - lastTransportTickAdvanceAtMs.value < 600;
      if (!transportStopped) {
        return;
      }
      if (model.value.playback === 'playing' && recentlyAdvanced) {
        return;
      }
      void metronomeCancelScheduled();
      clearMetronomePlaybackStopTimer();
      void metronomeStore.stopSynced();
      if (model.value.playback === 'playing') {
        model.value = playerStop(model.value);
      }
    }, 350);
  }

  function resetSyncPlaybackState(): void {
    clearPendingStoppedVerification();
    pendingTransportStopSinceMs.value = null;
    lastObservedTransportTick.value = null;
    lastTransportTickAdvanceAtMs.value = Date.now();
    countInActive.value = false;
    pendingMetronomeSyncAnchorTick.value = null;
  }

  function applyMetronomeSettings(): void {
    // Keep alphaTab metronome events enabled, but keep alphaTab audio muted.
    alphatabPlayer.setMetronomeEnabled(true);
    // Some alphaTab builds only emit metronome midi events reliably when the
    // metronome channel is fully active.
    alphatabPlayer.setMetronomeVolume(1);
    alphatabPlayer.setCountInEnabled(false);
    alphatabPlayer.setCountInVolume(0);
  }

  function applyBeatmapToMetronomeScreen(): void {
    const itemId = model.value.currentLibraryItemId;
    if (!itemId) {
      return;
    }
    const entry = beatmapStore.getEntry(itemId);
    if (!entry?.beatmap?.timeEvents?.length) {
      return;
    }
    const te = entry.beatmap.timeEvents[0];
    metronomeStore.applySyncedState({
      bpm: te.bpm,
      timeSigTop: te.timeSigTop,
      timeSigBottom: toTimeSigBottom(te.timeSigBottom),
    });
  }

  function setMetronomeSyncAnchorTick(tick: number | null): void {
    if (typeof tick !== 'number' || !Number.isFinite(tick)) {
      pendingMetronomeSyncAnchorTick.value = null;
      return;
    }
    pendingMetronomeSyncAnchorTick.value = Math.max(0, Math.round(tick));
  }

  return {
    countInTimer,
    countInActive,
    countInToken,
    countInPreviewTimers,
    pendingMetronomeSyncAnchorTick,
    pendingSyncedMetronomeStartTimer,
    pendingSyncedMetronomeStartToken,
    pendingStoppedVerificationTimer,
    pendingTransportStopSinceMs,
    lastObservedTransportTick,
    lastTransportTickAdvanceAtMs,
    countInPending,
    resolveCurrentSyncTick,
    collectMetronomeBarsFromAlphaTab,
    buildBeatmapSyncedConfig,
    scheduleCountInPreview,
    clearCountInPreviewTimers,
    startSyncedMetronome,
    startSyncedMetronomeWhenTransportStarts,
    cancelPendingSyncedMetronomeStart,
    refreshSyncedMetronomeAtCurrentPosition,
    armMetronomePlaybackStopTimer,
    clearMetronomePlaybackStopTimer,
    handleAlphaTabPlayerStateChanged,
    clearPendingStoppedVerification,
    resetSyncPlaybackState,
    applyMetronomeSettings,
    applyBeatmapToMetronomeScreen,
    setMetronomeSyncAnchorTick,
  };
}
