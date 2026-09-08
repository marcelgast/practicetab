<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { normalizeHexColor } from '../../domain/color';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const WHEEL_SIZE = 150;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
const INNER_RADIUS = 0;

const popoverOpen = ref(false);
const popoverRef = ref<HTMLElement | null>(null);
const swatchRef = ref<HTMLElement | null>(null);
const wheelCanvasRef = ref<HTMLCanvasElement | null>(null);
const popoverStyle = ref<Record<string, string>>({});

const displayColor = computed(() => normalizeHexColor(props.modelValue));

const hue = ref(0);
const saturation = ref(100);
const lightness = ref(50);
const hexInput = ref(props.modelValue);

// --- HSL <-> Hex conversion ---

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  const toHex = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = normalizeHexColor(hex);
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// --- Wheel drawing ---

function drawWheel(): void {
  const canvas = wheelCanvasRef.value;
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  canvas.width = WHEEL_SIZE;
  canvas.height = WHEEL_SIZE;
  ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

  // Draw hue/saturation wheel
  const imageData = ctx.createImageData(WHEEL_SIZE, WHEEL_SIZE);
  for (let y = 0; y < WHEEL_SIZE; y++) {
    for (let x = 0; x < WHEEL_SIZE; x++) {
      const dx = x - WHEEL_RADIUS;
      const dy = y - WHEEL_RADIUS;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > WHEEL_RADIUS || dist < INNER_RADIUS) {
        continue;
      }
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const h = (angle + 360) % 360;
      const s = ((dist - INNER_RADIUS) / (WHEEL_RADIUS - INNER_RADIUS)) * 100;
      const hex = hslToHex(h, s, lightness.value);
      const idx = (y * WHEEL_SIZE + x) * 4;
      imageData.data[idx] = parseInt(hex.slice(1, 3), 16);
      imageData.data[idx + 1] = parseInt(hex.slice(3, 5), 16);
      imageData.data[idx + 2] = parseInt(hex.slice(5, 7), 16);
      imageData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // Draw selection indicator
  const selAngle = (hue.value * Math.PI) / 180;
  const selDist =
    INNER_RADIUS + (saturation.value / 100) * (WHEEL_RADIUS - INNER_RADIUS);
  const selX = WHEEL_RADIUS + selDist * Math.cos(selAngle);
  const selY = WHEEL_RADIUS + selDist * Math.sin(selAngle);
  ctx.beginPath();
  ctx.arc(selX, selY, 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(selX, selY, 4, 0, Math.PI * 2);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function emitCurrentColor(): void {
  const hex = hslToHex(hue.value, saturation.value, lightness.value);
  hexInput.value = hex;
  emit('update:modelValue', hex);
}

// --- Wheel interaction ---

const wheelDragging = ref(false);

function pickFromWheel(x: number, y: number): void {
  const dx = x - WHEEL_RADIUS;
  const dy = y - WHEEL_RADIUS;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < INNER_RADIUS || dist > WHEEL_RADIUS) {
    return;
  }
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  hue.value = Math.round((angle + 360) % 360);
  saturation.value = Math.round(
    Math.min(
      100,
      ((dist - INNER_RADIUS) / (WHEEL_RADIUS - INNER_RADIUS)) * 100,
    ),
  );
  emitCurrentColor();
}

function onWheelMouseDown(event: MouseEvent): void {
  const canvas = wheelCanvasRef.value;
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * WHEEL_SIZE;
  const y = ((event.clientY - rect.top) / rect.height) * WHEEL_SIZE;
  pickFromWheel(x, y);
  wheelDragging.value = true;
  window.addEventListener('mousemove', onWheelMouseMove);
  window.addEventListener('mouseup', onWheelMouseUp);
}

function onWheelMouseMove(event: MouseEvent): void {
  if (!wheelDragging.value) {
    return;
  }
  const canvas = wheelCanvasRef.value;
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * WHEEL_SIZE;
  const y = ((event.clientY - rect.top) / rect.height) * WHEEL_SIZE;
  pickFromWheel(x, y);
}

function onWheelMouseUp(): void {
  wheelDragging.value = false;
  window.removeEventListener('mousemove', onWheelMouseMove);
  window.removeEventListener('mouseup', onWheelMouseUp);
}

// --- Lightness slider ---

function onLightnessInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  lightness.value = Number(target.value);
  emitCurrentColor();
}

// --- Hex input ---

function onHexInputChange(): void {
  const normalized = normalizeHexColor(hexInput.value);
  hexInput.value = normalized;
  const hsl = hexToHsl(normalized);
  hue.value = hsl.h;
  saturation.value = hsl.s;
  lightness.value = hsl.l;
  emit('update:modelValue', normalized);
}

// --- Popover ---

function updatePopoverPosition(): void {
  const swatch = swatchRef.value;
  if (!swatch) {
    return;
  }
  const rect = swatch.getBoundingClientRect();
  popoverStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    bottom: `${window.innerHeight - rect.top + 6}px`,
    zIndex: '9999',
  };
}

