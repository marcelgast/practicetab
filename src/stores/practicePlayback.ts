import { defineStore } from 'pinia';
import { ref } from 'vue';
import { practicePersistence } from '../services/practicePersistence';
import { usePracticeUiStore } from './practiceUi';

/**
 * Playback time tracker. Accumulates actual audio/tab/metronome playback
 * seconds (as opposed to `practiceTimer` which counts any time the session
 * is running and `practice.ts` which counts exercise-selected time).
 *
 * Routing:
 *  - When an exercise is expanded: increments
 *    `practice_session_exercises.playback_time_seconds` for that exercise.
 *  - When no exercise is expanded: only session-level
 *    `practice_sessions.total_playback_seconds` is incremented.
 *
 * The watcher that starts/stops this tracker (player/song/metronome state)
 * lives in a composable initialised once at the app shell level — see
 * `initPlaybackTimerWatcher` in `App.vue`.
 */
export const usePracticePlaybackStore = defineStore('practicePlayback', () => {
  const isTracking = ref(false);
  const lastTickMs = ref<number | null>(null);
  const tickIntervalId = ref<number | null>(null);

  function tick(): void {
    const last = lastTickMs.value;
    if (!last) return;
    const now = Date.now();
    const deltaSec = Math.floor((now - last) / 1000);
    if (deltaSec <= 0) return;
    lastTickMs.value = last + deltaSec * 1000;
    const uiStore = usePracticeUiStore();
    void practicePersistence.addPlaybackTime(
      uiStore.expandedExerciseId,
      deltaSec,
    );
  }

  function start(): void {
    if (isTracking.value) return;
    isTracking.value = true;
    lastTickMs.value = Date.now();
    if (!tickIntervalId.value) {
      tickIntervalId.value = window.setInterval(tick, 1000);
    }
  }

  function stop(): void {
    if (!isTracking.value) return;
    tick();
    isTracking.value = false;
    lastTickMs.value = null;
    if (tickIntervalId.value) {
      window.clearInterval(tickIntervalId.value);
      tickIntervalId.value = null;
    }
  }

  return {
    isTracking,
    start,
    stop,
  };
});
