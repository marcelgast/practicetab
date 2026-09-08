<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useLibraryStore } from '../../stores/library';
import { usePlayerStore } from '../../stores/player';
import { useNoteRecognitionStore } from '../../stores/noteRecognition';
import { useMetronomeStore } from '../../stores/metronome';
import { useBeatmapStore } from '../../stores/beatmap';
import { usePracticeStore } from '../../stores/practice';
import { useStatsStore } from '../../stores/stats';
import { useUiStore } from '../../stores/ui';
import { useSongStore } from '../../stores/song';
import {
  buildFeedbackSummary,
  serializeNoteDetails,
} from '../../domain/feedbackSummary';
import { recordFeedbackRun } from '../../services/feedbackRunCommands';
import { getStoredWaveform } from '../../services/audioDecodeService';
import {
  alphatabPlayer,
  ALPHATAB_FONT_CHECK_FILE,
  getAlphaTabFontDirectory,
} from '../../services/alphatabPlayer';
import { isValidCursorRect } from '../../domain/playhead';
import IconMenuMetronome from '../icons/IconMenuMetronome.vue';

import FeedbackStreakBadge from './FeedbackStreakBadge.vue';
import FeedbackSummaryDialog from './FeedbackSummaryDialog.vue';
import FeedbackToggle from './FeedbackToggle.vue';
import FretboardControl from './FretboardControl.vue';
import FretboardPanel from './FretboardPanel.vue';
import NoteResultOverlay from './NoteResultOverlay.vue';
import PlayerBottomBar from './PlayerBottomBar.vue';
import SongBar from './SongBar.vue';
import TrackControl from './TrackControl.vue';
import TuningControl from './TuningControl.vue';
import TunerToggle from './TunerToggle.vue';
import VolumeControl from './VolumeControl.vue';
import DisplayControl from './DisplayControl.vue';
import CloseTabButton from './CloseTabButton.vue';
import { useTicker } from '../../services/useTicker';
import { useAlphaSelection } from './useAlphaSelection';
import { useAutoFollow } from './useAutoFollow';
import { appendDevLog } from '../../services/devLog';

const playerStore = usePlayerStore();
const noteRecognitionStore = useNoteRecognitionStore();
const libraryStore = useLibraryStore();
const metronomeStore = useMetronomeStore();
const beatmapStore = useBeatmapStore();
const practiceStore = usePracticeStore();
const statsStore = useStatsStore();
const uiStore = useUiStore();
const songStore = useSongStore();
const songPeaks = ref<number[]>([]);
const showSongWaveform = computed(
  () => songStore.isLoaded && !playerStore.model.currentLibraryItemId,
);
const containerRef = ref<HTMLDivElement | null>(null);
const alphaAreaRef = ref<HTMLDivElement | null>(null);
const lastLoadedId = ref<string | null>(null);
const vibratoDebugActive = computed(
  () => import.meta.env.DEV && uiStore.showVibratoDebug,
);
const defaultVibratoInfo = {
  active: false,
  depthCents: 12,
  rateHz: 5.2,
};
const vibratoDebugInfo = ref(
  typeof alphatabPlayer.getVibratoDebugInfo === 'function'
    ? alphatabPlayer.getVibratoDebugInfo()
    : defaultVibratoInfo,
);
const vibratoTick = useTicker(vibratoDebugActive, 250);

watch(vibratoTick, () => {
  if (!vibratoDebugActive.value) {
    return;
  }
  vibratoDebugInfo.value =
    typeof alphatabPlayer.getVibratoDebugInfo === 'function'
      ? alphatabPlayer.getVibratoDebugInfo()
      : defaultVibratoInfo;
});

const currentItem = computed(() => {
  const id = playerStore.model.currentLibraryItemId;
  return id
    ? (libraryStore.items.find((item) => item.id === id) ?? null)
    : null;
});

const status = computed(() => playerStore.model.status);
const playback = computed(() => playerStore.model.playback);
const hasSelection = computed(() => Boolean(currentItem.value));
const isPlaying = computed(() => playback.value === 'playing');
const isLoopEnabled = computed(() => playerStore.isLoopEnabled);
const autoFollowEnabled = computed(() => playerStore.autoFollowEnabled);
const intervalModeActive = computed(() => metronomeStore.intervalModeEnabled);
const overlayLocked = computed(() => playerStore.overlayLocked);
const horizontalLayout = computed(() => playerStore.horizontalLayout);
const currentScoreTitle = computed(() => playerStore.currentScoreTitle);
const feedbackEnabled = computed(() => noteRecognitionStore.feedbackEnabled);
const feedbackSummaryOpen = ref(false);
const footerObserver = ref<MutationObserver | null>(null);
const trackControlRef = ref<InstanceType<typeof TrackControl> | null>(null);
const tuningControlRef = ref<InstanceType<typeof TuningControl> | null>(null);
const volumeControlRef = ref<InstanceType<typeof VolumeControl> | null>(null);
const displayControlRef = ref<InstanceType<typeof DisplayControl> | null>(null);
const fretboardControlRef = ref<InstanceType<typeof FretboardControl> | null>(
  null,
);
const fretboardOpen = computed(() => playerStore.fretboardOpen);

const autoFollow = useAutoFollow({
  containerRef,
  alphaAreaRef,
  playerStore,
  autoFollowEnabled,
  playback,
});

