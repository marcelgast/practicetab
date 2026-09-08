// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePracticeStore } from '../stores/practice';
import type { PracticeExercise } from '../domain/practice';

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
  listSessions: ReturnType<typeof vi.fn>;
  getActiveSession: ReturnType<typeof vi.fn>;
  reorderIntervals: ReturnType<typeof vi.fn>;
  createInterval: ReturnType<typeof vi.fn>;
  updateExercise: ReturnType<typeof vi.fn>;
};

describe('practice intervals', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    persistence.listPracticePlans.mockResolvedValue([]);
    persistence.listSessions.mockResolvedValue([]);
    persistence.getActiveSession.mockResolvedValue(null);
  });

  it('reorders intervals via persistence', async () => {
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
        intervals: [
          {
            id: 'int-a',
            exerciseId: 'ex-1',
            name: 'A',
            durationSeconds: 60,
            bpm: null,
            sortIndex: 0,
            done: false,
            createdAt: 1,
          },
          {
            id: 'int-b',
            exerciseId: 'ex-1',
            name: 'B',
            durationSeconds: 90,
            bpm: null,
            sortIndex: 1,
            done: false,
            createdAt: 2,
          },
          {
            id: 'int-c',
            exerciseId: 'ex-1',
            name: 'C',
            durationSeconds: 120,
            bpm: null,
            sortIndex: 2,
            done: false,
            createdAt: 3,
          },
        ],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      } satisfies PracticeExercise,
    ];

    await store.reorderIntervals('ex-1', ['int-c', 'int-a', 'int-b']);

    expect(persistence.reorderIntervals).toHaveBeenCalledWith('ex-1', [
      'int-c',
      'int-a',
      'int-b',
    ]);
    expect(store.intervalsForExercise('ex-1').map((entry) => entry.id)).toEqual(
      ['int-c', 'int-a', 'int-b'],
    );
  });

  it('updates planned minutes when interval sum exceeds exercise time', async () => {
    const store = usePracticeStore();
    await store.init();
    const exercise: PracticeExercise = {
      id: 'ex-1',
      planId: 'plan-1',
      title: 'Warmups',
      sortOrder: 0,
      timePlannedMinutes: 2,
      intervalAuto: true,
      linkedTabId: null,
      linkedAudioId: null,
      totalTimeSpentSeconds: 0,
      bpm: null,
      intervals: [],
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
    };
    store.exercises = [exercise];
    persistence.createInterval.mockResolvedValue({
      id: 'int-1',
      exerciseId: 'ex-1',
      name: 'Interval 1',
      durationSeconds: 180,
      bpm: 120,
      sortIndex: 0,
      done: false,
      createdAt: 1,
    });
    persistence.updateExercise.mockResolvedValue({
      ...exercise,
      timePlannedMinutes: 3,
    });

    await store.createInterval('ex-1', {
      name: 'Interval 1',
      durationSeconds: 180,
      sortIndex: 0,
    });

    expect(persistence.updateExercise).toHaveBeenCalledWith('ex-1', {
      timePlannedMinutes: 3,
    });
    expect(store.exercises[0].timePlannedMinutes).toBe(3);
  });
});
