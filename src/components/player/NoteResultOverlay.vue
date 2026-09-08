<script setup lang="ts">
/**
 * Live-feedback overlay canvas (PR 3.6).
 *
 * Responsibilities:
 * - Size itself to the AlphaTab render container via ResizeObserver so canvas
 *   pixels map 1:1 to container pixels.
 * - On every result change or playhead update (re-)paint dots + arrows + bend
 *   glyphs for every `NoteResult` using `overlayPainter`.
 * - Translate each ExpectedNote's wall-clock `startMs` back to the raw-1×
 *   cache key via `rawStartMsFromExpected` so the same canvas survives
 *   speed-trainer tempoFactor changes.
 *
 * Pointer-events are disabled on the canvas so it does not interfere with
 * AlphaTab's click/drag behaviour.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useNoteRecognitionStore } from '../../stores/noteRecognition';
import { usePlayerStore } from '../../stores/player';
import {
  STRICTNESS_PRESETS,
  pickBetterResult,
  type NoteResult,
} from '../../domain/noteComparison';
import {
  groupBeatsIntoLines,
  paintNoteFeedback,
  type FeedbackBarEntry,
  type OverlayPaintContext,
} from './overlayPainter';
import { rawStartMsFromExpected } from '../../services/player/beatRectIndex';

const props = defineProps<{
  /** The AlphaTab render container — the canvas is sized to match this element. */
  container: HTMLElement | null;
  /** When false, the overlay is hidden and no painting happens. */
  enabled: boolean;
}>();

const store = useNoteRecognitionStore();
const playerStore = usePlayerStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const size = ref<{ w: number; h: number }>({ w: 0, h: 0 });
const offset = ref<{ left: number; top: number }>({ left: 0, top: 0 });

const strictness = computed(() => STRICTNESS_PRESETS[store.strictnessPreset]);

let resizeObserver: ResizeObserver | null = null;
let rafHandle: number | null = null;
let dirty = true;

function markDirty(): void {
  dirty = true;
  scheduleRepaint();
}

function scheduleRepaint(): void {
  if (rafHandle !== null) return;
  if (typeof requestAnimationFrame === 'undefined') {
    repaint();
    return;
  }
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    repaint();
  });
}

function repaint(): void {
  if (!dirty) return;
  dirty = false;

  const canvas = canvasRef.value;
  if (!canvas) return;

  const { w, h } = size.value;
  if (w <= 0 || h <= 0) return;

  // Ensure backing store matches logical size (accounting for DPR).
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const backingW = Math.round(w * dpr);
  const backingH = Math.round(h * dpr);
  if (canvas.width !== backingW) canvas.width = backingW;
  if (canvas.height !== backingH) canvas.height = backingH;

  const rawCtx = canvas.getContext('2d');
  if (!rawCtx) return;
  rawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rawCtx.clearRect(0, 0, w, h);

  if (!props.enabled) return;

  const timeline = store.timeline;
  if (!timeline) return;
  const tempoFactor = timeline.tempoFactor || 1;
  const cache = store.beatPositionCache;
  if (cache.size === 0) return;

  const ctx = rawCtx as unknown as OverlayPaintContext;

  // Index results by raw-startMs so we can pair them with cache rects.
  // Chord voices share a `startMs` → the same key. Collapse them into
  // the best-scoring voice rather than last-write-wins: the pitch
  // detector tracks a single fundamental and can only verify ONE
  // voice, so the BEST rating across all voices is the strongest
  // signal that the chord was actually played.
  const resultsByKey = new Map<number, NoteResult>();
  for (const result of store.noteResults) {
    const key = rawStartMsFromExpected(
      result.expectedNote.startMs,
      tempoFactor,
    );
    const existing = resultsByKey.get(key);
    resultsByKey.set(
      key,
      existing ? pickBetterResult(existing, result) : result,
    );
  }

  const entries: FeedbackBarEntry[] = [];
  for (const [key, rect] of cache) {
    entries.push({ rect, result: resultsByKey.get(key) ?? null });
  }
  // In one-liner horizontal layout the feedback bar must anchor
  // above the whole score rather than at each staff baseline — the
  // default per-baseline logic picks `max(rect.y)` which lands the
  // bar mid-score for taller scores (7/8/9-string tabs, staff+tab).
  const lines = groupBeatsIntoLines(entries, {
    anchorAtTop: playerStore.horizontalLayout,
  });

  for (const line of lines) {
    for (const cell of line.cells) {
      paintNoteFeedback(ctx, cell, strictness.value);
    }
  }
}

