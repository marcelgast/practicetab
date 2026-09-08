<script setup lang="ts">
/**
 * Score-over-time line chart for Live-Feedback runs. Mirrors
 * `BpmPerformanceChart` shape (Chart.js / vue-chartjs, same
 * styling, same accent colour) so the two sit next to each other
 * on the exercise detail page without feeling disparate.
 *
 * Y-axis is pinned to 0..100 (score range) so cross-exercise
 * comparisons stay visually honest. Empty state renders a muted
 * overlay.
 */
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { FeedbackRunOverview } from '../../services/feedbackRunCommands';

Chart.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

const props = defineProps<{
  runs: FeedbackRunOverview[];
}>();

function getAccentColor(): string {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--accent').trim() || '#7c5cfc';
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Chronological order for the plot regardless of how the list came
// in — the store ships newest-first for the list UI but the chart
// reads left-to-right.
const sorted = computed(() =>
  [...props.runs].sort((a, b) => a.endedAt.localeCompare(b.endedAt)),
);

const chartData = computed(() => {
  const accent = getAccentColor();
  return {
    labels: sorted.value.map((r) => formatShortDate(r.endedAt)),
    datasets: [
      {
        data: sorted.value.map((r) => r.overallScore),
        borderColor: accent,
        backgroundColor: accent,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
      },
    ],
  };
});

const emptyChartData = computed(() => ({
  labels: ['', '', '', '', ''],
  datasets: [{ data: [], borderColor: 'transparent' }],
}));

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      ticks: { color: '#999' },
      grid: { color: '#333' },
    },
    y: {
      min: 0,
      max: 100,
      ticks: {
        color: '#999',
        stepSize: 25,
        callback: (v: number | string) => `${v}`,
      },
      grid: { color: '#333' },
      title: { display: true, text: 'Score', color: '#999' },
    },
  },
}));
</script>

<template>
  <div class="score-chart-container">
    <div class="chart-wrapper">
      <div
        v-if="runs.length === 0"
        class="score-empty-overlay"
      >
        No feedback runs yet
      </div>
      <Line
        :data="runs.length > 0 ? chartData : emptyChartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>

<style scoped>
.score-chart-container {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.chart-wrapper {
  position: relative;
  height: 180px;
}

.score-empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 0.85rem;
  z-index: 1;
  pointer-events: none;
}
</style>
