<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onMounted,
  nextTick,
  onBeforeUnmount,
} from 'vue';
import type { SongSection } from '../../domain/songMap';
import { sectionAtTime, nextSection, sortSections } from '../../domain/songMap';
import { useAppStore } from '../../stores/app';

const props = withDefaults(
  defineProps<{
    sections: SongSection[];
    durationMs: number;
    currentMs: number;
    isPlaying: boolean;
    showWaveform?: boolean;
    peaks?: number[];
    loopStartMs?: number | null;
    loopEndMs?: number | null;
  }>(),
  {
    showWaveform: false,
    peaks: () => [],
    loopStartMs: null,
    loopEndMs: null,
  },
);

const appStore = useAppStore();

const emit = defineEmits<{
  seek: [ms: number];
  close: [];
  'loop-select': [startMs: number, endMs: number];
  'loop-clear': [];
}>();

const timelineRef = ref<HTMLDivElement | null>(null);
const waveformCanvasRef = ref<HTMLCanvasElement | null>(null);

const sorted = computed(() => sortSections(props.sections));

const currentSection = computed(() =>
  sectionAtTime(props.sections, props.currentMs),
);

const nextSec = computed(() => nextSection(props.sections, props.currentMs));

const cursorPercent = computed(() => {
  if (props.durationMs <= 0) return 0;
  return Math.min(100, Math.max(0, (props.currentMs / props.durationMs) * 100));
});

const hasLoop = computed(
  () => props.loopStartMs !== null && props.loopEndMs !== null,
);

const loopRegionStyle = computed(() => {
  if (!hasLoop.value || props.durationMs <= 0) return null;
  const start = props.loopStartMs!;
  const end = props.loopEndMs!;
  const leftPct = (start / props.durationMs) * 100;
  const widthPct = ((end - start) / props.durationMs) * 100;
  return { left: `${leftPct}%`, width: `${widthPct}%` };
});

const sectionRegions = computed(() => {
  if (props.durationMs <= 0 || sorted.value.length === 0) return [];
  const regions: { left: string; width: string; color: string }[] = [];
  const s = sorted.value;
  for (let i = 0; i < s.length; i++) {
    const startPct = (s[i].timestampMs / props.durationMs) * 100;
    const endPct =
      i + 1 < s.length ? (s[i + 1].timestampMs / props.durationMs) * 100 : 100;
    regions.push({
      left: `${startPct}%`,
      width: `${endPct - startPct}%`,
      color: s[i].color,
    });
  }
  return regions;
});

// ── Drag-to-loop interaction ────────────────────────────────────────────

const isDragging = ref(false);
const dragStartX = ref(0);
const dragCurrentX = ref(0);
const DRAG_THRESHOLD_PX = 5;

const dragPreviewStyle = computed(() => {
  if (!isDragging.value || !timelineRef.value) return null;
  const el = timelineRef.value;
  const rect = el.getBoundingClientRect();
  const startRatio = Math.max(
    0,
    Math.min(1, (dragStartX.value - rect.left) / rect.width),
  );
  const currentRatio = Math.max(
    0,
    Math.min(1, (dragCurrentX.value - rect.left) / rect.width),
  );
  const leftRatio = Math.min(startRatio, currentRatio);
  const widthRatio = Math.abs(currentRatio - startRatio);
  if (widthRatio * rect.width < DRAG_THRESHOLD_PX) return null;
  return {
    left: `${leftRatio * 100}%`,
    width: `${widthRatio * 100}%`,
  };
});

function xToMs(clientX: number): number {
  const el = timelineRef.value;
  if (!el || props.durationMs <= 0) return 0;
  const rect = el.getBoundingClientRect();
  const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
  return Math.round((x / rect.width) * props.durationMs);
}

function handleMouseDown(event: MouseEvent): void {
  // Only handle left mouse button for drag
  if (event.button !== 0) return;
  if (!props.showWaveform) {
    // Non-waveform mode: just seek on click
    handleTimelineClick(event);
    return;
  }
  isDragging.value = true;
  dragStartX.value = event.clientX;
  dragCurrentX.value = event.clientX;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(event: MouseEvent): void {
  if (!isDragging.value) return;
  dragCurrentX.value = event.clientX;
}

function handleMouseUp(event: MouseEvent): void {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  if (!isDragging.value) return;
  isDragging.value = false;

  const distance = Math.abs(event.clientX - dragStartX.value);
  if (distance < DRAG_THRESHOLD_PX) {
    // Click — seek
    emit('seek', xToMs(event.clientX));
    return;
  }
  // Drag — loop select
  const ms1 = xToMs(dragStartX.value);
  const ms2 = xToMs(event.clientX);
  emit('loop-select', Math.min(ms1, ms2), Math.max(ms1, ms2));
}

function handleContextMenu(event: MouseEvent): void {
  if (hasLoop.value) {
    event.preventDefault();
    emit('loop-clear');
  }
}

function handleTimelineClick(event: MouseEvent): void {
  const el = timelineRef.value;
  if (!el || props.durationMs <= 0) return;
  const rect = el.getBoundingClientRect();
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
  const ratio = x / rect.width;
  emit('seek', Math.round(ratio * props.durationMs));
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});

// ── Waveform rendering ──────────────────────────────────────────────────

function sectionColorAtX(xRatio: number): string {
  if (sorted.value.length === 0) return appStore.accentColor;
  const ms = xRatio * props.durationMs;
  const sec = sectionAtTime(sorted.value, ms);
  return sec?.color ?? appStore.accentColor;
}

function isInLoop(xRatio: number): boolean {
  if (!hasLoop.value || props.durationMs <= 0) return true;
  const ms = xRatio * props.durationMs;
  return ms >= props.loopStartMs! && ms <= props.loopEndMs!;
}

