import { describe, it, expect } from 'vitest';
import type {
  PracticeExercise,
  PracticeSession,
  PracticeSessionExercise,
} from '../domain/practice';
import {
  computeExerciseTotalMinutes,
  computeExerciseAvgPerSession,
  computeExerciseLastSessionDate,
  computeExerciseTrendPercent,
  computeExercisePracticeDays,
  computeExerciseLongestStreak,
  computeExerciseAdherence,
  computeExerciseModeBreakdown,
  groupExercisesByPlan,
} from '../domain/stats/exerciseStats';
import type { PerExerciseStats } from '../domain/stats/types';

function makeSession(
  id: string,
  date: string,
  seconds: number,
): PracticeSession {
  return {
    id,
    sessionDate: date,
    startedAt: `${date}T10:00:00.000Z`,
    endedAt: `${date}T10:${String(Math.floor(seconds / 60)).padStart(2, '0')}:00.000Z`,
    totalTimeSpentSeconds: seconds,
    createdAt: `${date}T10:00:00.000Z`,
  };
}

function makeSessionExercise(
  sessionId: string,
  exerciseId: string,
  seconds: number,
  playbackMode?: string,
): PracticeSessionExercise {
  return {
    id: `${sessionId}-${exerciseId}`,
    sessionId,
    exerciseId,
    timeSpentSeconds: seconds,
    playbackMode,
    createdAt: '2025-01-01T10:00:00.000Z',
  };
}

function makeExercise(
  id: string,
  planId: string,
  title: string,
  bpm?: number,
  timePlannedMinutes?: number,
): PracticeExercise {
  return {
    id,
    planId,
    title,
    sortOrder: 0,
    timePlannedMinutes: timePlannedMinutes ?? null,
    intervalAuto: true,
    linkedTabId: null,
    linkedAudioId: null,
    totalTimeSpentSeconds: 0,
    bpm: bpm ?? null,
    intervals: [],
    createdAt: '2025-01-01T10:00:00.000Z',
    updatedAt: '2025-01-01T10:00:00.000Z',
  };
}

describe('computeExerciseTotalMinutes', () => {
  it('sums time across sessions', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 120)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 180)]);

    expect(computeExerciseTotalMinutes('ex-1', details)).toBe(5);
  });

  it('returns 0 for empty data', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    expect(computeExerciseTotalMinutes('ex-1', details)).toBe(0);
  });
});

describe('computeExerciseAvgPerSession', () => {
  it('computes average for a single session', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 600)]);

    expect(computeExerciseAvgPerSession('ex-1', details)).toBe(10);
  });

  it('computes average across multiple sessions', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 600)]);

    // Total 900s = 15min, 2 sessions => 7.5 min/session
    expect(computeExerciseAvgPerSession('ex-1', details)).toBe(7.5);
  });

  it('returns 0 for zero sessions', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    expect(computeExerciseAvgPerSession('ex-1', details)).toBe(0);
  });
});

describe('computeExerciseLastSessionDate', () => {
  it('returns most recent date', () => {
    const sessions = [
      makeSession('s1', '2025-01-05', 300),
      makeSession('s2', '2025-01-08', 600),
    ];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 600)]);

    expect(computeExerciseLastSessionDate('ex-1', sessions, details)).toBe(
      '2025-01-08',
    );
  });

  it('returns null when no data', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    expect(computeExerciseLastSessionDate('ex-1', [], details)).toBeNull();
  });
});

describe('computeExerciseTrendPercent', () => {
  it('returns positive trend when this week exceeds last', () => {
    // today = Wednesday 2025-01-08, week starts Monday 2025-01-06
    // prev week: 2024-12-30 to 2025-01-05
    const sessions = [
      makeSession('s1', '2025-01-01', 300),
      makeSession('s2', '2025-01-07', 600),
    ];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 600)]);

    const trend = computeExerciseTrendPercent(
      'ex-1',
      sessions,
      details,
      '2025-01-08',
    );
    expect(trend).toBe(100); // 600 vs 300 = +100%
  });

  it('returns negative trend when last week was higher', () => {
    const sessions = [
      makeSession('s1', '2025-01-01', 600),
      makeSession('s2', '2025-01-07', 300),
    ];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 600)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 300)]);

    const trend = computeExerciseTrendPercent(
      'ex-1',
      sessions,
      details,
      '2025-01-08',
    );
    expect(trend).toBe(-50); // 300 vs 600 = -50%
  });

  it('returns null when no data in either week', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    const trend = computeExerciseTrendPercent(
      'ex-1',
      [],
      details,
      '2025-01-08',
    );
    expect(trend).toBeNull();
  });
});

