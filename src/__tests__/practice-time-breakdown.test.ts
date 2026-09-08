import { describe, expect, it } from 'vitest';
import { computeTimeBreakdown } from '../domain/stats/timeBreakdown';
import type {
  PracticeSession,
  PracticeSessionExercise,
} from '../domain/practice';

function session(
  overrides: Partial<PracticeSession> & {
    id: string;
    sessionDate: string;
  },
): PracticeSession {
  return {
    id: overrides.id,
    sessionDate: overrides.sessionDate,
    startedAt: overrides.startedAt ?? `${overrides.sessionDate}T10:00:00Z`,
    endedAt: overrides.endedAt ?? null,
    totalTimeSpentSeconds: overrides.totalTimeSpentSeconds ?? 0,
    totalPlaybackSeconds: overrides.totalPlaybackSeconds ?? 0,
    createdAt: overrides.createdAt ?? `${overrides.sessionDate}T10:00:00Z`,
  };
}

function entry(
  overrides: Partial<PracticeSessionExercise> & {
    id: string;
    sessionId: string;
    exerciseId: string;
  },
): PracticeSessionExercise {
  return {
    id: overrides.id,
    sessionId: overrides.sessionId,
    exerciseId: overrides.exerciseId,
    timeSpentSeconds: overrides.timeSpentSeconds ?? 0,
    playbackTimeSeconds: overrides.playbackTimeSeconds ?? 0,
    createdAt: overrides.createdAt ?? '2025-01-01T10:00:00Z',
  };
}

describe('computeTimeBreakdown', () => {
  it('derives General = Session - ExerciseSelected', () => {
    const sessions = [
      session({
        id: 's1',
        sessionDate: '2025-01-01',
        totalTimeSpentSeconds: 1800,
      }),
    ];
    const entries = [
      entry({
        id: 'e1',
        sessionId: 's1',
        exerciseId: 'ex-1',
        timeSpentSeconds: 1000,
      }),
      entry({
        id: 'e2',
        sessionId: 's1',
        exerciseId: 'ex-2',
        timeSpentSeconds: 300,
      }),
    ];

    const result = computeTimeBreakdown(sessions, entries);

    expect(result.sessionSeconds).toBe(1800);
    expect(result.exerciseSelectedSeconds).toBe(1300);
    expect(result.generalSeconds).toBe(500);
  });

  it('splits playback between per-exercise and session-only buckets', () => {
    const sessions = [
      session({
        id: 's1',
        sessionDate: '2025-01-01',
        totalTimeSpentSeconds: 600,
        totalPlaybackSeconds: 420,
      }),
    ];
    const entries = [
      entry({
        id: 'e1',
        sessionId: 's1',
        exerciseId: 'ex-1',
        timeSpentSeconds: 300,
        playbackTimeSeconds: 200,
      }),
      entry({
        id: 'e2',
        sessionId: 's1',
        exerciseId: 'ex-2',
        timeSpentSeconds: 150,
        playbackTimeSeconds: 100,
      }),
    ];

    const result = computeTimeBreakdown(sessions, entries);

    expect(result.playbackSeconds).toBe(420);
    expect(result.exercisePlaybackSeconds).toBe(300);
    // Session playback with no expanded exercise = 420 - 300.
    expect(result.sessionPlaybackSeconds).toBe(120);
  });

  it('clamps General at zero when legacy rows double-count', () => {
    // Pre-v22 rows where add_exercise_time also incremented session total.
    const sessions = [
      session({
        id: 's1',
        sessionDate: '2025-01-01',
        totalTimeSpentSeconds: 100,
      }),
    ];
    const entries = [
      entry({
        id: 'e1',
        sessionId: 's1',
        exerciseId: 'ex-1',
        timeSpentSeconds: 500,
      }),
    ];

    const result = computeTimeBreakdown(sessions, entries);

    expect(result.generalSeconds).toBe(0);
  });

  it('applies date range filters', () => {
    const sessions = [
      session({
        id: 's1',
        sessionDate: '2025-01-01',
        totalTimeSpentSeconds: 1000,
      }),
      session({
        id: 's2',
        sessionDate: '2025-01-05',
        totalTimeSpentSeconds: 2000,
      }),
      session({
        id: 's3',
        sessionDate: '2025-01-10',
        totalTimeSpentSeconds: 3000,
      }),
    ];
    const entries = [
      entry({
        id: 'e1',
        sessionId: 's1',
        exerciseId: 'ex-1',
        timeSpentSeconds: 400,
      }),
      entry({
        id: 'e2',
        sessionId: 's2',
        exerciseId: 'ex-1',
        timeSpentSeconds: 800,
      }),
      entry({
        id: 'e3',
        sessionId: 's3',
        exerciseId: 'ex-2',
        timeSpentSeconds: 1200,
      }),
    ];

    const result = computeTimeBreakdown(sessions, entries, {
      fromDateKey: '2025-01-05',
      toDateKey: '2025-01-05',
    });

    // Only s2 passes the filter.
    expect(result.sessionSeconds).toBe(2000);
    expect(result.exerciseSelectedSeconds).toBe(800);
    expect(result.generalSeconds).toBe(1200);
  });

  it('returns all-zero breakdown for empty input', () => {
    const result = computeTimeBreakdown([], []);
    expect(result).toEqual({
      sessionSeconds: 0,
      exerciseSelectedSeconds: 0,
      generalSeconds: 0,
      playbackSeconds: 0,
      exercisePlaybackSeconds: 0,
      sessionPlaybackSeconds: 0,
    });
  });
});
