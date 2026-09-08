// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const STORAGE_KEY = 'practicetab.practice.v2';

describe('practicePersistence (browser adapter)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back safely on invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{');
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const plans = await practicePersistence.listPracticePlans();

    expect(plans).toEqual([]);
  });

  it('persists created plans', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    await practicePersistence.createPracticePlan('Focus', false);
    const plans = await practicePersistence.listPracticePlans();

    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe('Focus');
  });

  it('addExerciseTime tracks exercise seconds but does not bump session total', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const plan = await practicePersistence.createPracticePlan('Focus', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Warmups',
      timePlannedMinutes: 10,
    });

    await practicePersistence.addExerciseTime(exercise.id, 30);
    const sessions = await practicePersistence.listSessions();

    expect(sessions).toHaveLength(1);
    // Session total is owned by addSessionTime — exercise-level tracking
    // must no longer touch it (see v22 schema change).
    expect(sessions[0].totalTimeSpentSeconds).toBe(0);
    const active = await practicePersistence.getActiveSession();
    expect(active?.exercises[0].timeSpentSeconds).toBe(30);
  });

  it('listSessionsWithJournal filters out sessions whose journal fields are absent', async () => {
    // Regression: the filter used `s.goalPercent !== null` /
    // `s.goalReached !== null`, which treated `undefined` as
    // content. Every pre-journal browser session would appear
    // in the Stats list and the empty-state would never show.
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const session = await practicePersistence.startSessionIfNeeded();

    // Plain session → not in the journal list.
    let list = await practicePersistence.listSessionsWithJournal();
    expect(list).toEqual([]);

    // Only after the user writes SOMETHING does the row appear.
    await practicePersistence.updateSessionGoal(session.id, 'warm up');
    list = await practicePersistence.listSessionsWithJournal();
    expect(list).toHaveLength(1);
    expect(list[0]!.goalText).toBe('warm up');

    // Clearing drops the row again.
    await practicePersistence.clearSessionJournal(session.id);
    list = await practicePersistence.listSessionsWithJournal();
    expect(list).toEqual([]);
  });

  it('addSessionTime increments the session total only', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    await practicePersistence.startSessionIfNeeded();
    await practicePersistence.addSessionTime(42);
    await practicePersistence.addSessionTime(8);

    const sessions = await practicePersistence.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].totalTimeSpentSeconds).toBe(50);
    expect(sessions[0].totalPlaybackSeconds).toBe(0);
  });

  it('addPlaybackTime routes to exercise bucket when exerciseId provided', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const plan = await practicePersistence.createPracticePlan('Focus', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Warmups',
      timePlannedMinutes: 10,
    });

    await practicePersistence.addPlaybackTime(exercise.id, 15);
    await practicePersistence.addPlaybackTime(null, 5);

    const sessions = await practicePersistence.listSessions();
    expect(sessions[0].totalPlaybackSeconds).toBe(20);
    const active = await practicePersistence.getActiveSession();
    expect(active?.exercises[0].playbackTimeSeconds).toBe(15);
  });

  it('updates exercise fields and keeps defaults', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const plan = await practicePersistence.createPracticePlan('Focus', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Warmups',
      timePlannedMinutes: 10,
      bpm: 80,
      notes: null,
    });
    await practicePersistence.updateExercise(exercise.id, {
      intervalAuto: false,
      intervalRepeat: true,
      timePlannedMinutes: null,
    });
    const plans = await practicePersistence.listPracticePlans();
    const stored = plans[0]?.exercises[0];

    expect(stored?.intervalAuto).toBe(false);
    expect(stored?.intervalRepeat).toBe(true);
    expect(stored?.timePlannedMinutes).toBeNull();
    expect(stored?.bpm).toBe(80);
  });

  it('manages intervals and clears done flags', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const plan = await practicePersistence.createPracticePlan('Focus', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Warmups',
      timePlannedMinutes: 10,
    });
    const interval = await practicePersistence.createInterval(exercise.id, {
      durationSeconds: 30,
      sortIndex: 0,
    });
    await practicePersistence.updateInterval(interval.id, { done: true });
    let intervals = await practicePersistence.listIntervals(exercise.id);
    expect(intervals[0]?.done).toBe(true);

    await practicePersistence.clearIntervalDoneFlags(exercise.id);
    intervals = await practicePersistence.listIntervals(exercise.id);
    expect(intervals[0]?.done).toBe(false);
  });

  it('throws when updating missing interval', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    await expect(
      practicePersistence.updateInterval('missing', { done: true }),
    ).rejects.toThrow('interval_not_found');
  });

  it('removes related records when deleting a plan', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const plan = await practicePersistence.createPracticePlan('Focus', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Warmups',
      timePlannedMinutes: 10,
    });
    await practicePersistence.createInterval(exercise.id, {
      durationSeconds: 30,
      sortIndex: 0,
    });
    await practicePersistence.startSessionIfNeeded();
    await practicePersistence.addExerciseTime(exercise.id, 15);

    await practicePersistence.deletePracticePlan(plan.id);
    const plans = await practicePersistence.listPracticePlans();
    const intervals = await practicePersistence.listIntervals(exercise.id);
    const active = await practicePersistence.getActiveSession();

    expect(plans).toHaveLength(0);
    expect(intervals).toHaveLength(0);
    expect(active?.exercises ?? []).toHaveLength(0);
  });

  it('links and unlinks exercises from library items', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const plan = await practicePersistence.createPracticePlan('Focus', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Warmups',
      timePlannedMinutes: 10,
    });

    await practicePersistence.linkExerciseToLibraryItem(exercise.id, 'lib-1');
    let plans = await practicePersistence.listPracticePlans();
    expect(plans[0]?.exercises[0]?.linkedTabId).toBe('lib-1');

    await practicePersistence.unlinkExerciseFromLibraryItem(exercise.id);
    plans = await practicePersistence.listPracticePlans();
    expect(plans[0]?.exercises[0]?.linkedTabId).toBeNull();
  });

  it('returns null when no active session exists', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    await expect(practicePersistence.getActiveSession()).resolves.toBeNull();
  });

  it('returns active session on same day and starts a new one on a new day', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const first = await practicePersistence.startSessionIfNeeded();
    const again = await practicePersistence.startSessionIfNeeded();
    expect(again.id).toBe(first.id);

    vi.setSystemTime(new Date('2025-01-02T09:00:00.000Z'));
    const next = await practicePersistence.startSessionIfNeeded();
    expect(next.id).not.toBe(first.id);
  });

  it('filters sessions by date range and tracks completed intervals total', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    await practicePersistence.startSessionIfNeeded();
    await practicePersistence.endActiveSession();
    vi.setSystemTime(new Date('2025-01-03T09:00:00.000Z'));
    await practicePersistence.startSessionIfNeeded();

    const from = await practicePersistence.listSessions({ from: '2025-01-02' });
    expect(from).toHaveLength(1);

    const to = await practicePersistence.listSessions({ to: '2025-01-02' });
    expect(to).toHaveLength(1);

    expect(await practicePersistence.getIntervalsCompletedTotal()).toBe(0);
    const updated =
      await practicePersistence.incrementIntervalsCompletedTotal(2);
    expect(updated).toBe(2);
    const clamped =
      await practicePersistence.incrementIntervalsCompletedTotal(-10);
    expect(clamped).toBe(0);
  });

  it('throws when requesting missing session detail', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');

    await expect(
      practicePersistence.getSessionDetail('missing'),
    ).rejects.toThrow('session_not_found');
  });
});

describe('practicePersistence (tauri adapter)', () => {
  const originalTauri = (window as unknown as { __TAURI__?: unknown })
    .__TAURI__;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00.000Z'));
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {};
  });

  afterEach(() => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = originalTauri;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('routes calls through invoke with tauri payloads', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
    invokeMock.mockResolvedValueOnce([{ id: 'plan-1', exercises: [] }]);
    vi.resetModules();
    const { practicePersistence } =
      await import('../services/practicePersistence');

    await practicePersistence.listPracticePlans();
    expect(invokeMock).toHaveBeenCalledWith('list_practice_plans');

    await practicePersistence.reorderPracticePlans(['plan-1', 'plan-2']);
    expect(invokeMock).toHaveBeenCalledWith('reorder_practice_plans', {
      orderedPlanIds: ['plan-1', 'plan-2'],
    });

    await practicePersistence.listSessions({ from: '2025-01-01' });
    expect(invokeMock).toHaveBeenCalledWith('list_sessions', {
      from: '2025-01-01',
      to: null,
    });
  });
});
