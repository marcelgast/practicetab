import type {
  PracticeExercise,
  PracticeInterval,
  PracticePlan,
  PracticeSession,
  PracticeSessionExercise,
} from '../domain/practice';

export type PracticePlanPayload = PracticePlan & {
  exercises: PracticeExercise[];
};

export type ActiveSessionPayload = {
  session: PracticeSession;
  exercises: PracticeSessionExercise[];
};

export type SessionDetailPayload = {
  session: PracticeSession;
  exercises: PracticeSessionExercise[];
};

export type ExerciseBpmHistoryPayload = {
  id: string;
  exerciseId: string;
  sessionDate: string;
  bpm: number;
  recordedAt: string;
};

export type IntervalModeSessionPayload = {
  id: string;
  sessionDate: string;
  startedAt: string;
  endedAt: string;
  timedMode: boolean;
  plannedTotalSeconds: number | null;
  actualRunSeconds: number;
  intervalDurationSeconds: number;
  intervalsCompleted: number;
  startBpm: number;
  endBpm: number;
};

export type LibraryItemStatsPayload = {
  libraryItemId: string;
  playCount: number;
  totalTimeSeconds: number;
  loopCount: number;
  lastPlayedAt: string | null;
};

export type RestorePracticeStatsInput = {
  sessions: PracticeSession[];
  sessionExercises: PracticeSessionExercise[];
  exerciseTotals: Array<{ exerciseId: string; totalTimeSpentSeconds: number }>;
  intervalsCompletedTotal: number;
  bpmHistory?: ExerciseBpmHistoryPayload[];
  libraryItemStats?: LibraryItemStatsPayload[];
  /**
   * Feedback runs to re-insert on restore. Mirrors the Rust
   * `FeedbackRunInsert` struct — no ids (AUTOINCREMENT assigns
   * fresh ones). Optional so pre-v23 backup files (without the
   * field) restore cleanly without overwriting anything.
   */
  feedbackRuns?: FeedbackRunRestorePayload[];
};

/**
 * Restore-side shape for a single feedback run. Exactly mirrors
 * the Rust `FeedbackRunInsert` — the backup DTO type
 * (`PtFeedbackRunDTO`) happens to match field-for-field, so the
 * importer passes it through unchanged.
 */
export type FeedbackRunRestorePayload = {
  sessionId: string | null;
  exerciseId: string | null;
  libraryItemId: string;
  endedAt: string;
  durationSeconds: number;
  strictnessPreset: string;
  totalNotes: number;
  hitCount: number;
  missedCount: number;
  extraCount: number;
  pitchPerfect: number;
  pitchGood: number;
  pitchAcceptable: number;
  pitchWrong: number;
  timingPerfect: number;
  timingGood: number;
  timingAcceptable: number;
  timingWrong: number;
  longestStreak: number;
  overallScore: number;
  suggestSlowDown: boolean;
  suggestStringMuting: boolean;
  detailsJson: string;
};

