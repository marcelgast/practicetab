// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useStatsStore } from '../stores/stats';
import { useLibraryStore } from '../stores/library';
import { useAppStore } from '../stores/app';

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    listPracticePlans: vi.fn(),
    listSessions: vi.fn(),
    getSessionDetail: vi.fn(),
    getIntervalsCompletedTotal: vi.fn(),
    listIntervalModeSessions: vi.fn(),
    listExerciseBpmHistory: vi.fn(),
    listLibraryItemStats: vi.fn(),
  },
}));

import { practicePersistence } from '../services/practicePersistence';

const persistence = practicePersistence as unknown as {
  listPracticePlans: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  getSessionDetail: ReturnType<typeof vi.fn>;
  getIntervalsCompletedTotal: ReturnType<typeof vi.fn>;
  listIntervalModeSessions: ReturnType<typeof vi.fn>;
  listExerciseBpmHistory: ReturnType<typeof vi.fn>;
  listLibraryItemStats: ReturnType<typeof vi.fn>;
};

describe('stats store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-08T12:00:00.000Z'));
    persistence.listPracticePlans.mockResolvedValue([]);
    persistence.listSessions.mockResolvedValue([]);
    persistence.getSessionDetail.mockResolvedValue({
      session: {
        id: 'session-1',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T12:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 0,
        createdAt: '2025-01-08T12:00:00.000Z',
      },
      exercises: [],
    });
    persistence.getIntervalsCompletedTotal.mockResolvedValue(0);
    persistence.listIntervalModeSessions.mockResolvedValue([]);
    persistence.listExerciseBpmHistory.mockResolvedValue([]);
    persistence.listLibraryItemStats.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('builds snapshot from persistence payloads', async () => {
    const libraryStore = useLibraryStore();
    const appStore = useAppStore();
    appStore.setWeeklyStreakGoalDays(4);
    libraryStore.items = [
      {
        id: 'tab-1',
        title: 'Etude',
        source: { kind: 'reference', path: '/tmp/etude.gp' },
        metadata: { fileName: 'etude.gp', size: 10, modifiedMs: 0 },
        createdAt: '2025-01-01T10:00:00.000Z',
        updatedAt: '2025-01-01T10:00:00.000Z',
        lastKnownOk: true,
      },
    ];

    persistence.listPracticePlans.mockResolvedValueOnce([
      {
        id: 'plan-1',
        title: 'Focus',
        sortOrder: 0,
        timed: false,
        createdAt: '2025-01-01T10:00:00.000Z',
        updatedAt: '2025-01-01T10:00:00.000Z',
        exercises: [
          {
            id: 'ex-1',
            planId: 'plan-1',
            title: 'Warmup',
            sortOrder: 0,
            timePlannedMinutes: 10,
            intervalAuto: true,
            linkedTabId: 'tab-1',
            linkedAudioId: null,
            totalTimeSpentSeconds: 600,
            bpm: null,
            intervals: [],
            createdAt: '2025-01-01T10:00:00.000Z',
            updatedAt: '2025-01-01T10:00:00.000Z',
          },
        ],
      },
    ]);
    persistence.listSessions.mockResolvedValueOnce([
      {
        id: 'session-1',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T12:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-08T12:00:00.000Z',
      },
    ]);
    persistence.getSessionDetail.mockResolvedValueOnce({
      session: {
        id: 'session-1',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T12:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-08T12:00:00.000Z',
      },
      exercises: [
        {
          id: 'entry-1',
          sessionId: 'session-1',
          exerciseId: 'ex-1',
          timeSpentSeconds: 600,
          createdAt: '2025-01-08T12:00:00.000Z',
        },
      ],
    });
    persistence.getIntervalsCompletedTotal.mockResolvedValueOnce(12);
    persistence.listIntervalModeSessions.mockResolvedValueOnce([
      {
        id: 'im-1',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T12:00:00.000Z',
        endedAt: '2025-01-08T12:10:00.000Z',
        timedMode: true,
        plannedTotalSeconds: 900,
        actualRunSeconds: 600,
        intervalDurationSeconds: 60,
        intervalsCompleted: 10,
        startBpm: 80,
        endBpm: 90,
      },
    ]);

    const store = useStatsStore();
    await store.refresh();

    expect(store.snapshot).not.toBeNull();
    expect(store.snapshot?.deepDive.intervalsCompletedTotal).toBe(12);
    expect(store.snapshot?.deepDive.intervalModeIntervalsCompletedToday).toBe(
      10,
    );
    expect(store.snapshot?.deepDive.intervalModeIntervalsCompletedWeek).toBe(
      10,
    );
    expect(
      store.snapshot?.deepDive.intervalModeAvgIntervalDurationSeconds,
    ).toBe(60);
    expect(store.snapshot?.deepDive.intervalModeAvgBpmIncrease).toBe(10);
    expect(store.snapshot?.deepDive.intervalModeLastSessionBpmProgress).toBe(
      '80 → 90',
    );
    expect(store.snapshot?.deepDive.intervalModeLongestStreak).toBe(10);
    expect(store.snapshot?.deepDive.intervalModeTimedAdherencePercent).toBe(67);
    expect(store.snapshot?.deepDive.totalTabsLinked).toBe(1);
    expect(store.snapshot?.deepDive.tabLinkCoveragePercent).toBe(100);
    expect(store.snapshot?.today.mostPracticedExerciseTitle).toBe('Warmup');
    expect(store.snapshot?.today.sessionsCount).toBe(1);
    expect(store.snapshot?.trends.practiceDaysLast7).toBeGreaterThanOrEqual(1);

    // Time-breakdown wiring: today has 600s session + 600s exercise, so
    // the stack should show full exercise coverage with no general time
    // and no playback. Lifetime mirrors that (only one session so far).
    expect(store.snapshot?.todayBreakdown.sessionSeconds).toBe(600);
    expect(store.snapshot?.todayBreakdown.exerciseSelectedSeconds).toBe(600);
    expect(store.snapshot?.todayBreakdown.generalSeconds).toBe(0);
    expect(store.snapshot?.todayBreakdown.playbackSeconds).toBe(0);
    expect(store.snapshot?.lifetimeBreakdown.sessionSeconds).toBe(600);
    // Ratio trend provides 30 days so charts never render empty.
    expect(store.snapshot?.ratioTrend).toHaveLength(30);
    const todayRatioEntry = store.snapshot?.ratioTrend[29];
    expect(todayRatioEntry?.date).toBe('2025-01-08');
    // Playback numerator for the Played / Exercise ratio must only
    // count exercise-bucket playback, never session-only playback —
    // otherwise a day of general metronome practice pushes the ratio
    // past 100%. See PR #48 review.
    expect(todayRatioEntry?.exercisePlaybackSeconds).toBe(0);
    expect(todayRatioEntry?.totalPlaybackSeconds).toBe(0);
    // Raw seconds — the chart divides these directly so sub-minute
    // values (e.g. 30s exercise / 29s playback) don't collapse to 0/100
    // at minute boundaries. See PR #48 follow-up review.
    expect(todayRatioEntry?.sessionSeconds).toBe(600);
    expect(todayRatioEntry?.exerciseSeconds).toBe(600);

    expect(store.lastFetchedAt).not.toBeNull();
    expect(store.error).toBeNull();
  });

  it('populates perExercise stats when exercises exist', async () => {
    persistence.listPracticePlans.mockResolvedValueOnce([
      {
        id: 'plan-1',
        title: 'Focus',
        sortOrder: 0,
        timed: false,
        createdAt: '2025-01-01T10:00:00.000Z',
        updatedAt: '2025-01-01T10:00:00.000Z',
        exercises: [
          {
            id: 'ex-1',
            planId: 'plan-1',
            title: 'Warmup',
            sortOrder: 0,
            timePlannedMinutes: 10,
            intervalAuto: true,
            linkedTabId: null,
            linkedAudioId: null,
            totalTimeSpentSeconds: 600,
            bpm: null,
            intervals: [],
            createdAt: '2025-01-01T10:00:00.000Z',
            updatedAt: '2025-01-01T10:00:00.000Z',
          },
        ],
      },
    ]);
    persistence.listSessions.mockResolvedValueOnce([
      {
        id: 'session-1',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T12:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-08T12:00:00.000Z',
      },
    ]);
    persistence.getSessionDetail.mockResolvedValueOnce({
      session: {
        id: 'session-1',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T12:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-08T12:00:00.000Z',
      },
      exercises: [
        {
          id: 'entry-1',
          sessionId: 'session-1',
          exerciseId: 'ex-1',
          timeSpentSeconds: 600,
          createdAt: '2025-01-08T12:00:00.000Z',
        },
      ],
    });
    persistence.getIntervalsCompletedTotal.mockResolvedValueOnce(0);
    persistence.listIntervalModeSessions.mockResolvedValueOnce([]);
    persistence.listExerciseBpmHistory.mockResolvedValueOnce([]);

    const store = useStatsStore();
    await store.refresh();

    expect(store.snapshot).not.toBeNull();
    expect(store.snapshot?.perExercise).toBeDefined();
    expect(store.snapshot!.perExercise.length).toBeGreaterThanOrEqual(1);
    const group = store.snapshot!.perExercise[0];
    expect(group.planTitle).toBe('Focus');
    expect(group.exercises).toHaveLength(1);
    expect(group.exercises[0].exerciseTitle).toBe('Warmup');
    expect(group.exercises[0].totalTimeMinutes).toBe(10);
  });

  it('captures errors during refresh', async () => {
    persistence.listPracticePlans.mockRejectedValueOnce(new Error('db_failed'));
    const store = useStatsStore();
    await store.refresh();
    expect(store.error).toContain('db_failed');
    expect(store.snapshot).toBeNull();
  });
});
