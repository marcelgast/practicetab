import type { Ref } from 'vue';
import {
  metronomeBeep,
  metronomeSetConfig,
  metronomeStop,
} from './metronomeCommands';
import { practicePersistence } from './practicePersistence';
import {
  buildCommandConfig,
  type ConfigInputs,
} from './metronomeConfigBuilder';

export const MIN_INTERVAL_SECONDS = 1;
export const INTERVAL_TICK_MS = 100;
export const INTERVAL_STOP_LEAD_MS = 25;
/**
 * Time to wait after queuing the end-of-interval beep before stopping
 * the metronome engine. The Rust engine plays 2 blips at 180ms spacing
 * with 140ms duration each (~320ms total). 800ms gives comfortable
 * margin for the beep to finish before the fade-out clears pending blips.
 */
export const BEEP_PLAY_DURATION_MS = 800;
export const INTERVAL_ADVANCE_LEAD_MS = 25;

export type IntervalModeSessionTracker = {
  startedAtMs: number;
  startedAtIso: string;
  timedMode: boolean;
  plannedTotalSeconds: number | null;
  intervalDurationSeconds: number;
  startBpm: number;
  intervalsCompleted: number;
};

export type IntervalState = {
  intervalModeEnabled: Ref<boolean>;
  intervalTimerOnlyEnabled: Ref<boolean>;
  intervalTimedEnabled: Ref<boolean>;
  intervalTotalDurationSeconds: Ref<number>;
  intervalDurationSeconds: Ref<number>;
  intervalTotalRemainingSeconds: Ref<number | null>;
  intervalRemainingSeconds: Ref<number>;
  intervalBpmIncrementEnabled: Ref<boolean>;
  intervalBpmIncrement: Ref<number>;
  intervalTickTimer: Ref<number | null>;
  intervalLastTickAtMs: Ref<number | null>;
  intervalTransitioning: Ref<boolean>;
  intervalModeSession: Ref<IntervalModeSessionTracker | null>;
  intervalBarAnchorMs: Ref<number | null>;
  intervalBoundaryAction: Ref<'advance' | 'stop' | null>;
  intervalBoundaryAtMs: Ref<number | null>;
  intervalBoundaryExecuteAtMs: Ref<number | null>;
  intervalBoundaryTimer: Ref<number | null>;
  isRunning: Ref<boolean>;
  bpm: Ref<number>;
  timeSigTop: Ref<number>;
  timeSigBottom: Ref<number>;
  countInTimer: Ref<number | null>;
};

export function clearIntervalTimer(state: IntervalState): void {
  if (state.intervalTickTimer.value !== null) {
    globalThis.clearInterval(state.intervalTickTimer.value);
    state.intervalTickTimer.value = null;
  }
  state.intervalLastTickAtMs.value = null;
}

export function clearIntervalBoundaryAction(state: IntervalState): void {
  if (state.intervalBoundaryTimer.value !== null) {
    globalThis.clearTimeout(state.intervalBoundaryTimer.value);
    state.intervalBoundaryTimer.value = null;
  }
  state.intervalBoundaryAction.value = null;
  state.intervalBoundaryAtMs.value = null;
  state.intervalBoundaryExecuteAtMs.value = null;
}

export async function playIntervalBoundaryBeeps(): Promise<void> {
  void metronomeBeep();
}

export function intervalMeasureDurationMs(
  targetBpm: number,
  timeSigTop: number,
  timeSigBottom: number,
): number {
  const beatDurationMs = (60_000 / targetBpm) * (4 / timeSigBottom);
  return beatDurationMs * timeSigTop;
}

export function resolveNextBarBoundaryMs(
  referenceMs: number,
  barAnchorMs: number | null,
  targetBpm: number,
  timeSigTop: number,
  timeSigBottom: number,
): number {
  const measureDurationMs = intervalMeasureDurationMs(
    targetBpm,
    timeSigTop,
    timeSigBottom,
  );
  const anchor = barAnchorMs ?? referenceMs;
  if (referenceMs <= anchor) {
    return anchor;
  }
  const measuresElapsed = Math.ceil((referenceMs - anchor) / measureDurationMs);
  return anchor + measuresElapsed * measureDurationMs;
}

function isIntervalTimerOnlyActive(state: IntervalState): boolean {
  return (
    state.intervalModeEnabled.value && state.intervalTimerOnlyEnabled.value
  );
}

