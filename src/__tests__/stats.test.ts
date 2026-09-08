import { describe, expect, it } from 'vitest';
import {
  calculateAdherencePercent,
  computeIntervalModeAverageBpmIncrease,
  computeIntervalModeAverageIntervalDurationSeconds,
  computeIntervalModeIntervalsCompletedForDate,
  computeIntervalModeIntervalsCompletedForWeek,
  computeIntervalModeLongestStreak,
  computeIntervalModeTimedAdherence,
  computeAverageSessionMinutes,
  computeMostImprovedExerciseThisWeek,
  computeLongestSessionMinutes,
  computeMostPracticedExercise,
  computeMostPracticedPlan,
  computeTopPracticedPlanThisWeek,
  computeSessionsThisWeek,
  computeWeekOverWeekChangePercent,
  computeWeekdayTotals,
  computeCurrentStreak,
  countPracticeDays,
  computeCurrentWeekStreak,
  getSessionLocalDate,
  computeLongestStreak,
  countUniqueTabsPracticed,
  selectMostPracticedExercise,
} from '../domain/stats';
import type {
  PracticeExercise,
  PracticePlan,
  PracticeSession,
  PracticeSessionExercise,
} from '../domain/practice';

const exercises: PracticeExercise[] = [
  {
    id: 'ex-1',
    planId: 'plan-1',
    title: 'Warmup',
    sortOrder: 0,
    timePlannedMinutes: 10,
    intervalAuto: true,
    linkedTabId: 'tab-1',
    linkedAudioId: null,
    totalTimeSpentSeconds: 0,
    bpm: null,
    intervals: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'ex-2',
    planId: 'plan-1',
    title: 'Picking',
    sortOrder: 1,
    timePlannedMinutes: 20,
    intervalAuto: true,
    linkedTabId: 'tab-2',
    linkedAudioId: null,
    totalTimeSpentSeconds: 0,
    bpm: null,
    intervals: [],
    createdAt: '',
    updatedAt: '',
  },
];

const plans: PracticePlan[] = [
  {
    id: 'plan-1',
    title: 'Technique',
    sortOrder: 0,
    timed: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'plan-2',
    title: 'Songs',
    sortOrder: 1,
    timed: false,
    createdAt: '',
    updatedAt: '',
  },
];

