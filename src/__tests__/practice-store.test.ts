// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePracticeStore } from '../stores/practice';
import type {
  PracticeExercise,
  PracticePlan,
  PracticeSession,
} from '../domain/practice';

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    listPracticePlans: vi.fn(),
    createPracticePlan: vi.fn(),
    updatePracticePlan: vi.fn(),
    renamePracticePlan: vi.fn(),
    reorderPracticePlans: vi.fn(),
    deletePracticePlan: vi.fn(),
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
    deleteExercise: vi.fn(),
    reorderExercises: vi.fn(),
    linkExerciseToLibraryItem: vi.fn(),
    linkExerciseToAudio: vi.fn(),
    unlinkExerciseFromLibraryItem: vi.fn(),
    listIntervals: vi.fn(),
    createInterval: vi.fn(),
    updateInterval: vi.fn(),
    deleteInterval: vi.fn(),
    reorderIntervals: vi.fn(),
    clearIntervalDoneFlags: vi.fn(),
    startSessionIfNeeded: vi.fn(),
    endActiveSession: vi.fn(),
    addExerciseTime: vi.fn(),
    addSessionTime: vi.fn(),
    addPlaybackTime: vi.fn(),
    confirmClose: vi.fn(),
    getActiveSession: vi.fn(),
    listSessions: vi.fn(),
    getSessionDetail: vi.fn(),
    getIntervalsCompletedTotal: vi.fn(),
    incrementIntervalsCompletedTotal: vi.fn(),
    recordExerciseBpm: vi.fn().mockResolvedValue({
      id: 'bpm-1',
      exerciseId: '',
      sessionDate: '',
      bpm: 0,
      recordedAt: '',
    }),
    listExerciseBpmHistory: vi.fn().mockResolvedValue([]),
    recordLibraryItemTime: vi.fn(),
    incrementLibraryItemPlayCount: vi.fn(),
    incrementLibraryItemLoopCount: vi.fn(),
    listLibraryItemStats: vi.fn().mockResolvedValue([]),
    resetPracticeDb: vi.fn(),
  },
}));

import { practicePersistence } from '../services/practicePersistence';

const persistence = practicePersistence as unknown as {
  listPracticePlans: ReturnType<typeof vi.fn>;
  createPracticePlan: ReturnType<typeof vi.fn>;
  updatePracticePlan: ReturnType<typeof vi.fn>;
  renamePracticePlan: ReturnType<typeof vi.fn>;
  reorderPracticePlans: ReturnType<typeof vi.fn>;
  deletePracticePlan: ReturnType<typeof vi.fn>;
  createExercise: ReturnType<typeof vi.fn>;
  updateExercise: ReturnType<typeof vi.fn>;
  deleteExercise: ReturnType<typeof vi.fn>;
  reorderExercises: ReturnType<typeof vi.fn>;
  linkExerciseToLibraryItem: ReturnType<typeof vi.fn>;
  unlinkExerciseFromLibraryItem: ReturnType<typeof vi.fn>;
  listIntervals: ReturnType<typeof vi.fn>;
  createInterval: ReturnType<typeof vi.fn>;
  updateInterval: ReturnType<typeof vi.fn>;
  deleteInterval: ReturnType<typeof vi.fn>;
  reorderIntervals: ReturnType<typeof vi.fn>;
  clearIntervalDoneFlags: ReturnType<typeof vi.fn>;
  startSessionIfNeeded: ReturnType<typeof vi.fn>;
  endActiveSession: ReturnType<typeof vi.fn>;
  addExerciseTime: ReturnType<typeof vi.fn>;
  getActiveSession: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  getIntervalsCompletedTotal: ReturnType<typeof vi.fn>;
  incrementIntervalsCompletedTotal: ReturnType<typeof vi.fn>;
};

