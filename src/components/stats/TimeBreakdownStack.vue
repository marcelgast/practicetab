<script setup lang="ts">
import { computed } from 'vue';
import type { TimeBreakdown } from '../../domain/stats/timeBreakdown';
import { formatMinutes } from '../../domain/stats/formatters';

const props = defineProps<{
  breakdown: TimeBreakdown;
  /** Heading rendered above the chart, e.g. "Today" or "Lifetime". */
  title?: string;
}>();

type Segment = {
  label: string;
  seconds: number;
  colorVar: string;
};

const segments = computed<Segment[]>(() => {
  const b = props.breakdown;
  return [
    {
      label: 'General',
      seconds: b.generalSeconds,
      colorVar: 'color-mix(in srgb, var(--accent) 35%, transparent)',
    },
    {
      label: 'Exercise',
      seconds: b.exerciseSelectedSeconds,
      colorVar: 'color-mix(in srgb, var(--accent) 70%, transparent)',
    },
    {
      label: 'Time Played',
      seconds: b.playbackSeconds,
      colorVar: 'var(--accent)',
    },
  ];
});

const sessionMinutes = computed(
  () => Math.round((props.breakdown.sessionSeconds / 60) * 10) / 10,
);

const totalForStack = computed(() => {
  const b = props.breakdown;
  // Stack visualises how General + Exercise fill the session bar. Playback
  // is shown as a sibling bar because it can overlap with exercise time.
  return Math.max(1, b.generalSeconds + b.exerciseSelectedSeconds);
});

function stackPercent(seconds: number): number {
  if (totalForStack.value === 0) return 0;
  return Math.round((seconds / totalForStack.value) * 100);
}
</script>

<template>
  <section
    class="time-breakdown"
    :aria-label="title ?? 'Time breakdown'"
  >
    <header
      v-if="title"
      class="time-breakdown__title"
    >
      {{ title }}
    </header>

    <div class="time-breakdown__row">
      <div class="time-breakdown__row-label">
        Global Practice
      </div>
      <div class="time-breakdown__bar">
        <div
          v-for="segment in segments.slice(0, 2)"
          :key="segment.label"
          class="time-breakdown__segment"
          :style="{
            width: `${stackPercent(segment.seconds)}%`,
            background: segment.colorVar,
          }"
          :aria-label="`${segment.label}: ${formatMinutes(segment.seconds / 60)}`"
        />
      </div>
      <div class="time-breakdown__total">
        {{ formatMinutes(sessionMinutes) }}
      </div>
    </div>

    <div class="time-breakdown__row">
      <div class="time-breakdown__row-label">
        Time Played
      </div>
      <div class="time-breakdown__bar">
        <div
          class="time-breakdown__segment"
          :style="{
            width:
              sessionMinutes > 0
                ? `${Math.min(100, Math.round((breakdown.playbackSeconds / Math.max(1, breakdown.sessionSeconds)) * 100))}%`
                : '0%',
            background: segments[2].colorVar,
          }"
          :aria-label="`Time played: ${formatMinutes(breakdown.playbackSeconds / 60)}`"
        />
      </div>
      <div class="time-breakdown__total">
        {{ formatMinutes(breakdown.playbackSeconds / 60) }}
      </div>
    </div>

    <ul class="time-breakdown__legend">
      <li
        v-for="segment in segments"
        :key="segment.label"
      >
        <span
          class="time-breakdown__swatch"
          :style="{ background: segment.colorVar }"
          aria-hidden="true"
        />
        <span class="time-breakdown__legend-label">{{ segment.label }}</span>
        <span class="time-breakdown__legend-value">{{
          formatMinutes(segment.seconds / 60)
        }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.time-breakdown {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.time-breakdown__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}

.time-breakdown__row {
  display: grid;
  grid-template-columns: 110px 1fr 80px;
  gap: 10px;
  align-items: center;
}

.time-breakdown__row-label {
  font-size: 0.8rem;
  color: var(--muted);
}

.time-breakdown__bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.time-breakdown__segment {
  height: 100%;
  transition: width 250ms ease-out;
}

.time-breakdown__total {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.time-breakdown__legend {
  list-style: none;
  padding: 0;
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.time-breakdown__legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--muted);
}

.time-breakdown__swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.time-breakdown__legend-label {
  color: var(--text);
}

.time-breakdown__legend-value {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
</style>
