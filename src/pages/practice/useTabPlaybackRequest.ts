import { ref, watch, type Ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { usePlayerStore } from '../../stores/player';
import { useMetronomeStore } from '../../stores/metronome';
import { useAppStore } from '../../stores/app';
import type { PracticeInterval } from '../../domain/practice';

export interface PlaybackCallbacks {
  stopIntervalRunner: (exerciseId?: string) => void;
}

export interface TabPlaybackRequestOptions {
  pendingExerciseId: Ref<string | null>;
  intervalsForExercise: (exerciseId: string) => PracticeInterval[];
  callbacks: PlaybackCallbacks;
  unlinkExerciseAndUnloadPlayer: (exerciseId: string) => Promise<void>;
}

export function useTabPlaybackRequest(options: TabPlaybackRequestOptions) {
  const practiceStore = usePracticeStore();
  const playerStore = usePlayerStore();
  const metronomeStore = useMetronomeStore();
  const appStore = useAppStore();

  const pendingPlaybackLibraryId = ref<string | null>(null);
  const pendingPlaybackCanceled = ref(false);
  const pendingMetronomeBpm = ref<number | null>(null);
  const tempoUnsupportedDialogOpen = ref(false);
  const pendingIntervalRestart = ref<{
    exerciseId: string;
    intervalId: string;
  } | null>(null);
  const suppressPlaybackStopOnce = ref(false);

  let stopPendingPlaybackWatch: (() => void) | null = null;

  // --- Tempo change helpers ---

  function handleUnsupportedTempoChangeInExercise(exerciseId: string): boolean {
    if (!playerStore.hasLoadedTabTempoChanges()) {
      return false;
    }
    options.callbacks.stopIntervalRunner(exerciseId);
    void practiceStore.stopExercise();
    tempoUnsupportedDialogOpen.value = true;
    void options.unlinkExerciseAndUnloadPlayer(exerciseId);
    return true;
  }

  function shouldSkipTempoOverrideForExercise(
    exerciseId: string,
    requestedBpm: number,
  ): boolean {
    if (!playerStore.hasLoadedTabTempoChanges()) {
      return false;
    }
    const exercise = practiceStore.exercises.find(
      (entry) => entry.id === exerciseId,
    );
    if (!exercise || exercise.bpm === null) {
      return false;
    }
    if (options.intervalsForExercise(exerciseId).length > 0) {
      return false;
    }
    const baseBpm = playerStore.model.baseBpm;
    if (!Number.isFinite(baseBpm ?? NaN)) {
      return false;
    }
    const roundedBase = Math.round(baseBpm as number);
    return (
      Math.round(exercise.bpm) === roundedBase &&
      Math.round(requestedBpm) === roundedBase
    );
  }

  // --- Tab playback request with watcher ---

  function requestTabPlayback(libraryItemId: string): void {
    pendingPlaybackCanceled.value = false;
    pendingPlaybackLibraryId.value = libraryItemId;
    if (stopPendingPlaybackWatch) {
      stopPendingPlaybackWatch();
      stopPendingPlaybackWatch = null;
    }
    stopPendingPlaybackWatch = watch(
      () => [
        playerStore.model.status,
        playerStore.model.currentLibraryItemId,
        playerStore.model.baseBpm,
      ],
      ([status, currentId]) => {
        if (
          status === 'ready' &&
          currentId === libraryItemId &&
          pendingPlaybackLibraryId.value === libraryItemId
        ) {
          stopPendingPlaybackWatch?.();
          stopPendingPlaybackWatch = null;
          pendingPlaybackLibraryId.value = null;
          void (async () => {
            if (pendingPlaybackCanceled.value) {
              return;
            }
            const explicitBpm = pendingMetronomeBpm.value;
            const fallbackBase = playerStore.model.baseBpm;
            const bpm =
              explicitBpm ??
              (Number.isFinite(fallbackBase ?? NaN)
                ? Math.round(fallbackBase as number)
                : null);
            const useIntervalCountIn = pendingIntervalRestart.value !== null;
            let skipTempoOverride = false;
            if (options.pendingExerciseId.value && explicitBpm !== null) {
              skipTempoOverride = shouldSkipTempoOverrideForExercise(
                options.pendingExerciseId.value,
                explicitBpm,
              );
              if (
                !skipTempoOverride &&
                handleUnsupportedTempoChangeInExercise(
                  options.pendingExerciseId.value,
                )
              ) {
                pendingMetronomeBpm.value = null;
                pendingIntervalRestart.value = null;
                return;
              }
            }
            if (explicitBpm !== null && !skipTempoOverride) {
              pendingMetronomeBpm.value = null;
              playerStore.setBpm(explicitBpm);
              metronomeStore.setBpm(explicitBpm);
              if (!appStore.metronomeEnabled) {
                await metronomeStore.setRunning(true);
                playerStore.allowExternalMetronomeOnce();
              }
            } else if (bpm !== null) {
              pendingMetronomeBpm.value = null;
              metronomeStore.setBpm(bpm);
            }
            if (!playerStore.isLoopEnabled) {
              playerStore.toggleLoop();
            }
            if (playerStore.model.playback !== 'playing') {
              if (appStore.metronomeEnabled && useIntervalCountIn) {
                playerStore.playWithCountInBars(
                  appStore.intervalChangeCountInBars,
                  explicitBpm ?? undefined,
                );
              } else {
                playerStore.play();
              }
            }
          })();
        }
      },
      { immediate: true },
    );
  }

  function clearPendingPlayback(): void {
    if (stopPendingPlaybackWatch) {
      stopPendingPlaybackWatch();
      stopPendingPlaybackWatch = null;
    }
    pendingPlaybackLibraryId.value = null;
  }

  return {
    pendingPlaybackLibraryId,
    pendingPlaybackCanceled,
    pendingMetronomeBpm,
    tempoUnsupportedDialogOpen,
    pendingIntervalRestart,
    suppressPlaybackStopOnce,
    clearPendingPlayback,
    handleUnsupportedTempoChangeInExercise,
    shouldSkipTempoOverrideForExercise,
    requestTabPlayback,
  };
}
