<script setup lang="ts">
import { computed, ref } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import type { RatioTrendEntry } from '../../domain/stats/types';

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  ChartTooltip,
  Legend,
);

const props = defineProps<{
  trend: RatioTrendEntry[];
}>();

type Mode = 'playback-exercise' | 'exercise-session';
const mode = ref<Mode>('playback-exercise');

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getAccentColor(): string {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--accent').trim() || '#7c5cfc';
}

const chartData = computed(() => {
  const labels = props.trend.map((entry) => formatShortDate(entry.date));
  const values = props.trend.map((entry) => {
    if (mode.value === 'playback-exercise') {
      // Share of exercise-selected time that was actually played — uses
      // exercise-bucket playback only, so a day of general metronome
      // practice can't push the ratio above 100%. Computed in seconds
      // so sub-minute totals (e.g. 30s vs 29s) don't flatten to 0/100.
      if (entry.exerciseSeconds === 0) return 0;
      return Math.min(
        100,
        Math.round(
          (entry.exercisePlaybackSeconds / entry.exerciseSeconds) * 100,
        ),
      );
    }
    if (entry.sessionSeconds === 0) return 0;
    return Math.min(
      100,
      Math.round((entry.exerciseSeconds / entry.sessionSeconds) * 100),
    );
  });
  const accent = getAccentColor();
  return {
    labels,
    datasets: [
      {
        label:
          mode.value === 'playback-exercise'
            ? 'Time Played / Exercise Time'
            : 'Exercise Time / Global Practice',
        data: values,
        borderColor: accent,
        backgroundColor: `color-mix(in srgb, ${accent} 20%, transparent)`,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { y: number | null } }) =>
          `${ctx.parsed.y ?? 0}%`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: '#999', maxRotation: 45 },
      grid: { color: '#333' },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: '#999',
        callback: (v: number | string) => `${v}%`,
      },
      grid: { color: '#333' },
    },
  },
}));
</script>

<template>
  <section class="ratio-trend">
    <div class="ratio-trend__header">
      <span class="ratio-trend__title">Practice Ratio</span>
      <div class="ratio-trend__toggle">
        <button
          :class="{ active: mode === 'playback-exercise' }"
          type="button"
          @click="mode = 'playback-exercise'"
        >
          Played / Exercise
        </button>
        <button
          :class="{ active: mode === 'exercise-session' }"
          type="button"
          @click="mode = 'exercise-session'"
        >
          Exercise / Session
        </button>
      </div>
    </div>
    <div class="ratio-trend__wrapper">
      <Line
        :data="chartData"
        :options="chartOptions"
      />
    </div>
    <p class="ratio-trend__caption">
      {{
        mode === 'playback-exercise'
          ? 'How much of the exercise time was actually spent playing.'
          : 'How focused each session was on specific exercises.'
      }}
    </p>
  </section>
</template>

<style scoped>
.ratio-trend {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.ratio-trend__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ratio-trend__title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text);
}

.ratio-trend__toggle {
  display: flex;
  gap: 4px;
}

.ratio-trend__toggle button {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  padding: 4px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  font-family: inherit;
}

.ratio-trend__toggle button.active {
  background: var(--accent);
  color: #0b0e13;
  border-color: var(--accent);
}

.ratio-trend__wrapper {
  height: 220px;
}

.ratio-trend__caption {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
}
</style>