export type PracticePersistence = {
  listPracticePlans: () => Promise<PracticePlanPayload[]>;
  createPracticePlan: (title: string, timed: boolean) => Promise<PracticePlan>;
  updatePracticePlan: (
    planId: string,
    input: { title?: string; timed?: boolean },
  ) => Promise<void>;
  renamePracticePlan: (planId: string, title: string) => Promise<void>;
  reorderPracticePlans: (orderedIds: string[]) => Promise<void>;
  deletePracticePlan: (planId: string) => Promise<void>;
  createExercise: (
    planId: string,
    input: {
      title: string;
      timePlannedMinutes: number | null;
      bpm?: number;
      notes?: string | null;
    },
  ) => Promise<PracticeExercise>;
  updateExercise: (
    exerciseId: string,
    input: {
      title?: string;
      timePlannedMinutes?: number | null;
      bpm?: number | null;
      intervalAuto?: boolean;
      intervalRepeat?: boolean;
      notes?: string | null;
      preferredSource?: 'tab' | 'audio' | 'both';
    },
  ) => Promise<void>;
  deleteExercise: (exerciseId: string) => Promise<void>;
  reorderExercises: (planId: string, orderedIds: string[]) => Promise<void>;
  linkExerciseToLibraryItem: (
    exerciseId: string,
    libraryItemId: string,
  ) => Promise<void>;
  linkExerciseToAudio: (exerciseId: string, audioId: string) => Promise<void>;
  unlinkExerciseFromLibraryItem: (
    exerciseId: string,
    kind?: 'tab' | 'audio',
  ) => Promise<void>;
  listIntervals: (exerciseId: string) => Promise<PracticeInterval[]>;
  createInterval: (
    exerciseId: string,
    input: {
      name?: string | null;
      durationSeconds: number;
      sortIndex: number;
      bpm?: number | null;
    },
  ) => Promise<PracticeInterval>;
  updateInterval: (
    intervalId: string,
    input: {
      name?: string | null;
      durationSeconds?: number;
      bpm?: number | null;
      done?: boolean;
    },
  ) => Promise<PracticeInterval>;
  deleteInterval: (intervalId: string) => Promise<void>;
  reorderIntervals: (exerciseId: string, orderedIds: string[]) => Promise<void>;
  clearIntervalDoneFlags: (exerciseId: string) => Promise<void>;
  startSessionIfNeeded: () => Promise<PracticeSession>;
  endActiveSession: () => Promise<void>;
  addExerciseTime: (
    exerciseId: string,
    deltaSeconds: number,
    playbackMode?: string,
  ) => Promise<void>;
  addSessionTime: (deltaSeconds: number) => Promise<void>;
  addPlaybackTime: (
    exerciseId: string | null,
    deltaSeconds: number,
  ) => Promise<void>;
  confirmClose: () => Promise<void>;
  getActiveSession: () => Promise<ActiveSessionPayload | null>;
  listSessions: (options?: {
    from?: string;
    to?: string;
  }) => Promise<PracticeSession[]>;
  getSessionDetail: (sessionId: string) => Promise<SessionDetailPayload>;
  /** Session Journal — set / overwrite the goal at session start. */
  updateSessionGoal: (sessionId: string, goalText: string) => Promise<void>;
  /** Session Journal — atomic write of review text + percent + reached flag. */
  updateSessionReview: (
    sessionId: string,
    input: {
      reviewText?: string | null;
      goalPercent?: number | null;
      goalReached?: boolean | null;
    },
  ) => Promise<void>;
  /** Session Journal — null the four journal columns on a session. */
  clearSessionJournal: (sessionId: string) => Promise<void>;
  /** Session Journal — newest-first list of sessions with any journal content. */
  listSessionsWithJournal: () => Promise<PracticeSession[]>;
  getIntervalsCompletedTotal: () => Promise<number>;
  incrementIntervalsCompletedTotal: (delta: number) => Promise<number>;
  listIntervalModeSessions: (options?: {
    from?: string;
    to?: string;
  }) => Promise<IntervalModeSessionPayload[]>;
  recordIntervalModeSession: (
    input: Omit<IntervalModeSessionPayload, 'id'> & { id?: string },
  ) => Promise<IntervalModeSessionPayload>;
  recordExerciseBpm: (
    exerciseId: string,
    bpm: number,
  ) => Promise<ExerciseBpmHistoryPayload>;
  listExerciseBpmHistory: () => Promise<ExerciseBpmHistoryPayload[]>;
  recordLibraryItemTime: (
    libraryItemId: string,
    deltaSeconds: number,
  ) => Promise<void>;
  incrementLibraryItemPlayCount: (libraryItemId: string) => Promise<void>;
  incrementLibraryItemLoopCount: (libraryItemId: string) => Promise<void>;
  listLibraryItemStats: () => Promise<LibraryItemStatsPayload[]>;
  restorePracticeStats: (input: RestorePracticeStatsInput) => Promise<void>;
  resetPracticeDb: () => Promise<void>;
};