describe('computeExercisePracticeDays', () => {
  it('counts distinct dates', () => {
    const sessions = [
      makeSession('s1', '2025-01-05', 300),
      makeSession('s2', '2025-01-05', 200),
      makeSession('s3', '2025-01-06', 300),
    ];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 200)]);
    details.set('s3', [makeSessionExercise('s3', 'ex-1', 300)]);

    expect(computeExercisePracticeDays('ex-1', sessions, details)).toBe(2);
  });

  it('returns 0 for no entries', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    expect(computeExercisePracticeDays('ex-1', [], details)).toBe(0);
  });
});

describe('computeExerciseLongestStreak', () => {
  it('counts consecutive days', () => {
    const sessions = [
      makeSession('s1', '2025-01-05', 300),
      makeSession('s2', '2025-01-06', 300),
      makeSession('s3', '2025-01-07', 300),
    ];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 300)]);
    details.set('s3', [makeSessionExercise('s3', 'ex-1', 300)]);

    expect(computeExerciseLongestStreak('ex-1', sessions, details)).toBe(3);
  });

  it('gap breaks streak', () => {
    const sessions = [
      makeSession('s1', '2025-01-05', 300),
      makeSession('s2', '2025-01-06', 300),
      makeSession('s3', '2025-01-08', 300),
    ];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 300)]);
    details.set('s3', [makeSessionExercise('s3', 'ex-1', 300)]);

    expect(computeExerciseLongestStreak('ex-1', sessions, details)).toBe(2);
  });

  it('single day returns 1', () => {
    const sessions = [makeSession('s1', '2025-01-05', 300)];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);

    expect(computeExerciseLongestStreak('ex-1', sessions, details)).toBe(1);
  });

  it('returns 0 for no data', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    expect(computeExerciseLongestStreak('ex-1', [], details)).toBe(0);
  });
});

describe('computeExerciseAdherence', () => {
  it('returns 100% adherence', () => {
    const exercise = makeExercise('ex-1', 'p-1', 'Test', undefined, 10);
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 600)]);

    // 600s actual / (10min * 60s * 1 session) = 100%
    expect(computeExerciseAdherence(exercise, details)).toBe(100);
  });

  it('returns partial adherence', () => {
    const exercise = makeExercise('ex-1', 'p-1', 'Test', undefined, 10);
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);

    // 300s actual / (10min * 60s * 1 session) = 50%
    expect(computeExerciseAdherence(exercise, details)).toBe(50);
  });

  it('returns null when no planned time', () => {
    const exercise = makeExercise('ex-1', 'p-1', 'Test');
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300)]);

    expect(computeExerciseAdherence(exercise, details)).toBeNull();
  });

  it('returns null when no entries', () => {
    const exercise = makeExercise('ex-1', 'p-1', 'Test', undefined, 10);
    const details = new Map<string, PracticeSessionExercise[]>();
    expect(computeExerciseAdherence(exercise, details)).toBeNull();
  });
});

