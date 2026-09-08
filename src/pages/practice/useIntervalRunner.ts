import { ref, type Ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { usePlayerStore } from '../../stores/player';
import { useMetronomeStore } from '../../stores/metronome';
import { useAppStore } from '../../stores/app';
import { useSongStore } from '../../stores/song';
import { useBeatmapStore } from '../../stores/beatmap';
import { createIntervalRunner } from '../../services/intervalRunner';
import { metronomeBeep } from '../../services/metronomeCommands';
import { setTabVolume } from '../../services/audioCommands';
import { songPause as pauseSongAudio } from '../../services/songPlaybackService';
import {
  advanceToInterval,
  resolveIntervalBpm,
  type ExercisePlaybackMode,
  type AdvanceBeatmapInfo,
} from '../../services/exerciseIntervalAdvance';
import { nextPendingInterval } from '../../domain/intervals';
import { formatDurationMmss } from '../../domain/time';
import type { PracticeExercise, PracticeInterval } from '../../domain/practice';

export interface IntervalRunnerStateValue {
  exerciseId: string | null;
  intervalIndex: number;
  intervalId: string | null;
  remainingSeconds: number;
  totalSeconds: number;
  running: boolean;
}

import { BEEP_PLAY_DURATION_MS } from '../../services/intervalModeManager';

export interface IntervalRunnerCallbacks {
  requestTabPlayback: (libraryItemId: string) => void;
  stopMetronomeAndPlayback: (opts?: {
    suppressPlaybackStop?: boolean;
  }) => Promise<void>;
}

export interface IntervalRunnerOptions {
  intervalRunnerState: Ref<IntervalRunnerStateValue>;
  pendingExerciseId: Ref<string | null>;
  pendingIntervalRestart: Ref<{
    exerciseId: string;
    intervalId: string;
  } | null>;
  pendingMetronomeBpm: Ref<number | null>;
  suppressPlaybackStopOnce: Ref<boolean>;
  completedExerciseTimers: Ref<Record<string, boolean>>;
  linking: {
    exercisePlaybackMode: (item: PracticeExercise) => ExercisePlaybackMode;
    exerciseLinkedItems: (item: PracticeExercise) => {
      tab: import('../../domain/library').LibraryItem | null;
      audio: import('../../domain/library').LibraryItem | null;
    };
    ensureTabMetronomeEnabled: () => void;
  };
  intervalsForExercise: (exerciseId: string) => PracticeInterval[];
  isIntervalAutoEnabled: (exercise: PracticeExercise) => boolean;
  isIntervalRepeatEnabled: (exercise: PracticeExercise) => boolean;
  callbacks: IntervalRunnerCallbacks;
}

export function useIntervalRunner(options: IntervalRunnerOptions) {
  const practiceStore = usePracticeStore();
  const playerStore = usePlayerStore();
  const metronomeStore = useMetronomeStore();
  const appStore = useAppStore();
  const songStore = useSongStore();
  const beatmapStore = useBeatmapStore();

  const intervalRunnerState = options.intervalRunnerState;
  const noBpmDialogOpen = ref(false);

  let activeIntervalRunner: ReturnType<typeof createIntervalRunner> | null =
    null;
  let intervalRunnerToken = 0;

  // --- Interval runner state management ---

  function resetIntervalRunnerState(exerciseId: string): void {
    const intervals = options.intervalsForExercise(exerciseId);
    const next = nextPendingInterval(intervals);
    intervalRunnerState.value = {
      exerciseId,
      intervalIndex: 0,
      intervalId: next?.id ?? null,
      remainingSeconds: next?.durationSeconds ?? 0,
      totalSeconds: next?.durationSeconds ?? 0,
      running: false,
    };
  }

  function setPendingIntervalIndicator(
    exerciseId: string,
    interval: PracticeInterval,
    intervalIndex: number,
  ): void {
    intervalRunnerState.value = {
      exerciseId,
      intervalIndex,
      intervalId: interval.id,
      remainingSeconds: interval.durationSeconds,
      totalSeconds: interval.durationSeconds,
      running: false,
    };
  }

  function stopIntervalRunner(exerciseId?: string): void {
    intervalRunnerToken += 1;
    activeIntervalRunner?.stop();
    activeIntervalRunner = null;
    if (exerciseId) {
      resetIntervalRunnerState(exerciseId);
      return;
    }
    intervalRunnerState.value = {
      exerciseId: null,
      intervalIndex: 0,
      intervalId: null,
      remainingSeconds: 0,
      totalSeconds: 0,
      running: false,
    };
  }

  async function handleAllIntervalsDone(exerciseId: string): Promise<void> {
    stopIntervalRunner(exerciseId);
    await options.callbacks.stopMetronomeAndPlayback();
    await practiceStore.clearIntervalDoneFlags(exerciseId);
    resetIntervalRunnerState(exerciseId);
  }

  // --- Utility ---

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  }

  function buildBeatmapInfo(audioItemId: string): AdvanceBeatmapInfo | null {
    const entry = beatmapStore.getEntry(audioItemId);
    const te = entry?.beatmap?.timeEvents?.[0];
    if (!te) return null;
    return {
      songBpm: te.bpm ?? null,
      timeSigTop: te.timeSigTop ?? 4,
      timeSigBottom: te.timeSigBottom ?? 4,
    };
  }

  function buildAdvanceContext(
    exercise: PracticeExercise,
    interval: PracticeInterval,
    mode: ExercisePlaybackMode,
    isFirstInterval: boolean,
  ): Parameters<typeof advanceToInterval>[0] {
    const linked = options.linking.exerciseLinkedItems(exercise);
    const audioId = linked.audio?.id ?? null;
    const tabBaseBpm =
      playerStore.model.status === 'ready' &&
      Number.isFinite(playerStore.model.baseBpm ?? NaN)
        ? Math.round(playerStore.model.baseBpm as number)
        : null;
    return {
      exercise,
      interval,
      mode,
      tabLibraryItemId: linked.tab?.id ?? null,
      audioLibraryItemId: audioId,
      beatmapInfo: audioId ? buildBeatmapInfo(audioId) : null,
      tabBaseBpm,
      isFirstInterval,
      stores: {
        metronome: {
          setBpm: metronomeStore.setBpm,
          applySyncedState: metronomeStore.applySyncedState,
          setRunning: metronomeStore.setRunning,
          bpm: metronomeStore.bpm,
        },
        player: {
          setBpm: playerStore.setBpm,
          toggleCountIn: playerStore.toggleCountIn,
          countInEnabled: playerStore.countInEnabled,
        },
        song: {
          setSpeed: songStore.setSpeed,
          play: songStore.play,
          seek: songStore.seek,
          startOffsetMs: songStore.startOffsetMs,
          isLoaded: songStore.isLoaded,
        },
        app: {
          metronomeEnabled: appStore.metronomeEnabled,
          intervalChangeCountInBars: appStore.intervalChangeCountInBars,
        },
      },
      callbacks: {
        requestTabPlayback: options.callbacks.requestTabPlayback,
        setPendingIntervalRestart: (val) => {
          options.pendingIntervalRestart.value = val;
        },
        setPendingMetronomeBpm: (bpm) => {
          options.pendingMetronomeBpm.value = bpm;
        },
        ensureTabMetronomeEnabled: options.linking.ensureTabMetronomeEnabled,
      },
    };
  }

  // --- Interval runner ---

  async function startIntervalRunnerForExercise(
    exercise: PracticeExercise,
    startIntervalId?: string,
  ): Promise<void> {
    let allIntervals = options.intervalsForExercise(exercise.id);
    if (allIntervals.length === 0) {
      allIntervals = await practiceStore.ensureIntervalsLoaded(exercise.id);
    }
    if (allIntervals.length === 0) {
      return;
    }
    const autoAdvance = options.isIntervalAutoEnabled(exercise);
    const repeatIntervals = options.isIntervalRepeatEnabled(exercise);
    const mode = options.linking.exercisePlaybackMode(exercise);
    let pendingIntervals = allIntervals.filter((interval) => !interval.done);
    if (pendingIntervals.length === 0) {
      await practiceStore.clearIntervalDoneFlags(exercise.id);
      pendingIntervals = options.intervalsForExercise(exercise.id);
    }
    if (pendingIntervals.length === 0) {
      return;
    }
    let lastIntervalIndex = -1;
    stopIntervalRunner();
    const runnerToken = intervalRunnerToken + 1;
    intervalRunnerToken = runnerToken;
    const startIndex = startIntervalId
      ? Math.max(
          0,
          pendingIntervals.findIndex(
            (interval) => interval.id === startIntervalId,
          ),
        )
      : 0;
    let allDoneScheduled = false;
    activeIntervalRunner = createIntervalRunner(
      pendingIntervals,
      // --- onTick: simplified, BPM is set by advanceToInterval ---
      (tick) => {
        if (tick.intervalIndex !== lastIntervalIndex) {
          lastIntervalIndex = tick.intervalIndex;
        }
        intervalRunnerState.value = {
          exerciseId: exercise.id,
          intervalIndex: tick.intervalIndex,
          intervalId: tick.intervalId,
          remainingSeconds: tick.remainingSeconds,
          totalSeconds: tick.totalSeconds,
          running: true,
        };
      },
      // --- onIntervalEnd: properly awaited stop -> beep -> advance ---
      (index, interval) => {
        if (intervalRunnerToken !== runnerToken) {
          return false;
        }
        const isLast = index >= pendingIntervals.length - 1;
        const nextInterval = pendingIntervals[index + 1] ?? null;

        void (async () => {
          await practiceStore.completeInterval(exercise.id, interval.id);

          // 1. Silence playback without killing the metronome engine.
          //    The metronome must stay alive so the beep blips can play.
          //    - Tab: mute volume (avoids pop from hard stop)
          //    - Song: pause audio directly (fade-out in Rust engine)
          //    - Do NOT call playerStore.stop() or songStore.stop() yet
          //      because they internally call metronomeStore.stopSynced().
          if (playerStore.model.currentLibraryItemId) {
            await setTabVolume(0);
          }
          if (songStore.isLoaded) {
            // Pause song audio directly — songStore.pause()/stop() would
            // also stop the metronome in song-only mode.
            await pauseSongAudio();
          }
          if (!autoAdvance) {
            await practiceStore.stopExercise();
          }

          // 2. Beep while metronome still runs (blips need active engine)
          await metronomeBeep();

          // 3. Wait for beep to finish, then fully stop everything
          await delay(BEEP_PLAY_DURATION_MS);
          if (playerStore.model.currentLibraryItemId) {
            options.suppressPlaybackStopOnce.value = true;
            playerStore.stop();
          }
          if (songStore.isLoaded) {
            await songStore.stop();
          }
          if (metronomeStore.isSyncActive) {
            await metronomeStore.stopSynced();
          } else {
            await metronomeStore.setRunning(false);
          }
          // Restore tab volume (keep muted in dual mode)
          if (mode !== 'both') {
            playerStore.setVolume(playerStore.volume);
          }

          // 4. Check token (may have been stopped during delay)
          if (intervalRunnerToken !== runnerToken) return;

          // 5. Manual mode: stop and wait for user
          if (!autoAdvance) {
            if (isLast) {
              if (!allDoneScheduled) {
                allDoneScheduled = true;
                await handleAllIntervalsDone(exercise.id);
              }
            } else {
              resetIntervalRunnerState(exercise.id);
            }
            return;
          }

          // 6. Last interval: repeat or done
          if (isLast) {
            if (repeatIntervals) {
              await practiceStore.clearIntervalDoneFlags(exercise.id);
              const refreshed = options.intervalsForExercise(exercise.id);
              const restartInterval = refreshed[0] ?? null;
              if (!restartInterval) {
                await handleAllIntervalsDone(exercise.id);
                return;
              }
              setPendingIntervalIndicator(exercise.id, restartInterval, 0);
              options.pendingExerciseId.value = exercise.id;
              const ctx = buildAdvanceContext(
                exercise,
                restartInterval,
                mode,
                false,
              );
              await advanceToInterval(ctx);
              // For tab/both: runner starts via pendingIntervalRestart watcher
              if (mode !== 'tab' && mode !== 'both') {
                await startIntervalRunnerForExercise(
                  exercise,
                  restartInterval.id,
                );
              }
              return;
            }
            if (!allDoneScheduled) {
              allDoneScheduled = true;
              await handleAllIntervalsDone(exercise.id);
            }
            return;
          }

          // 7. Auto-advance to next interval
          if (!nextInterval) {
            await handleAllIntervalsDone(exercise.id);
            return;
          }
          setPendingIntervalIndicator(exercise.id, nextInterval, index + 1);
          options.pendingExerciseId.value = exercise.id;
          const ctx = buildAdvanceContext(exercise, nextInterval, mode, false);
          await advanceToInterval(ctx);
          // For tab/both: runner starts via pendingIntervalRestart watcher
          if (mode !== 'tab' && mode !== 'both') {
            await startIntervalRunnerForExercise(exercise, nextInterval.id);
          }
        })();

        return false;
      },
      () => {
        if (intervalRunnerToken !== runnerToken) {
          return;
        }
        if (!allDoneScheduled) {
          allDoneScheduled = true;
          void handleAllIntervalsDone(exercise.id);
        }
      },
      0, // no built-in transition delay — we handle it ourselves
    );
    resetIntervalRunnerState(exercise.id);
    if (startIndex > 0) {
      activeIntervalRunner.jumpToIndex(startIndex);
    }
    activeIntervalRunner.start();
  }

  // --- Interval display helpers ---

  function nextPendingIntervalInfo(
    exerciseId: string,
  ): { interval: PracticeInterval; index: number } | null {
    const intervals = options.intervalsForExercise(exerciseId);
    const next = nextPendingInterval(intervals);
    if (!next) {
      return null;
    }
    return {
      interval: next,
      index: intervals.findIndex((interval) => interval.id === next.id),
    };
  }

  function intervalTimerDisplay(exerciseId: string): {
    remainingSeconds: number;
    totalSeconds: number;
  } | null {
    const intervals = options.intervalsForExercise(exerciseId);
    if (intervals.length === 0) {
      return null;
    }
    if (intervalRunnerState.value.exerciseId === exerciseId) {
      return {
        remainingSeconds: intervalRunnerState.value.remainingSeconds,
        totalSeconds: intervalRunnerState.value.totalSeconds,
      };
    }
    const nextInterval = nextPendingIntervalInfo(exerciseId)?.interval ?? null;
    if (!nextInterval) {
      return null;
    }
    return {
      remainingSeconds: nextInterval.durationSeconds,
      totalSeconds: nextInterval.durationSeconds,
    };
  }

  function intervalTimerText(exerciseId: string): string | null {
    const display = intervalTimerDisplay(exerciseId);
    if (!display) {
      return null;
    }
    return `${formatDurationMmss(display.remainingSeconds)} / ${formatDurationMmss(
      display.totalSeconds,
    )}`;
  }

  function activeIntervalId(exerciseId: string): string | null {
    if (
      intervalRunnerState.value.exerciseId === exerciseId &&
      intervalRunnerState.value.intervalId
    ) {
      return intervalRunnerState.value.intervalId;
    }
    return nextPendingIntervalInfo(exerciseId)?.interval.id ?? null;
  }

  function isActiveInterval(exerciseId: string, intervalId: string): boolean {
    return activeIntervalId(exerciseId) === intervalId;
  }

  return {
    noBpmDialogOpen,
    stopIntervalRunner,
    resetIntervalRunnerState,
    setPendingIntervalIndicator,
    handleAllIntervalsDone,
    delay,
    buildBeatmapInfo,
    buildAdvanceContext,
    startIntervalRunnerForExercise,
    nextPendingIntervalInfo,
    intervalTimerDisplay,
    intervalTimerText,
    activeIntervalId,
    isActiveInterval,
    resolveIntervalBpm,
  };
}
