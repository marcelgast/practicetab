import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { SongMap, SongSection } from '../domain/songMap';
import { useSongMapStore } from './songMap';
import { useLibraryStore } from './library';
import { useBeatmapStore } from './beatmap';
import { usePlayerStore } from './player';
import { useMetronomeStore } from './metronome';
import { getLibrarySourcePath } from '../domain/library';
import * as songService from '../services/songPlaybackService';
import { buildScheduleFromBeatmap } from '../services/beatmapMetronomeSync';
import { snapToNearestBeat } from '../domain/songLoopSnap';
import {
  getBeatmapConfig,
  countInDurationMs as calcCountInDurationMs,
  startSongMetronome as startMetronomeFromBeatmap,
  metronomeStop,
} from '../services/songMetronomeSync';
import type { SongMetronomeContext } from '../services/songMetronomeSync';
import { createSongPolling } from './song/polling';
import { practicePersistence } from '../services/practicePersistence';

export const useSongStore = defineStore('song', () => {
  const songMapStore = useSongMapStore();
  const libraryStore = useLibraryStore();
  const beatmapStore = useBeatmapStore();

  function playerStore() {
    return usePlayerStore();
  }

  function metronomeStore() {
    return useMetronomeStore();
  }

  const loadedItemId = ref<string | null>(null);
  const durationMs = ref(0);
  const currentMs = ref(0);
  const isPlaying = ref(false);
  const volume = ref(0.8);
  const speed = ref(1.0);
  const repeatEnabled = ref(true);
  const loopPreviousRepeatState = ref<boolean | null>(null);
  let playStartedAtMs: number | null = null;
  const loopStartMs = ref<number | null>(null);
  const loopEndMs = ref<number | null>(null);
  const loopEnabled = computed(
    () => loopStartMs.value !== null && loopEndMs.value !== null,
  );

  const songMap = computed<SongMap | null>(() =>
    loadedItemId.value ? songMapStore.getSongMap(loadedItemId.value) : null,
  );
  const sections = computed<SongSection[]>(() => songMap.value?.sections ?? []);
  const startOffsetMs = computed(() => songMap.value?.startOffsetMs ?? 0);
  const isLoaded = computed(() => loadedItemId.value !== null);
  /** Song-only mode: no tab loaded, song owns the metronome */
  const songOwnsMetronome = computed(
    () => !playerStore().model.currentLibraryItemId,
  );
  const hasBeatmap = computed(() => {
    if (!loadedItemId.value) return false;
    return beatmapStore.statusForItem(loadedItemId.value) === 'ready';
  });

  async function load(libraryItemId: string): Promise<void> {
    if (loadedItemId.value) await unload();

    const item = libraryStore.items.find((i) => i.id === libraryItemId);
    if (!item) return;
    const path = getLibrarySourcePath(item.source);
    if (!path) return;

    await songMapStore.load(libraryItemId);
    void beatmapStore.ensureForItem(
      { id: libraryItemId, kind: 'audio' } as Parameters<
        typeof beatmapStore.ensureForItem
      >[0],
      true,
    );

    const dur = await songService.songLoad(path);
    durationMs.value = dur;
    loadedItemId.value = libraryItemId;
    await songService.songSetVolume(volume.value);
    speed.value = 1.0;
    loopStartMs.value = null;
    loopEndMs.value = null;
    await songService.songSetSpeed(1.0);
    await songService.songSetTuning(playerStore().tuning);
    // Loading a new song dismisses any previously drawn region — restore
    // the pre-draw repeat state so the new file inherits the user's
    // original choice, not the auto-enabled one.
    if (loopPreviousRepeatState.value !== null) {
      repeatEnabled.value = loopPreviousRepeatState.value;
      loopPreviousRepeatState.value = null;
    }

    // Pre-buffer: seek to start offset so first play has no decode delay
    const offset = songMapStore.getSongMap(libraryItemId)?.startOffsetMs ?? 0;
    if (offset > 0) {
      await songService.songSeek(offset);
      currentMs.value = offset;
    } else {
      await songService.songSeek(0);
    }

    // In song-only mode, notify metronome store about beatmap availability
    if (songOwnsMetronome.value) {
      const ms = metronomeStore();
      ms.setSongWithBeatmapLoaded(hasBeatmap.value);
      if (hasBeatmap.value) {
        const cfg = getBeatmapConfig(getItemBeatmap());
        if (cfg) {
          ms.applySyncedState({
            bpm: cfg.bpm,
            timeSigTop: cfg.timeSigTop,
            timeSigBottom: cfg.timeSigBottom as 2 | 4 | 8 | 16,
          });
        }
      }
    }
    // Dual mode BPM sync is handled by player store (setBaseBpm / setReady)
  }

  function getItemBeatmap() {
    if (!loadedItemId.value) return null;
    return beatmapStore.getEntry(loadedItemId.value)?.beatmap ?? null;
  }

  function metronomeCtx(): SongMetronomeContext {
    const ps = playerStore();
    const ms = metronomeStore();
    return {
      metronomeEnabled: ps.metronomeEnabled,
      countInEnabled: ps.countInEnabled,
      countInBars: ps.countInBars,
      bpm: ms.bpm,
      timeSigTop: ms.timeSigTop,
      timeSigBottom: ms.timeSigBottom,
      volume: ms.volume,
      subdivisionsEnabled: ms.subdivisionsEnabled,
      subdivisionsValue: ms.subdivisionsValue,
      soundMode: ms.soundMode,
    };
  }

  async function startSongMetronome(
    skipCountIn: boolean = false,
    atMs?: number,
  ): Promise<void> {
    if (!loadedItemId.value) return;
    const beatmap = getItemBeatmap();
    if (!beatmap) return;
    metronomeStore().isRunning = true;
    await startMetronomeFromBeatmap(beatmap, metronomeCtx(), {
      skipCountIn,
      positionMs: atMs ?? currentMs.value,
    });
  }

  const polling = createSongPolling({
    isPlaying,
    currentMs,
    durationMs,
    startOffsetMs,
    repeatEnabled,
    loopEnabled,
    songOwnsMetronome,
    hasBeatmap,
    metronomeEnabled: () => playerStore().metronomeEnabled,
    metronomeIsRunning: (value: boolean) => {
      metronomeStore().isRunning = value;
    },
    startSongMetronome,
  });

  let needsSeekBeforePlay = false;

  async function startSongPlayback(): Promise<void> {
    // Only seek if stop() deferred a position reset
    if (needsSeekBeforePlay) {
      needsSeekBeforePlay = false;
      await songService.songSeek(currentMs.value);
    }
    // Fire play without awaiting — minimizes latency between count-in end
    // and actual audio start. The IPC reply is not needed before polling.
    void songService.songPlay();
    polling.startPolling();
  }

  async function play(): Promise<void> {
    if (!loadedItemId.value) return;
    isPlaying.value = true;

    // Track play count + start time for library item stats
    void practicePersistence.incrementLibraryItemPlayCount(loadedItemId.value);
    playStartedAtMs = Date.now();

    if (!songOwnsMetronome.value) {
      // Dual mode: song is audio slave — don't start here.
      // The watcher on tab playback state will start song audio
      // when the tab actually starts playing (after count-in).
      return;
    }

    // Song-only mode: song owns metronome, uses song beatmap for count-in
    const isResume = currentMs.value > startOffsetMs.value;
    const ps = playerStore();
    const ms = metronomeStore();
    const hasMetronome = ps.metronomeEnabled && hasBeatmap.value;
    const metronomeAlreadyRunning = ms.isRunning;
    const delayMs =
      hasMetronome && !isResume && !metronomeAlreadyRunning
        ? calcCountInDurationMs(metronomeCtx())
        : 0;

    // Only start metronome if it's not already running (e.g. from exercise)
    if (hasMetronome && !metronomeAlreadyRunning) {
      void startSongMetronome(isResume);
    }

    if (delayMs > 0) {
      // Pre-seek now (while count-in plays)
      if (needsSeekBeforePlay) {
        needsSeekBeforePlay = false;
        void songService.songSeek(currentMs.value);
      }
      // Delay handled in Rust audio engine — sample-accurate, no JS timer jitter
      void songService.songPlayDelayed(delayMs);
      polling.startPolling();
      return;
    }

    await startSongPlayback();
  }

  function flushLibraryItemTime(): void {
    if (playStartedAtMs !== null && loadedItemId.value) {
      const elapsedSeconds = Math.round((Date.now() - playStartedAtMs) / 1000);
      if (elapsedSeconds > 0) {
        void practicePersistence.recordLibraryItemTime(
          loadedItemId.value,
          elapsedSeconds,
        );
      }
      playStartedAtMs = null;
    }
  }

  async function pause(): Promise<void> {
    flushLibraryItemTime();
    isPlaying.value = false;
    if (songOwnsMetronome.value) {
      // Song-only: directly control audio + metronome
      await songService.songPause();
      await metronomeStop();
      metronomeStore().isRunning = false;
      polling.stopPolling();
    }
    // Dual mode: watcher handles song audio pause when tab pauses
  }

  async function stop(): Promise<void> {
    flushLibraryItemTime();
    isPlaying.value = false;
    if (songOwnsMetronome.value) {
      await songService.songPause();
      await metronomeStop();
      metronomeStore().isRunning = false;
      polling.stopPolling();
    }
    // Don't seek here — the fade-out needs to complete first.
    // Position resets to start offset on next play().
    currentMs.value = startOffsetMs.value;
    needsSeekBeforePlay = true;
  }

  async function seek(ms: number): Promise<void> {
    await songService.songSeek(ms);
    currentMs.value = ms;
    // Resync metronome only in song-only mode; dual mode tab owns metronome
    if (
      songOwnsMetronome.value &&
      isPlaying.value &&
      playerStore().metronomeEnabled &&
      hasBeatmap.value
    ) {
      await metronomeStop();
      await startSongMetronome(true, ms);
    }
  }

  async function syncMetronomeToggle(enabled: boolean): Promise<void> {
    if (!songOwnsMetronome.value) return;
    if (!isPlaying.value || !hasBeatmap.value) return;
    if (enabled) {
      await startSongMetronome(true, currentMs.value);
    } else {
      await metronomeStop();
      metronomeStore().isRunning = false;
    }
  }

  async function setLoopRegion(startMs: number, endMs: number): Promise<void> {
    if (!loadedItemId.value) return;
    const rawStart = Math.min(startMs, endMs);
    const rawEnd = Math.max(startMs, endMs);

    // Snap to beats if metronome enabled and beatmap available.
    // Schedule offsets are in score-time (starting at 0), but waveform
    // positions are in audio-file time. Subtract startOffsetMs before
    // snapping and add it back after.
    let snappedStart = rawStart;
    let snappedEnd = rawEnd;
    if (playerStore().metronomeEnabled && hasBeatmap.value) {
      const entry = beatmapStore.getEntry(loadedItemId.value);
      if (entry?.beatmap) {
        const schedule = buildScheduleFromBeatmap(entry.beatmap);
        const offset = startOffsetMs.value;
        snappedStart =
          snapToNearestBeat(rawStart - offset, schedule.events) + offset;
        snappedEnd =
          snapToNearestBeat(rawEnd - offset, schedule.events) + offset;
        // Ensure start < end after snapping (both could snap to same beat)
        if (snappedStart >= snappedEnd) {
          return; // Region too small to form a valid loop
        }
      }
    }

    // Snapshot repeat state so dismissing the drawn region can restore it.
    // Only snapshot the first time a region is created — consecutive draws
    // (re-drawing while a region already exists) must not overwrite the
    // original user intent.
    if (loopPreviousRepeatState.value === null) {
      loopPreviousRepeatState.value = repeatEnabled.value;
    }
    repeatEnabled.value = true;

    loopStartMs.value = snappedStart;
    loopEndMs.value = snappedEnd;
    await songService.songSetLoop(snappedStart, snappedEnd);

    if (loadedItemId.value) {
      void practicePersistence.incrementLibraryItemLoopCount(
        loadedItemId.value,
      );
    }

    // Rust jumps song_position to loop start when playhead is outside the
    // new region. Mirror that here so currentMs and metronome stay in sync.
    if (currentMs.value < snappedStart || currentMs.value >= snappedEnd) {
      currentMs.value = snappedStart;
    }

    // Resync metronome if playing
    if (
      isPlaying.value &&
      songOwnsMetronome.value &&
      playerStore().metronomeEnabled &&
      hasBeatmap.value
    ) {
      await metronomeStop();
      await startSongMetronome(true, currentMs.value);
    }
  }

  async function clearLoopRegion(): Promise<void> {
    loopStartMs.value = null;
    loopEndMs.value = null;
    if (loadedItemId.value) {
      await songService.songClearLoop();
    }
    // Restore the repeat state captured when the region was first drawn.
    if (loopPreviousRepeatState.value !== null) {
      repeatEnabled.value = loopPreviousRepeatState.value;
      loopPreviousRepeatState.value = null;
    }
  }

  function toggleRepeat(): void {
    repeatEnabled.value = !repeatEnabled.value;
    // Explicit user choice — invalidate any snapshot so a later dismiss
    // does not silently override the user's decision.
    loopPreviousRepeatState.value = null;
  }

  async function setVolume(vol: number): Promise<void> {
    volume.value = vol;
    if (loadedItemId.value) {
      await songService.songSetVolume(vol);
    }
  }

  async function setSpeed(factor: number): Promise<void> {
    const clamped = Math.max(0.25, Math.min(2.0, factor));
    speed.value = clamped;
    if (loadedItemId.value) {
      await songService.songSetSpeed(clamped);
    }
    // Sync metronome BPM when song owns metronome
    if (songOwnsMetronome.value) {
      const cfg = getBeatmapConfig(getItemBeatmap());
      if (cfg) {
        const ms = metronomeStore();
        ms.applySyncedState({
          bpm: Math.round(cfg.bpm * clamped),
          timeSigTop: cfg.timeSigTop,
          timeSigBottom: cfg.timeSigBottom as 2 | 4 | 8 | 16,
        });
        // Restart running metronome with new BPM
        if (ms.isRunning && isPlaying.value) {
          await metronomeStop();
          await startSongMetronome(true, currentMs.value);
        }
      }
    }
  }

  async function unload(): Promise<void> {
    flushLibraryItemTime();
    const ps = playerStore();
    const tabItemId = ps.model.currentLibraryItemId;
    polling.stopPolling();
    if (songOwnsMetronome.value) {
      await metronomeStop();
      metronomeStore().isRunning = false;
    }
    metronomeStore().setSongWithBeatmapLoaded(false);
    isPlaying.value = false;
    speed.value = 1.0;
    loopStartMs.value = null;
    loopEndMs.value = null;
    // Unloading dismisses any drawn region — restore the pre-draw repeat
    // state so it does not leak into the next load.
    if (loopPreviousRepeatState.value !== null) {
      repeatEnabled.value = loopPreviousRepeatState.value;
      loopPreviousRepeatState.value = null;
    }
    currentMs.value = 0;
    durationMs.value = 0;
    if (loadedItemId.value) {
      await songService.songUnload();
      loadedItemId.value = null;
    }
    // Reload tab to restore clean playback state (dual mode muting can
    // leave the audio engine in an inconsistent tempo state)
    if (tabItemId) {
      const item = libraryStore.items.find((i) => i.id === tabItemId);
      if (item) {
        void ps.openLibraryItem(item);
      }
    }
  }

  // Dual mode: song follows tab transport state.
  // When tab starts playing (after count-in), start song audio.
  // When tab pauses/stops, pause song audio.
  watch(
    () => playerStore().model.playback,
    (playback, prev) => {
      if (songOwnsMetronome.value || !isLoaded.value) return;
      if (playback === 'playing' && prev !== 'playing') {
        if (isPlaying.value) {
          void startSongPlayback();
        }
      } else if (playback !== 'playing' && prev === 'playing') {
        isPlaying.value = false;
        void songService.songPause();
        polling.stopPolling();
      }
    },
  );

  // Dual mode: sync song speed when tab tempo percent changes
  watch(
    () => playerStore().model.tempoPercent,
    (tempoPercent) => {
      if (songOwnsMetronome.value || !isLoaded.value) return;
      void setSpeed(tempoPercent / 100);
    },
  );

  // Sync song pitch when tuning changes (both modes)
  watch(
    () => playerStore().tuning,
    (tuning) => {
      if (!isLoaded.value) return;
      void songService.songSetTuning(tuning);
    },
  );

  return {
    loadedItemId,
    durationMs,
    currentMs,
    isPlaying,
    volume,
    songMap,
    sections,
    startOffsetMs,
    isLoaded,
    hasBeatmap,
    repeatEnabled,
    loopStartMs,
    loopEndMs,
    loopEnabled,
    toggleRepeat,
    setLoopRegion,
    clearLoopRegion,
    syncMetronomeToggle,
    load,
    play,
    pause,
    stop,
    seek,
    setVolume,
    setSpeed,
    speed,
    unload,
  };
});
