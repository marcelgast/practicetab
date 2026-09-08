<script setup lang="ts">
import type { StatsSnapshot } from '../../domain/stats/types';
import {
  formatMinutes,
  formatWeekday,
  formatSignedPercent,
} from '../../domain/stats/formatters';
import ActivityHeatmap from './ActivityHeatmap.vue';
import RatioTrendChart from './RatioTrendChart.vue';

defineProps<{
  stats: StatsSnapshot;
}>();
</script>

<template>
  <div class="stats-trends">
    <!-- Activity Heatmap (full width) -->
    <section class="section">
      <ActivityHeatmap :daily-totals="stats.trends.dailyTotals" />
    </section>

    <!-- Played / Exercise / Session ratios over the last 30 days -->
    <section class="section">
      <RatioTrendChart :trend="stats.ratioTrend" />
    </section>

    <!-- This Week -->
    <section class="section">
      <h3 class="section-title">
        This Week
      </h3>
      <div class="stat-grid cols-3">
        <div class="stat-card">
          <div class="stat-label">
            Sessions
          </div>
          <div class="stat-value">
            {{ stats.trends.sessionsThisWeek }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Best Day
          </div>
          <div class="stat-value">
            {{ formatWeekday(stats.trends.bestDayThisWeek.date) }}
            ({{ stats.trends.bestDayThisWeek.minutes }}m)
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Week over Week
          </div>
          <div class="stat-value">
            {{ formatSignedPercent(stats.trends.weekOverWeekChangePercent) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Top Plan
          </div>
          <div class="stat-value">
            {{ stats.trends.topPracticedPlanThisWeek.title }}
            ({{ stats.trends.topPracticedPlanThisWeek.minutes }}m)
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Most Improved
          </div>
          <div class="stat-value">
            {{ stats.trends.mostImprovedExerciseThisWeek.title }}
            (+{{ stats.trends.mostImprovedExerciseThisWeek.deltaMinutes }}m)
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Most Consistent Day
          </div>
          <div class="stat-value">
            {{ stats.trends.mostConsistentWeekday.label }}
            ({{ stats.trends.mostConsistentWeekday.minutes }}m)
          </div>
        </div>
      </div>
    </section>

    <!-- Weekly Totals -->
    <section
      v-if="stats.trends.weeklyTotals.length > 0"
      class="section"
    >
      <h3 class="section-title">
        Weekly Totals
      </h3>
      <div class="stat-grid cols-4">
        <div
          v-for="week in stats.trends.weeklyTotals"
          :key="week.label"
          class="stat-card compact"
        >
          <div class="stat-label">
            {{ week.label }}
          </div>
          <div class="stat-value">
            {{ formatMinutes(week.minutes) }}
          </div>
        </div>
      </div>
    </section>

    <!-- Averages -->
    <section class="section">
      <h3 class="section-title">
        Averages
      </h3>
      <div class="stat-grid cols-3">
        <div class="stat-card">
          <div class="stat-label">
            Avg / day (7d)
          </div>
          <div class="stat-value">
            {{ stats.trends.avgMinutesPerDay7 }}m
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Avg / day (14d)
          </div>
          <div class="stat-value">
            {{ stats.trends.avgMinutesPerDay14 }}m
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Avg / day (30d)
          </div>
          <div class="stat-value">
            {{ stats.trends.avgMinutesPerDay30 }}m
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Avg session (7d)
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.trends.avgSessionMinutes7) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Avg session (30d)
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.trends.avgSessionMinutes30) }}
          </div>
        </div>
      </div>
    </section>

    <!-- Consistency -->
    <section class="section">
      <h3 class="section-title">
        Consistency
      </h3>
      <div class="consistency-row">
        <div class="stat-grid cols-3">
          <div class="stat-card">
            <div class="stat-label">
              Practice days (7d)
            </div>
            <div class="stat-value">
              {{ stats.trends.practiceDaysLast7 }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">
              Practice days (14d)
            </div>
            <div class="stat-value">
              {{ stats.trends.practiceDaysLast14 }}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">
              Practice days (30d)
            </div>
            <div class="stat-value">
              {{ stats.trends.practiceDaysLast30 }}
            </div>
          </div>
        </div>
        <div class="weekday-table">
          <div class="stat-label weekday-title">
            Time per weekday
          </div>
          <div class="weekday-grid">
            <div
              v-for="day in stats.trends.weekdayTotals"
              :key="day.label"
              class="weekday-item"
            >
              <span class="weekday-label">{{ day.label }}</span>
              <span class="weekday-value">{{ day.minutes }}m</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats-trends {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--accent);
  margin: 0;
  padding-bottom: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
}

.stat-grid {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.cols-4 {
  grid-template-columns: repeat(4, 1fr);
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

.stat-card.compact {
  min-height: 60px;
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

.consistency-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.weekday-table {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
}

.weekday-title {
  margin-bottom: 6px;
}

.weekday-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.weekday-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.weekday-label {
  font-size: 0.7rem;
  color: var(--muted);
  font-weight: 500;
}

.weekday-value {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text);
}
</style>