function drawWaveform(): void {
  const canvas = waveformCanvasRef.value;
  if (!canvas || !props.showWaveform || props.peaks.length === 0) return;
  const container = canvas.parentElement;
  if (!container) return;

  const w = container.clientWidth;
  const h = 48;
  canvas.width = w * (window.devicePixelRatio || 1);
  canvas.height = h * (window.devicePixelRatio || 1);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);

  const peaks = props.peaks;
  const midY = h / 2;
  const numBars = w;

  for (let x = 0; x < numBars; x++) {
    const ratio = x / numBars;
    const peakIdx = Math.floor(ratio * peaks.length);
    const val = Math.abs(peaks[Math.min(peakIdx, peaks.length - 1)]);
    const barH = Math.max(1, val * midY * 0.9);
    const color = sectionColorAtX(ratio);
    ctx.fillStyle = color;
    ctx.globalAlpha = hasLoop.value ? (isInLoop(ratio) ? 0.4 : 0.15) : 0.4;
    ctx.fillRect(x, midY - barH, 1, barH * 2);
  }
  ctx.globalAlpha = 1;
}

onMounted(drawWaveform);
watch(
  () => [
    props.peaks,
    props.showWaveform,
    props.sections,
    props.durationMs,
    props.loopStartMs,
    props.loopEndMs,
  ],
  async () => {
    await nextTick();
    drawWaveform();
  },
);
</script>

<template>
  <div class="song-bar">
    <div class="song-bar__labels">
      <span
        v-if="currentSection"
        class="song-bar__label"
        :style="{ color: currentSection.color }"
      >
        {{ currentSection.label }}
      </span>
      <span
        v-else
        class="song-bar__label song-bar__label--muted"
      >
        &mdash;
      </span>
      <span
        v-if="nextSec"
        class="song-bar__arrow"
      > &rarr; </span>
      <span
        v-if="nextSec"
        class="song-bar__label"
        :style="{ color: nextSec.color }"
      >
        {{ nextSec.label }}
      </span>
      <button
        v-if="!isPlaying"
        class="song-bar__close"
        type="button"
        aria-label="Close Song"
        @click.stop="emit('close')"
      >
        &times;
      </button>
    </div>

    <div
      ref="timelineRef"
      class="song-bar__timeline"
      :class="{ 'song-bar__timeline--waveform': showWaveform }"
      role="slider"
      tabindex="0"
      :aria-valuenow="Math.round(currentMs)"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(durationMs)"
      aria-label="Song timeline"
      @mousedown="handleMouseDown"
      @contextmenu="handleContextMenu"
    >
      <canvas
        v-if="showWaveform"
        ref="waveformCanvasRef"
        class="song-bar__waveform-canvas"
      />
      <div
        v-for="(region, idx) in sectionRegions"
        :key="idx"
        class="song-bar__region"
        :style="{
          left: region.left,
          width: region.width,
          background: `${region.color}18`,
        }"
      />

      <div
        v-for="section in sorted"
        :key="section.id"
        class="song-bar__marker"
        :style="{
          left:
            durationMs > 0
              ? `${(section.timestampMs / durationMs) * 100}%`
              : '0%',
          background: section.color,
        }"
      />

      <!-- Loop region overlay -->
      <div
        v-if="loopRegionStyle"
        class="song-bar__loop-region"
        :style="loopRegionStyle"
      />
      <div
        v-if="loopRegionStyle"
        class="song-bar__loop-handle"
        :style="{ left: loopRegionStyle.left }"
      />
      <div
        v-if="loopRegionStyle"
        class="song-bar__loop-handle"
        :style="{
          left: `calc(${loopRegionStyle.left} + ${loopRegionStyle.width})`,
        }"
      />

      <!-- Drag preview -->
      <div
        v-if="dragPreviewStyle"
        class="song-bar__drag-preview"
        :style="dragPreviewStyle"
      />

      <div
        class="song-bar__cursor"
        :style="{ left: `${cursorPercent}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
.song-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 16px;
  background: #11131a;
  border-bottom: 1px solid var(--border);
}

.song-bar__labels {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 600;
}

.song-bar__close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0 4px;
  opacity: 0.6;
}

.song-bar__close:hover {
  color: #ff8a8a;
  opacity: 1;
  line-height: 1;
  min-height: 18px;
}

.song-bar__label--muted {
  color: var(--text-muted);
}

.song-bar__arrow {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.song-bar__timeline {
  position: relative;
  width: 100%;
  height: 6px;
  background: #1a1d24;
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
}

.song-bar__region {
  position: absolute;
  top: 0;
  height: 100%;
  pointer-events: none;
}

.song-bar__marker {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  pointer-events: none;
  opacity: 0.8;
}

.song-bar__cursor {
  position: absolute;
  top: -1px;
  width: 2px;
  height: calc(100% + 2px);
  background: var(--accent);
  border-radius: 1px;
  pointer-events: none;
  transform: translateX(-1px);
  box-shadow: 0 0 4px color-mix(in srgb, var(--accent) 50%, transparent);
}

.song-bar__timeline--waveform {
  height: 48px;
  border-radius: 4px;
}

.song-bar__waveform-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.song-bar__loop-region {
  position: absolute;
  top: 0;
  height: 100%;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  pointer-events: none;
  z-index: 1;
}

.song-bar__loop-handle {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: var(--accent);
  pointer-events: none;
  transform: translateX(-1px);
  opacity: 0.8;
  z-index: 2;
}

.song-bar__drag-preview {
  position: absolute;
  top: 0;
  height: 100%;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-left: 1px solid var(--accent);
  border-right: 1px solid var(--accent);
  pointer-events: none;
  z-index: 3;
}
</style>
