import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  clearIntervalTimer,
  clearIntervalBoundaryAction,
  resetIntervalState,
  startIntervalModeSession,
  finalizeIntervalModeSession,
  intervalMeasureDurationMs,
  resolveNextBarBoundaryMs,
  type IntervalState,
} from '../services/intervalModeManager';

vi.mock('../services/metronomeCommands', () => ({
  metronomeStart: vi.fn().mockResolvedValue(undefined),
  metronomeStop: vi.fn().mockResolvedValue(undefined),
  metronomeSetConfig: vi.fn().mockResolvedValue(undefined),
  metronomeBeep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    recordIntervalModeSession: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeIntervalState(
  overrides: Partial<Record<string, unknown>> = {},
): IntervalState {
  return {
    intervalModeEnabled: ref(false),
    intervalTimerOnlyEnabled: ref(false),
    intervalTimedEnabled: ref(false),
    intervalTotalDurationSeconds: ref(120),
    intervalDurationSeconds: ref(30),
    intervalTotalRemainingSeconds: ref<number | null>(null),
    intervalRemainingSeconds: ref(30),
    intervalBpmIncrementEnabled: ref(false),
    intervalBpmIncrement: ref(0),
    intervalTickTimer: ref<number | null>(null),
    intervalLastTickAtMs: ref<number | null>(null),
    intervalTransitioning: ref(false),
    intervalModeSession: ref(null),
    intervalBarAnchorMs: ref<number | null>(null),
    intervalBoundaryAction: ref<'advance' | 'stop' | null>(null),
    intervalBoundaryAtMs: ref<number | null>(null),
    intervalBoundaryExecuteAtMs: ref<number | null>(null),
    intervalBoundaryTimer: ref<number | null>(null),
    isRunning: ref(false),
    bpm: ref(120),
    timeSigTop: ref(4),
    timeSigBottom: ref(4),
    countInTimer: ref<number | null>(null),
    ...overrides,
  } as unknown as IntervalState;
}

describe('clearIntervalTimer', () => {
  it('clears the tick timer and resets lastTickAtMs', () => {
    vi.useFakeTimers();
    const state = makeIntervalState();
    state.intervalTickTimer.value = globalThis.setInterval(
      () => {},
      100,
    ) as unknown as number;
    state.intervalLastTickAtMs.value = 12345;

    clearIntervalTimer(state);

    expect(state.intervalTickTimer.value).toBeNull();
    expect(state.intervalLastTickAtMs.value).toBeNull();
    vi.useRealTimers();
  });

  it('is safe to call when timer is already null', () => {
    const state = makeIntervalState();
    expect(() => clearIntervalTimer(state)).not.toThrow();
  });
});

describe('clearIntervalBoundaryAction', () => {
  it('clears all boundary action state', () => {
    vi.useFakeTimers();
    const state = makeIntervalState();
    state.intervalBoundaryTimer.value = globalThis.setTimeout(
      () => {},
      1000,
    ) as unknown as number;
    state.intervalBoundaryAction.value = 'advance';
    state.intervalBoundaryAtMs.value = 5000;
    state.intervalBoundaryExecuteAtMs.value = 4975;

    clearIntervalBoundaryAction(state);

    expect(state.intervalBoundaryTimer.value).toBeNull();
    expect(state.intervalBoundaryAction.value).toBeNull();
    expect(state.intervalBoundaryAtMs.value).toBeNull();
    expect(state.intervalBoundaryExecuteAtMs.value).toBeNull();
    vi.useRealTimers();
  });
});

describe('resetIntervalState', () => {
  it('resets timers and remaining seconds', () => {
    const state = makeIntervalState();
    state.intervalTransitioning.value = true;
    state.intervalBarAnchorMs.value = 1000;
    state.intervalRemainingSeconds.value = 5;

    resetIntervalState(state);

    expect(state.intervalTransitioning.value).toBe(false);
    expect(state.intervalBarAnchorMs.value).toBeNull();
    expect(state.intervalRemainingSeconds.value).toBe(30);
    expect(state.intervalTotalRemainingSeconds.value).toBeNull();
  });

  it('sets total remaining when timed mode is enabled', () => {
    const state = makeIntervalState();
    state.intervalTimedEnabled.value = true;
    state.intervalTotalDurationSeconds.value = 300;

    resetIntervalState(state);

    expect(state.intervalTotalRemainingSeconds.value).toBe(300);
  });
});

describe('startIntervalModeSession', () => {
  it('creates a session tracker with current state', () => {
    const state = makeIntervalState();
    state.bpm.value = 80;
    state.intervalTimedEnabled.value = true;
    state.intervalTotalDurationSeconds.value = 600;
    state.intervalDurationSeconds.value = 45;

    startIntervalModeSession(state);

    const session = state.intervalModeSession.value;
    expect(session).not.toBeNull();
    expect(session!.startBpm).toBe(80);
    expect(session!.timedMode).toBe(true);
    expect(session!.plannedTotalSeconds).toBe(600);
    expect(session!.intervalDurationSeconds).toBe(45);
    expect(session!.intervalsCompleted).toBe(0);
  });

  it('uses MIN_INTERVAL_SECONDS for very small durations', () => {
    const state = makeIntervalState();
    state.intervalDurationSeconds.value = 0;

    startIntervalModeSession(state);

    expect(state.intervalModeSession.value!.intervalDurationSeconds).toBe(1);
  });
});

describe('finalizeIntervalModeSession', () => {
  it('clears the session tracker', async () => {
    const state = makeIntervalState();
    state.intervalModeSession.value = {
      startedAtMs: Date.now() - 5000,
      startedAtIso: new Date(Date.now() - 5000).toISOString(),
      timedMode: false,
      plannedTotalSeconds: null,
      intervalDurationSeconds: 30,
      startBpm: 120,
      intervalsCompleted: 2,
    };

    await finalizeIntervalModeSession(state);

    expect(state.intervalModeSession.value).toBeNull();
  });

  it('does nothing when session is null', async () => {
    const state = makeIntervalState();
    await expect(finalizeIntervalModeSession(state)).resolves.toBeUndefined();
  });
});

describe('intervalMeasureDurationMs', () => {
  it('calculates measure duration for 4/4 at 120 bpm', () => {
    const duration = intervalMeasureDurationMs(120, 4, 4);
    expect(duration).toBe(2000);
  });

  it('calculates measure duration for 3/8 at 60 bpm', () => {
    const duration = intervalMeasureDurationMs(60, 3, 8);
    expect(duration).toBe(1500);
  });

  it('calculates measure duration for 6/8 at 120 bpm', () => {
    const duration = intervalMeasureDurationMs(120, 6, 8);
    expect(duration).toBe(1500);
  });
});

describe('resolveNextBarBoundaryMs', () => {
  it('returns anchor when reference <= anchor', () => {
    expect(resolveNextBarBoundaryMs(100, 200, 120, 4, 4)).toBe(200);
  });

  it('returns the next bar boundary after reference', () => {
    const anchor = 0;
    const result = resolveNextBarBoundaryMs(1500, anchor, 120, 4, 4);
    expect(result).toBe(2000);
  });

  it('uses reference as anchor when barAnchorMs is null', () => {
    const result = resolveNextBarBoundaryMs(1000, null, 120, 4, 4);
    expect(result).toBe(1000);
  });
});
