import type { Ref, ComputedRef } from 'vue';
import * as songService from '../../services/songPlaybackService';
import { metronomeStop } from '../../services/songMetronomeSync';

export interface SongPollingDeps {
  isPlaying: Ref<boolean>;
  currentMs: Ref<number>;
  durationMs: Ref<number>;
  startOffsetMs: ComputedRef<number>;
  repeatEnabled: Ref<boolean>;
  loopEnabled: ComputedRef<boolean>;
  songOwnsMetronome: ComputedRef<boolean>;
  hasBeatmap: ComputedRef<boolean>;
  metronomeEnabled: () => boolean;
  metronomeIsRunning: (value: boolean) => void;
  startSongMetronome: (skipCountIn: boolean, atMs?: number) => Promise<void>;
}

export function createSongPolling(deps: SongPollingDeps) {
  let positionPollTimer: ReturnType<typeof setInterval> | null = null;
  let loopingInProgress = false;
  let lastPollMs = 0;

  function startPolling(): void {
    stopPolling();
    loopingInProgress = false;
    lastPollMs = 0;
    positionPollTimer = setInterval(async () => {
      if (!deps.isPlaying.value || loopingInProgress) {
        if (!deps.isPlaying.value) stopPolling();
        return;
      }
      const pos = await songService.songGetPositionMs();
      const prevMs = lastPollMs;
      lastPollMs = pos;
      deps.currentMs.value = pos;

      // Detect loop wrap: position jumped backward significantly
      if (
        deps.loopEnabled.value &&
        prevMs > 0 &&
        pos < prevMs - 500 &&
        deps.songOwnsMetronome.value &&
        deps.metronomeEnabled() &&
        deps.hasBeatmap.value
      ) {
        void metronomeStop().then(() => deps.startSongMetronome(true, pos));
      }

      // Use tolerance — the poll may never see pos == durationMs exactly
      const endThresholdMs = 150;
      if (
        deps.durationMs.value > 0 &&
        pos >= deps.durationMs.value - endThresholdMs
      ) {
        if (deps.repeatEnabled.value) {
          loopingInProgress = true;
          const offset = deps.startOffsetMs.value;
          try {
            await songService.songSeek(offset);
            deps.currentMs.value = offset;
            if (
              deps.songOwnsMetronome.value &&
              deps.metronomeEnabled() &&
              deps.hasBeatmap.value
            ) {
              await metronomeStop();
              await deps.startSongMetronome(true, offset);
            }
          } finally {
            loopingInProgress = false;
          }
        } else {
          deps.isPlaying.value = false;
          if (deps.songOwnsMetronome.value) {
            deps.metronomeIsRunning(false);
            void metronomeStop();
          }
          stopPolling();
        }
      }
    }, 50);
  }

  function stopPolling(): void {
    if (positionPollTimer !== null) {
      clearInterval(positionPollTimer);
      positionPollTimer = null;
    }
  }

  return { startPolling, stopPolling };
}
