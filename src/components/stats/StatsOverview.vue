<script setup lang="ts">
import type { StatsSnapshot } from '../../domain/stats/types';
import {
  formatMinutes,
  formatSecondsAsClock,
  formatSignedNumber,
} from '../../domain/stats/formatters';
import TimeBreakdownDonut from './TimeBreakdownDonut.vue';

defineProps<{
  stats: StatsSnapshot;
}>();
</script>

<template>
  <div class="stats-overview">
    <!-- Session journal engagement. Neutral framing on purpose —
         surfaces how often the user journals without nagging them
         when the rate is low. -->
    <section
      v-if="stats.journalEngagement.total > 0"
      class="section"
    >
      <h3 class="section-title">
        Session journal
      </h3>
      <div class="stat-grid cols-3">
        <div class="stat-card stat-card--wide">
          <div class="stat-label">
            Goal tracked (last
            {{ stats.journalEngagement.windowDays ?? 0 }} days)
          </div>
          <div class="stat-value">
            {{ stats.journalEngagement.tracked }} of
            {{ stats.journalEngagement.total }}
            <span class="stat-sub">
              ({{ Math.round(stats.journalEngagement.rate * 100) }} %)
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Lifetime -->
    <section class="section">
      <h3 class="section-title">
        Lifetime
      </h3>
      <div class="stat-grid cols-3">
        <div class="stat-card">
          <div class="stat-label">
            Global Practice
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.lifetimeMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Exercise Time
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.lifetimeExerciseMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Time Played
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.lifetimePlaybackMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Timed
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.timedPracticeMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Untimed
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.untimedPracticeMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Longest Session
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.longestSessionMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Tabs Linked
          </div>
          <div class="stat-value">
            {{ stats.deepDive.totalTabsLinked }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Tab Coverage
          </div>
          <div class="stat-value">
            {{ stats.deepDive.tabLinkCoveragePercent }}%
          </div>
        </div>
      </div>
    </section>

    <!-- Global Practice / Exercise / Time Played distribution -->
    <section class="section">
      <h3 class="section-title">
        Lifetime Time Breakdown
      </h3>
      <TimeBreakdownDonut :breakdown="stats.lifetimeBreakdown" />
    </section>

    <!-- Playback Modes -->
    <section class="section">
      <h3 class="section-title">
        Playback Modes
      </h3>
      <div class="stat-grid cols-4">
        <div class="stat-card">
          <div class="stat-label">
            Tab
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.playbackModes.tabMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Song
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.playbackModes.songMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Dual (Tab + Song)
          </div>
          <div class="stat-value">
            {{ formatMinutes(stats.deepDive.playbackModes.dualMinutes) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Metronome Only
          </div>
          <div class="stat-value">
            {{
              formatMinutes(stats.deepDive.playbackModes.metronomeOnlyMinutes)
            }}
          </div>
        </div>
      </div>
    </section>

    <!-- Highlights -->
    <section class="section">
      <h3 class="section-title">
        Highlights
      </h3>
      <div class="stat-grid cols-3">
        <div class="stat-card">
          <div class="stat-label">
            Most Practiced Plan
          </div>
          <div class="stat-value">
            {{ stats.deepDive.mostPracticedPlan.title }}
            ({{ stats.deepDive.mostPracticedPlan.minutes }}m)
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Most Practiced Exercise
          </div>
          <div class="stat-value">
            {{ stats.deepDive.mostPracticedExercise.title }}
            ({{ stats.deepDive.mostPracticedExercise.minutes }}m)
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Most Consistent
          </div>
          <div class="stat-value">
            {{ stats.deepDive.mostConsistentExercise.title }}
            ({{ stats.deepDive.mostConsistentExercise.streak }}d)
          </div>
        </div>
      </div>
    </section>

    <!-- Interval Mode -->
    <section class="section">
      <h3 class="section-title">
        Interval Mode
      </h3>
      <div class="stat-grid cols-3">
        <div class="stat-card">
          <div class="stat-label">
            Intervals Completed
          </div>
          <div class="stat-value">
            {{ stats.deepDive.intervalsCompletedTotal }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Today / This Week
          </div>
          <div class="stat-value">
            {{ stats.deepDive.intervalModeIntervalsCompletedToday }} /
            {{ stats.deepDive.intervalModeIntervalsCompletedWeek }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Avg Duration
          </div>
          <div class="stat-value">
            {{
              formatSecondsAsClock(
                stats.deepDive.intervalModeAvgIntervalDurationSeconds,
              )
            }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            BPM Progress (last)
          </div>
          <div class="stat-value">
            {{ stats.deepDive.intervalModeLastSessionBpmProgress }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Avg BPM Increase
          </div>
          <div class="stat-value">
            {{ formatSignedNumber(stats.deepDive.intervalModeAvgBpmIncrease) }}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">
            Longest Streak
          </div>
          <div class="stat-value">
            {{ stats.deepDive.intervalModeLongestStreak }}d
          </div>
        </div>
        <div class="stat-card stat-card--wide">
          <div class="stat-label">
            Timed Mode Adherence
          </div>
          <div class="stat-value">
            {{ stats.deepDive.intervalModeTimedAdherencePercent }}%
            <span class="stat-sub">({{ stats.deepDive.intervalModeTimedActualMinutes }}m /
              {{ stats.deepDive.intervalModeTimedPlannedMinutes }}m)</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Top Lists -->
    <section class="section">
      <h3 class="section-title">
        Rankings
      </h3>
      <div class="list-row">
        <div class="list-card">
          <div class="list-title">
            Top 10 Exercises
          </div>
          <div
            v-if="stats.deepDive.topExercises.length === 0"
            class="list-empty"
          >
            No data yet
          </div>
          <div
            v-for="(ex, idx) in stats.deepDive.topExercises"
            :key="ex.title"
            class="list-item"
          >
            <span class="list-rank">{{ idx + 1 }}.</span>
            <span class="list-name">{{ ex.title }}</span>
            <span class="list-value">{{ ex.minutes }}m</span>
          </div>
        </div>
        <div class="list-card">
          <div class="list-title">
            Top 10 Tabs
          </div>
          <div
            v-if="stats.deepDive.topTabs.length === 0"
            class="list-empty"
          >
            No data yet
          </div>
          <div
            v-for="(tab, idx) in stats.deepDive.topTabs"
            :key="tab.title"
            class="list-item"
          >
            <span class="list-rank">{{ idx + 1 }}.</span>
            <span class="list-name">{{ tab.title }}</span>
            <span class="list-value">{{ tab.minutes }}m</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats-overview {
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

.stat-card--wide {
  grid-column: span 2;
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

.stat-sub {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--muted);
}

.list-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.list-card {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list-title {
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 4px;
}

.list-empty {
  font-size: 0.8rem;
  color: var(--muted);
  padding: 8px 0;
}

.list-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--text);
  padding: 2px 0;
}

.list-rank {
  color: var(--muted);
  min-width: 18px;
}

.list-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-value {
  font-weight: 600;
  white-space: nowrap;
}
</style>
