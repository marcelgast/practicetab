import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useAppStore } from './app';
import {
  metronomeSetConfig,
  metronomeStart,
  metronomeStop,
  type MetronomeConfig as CommandConfig,
} from '../services/metronomeCommands';
import {
  clampNumber,
  createBeatStates,
  nextBeatState,
  buildDefaultBeatStates,
  scaledVolume,
  buildCommandConfig as buildCommandConfigFromInputs,
  buildSyncedConfig as buildSyncedConfigFromInputs,
  VALID_DENOMINATORS,
  MIN_NUMERATOR,
  MAX_NUMERATOR,
  type BeatState,
  type SubdivisionValue,
  type TimeSigBottom,
  type SoundMode,
  type ConfigInputs,
} from '../services/metronomeConfigBuilder';
import {
  clearIntervalTimer,
  clearIntervalBoundaryAction,
  startIntervalModeSession,
  finalizeIntervalModeSession,
  startIntervalTimer,
  MIN_INTERVAL_SECONDS,
  type IntervalModeSessionTracker,
  type IntervalState,
} from '../services/intervalModeManager';
import { createIntervalModeConfig } from './metronome/intervalMode';

export type { BeatState, SubdivisionValue, TimeSigBottom, SoundMode };

export const useMetronomeStore = defineStore('metronome', () => {
  const appStore = useAppStore();

  const bpm = ref(60);
  const timeSigTop = ref(4);
  const timeSigBottom = ref<TimeSigBottom>(4);
  const volume = ref(appStore.metronomeVolume);
  const beatStates = ref<BeatState[]>(createBeatStates(timeSigTop.value));
  const subdivisionsEnabled = ref(false);
  const subdivisionsValue = ref<SubdivisionValue>(2);
  const soundMode = ref<SoundMode>('tock');
  const isRunning = ref(false);
  const lastSyncedConfig = ref<CommandConfig | null>(null);
  const countInTimer = ref<number | null>(null);
  const isSyncedToTab = computed(() => appStore.metronomeEnabled);
  const hasLoadedTab = ref(false);
  const hasLoadedSongWithBeatmap = ref(false);
  const isSyncActive = computed(
    () =>
      isSyncedToTab.value &&
      (hasLoadedTab.value || hasLoadedSongWithBeatmap.value),
  );
  const countInEnabled = computed(() => appStore.countInEnabled);
  const countInBars = computed(() => appStore.countInBars);
  const debounceHandle = ref<number | null>(null);
  const intervalModeEnabled = ref(false);
  const intervalTimerOnlyEnabled = ref(appStore.intervalTimerOnlyEnabled);
  const intervalTimedEnabled = ref(appStore.intervalTimedEnabled);
  const intervalTotalDurationSeconds = ref(
    appStore.intervalTotalDurationSeconds,
  );
  const intervalDurationSeconds = ref(appStore.intervalDurationSeconds);
  const intervalTotalRemainingSeconds = ref<number | null>(null);
  const intervalRemainingSeconds = ref(intervalDurationSeconds.value);
  const intervalBpmIncrementEnabled = ref(appStore.intervalBpmIncrementEnabled);
  const intervalBpmIncrement = ref(appStore.intervalBpmIncrement);
  const restoreSyncAfterIntervalMode = ref(false);
  const intervalTickTimer = ref<number | null>(null);
  const intervalLastTickAtMs = ref<number | null>(null);
  const intervalTransitioning = ref(false);
  const intervalModeSession = ref<IntervalModeSessionTracker | null>(null);
  const intervalBarAnchorMs = ref<number | null>(null);
  const intervalBoundaryAction = ref<'advance' | 'stop' | null>(null);
  const intervalBoundaryAtMs = ref<number | null>(null);
  const intervalBoundaryExecuteAtMs = ref<number | null>(null);
  const intervalBoundaryTimer = ref<number | null>(null);

  function getIntervalState(): IntervalState {
    return {
      intervalModeEnabled,
      intervalTimerOnlyEnabled,
      intervalTimedEnabled,
      intervalTotalDurationSeconds,
      intervalDurationSeconds,
      intervalTotalRemainingSeconds,
      intervalRemainingSeconds,
      intervalBpmIncrementEnabled,
      intervalBpmIncrement,
      intervalTickTimer,
      intervalLastTickAtMs,
      intervalTransitioning,
      intervalModeSession,
      intervalBarAnchorMs,
      intervalBoundaryAction,
      intervalBoundaryAtMs,
      intervalBoundaryExecuteAtMs,
      intervalBoundaryTimer,
      isRunning,
      bpm,
      timeSigTop,
      timeSigBottom,
      countInTimer,
    };
  }

  function getConfigInputs(): ConfigInputs {
    return {
      bpm: bpm.value,
      timeSigTop: timeSigTop.value,
      timeSigBottom: timeSigBottom.value,
      volume: volume.value,
      beatStates: beatStates.value,
      subdivisionsEnabled: subdivisionsEnabled.value,
      subdivisionsValue: subdivisionsValue.value,
      soundMode: soundMode.value,
      countInBars: countInBars.value,
      countInEnabled: countInEnabled.value,
      intervalModeEnabled: intervalModeEnabled.value,
      intervalTimerOnlyEnabled: intervalTimerOnlyEnabled.value,
    };
  }

  function buildCommandConfig(): CommandConfig {
    return buildCommandConfigFromInputs(getConfigInputs());
  }
  function buildSyncedConfig(
    overrides: Partial<
      Pick<
        CommandConfig,
        | 'bpm'
        | 'timeSigTop'
        | 'timeSigBottom'
        | 'beatStates'
        | 'startBeatIndex'
        | 'startSubIndex'
        | 'startDelayMs'
      >
    >,
  ): CommandConfig {
    return buildSyncedConfigFromInputs(getConfigInputs(), overrides);
  }
  function doFinalizeSession(): Promise<void> {
    return finalizeIntervalModeSession(getIntervalState());
  }

  function scheduleConfigUpdate(): void {
    if (!isRunning.value || isSyncActive.value || intervalTransitioning.value) {
      return;
    }
    if (debounceHandle.value) {
      globalThis.clearTimeout(debounceHandle.value);
    }
    debounceHandle.value = globalThis.setTimeout(() => {
      debounceHandle.value = null;
      void metronomeSetConfig(buildCommandConfig());
    }, 100);
  }

  function applyVolumeUpdate(nextVolume: number): void {
    if (!isRunning.value) {
      void metronomeStop();
      return;
    }
    if (!isSyncActive.value) {
      void metronomeSetConfig(buildCommandConfig());
      return;
    }
    const baseConfig =
      lastSyncedConfig.value ??
      (isSyncActive.value ? buildSyncedConfig({}) : buildCommandConfig());
    const nextConfig = { ...baseConfig, volume: scaledVolume(nextVolume) };
    void metronomeSetConfig(nextConfig);
    if (isSyncActive.value) {
      lastSyncedConfig.value = nextConfig;
    }
  }

  function setBpm(value: number): void {
    bpm.value = clampNumber(value, 20, 400);
    if (isRunning.value && !isSyncActive.value && intervalModeEnabled.value) {
      if (!intervalTransitioning.value) {
        void metronomeSetConfig(buildCommandConfig());
      }
      return;
    }
    if (isSyncActive.value && isRunning.value && lastSyncedConfig.value) {
      const config = { ...lastSyncedConfig.value, bpm: bpm.value };
      lastSyncedConfig.value = config;
      void metronomeSetConfig(config);
      return;
    }
    scheduleConfigUpdate();
  }

  function setVolume(value: number): void {
    volume.value = clampNumber(value, 0, 100);
    appStore.setMetronomeVolume(volume.value);
    applyVolumeUpdate(volume.value);
  }

  function setTimeSigTop(value: number): void {
    const next = clampNumber(value, MIN_NUMERATOR, MAX_NUMERATOR);
    timeSigTop.value = next;
    beatStates.value = createBeatStates(next, beatStates.value);
    scheduleConfigUpdate();
  }

  function setTimeSigBottom(value: number): void {
    if (!VALID_DENOMINATORS.has(value)) {
      return;
    }
    timeSigBottom.value = value as TimeSigBottom;
    scheduleConfigUpdate();
  }
  function cycleBeat(index: number): void {
    if (index < 0 || index >= beatStates.value.length) {
      return;
    }
    beatStates.value = beatStates.value.map((state, idx) => {
      if (idx !== index) {
        return state;
      }
      return nextBeatState(state);
    });
    scheduleConfigUpdate();
  }
  function setSubdivisions(enabled: boolean, value?: SubdivisionValue): void {
    subdivisionsEnabled.value = enabled;
    if (value && enabled) {
      subdivisionsValue.value = value;
    }
    scheduleConfigUpdate();
  }
  function setSoundMode(value: SoundMode): void {
    soundMode.value = value;
    scheduleConfigUpdate();
  }

  const intervalModeConfig = createIntervalModeConfig({
    intervalModeEnabled,
    intervalTimerOnlyEnabled,
    intervalTimedEnabled,
    intervalTotalDurationSeconds,
    intervalDurationSeconds,
    intervalTotalRemainingSeconds,
    intervalRemainingSeconds,
    intervalBpmIncrementEnabled,
    intervalBpmIncrement,
    intervalTransitioning,
    restoreSyncAfterIntervalMode,
    isRunning,
    isSyncActive,
    appStore,
    getIntervalState,
    buildCommandConfig,
    setRunning,
  });

  async function setRunning(next: boolean): Promise<void> {
    if (isSyncActive.value) {
      isRunning.value = false;
      return;
    }
    if (isRunning.value === next) {
      return;
    }
    isRunning.value = next;
    const iState = getIntervalState();
    if (next) {
      if (intervalModeEnabled.value) {
        startIntervalModeSession(iState);
        intervalTotalRemainingSeconds.value = intervalTimedEnabled.value
          ? intervalTotalDurationSeconds.value
          : null;
        intervalRemainingSeconds.value = Math.max(
          MIN_INTERVAL_SECONDS,
          intervalDurationSeconds.value,
        );
        clearIntervalBoundaryAction(iState);
      }
      await metronomeStart(buildCommandConfig());
      if (intervalModeEnabled.value) {
        intervalBarAnchorMs.value = Date.now();
        startIntervalTimer(iState, getConfigInputs, setBpm, doFinalizeSession);
      }
      if (countInTimer.value) {
        globalThis.clearTimeout(countInTimer.value);
        countInTimer.value = null;
      }
      if (countInEnabled.value) {
        const bars = Math.min(
          ...(countInBars.value.length ? countInBars.value : [0]),
        );
        if (bars > 0) {
          const beatSeconds = (60 / bpm.value) * (4 / timeSigBottom.value);
          const delayMs = bars * timeSigTop.value * beatSeconds * 1000;
          countInTimer.value = globalThis.setTimeout(() => {
            appStore.setCountInEnabled(false);
            countInTimer.value = null;
          }, delayMs);
        } else {
          appStore.setCountInEnabled(false);
        }
      }
    } else {
      clearIntervalTimer(iState);
      clearIntervalBoundaryAction(iState);
      intervalTransitioning.value = false;
      intervalBarAnchorMs.value = null;
      await metronomeStop();
      if (countInTimer.value) {
        globalThis.clearTimeout(countInTimer.value);
        countInTimer.value = null;
      }
      if (intervalModeEnabled.value) {
        await doFinalizeSession();
      } else {
        intervalModeSession.value = null;
      }
    }
  }
  function toggleRunning(): void {
    void setRunning(!isRunning.value);
  }
  async function startSynced(config: CommandConfig): Promise<void> {
    lastSyncedConfig.value = config;
    await metronomeStart(config);
    isRunning.value = true;
  }
  async function stopSynced(): Promise<void> {
    clearIntervalTimer(getIntervalState());
    intervalTransitioning.value = false;
    isRunning.value = false;
    await metronomeStop();
  }
  async function updateSyncedConfig(config: CommandConfig): Promise<void> {
    if (!isRunning.value) {
      return;
    }
    lastSyncedConfig.value = config;
    await metronomeStart(config);
  }
  function setCountInBars(value: number[]): void {
    appStore.setCountInBars(value);
    scheduleConfigUpdate();
  }
  function setTabLoaded(value: boolean): void {
    hasLoadedTab.value = value;
  }
  function setSongWithBeatmapLoaded(value: boolean): void {
    hasLoadedSongWithBeatmap.value = value;
  }
  function applySyncedState(next: {
    bpm: number;
    timeSigTop: number;
    timeSigBottom: TimeSigBottom;
  }): void {
    const nextBpm = clampNumber(next.bpm, 20, 400);
    const nextTop = clampNumber(next.timeSigTop, MIN_NUMERATOR, MAX_NUMERATOR);
    const unchanged =
      bpm.value === nextBpm &&
      timeSigTop.value === nextTop &&
      timeSigBottom.value === next.timeSigBottom &&
      beatStates.value.length === nextTop;
    if (unchanged) {
      return;
    }
    bpm.value = nextBpm;
    timeSigTop.value = nextTop;
    timeSigBottom.value = next.timeSigBottom;
    beatStates.value = buildDefaultBeatStates(timeSigTop.value);
  }

  watch(isSyncActive, (synced) => {
    if (synced && !lastSyncedConfig.value) {
      void metronomeStop();
      isRunning.value = false;
      clearIntervalTimer(getIntervalState());
      intervalTransitioning.value = false;
    }
    if (synced && intervalModeEnabled.value) {
      intervalModeConfig.setIntervalModeEnabled(false);
    }
  });
  watch(
    () => appStore.metronomeVolume,
    (value) => {
      if (volume.value === value) {
        return;
      }
      volume.value = value;
      applyVolumeUpdate(value);
    },
  );

  return {
    bpm,
    timeSigTop,
    timeSigBottom,
    volume,
    beatStates,
    subdivisionsEnabled,
    subdivisionsValue,
    soundMode,
    intervalModeEnabled,
    intervalTimerOnlyEnabled,
    intervalTimedEnabled,
    intervalTotalDurationSeconds,
    intervalDurationSeconds,
    intervalTotalRemainingSeconds,
    intervalRemainingSeconds,
    intervalBpmIncrementEnabled,
    intervalBpmIncrement,
    isRunning,
    isSyncedToTab,
    isSyncActive,
    hasLoadedTab,
    hasLoadedSongWithBeatmap,
    setSongWithBeatmapLoaded,
    countInEnabled,
    countInBars,
    buildCommandConfig,
    buildSyncedConfig,
    setBpm,
    setVolume,
    setTimeSigTop,
    setTimeSigBottom,
    cycleBeat,
    setSubdivisions,
    setSoundMode,
    setIntervalModeEnabled: intervalModeConfig.setIntervalModeEnabled,
    setIntervalTimerOnlyEnabled: intervalModeConfig.setIntervalTimerOnlyEnabled,
    setIntervalTimedEnabled: intervalModeConfig.setIntervalTimedEnabled,
    setIntervalTotalDurationSeconds:
      intervalModeConfig.setIntervalTotalDurationSeconds,
    setIntervalDurationSeconds: intervalModeConfig.setIntervalDurationSeconds,
    setIntervalBpmIncrementEnabled:
      intervalModeConfig.setIntervalBpmIncrementEnabled,
    setIntervalBpmIncrement: intervalModeConfig.setIntervalBpmIncrement,
    setRunning,
    toggleRunning,
    startSynced,
    stopSynced,
    updateSyncedConfig,
    setCountInBars,
    setTabLoaded,
    applySyncedState,
  };
});
