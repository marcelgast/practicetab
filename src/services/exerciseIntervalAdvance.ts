import type { PracticeExercise, PracticeInterval } from '../domain/practice';

/**
 * Playback mode resolved from exercise link state + preferredSource.
 */
export type ExercisePlaybackMode = 'tab' | 'audio' | 'both' | 'none';

/**
 * Resolve effective BPM for an interval with fallback chain:
 *   interval.bpm → exercise.bpm → songBpm → tabBaseBpm → null
 */
export function resolveIntervalBpm(
  interval: Pick<PracticeInterval, 'bpm'> | null,
  exerciseBpm: number | null,
  songBpm?: number | null,
  tabBaseBpm?: number | null,
): number | null {
  return interval?.bpm ?? exerciseBpm ?? songBpm ?? tabBaseBpm ?? null;
}

/**
 * Determine the playback mode for an exercise based on linked items
 * and the user's preferred source selection.
 */
export function resolvePlaybackMode(
  exercise: Pick<
    PracticeExercise,
    'linkedTabId' | 'linkedAudioId' | 'preferredSource'
  >,
  hasTab: boolean,
  hasAudio: boolean,
): ExercisePlaybackMode {
  if (!hasTab && !hasAudio) return 'none';
  if (hasTab && hasAudio) {
    if (exercise.preferredSource === 'both') return 'both';
    if (exercise.preferredSource === 'audio') return 'audio';
    return 'tab';
  }
  return hasTab ? 'tab' : 'audio';
}

// ---------------------------------------------------------------------------
// AdvanceContext — passed from Practice.vue so the service stays store-free
// ---------------------------------------------------------------------------

export interface AdvanceStores {
  metronome: {
    setBpm: (bpm: number) => void;
    applySyncedState: (state: {
      bpm: number;
      timeSigTop: number;
      timeSigBottom: 2 | 4 | 8 | 16;
    }) => void;
    setRunning: (next: boolean) => Promise<void>;
    bpm: number;
  };
  player: {
    setBpm: (bpm: number) => void;
    toggleCountIn: () => void;
    countInEnabled: boolean;
  };
  song: {
    setSpeed: (factor: number) => Promise<void>;
    play: () => Promise<void>;
    seek: (ms: number) => Promise<void>;
    startOffsetMs: number;
    isLoaded: boolean;
  };
  app: {
    metronomeEnabled: boolean;
    intervalChangeCountInBars: number;
  };
}

export interface AdvanceBeatmapInfo {
  songBpm: number | null;
  timeSigTop: number;
  timeSigBottom: number;
}

export interface AdvanceCallbacks {
  requestTabPlayback: (libraryItemId: string) => void;
  setPendingIntervalRestart: (
    val: { exerciseId: string; intervalId: string } | null,
  ) => void;
  setPendingMetronomeBpm: (bpm: number | null) => void;
  ensureTabMetronomeEnabled: () => void;
}

export interface AdvanceContext {
  exercise: PracticeExercise;
  interval: PracticeInterval;
  mode: ExercisePlaybackMode;
  tabLibraryItemId: string | null;
  audioLibraryItemId: string | null;
  beatmapInfo: AdvanceBeatmapInfo | null;
  tabBaseBpm: number | null;
  isFirstInterval: boolean;
  stores: AdvanceStores;
  callbacks: AdvanceCallbacks;
}

/**
 * Unified interval advance: sets BPM then starts playback.
 *
 * Called both on initial exercise start and on interval transitions.
 * BPM is always applied **before** any playback begins, ensuring
 * count-ins use the correct tempo.
 */
export async function advanceToInterval(ctx: AdvanceContext): Promise<void> {
  const { exercise, interval, mode, stores, callbacks, beatmapInfo } = ctx;

  // 1. Resolve BPM
  const bpm = resolveIntervalBpm(
    interval,
    exercise.bpm,
    beatmapInfo?.songBpm,
    ctx.tabBaseBpm,
  );

  // 2. Apply BPM before any playback
  if (bpm !== null) {
    stores.metronome.setBpm(bpm);
  }

  const songBpm = beatmapInfo?.songBpm ?? null;
  const timeSigTop = beatmapInfo?.timeSigTop ?? 4;
  const rawBottom = beatmapInfo?.timeSigBottom ?? 4;
  const timeSigBottom: 2 | 4 | 8 | 16 = ([2, 4, 8, 16] as const).includes(
    rawBottom as 2 | 4 | 8 | 16,
  )
    ? (rawBottom as 2 | 4 | 8 | 16)
    : 4;

  switch (mode) {
    case 'tab': {
      if (bpm !== null) {
        stores.player.setBpm(bpm);
        callbacks.setPendingMetronomeBpm(bpm);
      }
      if (!stores.player.countInEnabled) {
        stores.player.toggleCountIn();
      }
      callbacks.ensureTabMetronomeEnabled();
      if (ctx.tabLibraryItemId) {
        callbacks.setPendingIntervalRestart({
          exerciseId: exercise.id,
          intervalId: interval.id,
        });
        callbacks.requestTabPlayback(ctx.tabLibraryItemId);
      }
      break;
    }

    case 'audio': {
      if (bpm !== null) {
        stores.metronome.applySyncedState({ bpm, timeSigTop, timeSigBottom });
      }
      if (songBpm !== null && songBpm > 0 && bpm !== null) {
        await stores.song.setSpeed(bpm / songBpm);
      }
      // Seek to start on interval advance (not first start)
      if (!ctx.isFirstInterval && stores.song.isLoaded) {
        await stores.song.seek(stores.song.startOffsetMs);
      }
      if (!stores.player.countInEnabled) {
        stores.player.toggleCountIn();
      }
      callbacks.ensureTabMetronomeEnabled();
      await stores.song.play();
      break;
    }

    case 'both': {
      // Dual mode: tab is source of truth, song follows via watcher
      if (bpm !== null) {
        stores.player.setBpm(bpm);
        callbacks.setPendingMetronomeBpm(bpm);
      }
      // Set song speed to match exercise BPM
      if (songBpm !== null && songBpm > 0 && bpm !== null) {
        await stores.song.setSpeed(bpm / songBpm);
      }
      // Restart song from beginning on each interval
      if (!ctx.isFirstInterval && stores.song.isLoaded) {
        await stores.song.seek(stores.song.startOffsetMs);
      }
      if (!stores.player.countInEnabled) {
        stores.player.toggleCountIn();
      }
      callbacks.ensureTabMetronomeEnabled();
      // In dual mode, play() just sets isPlaying = true (no audio yet)
      await stores.song.play();
      // Tab playback triggers song audio via song store watcher
      if (ctx.tabLibraryItemId) {
        callbacks.setPendingIntervalRestart({
          exerciseId: exercise.id,
          intervalId: interval.id,
        });
        callbacks.requestTabPlayback(ctx.tabLibraryItemId);
      }
      break;
    }

    case 'none': {
      await stores.metronome.setRunning(true);
      break;
    }
  }
}