describe('computeExerciseModeBreakdown', () => {
  it('returns all zeros for empty session details', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    const result = computeExerciseModeBreakdown('ex-1', details);

    expect(result.tab).toEqual({ minutes: 0, percent: 0 });
    expect(result.song).toEqual({ minutes: 0, percent: 0 });
    expect(result.dual).toEqual({ minutes: 0, percent: 0 });
    expect(result.metronome).toEqual({ minutes: 0, percent: 0 });
  });

  it('computes correct percentages for different modes', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300, 'tab')]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 300, 'song')]);
    details.set('s3', [makeSessionExercise('s3', 'ex-1', 600, 'metronome')]);

    const result = computeExerciseModeBreakdown('ex-1', details);

    // Total 1200s: tab 300 (25%), song 300 (25%), metronome 600 (50%)
    expect(result.tab.percent).toBe(25);
    expect(result.song.percent).toBe(25);
    expect(result.dual.percent).toBe(0);
    expect(result.metronome.percent).toBe(50);
    expect(result.tab.minutes).toBe(5);
    expect(result.song.minutes).toBe(5);
    expect(result.metronome.minutes).toBe(10);
  });

  it('returns 100% for a single mode', () => {
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 600, 'tab')]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 600, 'tab')]);

    const result = computeExerciseModeBreakdown('ex-1', details);

    expect(result.tab.percent).toBe(100);
    expect(result.tab.minutes).toBe(20);
    expect(result.song.percent).toBe(0);
    expect(result.dual.percent).toBe(0);
    expect(result.metronome.percent).toBe(0);
  });

  it('uses canonical mode values: tab, song, dual, metronome', () => {
    // Regression: persisted playbackMode uses 'song'/'dual' (from
    // resolveExercisePlaybackMode), NOT 'audio'/'both'. All code paths
    // must use the same canonical values.
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 120, 'tab')]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 120, 'song')]);
    details.set('s3', [makeSessionExercise('s3', 'ex-1', 120, 'dual')]);
    details.set('s4', [makeSessionExercise('s4', 'ex-1', 120, 'metronome')]);

    const result = computeExerciseModeBreakdown('ex-1', details);

    expect(result.tab.percent).toBe(25);
    expect(result.song.percent).toBe(25);
    expect(result.dual.percent).toBe(25);
    expect(result.metronome.percent).toBe(25);
  });

  it('treats "audio" and "both" as unknown modes (falls back to metronome)', () => {
    // If old data somehow has 'audio'/'both' instead of 'song'/'dual',
    // it should fall back to metronome (unknown mode handling).
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s1', [makeSessionExercise('s1', 'ex-1', 300, 'audio')]);
    details.set('s2', [makeSessionExercise('s2', 'ex-1', 300, 'both')]);

    const result = computeExerciseModeBreakdown('ex-1', details);

    expect(result.song.minutes).toBe(0);
    expect(result.dual.minutes).toBe(0);
    expect(result.metronome.minutes).toBe(10);
  });
});

describe('groupExercisesByPlan', () => {
  it('groups correctly', () => {
    const plans = [
      {
        id: 'p-1',
        title: 'Plan A',
        timed: false,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p-2',
        title: 'Plan B',
        timed: false,
        sortOrder: 1,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const stats: PerExerciseStats[] = [
      {
        exerciseId: 'ex-1',
        exerciseTitle: 'Warmup',
        planId: 'p-1',
        planTitle: 'Plan A',
        totalTimeMinutes: 10,
        avgTimePerSessionMinutes: 10,
        lastSessionDate: null,
        trendVsLastWeekPercent: null,
        intervalSessionsCount: 0,
        bpmHistory: [],
        intervalsCompleted: 0,
        practiceDays: 1,
        longestStreakDays: 1,
        adherencePercent: null,
      },
      {
        exerciseId: 'ex-2',
        exerciseTitle: 'Solo',
        planId: 'p-2',
        planTitle: 'Plan B',
        totalTimeMinutes: 5,
        avgTimePerSessionMinutes: 5,
        lastSessionDate: null,
        trendVsLastWeekPercent: null,
        intervalSessionsCount: 0,
        bpmHistory: [],
        intervalsCompleted: 0,
        practiceDays: 1,
        longestStreakDays: 1,
        adherencePercent: null,
      },
    ];

    const groups = groupExercisesByPlan(plans, stats);
    expect(groups).toHaveLength(2);
    expect(groups[0].planTitle).toBe('Plan A');
    expect(groups[0].exercises).toHaveLength(1);
    expect(groups[1].planTitle).toBe('Plan B');
    expect(groups[1].exercises).toHaveLength(1);
  });

  it('returns empty for empty input', () => {
    const groups = groupExercisesByPlan([], []);
    expect(groups).toHaveLength(0);
  });

  it('omits plans with no matching exercises', () => {
    const plans = [
      {
        id: 'p-1',
        title: 'Empty Plan',
        timed: false,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const groups = groupExercisesByPlan(plans, []);
    expect(groups).toHaveLength(0);
  });
});
