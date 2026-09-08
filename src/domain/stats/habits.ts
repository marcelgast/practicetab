import type {
  PracticeExercise,
  PracticeSession,
  PracticeSessionExercise,
} from '../practice';
import { toLocalDateKey } from '../../utils/date';
import { getWeekStart } from './aggregation';

export function computeCurrentStreak(
  dailyTotals: Map<string, number>,
  today: Date = new Date(),
): number {
  if (dailyTotals.size === 0) {
    return 0;
  }
  let streak = 0;
  let current = toLocalDateKey(today);
  while ((dailyTotals.get(current) ?? 0) > 0) {
    streak += 1;
    const date = new Date(`${current}T00:00:00`);
    date.setDate(date.getDate() - 1);
    current = toLocalDateKey(date);
    if (!dailyTotals.has(current)) {
      break;
    }
  }
  return streak;
}

export function computeLongestStreak(dailyTotals: Map<string, number>): number {
  if (dailyTotals.size === 0) {
    return 0;
  }
  const dates = Array.from(dailyTotals.keys()).sort();
  let longest = 0;
  let currentStreak = 0;
  let previousDate: string | null = null;
  dates.forEach((date) => {
    const total = dailyTotals.get(date) ?? 0;
    if (total <= 0) {
      currentStreak = 0;
      previousDate = date;
      return;
    }
    if (previousDate) {
      const previous = new Date(`${previousDate}T00:00:00`);
      previous.setDate(previous.getDate() + 1);
      const expected = toLocalDateKey(previous);
      if (expected !== date) {
        currentStreak = 0;
      }
    }
    currentStreak += 1;
    longest = Math.max(longest, currentStreak);
    previousDate = date;
  });
  return longest;
}

export function computeCurrentWeekStreak(
  dailyTotals: Map<string, number>,
  today: Date,
): number {
  const weekKey = toLocalDateKey(getWeekStart(today));
  return computeWeeklyPracticeCount(dailyTotals, weekKey);
}

function computeWeeklyPracticeCount(
  dailyTotals: Map<string, number>,
  weekStartKey: string,
): number {
  let count = 0;
  dailyTotals.forEach((seconds, dateKey) => {
    if (seconds <= 0) {
      return;
    }
    const day = new Date(`${dateKey}T00:00:00`);
    if (toLocalDateKey(getWeekStart(day)) === weekStartKey) {
      count += 1;
    }
  });
  return count;
}

export function computeExerciseSessionStreak(
  sessions: PracticeSession[],
  sessionExercises: Map<string, PracticeSessionExercise[]>,
  exercises: PracticeExercise[],
): { title: string; streak: number } {
  if (sessions.length === 0) {
    return { title: '—', streak: 0 };
  }
  const ordered = [...sessions].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );
  let bestTitle = '—';
  let bestStreak = 0;
  exercises.forEach((exercise) => {
    let streak = 0;
    let maxStreak = 0;
    ordered.forEach((session) => {
      const entries = sessionExercises.get(session.id) ?? [];
      const spent = entries.find(
        (entry) => entry.exerciseId === exercise.id,
      )?.timeSpentSeconds;
      if (spent && spent > 0) {
        streak += 1;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    });
    if (maxStreak > bestStreak) {
      bestStreak = maxStreak;
      bestTitle = exercise.title;
    }
  });
  return { title: bestTitle, streak: bestStreak };
}