const {
  layoutWarning,
  handleScroll,
  handleCursorRect,
  updateLayoutWarning,
  resolveScrollContainer,
  resetScoreScroll,
  cleanupTimer,
} = autoFollow;

const selection = useAlphaSelection({
  containerRef,
  alphaAreaRef,
  playerStore,
  metronomeStore,
  hasSelection,
  isPlaying,
  status,
  isLoopEnabled,
  overlayLocked,
});

const {
  selectionBlocks,
  suppressNextClick,
  suppressNextPointerDown,
  suppressSelectionHighlights,
  waitForFrame,
  handlePlayheadClick,
  handleAlphaPointerDown,
  handleAlphaPointerMove,
  handleAlphaPointerUp,
  handleBeatMouseDown,
  handleBeatMouseMove,
  handleBeatMouseUp,
  resetSelection,
  onPlaybackRangeHighlightChanged,
  onLoopDisabled,
} = selection;

function isAnyOverlayOpen(): boolean {
  // Intentionally excludes `fretboardControlRef`: the Fretboard
  // Panel is a persistent view overlay that only closes on
  // playback start, manual toggle, or tab change (see watcher
  // below). Tracking it here would (a) trip the overlay-mask,
  // blocking seek clicks, and (b) let the Esc / outside-click
  // handlers dismiss it — neither is the product behaviour.
  return Boolean(
    trackControlRef.value?.isOpen ||
    tuningControlRef.value?.isOpen ||
    volumeControlRef.value?.isOpen ||
    displayControlRef.value?.isOpen,
  );
}

function updateOverlayLock(): void {
  playerStore.setOverlayLock(isAnyOverlayOpen());
}

function closeAllOverlays(): void {
  // See note in `isAnyOverlayOpen` — fretboard is intentionally
  // independent. It closes on its own triggers only.
  trackControlRef.value?.close();
  tuningControlRef.value?.close();
  volumeControlRef.value?.close();
  displayControlRef.value?.close();
}

function handleOverlayKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeAllOverlays();
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isAnyOverlayOpen()) {
    return;
  }
  const target = event.target as Node | null;
  const trackOverlay = document.querySelector('.track-overlay');
  const tuningOverlay = document.querySelector('.tuning-overlay');
  const volumeOverlay = document.querySelector('.volume-overlay');
  const displayOverlay = document.querySelector('.display-overlay');
  if (
    trackOverlay?.contains(target ?? null) ||
    tuningOverlay?.contains(target ?? null) ||
    volumeOverlay?.contains(target ?? null) ||
    displayOverlay?.contains(target ?? null) ||
    (event.target instanceof HTMLElement &&
      (event.target.closest('.track-trigger') !== null ||
        event.target.closest('.tuning-trigger') !== null ||
        event.target.closest('.volume-trigger') !== null ||
        event.target.closest('.display-trigger') !== null))
  ) {
    return;
  }
  suppressNextPointerDown.value = true;
  suppressNextClick.value = true;
  closeAllOverlays();
}

function handleOverlayMaskPointerDown(): void {
  suppressNextPointerDown.value = true;
  suppressNextClick.value = true;
  closeAllOverlays();
}

function ensureLoaded(): void {
  const item = currentItem.value;
  if (!item) {
    lastLoadedId.value = null;
    resetSelection();
    return;
  }
  const isNewItem = lastLoadedId.value !== item.id;
  if (isNewItem) {
    resetSelection();
  }
  if (status.value === 'loading') {
    lastLoadedId.value = item.id;
    return;
  }
  if (lastLoadedId.value === item.id && status.value !== 'error') {
    return;
  }
  selectionBlocks.value = [];
  alphatabPlayer.clearPlaybackRangeHighlight();
  alphatabPlayer.clearPlaybackRange();
  lastLoadedId.value = item.id;
  void playerStore.openLibraryItem(item);
}

function handleRetry(): void {
  if (!currentItem.value) {
    return;
  }
  void playerStore.openLibraryItem(currentItem.value);
}

/**
 * Redirect vertical wheel events to horizontal scrolling when the
 * one-liner layout is active. The tab is a single row wide and has
 * no vertical scroll to give, so a mouse wheel "down" should
 * advance the tab to the right and "up" should rewind left. Without
 * this a trackpad scroll in one-liner mode feels broken (scrolls
 * nothing). Only intercepts when the event has a non-trivial
 * deltaY; horizontal trackpad gestures (deltaX) pass through
 * untouched.
 */
function handleAlphaWheel(event: WheelEvent): void {
  if (!playerStore.horizontalLayout) return;
  if (event.deltaY === 0) return;
  const scroller = event.currentTarget as HTMLElement | null;
  if (!scroller) return;
  event.preventDefault();
  scroller.scrollLeft += event.deltaY;
}

/**
 * AlphaTab sets `.at-surface { width: totalWidth px; overflow: hidden }`
 * on every render, but its computed `totalWidth` undercounts the
 * real content in horizontal-layout mode (last-bar cutoff — confirmed
 * by the dev-log diag showing surface.scrollWidth ≫ surface.offsetWidth).
 *
 * Its children are `position: absolute`, so `width: max-content` in
 * CSS doesn't help — absolute children don't contribute to intrinsic
 * width. The browser still computes `scrollWidth` correctly from the
 * rightmost absolute child, so we programmatically widen the surface
 * to match. Call this after every render/cache refresh.
 *
 * No-op in page layout — that mode's widths are already correct.
 */
