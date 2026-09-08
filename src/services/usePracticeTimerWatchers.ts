import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useMetronomeStore } from '../stores/metronome';
import { usePlayerStore } from '../stores/player';
import { useSongStore } from '../stores/song';
import { usePracticePlaybackStore } from '../stores/practicePlayback';
import { usePracticeTimerStore } from '../stores/practiceTimer';

/**
 * Connects the stores to their input signals:
 *  - Global session timer auto-starts as soon as the user loads a tab OR
 *    any playback begins (tab, song, or metronome) — a net for users who
 *    forget to press the timer button. Never auto-stops; the user has to
 *    pause it manually.
 *  - Playback timer starts/stops with any active playback, routing ticks
 *    to the currently expanded exercise (or the session) via its store.
 *
 * Mount once at the app shell level.
 */
export function usePracticeTimerWatchers(): void {
  const playerStore = usePlayerStore();
  const songStore = useSongStore();
  const metronomeStore = useMetronomeStore();
  const practiceTimerStore = usePracticeTimerStore();
  const practicePlaybackStore = usePracticePlaybackStore();

  let stopPlaybackWatcher: (() => void) | null = null;
  let stopLoadedWatcher: (() => void) | null = null;

  onMounted(() => {
    stopPlaybackWatcher = watch(
      () => {
        const anyPlaying =
          playerStore.model.playback === 'playing' ||
          songStore.isPlaying ||
          metronomeStore.isRunning;
        return anyPlaying;
      },
      (anyPlaying) => {
        if (anyPlaying) {
          // Auto-start the global timer so forgotten starts don't lose time.
          practiceTimerStore.start();
          practicePlaybackStore.start();
        } else {
          practicePlaybackStore.stop();
          // Global timer keeps running — user pauses it explicitly.
        }
      },
      { immediate: true },
    );

    // Also start the session timer when a tab is first loaded into the
    // player — the user is clearly practicing even if they haven't hit
    // play yet (reading through, fingering, tuning to the tab…).
    stopLoadedWatcher = watch(
      () => playerStore.model.currentLibraryItemId,
      (itemId, prev) => {
        if (itemId && itemId !== prev) {
          practiceTimerStore.start();
        }
      },
      { immediate: true },
    );
  });

  onBeforeUnmount(() => {
    stopPlaybackWatcher?.();
    stopPlaybackWatcher = null;
    stopLoadedWatcher?.();
    stopLoadedWatcher = null;
  });
}
