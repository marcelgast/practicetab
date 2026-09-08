import type { LibrarySource } from '../library';

export type PtDataEnvelopeV1 = {
  format: 'ptdata';
  formatVersion: 1;
  createdAt: string;
  kind: 'backup' | 'share';
  data: PtBackupDataV1 | PtShareDataV1;
};

export type PtBackupDataV1 = {
  plans: PtPracticePlanDTO[];
  exercises: PtBackupPracticeExerciseDTO[];
  intervals: PtBackupPracticeIntervalDTO[];
  sessions: PtPracticeSessionDTO[];
  sessionExercises: PtPracticeSessionExerciseDTO[];
  intervalsCompletedTotal: number;
  settings: PtSettingsDTO;
  libraryItems: PtLibraryItemDTO[];
  bpmHistory?: PtExerciseBpmHistoryDTO[];
  libraryItemStats?: PtLibraryItemStatsDTO[];
  /**
   * Live-Feedback runs (schema v23+). Optional: pre-v23 backup
   * files omit the field entirely.
   *
   * Restore semantics when the field is absent: `restoreBackupEnvelope`
   * snapshots the existing `feedback_runs` rows from the target DB
   * BEFORE the pre-import reset wipes them, then rehydrates those
   * rows after the import completes. So restoring a pre-v23 backup
   * keeps whatever feedback history the user had accumulated on the
   * current build — it is NOT a no-op on the table itself. When the
   * field is present (even as an empty array) the backup replaces
   * the target's rows as the user expects.
   */
  feedbackRuns?: PtFeedbackRunDTO[];
  embeddedTabs?: PtEmbeddedTabDTO[];
  embeddedAudio?: PtEmbeddedAudioDTO[];
};

/**
 * Backup payload shape for one feedback run. Mirrors the Rust
 * `FeedbackRunInsert` struct exactly — no `id` (AUTOINCREMENT on
 * restore), but keeps the full `detailsJson` so the per-note
 * timeline survives the round trip.
 */