function resizeAlphaTabSurface(): void {
  const container = containerRef.value;
  if (!container) return;
  const surface = container.querySelector<HTMLElement>('.at-surface');
  if (!surface) return;
  if (!playerStore.horizontalLayout) {
    // Page (multi-line) layout — alphatab manages the surface size
    // itself. Clear ANY inline overrides we might have applied
    // during a prior horizontal session: leftover `width: 9999px`
    // + `overflow: visible` would otherwise force the surface
    // wider than the container, which produces a stray horizontal
    // scrollbar in page mode (Marcel's bug report). Resetting these
    // lets the next `.alpha-area--page` overflow rule do its job.
    if (surface.style.width || surface.style.overflow) {
      surface.style.width = '';
      surface.style.overflow = '';
    }
    return;
  }
  // `scrollWidth` reflects the rightmost edge of all descendants,
  // absolute-positioned or not. If it exceeds the inline-styled
  // width, AlphaTab under-sized the surface — fix it.
  const needed = surface.scrollWidth;
  const current = surface.offsetWidth;
  if (needed > current + 1) {
    surface.style.width = `${needed}px`;
    surface.style.overflow = 'visible';
  }
}

function emitScrollCutoffDiagnostic(
  rectsByStartMs: ReadonlyMap<
    number,
    {
      x: number;
      y: number;
      w: number;
      h: number;
      onNotesX: number;
      realTopY: number;
    }
  >,
): void {
  try {
    let maxRight = 0;
    rectsByStartMs.forEach((rect) => {
      const right = rect.x + rect.w;
      if (right > maxRight) maxRight = right;
    });
    const alpha = alphaAreaRef.value;
    const container = containerRef.value;
    const surface = container?.querySelector<HTMLElement>('.at-surface');
    appendDevLog(
      JSON.stringify({
        source: 'src/components/player/PlayerPanel.vue',
        fn: 'onBeatCacheRefreshed',
        tag: 'scroll_cutoff_diag',
        horizontalLayout: playerStore.horizontalLayout,
        beatCount: rectsByStartMs.size,
        maxBeatRight: Math.round(maxRight),
        alphaAreaClientWidth: alpha?.clientWidth ?? null,
        alphaAreaScrollWidth: alpha?.scrollWidth ?? null,
        alphatabOffsetWidth: container?.offsetWidth ?? null,
        alphatabScrollWidth: container?.scrollWidth ?? null,
        surfaceOffsetWidth: surface?.offsetWidth ?? null,
        surfaceScrollWidth: surface?.scrollWidth ?? null,
        surfaceStyleWidth: surface?.style.width ?? null,
        ts: Date.now(),
      }),
    );
  } catch {
    // Best-effort diagnostic only.
  }
}

function handleStopEvent(): void {
  void handleStop();
}

async function handleStop(): Promise<void> {
  if (songStore.isLoaded) {
    void songStore.stop();
  }
  playerStore.stop();
  if (!hasSelection.value || status.value !== 'ready') {
    return;
  }
  if (!alphaAreaRef.value || !containerRef.value) {
    return;
  }
  alphatabPlayer.seekToStart({ soft: true });
}

async function verifyFontAssets(): Promise<void> {
  if (!import.meta.env.DEV) {
    return;
  }
  try {
    const fontUrl = `${getAlphaTabFontDirectory()}${ALPHATAB_FONT_CHECK_FILE}`;
    const response = await fetch(fontUrl);
    if (!response.ok) {
      playerStore.setError(
        'AlphaTab font assets missing. Check /public/alphatab/.',
      );
    }
  } catch {
    playerStore.setError(
      'AlphaTab font assets missing. Check /public/alphatab/.',
    );
  }
}

function removeAlphaTabFooter(): void {
  if (!containerRef.value) {
    return;
  }
  const root = containerRef.value;
  const remove = () => {
    root.querySelectorAll('text').forEach((node) => {
      if (node.textContent?.trim() === 'rendered by alphaTab') {
        const wrapper = node.closest('div');
        if (wrapper) {
          wrapper.remove();
        } else {
          node.remove();
        }
      }
    });
  };
  remove();
  footerObserver.value?.disconnect();
  const observer = new MutationObserver(() => remove());
  observer.observe(root, { childList: true, subtree: true });
  footerObserver.value = observer;
}

async function loadSongPeaks(itemId: string): Promise<void> {
  const stored = await getStoredWaveform(itemId);
  songPeaks.value = stored?.peaks?.length ? stored.peaks : [];
}

watch(
  () => songStore.loadedItemId,
  async (itemId) => {
    if (!itemId) {
      songPeaks.value = [];
      return;
    }
    await loadSongPeaks(itemId);
  },
);

// When switching from dual to song-only (tab closed), load peaks if empty
watch(showSongWaveform, async (visible) => {
  if (visible && songPeaks.value.length === 0 && songStore.loadedItemId) {
    await loadSongPeaks(songStore.loadedItemId);
  }
});

watch(
  () => beatmapStore.editorItemId,
  (newId, oldId) => {
    if (oldId && !newId) {
      void nextTick(() => alphatabPlayer.refreshLayout());
    }
  },
);

