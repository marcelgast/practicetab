import type { Ref } from 'vue';
import type { PracticeExercise, PracticeInterval } from '../../domain/practice';
import type { practicePersistence as PracticePersistenceType } from '../../services/practicePersistence';

export interface IntervalOpsDeps {
  exercises: Ref<PracticeExercise[]>;
  intervalsLoaded: Ref<Record<string, boolean>>;
  intervalsLoading: Ref<Record<string, Promise<PracticeInterval[]> | null>>;
  persistence: typeof PracticePersistenceType;
  updateExercise: (
    exerciseId: string,
    updates: { timePlannedMinutes?: number | null },
  ) => Promise<void>;
}

export function createIntervalOps(deps: IntervalOpsDeps) {
  function setExerciseIntervals(
    exerciseId: string,
    intervals: PracticeInterval[],
  ): void {
    const normalized = intervals.map((interval) => ({
      ...interval,
      done: interval.done ?? false,
    }));
    deps.exercises.value = deps.exercises.value.map((exercise) =>
      exercise.id === exerciseId
        ? { ...exercise, intervals: normalized }
        : exercise,
    );
  }

  function intervalsForExercise(exerciseId: string): PracticeInterval[] {
    const exercise = deps.exercises.value.find((ex) => ex.id === exerciseId);
    if (!exercise) {
      return [];
    }
    const intervals = Array.isArray(exercise.intervals)
      ? exercise.intervals
      : [];
    return [...intervals].sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) {
        return a.sortIndex - b.sortIndex;
      }
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  }

  function intervalTotalSeconds(intervals: PracticeInterval[]): number {
    return intervals.reduce(
      (sum, interval) => sum + interval.durationSeconds,
      0,
    );
  }

  async function syncPlannedMinutesIfNeeded(
    exerciseId: string,
    intervals: PracticeInterval[],
  ): Promise<void> {
    const exercise = deps.exercises.value.find((ex) => ex.id === exerciseId);
    if (!exercise) {
      return;
    }
    if (exercise.timePlannedMinutes === null) {
      return;
    }
    const totalSeconds = intervalTotalSeconds(intervals);
    const totalMinutes = Math.ceil(totalSeconds / 60);
    if (totalMinutes <= exercise.timePlannedMinutes) {
      return;
    }
    await deps.updateExercise(exerciseId, { timePlannedMinutes: totalMinutes });
  }

  async function ensureIntervalsLoaded(
    exerciseId: string,
  ): Promise<PracticeInterval[]> {
    if (deps.intervalsLoaded.value[exerciseId]) {
      return intervalsForExercise(exerciseId);
    }
    const pending = deps.intervalsLoading.value[exerciseId];
    if (pending) {
      return pending;
    }
    const loadPromise = (async () => {
      try {
        const intervals =
          (await deps.persistence.listIntervals(exerciseId)) ?? [];
        deps.intervalsLoaded.value = {
          ...deps.intervalsLoaded.value,
          [exerciseId]: true,
        };
        setExerciseIntervals(exerciseId, intervals);
        await syncPlannedMinutesIfNeeded(exerciseId, intervals);
        return intervals;
      } finally {
        deps.intervalsLoading.value = {
          ...deps.intervalsLoading.value,
          [exerciseId]: null,
        };
      }
    })();
    deps.intervalsLoading.value = {
      ...deps.intervalsLoading.value,
      [exerciseId]: loadPromise,
    };
    return loadPromise;
  }

  async function createInterval(
    exerciseId: string,
    input: {
      name?: string | null;
      durationSeconds: number;
      sortIndex: number;
      bpm?: number | null;
    },
  ): Promise<void> {
    const interval = await deps.persistence.createInterval(exerciseId, input);
    deps.intervalsLoaded.value = {
      ...deps.intervalsLoaded.value,
      [exerciseId]: true,
    };
    const nextIntervals = [...intervalsForExercise(exerciseId), interval];
    setExerciseIntervals(exerciseId, nextIntervals);
    await syncPlannedMinutesIfNeeded(exerciseId, nextIntervals);
  }

  async function updateInterval(
    exerciseId: string,
    intervalId: string,
    updates: {
      name?: string | null;
      durationSeconds?: number;
      bpm?: number | null;
      done?: boolean;
    },
  ): Promise<void> {
    const interval = await deps.persistence.updateInterval(intervalId, updates);
    const nextIntervals = intervalsForExercise(exerciseId).map((entry) =>
      entry.id === intervalId ? interval : entry,
    );
    setExerciseIntervals(exerciseId, nextIntervals);
    await syncPlannedMinutesIfNeeded(exerciseId, nextIntervals);
  }

  async function completeInterval(
    exerciseId: string,
    intervalId: string,
  ): Promise<void> {
    await updateInterval(exerciseId, intervalId, { done: true });
    await deps.persistence.incrementIntervalsCompletedTotal(1);
  }

  async function deleteInterval(
    exerciseId: string,
    intervalId: string,
  ): Promise<void> {
    await deps.persistence.deleteInterval(intervalId);
    const nextIntervals = intervalsForExercise(exerciseId).filter(
      (entry) => entry.id !== intervalId,
    );
    setExerciseIntervals(exerciseId, nextIntervals);
    await syncPlannedMinutesIfNeeded(exerciseId, nextIntervals);
  }

  async function reorderIntervals(
    exerciseId: string,
    orderedIds: string[],
  ): Promise<void> {
    await deps.persistence.reorderIntervals(exerciseId, orderedIds);
    const next = intervalsForExercise(exerciseId).map((interval) => {
      const nextIndex = orderedIds.indexOf(interval.id);
      return nextIndex === -1
        ? interval
        : { ...interval, sortIndex: nextIndex };
    });
    setExerciseIntervals(exerciseId, next);
  }

  async function clearIntervalDoneFlags(exerciseId: string): Promise<void> {
    await deps.persistence.clearIntervalDoneFlags(exerciseId);
    const nextIntervals = intervalsForExercise(exerciseId).map((interval) => ({
      ...interval,
      done: false,
    }));
    setExerciseIntervals(exerciseId, nextIntervals);
  }

  return {
    setExerciseIntervals,
    intervalsForExercise,
    ensureIntervalsLoaded,
    createInterval,
    updateInterval,
    completeInterval,
    deleteInterval,
    reorderIntervals,
    clearIntervalDoneFlags,
  };
}
