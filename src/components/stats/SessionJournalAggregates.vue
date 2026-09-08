<script setup lang="ts">
/**
 * Headline aggregates for the Stats → Session Journal tab. Sits
 * ABOVE the existing `.journal-layout` master-detail list inside
 * `SessionJournalSection.vue`. Takes the already-filtered
 * "has-journal-content" subset of sessions as a prop — keeps the
 * parent in charge of fetch / empty-state and this component
 * focused on visualisation.
 *
 * Renders three blocks:
 *   1. Headline numbers — goal-reached rate, avg completion %, N.
 *   2. Percent trend line chart — one point per session, coloured
 *      by goal-reached status.
 *   3. Weekday goal-reached breakdown — seven bars, one per
 *      weekday. Collapses to a muted empty-state when fewer than
 *      seven sessions have answered the goal-reached flag (the
 *      breakdown isn't useful until every weekday has at least
 *      one data point to normalise against).
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
import type { PracticeSession } from '../../domain/practice';
import {
  computeJournalHeadline,
  computeJournalWeekdayBreakdown,
} from '../../domain/journalAggregates';

Chart.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

const props = defineProps<{
  sessions: PracticeSession[];
}>();

/** Minimum number of weekday data points needed before the weekday
 * breakdown renders. Below this the bars are misleading — a single
 * "miss" on a Tuesday with zero Fridays makes Tuesday look worst.
 * Seven matches "one per weekday" as a rough floor. */
const WEEKDAY_MIN_DATA_POINTS = 7;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const headline = computed(() => computeJournalHeadline(props.sessions));

const weekday = computed(() => computeJournalWeekdayBreakdown(props.sessions));

const weekdayTotal = computed(() =>
  weekday.value.reduce((sum, e) => sum + e.count, 0),
);

const weekdayHasData = computed(
  () => weekdayTotal.value >= WEEKDAY_MIN_DATA_POINTS,
);

function getAccentColor(): string {
  if (typeof document === 'undefined') return '#5dd6a2';
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--accent').trim() || '#5dd6a2';
}

function getMutedColor(): string {
  if (typeof document === 'undefined') return '#a8a8b3';
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--text-muted').trim() || '#a8a8b3';
}

function formatShortDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, , m, d] = match;
  return `${Number(m)}/${Number(d)}`;
}

/** Sessions that recorded a goalPercent, sorted oldest→newest — the
 *  domain of the trend chart. Sessions without a percent are
 *  dropped (we have nothing to plot for them). */
const trendPoints = computed(() =>
  [...props.sessions]
    .filter((s) => typeof s.goalPercent === 'number')
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate)),
);

const trendChartData = computed(() => {
  const accent = getAccentColor();
  const muted = getMutedColor();
  const pointColors = trendPoints.value.map((s) =>
    s.goalReached === true ? accent : muted,
  );
  return {
    labels: trendPoints.value.map((s) => formatShortDate(s.sessionDate)),
    datasets: [
      {
        data: trendPoints.value.map((s) => s.goalPercent ?? 0),
        borderColor: `${accent}80`, // 50% alpha — the line is the
        // scaffold; the per-point dots carry the semantic colour.
        backgroundColor: pointColors,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
      },
    ],
  };
});

const trendChartOptions = computed(() => ({
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
      max: 150,
      ticks: {
        color: '#999',
        stepSize: 25,
        callback: (v: number | string) => `${v}%`,
      },
      grid: { color: '#333' },
      title: { display: true, text: 'Completion', color: '#999' },
    },
  },
}));

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)} %`;
}
</script>

<template>
  <div class="journal-aggregates">
    <!-- 1. Headline numbers -->
    <div
      class="journal-aggregates-headline"
      role="group"
      aria-label="Session journal summary"
    >
      <div class="journal-headline-card">
        <div class="journal-headline-label">
          Goal reached
        </div>
        <div class="journal-headline-value">
          {{ formatPercent(headline.goalReachedRate) }}
        </div>
        <div class="journal-headline-sub">
          {{ headline.totalWithGoalAnswered }} session<span
            v-if="headline.totalWithGoalAnswered !== 1"
          >s</span>
          answered
        </div>
      </div>
      <div class="journal-headline-card">
        <div class="journal-headline-label">
          Avg completion
        </div>
        <div class="journal-headline-value">
          {{ headline.avgPercent.toFixed(0) }} %
        </div>
        <div class="journal-headline-sub">
          {{ headline.totalWithPercent }} with a percent
        </div>
      </div>
      <div class="journal-headline-card">
        <div class="journal-headline-label">
          Total journaled
        </div>
        <div class="journal-headline-value">
          {{ headline.totalWithJournal }}
        </div>
        <div class="journal-headline-sub">
          sessions
        </div>
      </div>
    </div>

    <!-- 2. Percent trend -->
    <section
      class="journal-aggregates-section"
      aria-label="Completion trend"
    >
      <header class="journal-aggregates-section-header">
        <h4>Completion trend</h4>
        <span class="journal-aggregates-hint">
          Green = goal reached, muted = not reached
        </span>
      </header>
      <div
        v-if="trendPoints.length === 0"
        class="journal-aggregates-empty"
      >
        No sessions have recorded a completion percent yet.
      </div>
      <div
        v-else
        class="journal-trend-wrapper"
      >
        <Line
          :data="trendChartData"
          :options="trendChartOptions"
        />
      </div>
    </section>

    <!-- 3. Weekday breakdown -->
    <section
      class="journal-aggregates-section"
      aria-label="Goal reached by weekday"
    >
      <header class="journal-aggregates-section-header">
        <h4>Goal reached by weekday</h4>
      </header>
      <div
        v-if="!weekdayHasData"
        class="journal-aggregates-empty"
      >
        More sessions with a reviewed goal needed before the weekday breakdown
        is meaningful.
      </div>
      <div
        v-else
        class="journal-weekday-grid"
      >
        <div
          v-for="entry in weekday"
          :key="entry.weekday"
          class="journal-weekday-cell"
        >
          <div
            class="journal-weekday-bar"
            :aria-label="`${WEEKDAY_LABELS[entry.weekday]}: ${formatPercent(entry.rate)}`"
          >
            <div
              class="journal-weekday-bar-fill"
              :style="{ height: `${Math.round(entry.rate * 100)}%` }"
            />
          </div>
          <div class="journal-weekday-label">
            {{ WEEKDAY_LABELS[entry.weekday] }}
          </div>
          <div class="journal-weekday-sub">
            {{ entry.count }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.journal-aggregates {
  display: grid;
  gap: 14px;
}

.journal-aggregates-headline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.journal-headline-card {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  display: grid;
  gap: 4px;
}

.journal-headline-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.journal-headline-value {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.journal-headline-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.journal-aggregates-section {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #0f141d;
}

.journal-aggregates-section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.journal-aggregates-section-header h4 {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.journal-aggregates-hint {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.journal-aggregates-empty {
  padding: 16px 4px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.journal-trend-wrapper {
  position: relative;
  height: 180px;
}

.journal-weekday-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  align-items: end;
  padding-top: 4px;
}

.journal-weekday-cell {
  display: grid;
  gap: 4px;
  justify-items: center;
}

.journal-weekday-bar {
  width: 100%;
  height: 80px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}

.journal-weekday-bar-fill {
  width: 100%;
  background: var(--accent);
  border-radius: 6px 6px 0 0;
  min-height: 2px;
  transition: height 160ms ease;
}

.journal-weekday-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.journal-weekday-sub {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