onMounted(async () => {
  window.addEventListener('player-stop', handleStopEvent as EventListener);
  if (!containerRef.value) {
    return;
  }
  await nextTick();
  await waitForFrame();
  try {
    alphatabPlayer.init(containerRef.value, {
      onReady: () => playerStore.setReady(),
      onError: (message) => playerStore.setError(message),
      onScoreLoaded: (tempoBpm) => {
        playerStore.setVolume(0.8);
        playerStore.setBaseBpm(tempoBpm);
        resolveScrollContainer();
        suppressSelectionHighlights.value = true;
        if (!resetScoreScroll()) {
          void nextTick().then(() => resetScoreScroll());
        }
        void waitForFrame().then(() => resetScoreScroll());
        void (async () => {
          await alphatabPlayer.waitForRenderFinished({ timeoutMs: 800 });
          alphatabPlayer.seekToStart({ soft: false });
          playerStore.reapplyTrackSelection();
        })();
      },
      onSoundFontError: (message) =>
        playerStore.setError(`SoundFont error: ${message}`),
      onTracksChanged: (nextTracks) => {
        const mapped = nextTracks.map((track, idx) => {
          let trackAny: {
            index?: number;
            name?: string;
            isPercussion?: boolean;
            playbackInfo?: { program?: number };
            staves?: Array<{ tuning?: number[] }>;
          };
          try {
            trackAny = track as {
              index?: number;
              name?: string;
              isPercussion?: boolean;
              playbackInfo?: { program?: number };
              staves?: Array<{ tuning?: number[] }>;
            };
          } catch {
            trackAny = {};
          }
          let index = idx;
          try {
            if (
              typeof trackAny.index === 'number' &&
              Number.isFinite(trackAny.index)
            ) {
              index = trackAny.index;
            }
          } catch {
            index = idx;
          }
          let name = `Track ${index + 1}`;
          try {
            if (typeof trackAny.name === 'string' && trackAny.name.length > 0) {
              name = trackAny.name;
            }
          } catch {
            name = `Track ${index + 1}`;
          }
          let isPercussion = false;
          try {
            isPercussion = trackAny.isPercussion === true;
          } catch {
            isPercussion = false;
          }
          // Pick the first staff that actually carries a tuning
          // array — multi-staff tracks (notation + tab) only have
          // the tuning on the tab staff, and standard-notation-only
          // staves leave it empty.
          let tuning: number[] | undefined;
          try {
            const staves = Array.isArray(trackAny.staves)
              ? trackAny.staves
              : [];
            for (const staff of staves) {
              const t = staff?.tuning;
              if (Array.isArray(t) && t.length > 0) {
                tuning = [...t];
                break;
              }
            }
          } catch {
            tuning = undefined;
          }
          let program: number | undefined;
          try {
            const p = trackAny.playbackInfo?.program;
            if (typeof p === 'number' && Number.isFinite(p)) {
              program = p;
            }
          } catch {
            program = undefined;
          }
          return {
            id: `track-${index}`,
            index,
            name,
            isPercussion,
            ...(tuning ? { tuning } : {}),
            ...(program !== undefined ? { program } : {}),
          };
        });
        playerStore.setTracks(mapped);
      },
      onCursorRectChanged: (rect) => {
        if (!isValidCursorRect(rect)) {
          return;
        }
        handleCursorRect(rect);
      },
      onPlaybackRangeHighlightChanged: (blocks) => {
        onPlaybackRangeHighlightChanged(blocks);
      },
      onBeatMouseDown: (beat) => {
        handleBeatMouseDown(beat);
      },
      onBeatMouseMove: (beat) => {
        handleBeatMouseMove(beat);
      },
      onBeatMouseUp: (beat) => {
        handleBeatMouseUp(beat);
      },
      onPlayerStateChanged: (event) => {
        void playerStore.handleAlphaTabPlayerStateChanged(event);
      },
      onMidiRebuilt: (ctx) => {
        noteRecognitionStore.onMidiRebuilt(
          ctx.events,
          ctx.activeTrackIndex,
          ctx.tempoFactor,
        );
      },
      onBeatCacheRefreshed: (rectsByStartMs) => {
        // IMPORTANT: widen the surface BEFORE pushing the cache into
        // the store. The NoteResultOverlay watches beatPositionCache
        // and calls syncSize() synchronously when it changes —
        // syncSize reads surface.offsetWidth. If we update the cache
        // first, syncSize reads the STALE (under-sized) width and
        // sizes the canvas too small, clipping beats past the old
        // surface edge. Resizing first means syncSize sees the
        // corrected width and the canvas covers every beat.
        resizeAlphaTabSurface();
        noteRecognitionStore.updateBeatCache(rectsByStartMs);
        // Fretboard Panel (PR 4.2) — the same refresh pass built
        // the beat-notes map; push it into the store so the SVG
        // reacts on the next tick. Pull-based via the singleton
        // means components mounted after init still see an empty
        // cache until this call runs.
        playerStore.updateBeatNotesCache(
          alphatabPlayer.getBeatNotesByStartMs(),
        );
        // Diagnostic: dump the DOM widths alongside the max beat X
        // so we can see whether the scroll container actually stretches
        // to hold the full tab in horizontal mode, or whether some
        // parent is clipping. Fires once per cache refresh.
        emitScrollCutoffDiagnostic(rectsByStartMs);
      },
    });
    removeAlphaTabFooter();
    playerStore.applyVolume();
    await verifyFontAssets();
    resolveScrollContainer();
    updateLayoutWarning();
    ensureLoaded();
  } catch (error) {
    playerStore.setError(String(error ?? 'Failed to initialize player.'));
  }
});

