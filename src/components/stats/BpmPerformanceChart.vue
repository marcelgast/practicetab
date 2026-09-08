<script setup lang="ts">
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

Chart.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

const props = defineProps<{
  bpmHistory: { date: string; bpm: number }[];
}>();

function getAccentColor(): string {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--accent').trim() || '#7c5cfc';
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const sorted = computed(() =>
  [...props.bpmHistory].sort((a, b) => a.date.localeCompare(b.date)),
);

const chartData = computed(() => {
  const accent = getAccentColor();
  return {
    labels: sorted.value.map((e) => formatShortDate(e.date)),
    datasets: [
      {
        data: sorted.value.map((e) => e.bpm),
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
  datasets: [
    {
      data: [],
      borderColor: 'transparent',
    },
  ],
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
      beginAtZero: false,
      ticks: {
        color: '#999',
        callback: (v: number | string) => `${v}`,
      },
      grid: { color: '#333' },
      title: {
        display: true,
        text: 'BPM',
        color: '#999',
      },
    },
  },
}));
</script>

<template>
  <div class="bpm-chart-container">
    <div class="chart-wrapper">
      <div
        v-if="bpmHistory.length === 0"
        class="bpm-empty-overlay"
      >
        No BPM data recorded yet
      </div>
      <Line
        :data="bpmHistory.length > 0 ? chartData : emptyChartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>

<style scoped>
.bpm-chart-container {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.chart-wrapper {
  position: relative;
  height: 180px;
}

.bpm-empty-overlay {
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