function togglePopover(): void {
  popoverOpen.value = !popoverOpen.value;
  if (popoverOpen.value) {
    const hsl = hexToHsl(displayColor.value);
    hue.value = hsl.h;
    saturation.value = hsl.s;
    lightness.value = hsl.l;
    hexInput.value = displayColor.value;
    void nextTick(() => {
      updatePopoverPosition();
      drawWheel();
    });
  }
}

function handleClickOutside(event: MouseEvent): void {
  if (!popoverOpen.value) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    popoverOpen.value = false;
    return;
  }
  if (popoverRef.value?.contains(target) || swatchRef.value?.contains(target)) {
    return;
  }
  popoverOpen.value = false;
}

const selectedHex = computed(() =>
  hslToHex(hue.value, saturation.value, lightness.value),
);

const lightnessGradient = computed(
  () =>
    `linear-gradient(to right, #000, ${hslToHex(hue.value, saturation.value, 50)}, #fff)`,
);

watch([hue, saturation, lightness], () => {
  if (popoverOpen.value) {
    drawWheel();
  }
});

onMounted(() => {
  window.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="color-picker-circle">
    <button
      ref="swatchRef"
      class="color-swatch"
      type="button"
      :style="{ backgroundColor: displayColor }"
      aria-label="Pick color"
      @click.stop="togglePopover"
    />
    <div
      v-if="popoverOpen"
      ref="popoverRef"
      class="color-popover"
      :style="popoverStyle"
      @click.stop
    >
      <div class="wheel-row">
        <canvas
          ref="wheelCanvasRef"
          class="wheel-canvas"
          @mousedown="onWheelMouseDown"
        />
        <div
          class="preview-swatch"
          :style="{ backgroundColor: selectedHex }"
        />
      </div>
      <div class="lightness-row">
        <span class="slider-label">L</span>
        <input
          type="range"
          class="lightness-slider"
          min="0"
          max="100"
          :value="lightness"
          :style="{ background: lightnessGradient }"
          @input="onLightnessInput"
        >
      </div>
      <div class="hex-row">
        <span class="hex-label">#</span>
        <input
          v-model="hexInput"
          type="text"
          class="hex-input"
          maxlength="7"
          placeholder="#FFFFFF"
          @change="onHexInputChange"
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-picker-circle {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--border);
  cursor: pointer;
  padding: 0;
  transition: border-color 120ms ease;
}

.color-swatch:hover {
  border-color: var(--text-muted);
}

.color-swatch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.color-popover {
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.wheel-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wheel-canvas {
  width: 150px;
  height: 150px;
  cursor: crosshair;
  border-radius: 50%;
}

.preview-swatch {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid var(--border);
  flex-shrink: 0;
}

.lightness-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.slider-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
  width: 12px;
}

.lightness-slider {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 10px;
  border-radius: 5px;
  outline: none;
  cursor: pointer;
}

.lightness-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #333;
  cursor: pointer;
}

.lightness-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #333;
  cursor: pointer;
}

.hex-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hex-label {
  font-size: 0.82rem;
  color: var(--text-muted);
  font-family: monospace;
}

.hex-input {
  flex: 1;
  background: #0f1218;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 0.82rem;
  font-family: monospace;
}
</style>