onUnmounted(() => {
  cleanupTimer();
  alphatabPlayer.dispose();
  try {
    footerObserver.value?.disconnect();
  } catch {
    // Avoid cleanup errors in test environments.
  }
  window.removeEventListener('player-stop', handleStopEvent as EventListener);
});

watch(
  () => playerStore.model.currentLibraryItemId,
  () => {
    updateLayoutWarning();
    resolveScrollContainer();
    if (!resetScoreScroll()) {
      void nextTick().then(() => resetScoreScroll());
    }
    ensureLoaded();
  },
);

// Drive the note-comparison lifecycle off playback state whenever live
// feedback is armed. `startComparison` resets the engine each time so
// Pause→Play restarts cleanly; `stopComparison` leaves accumulated results
// in place so the overlay can keep showing them.
/**
 * Drive the comparison lifecycle AND the end-of-run summary /
 * persistence off the player's three-state `playback` field, not a
 * boolean `isPlaying`. `isPlaying` collapses 'paused' and 'stopped'
 * into the same "not playing" transition, which previously meant
 * pausing mid-song persisted a partial feedback run to the stats
 * DB — resuming then started a fresh run, and the next pause /
 * stop persisted another row. Every pause = another DB row.
 *
 * New semantics (matching Marcel's review finding):
 *   - transition into 'playing'        → start the engine
 *   - transition into 'paused'         → stop the engine, keep
 *                                        noteResults in memory so
 *                                        the overlay can still show
 *                                        them, but DO NOT open the
 *                                        summary and DO NOT persist
 *   - transition into 'stopped' from an active state
 *                                      → stop the engine + open the
 *                                        summary + persist the run.
 *                                        This is the only path that
 *                                        writes a feedback_runs row.
 */
watch(
  () => [feedbackEnabled.value, playback.value] as const,
  ([enabled, playbackState], prev) => {
    const prevEnabled = prev?.[0];
    const prevPlayback = prev?.[1];
    const playbackChanged = prevPlayback !== playbackState;
    const enabledChanged = prevEnabled !== enabled;
    if (!playbackChanged && !enabledChanged) return;
    const wasActive = prevPlayback === 'playing' || prevPlayback === 'paused';
    // ALWAYS reload the tab from disk when feedback is turned on.
    // The user's intent in flipping the toggle is "I want a fresh
    // measurement run from bar 1" — earlier attempts (seekToStart
    // mid-playback) caused the comparison engine to drift ahead of
    // audio because alphatab's playhead and the audio buffer didn't
    // re-align cleanly after a seek. A full file reload reinitialises
    // alphatab + audio from scratch, guaranteeing the comparison
    // starts at exactly the same musical position as audio playback.
    // The reload also resets to 'stopped' state so the user presses
    // Play to start their run — explicit gate, no ambiguity. Feedback
    // toggle stays armed across the reload.
    if (enabled && prevEnabled === false) {
      void playerStore.reloadCurrentLibraryItem();
      // Return BEFORE the playback-state branches below run.
      // `reloadCurrentLibraryItem` is async and goes through
      // `openLibraryItem`, which calls `stop()` synchronously and
      // then awaits a tick. The state we're observing right now
      // (`playbackState === 'playing'` for the mid-playback case)
      // is pre-reload — falling through would call
      // `startComparison()` against the stale playback state, which
      // contradicts the reload contract: feedback runs start only
      // when the user presses Play after the reload settles.
      // Skipping the rest is safe: the reload's `stop()` will fire
      // the watcher again with [true, 'stopped'] and the
      // playing-transition branch handles `startComparison` cleanly
      // when the user eventually presses Play.
      return;
    }
    if (enabled && playbackState === 'playing' && prevPlayback !== 'playing') {
      noteRecognitionStore.startComparison();
      feedbackSummaryOpen.value = false;
      return;
    }
    if (playbackState === 'paused' && prevPlayback === 'playing') {
      // Just pause the engine — no dialog, no DB write. A partial
      // run that never hit Stop must not pollute the stats history.
      noteRecognitionStore.stopComparison();
      return;
    }
    if (playbackState === 'stopped' && wasActive) {
      noteRecognitionStore.stopComparison();
      if (enabled && noteRecognitionStore.noteResults.length > 0) {
        feedbackSummaryOpen.value = true;
        // Fire-and-forget: persistence failures are silent, the
        // dialog is the user-visible artefact for this run.
        void persistCompletedRun();
      }
      return;
    }
    // Feedback toggle flipped while playback stayed the same —
    // enabling during playback arms the engine, disabling during
    // playback tears it down. Neither path persists: persistence
    // is reserved for the real stop transition above. The seek
    // already happened above for the enable case, so this branch
    // only handles the comparison engine state.
    if (enabled && playbackState === 'playing' && prevEnabled === false) {
      noteRecognitionStore.startComparison();
    } else if (!enabled && prevEnabled === true && wasActive) {
      noteRecognitionStore.stopComparison();
    }
  },
);

