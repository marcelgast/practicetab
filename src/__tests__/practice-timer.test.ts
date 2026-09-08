// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    addSessionTime: vi.fn().mockResolvedValue(undefined),
    addPlaybackTime: vi.fn().mockResolvedValue(undefined),
    addExerciseTime: vi.fn().mockResolvedValue(undefined),
    startSessionIfNeeded: vi.fn().mockResolvedValue(undefined),
    confirmClose: vi.fn().mockResolvedValue(undefined),
  },
}));

import { practicePersistence } from '../services/practicePersistence';
import { usePracticeTimerStore } from '../stores/practiceTimer';

const persistence = practicePersistence as unknown as {
  addSessionTime: ReturnType<typeof vi.fn>;
};

describe('usePracticeTimerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts running and ticks 1s of session time per tick', async () => {
    const store = usePracticeTimerStore();
    expect(store.isRunning).toBe(false);

    store.start();
    expect(store.isRunning).toBe(true);

    vi.advanceTimersByTime(3000);
    // Three 1s ticks = 3 persistence calls (no buffering — per-second flush
    // so an abrupt crash loses at most 1s).
    expect(persistence.addSessionTime).toHaveBeenCalledTimes(3);
    expect(persistence.addSessionTime).toHaveBeenLastCalledWith(1);
    expect(store.elapsedSec).toBe(3);
  });

  it('stop flushes the final partial second and clears the interval', async () => {
    const store = usePracticeTimerStore();
    store.start();
    vi.advanceTimersByTime(2500);

    // 2 ticks already fired (at 1s and 2s), final .5s still pending.
    const before = persistence.addSessionTime.mock.calls.length;
    await store.stop();
    // stop() re-invokes tick(); because only 500ms elapsed since the last
    // tick we expect NO extra invocation (delta floors to 0).
    expect(persistence.addSessionTime.mock.calls.length).toBe(before);
    expect(store.isRunning).toBe(false);

    // After stop, further elapsed time must not be persisted.
    vi.advanceTimersByTime(5000);
    expect(persistence.addSessionTime.mock.calls.length).toBe(before);
  });

  it('toggle flips the running state', async () => {
    const store = usePracticeTimerStore();
    await store.toggle();
    expect(store.isRunning).toBe(true);
    await store.toggle();
    expect(store.isRunning).toBe(false);
  });

  it('flushAndStop is a graceful stop for the shutdown pipeline', async () => {
    const store = usePracticeTimerStore();
    store.start();
    vi.advanceTimersByTime(1500);

    await store.flushAndStop();
    expect(store.isRunning).toBe(false);
  });

  it('flushAndStop is a no-op when not running', async () => {
    const store = usePracticeTimerStore();
    await store.flushAndStop();
    expect(persistence.addSessionTime).not.toHaveBeenCalled();
  });

  it('start is idempotent', () => {
    const store = usePracticeTimerStore();
    store.start();
    const firstStart = store.isRunning;
    store.start();
    expect(store.isRunning).toBe(firstStart);
  });

  it('flushAndStop waits for pending persistence writes before resolving', async () => {
    // Simulate a slow Tauri IPC: hold the addSessionTime promise in a
    // deferred handle so we can verify flushAndStop blocks until it
    // resolves. The graceful-close pipeline in App.vue would otherwise
    // invoke confirm_close before the final write lands.
    vi.useRealTimers();
    let resolveWrite: (() => void) | null = null;
    persistence.addSessionTime.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const store = usePracticeTimerStore();
    store.start();
    await new Promise((resolve) => setTimeout(resolve, 1050));
    // A tick has fired and its write is still pending.
    expect(persistence.addSessionTime).toHaveBeenCalled();
    expect(resolveWrite).not.toBeNull();

    let flushDone = false;
    const flushPromise = store.flushAndStop().then(() => {
      flushDone = true;
    });
    // Give the event loop a chance — flushAndStop must still be pending.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flushDone).toBe(false);

    resolveWrite?.();
    await flushPromise;
    expect(flushDone).toBe(true);
  });
});
