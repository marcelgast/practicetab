<script setup lang="ts">
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart, ArcElement, Tooltip as ChartTooltip, Legend } from 'chart.js';
import type { TimeBreakdown } from '../../domain/stats/timeBreakdown';
import { formatMinutes } from '../../domain/stats/formatters';

Chart.register(ArcElement, ChartTooltip, Legend);

const props = defineProps<{
  breakdown: TimeBreakdown;
  title?: string;
}>();

function getAccentColor(): string {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--accent').trim() || '#7c5cfc';
}

function mix(opacityPct: number): string {
  // Static fallback so happy-dom (no real computed colours) still renders.
  return `color-mix(in srgb, ${getAccentColor()} ${opacityPct}%, transparent)`;
}

const chartData = computed(() => {
  const b = props.breakdown;
  // General vs Exercise = how session time was spent; Playback is the
  // "time actually playing" counterpart and overlaps with either of them
  // so we show it as an outer ring in a separate slice tier.
  return {
    labels: ['General', 'Exercise', 'Time Played'],
    datasets: [
      {
        data: [
          Math.round(b.generalSeconds / 60),
          Math.round(b.exerciseSelectedSeconds / 60),
          Math.round(b.playbackSeconds / 60),
        ],
        backgroundColor: [mix(35), mix(70), getAccentColor()],
        borderColor: 'rgba(0,0,0,0.15)',
        borderWidth: 1,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        color: '#e6ebf5',
        boxWidth: 12,
        padding: 10,
        font: { size: 12 },
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx: { label: string; parsed: number }) =>
          `${ctx.label}: ${formatMinutes(ctx.parsed)}`,
      },
    },
  },
  cutout: '55%',
}));

const hasAnyData = computed(() => {
  const b = props.breakdown;
  return (
    b.generalSeconds > 0 ||
    b.exerciseSelectedSeconds > 0 ||
    b.playbackSeconds > 0
  );
});
</script>

<template>
  <section
    class="time-donut"
    :aria-label="title ?? 'Lifetime time breakdown'"
  >
    <header
      v-if="title"
      class="time-donut__title"
    >
      {{ title }}
    </header>
    <div
      v-if="hasAnyData"
      class="time-donut__wrapper"
    >
      <Doughnut
        :data="chartData"
        :options="chartOptions"
      />
    </div>
    <p
      v-else
      class="time-donut__empty"
    >
      No practice time yet — start the timer to see the breakdown.
    </p>
  </section>
</template>

<style scoped>
.time-donut {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  min-height: 260px;
}

.time-donut__title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}

.time-donut__wrapper {
  height: 220px;
}

.time-donut__empty {
  margin: auto 0;
  font-size: 0.85rem;
  color: var(--muted);
  text-align: center;
}
</style>
