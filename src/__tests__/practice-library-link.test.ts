// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLibraryStore } from '../stores/library';
import { usePracticeStore } from '../stores/practice';

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    pickGpFiles: vi.fn(),
  },
}));

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    listPracticePlans: vi.fn(),
    createPracticePlan: vi.fn(),
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

import { libraryFileOps } from '../services/libraryFileOps';
import { practicePersistence } from '../services/practicePersistence';

const fileOps = libraryFileOps as unknown as {
  pickGpFiles: ReturnType<typeof vi.fn>;
};

const persistence = practicePersistence as unknown as {
  listPracticePlans: ReturnType<typeof vi.fn>;
  createPracticePlan: ReturnType<typeof vi.fn>;
  createExercise: ReturnType<typeof vi.fn>;
  linkExerciseToLibraryItem: ReturnType<typeof vi.fn>;
  linkExerciseToAudio: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  getActiveSession: ReturnType<typeof vi.fn>;
};

describe('practice-library linking', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
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
      title: 'Item',
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
    persistence.linkExerciseToLibraryItem.mockResolvedValue(undefined);
    persistence.linkExerciseToAudio.mockResolvedValue(undefined);
  });

  it('links an audio file to linkedAudioId', async () => {
    const practiceStore = usePracticeStore();
    await practiceStore.init();
    await practiceStore.createPlan('Focus', false);
    await practiceStore.createExercise('plan-1', 'Item', 10);

    const libraryStore = useLibraryStore();
    libraryStore.items = [
      {
        id: 'audio-1',
        kind: 'audio' as const,
        title: 'Backing Track',
        source: { kind: 'reference', path: '/music/track.mp3' },
        metadata: { fileName: 'track.mp3', size: 500, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    const exerciseId = practiceStore.exercisesForSelectedPlan[0].id;
    await practiceStore.linkLibraryItem(exerciseId, 'audio-1', 'audio');

    expect(practiceStore.exercisesForSelectedPlan[0].linkedAudioId).toBe(
      'audio-1',
    );
    expect(practiceStore.exercisesForSelectedPlan[0].linkedTabId).toBeNull();
  });

  it('adds a reference file and links it to a practice exercise', async () => {
    fileOps.pickGpFiles.mockResolvedValueOnce([
      {
        path: '/music/session.gp5',
        metadata: { fileName: 'session.gp5', size: 123, modifiedMs: 1 },
      },
    ]);

    const practiceStore = usePracticeStore();
    await practiceStore.init();
    await practiceStore.createPlan('Focus', false);
    await practiceStore.createExercise('plan-1', 'Item', 10);

    const libraryStore = useLibraryStore();
    const linked = await libraryStore.addReferenceFromPicker();
    expect(linked).not.toBeNull();

    const exerciseId = practiceStore.exercisesForSelectedPlan[0].id;
    await practiceStore.linkLibraryItem(exerciseId, linked?.id ?? '');

    expect(practiceStore.exercisesForSelectedPlan[0].linkedTabId).toBe(
      linked?.id,
    );
  });
});
