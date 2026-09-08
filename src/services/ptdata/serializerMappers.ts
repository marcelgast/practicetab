import {
  type PracticeExercise,
  type PracticeInterval,
  type PracticePlan,
  type PracticeSession,
  type PracticeSessionExercise,
} from '../../domain/practice';
import { nowIso } from '../../utils/date';
import type { LibraryItem } from '../../domain/library';
import { getStoredJson } from '../../domain/storage';
import {
  type PtBackupDataV1,
  type PtBackupPracticeExerciseDTO,
  type PtBackupPracticeIntervalDTO,
  type PtDataEnvelopeV1,
  type PtExerciseBpmHistoryDTO,
  type PtFeedbackRunDTO,
  type PtLibraryItemDTO,
  type PtLibraryItemStatsDTO,
  type PtPracticePlanDTO,
  type PtPracticeSessionDTO,
  type PtPracticeSessionExerciseDTO,
  type PtSettingsDTO,
  type PtShareDataV1,
  type PtSharePracticeExerciseDTO,
  type PtSharePracticeIntervalDTO,
} from '../../domain/ptdata';
import type {
  ExerciseBpmHistoryPayload,
  LibraryItemStatsPayload,
} from '../practicePersistenceTypes';
import type { FeedbackRunDetails } from '../feedbackRunCommands';
import { practicePersistence } from '../practicePersistence';

export const SETTINGS_STORAGE_KEY = 'practicetab.settings';

export function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export function loadSettings(): PtSettingsDTO {
  const stored = getStoredJson<Partial<PtSettingsDTO>>(
    SETTINGS_STORAGE_KEY,
    {},
  );
  const accentColor = stored.accentColor ?? '#5dd6a2';
  const metronomeVolume =
    stored.metronomeVolume === undefined || stored.metronomeVolume === null
      ? 80
      : stored.metronomeVolume === 100
        ? 80
        : stored.metronomeVolume;
  const updatesDefaultsApplied = stored.updatesDefaultsApplied ?? false;
  const updatesStartupPreferenceSet =
    stored.updatesStartupPreferenceSet ?? false;
  const checkUpdatesOnStartup = updatesStartupPreferenceSet
    ? (stored.checkUpdatesOnStartup ?? true)
    : true;

  return {
    accentColor,
    darkMode: stored.darkMode ?? true,
    lastOpenedRoute: stored.lastOpenedRoute ?? '/library',
    showStaff: stored.showStaff ?? true,
    horizontalLayout: stored.horizontalLayout ?? true,
    metronomeEnabled: stored.metronomeEnabled ?? false,
    countInEnabled: stored.countInEnabled ?? false,
    metronomeVolume,
    countInBars: stored.countInBars?.length ? stored.countInBars : [2],
    checkUpdatesOnStartup,
    updatesDefaultsApplied,
    updatesStartupPreferenceSet,
    intervalChangeCountInBars: stored.intervalChangeCountInBars ?? 2,
    weeklyStreakGoalDays: stored.weeklyStreakGoalDays ?? 5,
    audioOutputDeviceId: stored.audioOutputDeviceId ?? null,
    tuning: stored.tuning ?? 0,
    // Session Journal (PR 4.3). Default `true` so pre-PR stored
    // settings (missing the key) export with the feature on,
    // matching the appStore's own upgrade default.
    journalingEnabled: stored.journalingEnabled ?? true,
    // Guided onboarding state (1.3.0+). Mirror the appStore
    // hydration defaults when the stored object is incomplete so
    // every backup file is well-formed, even when produced from a
    // pre-1.3.0 settings blob in localStorage.
    guideState: {
      showAtStartup: stored.guideState?.showAtStartup ?? true,
      completed: { ...(stored.guideState?.completed ?? {}) },
    },
  };
}

export function buildEnvelope(
  kind: 'backup' | 'share',
  data: PtBackupDataV1 | PtShareDataV1,
): PtDataEnvelopeV1 {
  return {
    format: 'ptdata',
    formatVersion: 1,
    createdAt: nowIso(),
    kind,
    data,
  };
}

