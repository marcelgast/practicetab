import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import {
  getAudioPositionMs,
  type AudioTabEvent,
} from '../services/audioTabCommands';
import { isTauri } from '../services/libraryFileOps';
import {
  buildExpectedNoteTimeline,
  type ExpectedNoteTimeline,
  type RawNoteEvent,
  type RawNoteEventKind,
} from '../domain/expectedNoteTimeline';
import {
  STRICTNESS_PRESETS,
  isStreakWorthy,
  type NoteResult,
  type StrictnessPreset,
} from '../domain/noteComparison';
import { NoteComparisonEngine } from '../domain/noteComparisonEngine';
import type { BeatRectangle } from '../services/player/beatRectIndex';
import { getStoredJson, setStoredJson } from '../domain/storage';
import { usePitchDetectionStore } from './pitchDetection';

const STRICTNESS_STORAGE_KEY = 'practicetab:note-recognition:strictness';
const STRICTNESS_VALUES: readonly StrictnessPreset[] = [
  'beginner',
  'intermediate',
  'pro',
];

function loadPersistedStrictness(): StrictnessPreset {
  const raw = getStoredJson<string | null>(STRICTNESS_STORAGE_KEY, null);
  if (raw && (STRICTNESS_VALUES as readonly string[]).includes(raw)) {
    return raw as StrictnessPreset;
  }
  return 'beginner';
}

/**
 * Converts the service-layer `AudioTabEvent[]` to the minimal `RawNoteEvent[]`
 * the pure domain builder needs. Filters to the three event kinds the builder
 * cares about; everything else (program_change, control_change, etc.) is
 * dropped.
 */
function toRawNoteEvents(events: readonly AudioTabEvent[]): RawNoteEvent[] {
  const result: RawNoteEvent[] = [];
  for (const event of events) {
    const { kind } = event;
    let mappedKind: RawNoteEventKind | null = null;
    if (kind.type === 'note_on') {
      mappedKind = { type: 'note_on', key: kind.key, vibrato: kind.vibrato };
    } else if (kind.type === 'note_off') {
      mappedKind = { type: 'note_off', key: kind.key };
    } else if (kind.type === 'pitch_bend') {
      mappedKind = { type: 'pitch_bend', value: kind.value, label: kind.label };
    }
    if (mappedKind) {
      result.push({
        atMs: event.atMs,
        trackId: event.trackId,
        channel: event.channel,
        kind: mappedKind,
      });
    }
  }
  return result;
}

/**
 * View-model store for the expected-note recognition pipeline.
 *
 * Responsibilities:
 * - Cache the raw note events from the last MIDI rebuild so the timeline can
 *   be cheaply rebuilt when only the tempo factor or active track changes.
 * - Hold the `NoteComparisonEngine` and orchestrate pitch→engine→results.
 * - Maintain `currentPositionMs` via RAF polling of `getAudioPositionMs()`
 *   (the same polling path used by the player transport loop).
 * - Hold the `beatPositionCache` for future overlay rendering (PR 3.6+).
 *
 * The comparison logic lives in `src/domain/noteComparisonEngine.ts` and
 * `src/domain/noteComparison.ts`. This store only orchestrates.
 */
