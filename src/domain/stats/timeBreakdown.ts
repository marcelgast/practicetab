import type { PracticeSession, PracticeSessionExercise } from '../practice';

export type TimeBreakdown = {
  sessionSeconds: number;
  exerciseSelectedSeconds: number;
  generalSeconds: number;
  playbackSeconds: number;
  exercisePlaybackSeconds: number;
  sessionPlaybackSeconds: number;
};

/**
 * Derive the three-tier practice time breakdown from sessions + per-session
 * exercise rows. Mirrors the schema split introduced in v22:
 *  - `sessionSeconds`: global/session timer total — single source of truth
 *    for how long the user was actively practicing.
 *  - `exerciseSelectedSeconds`: sum of expanded-exercise seconds across all
 *    sessions (each `practice_session_exercises.time_spent_seconds`).
 *  - `generalSeconds`: derived — time the session was running but no
 *    exercise was expanded (`sessionSeconds - exerciseSelectedSeconds`),
 *    clamped at zero to tolerate legacy rows where the old add_exercise_time
 *    still bumped session total.
 *  - `playbackSeconds`: actual audio/tab/metronome playback, split into
 *    per-exercise and session-level (playback with no expanded exercise).
 *
 * Pure — no I/O, deterministic for a given input set.
 */
export function computeTimeBreakdown(
  sessions: PracticeSession[],
  sessionExercises: PracticeSessionExercise[],
  options?: { fromDateKey?: string; toDateKey?: string },
): TimeBreakdown {
  const from = options?.fromDateKey;
  const to = options?.toDateKey;
  const relevantSessions = sessions.filter((session) => {
    if (from && session.sessionDate < from) return false;
    if (to && session.sessionDate > to) return false;
    return true;
  });
  const relevantSessionIds = new Set(relevantSessions.map((s) => s.id));
  const relevantEntries = sessionExercises.filter((entry) =>
    relevantSessionIds.has(entry.sessionId),
  );

  const sessionSeconds = relevantSessions.reduce(
    (sum, session) => sum + session.totalTimeSpentSeconds,
    0,
  );
  const sessionPlaybackTotal = relevantSessions.reduce(
    (sum, session) => sum + (session.totalPlaybackSeconds ?? 0),
    0,
  );
  const exerciseSelectedSeconds = relevantEntries.reduce(
    (sum, entry) => sum + entry.timeSpentSeconds,
    0,
  );
  const exercisePlaybackSeconds = relevantEntries.reduce(
    (sum, entry) => sum + (entry.playbackTimeSeconds ?? 0),
    0,
  );
  const generalSeconds = Math.max(0, sessionSeconds - exerciseSelectedSeconds);
  const sessionPlaybackSeconds = Math.max(
    0,
    sessionPlaybackTotal - exercisePlaybackSeconds,
  );

  return {
    sessionSeconds,
    exerciseSelectedSeconds,
    generalSeconds,
    playbackSeconds: sessionPlaybackTotal,
    exercisePlaybackSeconds,
    sessionPlaybackSeconds,
  };
}
