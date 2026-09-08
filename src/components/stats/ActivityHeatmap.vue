<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DailyTotal } from '../../domain/stats/types';

const props = defineProps<{
  dailyTotals: DailyTotal[];
}>();

const WEEKS = 52;
const DAYS_PER_WEEK = 7;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

type CellData = {
  date: string;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  weekIdx: number;
  dayIdx: number;
};

const tooltip = ref<{ text: string; x: number; y: number } | null>(null);

const cells = computed<CellData[]>(() => {
  const lookup = new Map(
    props.dailyTotals.map((d) => [d.date, Math.round(d.durationSec / 60)]),
  );

  const today = new Date();
  const todayDay = today.getDay();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + (6 - todayDay));

  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - WEEKS * DAYS_PER_WEEK + 1);

  const allMinutes: number[] = [];
  const result: CellData[] = [];

  const cursor = new Date(startDate);
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const key = cursor.toISOString().slice(0, 10);
      const minutes = lookup.get(key) ?? 0;
      allMinutes.push(minutes);
      result.push({ date: key, minutes, level: 0, weekIdx: w, dayIdx: d });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const practiced = allMinutes.filter((m) => m > 0).sort((a, b) => a - b);
  if (practiced.length === 0) {
    return result;
  }
  const p33 = practiced[Math.floor(practiced.length * 0.33)] ?? 1;
  const p66 = practiced[Math.floor(practiced.length * 0.66)] ?? 2;

  for (const cell of result) {
    if (cell.minutes === 0) {
      cell.level = 0;
    } else if (cell.minutes <= p33) {
      cell.level = 1;
    } else if (cell.minutes <= p66) {
      cell.level = 2;
    } else {
      cell.level = 3;
    }
  }

  return result;
});

const weeks = computed(() => {
  const grouped: CellData[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    grouped.push(cells.value.filter((c) => c.weekIdx === w));
  }
  return grouped;
});

const monthLabels = computed(() => {
  const labels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const firstDay = cells.value.find((c) => c.weekIdx === w && c.dayIdx === 0);
    if (!firstDay) {
      continue;
    }
    const month = new Date(`${firstDay.date}T00:00:00`).getMonth();
    if (month !== lastMonth) {
      labels.push({ label: MONTH_LABELS[month], col: w });
      lastMonth = month;
    }
  }
  return labels;
});

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function showTooltip(cell: CellData, event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const parentRect = target.closest('.heatmap-grid')?.getBoundingClientRect();
  if (!parentRect) {
    return;
  }
  tooltip.value = {
    text: `${formatDate(cell.date)}: ${cell.minutes}m`,
    x: rect.left - parentRect.left + rect.width / 2,
    y: rect.top - parentRect.top - 4,
  };
}

function hideTooltip(): void {
  tooltip.value = null;
}
</script>

<template>
  <div class="heatmap-container">
    <div class="heatmap-header">
      <span class="chart-title">Activity</span>
    </div>
    <div class="heatmap-body">
      <div class="day-labels">
        <div
          v-for="(label, i) in DAY_LABELS"
          :key="i"
          class="day-label"
        >
          {{ label }}
        </div>
      </div>
      <div class="heatmap-grid">
        <div class="month-row">
          <div
            v-for="ml in monthLabels"
            :key="ml.col"
            class="month-label"
            :style="{ gridColumn: ml.col + 1 }"
          >
            {{ ml.label }}
          </div>
        </div>
        <div class="cells-grid">
          <div
            v-for="(week, wi) in weeks"
            :key="wi"
            class="week-col"
          >
            <div
              v-for="cell in week"
              :key="cell.date"
              class="cell"
              :class="`level-${cell.level}`"
              @mouseenter="showTooltip(cell, $event)"
              @mouseleave="hideTooltip"
            />
          </div>
        </div>
        <div
          v-if="tooltip"
          class="tooltip"
          :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
        >
          {{ tooltip.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap-container {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.heatmap-header {
  margin-bottom: 8px;
}

.chart-title {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text);
}

.heatmap-body {
  display: flex;
  gap: 4px;
  overflow-x: auto;
}

.day-labels {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 18px;
}

.day-label {
  height: 12px;
  font-size: 0.6rem;
  color: var(--muted);
  line-height: 12px;
}

.heatmap-grid {
  position: relative;
  flex: 1;
  min-width: 0;
}

.month-row {
  display: grid;
  grid-template-columns: repeat(52, 1fr);
  gap: 2px;
  height: 16px;
  margin-bottom: 2px;
}

.month-label {
  font-size: 0.6rem;
  color: var(--muted);
  white-space: nowrap;
}

.cells-grid {
  display: grid;
  grid-template-columns: repeat(52, 1fr);
  gap: 2px;
}

.week-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell {
  aspect-ratio: 1;
  width: 100%;
  border-radius: 2px;
  cursor: default;
}

.cell.level-0 {
  background: #1a1d24;
}

.cell.level-1 {
  background: color-mix(in srgb, var(--accent) 25%, #1a1d24);
}

.cell.level-2 {
  background: color-mix(in srgb, var(--accent) 55%, #1a1d24);
}

.cell.level-3 {
  background: var(--accent);
}

.tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  background: #222;
  color: #eee;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
</style>
