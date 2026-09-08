<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { SongSection } from '../../domain/songMap';
import { drawWaveform } from './drawWaveform';
import { useAppStore } from '../../stores/app';

const CANVAS_HEIGHT = 100;
const DRAG_THRESHOLD_PX = 3;
const PX_PER_SECOND = 20;

let dragRafId = 0;

const props = withDefaults(
  defineProps<{
    peaks: number[];
    durationMs: number;
    startOffsetMs: number;
    sections: SongSection[];
    cursorMs?: number;
    autoFollow?: boolean;
  }>(),
  {
    cursorMs: undefined,
    autoFollow: false,
  },
);

const emit = defineEmits<{
  'click-time': [ms: number];
  'update:start-offset': [ms: number];
  'update:section-time': [payload: { sectionId: string; timestampMs: number }];
}>();

const appStore = useAppStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const canvasWidth = computed(() => {
  const seconds = props.durationMs / 1000;
  return Math.max(300, Math.ceil(seconds * PX_PER_SECOND));
});

// Offset dragging state
const draggingOffset = ref(false);
const dragStartX = ref(0);
const dragStartOffsetMs = ref(0);
const hasDragMoved = ref(false);

// Section dragging state
const draggingSectionId = ref<string | null>(null);

function redraw(): void {
  const canvas = canvasRef.value;
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const width = canvasWidth.value;
  canvas.width = width;
  canvas.height = CANVAS_HEIGHT;

  drawWaveform({
    ctx,
    width,
    height: CANVAS_HEIGHT,
    peaks: props.peaks,
    durationMs: props.durationMs,
    startOffsetMs: props.startOffsetMs,
    sections: props.sections,
    cursorMs: props.cursorMs ?? null,
    accentColor: appStore.accentColor,
    dragSectionId: draggingSectionId.value,
  });
}

function xToMs(x: number): number {
  const w = canvasWidth.value;
  if (w <= 0 || props.durationMs <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(props.durationMs, (x / w) * props.durationMs));
}

function getCanvasX(event: MouseEvent): number {
  const canvas = canvasRef.value;
  if (!canvas) {
    return 0;
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  return (event.clientX - rect.left) * scaleX;
}

function isNearStartOffset(canvasX: number): boolean {
  const w = canvasWidth.value;
  const offsetX = (props.startOffsetMs / props.durationMs) * w;
  return Math.abs(canvasX - offsetX) < 14;
}

function findNearSection(canvasX: number): string | null {
  const w = canvasWidth.value;
  for (const section of props.sections) {
    const sectionX = (section.timestampMs / props.durationMs) * w;
    if (Math.abs(canvasX - sectionX) < 14) {
      return section.id;
    }
  }
  return null;
}

function onCanvasMouseDown(event: MouseEvent): void {
  const canvasX = getCanvasX(event);

  // Check if near a section handle
  const nearSectionId = findNearSection(canvasX);
  if (nearSectionId) {
    draggingSectionId.value = nearSectionId;
    window.addEventListener('mousemove', onSectionDragMove);
    window.addEventListener('mouseup', onSectionDragEnd);
    event.preventDefault();
    return;
  }

  // Check if near start offset handle
  if (isNearStartOffset(canvasX)) {
    draggingOffset.value = true;
    dragStartX.value = canvasX;
    dragStartOffsetMs.value = props.startOffsetMs;
    hasDragMoved.value = false;
    window.addEventListener('mousemove', onOffsetDragMove);
    window.addEventListener('mouseup', onOffsetDragEnd);
    event.preventDefault();
  }
}

function onOffsetDragMove(event: MouseEvent): void {
  if (!draggingOffset.value) {
    return;
  }
  const canvasX = getCanvasX(event);
  const dx = Math.abs(canvasX - dragStartX.value);
  if (dx > DRAG_THRESHOLD_PX) {
    hasDragMoved.value = true;
  }
  if (hasDragMoved.value) {
    cancelAnimationFrame(dragRafId);
    dragRafId = requestAnimationFrame(() => {
      const ms = xToMs(canvasX);
      emit('update:start-offset', Math.round(ms));
    });
  }
}

function onOffsetDragEnd(): void {
  draggingOffset.value = false;
  window.removeEventListener('mousemove', onOffsetDragMove);
  window.removeEventListener('mouseup', onOffsetDragEnd);
}

function onSectionDragMove(event: MouseEvent): void {
  if (!draggingSectionId.value) {
    return;
  }
  const sectionId = draggingSectionId.value;
  const canvasX = getCanvasX(event);
  cancelAnimationFrame(dragRafId);
  dragRafId = requestAnimationFrame(() => {
    const ms = xToMs(canvasX);
    emit('update:section-time', {
      sectionId,
      timestampMs: Math.round(ms),
    });
  });
}

function onSectionDragEnd(): void {
  draggingSectionId.value = null;
  window.removeEventListener('mousemove', onSectionDragMove);
  window.removeEventListener('mouseup', onSectionDragEnd);
}

function onCanvasClick(event: MouseEvent): void {
  if (draggingOffset.value || draggingSectionId.value) {
    return;
  }
  const canvasX = getCanvasX(event);
  const ms = xToMs(canvasX);
  emit('click-time', Math.round(ms));
}

onMounted(redraw);

watch(
  () => [
    props.peaks,
    props.durationMs,
    props.startOffsetMs,
    props.sections,
    props.cursorMs,
    appStore.accentColor,
    canvasWidth.value,
    draggingSectionId.value,
  ],
  redraw,
);

// Auto-follow: scroll to keep cursor visible
watch(
  () => props.cursorMs,
  (ms) => {
    if (!props.autoFollow || ms === undefined) return;
    const container = containerRef.value;
    if (!container) return;
    const cursorX = (ms / 1000) * PX_PER_SECOND;
    const containerWidth = container.clientWidth;
    const margin = containerWidth * 0.25;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + containerWidth;
    if (cursorX < viewLeft + margin || cursorX > viewRight - margin) {
      container.scrollLeft = cursorX - containerWidth * 0.3;
    }
  },
);
</script>

<template>
  <div
    ref="containerRef"
    class="waveform-container"
  >
    <canvas
      ref="canvasRef"
      class="waveform-canvas"
      :style="{ width: canvasWidth + 'px', height: CANVAS_HEIGHT + 'px' }"
      @mousedown="onCanvasMouseDown"
      @click="onCanvasClick"
    />
  </div>
</template>

<style scoped>
.waveform-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding-top: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #0f1218;
}

.waveform-canvas {
  display: block;
  cursor: crosshair;
}
</style>