export function scheduleIntervalBoundaryAction(
  state: IntervalState,
  action: 'advance' | 'stop',
  referenceMs: number,
  onExecute: (nowMs: number) => Promise<void>,
): void {
  if (state.intervalBoundaryAction.value === 'stop') {
    return;
  }
  if (
    state.intervalBoundaryAction.value === 'advance' &&
    action === 'advance'
  ) {
    return;
  }
  const boundaryMs = resolveNextBarBoundaryMs(
    referenceMs,
    state.intervalBarAnchorMs.value,
    state.bpm.value,
    state.timeSigTop.value,
    state.timeSigBottom.value,
  );
  const executeAtMs =
    action === 'stop'
      ? Math.max(referenceMs, boundaryMs - INTERVAL_STOP_LEAD_MS)
      : Math.max(referenceMs, boundaryMs - INTERVAL_ADVANCE_LEAD_MS);
  state.intervalBoundaryAction.value = action;
  state.intervalBoundaryAtMs.value = boundaryMs;
  state.intervalBoundaryExecuteAtMs.value = executeAtMs;
  if (state.intervalBoundaryTimer.value !== null) {
    globalThis.clearTimeout(state.intervalBoundaryTimer.value);
    state.intervalBoundaryTimer.value = null;
  }
  const delayMs = Math.max(0, executeAtMs - Date.now());
  state.intervalBoundaryTimer.value = globalThis.setTimeout(() => {
    state.intervalBoundaryTimer.value = null;
    void onExecute(Date.now());
  }, delayMs) as unknown as number;
}

export async function applyIntervalAdvanceAtBoundary(
  state: IntervalState,
  boundaryMs: number,
  getConfigInputs: () => ConfigInputs,
  setBpm: (value: number) => void,
): Promise<void> {
  if (!state.isRunning.value || !state.intervalModeEnabled.value) {
    clearIntervalBoundaryAction(state);
    return;
  }
  state.intervalTransitioning.value = true;
  if (state.intervalModeSession.value) {
    state.intervalModeSession.value = {
      ...state.intervalModeSession.value,
      intervalsCompleted:
        state.intervalModeSession.value.intervalsCompleted + 1,
    };
  }
  if (
    state.intervalBpmIncrementEnabled.value &&
    state.intervalBpmIncrement.value > 0
  ) {
    setBpm(state.bpm.value + state.intervalBpmIncrement.value);
    await metronomeSetConfig(buildCommandConfig(getConfigInputs()));
  }
  state.intervalRemainingSeconds.value = Math.max(
    MIN_INTERVAL_SECONDS,
    state.intervalDurationSeconds.value,
  );
  state.intervalBarAnchorMs.value = boundaryMs;
  clearIntervalBoundaryAction(state);
  state.intervalTransitioning.value = false;
}

export async function stopIntervalAtBoundary(
  state: IntervalState,
  finalizeSession: () => Promise<void>,
): Promise<void> {
  clearIntervalBoundaryAction(state);
  clearIntervalTimer(state);
  state.intervalTransitioning.value = true;
  state.isRunning.value = false;
  // Play the end signal BEFORE stopping the metronome engine.
  // metronomeStop() initiates a fade-out that clears pending blips,
  // so the beep must be queued while the engine is still alive.
  // Wait for the beep to finish playing before stopping.
  if (
    state.intervalTimedEnabled.value &&
    typeof state.intervalTotalRemainingSeconds.value === 'number' &&
    state.intervalTotalRemainingSeconds.value <= 0
  ) {
    await playIntervalBoundaryBeeps();
    await new Promise((resolve) =>
      globalThis.setTimeout(resolve, BEEP_PLAY_DURATION_MS),
    );
  }
  await metronomeStop();
  if (state.countInTimer.value) {
    globalThis.clearTimeout(state.countInTimer.value);
    state.countInTimer.value = null;
  }
  await finalizeSession();
  state.intervalTransitioning.value = false;
}

export async function maybeExecuteIntervalBoundaryAction(
  state: IntervalState,
  nowMs: number,
  getConfigInputs: () => ConfigInputs,
  setBpm: (value: number) => void,
  finalizeSession: () => Promise<void>,
): Promise<void> {
  const action = state.intervalBoundaryAction.value;
  const executeAtMs = state.intervalBoundaryExecuteAtMs.value;
  if (!action || executeAtMs === null || nowMs < executeAtMs) {
    return;
  }
  if (action === 'stop') {
    await stopIntervalAtBoundary(state, finalizeSession);
    return;
  }
  const boundaryMs = state.intervalBoundaryAtMs.value ?? nowMs;
  await applyIntervalAdvanceAtBoundary(
    state,
    boundaryMs,
    getConfigInputs,
    setBpm,
  );
}

export function resetIntervalState(state: IntervalState): void {
  clearIntervalTimer(state);
  clearIntervalBoundaryAction(state);
  state.intervalTransitioning.value = false;
  state.intervalBarAnchorMs.value = null;
  state.intervalTotalRemainingSeconds.value = state.intervalTimedEnabled.value
    ? state.intervalTotalDurationSeconds.value
    : null;
  state.intervalRemainingSeconds.value = Math.max(
    MIN_INTERVAL_SECONDS,
    state.intervalDurationSeconds.value,
  );
}

export function startIntervalModeSession(state: IntervalState): void {
  state.intervalModeSession.value = {
    startedAtMs: Date.now(),
    startedAtIso: new Date().toISOString(),
    timedMode: state.intervalTimedEnabled.value,
    plannedTotalSeconds: state.intervalTimedEnabled.value
      ? state.intervalTotalDurationSeconds.value
      : null,
    intervalDurationSeconds: Math.max(
      MIN_INTERVAL_SECONDS,
      state.intervalDurationSeconds.value,
    ),
    startBpm: state.bpm.value,
    intervalsCompleted: 0,
  };
}