export type PtFeedbackRunDTO = {
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

export type PtExerciseBpmHistoryDTO = {
  id: string;
  exerciseId: string;
  sessionDate: string;
  bpm: number;
  recordedAt: string;
};

export type PtLibraryItemStatsDTO = {
  libraryItemId: string;
  playCount: number;
  totalTimeSeconds: number;
  loopCount: number;
  lastPlayedAt: string | null;
};

export type PtShareDataV1 = {
  shareKind?: 'plan' | 'exercise';
  plans: PtPracticePlanDTO[];
  exercises: PtSharePracticeExerciseDTO[];
  intervals: PtSharePracticeIntervalDTO[];
  libraryItems: PtLibraryItemDTO[];
  embeddedTabs?: PtEmbeddedTabDTO[];
  embeddedAudio?: PtEmbeddedAudioDTO[];
};

export type PtPracticePlanDTO = {
  id: string;
  title: string;
  timed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PtBackupPracticeExerciseDTO = {
  id: string;
  planId: string;
  title: string;
  sortOrder: number;
  timePlannedMinutes: number | null;
  intervalAuto: boolean;
  linkedLibraryItemId?: string | null;
  linkedTabId?: string | null;
  linkedAudioId?: string | null;
  preferredSource?: 'tab' | 'audio' | 'both' | null;
  totalTimeSpentSeconds: number;
  bpm: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PtSharePracticeExerciseDTO = {
  id: string;
  planId: string;
  title: string;
  sortOrder: number;
  timePlannedMinutes: number | null;
  intervalAuto: boolean;
  linkedLibraryItemId?: string | null;
  linkedTabId?: string | null;
  linkedAudioId?: string | null;
  preferredSource?: 'tab' | 'audio' | 'both' | null;
  bpm: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PtBackupPracticeIntervalDTO = {
  id: string;
  exerciseId: string;
  name: string | null;
  durationSeconds: number;
  bpm: number | null;
  sortIndex: number;
  done: boolean;
  createdAt: number | null;
};

export type PtSharePracticeIntervalDTO = {
  id: string;
  exerciseId: string;
  name: string | null;
  durationSeconds: number;
  bpm: number | null;
  sortIndex: number;
  createdAt: number | null;
};

export type PtPracticeSessionDTO = {
  id: string;
  sessionDate: string;
  startedAt: string;
  endedAt: string | null;
  totalTimeSpentSeconds: number;
  /**
   * Optional so older ptdata archives (pre-schema-v22) still parse —
   * their sessions predate the playback-timer split. Defaults to 0 on
   * import if absent.
   */
  totalPlaybackSeconds?: number;
  /**
   * Session Journal fields (PR 4.3 — schema v24). All four
   * optional; pre-v24 backups omit them and the restore path
   * leaves the DB columns NULL. Present values round-trip
   * verbatim through mapSession / mapSessionsForRestore.
   */
  goalText?: string | null;
  reviewText?: string | null;
  goalPercent?: number | null;
  goalReached?: boolean | null;
  createdAt: string;
};

export type PtPracticeSessionExerciseDTO = {
  id: string;
  sessionId: string;
  exerciseId: string;
  timeSpentSeconds: number;
  /** Optional for backwards compat with pre-v22 ptdata archives. */
  playbackTimeSeconds?: number;
  createdAt: string;
};

export type PtLibrarySourceDTO = LibrarySource;

export type PtFileMetadataDTO = {
  fileName: string;
  size: number;
  modifiedMs: number;
  hash?: string;
  /**
   * Optional — pre-PR-4.2 backups don't carry it. When present it
   * survives the backup round-trip and skips the lazy rescan on
   * first open after import.
   */
  maxFret?: number;
};

export type PtLibraryItemDTO = {
  id: string;
  kind?: 'tab' | 'audio';
  title: string;
  source: PtLibrarySourceDTO;
  metadata: PtFileMetadataDTO;
  createdAt: string;
  updatedAt: string;
  lastKnownOk: boolean;
  missingReason?: 'not_found' | 'no_permission' | 'unknown';
};

export type PtEmbeddedTabDTO = {
  libraryItemId: string;
  fileName: string;
  metadata: PtFileMetadataDTO;
  contentBase64: string;
};

export type PtSongMapDTO = {
  startOffsetMs: number;
  sections: {
    label: string;
    color: string;
    timestampMs: number;
    sortOrder: number;
  }[];
};

export type PtBeatmapDTO = {
  startBpm: number;
  startTimeSigTop: number;
  startTimeSigBottom: number;
  endBar: number;
  timeEvents: {
    barIndex: number;
    bpm: number;
    timeSigTop: number;
    timeSigBottom: number;
  }[];
  loopEvents: {
    startBar: number;
    endBar: number;
    repeatCount: number;
  }[];
  playedBars: {
    playedBarIndex: number;
    notationBarIndex: number;
    repeatPass: number;
    playedBarLabel: string;
    bpm: number;
    timeSigTop: number;
    timeSigBottom: number;
  }[];
};

export type PtWaveformDTO = {
  peaks: number[];
  durationMs: number;
  sampleRate: number;
};

export type PtEmbeddedAudioDTO = {
  libraryItemId: string;
  fileName: string;
  metadata: PtFileMetadataDTO;
  contentBase64: string;
  beatmap?: PtBeatmapDTO;
  songMap?: PtSongMapDTO;
  waveform?: PtWaveformDTO;
};

export type PtSettingsDTO = {
  accentColor: string;
  darkMode: boolean;
  lastOpenedRoute: string;
  showStaff: boolean;
  /**
   * Horizontal (one-liner) tab layout preference. Default `true`
   * for fresh installs — the teleprompter-style rendering is the
   * recommended starting point. Surviving across backup round-trips
   * so users don't lose their layout choice when restoring.
   */
  horizontalLayout: boolean;
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  metronomeVolume: number;
  countInBars: number[];
  checkUpdatesOnStartup: boolean;
  updatesDefaultsApplied: boolean;
  updatesStartupPreferenceSet: boolean;
  intervalChangeCountInBars: number;
  weeklyStreakGoalDays: number;
  audioOutputDeviceId: string | null;
  tuning: number;
  /**
   * Session Journaling (PR 4.3). When on, the goal dialog opens
   * every time a new session starts and the review overlay is
   * reachable from the session timer. Pre-PR-4.3 backups omit the
   * key — the restore path hydrates it to the upgrade default
   * (`true`) rather than silently opting users out.
   */
  journalingEnabled?: boolean;
  /**
   * Guided onboarding state (1.3.0+):
   * - `showAtStartup` — controls whether the Welcome dialog
   *   appears on app launch. User-facing toggle in Settings →
   *   Help.
   * - `completed` — per-guide completion timestamps (`{ guideId:
   *   ISO-string }`). Drives the "✓" markers in the Help panel
   *   and the all-completed gate that suppresses the Welcome.
   *
   * Optional so pre-1.3.0 backup files restore cleanly: missing
   * key → appStore hydrates fresh defaults (`showAtStartup: true,
   * completed: {}`), exactly the new-user experience. Present
   * value round-trips verbatim, preserving user progress on
   * restore.
   */
  guideState?: PtGuideStateDTO;
};

export type PtGuideStateDTO = {
  showAtStartup?: boolean;
  completed?: Record<string, string>;
};

export type PtMissingTabReference = {
  exerciseId: string;
  libraryItemId: string;
  title?: string;
  source?: PtLibrarySourceDTO;
  metadata?: PtFileMetadataDTO;
};

export type ImportReport = {
  createdIds: {
    plans: Record<string, string>;
    exercises: Record<string, string>;
    intervals: Record<string, string>;
    sessions: Record<string, string>;
    sessionExercises: Record<string, string>;
    libraryItems: Record<string, string>;
  };
  missingTabs: PtMissingTabReference[];
  embeddedTabCount: number;
  embeddedAudioCount: number;
};