function syncSize(): void {
  const el = props.container;
  if (!el) {
    size.value = { w: 0, h: 0 };
    return;
  }
  // AlphaTab renders into `.at-surface` inside the container. That surface
  // has an 8px padding → beat rects coming from `boundsLookup` are in
  // surface-local coords, NOT container-local. Position + size the canvas
  // on the surface so drawing at (rect.x, rect.y) maps 1:1 to the surface.
  // Fallback to the container if the surface isn't mounted yet (e.g. first
  // render before AlphaTab finishes its initial layout).
  const surface = el.querySelector<HTMLElement>('.at-surface');
  const containerLeft = el.offsetLeft ?? 0;
  const containerTop = el.offsetTop ?? 0;
  const surfaceLeft = surface?.offsetLeft ?? 0;
  const surfaceTop = surface?.offsetTop ?? 0;
  const w = surface?.offsetWidth ?? el.scrollWidth ?? el.clientWidth ?? 0;
  const h = surface?.offsetHeight ?? el.scrollHeight ?? el.clientHeight ?? 0;
  const left = containerLeft + surfaceLeft;
  const top = containerTop + surfaceTop;
  if (
    w === size.value.w &&
    h === size.value.h &&
    left === offset.value.left &&
    top === offset.value.top
  ) {
    return;
  }
  size.value = { w, h };
  offset.value = { left, top };
  markDirty();
}

function attachObserver(el: HTMLElement | null): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!el) return;
  if (typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(() => {
    syncSize();
  });
  // Observe both the container AND the `.at-surface` because AlphaTab's
  // partial-rendering can grow the surface after the container has already
  // settled — missing those would leave the canvas stale-sized.
  resizeObserver.observe(el);
  const surface = el.querySelector<HTMLElement>('.at-surface');
  if (surface) resizeObserver.observe(surface);
  syncSize();
}

// Re-attach observer whenever the container ref changes.
watch(
  () => props.container,
  (el) => {
    attachObserver(el);
  },
  { immediate: false },
);

// Toggle visibility triggers a clear paint.
watch(
  () => props.enabled,
  () => {
    markDirty();
  },
);

// Repaint on new results, cache refresh, or strictness change.
watch(
  () => store.noteResults,
  () => markDirty(),
);
watch(
  () => store.beatPositionCache,
  () => {
    syncSize();
    markDirty();
  },
);
watch(strictness, () => markDirty());

onMounted(() => {
  attachObserver(props.container);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafHandle);
  }
  rafHandle = null;
});
</script>

<template>
  <canvas
    v-show="enabled"
    ref="canvasRef"
    class="note-result-overlay"
    :style="{
      width: `${size.w}px`,
      height: `${size.h}px`,
      left: `${offset.left}px`,
      top: `${offset.top}px`,
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.note-result-overlay {
  position: absolute;
  pointer-events: none;
  /* AlphaTab's cursor wrapper is pinned to z=1 in PlayerPanel.vue
     (see comment there). The feedback canvas sits one step above
     so arrows and colour bars paint over the playhead line.
     Everything else in the app — tuner modal, top-bar dropdowns,
     dialogs — is naturally above both at any reasonable z-index. */
  z-index: 2;
}
</style>
