import type { Ref } from 'vue';
import type { useAppStore } from '../app';
import {
  resetIntervalState,
  MIN_INTERVAL_SECONDS,
  type IntervalState,
} from '../../services/intervalModeManager';
import { metronomeSetConfig } from '../../services/metronomeCommands';
import type { MetronomeConfig as CommandConfig } from '../../services/metronomeCommands';

export interface IntervalModeDeps {
  intervalModeEnabled: Ref<boolean>;
  intervalTimerOnlyEnabled: Ref<boolean>;
  intervalTimedEnabled: Ref<boolean>;
  intervalTotalDurationSeconds: Ref<number>;
  intervalDurationSeconds: Ref<number>;
  intervalTotalRemainingSeconds: Ref<number | null>;
  intervalRemainingSeconds: Ref<number>;
  intervalBpmIncrementEnabled: Ref<boolean>;
  intervalBpmIncrement: Ref<number>;
  intervalTransitioning: Ref<boolean>;
  restoreSyncAfterIntervalMode: Ref<boolean>;
  isRunning: Ref<boolean>;
  isSyncActive: { value: boolean };
  appStore: ReturnType<typeof useAppStore>;
  getIntervalState: () => IntervalState;
  buildCommandConfig: () => CommandConfig;
  setRunning: (next: boolean) => Promise<void>;
}

export function createIntervalModeConfig(deps: IntervalModeDeps) {
  function setIntervalModeEnabled(enabled: boolean): void {
    if (enabled) {
      deps.restoreSyncAfterIntervalMode.value = deps.appStore.metronomeEnabled;
      if (deps.appStore.metronomeEnabled) {
        deps.appStore.setMetronomeEnabled(false);
      }
    } else if (deps.restoreSyncAfterIntervalMode.value) {
      deps.appStore.setMetronomeEnabled(true);
      deps.restoreSyncAfterIntervalMode.value = false;
    }
    deps.intervalModeEnabled.value = enabled;
    deps.appStore.setIntervalModeEnabled(enabled);
    resetIntervalState(deps.getIntervalState());
    if (!enabled && deps.intervalTransitioning.value) {
      deps.intervalTransitioning.value = false;
    }
    if (!enabled || !deps.isRunning.value || deps.isSyncActive.value) {
      return;
    }
    void deps.setRunning(false).then(() => {
      void deps.setRunning(true);
    });
  }

  function setIntervalTimedEnabled(enabled: boolean): void {
    deps.intervalTimedEnabled.value = enabled;
    deps.appStore.setIntervalTimedEnabled(enabled);
    deps.intervalTotalRemainingSeconds.value = enabled
      ? deps.intervalTotalDurationSeconds.value
      : null;
  }

  function setIntervalTimerOnlyEnabled(enabled: boolean): void {
    deps.intervalTimerOnlyEnabled.value = enabled;
    deps.appStore.setIntervalTimerOnlyEnabled(enabled);
    if (deps.isRunning.value && !deps.isSyncActive.value) {
      void metronomeSetConfig(deps.buildCommandConfig());
    }
  }

  function setIntervalTotalDurationSeconds(value: number): void {
    deps.intervalTotalDurationSeconds.value = Math.max(0, Math.round(value));
    deps.appStore.setIntervalTotalDurationSeconds(
      deps.intervalTotalDurationSeconds.value,
    );
    if (deps.intervalTimedEnabled.value && !deps.isRunning.value) {
      deps.intervalTotalRemainingSeconds.value =
        deps.intervalTotalDurationSeconds.value;
    }
  }

  function setIntervalDurationSeconds(value: number): void {
    deps.intervalDurationSeconds.value = Math.max(
      MIN_INTERVAL_SECONDS,
      Math.round(value),
    );
    deps.appStore.setIntervalDurationSeconds(
      deps.intervalDurationSeconds.value,
    );
    if (!deps.isRunning.value) {
      deps.intervalRemainingSeconds.value = deps.intervalDurationSeconds.value;
    }
  }

  function setIntervalBpmIncrementEnabled(enabled: boolean): void {
    deps.intervalBpmIncrementEnabled.value = enabled;
    deps.appStore.setIntervalBpmIncrementEnabled(enabled);
  }

  function setIntervalBpmIncrement(value: number): void {
    deps.intervalBpmIncrement.value = Math.max(0, Math.round(value));
    deps.appStore.setIntervalBpmIncrement(deps.intervalBpmIncrement.value);
  }

  return {
    setIntervalModeEnabled,
    setIntervalTimedEnabled,
    setIntervalTimerOnlyEnabled,
    setIntervalTotalDurationSeconds,
    setIntervalDurationSeconds,
    setIntervalBpmIncrementEnabled,
    setIntervalBpmIncrement,
  };
}
