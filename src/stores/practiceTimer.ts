import { defineStore } from 'pinia';
import { ref } from 'vue';
import { practicePersistence } from '../services/practicePersistence';

/**
 * Global practice timer — "the session". Counts the total time the user is
 * actively practicing from when they start it (manually via the bottom-bar
 * button, shortcut T, or automatically when playback / exercise expansion
 * happens first). Persisted into `practice_sessions.total_time_spent_seconds`.
 *
 * Design notes:
 *  - Ticks at 1 Hz and flushes the delta to the DB every tick. No in-memory
 *    buffer longer than one second, so a hard kill loses at most one second
 *    and the DB is always the source of truth.
 *  - Never auto-stops. Once running, only the user can pause it.
 *  - Independent from the per-exercise timer (`practice.ts`) and the
 *    playback timer (`practicePlayback.ts`). Same tick loop cadence but
 *    different semantics — see the PR description.
 */
export const usePracticeTimerStore = defineStore('practiceTimer', () => {
  const isRunning = ref(false);
  const elapsedSec = ref(0);
  const lastTickMs = ref<number | null>(null);
  const tickIntervalId = ref<number | null>(null);

  // Track in-flight persistence writes so `stop()` / `flushAndStop()` can
  // await them before returning. Without this the graceful-close pipeline
  // in App.vue would invoke `confirm_close` while a 1 Hz tick's invoke is
  // still in the Tauri IPC queue — the process exits and the write drops.
  const pendingWrites = new Set<Promise<void>>();

  function schedulePersist(result: Promise<void> | void): void {
    // Coerce in case a mocked adapter returns undefined synchronously —
    // the live persistence always returns a Promise, but tests may stub
    // the shape away.
    const promise = Promise.resolve(result);
    pendingWrites.add(promise);
    // Remove from the pending set on both outcomes. Using .then() with an
    // onRejected handler — rather than .finally() — swallows the
    // rejection in place of producing a new rejecting promise that would
    // bubble up to the global unhandledrejection hook. stop() still
    // observes the failure via Promise.allSettled on `pendingWrites`
    // before it resolves.
    void promise.then(
      () => {
        pendingWrites.delete(promise);
      },
      () => {
        pendingWrites.delete(promise);
      },
    );
  }

  function tick(): void {
    const last = lastTickMs.value;
    if (!last) return;
    const now = Date.now();
    const deltaSec = Math.floor((now - last) / 1000);
    if (deltaSec <= 0) return;
    lastTickMs.value = last + deltaSec * 1000;
    elapsedSec.value += deltaSec;
    schedulePersist(practicePersistence.addSessionTime(deltaSec));
  }

  function start(): void {
    if (isRunning.value) return;
    isRunning.value = true;
    lastTickMs.value = Date.now();
    if (!tickIntervalId.value) {
      tickIntervalId.value = window.setInterval(tick, 1000);
    }
  }

  async function stop(): Promise<void> {
    if (!isRunning.value) return;
    // Flush the final partial second before teardown.
    tick();
    isRunning.value = false;
    lastTickMs.value = null;
    if (tickIntervalId.value) {
      window.clearInterval(tickIntervalId.value);
      tickIntervalId.value = null;
    }
    // Wait for every persistence write kicked off while running (including
    // the one just scheduled by the final tick) to finish — guarantees the
    // caller that the DB reflects everything counted in `elapsedSec` once
    // stop() resolves. Uses allSettled so a single rejected write can't
    // leak out of the shutdown path.
    if (pendingWrites.size > 0) {
      await Promise.allSettled([...pendingWrites]);
    }
  }

  async function toggle(): Promise<void> {
    if (isRunning.value) {
      await stop();
    } else {
      start();
    }
  }

  /**
   * Called from the graceful-close pipeline (`app-closing` event from Rust).
   * Runs a final flush and waits for every in-flight persistence write so
   * `confirm_close` can't fire until the DB has the last second.
   */
  async function flushAndStop(): Promise<void> {
    if (!isRunning.value) {
      // Not running, but an earlier tick's write may still be in flight
      // after a user-initiated stop. Flush whatever's pending.
      if (pendingWrites.size > 0) {
        await Promise.allSettled([...pendingWrites]);
      }
      return;
    }
    await stop();
  }

  function resetElapsed(): void {
    elapsedSec.value = 0;
  }

  return {
    isRunning,
    elapsedSec,
    start,
    stop,
    toggle,
    flushAndStop,
    resetElapsed,
  };
});
