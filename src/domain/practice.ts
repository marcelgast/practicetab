import type { Id } from '../utils/id';

export type { Id, IdGenerator } from '../utils/id';
export { createId } from '../utils/id';
export type { Clock } from '../utils/date';
export { nowIso, toLocalDateKeyFromIso as toLocalDateKey } from '../utils/date';

export type PracticePlan = {
  id: Id;
  title: string;
  timed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ExercisePlaybackSource = 'tab' | 'audio' | 'both';

export type PracticeExercise = {
  id: Id;
  planId: Id;
  title: string;
  sortOrder: number;
  timePlannedMinutes: number | null;
  intervalAuto: boolean;
  intervalRepeat?: boolean;
  linkedTabId: Id | null;
  linkedAudioId: Id | null;
  preferredSource?: ExercisePlaybackSource;
  totalTimeSpentSeconds: number;
  bpm: number | null;
  notes?: string | null;
  intervals: PracticeInterval[];
  createdAt: string;
  updatedAt: string;
};

export type PracticeInterval = {
  id: Id;
  exerciseId: Id;
  name: string | null;
  durationSeconds: number;
  bpm: number | null;
  sortIndex: number;
  done: boolean;
  createdAt: number | null;
};

export type PracticeSession = {
  id: Id;
  sessionDate: string;
  startedAt: string;
  endedAt: string | null;
  totalTimeSpentSeconds: number;
  totalPlaybackSeconds: number;
  createdAt: string;
  /**
   * Session Journal fields (PR 4.3). All four null for pre-v24
   * sessions and for any session where the user skipped the goal
   * dialog and never opened the review overlay. `goalPercent` is
   * stored as an integer 0..150; `goalReached` is a three-state
   * tri — null means "not answered yet".
   */
  goalText?: string | null;
  reviewText?: string | null;
  goalPercent?: number | null;
  goalReached?: boolean | null;
};

export type PracticeSessionExercise = {
  id: Id;
  sessionId: Id;
  exerciseId: Id;
  timeSpentSeconds: number;
  playbackTimeSeconds: number;
  playbackMode?: string;
  createdAt: string;
};

export type DailyTotal = {
  date: string;
  durationSec: number;
};

export function aggregateDailyTotals(
  sessions: PracticeSession[],
): DailyTotal[] {
  const totals = new Map<string, number>();

  for (const session of sessions) {
    const key = session.sessionDate;
    const current = totals.get(key) ?? 0;
    totals.set(key, current + session.totalTimeSpentSeconds);
  }

  return Array.from(totals.entries())
    .map(([date, durationSec]) => ({ date, durationSec }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function totalDurationSec(
  sessions: PracticeSession[],
  fromDateKey?: string,
  toDateKey?: string,
): number {
  return sessions.reduce((sum, session) => {
    const key = session.sessionDate;
    if (fromDateKey && key < fromDateKey) {
      return sum;
    }
    if (toDateKey && key > toDateKey) {
      return sum;
    }
    return sum + session.totalTimeSpentSeconds;
  }, 0);
}

export function computeStreak(
  dailyTotals: DailyTotal[],
  minSecPerDay: number,
): number {
  if (dailyTotals.length === 0) {
    return 0;
  }

  const totalsByDate = new Map(
    dailyTotals.map((entry) => [entry.date, entry.durationSec]),
  );

  let streak = 0;
  let currentDate = dailyTotals[dailyTotals.length - 1].date;

  while ((totalsByDate.get(currentDate) ?? 0) >= minSecPerDay) {
    streak += 1;
    const date = new Date(`${currentDate}T00:00:00`);
    date.setDate(date.getDate() - 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    currentDate = `${year}-${month}-${day}`;
    if (!totalsByDate.has(currentDate)) {
      break;
    }
  }

  return streak;
}

export function weeklyTotals(dailyTotals: DailyTotal[]): DailyTotal[] {
  const totals = new Map<string, number>();

  for (const entry of dailyTotals) {
    const date = new Date(`${entry.date}T00:00:00`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    const key = `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    const current = totals.get(key) ?? 0;
    totals.set(key, current + entry.durationSec);
  }

  return Array.from(totals.entries())
    .map(([date, durationSec]) => ({ date, durationSec }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
