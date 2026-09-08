<script setup lang="ts">
import { Flame } from 'lucide-vue-next';
import type { StatsSnapshot } from '../../domain/stats/types';
import { formatMinutes, formatStreakDays } from '../../domain/stats/formatters';
import PracticeTimeChart from './PracticeTimeChart.vue';
import ActivityHeatmap from './ActivityHeatmap.vue';

defineProps<{
  stats: StatsSnapshot;
}>();
</script>

<template>
  <div class="stats-home">
    <!-- Streak + Goal summary (same design as Session/Today) -->
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
    <section class="section">
      <PracticeTimeChart :daily-totals="stats.trends.dailyTotals" />
    </section>

    <!-- Activity Heatmap -->
    <section class="section">
      <ActivityHeatmap :daily-totals="stats.trends.dailyTotals" />
    </section>

    <!-- Quick stats -->
    <section class="section">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">
            Today
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.today.minutesPracticed) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            This Week
          </div>
          <div class="stat-value">
            {{ stats.trends.sessionsThisWeek }} sessions
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Lifetime
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.lifetimeMinutes) }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats-home {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

.section {
  min-width: 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
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