export async function finalizeIntervalModeSession(
  state: IntervalState,
): Promise<void> {
  const tracker = state.intervalModeSession.value;
  state.intervalModeSession.value = null;
  if (!tracker) {
    return;
  }
  const endedAt = new Date();
  const actualRunSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - tracker.startedAtMs) / 1000),
  );
  if (actualRunSeconds <= 0 && tracker.intervalsCompleted <= 0) {
    return;
  }
  try {
    await practicePersistence.recordIntervalModeSession({
      sessionDate: endedAt.toISOString().slice(0, 10),
      startedAt: tracker.startedAtIso,
      endedAt: endedAt.toISOString(),
      timedMode: tracker.timedMode,
      plannedTotalSeconds: tracker.plannedTotalSeconds,
      actualRunSeconds,
      intervalDurationSeconds: tracker.intervalDurationSeconds,
      intervalsCompleted: tracker.intervalsCompleted,
      startBpm: tracker.startBpm,
      endBpm: state.bpm.value,
    });
  } catch (error) {
    void error;
  }
}

export function startIntervalTimer(
  state: IntervalState,
  getConfigInputs: () => ConfigInputs,
  setBpm: (value: number) => void,
  finalizeSession: () => Promise<void>,
): void {
  clearIntervalTimer(state);
  state.intervalLastTickAtMs.value = Date.now();
  state.intervalTickTimer.value = globalThis.setInterval(() => {
    const now = Date.now();
    if (
      !state.isRunning.value ||
      !state.intervalModeEnabled.value ||
      state.intervalTransitioning.value
    ) {
      state.intervalLastTickAtMs.value = now;
      return;
    }
    const last = state.intervalLastTickAtMs.value ?? now;
    const elapsedSeconds = Math.max(0, (now - last) / 1000);
    state.intervalLastTickAtMs.value = now;
    if (elapsedSeconds <= 0) {
      return;
    }
    const prevIntervalRemaining = state.intervalRemainingSeconds.value;
    const prevTotalRemaining =
      state.intervalTimedEnabled.value &&
      typeof state.intervalTotalRemainingSeconds.value === 'number'
        ? state.intervalTotalRemainingSeconds.value
        : null;
    if (
      state.intervalTimedEnabled.value &&
      typeof state.intervalTotalRemainingSeconds.value === 'number'
    ) {
      state.intervalTotalRemainingSeconds.value = Math.max(
        0,
        state.intervalTotalRemainingSeconds.value - elapsedSeconds,
      );
    }
    if (!state.intervalBoundaryAction.value) {
      state.intervalRemainingSeconds.value = Math.max(
        0,
        state.intervalRemainingSeconds.value - elapsedSeconds,
      );
    }
    const crossedTotal =
      state.intervalTimedEnabled.value &&
      prevTotalRemaining !== null &&
      prevTotalRemaining > 0 &&
      typeof state.intervalTotalRemainingSeconds.value === 'number' &&
      state.intervalTotalRemainingSeconds.value <= 0;
    if (crossedTotal) {
      state.intervalRemainingSeconds.value = 0;
      const referenceMs = last + prevTotalRemaining * 1000;
      if (isIntervalTimerOnlyActive(state)) {
        void stopIntervalAtBoundary(state, finalizeSession);
        return;
      }
      const onExecute = (ms: number) =>
        maybeExecuteIntervalBoundaryAction(
          state,
          ms,
          getConfigInputs,
          setBpm,
          finalizeSession,
        );
      scheduleIntervalBoundaryAction(state, 'stop', referenceMs, onExecute);
      void maybeExecuteIntervalBoundaryAction(
        state,
        now,
        getConfigInputs,
        setBpm,
        finalizeSession,
      );
      return;
    }
    if (state.intervalBoundaryAction.value) {
      void maybeExecuteIntervalBoundaryAction(
        state,
        now,
        getConfigInputs,
        setBpm,
        finalizeSession,
      );
      return;
    }
    const crossedInterval =
      prevIntervalRemaining > 0 && state.intervalRemainingSeconds.value <= 0;
    if (crossedInterval) {
      const referenceMs = last + prevIntervalRemaining * 1000;
      void playIntervalBoundaryBeeps();
      if (isIntervalTimerOnlyActive(state)) {
        void applyIntervalAdvanceAtBoundary(
          state,
          referenceMs,
          getConfigInputs,
          setBpm,
        );
        return;
      }
      const onExecute = (ms: number) =>
        maybeExecuteIntervalBoundaryAction(
          state,
          ms,
          getConfigInputs,
          setBpm,
          finalizeSession,
        );
      scheduleIntervalBoundaryAction(state, 'advance', referenceMs, onExecute);
      void maybeExecuteIntervalBoundaryAction(
        state,
        now,
        getConfigInputs,
        setBpm,
        finalizeSession,
      );
      return;
    }
    void maybeExecuteIntervalBoundaryAction(
      state,
      now,
      getConfigInputs,
      setBpm,
      finalizeSession,
    );
  }, INTERVAL_TICK_MS) as unknown as number;
}
