import type {
  PracticeExercise,
  PracticePlan,
  PracticeSession,
} from '../practice';
import { toLocalDateKey } from '../../utils/date';
import type { WeekTotal } from './types';

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getSessionLocalDate(session: PracticeSession): string {
  return toLocalDateKey(new Date(session.startedAt));
}

export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - (day - 1));
  return result;
}

export function getDateRangeDays(endDate: Date, days: number): string[] {
  const result: string[] = [];
  const cursor = new Date(endDate);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i += 1) {
    result.unshift(toLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return result;
}

export function buildDailyTotals(
  sessions: PracticeSession[],
): Map<string, number> {
  const totals = new Map<string, number>();
  sessions.forEach((session) => {
    const current = totals.get(session.sessionDate) ?? 0;
    totals.set(session.sessionDate, current + session.totalTimeSpentSeconds);
  });
  return totals;
}

export function calculateAdherencePercent(
  exercises: PracticeExercise[],
  todaySecondsByExercise: Map<string, number>,
): number {
  let planned = 0;
  let spent = 0;
  exercises.forEach((exercise) => {
    const plannedMinutes = exercise.timePlannedMinutes ?? 0;
    if (plannedMinutes > 0) {
      planned += plannedMinutes * 60;
      spent += todaySecondsByExercise.get(exercise.id) ?? 0;
    }
  });
  if (planned <= 0) {
    return 0;
  }
  return Math.round((spent / planned) * 100);
}

export function countExercisesCompleted(
  exercises: PracticeExercise[],
  todaySecondsByExercise: Map<string, number>,
): number {
  return exercises.reduce((count, exercise) => {
    const plannedMinutes = exercise.timePlannedMinutes ?? 0;
    if (plannedMinutes <= 0) {
      return count;
    }
    const planned = plannedMinutes * 60;
    const spent = todaySecondsByExercise.get(exercise.id) ?? 0;
    return spent >= planned * 0.8 ? count + 1 : count;
  }, 0);
}

export function selectMostPracticedExercise(
  exercises: PracticeExercise[],
  secondsByExercise: Map<string, number>,
): { title: string; seconds: number } {
  let bestTitle = '—';
  let bestSeconds = 0;
  exercises.forEach((exercise) => {
    const seconds = secondsByExercise.get(exercise.id) ?? 0;
    if (seconds > bestSeconds) {
      bestSeconds = seconds;
      bestTitle = exercise.title;
    }
  });
  return { title: bestTitle, seconds: bestSeconds };
}

export function countUniqueTabsPracticed(
  exercises: PracticeExercise[],
  secondsByExercise: Map<string, number>,
): number {
  const unique = new Set<string>();
  exercises.forEach((exercise) => {
    const seconds = secondsByExercise.get(exercise.id) ?? 0;
    if (seconds > 0) {
      const linkedId = exercise.linkedTabId;
      if (linkedId) {
        unique.add(linkedId);
      }
    }
  });
  return unique.size;
}

export function normalizeDisplayMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

export function computeAverageMinutesPerDay(
  dailyTotals: Map<string, number>,
  today: Date,
  days: number,
): number {
  const keys = getDateRangeDays(today, days);
  const totalSeconds = keys.reduce(
    (sum, key) => sum + (dailyTotals.get(key) ?? 0),
    0,
  );
  return Math.round((totalSeconds / 60 / days) * 10) / 10;
}

export function countPracticeDays(
  dailyTotals: Map<string, number>,
  today: Date,
  days: number,
): number {
  return getDateRangeDays(today, days).reduce((count, key) => {
    return (dailyTotals.get(key) ?? 0) > 0 ? count + 1 : count;
  }, 0);
}

export function computeAverageSessionMinutes(
  sessions: PracticeSession[],
  today: Date,
  days: number,
): number {
  const keys = new Set(getDateRangeDays(today, days));
  const inRange = sessions.filter((session) =>
    keys.has(getSessionLocalDate(session)),
  );
  if (inRange.length === 0) {
    return 0;
  }
  const totalSeconds = inRange.reduce(
    (sum, session) => sum + session.totalTimeSpentSeconds,
    0,
  );
  return Math.round((totalSeconds / 60 / inRange.length) * 10) / 10;
}

export function computeLongestSessionMinutes(
  sessions: PracticeSession[],
): number {
  const best = sessions.reduce(
    (max, session) => Math.max(max, session.totalTimeSpentSeconds),
    0,
  );
  return normalizeDisplayMinutes(best);
}

export function computeMostPracticedPlan(
  plans: PracticePlan[],
  exercises: PracticeExercise[],
): { title: string; minutes: number } {
  if (plans.length === 0) {
    return { title: '—', minutes: 0 };
  }
  const totals = new Map<string, number>();
  exercises.forEach((exercise) => {
    const current = totals.get(exercise.planId) ?? 0;
    totals.set(
      exercise.planId,
      current + (exercise.totalTimeSpentSeconds ?? 0),
    );
  });
  let bestTitle = '—';
  let bestMinutes = 0;
  plans.forEach((plan) => {
    const minutes = normalizeDisplayMinutes(totals.get(plan.id) ?? 0);
    if (minutes > bestMinutes) {
      bestMinutes = minutes;
      bestTitle = plan.title;
    }
  });
  return { title: bestTitle, minutes: bestMinutes };
}

export function computeMostPracticedExercise(exercises: PracticeExercise[]): {
  title: string;
  minutes: number;
} {
  if (exercises.length === 0) {
    return { title: '—', minutes: 0 };
  }
  let bestTitle = '—';
  let bestMinutes = 0;
  exercises.forEach((exercise) => {
    const minutes = normalizeDisplayMinutes(
      exercise.totalTimeSpentSeconds ?? 0,
    );
    if (minutes > bestMinutes) {
      bestMinutes = minutes;
      bestTitle = exercise.title;
    }
  });
  return { title: bestTitle, minutes: bestMinutes };
}

export function computeWeeklyTotals(
  sessions: PracticeSession[],
  today: Date,
): WeekTotal[] {
  const currentWeekStart = getWeekStart(today);
  const totals: WeekTotal[] = [];
  for (let i = 0; i < 8; i += 1) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const minutes = Math.round(
      sessions
        .filter((session) => {
          const date = new Date(`${getSessionLocalDate(session)}T00:00:00`);
          return date >= start && date < end;
        })
        .reduce((sum, session) => sum + session.totalTimeSpentSeconds, 0) / 60,
    );
    totals.push({
      label: `Week -${i}`,
      minutes,
    });
  }
  return totals;
}