async function persistCompletedRun(): Promise<void> {
  const libraryItemId = playerStore.model.currentLibraryItemId;
  if (!libraryItemId) return;
  const summary = buildFeedbackSummary(noteRecognitionStore.noteResults);
  if (summary.totalNotes === 0) return;
  const durationSeconds = Math.max(
    1,
    Math.round(noteRecognitionStore.lastRunDurationMs / 1000),
  );
  const detailsJson = JSON.stringify(
    serializeNoteDetails(noteRecognitionStore.noteResults),
  );
  try {
    await recordFeedbackRun({
      sessionId: practiceStore.activeSession?.id ?? null,
      exerciseId: practiceStore.activeExerciseId ?? null,
      libraryItemId,
      durationSeconds,
      strictnessPreset: noteRecognitionStore.strictnessPreset,
      totalNotes: summary.totalNotes,
      hitCount: summary.hitCount,
      missedCount: summary.missedCount,
      extraCount: summary.extraCount,
      pitchPerfect: summary.pitchHistogram.perfect,
      pitchGood: summary.pitchHistogram.good,
      pitchAcceptable: summary.pitchHistogram.acceptable,
      pitchWrong: summary.pitchHistogram.wrong,
      timingPerfect: summary.timingHistogram.perfect,
      timingGood: summary.timingHistogram.good,
      timingAcceptable: summary.timingHistogram.acceptable,
      timingWrong: summary.timingHistogram.wrong,
      longestStreak: summary.longestStreak,
      overallScore: summary.overallScore,
      suggestSlowDown: summary.suggestSlowDown,
      suggestStringMuting: summary.suggestStringMuting,
      detailsJson,
    });
    // Refresh the stats snapshot so any open Stats page (Exercise
    // Detail, Library Detail, Feedback tab) picks up the new run
    // without needing a manual reload.
    void statsStore.refresh();
  } catch {
    // Silent: the feedback summary dialog is the user's primary
    // artefact for this run, the DB record is supplementary. We
    // don't want a persistence failure to block the dialog.
  }
}

watch(
  () => isLoopEnabled.value,
  (enabled) => {
    if (enabled) {
      return;
    }
    onLoopDisabled();
  },
);

// Feedback mode is linear-only: looping would replay the same bars
// endlessly while the comparison engine tries to score them — the
// results would stack up and the summary dialog would be meaningless.
// Force the loop toggle off the moment feedback is armed.
watch(
  () => feedbackEnabled.value,
  (enabled) => {
    if (enabled && isLoopEnabled.value) {
      playerStore.toggleLoop();
    }
  },
);

watch(
  () => isAnyOverlayOpen(),
  (open) => {
    updateOverlayLock();
    if (open) {
      document.addEventListener('pointerdown', handleDocumentPointerDown, true);
      document.addEventListener('keydown', handleOverlayKeydown);
      return;
    }
    document.removeEventListener(
      'pointerdown',
      handleDocumentPointerDown,
      true,
    );
    document.removeEventListener('keydown', handleOverlayKeydown);
  },
);
</script>

