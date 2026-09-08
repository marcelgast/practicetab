// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    addSessionTime: vi.fn().mockResolvedValue(undefined),
    addPlaybackTime: vi.fn().mockResolvedValue(undefined),
    addExerciseTime: vi.fn().mockResolvedValue(undefined),
    startSessionIfNeeded: vi.fn().mockResolvedValue(undefined),
  },
}));

import { practicePersistence } from '../services/practicePersistence';
import { usePracticePlaybackStore } from '../stores/practicePlayback';
import { usePracticeUiStore } from '../stores/practiceUi';

const persistence = practicePersistence as unknown as {
  addPlaybackTime: ReturnType<typeof vi.fn>;
};

describe('usePracticePlaybackStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes playback ticks to the expanded exercise when one is set', () => {
    const uiStore = usePracticeUiStore();
    uiStore.setExpandedExerciseId('ex-42');

    const store = usePracticePlaybackStore();
    store.start();
    vi.advanceTimersByTime(2000);

    expect(persistence.addPlaybackTime).toHaveBeenCalledTimes(2);
    expect(persistence.addPlaybackTime).toHaveBeenLastCalledWith('ex-42', 1);
  });

  it('routes to the session (null exercise) when no exercise is expanded', () => {
    const uiStore = usePracticeUiStore();
    uiStore.setExpandedExerciseId(null);

    const store = usePracticePlaybackStore();
    store.start();
    vi.advanceTimersByTime(1000);

    expect(persistence.addPlaybackTime).toHaveBeenCalledWith(null, 1);
  });

  it('stop halts the tick loop', () => {
    const store = usePracticePlaybackStore();
    store.start();
    vi.advanceTimersByTime(1000);
    const before = persistence.addPlaybackTime.mock.calls.length;

    store.stop();
    vi.advanceTimersByTime(5000);
    expect(persistence.addPlaybackTime.mock.calls.length).toBe(before);
  });
});