export function computeWeekdayTotals(
  dailyTotals: Map<string, number>,
  today: Date,
  days: number,
): { label: string; minutes: number }[] {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const totals = new Array(7).fill(0);
  dailyTotals.forEach((seconds, dateKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    if (date < start || date > today) {
      return;
    }
    totals[date.getDay()] += seconds / 60;
  });
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((index) => ({
    label: WEEKDAY_LABELS[index],
    minutes: Math.round(totals[index]),
  }));
}

export function computeMostConsistentWeekday(
  dailyTotals: Map<string, number>,
  today: Date,
): { label: string; minutes: number } {
  const start = getWeekStart(today);
  start.setDate(start.getDate() - 7 * 7);
  const totals = new Array(7).fill(0);
  dailyTotals.forEach((seconds, dateKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    if (date < start || date > today) {
      return;
    }
    totals[date.getDay()] += seconds / 60;
  });
  let bestIndex = 0;
  let bestAverage = 0;
  totals.forEach((minutes, index) => {
    const average = minutes / 8;
    if (average > bestAverage) {
      bestAverage = average;
      bestIndex = index;
    }
  });
  return { label: WEEKDAY_LABELS[bestIndex], minutes: Math.round(bestAverage) };
}

export function computeBestDayThisWeek(
  dailyTotals: Map<string, number>,
  today: Date,
): { date: string; minutes: number } {
  const start = getWeekStart(today);
  let bestDate = '—';
  let bestMinutes = 0;
  dailyTotals.forEach((seconds, dateKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    if (date < start || date > today) {
      return;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes > bestMinutes) {
      bestMinutes = minutes;
      bestDate = dateKey;
    }
  });
  return { date: bestDate, minutes: bestMinutes };
}