<template>
  <section class="panel">
    <div
      v-if="vibratoDebugActive"
      class="vibrato-debug"
    >
      <div class="vibrato-debug__title">
        Vibrato
      </div>
      <div class="vibrato-debug__row">
        <span>Active</span>
        <span>{{ vibratoDebugInfo.active ? 'yes' : 'no' }}</span>
      </div>
      <div class="vibrato-debug__row">
        <span>Depth</span>
        <span>{{ vibratoDebugInfo.depthCents }}c</span>
      </div>
      <div class="vibrato-debug__row">
        <span>Rate</span>
        <span>{{ vibratoDebugInfo.rateHz.toFixed(1) }} Hz</span>
      </div>
    </div>
    <div class="top-section">
      <div class="top-bar">
        <div class="top-bar-left">
          <TrackControl
            ref="trackControlRef"
            :interval-mode-active="intervalModeActive"
            @update:overlay-lock="updateOverlayLock"
          />
          <TuningControl
            ref="tuningControlRef"
            :interval-mode-active="intervalModeActive"
            @update:overlay-lock="updateOverlayLock"
          />
        </div>
        <div class="top-bar-controls">
          <FeedbackToggle />
          <FeedbackStreakBadge @reopen-summary="feedbackSummaryOpen = true" />
          <TunerToggle />
          <VolumeControl
            ref="volumeControlRef"
            :status="status"
            @update:overlay-lock="updateOverlayLock"
          />
          <FretboardControl
            ref="fretboardControlRef"
            @update:overlay-lock="updateOverlayLock"
          />
          <DisplayControl
            ref="displayControlRef"
            :has-selection="hasSelection"
            :interval-mode-active="intervalModeActive"
            @update:overlay-lock="updateOverlayLock"
          />
          <CloseTabButton :interval-mode-active="intervalModeActive" />
        </div>
      </div>
      <!-- Zero-height absolute anchor. Placing the panel here (a
           sibling of `.alpha-area`, NOT inside it) means horizontal
           score scrolling leaves the fretboard anchored to the top
           of the viewport. The wrapper's `position: relative` +
           zero flex basis lets the panel float over the score
           without pushing it or growing the flex flow. -->
      <div
        v-if="fretboardOpen"
        class="fretboard-anchor"
      >
        <FretboardPanel />
      </div>
    </div>
    <!-- One-liner / horizontal layout suppresses AlphaTab's own
         title block, so we render a slim header strip above the
         score area when a title is available. Only mounts in the
         horizontal case — multi-line keeps AlphaTab's in-score
         title rendering as before. -->
    <h2
      v-if="horizontalLayout && currentScoreTitle"
      class="horizontal-score-title"
    >
      {{ currentScoreTitle }}
    </h2>
    <div
      ref="alphaAreaRef"
      class="alpha-area"
      :class="{ 'alpha-area--page': !horizontalLayout }"
      @click="handlePlayheadClick"
      @pointerdown="handleAlphaPointerDown"
      @pointermove="handleAlphaPointerMove"
      @pointerup="handleAlphaPointerUp"
      @pointercancel="handleAlphaPointerUp"
      @scroll.passive="handleScroll"
      @wheel="handleAlphaWheel"
    >
      <div
        v-if="overlayLocked"
        class="overlay-mask"
        @pointerdown.stop="handleOverlayMaskPointerDown"
        @click.stop="handleOverlayMaskPointerDown"
      />
      <div
        v-if="!currentItem && !songStore.isLoaded"
        class="empty"
      >
        <IconMenuMetronome
          class="empty-icon"
          :size="280"
          aria-hidden="true"
        />
        <p class="empty-text">
          <span class="empty-line empty-line-title">No Tab selected.</span>
          <span class="empty-line empty-line-accent">
            Please select a practice item from your routine or a file from the
            library.
          </span>
        </p>
        <hr
          class="empty-divider"
          aria-hidden="true"
        >
      </div>
      <div
        v-if="!currentItem && songStore.isLoaded"
        class="empty"
      >
        <IconMenuMetronome
          class="empty-icon"
          :size="280"
          aria-hidden="true"
        />
        <p class="empty-text">
          <span class="empty-line empty-line-title">Song loaded.</span>
          <span class="empty-line empty-line-accent">
            Use the transport controls below to play, pause, or stop the song.
          </span>
        </p>
        <hr
          class="empty-divider"
          aria-hidden="true"
        >
      </div>

      <div
        v-if="status === 'loading'"
        class="notice"
      >
        Loading tab data...
      </div>
      <div
        v-if="layoutWarning"
        class="notice error"
      >
        Player area has no size (layout issue).
      </div>
      <div
        v-if="status === 'error'"
        class="notice error"
      >
        {{ playerStore.model.errorMessage ?? 'Failed to load tab.' }}
        <button
          class="ghost"
          type="button"
          @click="handleRetry"
        >
          Retry
        </button>
      </div>
      <div
        v-for="(block, index) in selectionBlocks"
        v-show="currentItem"
        :key="`${block.left}-${block.top}-${index}`"
        class="selection-overlay"
        :style="{
          left: `${block.left}px`,
          top: `${block.top}px`,
          width: `${block.width}px`,
          height: `${block.height}px`,
        }"
      />

      <div
        v-show="currentItem"
        ref="containerRef"
        class="alphatab"
      />
      <NoteResultOverlay
        v-show="currentItem"
        :container="containerRef"
        :enabled="feedbackEnabled"
      />
    </div>

    <SongBar
      v-if="songStore.isLoaded"
      :sections="songStore.sections"
      :duration-ms="songStore.durationMs"
      :current-ms="songStore.currentMs"
      :is-playing="songStore.isPlaying"
      :show-waveform="showSongWaveform"
      :peaks="songPeaks"
      :loop-start-ms="songStore.loopStartMs"
      :loop-end-ms="songStore.loopEndMs"
      @seek="songStore.seek($event)"
      @close="songStore.unload()"
      @loop-select="(s: number, e: number) => songStore.setLoopRegion(s, e)"
      @loop-clear="songStore.clearLoopRegion()"
    />

    <PlayerBottomBar @stop="handleStop" />

    <FeedbackSummaryDialog
      :open="feedbackSummaryOpen"
      @update:open="feedbackSummaryOpen = $event"
    />
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #e6e6ea;
  /* `position: relative` stays so absolute-positioned descendants
     (the live-feedback canvas, selection overlay) anchor to the
     panel. We deliberately omit `z-index` here though — setting it
     would create a local stacking context that traps fixed-position
     children (e.g. FeedbackBetaDialog, FeedbackSummaryDialog) below
     any left-pane element that happens to have a positive z-index.
     Letting the panel's context stay at the root keeps modal
     dialogs comparable against every sibling in the app. */
  position: relative;
  --controls-bar-height: 72px;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: #11131a;
  border-radius: 10px;
}

.top-section {
  /* Wraps the top-bar + the optional Fretboard anchor so the
     panel can absolute-position against this element (not the
     whole `.panel`, which includes the scrolling alpha-area).
     Natural flex height = top-bar height; the zero-height
     `.fretboard-anchor` inside does not grow it.

     NO `z-index` here. Same trap as `.track-control` (see the
     comment on that file): setting one turns `.top-section`
     into a stacking context and caps every descendant's
     z-index — including the Track / Tuning / Display overlay
     menus at z-index 1100 — relative to this level. With
     `z-index: 2` the NoteResultOverlay canvas in `.alpha-area`
     (z-index 1001, root stacking context) paints over those
     menus and eats the clicks. Leaving the wrapper at
     `z-index: auto` lets the menus apply their 1100 at the
     document root and reliably win over the alpha-area canvas. */
  position: relative;
  flex: 0 0 auto;
}

