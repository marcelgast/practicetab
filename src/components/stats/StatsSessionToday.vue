<script setup lang="ts">
import { Flame } from 'lucide-vue-next';
import type { StatsSnapshot } from '../../domain/stats/types';
import { formatMinutes, formatStreakDays } from '../../domain/stats/formatters';
import PracticeTimeChart from './PracticeTimeChart.vue';
import TimeBreakdownStack from './TimeBreakdownStack.vue';

defineProps<{
  stats: StatsSnapshot;
}>();
</script>

<template>
  <div class="stats-session-today">
    <!-- Streak / goal summary row -->
    <div class="summary-row">
      <div class="stat-card highlight streak-card">
        <div class="stat-label">
          Current streak
        </div>
        <div class="stat-value">
          {{ formatStreakDays(stats.habits.currentStreakDays) }}
        </div>
        <Flame
          class="streak-icon"
          :size="28"
          aria-hidden="true"
        />
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Longest streak
        </div>
        <div class="stat-value">
          {{ formatStreakDays(stats.habits.longestStreakDays) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Weekly streak goal
        </div>
        <div class="stat-value">
          {{ stats.habits.weeklyGoalLabel }}
        </div>
      </div>
    </div>

    <!-- Practice Time Chart -->
    <PracticeTimeChart :daily-totals="stats.trends.dailyTotals" />

    <!-- Today's Session / Exercise / Playback split -->
    <TimeBreakdownStack
      title="Today's Time Breakdown"
      :breakdown="stats.todayBreakdown"
    />

    <!-- Session / Today stat cards -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">
          Time Practiced
        </div>
        <div class="stat-value">
          {{ formatMinutes(stats.today.minutesPracticed) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Sessions today
        </div>
        <div class="stat-value">
          {{ stats.today.sessionsCount }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Avg session length (today)
        </div>
        <div class="stat-value">
          {{ formatMinutes(stats.today.avgSessionMinutes) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Exercises practiced
        </div>
        <div class="stat-value">
          {{ stats.today.exercisesPracticed }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Exercises completed
        </div>
        <div class="stat-value">
          {{ stats.today.exercisesCompleted }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Plan adherence
        </div>
        <div class="stat-value">
          {{ stats.today.planAdherencePercent }}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Longest exercise run
        </div>
        <div class="stat-value">
          {{ formatMinutes(stats.today.longestExerciseRunMinutes) }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Most practiced exercise
        </div>
        <div class="stat-value">
          {{ stats.today.mostPracticedExerciseTitle }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          Tabs practiced
        </div>
        <div class="stat-value">
          {{ stats.today.tabsPracticed }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-session-today {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.summary-row .stat-card {
  min-height: 90px;
  padding: 10px 12px;
}

.streak-card {
  position: relative;
}

.streak-icon {
  position: absolute;
  left: 12px;
  bottom: 8px;
  opacity: 0.75;
}

.stat-card.highlight {
  background: var(--accent);
  color: #0b0e13;
  border-color: rgba(0, 0, 0, 0.2);
}

.stat-card.highlight .stat-label,
.stat-card.highlight .stat-value {
  color: #0b0e13;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.stat-card {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 10px;
  min-height: 80px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--muted);
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
  text-align: right;
}
</style>
