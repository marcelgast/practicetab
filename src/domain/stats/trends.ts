import type {
  PracticeExercise,
  PracticePlan,
  PracticeSession,
  PracticeSessionExercise,
} from '../practice';
import {
  getSessionLocalDate,
  getWeekStart,
  normalizeDisplayMinutes,
} from './aggregation';
import type { IntervalModeSession } from './types';

export function computeWeekOverWeekChangePercent(
  sessions: PracticeSession[],
  today: Date,
): number {
  const thisWeekStart = getWeekStart(today);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);

  const currentSeconds = sessions.reduce((sum, session) => {
    const date = new Date(`${getSessionLocalDate(session)}T00:00:00`);
    if (date >= thisWeekStart && date < thisWeekEnd) {
      return sum + session.totalTimeSpentSeconds;
    }
    return sum;
  }, 0);
  const previousSeconds = sessions.reduce((sum, session) => {
    const date = new Date(`${getSessionLocalDate(session)}T00:00:00`);
    if (date >= lastWeekStart && date < lastWeekEnd) {
      return sum + session.totalTimeSpentSeconds;
    }
    return sum;
  }, 0);

  if (previousSeconds <= 0) {
    return currentSeconds > 0 ? 100 : 0;
  }
  return Math.round(
    ((currentSeconds - previousSeconds) / previousSeconds) * 100,
  );
}

export function computeTopPracticedPlanThisWeek(
  plans: PracticePlan[],
  exercises: PracticeExercise[],
  sessions: PracticeSession[],
  sessionDetails: Map<string, PracticeSessionExercise[]>,
  today: Date,
): { title: string; minutes: number } {
  if (plans.length === 0) {
    return { title: '—', minutes: 0 };
  }
  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const exerciseToPlan = new Map(
    exercises.map((exercise) => [exercise.id, exercise.planId]),
  );
  const planTotals = new Map<string, number>();

  sessions.forEach((session) => {
    const date = new Date(`${getSessionLocalDate(session)}T00:00:00`);
    if (date < weekStart || date >= weekEnd) {
      return;
    }
    const entries = sessionDetails.get(session.id) ?? [];
    entries.forEach((entry) => {
      const planId = exerciseToPlan.get(entry.exerciseId);
      if (!planId) {
        return;
      }
      const current = planTotals.get(planId) ?? 0;
      planTotals.set(planId, current + entry.timeSpentSeconds);
    });
  });

  let bestTitle = '—';
  let bestMinutes = 0;
  plans.forEach((plan) => {
    const minutes = normalizeDisplayMinutes(planTotals.get(plan.id) ?? 0);
    if (minutes > bestMinutes) {
      bestMinutes = minutes;
      bestTitle = plan.title;
    }
  });
  return { title: bestTitle, minutes: bestMinutes };
}

export function computeMostImprovedExerciseThisWeek(
  exercises: PracticeExercise[],
  sessions: PracticeSession[],
  sessionDetails: Map<string, PracticeSessionExercise[]>,
  today: Date,
): { title: string; deltaMinutes: number } {
  if (exercises.length === 0) {
    return { title: '—', deltaMinutes: 0 };
  }
  const thisWeekStart = getWeekStart(today);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const current = new Map<string, number>();
  const previous = new Map<string, number>();

  sessions.forEach((session) => {
    const date = new Date(`${getSessionLocalDate(session)}T00:00:00`);
    const entries = sessionDetails.get(session.id) ?? [];
    if (date >= thisWeekStart && date < thisWeekEnd) {
      entries.forEach((entry) => {
        current.set(
          entry.exerciseId,
          (current.get(entry.exerciseId) ?? 0) + entry.timeSpentSeconds,
        );
      });
      return;
    }
    if (date >= lastWeekStart && date < thisWeekStart) {
      entries.forEach((entry) => {
        previous.set(
          entry.exerciseId,
          (previous.get(entry.exerciseId) ?? 0) + entry.timeSpentSeconds,
        );
      });
    }
  });

  let bestTitle = '—';
  let bestDeltaMinutes = 0;
  exercises.forEach((exercise) => {
    const deltaSeconds =
      (current.get(exercise.id) ?? 0) - (previous.get(exercise.id) ?? 0);
    const deltaMinutes = normalizeDisplayMinutes(deltaSeconds);
    if (deltaMinutes > bestDeltaMinutes) {
      bestDeltaMinutes = deltaMinutes;
      bestTitle = exercise.title;
    }
  });
  return { title: bestTitle, deltaMinutes: bestDeltaMinutes };
}