describe('practice store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00.000Z'));
    persistence.listPracticePlans.mockResolvedValue([]);
    persistence.listSessions.mockResolvedValue([]);
    persistence.getActiveSession.mockResolvedValue(null);
    persistence.createPracticePlan.mockResolvedValue({
      id: 'plan-1',
      title: 'Focus',
      timed: false,
      sortOrder: 0,
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
    });
    persistence.createExercise.mockResolvedValue({
      id: 'ex-1',
      planId: 'plan-1',
      title: 'Warmups',
      sortOrder: 0,
      timePlannedMinutes: 10,
      intervalAuto: true,
      linkedTabId: null,
      linkedAudioId: null,
      totalTimeSpentSeconds: 0,
      bpm: null,
      intervals: [],
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
    });
    persistence.startSessionIfNeeded.mockResolvedValue({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.addExerciseTime.mockResolvedValue(undefined);
    persistence.linkExerciseToLibraryItem.mockResolvedValue(undefined);
    persistence.unlinkExerciseFromLibraryItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('loads plans, exercises, sessions, and active session', async () => {
    const plans: PracticePlan[] = [
      {
        id: 'plan-1',
        title: 'Focus',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    const exercises: PracticeExercise[] = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 10,
        intervalAuto: true,
        intervalRepeat: false,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 20,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    const sessions: PracticeSession[] = [
      {
        id: 'session-1',
        sessionDate: '2024-12-31',
        startedAt: '2024-12-31T10:00:00Z',
        endedAt: '2024-12-31T10:30:00Z',
        totalTimeSpentSeconds: 20,
        createdAt: '2024-12-31T10:00:00Z',
      },
    ];
    const newSession: PracticeSession = {
      id: 'session-2',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    };

    persistence.listPracticePlans.mockResolvedValueOnce([
      { ...plans[0], exercises },
    ]);
    persistence.listSessions.mockResolvedValueOnce(sessions);
    persistence.startSessionIfNeeded.mockResolvedValueOnce(newSession);

    const store = usePracticeStore();
    await store.init();

    expect(store.plans).toEqual(plans);
    expect(store.exercises).toEqual(exercises);
    expect(store.sessions).toEqual([...sessions, newSession]);
    expect(store.selectedPlanId).toBe('plan-1');
    expect(store.exerciseSessionSeconds('ex-1')).toBe(0);
    expect(persistence.endActiveSession).toHaveBeenCalledTimes(1);
    expect(persistence.clearIntervalDoneFlags).toHaveBeenCalledWith('ex-1');
  });

  it('creates plans and exercises via persistence', async () => {
    const store = usePracticeStore();
    await store.init();
    await store.createPlan('Focus', false);
    await store.createExercise('plan-1', 'Warmups', 10);

    expect(store.plans).toHaveLength(1);
    expect(store.exercises).toHaveLength(1);
    expect(persistence.createPracticePlan).toHaveBeenCalledTimes(1);
    expect(persistence.createPracticePlan).toHaveBeenCalledWith('Focus', false);
    expect(persistence.createExercise).toHaveBeenCalledTimes(1);
  });

  it('persists per-exercise repeat intervals toggle', async () => {
    const store = usePracticeStore();
    await store.init();
    await store.createPlan('Focus', false);
    await store.createExercise('plan-1', 'Warmups', 10);

    const exerciseId = store.exercises[0].id;
    await store.updateExercise(exerciseId, { intervalRepeat: true });

    expect(persistence.updateExercise).toHaveBeenCalledWith(exerciseId, {
      intervalRepeat: true,
    });
    expect(
      store.exercises.find((exercise) => exercise.id === exerciseId)
        ?.intervalRepeat,
    ).toBe(true);
  });

  it('links and unlinks library items', async () => {
    const store = usePracticeStore();
    await store.init();
    await store.createPlan('Focus', false);
    await store.createExercise('plan-1', 'Warmups', 10);

    const exerciseId = store.exercises[0].id;
    await store.linkLibraryItem(exerciseId, 'lib-1');
    await store.unlinkLibraryItem(exerciseId);

    expect(persistence.linkExerciseToLibraryItem).toHaveBeenCalledTimes(1);
    expect(persistence.unlinkExerciseFromLibraryItem).toHaveBeenCalledTimes(1);
  });

  it('buffers and flushes time during active session', async () => {
    const store = usePracticeStore();
    await store.init();
    await store.createPlan('Focus', false);
    await store.createExercise('plan-1', 'Warmups', 10);

    const exerciseId = store.exercises[0].id;
    await store.startExercise(exerciseId);

    vi.advanceTimersByTime(6000);

    expect(persistence.addExerciseTime).toHaveBeenCalled();
    expect(store.exerciseSessionSeconds(exerciseId)).toBeGreaterThan(0);

    await store.stopExercise();
  });

  it('persists reordered plans', async () => {
    const store = usePracticeStore();
    await store.init();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Warmup',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
      {
        id: 'plan-2',
        title: 'Focus',
        timed: false,
        sortOrder: 1,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await store.reorderPlans(['plan-2', 'plan-1']);

    expect(persistence.reorderPracticePlans).toHaveBeenCalledWith([
      'plan-2',
      'plan-1',
    ]);
    expect(store.plans.map((plan) => plan.id)).toEqual(['plan-2', 'plan-1']);
    expect(store.plans[0].sortOrder).toBe(0);
    expect(store.plans[1].sortOrder).toBe(1);
  });

  it('persists reordered exercises within a plan', async () => {
    const store = usePracticeStore();
    await store.init();
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 10,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
      {
        id: 'ex-2',
        planId: 'plan-1',
        title: 'Scales',
        sortOrder: 1,
        timePlannedMinutes: 15,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await store.reorderExercises('plan-1', ['ex-2', 'ex-1']);

    expect(persistence.reorderExercises).toHaveBeenCalledWith('plan-1', [
      'ex-2',
      'ex-1',
    ]);
    const sorted = store.exercises
      .filter((ex) => ex.planId === 'plan-1')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted.map((ex) => ex.id)).toEqual(['ex-2', 'ex-1']);
  });

  it('increments lifetime intervals completed when marking an interval done', async () => {
    const store = usePracticeStore();
    await store.init();
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: null,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [
          {
            id: 'int-1',
            exerciseId: 'ex-1',
            name: null,
            durationSeconds: 60,
            bpm: null,
            sortIndex: 0,
            done: false,
            createdAt: 0,
          },
        ],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    persistence.updateInterval.mockResolvedValue({
      id: 'int-1',
      exerciseId: 'ex-1',
      name: null,
      durationSeconds: 60,
      bpm: null,
      sortIndex: 0,
      done: true,
      createdAt: 0,
    });
    persistence.incrementIntervalsCompletedTotal.mockResolvedValue(1);

    await store.completeInterval('ex-1', 'int-1');

    expect(persistence.updateInterval).toHaveBeenCalledWith('int-1', {
      done: true,
    });
    expect(persistence.incrementIntervalsCompletedTotal).toHaveBeenCalledWith(
      1,
    );
    expect(store.exercises[0].intervals[0]?.done).toBe(true);
  });
});
