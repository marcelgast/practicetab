import type {
  PracticeExercise,
  PracticePlan,
  PracticeSession,
  PracticeSessionExercise,
} from '../practice';
import type {
  ExerciseBpmHistoryEntry,
  ExercisePlaybackModeLabel,
  InDepthExerciseGroup,
  PerExerciseModeBreakdown,
  PerExerciseStats,
} from './types';

function entriesForExercise(
  exerciseId: string,
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): PracticeSessionExercise[] {
  const result: PracticeSessionExercise[] = [];
  for (const entries of sessionDetails.values()) {
    for (const entry of entries) {
      if (entry.exerciseId === exerciseId) {
        result.push(entry);
      }
    }
  }
  return result;
}

export function computeExerciseTotalMinutes(
  exerciseId: string,
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): number {
  const entries = entriesForExercise(exerciseId, sessionDetails);
  const totalSeconds = entries.reduce(
    (sum, entry) => sum + entry.timeSpentSeconds,
    0,
  );
  return Math.round((totalSeconds / 60) * 10) / 10;
}

/** Sum of actual playback time (tab/audio/metronome) spent on this
 * exercise — the "time played" counterpart to the expansion-based
 * `computeExerciseTotalMinutes`. */
export function computeExercisePlaybackMinutes(
  exerciseId: string,
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): number {
  const entries = entriesForExercise(exerciseId, sessionDetails);
  const totalSeconds = entries.reduce(
    (sum, entry) => sum + (entry.playbackTimeSeconds ?? 0),
    0,
  );
  return Math.round((totalSeconds / 60) * 10) / 10;
}

export function computeExerciseAvgPerSession(
  exerciseId: string,
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): number {
  const entries = entriesForExercise(exerciseId, sessionDetails);
  if (entries.length === 0) {
    return 0;
  }
  const uniqueSessions = new Set(entries.map((e) => e.sessionId));
  const totalSeconds = entries.reduce(
    (sum, entry) => sum + entry.timeSpentSeconds,
    0,
  );
  return Math.round((totalSeconds / 60 / uniqueSessions.size) * 10) / 10;
}

export function computeExerciseLastSessionDate(
  exerciseId: string,
  sessions: PracticeSession[],
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): string | null {
  const entries = entriesForExercise(exerciseId, sessionDetails);
  if (entries.length === 0) {
    return null;
  }
  const sessionIds = new Set(entries.map((e) => e.sessionId));
  const matchingSessions = sessions.filter((s) => sessionIds.has(s.id));
  if (matchingSessions.length === 0) {
    return null;
  }
  matchingSessions.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  return matchingSessions[0].sessionDate;
}

function getMondayWeekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - (day - 1));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${d}`;
}

export function computeExerciseTrendPercent(
  exerciseId: string,
  sessions: PracticeSession[],
  sessionDetails: Map<string, PracticeSessionExercise[]>,
  today: string,
): number | null {
  const thisWeekStart = getMondayWeekStart(today);
  const prevDate = new Date(`${thisWeekStart}T00:00:00`);
  prevDate.setDate(prevDate.getDate() - 7);
  const prevWeekStart = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;

  const entries = entriesForExercise(exerciseId, sessionDetails);
  const sessionDateMap = new Map(sessions.map((s) => [s.id, s.sessionDate]));

  let thisWeekSeconds = 0;
  let prevWeekSeconds = 0;

  for (const entry of entries) {
    const sessionDate = sessionDateMap.get(entry.sessionId);
    if (!sessionDate) {
      continue;
    }
    if (sessionDate >= thisWeekStart && sessionDate <= today) {
      thisWeekSeconds += entry.timeSpentSeconds;
    } else if (sessionDate >= prevWeekStart && sessionDate < thisWeekStart) {
      prevWeekSeconds += entry.timeSpentSeconds;
    }
  }

  if (prevWeekSeconds === 0 && thisWeekSeconds === 0) {
    return null;
  }
  if (prevWeekSeconds === 0) {
    return 100;
  }
  return Math.round(
    ((thisWeekSeconds - prevWeekSeconds) / prevWeekSeconds) * 100,
  );
}

export function computeExercisePracticeDays(
  exerciseId: string,
  sessions: PracticeSession[],
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): number {
  const entries = entriesForExercise(exerciseId, sessionDetails);
  const sessionDateMap = new Map(sessions.map((s) => [s.id, s.sessionDate]));
  const dates = new Set<string>();
  for (const entry of entries) {
    const date = sessionDateMap.get(entry.sessionId);
    if (date) {
      dates.add(date);
    }
  }
  return dates.size;
}

export function computeExerciseLongestStreak(
  exerciseId: string,
  sessions: PracticeSession[],
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): number {
  const entries = entriesForExercise(exerciseId, sessionDetails);
  const sessionDateMap = new Map(sessions.map((s) => [s.id, s.sessionDate]));
  const dates = new Set<string>();
  for (const entry of entries) {
    const date = sessionDateMap.get(entry.sessionId);
    if (date) {
      dates.add(date);
    }
  }
  if (dates.size === 0) {
    return 0;
  }
  const sorted = Array.from(dates).sort();
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`);
    const curr = new Date(`${sorted[i]}T00:00:00`);
    const diffMs = curr.getTime() - prev.getTime();
    if (diffMs === 86400000) {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

export function computeExerciseAdherence(
  exercise: PracticeExercise,
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): number | null {
  if (!exercise.timePlannedMinutes || exercise.timePlannedMinutes <= 0) {
    return null;
  }
  const entries = entriesForExercise(exercise.id, sessionDetails);
  if (entries.length === 0) {
    return null;
  }
  const uniqueSessions = new Set(entries.map((e) => e.sessionId)).size;
  const totalSeconds = entries.reduce(
    (sum, entry) => sum + entry.timeSpentSeconds,
    0,
  );
  const plannedSeconds = exercise.timePlannedMinutes * 60 * uniqueSessions;
  return Math.round((totalSeconds / plannedSeconds) * 100);
}

export function resolveExercisePlaybackMode(
  exercise: PracticeExercise,
): ExercisePlaybackModeLabel {
  const hasTab = Boolean(exercise.linkedTabId);
  const hasAudio = Boolean(exercise.linkedAudioId);
  if (hasTab && hasAudio) {
    return exercise.preferredSource === 'both'
      ? 'dual'
      : exercise.preferredSource === 'audio'
        ? 'song'
        : 'tab';
  }
  if (hasTab) return 'tab';
  if (hasAudio) return 'song';
  return 'metronome';
}

export function computeExerciseModeBreakdown(
  exerciseId: string,
  sessionDetails: Map<string, PracticeSessionExercise[]>,
): PerExerciseModeBreakdown {
  const entries = entriesForExercise(exerciseId, sessionDetails);
  const byMode: Record<string, number> = {
    tab: 0,
    song: 0,
    dual: 0,
    metronome: 0,
  };
  for (const entry of entries) {
    const mode = entry.playbackMode ?? 'metronome';
    const key = mode in byMode ? mode : 'metronome';
    byMode[key] += entry.timeSpentSeconds;
  }
  const totalSeconds =
    byMode.tab + byMode.song + byMode.dual + byMode.metronome;
  const toEntry = (seconds: number) => ({
    minutes: Math.round((seconds / 60) * 10) / 10,
    percent: totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0,
  });
  return {
    tab: toEntry(byMode.tab),
    song: toEntry(byMode.song),
    dual: toEntry(byMode.dual),
    metronome: toEntry(byMode.metronome),
  };
}

export function computePerExerciseStats(
  exercise: PracticeExercise,
  planTitle: string,
  sessions: PracticeSession[],
  sessionDetails: Map<string, PracticeSessionExercise[]>,
  bpmHistory: ExerciseBpmHistoryEntry[],
  today: string,
): PerExerciseStats {
  const exerciseBpm = bpmHistory
    .filter((entry) => entry.exerciseId === exercise.id)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((entry) => ({ date: entry.sessionDate, bpm: entry.bpm }));

  const entries = entriesForExercise(exercise.id, sessionDetails);
  const intervalSessionIds = new Set(entries.map((e) => e.sessionId));

  return {
    exerciseId: exercise.id,
    exerciseTitle: exercise.title,
    planId: exercise.planId,
    planTitle,
    playbackMode: resolveExercisePlaybackMode(exercise),
    totalTimeMinutes: computeExerciseTotalMinutes(exercise.id, sessionDetails),
    playbackTimeMinutes: computeExercisePlaybackMinutes(
      exercise.id,
      sessionDetails,
    ),
    avgTimePerSessionMinutes: computeExerciseAvgPerSession(
      exercise.id,
      sessionDetails,
    ),
    lastSessionDate: computeExerciseLastSessionDate(
      exercise.id,
      sessions,
      sessionDetails,
    ),
    trendVsLastWeekPercent: computeExerciseTrendPercent(
      exercise.id,
      sessions,
      sessionDetails,
      today,
    ),
    intervalSessionsCount: intervalSessionIds.size,
    bpmHistory: exerciseBpm,
    intervalsCompleted: entries.length,
    practiceDays: computeExercisePracticeDays(
      exercise.id,
      sessions,
      sessionDetails,
    ),
    longestStreakDays: computeExerciseLongestStreak(
      exercise.id,
      sessions,
      sessionDetails,
    ),
    adherencePercent: computeExerciseAdherence(exercise, sessionDetails),
    modeBreakdown: computeExerciseModeBreakdown(exercise.id, sessionDetails),
  };
}

export function groupExercisesByPlan(
  plans: PracticePlan[],
  allStats: PerExerciseStats[],
): InDepthExerciseGroup[] {
  const groups: InDepthExerciseGroup[] = [];
  for (const plan of plans) {
    const exercises = allStats.filter((stat) => stat.planId === plan.id);
    if (exercises.length > 0) {
      groups.push({
        planId: plan.id,
        planTitle: plan.title,
        exercises,
      });
    }
  }
  return groups;
}