export function computeSessionsThisWeek(
  sessions: PracticeSession[],
  today: Date,
): number {
  const weekStart = getWeekStart(today);
  return sessions.filter((session) => {
    const date = new Date(`${getSessionLocalDate(session)}T00:00:00`);
    return date >= weekStart && date <= today;
  }).length;
}

export function computeIntervalModeIntervalsCompletedForDate(
  sessions: IntervalModeSession[],
  dateKey: string,
): number {
  return sessions.reduce((sum, session) => {
    if (session.sessionDate !== dateKey) {
      return sum;
    }
    return sum + Math.max(0, session.intervalsCompleted);
  }, 0);
}

export function computeIntervalModeIntervalsCompletedForWeek(
  sessions: IntervalModeSession[],
  today: Date,
): number {
  const start = getWeekStart(today);
  return sessions.reduce((sum, session) => {
    const date = new Date(`${session.sessionDate}T00:00:00`);
    if (date < start || date > today) {
      return sum;
    }
    return sum + Math.max(0, session.intervalsCompleted);
  }, 0);
}

export function computeIntervalModeAverageIntervalDurationSeconds(
  sessions: IntervalModeSession[],
): number {
  const aggregate = sessions.reduce(
    (acc, session) => {
      const completed = Math.max(0, session.intervalsCompleted);
      if (completed <= 0) {
        return acc;
      }
      acc.totalRunSeconds += Math.max(0, session.actualRunSeconds);
      acc.totalIntervals += completed;
      return acc;
    },
    { totalRunSeconds: 0, totalIntervals: 0 },
  );
  if (aggregate.totalIntervals <= 0) {
    return 0;
  }
  return Math.round(aggregate.totalRunSeconds / aggregate.totalIntervals);
}

export function computeIntervalModeAverageBpmIncrease(
  sessions: IntervalModeSession[],
): number {
  if (sessions.length === 0) {
    return 0;
  }
  const totalDelta = sessions.reduce((sum, session) => {
    return sum + (session.endBpm - session.startBpm);
  }, 0);
  return Math.round((totalDelta / sessions.length) * 10) / 10;
}

export function computeIntervalModeLongestStreak(
  sessions: IntervalModeSession[],
): number {
  return sessions.reduce((max, session) => {
    return Math.max(max, Math.max(0, session.intervalsCompleted));
  }, 0);
}

export function computeIntervalModeTimedAdherence(
  sessions: IntervalModeSession[],
): {
  percent: number;
  plannedMinutes: number;
  actualMinutes: number;
} {
  const aggregate = sessions.reduce(
    (acc, session) => {
      if (!session.timedMode) {
        return acc;
      }
      if (!session.plannedTotalSeconds || session.plannedTotalSeconds <= 0) {
        return acc;
      }
      acc.planned += session.plannedTotalSeconds;
      acc.actual += Math.max(0, session.actualRunSeconds);
      return acc;
    },
    { planned: 0, actual: 0 },
  );
  if (aggregate.planned <= 0) {
    return { percent: 0, plannedMinutes: 0, actualMinutes: 0 };
  }
  return {
    percent: Math.round((aggregate.actual / aggregate.planned) * 100),
    plannedMinutes: normalizeDisplayMinutes(aggregate.planned),
    actualMinutes: normalizeDisplayMinutes(aggregate.actual),
  };
}