export const useNoteRecognitionStore = defineStore('noteRecognition', () => {
  const timeline = shallowRef<ExpectedNoteTimeline | null>(null);
  const currentPositionMs = ref(0);
  /**
   * Overlay beat-rect index. Keyed by **raw 1×-speed startMs** so the cache
   * is invariant across speed-trainer tempoFactor changes. The overlay
   * converts at lookup time via `expectedNote.startMs * timeline.tempoFactor`.
   * Populated via `updateBeatCache` after every AlphaTab `renderFinished`.
   */
  const beatPositionCache = shallowRef<ReadonlyMap<number, BeatRectangle>>(
    new Map(),
  );

  // Note-comparison results — consumed by the overlay (PR 3.6+)
  const noteResults = shallowRef<NoteResult[]>([]);
  const isComparing = ref(false);
  const strictnessPreset = ref<StrictnessPreset>(loadPersistedStrictness());
  /**
   * Master switch for the live-feedback pipeline. While `false`, the overlay
   * stays hidden, pitch detection is not requested, and `startComparison` is
   * a no-op. Toggled by `FeedbackToggle.vue` (Step 5).
   */
  const feedbackEnabled = ref(false);

  // Streak counters. `currentStreak` resets on every `startComparison`
  // (each play press starts a fresh run) and on `setFeedbackEnabled`
  // toggles in either direction. `bestStreak` is session-scoped (per
  // tab session — i.e. resets in `clearTimeline`, NOT on the feedback
  // toggle): toggling feedback off mid-practice to focus on a hard
  // section and back on shouldn't wipe the user's session high.
  // Neither is persisted — both map to the current practice session.
  const currentStreak = ref(0);
  const bestStreak = ref(0);

  /**
   * Rough "you might want to check your tuning" heuristic. Fires once we
   * have enough data to be confident (≥6 hits with a measured pitch) and
   * more than half of them landed in the `wrong` pitch band. Both
   * conditions together are very hard to hit by accident — either the
   * guitar really is out of tune, the mic is picking up a wrong string,
   * or the input device is the wrong one.
   */
  const TUNING_SUGGEST_MIN_SAMPLES = 6;
  const TUNING_SUGGEST_WRONG_RATIO = 0.5;
  const shouldSuggestTuning = computed(() => {
    if (!feedbackEnabled.value) return false;
    const hits = noteResults.value.filter(
      (r) => r.outcome === 'hit' && r.pitchAccuracy !== null,
    );
    if (hits.length < TUNING_SUGGEST_MIN_SAMPLES) return false;
    const wrong = hits.filter((r) => r.pitchAccuracy === 'wrong').length;
    return wrong / hits.length > TUNING_SUGGEST_WRONG_RATIO;
  });

  function appendResults(results: readonly NoteResult[]): void {
    if (results.length === 0) return;
    noteResults.value = [...noteResults.value, ...results];
    for (const r of results) {
      if (isStreakWorthy(r)) {
        currentStreak.value += 1;
        if (currentStreak.value > bestStreak.value) {
          bestStreak.value = currentStreak.value;
        }
      } else {
        currentStreak.value = 0;
      }
    }
  }

  // Cached build context — kept so tempo and track changes can rebuild
  // without re-receiving the full event list.
  const cachedRawEvents = shallowRef<RawNoteEvent[]>([]);
  const cachedActiveTrackIndex = ref<number>(0);
  const cachedTempoFactor = ref<number>(1);

  // RAF handle, in-flight guard, and generation counter for the position
  // polling loop. The generation is incremented on every stop so that
  // in-flight IPC promises can detect they are stale and discard their result.
  let rafHandle: number | null = null;
  let syncInFlight = false;
  let pollGeneration = 0;

  // `performance.now()` captured at `startComparison`. Used by the pitch
  // watcher to estimate audio position via wall-clock elapsed time
  // while the Rust engine is still returning `null` from
  // `getAudioPositionMs` (the ~500ms boot window). Reset on stop so a
  // new run starts with a fresh reference.
  let comparisonStartedAtWallClock: number | null = null;
  // Wall-clock duration of the most recently completed run, in ms.
  // Captured in `stopComparison`; consumed by the stats-persistence
  // path which wants the real elapsed practice time, not the
  // musical length of the tab. `0` when no run has finished.
  const lastRunDurationMs = ref(0);

  // Engine is a stable instance; its internal state is reset on play/stop.
  const engine = new NoteComparisonEngine();

  // ---------------------------------------------------------------------------
  // Timeline management
  // ---------------------------------------------------------------------------

  /**
   * Called by the player layer whenever `rebuildMidi` completes.
   * Stores the raw events and rebuilds the timeline for the active track.
   */
  function onMidiRebuilt(
    events: readonly AudioTabEvent[],
    activeTrackIndex: number | null,
    tempoFactor: number,
  ): void {
    const trackIndex = activeTrackIndex ?? 0;
    const raw = toRawNoteEvents(events);
    cachedRawEvents.value = raw;
    cachedActiveTrackIndex.value = trackIndex;
    cachedTempoFactor.value = tempoFactor;
    const built = buildExpectedNoteTimeline(raw, trackIndex, tempoFactor);
    timeline.value = built;
    engine.setTimeline(built);
  }

  /**
   * Called when the user changes the active track. Rebuilds the timeline for
   * the new track using the cached events and tempo factor.
   */
  function buildForTrack(activeTrackIndex: number): void {
    cachedActiveTrackIndex.value = activeTrackIndex;
    if (cachedRawEvents.value.length === 0) return;
    const built = buildExpectedNoteTimeline(
      cachedRawEvents.value,
      activeTrackIndex,
      cachedTempoFactor.value,
    );
    timeline.value = built;
    engine.setTimeline(built);
  }

  /**
   * Called when the speed-trainer tempo factor changes. Rescales all note
   * timestamps without re-receiving the full event list from the player.
   */
  function rescaleTimeline(tempoFactor: number): void {
    cachedTempoFactor.value = tempoFactor;
    if (cachedRawEvents.value.length === 0) return;
    const built = buildExpectedNoteTimeline(
      cachedRawEvents.value,
      cachedActiveTrackIndex.value,
      tempoFactor,
    );
    timeline.value = built;
    engine.setTimeline(built);
  }

  /** Drop all timeline and comparison data. Called when a tab is unloaded. */
  function clearTimeline(): void {
    stopPositionSync();
    timeline.value = null;
    currentPositionMs.value = 0;
    cachedRawEvents.value = [];
    noteResults.value = [];
    currentStreak.value = 0;
    bestStreak.value = 0;
    isComparing.value = false;
    beatPositionCache.value = new Map();
    // Feedback is opt-in per tab: swapping to a new tab should drop the
    // toggle so the user has to consciously enable comparison for the
    // new piece (avoids stale state bleeding across tabs).
    feedbackEnabled.value = false;
    engine.setTimeline(null);
    engine.reset();
  }

  // ---------------------------------------------------------------------------
  // Comparison lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start real-time note comparison. Call on playback start.
   * Resets the engine so results from a previous run don't carry over, and
   * starts polling the audio engine position so the engine's playhead
   * advances with actual wall-clock time.
   *
   * No-op while `feedbackEnabled` is false so the many transport callers in
   * `playbackControl` don't start the comparison pipeline behind the
   * overlay's back — when the Feedback toggle is off the store stays
   * idle regardless of who calls this.
   */
  function startComparison(): void {
    if (!feedbackEnabled.value) return;
    noteResults.value = [];
    currentStreak.value = 0;
    // bestStreak is session-scoped — keep across play/pause cycles.
    engine.reset();
    engine.setTimeline(timeline.value);
    engine.setStrictness(STRICTNESS_PRESETS[strictnessPreset.value]);
    isComparing.value = true;
    // Wall-clock reference used by the pitch watcher to estimate the
    // audio position during the first ~500ms of playback, while the
    // Rust engine's `getAudioPositionMs` poll still returns `null`.
    // Without this, pitch events that land in the first note's window
    // arrive with `currentPositionMs=0` (stale), bypass the active
    // window, and the first note scores as missed even when the user
    // played it. Cross-platform: CoreAudio + WASAPI + WDM-KS all have
    // this null-position warmup.
    comparisonStartedAtWallClock = performance.now();
    startPositionSync();
  }

  /**
   * Stop real-time note comparison. Call on playback stop/pause.
   * Stops the position subscription and keeps results in `noteResults` so
   * the overlay can show them after playback ends.
   */
  function stopComparison(): void {
    if (comparisonStartedAtWallClock !== null) {
      lastRunDurationMs.value = Math.max(
        0,
        performance.now() - comparisonStartedAtWallClock,
      );
    }
    isComparing.value = false;
    stopPositionSync();
    comparisonStartedAtWallClock = null;
  }

  /**
   * Change the active strictness preset and persist the choice.
   * Takes effect on the next `startComparison` (the engine reads the
   * preset when it is (re-)seeded, so mid-run changes are intentional no-ops).
   */
  function setStrictness(preset: StrictnessPreset): void {
    if (strictnessPreset.value === preset) return;
    strictnessPreset.value = preset;
    setStoredJson(STRICTNESS_STORAGE_KEY, preset);
  }

  /**
   * Push the player's current transposition (in semitones, -12..+12)
   * down into the engine. Called whenever the tuning changes so that
   * subsequent pitch comparisons use the tuned expected frequency
   * rather than the tab's written MIDI pitch. Safe to call even when
   * no comparison is running — the engine just stores the value.
   */
  function setTuningSemitones(semitones: number): void {
    engine.setTuningSemitones(semitones);
  }

  /**
   * Toggle the live-feedback pipeline on/off.
   * - Enabling is idempotent — the overlay component observes `feedbackEnabled`
   *   and decides whether to paint.
   * - Disabling stops any active comparison and clears accumulated results so
   *   the overlay clears immediately.
   */
  function setFeedbackEnabled(enabled: boolean): void {
    if (feedbackEnabled.value === enabled) return;
    feedbackEnabled.value = enabled;
    // Clear accumulated results regardless of direction — on enable we
    // don't want stale cells from a previous session flashing up as
    // pre-coloured mid-bar (the bar should start as one solid pending
    // strip until the user actually plays).
    noteResults.value = [];
    currentStreak.value = 0;
    // `bestStreak` is intentionally NOT reset here — see the field
    // declaration. Tab-level resets happen in `clearTimeline`.
    if (!enabled) stopComparison();
  }

  // ---------------------------------------------------------------------------
  // Pitch → engine (driven by pitchDetection store)
  // ---------------------------------------------------------------------------

  // Watch the pitch store's currentPitch and forward to the engine while
  // comparison is active. The watch runs inside the store setup so it is
  // automatically stopped when the store is disposed.
  const pitchStore = usePitchDetectionStore();
  watch(
    () => pitchStore.currentPitch,
    (pitch) => {
      if (!isComparing.value || pitch === null) return;
      // Use wall-clock elapsed as a fallback position while the Rust
      // engine is still warming up (~500ms of null/0 position at the
      // start of every run). Without this, pitch events produced
      // inside the first note's window are tagged with positionMs=0,
      // bypass the active-window check in `updateTrackedNote`, and
      // the first note silently misses. Safe to keep applying after
      // the real position arrives: `currentPositionMs.value` then
      // matches wall-clock elapsed closely and dominates the max().
      let pitchPositionMs = currentPositionMs.value;
      if (comparisonStartedAtWallClock !== null) {
        const elapsed = performance.now() - comparisonStartedAtWallClock;
        if (elapsed > pitchPositionMs) pitchPositionMs = elapsed;
      }
      const results = engine.processPitchResult(pitch, pitchPositionMs);
      appendResults(results);
    },
  );

  // ---------------------------------------------------------------------------
  // Beat-position cache (populated after renderFinished, used by overlay)
  // ---------------------------------------------------------------------------

  /**
   * Replace the overlay beat-rect cache. Accepts a `ReadonlyMap` directly so
   * the player service can hand over its own map without an intermediate
   * array round-trip. The store takes a snapshot (new Map) so upstream
   * mutations don't leak into the reactive value.
   */
  function updateBeatCache(
    rectsByStartMs: ReadonlyMap<number, BeatRectangle>,
  ): void {
    beatPositionCache.value = new Map(rectsByStartMs);
  }

  // ---------------------------------------------------------------------------
  // Playback position polling
  // ---------------------------------------------------------------------------

  function updatePosition(ms: number): void {
    currentPositionMs.value = ms;
    if (!isComparing.value) return;
    const results = engine.advancePlayhead(ms);
    appendResults(results);
  }

  /**
   * Starts a RAF-based polling loop that reads the audio engine position via
   * `getAudioPositionMs()` — the same command used by the player transport
   * loop. Non-blocking: concurrent polls are coalesced via `syncInFlight`.
   *
   * No-op outside the Tauri runtime (tests, Vite dev server). Callers can
   * still drive `updatePosition()` directly in that case.
   */
  function startPositionSync(): void {
    if (rafHandle !== null) return;
    if (!isTauri() || typeof requestAnimationFrame === 'undefined') return;
    const gen = ++pollGeneration;
    function tick() {
      if (!isComparing.value || pollGeneration !== gen) {
        rafHandle = null;
        return;
      }
      if (!syncInFlight) {
        syncInFlight = true;
        void getAudioPositionMs()
          .then((ms) => {
            // Discard stale results from before a stop/restart.
            if (ms !== null && isComparing.value && pollGeneration === gen) {
              updatePosition(ms);
            }
          })
          .finally(() => {
            if (pollGeneration === gen) syncInFlight = false;
          });
      }
      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);
  }

  function stopPositionSync(): void {
    pollGeneration++; // invalidate any in-flight IPC promise
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    syncInFlight = false;
    currentPositionMs.value = 0;
  }

  return {
    timeline,
    currentPositionMs,
    beatPositionCache,
    noteResults,
    isComparing,
    strictnessPreset,
    feedbackEnabled,
    currentStreak,
    bestStreak,
    lastRunDurationMs,
    shouldSuggestTuning,
    onMidiRebuilt,
    buildForTrack,
    rescaleTimeline,
    clearTimeline,
    startComparison,
    stopComparison,
    setStrictness,
    setTuningSemitones,
    setFeedbackEnabled,
    updateBeatCache,
    updatePosition,
    startPositionSync,
    stopPositionSync,
  };
});
