import type {
  PracticeExercise,
  PracticeInterval,
  PracticePlan,
  PracticeSession,
  PracticeSessionExercise,
} from '../domain/practice';
import { getStoredJson, setStoredJson } from '../domain/storage';
import type {
  ExerciseBpmHistoryPayload,
  IntervalModeSessionPayload,
  LibraryItemStatsPayload,
  PracticePlanPayload,
} from './practicePersistenceTypes';

export const STORAGE_KEY = 'practicetab.practice.v2';

export type PracticeState = {
  plans: PracticePlan[];
  exercises: PracticeExercise[];
  intervals: PracticeInterval[];
  sessions: PracticeSession[];
  sessionExercises: PracticeSessionExercise[];
  intervalsCompletedTotal: number;
  intervalModeSessions: IntervalModeSessionPayload[];
  bpmHistory: ExerciseBpmHistoryPayload[];
  libraryItemStats: LibraryItemStatsPayload[];
};

function normalizeExercise(
  input: PracticeExercise & { linkedLibraryItemId?: string | null },
): PracticeExercise {
  const linkedTabId = input.linkedTabId ?? input.linkedLibraryItemId ?? null;
  return {
    ...input,
    linkedTabId,
    linkedAudioId: input.linkedAudioId ?? null,
    timePlannedMinutes: input.timePlannedMinutes ?? null,
    bpm: input.bpm ?? null,
    intervalAuto: input.intervalAuto ?? true,
    intervalRepeat: input.intervalRepeat ?? false,
    notes: input.notes ?? null,
    intervals: Array.isArray(input.intervals) ? input.intervals : [],
  };
}

function normalizeState(state: Partial<PracticeState> | null): PracticeState {
  return {
    plans: Array.isArray(state?.plans) ? state!.plans : [],
    exercises: Array.isArray(state?.exercises)
      ? state!.exercises.map((exercise) => normalizeExercise(exercise))
      : [],
    intervals: Array.isArray(state?.intervals) ? state!.intervals : [],
    sessions: Array.isArray(state?.sessions) ? state!.sessions : [],
    sessionExercises: Array.isArray(state?.sessionExercises)
      ? state!.sessionExercises
      : [],
    intervalsCompletedTotal:
      typeof state?.intervalsCompletedTotal === 'number'
        ? state!.intervalsCompletedTotal
        : 0,
    intervalModeSessions: Array.isArray(state?.intervalModeSessions)
      ? state!.intervalModeSessions
      : [],
    bpmHistory: Array.isArray(state?.bpmHistory) ? state!.bpmHistory : [],
    libraryItemStats: Array.isArray(state?.libraryItemStats)
      ? state!.libraryItemStats
      : [],
  };
}

export function loadState(): PracticeState {
  return normalizeState(
    getStoredJson<PracticeState>(STORAGE_KEY, {
      plans: [],
      exercises: [],
      intervals: [],
      sessions: [],
      sessionExercises: [],
      intervalsCompletedTotal: 0,
      intervalModeSessions: [],
      bpmHistory: [],
      libraryItemStats: [],
    }),
  );
}

export function saveState(state: PracticeState): void {
  setStoredJson(STORAGE_KEY, state);
}

export function listPlansPayload(state: PracticeState): PracticePlanPayload[] {
  const exercisesByPlan = new Map<string, PracticeExercise[]>();
  for (const exercise of state.exercises) {
    const bucket = exercisesByPlan.get(exercise.planId) ?? [];
    bucket.push({
      ...exercise,
      timePlannedMinutes: exercise.timePlannedMinutes ?? null,
      bpm: exercise.bpm ?? null,
      intervalAuto: exercise.intervalAuto ?? true,
      intervalRepeat: exercise.intervalRepeat ?? false,
      intervals: [],
    });
    exercisesByPlan.set(exercise.planId, bucket);
  }

  return [...state.plans]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((plan) => ({
      ...plan,
      timed: plan.timed ?? false,
      exercises: (exercisesByPlan.get(plan.id) ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    }));
}
