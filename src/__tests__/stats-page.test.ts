// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { App } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import StatsPage from '../pages/Stats.vue';
import { useStatsStore } from '../stores/stats';

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'Stats' }),
}));

vi.mock('vue-chartjs', () => ({
  Bar: { name: 'Bar', template: '<div class="mock-bar" />' },
  Line: { name: 'Line', template: '<div class="mock-line" />' },
  Doughnut: { name: 'Doughnut', template: '<div class="mock-doughnut" />' },
}));

function createMockSnapshot() {
  return {
    today: {
      minutesPracticed: 0,
      sessionsCount: 0,
      avgSessionMinutes: 0,
      exercisesPracticed: 0,
      exercisesCompleted: 0,
      planAdherencePercent: 0,
      longestExerciseRunMinutes: 0,
      mostPracticedExerciseTitle: '—',
      tabsPracticed: 0,
    },
    trends: {
      dailyTotals: [],
      weeklyTotals: [],
      avgMinutesPerDay7: 0,
      avgMinutesPerDay14: 0,
      avgMinutesPerDay30: 0,
      avgSessionMinutes7: 0,
      avgSessionMinutes30: 0,
      practiceDaysLast7: 0,
      practiceDaysLast14: 0,
      practiceDaysLast30: 0,
      missedDaysLast30: 30,
      weekOverWeekChangePercent: 0,
      topPracticedPlanThisWeek: { title: '—', minutes: 0 },
      mostImprovedExerciseThisWeek: { title: '—', deltaMinutes: 0 },
      sessionsThisWeek: 0,
      weekdayTotals: [],
      bestDayThisWeek: { date: '2024-01-02', minutes: 42 },
      mostConsistentWeekday: { label: '—', minutes: 0 },
    },
    deepDive: {
      lifetimeMinutes: 0,
      lifetimePlaybackMinutes: 0,
      lifetimeExerciseMinutes: 0,
      timedPracticeMinutes: 0,
      untimedPracticeMinutes: 0,
      playbackModes: {
        tabMinutes: 0,
        songMinutes: 0,
        dualMinutes: 0,
        metronomeOnlyMinutes: 0,
      },
      tabLinkCoveragePercent: 0,
      mostConsistentExercise: { title: '—', streak: 0 },
      mostPracticedPlan: { title: '—', minutes: 0 },
      mostPracticedExercise: { title: '—', minutes: 0 },
      longestSessionMinutes: 0,
      totalTabsLinked: 0,
      intervalsCompletedTotal: 0,
      intervalModeIntervalsCompletedToday: 0,
      intervalModeIntervalsCompletedWeek: 0,
      intervalModeAvgIntervalDurationSeconds: 0,
      intervalModeAvgBpmIncrease: 0,
      intervalModeLastSessionBpmProgress: '—',
      intervalModeLongestStreak: 0,
      intervalModeTimedAdherencePercent: 0,
      intervalModeTimedPlannedMinutes: 0,
      intervalModeTimedActualMinutes: 0,
      categories: [],
      topExercises: [],
      topTabs: [],
    },
    habits: {
      currentStreakDays: 2,
      longestStreakDays: 1,
      weeklyGoalLabel: '2 / 5 days',
    },
    perExercise: [],
    libraryStats: [],
    todayBreakdown: {
      sessionSeconds: 0,
      exerciseSelectedSeconds: 0,
      generalSeconds: 0,
      playbackSeconds: 0,
      exercisePlaybackSeconds: 0,
      sessionPlaybackSeconds: 0,
    },
    lifetimeBreakdown: {
      sessionSeconds: 0,
      exerciseSelectedSeconds: 0,
      generalSeconds: 0,
      playbackSeconds: 0,
      exercisePlaybackSeconds: 0,
      sessionPlaybackSeconds: 0,
    },
    ratioTrend: [],
  };
}

let host: HTMLDivElement;
let teleportTarget: HTMLDivElement;
let app: App;

describe('stats page', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    host = document.createElement('div');
    document.body.appendChild(host);
    teleportTarget = document.createElement('div');
    teleportTarget.id = 'stats-detail-target';
    document.body.appendChild(teleportTarget);
  });

  afterEach(() => {
    app?.unmount();
    host?.remove();
    teleportTarget?.remove();
  });

  it('shows the streak flame icon in the session/today view', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useStatsStore();
    store.refresh = vi.fn().mockResolvedValue(undefined);
    store.loading = false;
    store.error = null;
    store.snapshot = createMockSnapshot();

    app = createApp(StatsPage).use(pinia);
    app.mount(host);
    await nextTick();

    expect(teleportTarget.querySelector('.streak-icon')).toBeTruthy();
    expect(teleportTarget.textContent).toContain('2 Days');
    expect(teleportTarget.textContent).toContain('1 Day');
  });

  it('shows trends data when trends nav is selected', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useStatsStore();
    store.refresh = vi.fn().mockResolvedValue(undefined);
    store.loading = false;
    store.error = null;
    store.snapshot = createMockSnapshot();

    app = createApp(StatsPage).use(pinia);
    app.mount(host);
    await nextTick();

    // Click the Trends nav button in the left panel
    const trendsButton = Array.from(
      host.querySelectorAll('.stats-nav button'),
    ).find((btn) => btn.textContent?.includes('Trends / Long-term'));
    expect(trendsButton).toBeTruthy();
    trendsButton?.click();
    await nextTick();

    expect(teleportTarget.textContent).toContain('Tue (42m)');
  });
});