export function mapPlan(plan: PracticePlan): PtPracticePlanDTO {
  return {
    id: plan.id,
    title: plan.title,
    timed: plan.timed ?? false,
    sortOrder: plan.sortOrder,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

export function mapExerciseBackup(
  exercise: PracticeExercise,
): PtBackupPracticeExerciseDTO {
  return {
    id: exercise.id,
    planId: exercise.planId,
    title: exercise.title,
    sortOrder: exercise.sortOrder,
    timePlannedMinutes: exercise.timePlannedMinutes ?? null,
    intervalAuto: exercise.intervalAuto ?? true,
    linkedTabId: exercise.linkedTabId ?? null,
    linkedAudioId: exercise.linkedAudioId ?? null,
    preferredSource: exercise.preferredSource ?? null,
    totalTimeSpentSeconds: exercise.totalTimeSpentSeconds,
    bpm: exercise.bpm ?? null,
    notes: exercise.notes ?? null,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
  };
}

export function mapExerciseShare(
  exercise: PracticeExercise,
): PtSharePracticeExerciseDTO {
  return {
    id: exercise.id,
    planId: exercise.planId,
    title: exercise.title,
    sortOrder: exercise.sortOrder,
    timePlannedMinutes: exercise.timePlannedMinutes ?? null,
    intervalAuto: exercise.intervalAuto ?? true,
    linkedTabId: exercise.linkedTabId ?? null,
    linkedAudioId: exercise.linkedAudioId ?? null,
    preferredSource: exercise.preferredSource ?? null,
    bpm: exercise.bpm ?? null,
    notes: exercise.notes ?? null,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt,
  };
}

export function mapIntervalBackup(
  interval: PracticeInterval,
): PtBackupPracticeIntervalDTO {
  return {
    id: interval.id,
    exerciseId: interval.exerciseId,
    name: interval.name ?? null,
    durationSeconds: interval.durationSeconds,
    bpm: interval.bpm ?? null,
    sortIndex: interval.sortIndex,
    done: interval.done,
    createdAt: interval.createdAt ?? null,
  };
}

export function mapIntervalShare(
  interval: PracticeInterval,
): PtSharePracticeIntervalDTO {
  return {
    id: interval.id,
    exerciseId: interval.exerciseId,
    name: interval.name ?? null,
    durationSeconds: interval.durationSeconds,
    bpm: interval.bpm ?? null,
    sortIndex: interval.sortIndex,
    createdAt: interval.createdAt ?? null,
  };
}

export function mapSession(session: PracticeSession): PtPracticeSessionDTO {
  return {
    id: session.id,
    sessionDate: session.sessionDate,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
    totalTimeSpentSeconds: session.totalTimeSpentSeconds,
    // Carry the new v22 playback counter through the backup DTO so
    // export → import round-trips don't silently zero out a user's
    // Time Played stats.
    totalPlaybackSeconds: session.totalPlaybackSeconds,
    // Session Journal fields (PR 4.3). Only emit a key when the
    // source has a value — null/undefined are both omitted so
    // pre-v24 sessions stay off the export surface.
    ...(session.goalText !== null && session.goalText !== undefined
      ? { goalText: session.goalText }
      : {}),
    ...(session.reviewText !== null && session.reviewText !== undefined
      ? { reviewText: session.reviewText }
      : {}),
    ...(typeof session.goalPercent === 'number'
      ? { goalPercent: session.goalPercent }
      : {}),
    ...(typeof session.goalReached === 'boolean'
      ? { goalReached: session.goalReached }
      : {}),
    createdAt: session.createdAt,
  };
}

export function mapSessionExercise(
  entry: PracticeSessionExercise,
): PtPracticeSessionExerciseDTO {
  return {
    id: entry.id,
    sessionId: entry.sessionId,
    exerciseId: entry.exerciseId,
    timeSpentSeconds: entry.timeSpentSeconds,
    playbackTimeSeconds: entry.playbackTimeSeconds,
    createdAt: entry.createdAt,
  };
}

export function mapLibraryItem(item: LibraryItem): PtLibraryItemDTO {
  const kind = item.kind === 'audio' ? 'audio' : undefined;
  return {
    id: item.id,
    ...(kind ? { kind } : {}),
    title: item.title,
    source: item.source,
    metadata: {
      fileName: item.metadata.fileName,
      size: item.metadata.size,
      modifiedMs: item.metadata.modifiedMs,
      hash: item.metadata.hash,
      ...(typeof item.metadata.maxFret === 'number'
        ? { maxFret: item.metadata.maxFret }
        : {}),
    },
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastKnownOk: item.lastKnownOk,
    missingReason: item.missingReason,
  };
}

export function mapBpmHistoryEntry(
  entry: ExerciseBpmHistoryPayload,
): PtExerciseBpmHistoryDTO {
  return {
    id: entry.id,
    exerciseId: entry.exerciseId,
    sessionDate: entry.sessionDate,
    bpm: entry.bpm,
    recordedAt: entry.recordedAt,
  };
}

export function mapLibraryItemStats(
  stats: LibraryItemStatsPayload,
): PtLibraryItemStatsDTO {
  return {
    libraryItemId: stats.libraryItemId,
    playCount: stats.playCount,
    totalTimeSeconds: stats.totalTimeSeconds,
    loopCount: stats.loopCount,
    lastPlayedAt: stats.lastPlayedAt,
  };
}

/**
 * Convert a `FeedbackRunDetails` row (auto-increment id, full blob)
 * into the insert shape the backup file stores. `id` is intentionally
 * dropped — on restore, AUTOINCREMENT assigns fresh ids so the row
 * ordering is preserved via `endedAt` rather than a brittle id.
 */
export function mapFeedbackRun(run: FeedbackRunDetails): PtFeedbackRunDTO {
  return {
    sessionId: run.sessionId,
    exerciseId: run.exerciseId,
    libraryItemId: run.libraryItemId,
    endedAt: run.endedAt,
    durationSeconds: run.durationSeconds,
    strictnessPreset: run.strictnessPreset,
    totalNotes: run.totalNotes,
    hitCount: run.hitCount,
    missedCount: run.missedCount,
    extraCount: run.extraCount,
    pitchPerfect: run.pitchPerfect,
    pitchGood: run.pitchGood,
    pitchAcceptable: run.pitchAcceptable,
    pitchWrong: run.pitchWrong,
    timingPerfect: run.timingPerfect,
    timingGood: run.timingGood,
    timingAcceptable: run.timingAcceptable,
    timingWrong: run.timingWrong,
    longestStreak: run.longestStreak,
    overallScore: run.overallScore,
    suggestSlowDown: run.suggestSlowDown,
    suggestStringMuting: run.suggestStringMuting,
    detailsJson: run.detailsJson,
  };
}

export async function collectPracticeData(): Promise<{
  plans: PracticePlan[];
  exercises: PracticeExercise[];
  intervals: PracticeInterval[];
}> {
  const plansPayload = await practicePersistence.listPracticePlans();
  const exercises = plansPayload.flatMap((plan) => plan.exercises);
  const intervals: PracticeInterval[] = [];
  for (const exercise of exercises) {
    const list = await practicePersistence.listIntervals(exercise.id);
    intervals.push(...list);
  }
  return { plans: plansPayload, exercises, intervals };
}

export function pickSharePlanIds<
  Plan extends { id: string },
  Exercise extends { id: string; planId: string },
>(
  plans: Plan[],
  exercises: Exercise[],
  input: { planId?: string; exerciseId?: string },
): string[] {
  if (input.planId) {
    return plans.some((plan) => plan.id === input.planId) ? [input.planId] : [];
  }
  if (input.exerciseId) {
    const exercise = exercises.find((item) => item.id === input.exerciseId);
    return exercise ? [exercise.planId] : [];
  }
  return plans.map((plan) => plan.id);
}

export function filterPracticeForShare<
  Plan extends { id: string },
  Exercise extends { id: string; planId: string },
  Interval extends { exerciseId: string },
>(
  plans: Plan[],
  exercises: Exercise[],
  intervals: Interval[],
  input: { planId?: string; exerciseId?: string },
): {
  plans: Plan[];
  exercises: Exercise[];
  intervals: Interval[];
} {
  const planIds = new Set(pickSharePlanIds(plans, exercises, input));
  const filteredPlans = plans.filter((plan) => planIds.has(plan.id));
  const exerciseIds = new Set(
    exercises
      .filter((exercise) => planIds.has(exercise.planId))
      .filter(
        (exercise) => !input.exerciseId || exercise.id === input.exerciseId,
      )
      .map((exercise) => exercise.id),
  );
  const filteredExercises = exercises.filter((exercise) =>
    exerciseIds.has(exercise.id),
  );
  const filteredIntervals = intervals.filter((interval) =>
    exerciseIds.has(interval.exerciseId),
  );
  return {
    plans: filteredPlans,
    exercises: filteredExercises,
    intervals: filteredIntervals,
  };
}