.fretboard-anchor {
  /* Zero-height sibling of `.top-bar` (flex flow) so the panel
     below doesn't push the score. Its `position: relative` +
     zero size makes it a coordinate origin for the absolute
     FretboardPanel inside it. */
  position: relative;
  height: 0;
  pointer-events: none;
}

.fretboard-anchor > :deep(.fretboard-panel) {
  pointer-events: auto;
}

.top-bar-left {
  display: inline-flex;
  align-items: center;
  gap: 16px;
}

.top-bar-controls {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  align-items: center;
}

/* Title strip rendered above the score in one-liner mode only.
   AlphaTab's Horizontal layout suppresses its in-score title block
   (no system header to hang it off), so PracticeTab provides the
   title separately. Centred + accent-coloured to match the rest of
   the player chrome; small bottom margin so it doesn't crowd the
   first bar. */
.horizontal-score-title {
  margin: 4px 16px 8px;
  padding: 0;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.01em;
  /* Truncate with ellipsis for very long titles so the strip stays
     a single line — the full title is in the GP file metadata; this
     is a tab-context indicator, not a long-form display. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alpha-area {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px 16px;
  position: relative;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}

/* Page (multi-line) mode — suppress horizontal scrollbar; AlphaTab
   wraps to the container width so no horizontal overflow is
   expected. The defensive `.alphatab` width clamp matches: if any
   render path produces a child that's wider than the viewport
   (e.g. a leftover from a prior horizontal session before its
   inline styles get cleared), we cap it to the container so the
   parent's `overflow-x: hidden` actually clips. Belt-and-braces
   for Marcel's "score mode scrolls right" report. */
.alpha-area--page {
  overflow-x: hidden;
}
.alpha-area--page > .alphatab,
.alpha-area--page .at-surface {
  max-width: 100%;
  box-sizing: border-box;
}

/* One-liner horizontal mode: let `.alphatab` expand to its SVG's
   natural width instead of being constrained to the viewport.
   Without this, alphaTab's wide horizontal render spills into the
   scroll container but the parent block width stays capped — some
   layout paths then clip the last bars. `max-content` makes the
   child size to its contents, keeping the scrollWidth accurate
   and the last bars reachable. */
.alpha-area:not(.alpha-area--page) > .alphatab {
  width: max-content;
  min-width: 100%;
}

/* Note: the `.at-surface` sizing fix for the one-liner cutoff lives
   in `resizeAlphaTabSurface()` above, not here. A previous attempt
   to solve it with `width: max-content !important` via `:deep()`
   actually made the bug WORSE: `max-content` on a container whose
   children are `position: absolute` resolves to ~0 (absolute
   children don't contribute to intrinsic width), so the !important
   rule silently shrank the surface below AlphaTab's inline-styled
   width. JS with explicit `scrollWidth` readout is the only robust
   fix — kept here as a warning. */

.overlay-mask {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: transparent;
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  text-align: center;
  padding: 16px;
  color: var(--text-muted);
}

.empty-icon {
  color: var(--accent);
  margin-bottom: 20px;
}

.empty-text {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.5;
}

.empty-line {
  display: block;
}

.empty-line-accent {
  display: inline-block;
}

.empty-divider {
  width: min(520px, 74%);
  margin: 2px 0 0;
  height: 2px;
  border: 0;
}

.empty-line-title {
  font-size: 1.35rem;
}

.alpha-area::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.alpha-area::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 8px;
}

.alpha-area::-webkit-scrollbar-thumb:hover {
  background: var(--accent);
}

.alpha-area::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 8px;
}

.notice {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 20, 29, 0.6);
  border: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.notice.error {
  color: #ffb7b7;
  border-color: rgba(255, 183, 183, 0.4);
}

.alphatab {
  min-height: 500px;
  flex: 1;
  border: 0;
  border-radius: 12px;
  padding: 8px;
  position: relative;
}

/* AlphaTab hard-codes `style.zIndex = '1000'` on its `.at-cursors`
   wrapper in the document root stacking context. That's absurdly
   high — it forces every overlay in the app (tuner modal, top-bar
   dropdowns, settings, feedback dialogs) to either climb above 1000
   or live with cursor bleed-through. We pin it down to z=1 so
   "normal" z-index values (tens / low hundreds) automatically win.
   `!important` is required to override AlphaTab's inline style. */
.alphatab :deep(.at-cursors) {
  z-index: 1 !important;
}

.alphatab :deep(.at-cursor-beat) {
  opacity: 1 !important;
  visibility: visible !important;
  display: block !important;
  /* AlphaTab applies transform scale from a 1-unit cursor container.
     Use a large base width so scaled width stays visibly thick. */
  width: 400px !important;
  min-width: 400px !important;
  background: var(--accent) !important;
  border: 0 !important;
  outline: 0 !important;
  animation: none !important;
  transition: transform 0s linear !important;
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 32%, transparent) !important;
  border-radius: 2px;
}

.alphatab :deep(.at-cursor-bar) {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  width: 0 !important;
  min-width: 0 !important;
}

.selection-overlay {
  position: absolute;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 6px;
  pointer-events: none;
  z-index: 3;
}

button.ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--border);
}

.vibrato-debug {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(8, 10, 12, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.vibrato-debug__title {
  font-weight: 600;
  margin-bottom: 6px;
}

.vibrato-debug__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
</style>
