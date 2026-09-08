import { watch, type Ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { usePlayerStore } from '../../stores/player';
import { metronomeBeep } from '../../services/metronomeCommands';
import type { PracticeExercise, PracticeInterval } from '../../domain/practice';
import type { LibraryItem } from '../../domain/library';
import type { IntervalRunnerStateValue } from './useIntervalRunner';

export interface PlaybackWatcherCallbacks {
  startIntervalRunnerForExercise: (
    exercise: PracticeExercise,
    startIntervalId?: string,
  ) => Promise<void>;
  stopExerciseTimersFromPlayback: () => Promise<void>;
  stopIntervalRunner: (exerciseId?: string) => void;
}

export interface PlaybackWatchersOptions {
  pendingExerciseId: Ref<string | null>;
  intervalRunnerState: Ref<IntervalRunnerStateValue>;
  pendingIntervalRestart: Ref<{
    exerciseId: string;
    intervalId: string;
  } | null>;
  suppressPlaybackStopOnce: Ref<boolean>;
  completedExerciseTimers: Ref<Record<string, boolean>>;
  exerciseTimerTick: Ref<number>;
  intervalsForExercise: (exerciseId: string) => PracticeInterval[];
  getExpandedExercise: () => PracticeExercise | null;
  linking: {
    linkedLibraryItem: (item: PracticeExercise) => LibraryItem | null;
    exerciseLinkedItemId: (exerciseId: string) => string | null;
  };
  callbacks: PlaybackWatcherCallbacks;
}

/**
 * Watchers that react to player/practice state changes.
 *
 * - Validates pending exercise ID against loaded player item
 * - Auto-starts interval runner when playback begins
 * - Stops interval runner when active exercise changes
 * - Beeps when planned exercise time runs out
 */
export function usePlaybackWatchers(options: PlaybackWatchersOptions): void {
  const practiceStore = usePracticeStore();
  const playerStore = usePlayerStore();

  // Validate pendingExerciseId against loaded player item
  watch(
    () => playerStore.model.currentLibraryItemId,
    (currentId) => {
      if (!options.pendingExerciseId.value) {
        return;
      }
      const expectedId = options.linking.exerciseLinkedItemId(
        options.pendingExerciseId.value,
      );
      if (!expectedId || expectedId !== currentId) {
        options.pendingExerciseId.value = null;
      }
    },
  );

  // React to playback state transitions
  watch(
    () => playerStore.model.playback,
    (playback, previous) => {
      if (previous === 'playing' && playback !== 'playing') {
        if (options.suppressPlaybackStopOnce.value) {
          options.suppressPlaybackStopOnce.value = false;
        } else {
          void options.callbacks.stopExerciseTimersFromPlayback();
        }
      }
      if (playback === 'playing' && options.pendingIntervalRestart.value) {
        const { exerciseId, intervalId } = options.pendingIntervalRestart.value;
        const exercise = practiceStore.exercises.find(
          (entry) => entry.id === exerciseId,
        );
        if (exercise) {
          void options.callbacks.startIntervalRunnerForExercise(
            exercise,
            intervalId,
          );
        }
        options.pendingIntervalRestart.value = null;
        return;
      }
      if (playback === 'playing' && !options.pendingExerciseId.value) {
        const exercise = options.getExpandedExercise();
        if (!exercise) {
          return;
        }
        if (
          practiceStore.activeExerciseId &&
          practiceStore.activeExerciseId !== exercise.id
        ) {
          return;
        }
        const linked = options.linking.linkedLibraryItem(exercise);
        if (!linked) {
          return;
        }
        if (linked.id !== playerStore.model.currentLibraryItemId) {
          return;
        }
        if (options.intervalRunnerState.value.running) {
          return;
        }
        void (async () => {
          await practiceStore.ensureIntervalsLoaded(exercise.id);
          if (options.intervalsForExercise(exercise.id).length > 0) {
            await options.callbacks.startIntervalRunnerForExercise(exercise);
          }
        })();
        return;
      }
      if (playback !== 'playing' || !options.pendingExerciseId.value) {
        return;
      }
      const expectedId = options.linking.exerciseLinkedItemId(
        options.pendingExerciseId.value,
      );
      if (expectedId && expectedId === playerStore.model.currentLibraryItemId) {
        const exercise = practiceStore.exercises.find(
          (entry) => entry.id === options.pendingExerciseId.value,
        );
        if (!exercise) {
          options.pendingExerciseId.value = null;
          return;
        }
        void (async () => {
          await practiceStore.ensureIntervalsLoaded(exercise.id);
          if (options.intervalsForExercise(exercise.id).length > 0) {
            await options.callbacks.startIntervalRunnerForExercise(exercise);
          }
          options.pendingExerciseId.value = null;
        })();
      }
    },
  );

  // Stop runner for previous exercise when active exercise changes
  watch(
    () => practiceStore.activeExerciseId,
    (nextId, prevId) => {
      if (prevId && prevId !== nextId) {
        options.callbacks.stopIntervalRunner(prevId);
      }
    },
  );

  // Beep when planned exercise time runs out (non-interval exercises)
  watch(
    () => [options.exerciseTimerTick.value, practiceStore.activeExerciseId],
    () => {
      const exerciseId = practiceStore.activeExerciseId;
      if (!exerciseId) {
        return;
      }
      const exercise = practiceStore.exercises.find(
        (ex) => ex.id === exerciseId,
      );
      if (!exercise || exercise.timePlannedMinutes === null) {
        return;
      }
      if (options.intervalsForExercise(exerciseId).length > 0) {
        return;
      }
      const plannedSeconds = exercise.timePlannedMinutes * 60;
      const elapsedSeconds = practiceStore.exerciseSessionSeconds(exerciseId);
      const remainingSeconds = plannedSeconds - elapsedSeconds;
      if (remainingSeconds > 0) {
        if (options.completedExerciseTimers.value[exerciseId]) {
          options.completedExerciseTimers.value = {
            ...options.completedExerciseTimers.value,
            [exerciseId]: false,
          };
        }
        return;
      }
      if (!options.completedExerciseTimers.value[exerciseId]) {
        options.completedExerciseTimers.value = {
          ...options.completedExerciseTimers.value,
          [exerciseId]: true,
        };
        void metronomeBeep();
      }
    },
    { immediate: true },
  );
}
