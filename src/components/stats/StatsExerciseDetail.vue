<script setup lang="ts">
import { computed } from 'vue';
import type { PerExerciseStats } from '../../domain/stats/types';
import type { FeedbackRunOverview } from '../../services/feedbackRunCommands';
import {
  formatMinutes,
  formatDate,
  formatSignedPercent,
} from '../../domain/stats/formatters';
import BpmPerformanceChart from './BpmPerformanceChart.vue';
import FeedbackScoreChart from './FeedbackScoreChart.vue';
import FeedbackRunsList from './FeedbackRunsList.vue';

const props = defineProps<{
  exercise: PerExerciseStats;
  /** All feedback runs (parent hands over the full list; we filter). */
  feedbackRuns?: FeedbackRunOverview[];
}>();

const emit = defineEmits<{
  (e: 'open-feedback', id: number): void;
}>();

/**
 * Runs scoped to this exercise. Filter runs forward by
 * `exercise_id` so the user's history-per-exercise stays accurate
 * even if they later relink the exercise to a different library
 * item.
 */
const exerciseFeedbackRuns = computed<FeedbackRunOverview[]>(() =>
  (props.feedbackRuns ?? []).filter(
    (r) => r.exerciseId === props.exercise.exerciseId,
  ),
);

const HISTORY_LIST_LIMIT = 10;

const modeLabels: Record<string, string> = {
  tab: 'Tab',
  song: 'Song',
  dual: 'Tab + Song',
  metronome: 'Metronome',
};
const modeBadgeLabel = modeLabels[props.exercise.playbackMode] ?? 'Metronome';

const activeModes = computed(() => {
  const modes = [
    { label: 'Tab', ...props.exercise.modeBreakdown.tab },
    { label: 'Song', ...props.exercise.modeBreakdown.song },
    { label: 'Tab + Song', ...props.exercise.modeBreakdown.dual },
    { label: 'Metronome', ...props.exercise.modeBreakdown.metronome },
  ];
  return modes.filter((m) => m.minutes > 0);
});
const hasMultipleModes = computed(() => activeModes.value.length > 1);

function formatTrend(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) {
    return '--';
  }
  return formatSignedPercent(percent);
}

function trendClass(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent) || percent === 0) {
    return 'trend-neutral';
  }
  return percent > 0 ? 'trend-up' : 'trend-down';
}
</script>

<template>
  <div class="exercise-detail">
    <div class="exercise-header">
      <h2 class="exercise-title">
        {{ props.exercise.exerciseTitle }}
      </h2>
      <span class="mode-badge">{{ modeBadgeLabel }}</span>
    </div>

    <!-- Stat cards grid -->
    <div class="exercise-stat-grid">
      <div class="stat-card-sm">
        <div class="stat-label">
          Exercise Time
        </div>
        <div class="stat-value">
          {{ formatMinutes(exercise.totalTimeMinutes) }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Time Played
        </div>
        <div class="stat-value">
          {{ formatMinutes(exercise.playbackTimeMinutes) }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Avg/Session
        </div>
        <div class="stat-value">
          {{ formatMinutes(exercise.avgTimePerSessionMinutes) }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Last Session
        </div>
        <div class="stat-value">
          {{ formatDate(exercise.lastSessionDate) }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Practice Days
        </div>
        <div class="stat-value">
          {{ exercise.practiceDays }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Longest Streak
        </div>
        <div class="stat-value">
          {{ exercise.longestStreakDays }}d
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Adherence
        </div>
        <div class="stat-value">
          {{
            exercise.adherencePercent !== null
              ? `${exercise.adherencePercent}%`
              : '--'
          }}
        </div>
      </div>
    </div>

    <!-- Trend vs last week -->
    <div
      class="trend-row"
      :class="trendClass(exercise.trendVsLastWeekPercent)"
    >
      <span class="trend-label">vs last week:</span>
      <span class="trend-value">{{
        formatTrend(exercise.trendVsLastWeekPercent)
      }}</span>
    </div>

    <!-- Mode breakdown -->
    <div
      v-if="hasMultipleModes"
      class="section"
    >
      <div class="section-label">
        Playback Mode Usage
      </div>
      <div class="mode-grid">
        <div
          v-for="mode in activeModes"
          :key="mode.label"
          class="mode-item"
        >
          <span class="mode-item-label">{{ mode.label }}</span>
          <span class="mode-item-value">{{ formatMinutes(mode.minutes) }}</span>
          <span class="mode-item-percent">{{ mode.percent }}%</span>
        </div>
      </div>
    </div>

    <!-- Interval stats -->
    <div
      v-if="exercise.intervalSessionsCount > 0"
      class="interval-row"
    >
      <div class="stat-card-sm">
        <div class="stat-label">
          Interval Sessions
        </div>
        <div class="stat-value">
          {{ exercise.intervalSessionsCount }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Intervals Completed
        </div>
        <div class="stat-value">
          {{ exercise.intervalsCompleted }}
        </div>
      </div>
    </div>

    <!-- BPM Performance Chart (Line chart) -->
    <div>
      <div class="section-label">
        BPM Progress
      </div>
      <BpmPerformanceChart :bpm-history="exercise.bpmHistory" />
    </div>

    <!-- Feedback history — score trend + recent runs list. Hidden
         when there are no runs yet to avoid a half-empty section
         on exercises that have never been played with Feedback on. -->
    <div v-if="exerciseFeedbackRuns.length > 0">
      <div class="section-label">
        Feedback score
      </div>
      <FeedbackScoreChart :runs="exerciseFeedbackRuns" />
      <div class="feedback-history-list">
        <FeedbackRunsList
          :runs="exerciseFeedbackRuns"
          :limit="HISTORY_LIST_LIMIT"
          @select="emit('open-feedback', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.exercise-detail {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
}

.exercise-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.exercise-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.mode-badge {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 6px;
  padding: 2px 8px;
  white-space: nowrap;
}

.exercise-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}

.stat-card-sm {
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 70px;
}

.stat-label {
  font-size: 0.72rem;
  color: var(--muted);
}

.stat-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  text-align: right;
}

.trend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  padding: 4px 0;
}

.trend-label {
  color: var(--muted);
}

.trend-neutral .trend-value {
  color: var(--muted);
}

.trend-up .trend-value {
  color: #4ade80;
}

.trend-down .trend-value {
  color: #f87171;
}

.interval-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}

.section-label {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text);
  margin-bottom: 4px;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
}

.mode-item {
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 60px;
}

.mode-item-label {
  font-size: 0.72rem;
  color: var(--muted);
}

.mode-item-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}

.mode-item-percent {
  font-size: 0.72rem;
  color: var(--accent);
  text-align: right;
}

.feedback-history-list {
  margin-top: 10px;
}
</style>
