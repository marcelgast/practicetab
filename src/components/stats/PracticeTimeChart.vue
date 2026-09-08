<script setup lang="ts">
import { computed, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import type { DailyTotal } from '../../domain/stats/types';

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip);

const props = defineProps<{
  dailyTotals: DailyTotal[];
}>();

const mode = ref<'daily' | 'weekly'>('daily');

function getAccentColor(): string {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--accent').trim() || '#7c5cfc';
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const dailyData = computed(() => {
  const today = new Date();
  const lookup = new Map(props.dailyTotals.map((d) => [d.date, d.durationSec]));
  const entries: { label: string; minutes: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const sec = lookup.get(key) ?? 0;
    entries.push({
      label: formatShortDate(key),
      minutes: Math.round(sec / 60),
    });
  }
  return entries;
});

const weeklyData = computed(() => {
  const today = new Date();
  const lookup = new Map(props.dailyTotals.map((d) => [d.date, d.durationSec]));
  const entries: { label: string; minutes: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    let totalSec = 0;
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - w * 7 - today.getDay());
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const key = day.toISOString().slice(0, 10);
      totalSec += lookup.get(key) ?? 0;
    }
    const label = formatShortDate(weekStart.toISOString().slice(0, 10));
    entries.push({ label: `W ${label}`, minutes: Math.round(totalSec / 60) });
  }
  return entries;
});

const chartData = computed(() => {
  const src = mode.value === 'daily' ? dailyData.value : weeklyData.value;
  return {
    labels: src.map((e) => e.label),
    datasets: [
      {
        data: src.map((e) => e.minutes),
        backgroundColor: getAccentColor(),
        borderRadius: 4,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      ticks: { color: '#999', maxRotation: 45 },
      grid: { color: '#333' },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: '#999',
        callback: (v: number | string) => `${v}m`,
      },
      grid: { color: '#333' },
    },
  },
}));
</script>

<template>
  <div class="chart-container">
    <div class="chart-header">
      <span class="chart-title">Practice Time</span>
      <div class="chart-toggle">
        <button
          :class="{ active: mode === 'daily' }"
          type="button"
          @click="mode = 'daily'"
        >
          Daily
        </button>
        <button
          :class="{ active: mode === 'weekly' }"
          type="button"
          @click="mode = 'weekly'"
        >
          Weekly
        </button>
      </div>
    </div>
    <div class="chart-wrapper">
      <Bar
        :data="chartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>

<style scoped>
.chart-container {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.chart-title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text);
}

.chart-toggle {
  display: flex;
  gap: 4px;
}

.chart-toggle button {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  padding: 4px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  font-family: inherit;
}

.chart-toggle button.active {
  background: var(--accent);
  color: #0b0e13;
  border-color: var(--accent);
}

.chart-wrapper {
  height: 220px;
}
</style>