describe('stats helpers', () => {
  it('calculates adherence percent from planned vs spent', () => {
    const spent = new Map<string, number>([
      ['ex-1', 8 * 60],
      ['ex-2', 10 * 60],
    ]);
    expect(calculateAdherencePercent(exercises, spent)).toBe(60);
  });

  it('selects most practiced exercise', () => {
    const spent = new Map<string, number>([
      ['ex-1', 100],
      ['ex-2', 200],
    ]);
    const result = selectMostPracticedExercise(exercises, spent);
    expect(result.title).toBe('Picking');
  });

  it('counts unique tabs practiced today', () => {
    const spent = new Map<string, number>([
      ['ex-1', 10],
      ['ex-2', 0],
    ]);
    expect(countUniqueTabsPracticed(exercises, spent)).toBe(1);
  });

  it('selects most practiced plan and exercise overall', () => {
    const weightedExercises = exercises.map((exercise) => ({
      ...exercise,
      planId: exercise.id === 'ex-1' ? 'plan-1' : 'plan-2',
      totalTimeSpentSeconds: exercise.id === 'ex-1' ? 300 : 900,
    }));
    const bestPlan = computeMostPracticedPlan(plans, weightedExercises);
    expect(bestPlan.title).toBe('Songs');
    const bestExercise = computeMostPracticedExercise(weightedExercises);
    expect(bestExercise.title).toBe('Picking');
  });

  it('computes longest session minutes and sessions this week', () => {
    const sessions = [
      {
        id: 's1',
        sessionDate: '2025-01-06',
        startedAt: '2025-01-06T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-06T10:00:00.000Z',
      },
      {
        id: 's2',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 1800,
        createdAt: '2025-01-08T10:00:00.000Z',
      },
    ];
    expect(computeLongestSessionMinutes(sessions)).toBe(30);
    expect(
      computeSessionsThisWeek(sessions, new Date('2025-01-09T00:00:00.000Z')),
    ).toBe(2);
  });

  it('computes practice day counts and average session minutes', () => {
    const totals = new Map<string, number>([
      ['2025-01-06', 600],
      ['2025-01-07', 1200],
      ['2025-01-12', 300],
    ]);
    const sessions: PracticeSession[] = [
      {
        id: 's1',
        sessionDate: '2025-01-06',
        startedAt: '2025-01-06T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-06T10:00:00.000Z',
      },
      {
        id: 's2',
        sessionDate: '2025-01-07',
        startedAt: '2025-01-07T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 1200,
        createdAt: '2025-01-07T10:00:00.000Z',
      },
      {
        id: 's3',
        sessionDate: '2025-01-12',
        startedAt: '2025-01-12T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 300,
        createdAt: '2025-01-12T10:00:00.000Z',
      },
    ];

    const today = new Date('2025-01-12T12:00:00.000Z');
    expect(countPracticeDays(totals, today, 7)).toBe(3);
    expect(computeAverageSessionMinutes(sessions, today, 7)).toBe(11.7);
  });

  it('computes week-over-week change', () => {
    const sessions: PracticeSession[] = [
      {
        id: 's1',
        sessionDate: '2025-01-06',
        startedAt: '2025-01-06T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 1200,
        createdAt: '2025-01-06T10:00:00.000Z',
      },
      {
        id: 's2',
        sessionDate: '2024-12-31',
        startedAt: '2024-12-31T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2024-12-31T10:00:00.000Z',
      },
    ];
    expect(
      computeWeekOverWeekChangePercent(
        sessions,
        new Date('2025-01-09T00:00:00.000Z'),
      ),
    ).toBe(100);
  });

  it('computes top practiced plan and most improved exercise this week', () => {
    const sessions: PracticeSession[] = [
      {
        id: 's-current',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 1200,
        createdAt: '2025-01-08T10:00:00.000Z',
      },
      {
        id: 's-previous',
        sessionDate: '2025-01-01',
        startedAt: '2025-01-01T10:00:00.000Z',
        endedAt: null,
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-01T10:00:00.000Z',
      },
    ];
    const details = new Map<string, PracticeSessionExercise[]>();
    details.set('s-current', [
      {
        id: 'd1',
        sessionId: 's-current',
        exerciseId: 'ex-1',
        timeSpentSeconds: 900,
        createdAt: '2025-01-08T10:00:00.000Z',
      },
      {
        id: 'd2',
        sessionId: 's-current',
        exerciseId: 'ex-2',
        timeSpentSeconds: 300,
        createdAt: '2025-01-08T10:00:00.000Z',
      },
    ]);
    details.set('s-previous', [
      {
        id: 'd3',
        sessionId: 's-previous',
        exerciseId: 'ex-2',
        timeSpentSeconds: 600,
        createdAt: '2025-01-01T10:00:00.000Z',
      },
    ]);

    const improved = computeMostImprovedExerciseThisWeek(
      exercises,
      sessions,
      details,
      new Date('2025-01-09T00:00:00.000Z'),
    );
    expect(improved.title).toBe('Warmup');
    expect(improved.deltaMinutes).toBe(15);

    const topPlan = computeTopPracticedPlanThisWeek(
      plans,
      exercises,
      sessions,
      details,
      new Date('2025-01-09T00:00:00.000Z'),
    );
    expect(topPlan.title).toBe('Technique');
    expect(topPlan.minutes).toBe(20);
  });

  it('computes weekday totals in Monday-first order', () => {
    const totals = new Map<string, number>([
      ['2025-01-06', 600],
      ['2025-01-07', 1200],
      ['2025-01-12', 300],
    ]);
    const result = computeWeekdayTotals(
      totals,
      new Date('2025-01-12T12:00:00.000Z'),
      14,
    );
    expect(result[0].label).toBe('Mon');
    expect(result[0].minutes).toBe(10);
    expect(result[1].label).toBe('Tue');
    expect(result[1].minutes).toBe(20);
    expect(result[6].label).toBe('Sun');
    expect(result[6].minutes).toBe(5);
  });

  it('computes current and longest week streaks', () => {
    const totals = new Map<string, number>([
      ['2024-01-01', 10],
      ['2024-01-02', 5],
      ['2024-01-08', 7],
    ]);
    expect(computeCurrentStreak(totals, new Date('2024-01-02T12:00:00'))).toBe(
      2,
    );
    expect(computeLongestStreak(totals)).toBe(2);
    expect(
      computeCurrentWeekStreak(totals, new Date('2024-01-03T00:00:00')),
    ).toBe(2);
  });

  it('uses session start time to resolve local session date', () => {
    const session = {
      id: 's1',
      sessionDate: '2024-01-10',
      startedAt: '2024-01-10T23:15:00.000Z',
      endedAt: null,
      totalTimeSpentSeconds: 120,
      createdAt: '2024-01-10T23:15:00.000Z',
    };
    const localKey = getSessionLocalDate(session);
    expect(localKey).toMatch(/2024-01-(10|11)/);
  });

  it('computes interval mode metrics', () => {
    const sessions = [
      {
        id: 'im-1',
        sessionDate: '2025-01-08',
        startedAt: '2025-01-08T10:00:00.000Z',
        endedAt: '2025-01-08T10:10:00.000Z',
        timedMode: true,
        plannedTotalSeconds: 900,
        actualRunSeconds: 600,
        intervalDurationSeconds: 60,
        intervalsCompleted: 10,
        startBpm: 80,
        endBpm: 90,
      },
      {
        id: 'im-2',
        sessionDate: '2025-01-07',
        startedAt: '2025-01-07T10:00:00.000Z',
        endedAt: '2025-01-07T10:05:00.000Z',
        timedMode: false,
        plannedTotalSeconds: null,
        actualRunSeconds: 300,
        intervalDurationSeconds: 30,
        intervalsCompleted: 8,
        startBpm: 100,
        endBpm: 96,
      },
    ];
    expect(
      computeIntervalModeIntervalsCompletedForDate(sessions, '2025-01-08'),
    ).toBe(10);
    expect(
      computeIntervalModeIntervalsCompletedForWeek(
        sessions,
        new Date('2025-01-08T12:00:00.000Z'),
      ),
    ).toBe(18);
    expect(computeIntervalModeAverageIntervalDurationSeconds(sessions)).toBe(
      50,
    );
    expect(computeIntervalModeAverageBpmIncrease(sessions)).toBe(3);
    expect(computeIntervalModeLongestStreak(sessions)).toBe(10);
    expect(computeIntervalModeTimedAdherence(sessions)).toEqual({
      percent: 67,
      plannedMinutes: 15,
      actualMinutes: 10,
    });
  });
});
