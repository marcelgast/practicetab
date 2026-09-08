import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  EmaSmoother,
  REFERENCE_A4_MAX_HZ,
  REFERENCE_A4_MIN_HZ,
  centsToBarPosition,
  classifyAccuracy,
  frequencyToNote,
  type TunerAccuracy,
} from '../domain/tuner';
import { usePitchDetectionStore } from './pitchDetection';

/**
 * View-model store for the tuner modal.
 *
 * Responsibilities:
 * - Orchestrate the underlying pitch detection store (start / stop).
 * - Recompute note name + cent offset from the raw frequency using the
 *   user's A4 reference. The Rust backend hardcodes A4 = 440 in
 *   `note.rs`, so we ignore `result.noteName` / `result.centsOffset`
 *   whenever the reference isn't 440 — otherwise the display would lie
 *   about whether the string is in tune.
 * - Smooth the recomputed cent offset with an EMA so the indicator
 *   doesn't jitter, resetting on onset / note change so new notes snap.
 *
 * Pure math lives in `src/domain/tuner.ts` and is unit-tested there.
 */
const DEFAULT_REFERENCE_A4 = 440;

export const usePitchTunerStore = defineStore('tuner', () => {
  const pitchStore = usePitchDetectionStore();

  const isActive = ref(false);
  const currentNote = ref('');
  const centsOffset = ref(0);
  const referenceA4 = ref<number>(DEFAULT_REFERENCE_A4);

  // Window of 24 ≈ 280 ms of readings at the default 11.6 ms hop. The
  // smoother still resets on onset / note change, so a real note change
  // snaps quickly, but frame-to-frame cent jitter is visibly damped
  // around the centre.
  const smoother = new EmaSmoother(24);
  let lastNote = '';

  const accuracy = computed<TunerAccuracy>(() =>
    currentNote.value ? classifyAccuracy(centsOffset.value) : 'off',
  );
  const barPosition = computed(() =>
    currentNote.value ? centsToBarPosition(centsOffset.value) : 0.5,
  );

  // React to new pitch observations from the backend. A fresh onset or a
  // change of detected note resets the smoother so the indicator snaps
  // to the new value instead of drifting across it.
  watch(
    () => pitchStore.currentPitch,
    (result) => {
      if (!isActive.value || !result) return;
      if (result.frequency <= 0) {
        // Silent frame — drop the last reading so the tuner doesn't
        // pretend the user is still holding the previous note. The
        // smoother is re-seeded so the next pitched frame snaps to its
        // real value instead of interpolating from the stale one.
        clearReading();
        return;
      }
      // Recompute against the user's reference so a non-440 Hz A4
      // shows the correct note + cent offset. Falls back cleanly to
      // the backend numbers when reference == 440.
      const reading = frequencyToNote(result.frequency, referenceA4.value);
      if (!reading.noteName) {
        clearReading();
        return;
      }
      if (result.onsetDetected || reading.noteName !== lastNote) {
        smoother.reset();
        lastNote = reading.noteName;
      }
      currentNote.value = reading.noteName;
      centsOffset.value = smoother.push(reading.centsOffset);
    },
  );

  function resetReadings(): void {
    smoother.reset();
    lastNote = '';
    currentNote.value = '';
    centsOffset.value = 0;
  }

  // Drop the current reading when the backend reports a silent or
  // unidentifiable frame. Idempotent so repeat silent frames don't
  // re-fire watchers once the tuner is already cleared.
  function clearReading(): void {
    if (currentNote.value === '' && centsOffset.value === 0) return;
    currentNote.value = '';
    centsOffset.value = 0;
    smoother.reset();
    lastNote = '';
  }

  async function start(): Promise<void> {
    if (isActive.value) return;
    resetReadings();
    await pitchStore.start();
    isActive.value = true;
  }

  async function stop(): Promise<void> {
    if (!isActive.value) return;
    isActive.value = false;
    resetReadings();
    await pitchStore.stop();
  }

  async function toggle(): Promise<void> {
    if (isActive.value) {
      await stop();
    } else {
      await start();
    }
  }

  /**
   * Accepts any finite float in
   * `[REFERENCE_A4_MIN_HZ, REFERENCE_A4_MAX_HZ]`. Values outside the
   * bounds (or non-finite) are ignored — callers should validate via
   * `parseReferenceA4` for UI input.
   */
  function setReferenceA4(hz: number): void {
    if (!Number.isFinite(hz)) return;
    if (hz < REFERENCE_A4_MIN_HZ || hz > REFERENCE_A4_MAX_HZ) return;
    referenceA4.value = hz;
    // Re-seed the smoother so the indicator snaps to the new tuning
    // rather than interpolating from the previous reference.
    smoother.reset();
    lastNote = '';
  }

  return {
    isActive,
    currentNote,
    centsOffset,
    referenceA4,
    accuracy,
    barPosition,
    start,
    stop,
    toggle,
    setReferenceA4,
  };
});
