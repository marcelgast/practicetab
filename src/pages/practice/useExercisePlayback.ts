import { ref, computed, type Ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { usePlayerStore } from '../../stores/player';
import { useMetronomeStore } from '../../stores/metronome';
import { useUiStore } from '../../stores/ui';
import { useSongStore } from '../../stores/song';
import { useLibraryStore } from '../../stores/library';
import { useBeatmapStore } from '../../stores/beatmap';
import { setTabVolume } from '../../services/audioCommands';
import { openLibraryItemInPlayer } from '../../services/openPlayer';
import { libraryFileOps } from '../../services/libraryFileOps';
import {
  advanceToInterval,
  resolveIntervalBpm,
  type ExercisePlaybackMode,
} from '../../services/exerciseIntervalAdvance';
import { nextPendingInterval } from '../../domain/intervals';
import { getLibrarySourcePath } from '../../domain/library';
import type { PracticeExercise, PracticeInterval } from '../../domain/practice';
import type { LibraryItem } from '../../domain/library';
import type { IntervalRunnerStateValue } from './useIntervalRunner';
import type { useTabPlaybackRequest } from './useTabPlaybackRequest';
import type { useIntervalRunner } from './useIntervalRunner';

export interface ExercisePlaybackOptions {
  pendingExerciseId: Ref<string | null>;
  intervalRunnerState: Ref<IntervalRunnerStateValue>;
  linking: {
    exercisePlaybackMode: (item: PracticeExercise) => ExercisePlaybackMode;
    exerciseLinkedItems: (item: PracticeExercise) => {
      tab: LibraryItem | null;
      audio: LibraryItem | null;
    };
    linkedLibraryItem: (item: PracticeExercise) => LibraryItem | null;
    isLinkedMissing: (item: PracticeExercise) => boolean;
    applyLinkedBpm: (exerciseId: string, libraryItemId: string) => void;
    exerciseLinkedItemId: (exerciseId: string) => string | null;
    ensureTabMetronomeEnabled: () => void;
    linkedTab: (item: PracticeExercise) => LibraryItem | null;
    linkedAudio: (item: PracticeExercise) => LibraryItem | null;
  };
  intervalsForExercise: (exerciseId: string) => PracticeInterval[];
  isIntervalAutoEnabled: (exercise: PracticeExercise) => boolean;
  isIntervalRepeatEnabled: (exercise: PracticeExercise) => boolean;
  editModeByPlan: Ref<Record<string, boolean>>;
  getExpandedExercise: () => PracticeExercise | null;
  tabPlayback: ReturnType<typeof useTabPlaybackRequest>;
  intervalRunner: ReturnType<typeof useIntervalRunner>;
}

export function useExercisePlayback(options: ExercisePlaybackOptions) {
  const practiceStore = usePracticeStore();
  const playerStore = usePlayerStore();
  const metronomeStore = useMetronomeStore();
  const uiStore = useUiStore();
  const songStore = useSongStore();
  const libraryStore = useLibraryStore();
  const beatmapStore = useBeatmapStore();

  const completedExerciseTimers = ref<Record<string, boolean>>({});

  const isPlayerPlaying = computed(
    () => playerStore.model.playback === 'playing',
  );

  const {
    pendingPlaybackCanceled,
    pendingMetronomeBpm,
    pendingIntervalRestart,
    suppressPlaybackStopOnce,
    requestTabPlayback,
  } = options.tabPlayback;

  const {
    noBpmDialogOpen,
    stopIntervalRunner,
    buildBeatmapInfo,
    buildAdvanceContext,
  } = options.intervalRunner;

  let stopPendingPlaybackWatch: (() => void) | null = null;

  // --- Stop helpers ---

  async function stopMetronomeAndPlayback(opts?: {
    suppressPlaybackStop?: boolean;
  }): Promise<void> {
    // Exercise timer is expansion-driven and must keep running when the
    // user just pauses playback — stopping it here would conflate the
    // "playback stopped" signal with "exercise dismissed".
    if (metronomeStore.isSyncActive) {
      await metronomeStore.stopSynced();
    } else {
      await metronomeStore.setRunning(false);
    }
    if (playerStore.model.currentLibraryItemId) {
      if (opts?.suppressPlaybackStop) {
        suppressPlaybackStopOnce.value = true;
      }
      playerStore.stop();
    }
    if (songStore.isLoaded) {
      await songStore.stop();
    }
  }

  async function stopExerciseTimersFromPlayback(): Promise<void> {
    const exerciseId = practiceStore.activeExerciseId;
    if (!exerciseId) {
      return;
    }
    // Playback stop: tear down interval runner + metronome, but leave the
    // exercise session running — expansion owns its lifecycle now.
    stopIntervalRunner(exerciseId);
    pendingIntervalRestart.value = null;
    completedExerciseTimers.value = {
      ...completedExerciseTimers.value,
      [exerciseId]: false,
    };
    pendingMetronomeBpm.value = null;
    if (stopPendingPlaybackWatch) {
      stopPendingPlaybackWatch();
      stopPendingPlaybackWatch = null;
      options.tabPlayback.pendingPlaybackLibraryId.value = null;
    }
    if (metronomeStore.isSyncActive) {
      await metronomeStore.stopSynced();
    } else {
      await metronomeStore.setRunning(false);
    }
  }

  // --- Exercise start/stop ---

  async function handleStartExercise(item: PracticeExercise): Promise<void> {
    metronomeStore.setIntervalModeEnabled(false);
    if (options.editModeByPlan.value[item.planId]) {
      options.editModeByPlan.value = {
        ...options.editModeByPlan.value,
        [item.planId]: false,
      };
    }
    pendingIntervalRestart.value = null;
    pendingMetronomeBpm.value = null;

    const mode = options.linking.exercisePlaybackMode(item);
    const linked = options.linking.exerciseLinkedItems(item);
    const hasLinked = mode !== 'none';
    options.pendingExerciseId.value = hasLinked ? item.id : null;

    // Clear stale player/song state if no link
    if (!hasLinked && playerStore.model.currentLibraryItemId) {
      if (isPlayerPlaying.value) {
        playerStore.stop();
      }
      playerStore.clearSelection();
    }

    // Validate linked files exist
    if (hasLinked) {
      const primaryLinked = options.linking.linkedLibraryItem(item);
      if (!primaryLinked || options.linking.isLinkedMissing(item)) {
        return;
      }
      if (libraryStore.fileOpsAvailable) {
        try {
          await libraryFileOps.stat(getLibrarySourcePath(primaryLinked.source));
        } catch (error) {
          const message = String(error ?? '');
          const reason = message.includes('no_permission')
            ? 'no_permission'
            : 'not_found';
          libraryStore.markMissing(primaryLinked.id, reason);
          options.pendingExerciseId.value = null;
          return;
        }
      }
    }

    const intervals = await practiceStore.ensureIntervalsLoaded(item.id);
    completedExerciseTimers.value = {
      ...completedExerciseTimers.value,
      [item.id]: false,
    };
    await practiceStore.startExercise(item.id);

    // Play counts are tracked by Player/Song stores in their play() methods.

    // --- Load media based on mode ---

    // Load tab if needed (tab or both)
    if ((mode === 'tab' || mode === 'both') && linked.tab) {
      // In 'both' mode, don't unload song — dual mode activates automatically
      if (mode === 'tab' && songStore.isLoaded) {
        await songStore.unload();
      }
      if (playerStore.model.currentLibraryItemId !== linked.tab.id) {
        await openLibraryItemInPlayer(
          linked.tab,
          playerStore,
          uiStore,
          'practice',
        );
        options.linking.applyLinkedBpm(item.id, linked.tab.id);
      } else {
        playerStore.setPlaybackSource('practice');
        uiStore.openPlayerPanel();
      }
      // Mute tab audio in dual mode — song provides the audio, tab is visual only
      if (mode === 'both') {
        void setTabVolume(0);
      }
    }

    // Load audio/song if needed (audio or both)
    if ((mode === 'audio' || mode === 'both') && linked.audio) {
      if (mode === 'audio' && playerStore.model.currentLibraryItemId) {
        playerStore.clearSelection();
      }
      if (songStore.loadedItemId !== linked.audio.id) {
        await songStore.load(linked.audio.id);
      } else {
        await songStore.setSpeed(1.0);
        // Seek to start for a clean restart
        await songStore.seek(songStore.startOffsetMs);
      }
      await beatmapStore.ensureForItem(
        { id: linked.audio.id, kind: 'audio' } as Parameters<
          typeof beatmapStore.ensureForItem
        >[0],
        false,
      );
      if (!songStore.repeatEnabled) {
        songStore.toggleRepeat();
      }
      uiStore.openPlayerPanel();
    }

    // --- Validate BPM for audio modes ---
    if (mode === 'audio') {
      // Audio-only: validate BPM and auto-save song BPM to exercise if not set
      const firstInterval = nextPendingInterval(intervals);
      const bpmInfo = linked.audio ? buildBeatmapInfo(linked.audio.id) : null;
      const effectiveBpm = resolveIntervalBpm(
        firstInterval,
        item.bpm,
        bpmInfo?.songBpm,
      );
      if (effectiveBpm === null) {
        await practiceStore.stopExercise();
        noBpmDialogOpen.value = true;
        return;
      }
      if (item.bpm === null && bpmInfo?.songBpm !== null) {
        void practiceStore.updateExercise(item.id, { bpm: bpmInfo!.songBpm! });
      }
    }

    // --- Start playback via unified advance ---
    if (intervals.length > 0) {
      const firstInterval = nextPendingInterval(intervals);
      if (firstInterval) {
        if (intervals.length > 0) {
          options.linking.ensureTabMetronomeEnabled();
        }
        const ctx = buildAdvanceContext(item, firstInterval, mode, true);
        await advanceToInterval(ctx);
        // For tab/both: runner starts via pendingIntervalRestart watcher
        if (mode !== 'tab' && mode !== 'both') {
          await options.intervalRunner.startIntervalRunnerForExercise(item);
        }
        return;
      }
    }

    // No intervals — start simple playback
    if (mode === 'tab' || mode === 'both') {
      // Apply exercise BPM before count-in
      if (item.bpm !== null) {
        playerStore.setBpm(item.bpm);
        metronomeStore.setBpm(item.bpm);
        pendingMetronomeBpm.value = item.bpm;
      }
      // In dual mode, adjust song speed to match exercise/tab BPM
      if (mode === 'both' && linked.audio) {
        const bpmInfo = buildBeatmapInfo(linked.audio.id);
        const effectiveBpm = item.bpm ?? bpmInfo?.songBpm ?? null;
        if (
          bpmInfo?.songBpm !== null &&
          bpmInfo?.songBpm !== undefined &&
          bpmInfo.songBpm > 0 &&
          effectiveBpm !== null
        ) {
          await songStore.setSpeed(effectiveBpm / bpmInfo.songBpm);
        }
      }
      if (!playerStore.countInEnabled) {
        playerStore.toggleCountIn();
      }
      if (linked.tab) {
        requestTabPlayback(linked.tab.id);
      }
      if (mode === 'both') {
        await songStore.play();
      }
    } else if (mode === 'audio') {
      const bpmInfo = linked.audio ? buildBeatmapInfo(linked.audio.id) : null;
      const effectiveBpm = resolveIntervalBpm(null, item.bpm, bpmInfo?.songBpm);
      if (effectiveBpm !== null && bpmInfo) {
        metronomeStore.applySyncedState({
          bpm: effectiveBpm,
          timeSigTop: bpmInfo.timeSigTop,
          timeSigBottom: ([2, 4, 8, 16] as const).includes(
            bpmInfo.timeSigBottom as 2 | 4 | 8 | 16,
          )
            ? (bpmInfo.timeSigBottom as 2 | 4 | 8 | 16)
            : 4,
        });
        if (bpmInfo.songBpm !== null && bpmInfo.songBpm > 0) {
          await songStore.setSpeed(effectiveBpm / bpmInfo.songBpm);
        }
      }
      if (!playerStore.countInEnabled) {
        playerStore.toggleCountIn();
      }
      options.linking.ensureTabMetronomeEnabled();
      void songStore.play();
    } else {
      // No linked media — metronome only
      const fallbackBpm = item.bpm ?? metronomeStore.bpm ?? 60;
      metronomeStore.setBpm(fallbackBpm);
      await metronomeStore.setRunning(true);
    }
  }

  async function handleStopExercise(item: PracticeExercise): Promise<void> {
    await practiceStore.stopExercise();
    pendingPlaybackCanceled.value = true;
    stopIntervalRunner(item.id);
    pendingIntervalRestart.value = null;
    completedExerciseTimers.value = {
      ...completedExerciseTimers.value,
      [item.id]: false,
    };
    pendingMetronomeBpm.value = null;
    if (stopPendingPlaybackWatch) {
      stopPendingPlaybackWatch();
      stopPendingPlaybackWatch = null;
      options.tabPlayback.pendingPlaybackLibraryId.value = null;
    }
    if (metronomeStore.isSyncActive) {
      await metronomeStore.stopSynced();
    } else {
      await metronomeStore.setRunning(false);
    }
    // Always stop tab (resets to start) — even if paused/stopped already
    if (playerStore.model.currentLibraryItemId) {
      playerStore.stop();
    }
    if (songStore.isLoaded) {
      // Always stop song — resets position for clean restart
      await songStore.stop();
    }
    // Clear interval done flags so restart begins from interval 1
    await practiceStore.clearIntervalDoneFlags(item.id);
  }

  /**
   * Load the exercise's linked media (tab and/or audio) without starting
   * playback. The user triggers playback themselves via the transport
   * controls; interval runners kick in from the playback watcher once play
   * starts. Used by the exercise "Open" button.
   */
  async function handleOpenExercise(item: PracticeExercise): Promise<void> {
    metronomeStore.setIntervalModeEnabled(false);
    if (options.editModeByPlan.value[item.planId]) {
      options.editModeByPlan.value = {
        ...options.editModeByPlan.value,
        [item.planId]: false,
      };
    }
    pendingIntervalRestart.value = null;
    pendingMetronomeBpm.value = null;

    const mode = options.linking.exercisePlaybackMode(item);
    if (mode === 'none') {
      return;
    }
    const linked = options.linking.exerciseLinkedItems(item);
    const primaryLinked = options.linking.linkedLibraryItem(item);
    if (!primaryLinked || options.linking.isLinkedMissing(item)) {
      return;
    }
    if (libraryStore.fileOpsAvailable) {
      try {
        await libraryFileOps.stat(getLibrarySourcePath(primaryLinked.source));
      } catch (error) {
        const message = String(error ?? '');
        const reason = message.includes('no_permission')
          ? 'no_permission'
          : 'not_found';
        libraryStore.markMissing(primaryLinked.id, reason);
        return;
      }
    }

    await practiceStore.ensureIntervalsLoaded(item.id);

    if ((mode === 'tab' || mode === 'both') && linked.tab) {
      if (mode === 'tab' && songStore.isLoaded) {
        await songStore.unload();
      }
      if (playerStore.model.currentLibraryItemId !== linked.tab.id) {
        await openLibraryItemInPlayer(
          linked.tab,
          playerStore,
          uiStore,
          'practice',
        );
        options.linking.applyLinkedBpm(item.id, linked.tab.id);
      } else {
        playerStore.setPlaybackSource('practice');
        uiStore.openPlayerPanel();
      }
      if (mode === 'both') {
        void setTabVolume(0);
      }
    }

    if ((mode === 'audio' || mode === 'both') && linked.audio) {
      if (mode === 'audio' && playerStore.model.currentLibraryItemId) {
        playerStore.clearSelection();
      }
      if (songStore.loadedItemId !== linked.audio.id) {
        await songStore.load(linked.audio.id);
      } else {
        await songStore.setSpeed(1.0);
        await songStore.seek(songStore.startOffsetMs);
      }
      await beatmapStore.ensureForItem(
        { id: linked.audio.id, kind: 'audio' } as Parameters<
          typeof beatmapStore.ensureForItem
        >[0],
        false,
      );
      uiStore.openPlayerPanel();
    }

    if (item.bpm !== null) {
      if (playerStore.model.currentLibraryItemId) {
        playerStore.setBpm(item.bpm);
      }
      metronomeStore.setBpm(item.bpm);
    }
  }

  /**
   * Toggle the metronome for an exercise with no linked media. Uses the
   * exercise BPM when set, otherwise the current metronome BPM or a 60 BPM
   * fallback. Does not touch session or playback timers — those respond
   * to metronome state via their own watchers.
   */
  async function handleToggleMetronomeForExercise(
    item: PracticeExercise,
  ): Promise<void> {
    if (metronomeStore.isRunning) {
      await metronomeStore.setRunning(false);
      return;
    }
    const fallbackBpm = item.bpm ?? metronomeStore.bpm ?? 60;
    metronomeStore.setBpm(fallbackBpm);
    await metronomeStore.setRunning(true);
  }

  // --- Space handler ---

  /**
   * Space key in the practice page. With the expansion-driven timer model
   * the space key just pauses a running interval runner (so practice stops
   * mid-run) or falls through to the global hotkey handler for plain
   * transport play/pause. No more auto-start-exercise behaviour — the user
   * now drives playback via the transport button or the bottom-bar timer.
   */
  function handlePracticeSpace(event: Event): void {
    const runnerState = options.intervalRunnerState.value;
    if (runnerState.running && runnerState.exerciseId) {
      const active = practiceStore.exercises.find(
        (exercise) => exercise.id === runnerState.exerciseId,
      );
      if (active) {
        event.preventDefault();
        void handleStopExercise(active);
      }
      return;
    }
    // Expanded exercise but no media loaded yet → start the metronome with
    // the exercise's BPM so the user can practise along without first
    // pressing Open. Skipped once something is already loaded/playing —
    // the global transport handler takes over for real play/pause.
    const expanded = options.getExpandedExercise();
    const nothingLoaded =
      !playerStore.model.currentLibraryItemId && !songStore.isLoaded;
    const nothingPlaying =
      playerStore.model.playback !== 'playing' && !songStore.isPlaying;
    if (expanded && nothingLoaded && nothingPlaying) {
      event.preventDefault();
      void handleToggleMetronomeForExercise(expanded);
    }
    // Otherwise fall through — global hotkey handler does plain play/pause.
  }

  return {
    completedExerciseTimers,
    isPlayerPlaying,
    noBpmDialogOpen,
    handleStartExercise,
    handleStopExercise,
    handleOpenExercise,
    handleToggleMetronomeForExercise,
    handlePracticeSpace,
    stopMetronomeAndPlayback,
    stopExerciseTimersFromPlayback,
  };
}
