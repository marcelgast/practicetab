<script setup lang="ts">
import { computed, ref } from 'vue';

export type TimelineMarker = {
  bar: number;
  color?: string;
};

export type TimelineRange = {
  startBar: number;
  endBar: number;
  color?: string;
};

const props = withDefaults(
  defineProps<{
    endBar: number;
    markers?: TimelineMarker[];
    ranges?: TimelineRange[];
    highlightedBar?: number | null;
  }>(),
  {
    markers: () => [],
    ranges: () => [],
    highlightedBar: null,
  },
);

const emit = defineEmits<{
  'bar-click': [bar: number];
}>();

const containerRef = ref<HTMLElement | null>(null);

const BAR_WIDTH_PX = 40;

const totalBars = computed(() => Math.max(1, props.endBar));

const timelineWidth = computed(() => totalBars.value * BAR_WIDTH_PX);

const tickInterval = computed(() => {
  if (totalBars.value <= 20) return 1;
  if (totalBars.value <= 50) return 5;
  if (totalBars.value <= 200) return 10;
  return 20;
});

const ticks = computed(() => {
  const result: number[] = [];
  const interval = tickInterval.value;
  for (let bar = 1; bar <= totalBars.value; bar += interval) {
    result.push(bar);
  }
  if (result[result.length - 1] !== totalBars.value) {
    result.push(totalBars.value);
  }
  return result;
});

function barToPercent(bar: number): number {
  if (totalBars.value <= 1) return 0;
  return ((bar - 1) / (totalBars.value - 1)) * 100;
}

function handleClick(event: MouseEvent): void {
  const el = containerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const scrollLeft = el.scrollLeft;
  const x = event.clientX - rect.left + scrollLeft;
  const bar = Math.max(
    1,
    Math.min(totalBars.value, Math.round(x / BAR_WIDTH_PX) + 1),
  );
  emit('bar-click', bar);
}
</script>

<template>
  <div
    ref="containerRef"
    class="bar-timeline"
    @click="handleClick"
  >
    <div
      class="bar-timeline-track"
      :style="{ width: `${timelineWidth}px` }"
    >
      <!-- Bar ticks -->
      <div class="bar-ticks">
        <span
          v-for="bar in ticks"
          :key="bar"
          class="bar-tick"
          :class="{ 'bar-tick--highlighted': highlightedBar === bar }"
          :style="{ left: `${barToPercent(bar)}%` }"
        >
          {{ bar }}
        </span>
      </div>

      <!-- Ruler line -->
      <div class="bar-ruler">
        <!-- Tempo marker pips on the ruler -->
        <span
          v-for="(marker, i) in markers"
          :key="`mp-${i}`"
          class="bar-ruler-pip"
          :style="{
            left: `${barToPercent(marker.bar)}%`,
            '--pip-color': marker.color ?? 'var(--accent)',
          }"
        />
      </div>

      <!-- Marker bar numbers -->
      <div
        v-if="markers.length > 0"
        class="bar-markers-row"
      >
        <span
          v-for="(marker, i) in markers"
          :key="`m-${i}`"
          class="bar-marker-num"
          :style="{
            left: `${barToPercent(marker.bar)}%`,
            '--marker-color': marker.color ?? 'var(--accent)',
          }"
        >
          {{ marker.bar }}
        </span>
      </div>

      <!-- Loop ranges -->
      <div
        v-if="ranges.length > 0"
        class="bar-ranges-row"
      >
        <div
          v-for="(range, i) in ranges"
          :key="`r-${i}`"
          class="bar-range"
          :style="{
            left: `${barToPercent(range.startBar)}%`,
            width: `${barToPercent(range.endBar) - barToPercent(range.startBar)}%`,
            '--range-color': range.color ?? 'var(--accent)',
          }"
        >
          <span class="bar-range-num bar-range-num--start">
            {{ range.startBar }}
          </span>
          <span class="bar-range-num bar-range-num--end">
            {{ range.endBar }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar-timeline {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg, #0c0f14);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px 8px;
  overflow-x: auto;
  overflow-y: hidden;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}

.bar-timeline-track {
  position: relative;
  min-width: 100%;
}

/* Bar number ticks */
.bar-ticks {
  position: relative;
  height: 18px;
}

.bar-tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bar-tick--highlighted {
  color: var(--accent);
  font-weight: 600;
}

/* Ruler line with marker pips */
.bar-ruler {
  position: relative;
  height: 6px;
  background: var(--border);
  border-radius: 1px;
  margin: 2px 0;
}

.bar-ruler-pip {
  position: absolute;
  top: -1px;
  width: 3px;
  height: 8px;
  background: var(--pip-color);
  border-radius: 1px;
  transform: translateX(-50%);
}

/* Marker bar numbers */
.bar-markers-row {
  position: relative;
  height: 16px;
  margin-top: 2px;
}

.bar-marker-num {
  position: absolute;
  transform: translateX(-50%);
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--marker-color);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Loop ranges */
.bar-ranges-row {
  position: relative;
  height: 22px;
  margin-top: 4px;
}

.bar-range {
  position: absolute;
  top: 0;
  height: 20px;
  background: color-mix(in srgb, var(--range-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--range-color) 40%, transparent);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  min-width: 30px;
}

.bar-range-num {
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1;
  color: var(--range-color);
  font-weight: 600;
}

.bar-range-num--end {
  opacity: 0.6;
}
</style>
