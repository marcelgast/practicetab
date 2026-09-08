import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  PracticeExercise,
  PracticePlan,
  PracticeSession,
  PracticeSessionExercise,
} from '../domain/practice';
import {
  computePerExerciseStats,
  groupExercisesByPlan,
} from '../domain/stats/exerciseStats';
import type {
  ExerciseBpmHistoryEntry,
  LibraryItemStats,
  RatioTrendEntry,
} from '../domain/stats/types';
import { computeTimeBreakdown } from '../domain/stats/timeBreakdown';
import type { LibraryItemStatsPayload } from '../services/practicePersistenceTypes';
import {
  computeAverageSessionMinutes,
  calculateAdherencePercent,
  computeAverageMinutesPerDay,
  computeBestDayThisWeek,
  computeCurrentStreak,
  computeCurrentWeekStreak,
  computeExerciseSessionStreak,
  computeMostImprovedExerciseThisWeek,
  getSessionLocalDate,
  computeLongestStreak,
  computeLongestSessionMinutes,
  computeMostPracticedExercise,
  computeMostPracticedPlan,
  computeMostConsistentWeekday,
  computeSessionsThisWeek,
  computeTopPracticedPlanThisWeek,
  computeIntervalModeAverageBpmIncrease,
  computeIntervalModeAverageIntervalDurationSeconds,
  computeIntervalModeIntervalsCompletedForDate,
  computeIntervalModeIntervalsCompletedForWeek,
  computeIntervalModeLongestStreak,
  computeIntervalModeTimedAdherence,
  computeWeekOverWeekChangePercent,
  computeWeekdayTotals,
  computeWeeklyTotals,
  countPracticeDays,
  countExercisesCompleted,
  countUniqueTabsPracticed,
  normalizeDisplayMinutes,
  selectMostPracticedExercise,
  type DeepDiveStats,
  type HabitStats,
  type IntervalModeSession,
  type StatsSnapshot,
  type TodayStats,
  type TrendsStats,
  toLocalDateKey,
} from '../domain/stats';
import { practicePersistence } from '../services/practicePersistence';
import { computeJournalEngagementRate } from '../domain/journalAggregates';
import {
  listFeedbackRuns,
  type FeedbackRunOverview,
} from '../services/feedbackRunCommands';
import { useAppStore } from './app';
import { useLibraryStore } from './library';

type StatsState = {
  plans: PracticePlan[];
  exercises: PracticeExercise[];
  sessions: PracticeSession[];
  sessionDetails: Map<string, PracticeSessionExercise[]>;
  intervalsCompletedTotal: number;
  intervalModeSessions: IntervalModeSession[];
  bpmHistory: ExerciseBpmHistoryEntry[];
  libraryItemStatsPayloads: LibraryItemStatsPayload[];
  feedbackRuns: FeedbackRunOverview[];
};

export const useStatsStore = defineStore('stats', () => {
  const snapshot = ref<StatsSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastFetchedAt = ref<string | null>(null);

  const hasData = computed(() => Boolean(snapshot.value));

  function buildStats(state: StatsState): StatsSnapshot {
    const today = new Date();
    const todayKey = toLocalDateKey(today);
    const dailyTotals = new Map<string, number>();
    state.sessions.forEach((session) => {
      const sessionKey = getSessionLocalDate(session);
      const current = dailyTotals.get(sessionKey) ?? 0;
      dailyTotals.set(sessionKey, current + session.totalTimeSpentSeconds);
    });

    const todaySecondsByExercise = new Map<string, number>();
    state.sessions
      .filter((session) => getSessionLocalDate(session) === todayKey)
      .forEach((session) => {
        const entries = state.sessionDetails.get(session.id) ?? [];
        entries.forEach((entry) => {
          const current = todaySecondsByExercise.get(entry.exerciseId) ?? 0;
          todaySecondsByExercise.set(
            entry.exerciseId,
            current + entry.timeSpentSeconds,
          );
        });
      });

    const mostPracticed = selectMostPracticedExercise(
      state.exercises,
      todaySecondsByExercise,
    );

    const todayStats: TodayStats = {
      minutesPracticed: normalizeDisplayMinutes(
        state.sessions
          .filter((session) => session.sessionDate === todayKey)
          .reduce((sum, session) => sum + session.totalTimeSpentSeconds, 0),
      ),
      sessionsCount: state.sessions.filter(
        (session) => getSessionLocalDate(session) === todayKey,
      ).length,
      avgSessionMinutes: computeAverageSessionMinutes(state.sessions, today, 1),
      exercisesPracticed: Array.from(todaySecondsByExercise.values()).filter(
        (seconds) => seconds > 0,
      ).length,
      exercisesCompleted: countExercisesCompleted(
        state.exercises,
        todaySecondsByExercise,
      ),
      planAdherencePercent: calculateAdherencePercent(
        state.exercises,
        todaySecondsByExercise,
      ),
      longestExerciseRunMinutes: normalizeDisplayMinutes(
        Math.max(
          0,
          ...state.sessions
            .filter((session) => session.sessionDate === todayKey)
            .flatMap((session) =>
              (state.sessionDetails.get(session.id) ?? []).map(
                (entry) => entry.timeSpentSeconds,
              ),
            ),
        ),
      ),
      mostPracticedExerciseTitle: mostPracticed.title,
      tabsPracticed: countUniqueTabsPracticed(
        state.exercises,
        todaySecondsByExercise,
      ),
    };

    const dailyTotalsArray = Array.from(dailyTotals.entries()).map(
      ([date, seconds]) => ({ date, durationSec: seconds }),
    );

    const trends: TrendsStats = {
      dailyTotals: dailyTotalsArray,
      weeklyTotals: computeWeeklyTotals(state.sessions, today).filter(
        (week) => week.minutes > 0,
      ),
      avgMinutesPerDay7: computeAverageMinutesPerDay(dailyTotals, today, 7),
      avgMinutesPerDay14: computeAverageMinutesPerDay(dailyTotals, today, 14),
      avgMinutesPerDay30: computeAverageMinutesPerDay(dailyTotals, today, 30),
      avgSessionMinutes7: computeAverageSessionMinutes(
        state.sessions,
        today,
        7,
      ),
      avgSessionMinutes30: computeAverageSessionMinutes(
        state.sessions,
        today,
        30,
      ),
      practiceDaysLast7: countPracticeDays(dailyTotals, today, 7),
      practiceDaysLast14: countPracticeDays(dailyTotals, today, 14),
      practiceDaysLast30: countPracticeDays(dailyTotals, today, 30),
      missedDaysLast30: 30 - countPracticeDays(dailyTotals, today, 30),
      weekOverWeekChangePercent: computeWeekOverWeekChangePercent(
        state.sessions,
        today,
      ),
      topPracticedPlanThisWeek: computeTopPracticedPlanThisWeek(
        state.plans,
        state.exercises,
        state.sessions,
        state.sessionDetails,
        today,
      ),
      mostImprovedExerciseThisWeek: computeMostImprovedExerciseThisWeek(
        state.exercises,
        state.sessions,
        state.sessionDetails,
        today,
      ),
      sessionsThisWeek: computeSessionsThisWeek(state.sessions, today),
      weekdayTotals: computeWeekdayTotals(dailyTotals, today, 56),
      bestDayThisWeek: computeBestDayThisWeek(dailyTotals, today),
      mostConsistentWeekday: computeMostConsistentWeekday(dailyTotals, today),
    };

    const totalMinutes = normalizeDisplayMinutes(
      state.exercises.reduce(
        (sum, exercise) => sum + exercise.totalTimeSpentSeconds,
        0,
      ),
    );

    const exerciseStreak = computeExerciseSessionStreak(
      state.sessions,
      state.sessionDetails,
      state.exercises,
    );

    const topExercises = [...state.exercises]
      .map((exercise) => ({
        title: exercise.title,
        minutes: normalizeDisplayMinutes(exercise.totalTimeSpentSeconds),
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);

    const libraryStore = useLibraryStore();
    const libraryById = new Map(
      libraryStore.items.map((item) => [item.id, item.title]),
    );
    const linkedTabIds = new Set<string>();
    state.exercises.forEach((exercise) => {
      const linkedId = exercise.linkedTabId;
      if (linkedId) {
        linkedTabIds.add(linkedId);
      }
    });
    const tabTotals = new Map<string, number>();
    state.exercises.forEach((exercise) => {
      const linkedId = exercise.linkedTabId;
      if (!linkedId) {
        return;
      }
      const current = tabTotals.get(linkedId) ?? 0;
      tabTotals.set(linkedId, current + exercise.totalTimeSpentSeconds);
    });
    const topTabs = Array.from(tabTotals.entries())
      .map(([id, seconds]) => ({
        title: libraryById.get(id) ?? 'Unknown Tab',
        minutes: normalizeDisplayMinutes(seconds),
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);
    const planById = new Map(state.plans.map((plan) => [plan.id, plan]));
    const timedSeconds = state.exercises.reduce((sum, exercise) => {
      return planById.get(exercise.planId)?.timed
        ? sum + exercise.totalTimeSpentSeconds
        : sum;
    }, 0);
    const untimedSeconds = state.exercises.reduce((sum, exercise) => {
      return planById.get(exercise.planId)?.timed
        ? sum
        : sum + exercise.totalTimeSpentSeconds;
    }, 0);
    const intervalModeTimedAdherence = computeIntervalModeTimedAdherence(
      state.intervalModeSessions,
    );
    const latestIntervalModeSession = [...state.intervalModeSessions].sort(
      (a, b) => b.endedAt.localeCompare(a.endedAt),
    )[0];

    // Playback-mode breakdown draws from the playback timer (actual audio
    // / tab / metronome playback), not the exercise expansion timer —
    // otherwise the "Playback Modes" card inadvertently shows time the
    // exercise was merely expanded, which defeats its purpose.
    const modeSeconds = { tab: 0, song: 0, dual: 0, metronome: 0 };
    for (const entries of state.sessionDetails.values()) {
      for (const entry of entries) {
        const mode = entry.playbackMode;
        const seconds = entry.playbackTimeSeconds ?? 0;
        if (mode === 'tab') modeSeconds.tab += seconds;
        else if (mode === 'song') modeSeconds.song += seconds;
        else if (mode === 'dual') modeSeconds.dual += seconds;
        else if (mode === 'metronome') modeSeconds.metronome += seconds;
        // null/undefined = legacy data without mode, not counted
      }
    }

    // The three lifetime timer totals — kept distinct so the UI can expose
    // them individually per the Global Practice vs Exercise vs Time Played
    // metric split.
    const lifetimeSessionSeconds = state.sessions.reduce(
      (sum, session) => sum + session.totalTimeSpentSeconds,
      0,
    );
    const lifetimePlaybackSeconds = state.sessions.reduce(
      (sum, session) => sum + (session.totalPlaybackSeconds ?? 0),
      0,
    );

    const deepDive: DeepDiveStats = {
      lifetimeMinutes: normalizeDisplayMinutes(lifetimeSessionSeconds),
      lifetimePlaybackMinutes: normalizeDisplayMinutes(lifetimePlaybackSeconds),
      lifetimeExerciseMinutes: totalMinutes,
      timedPracticeMinutes: normalizeDisplayMinutes(timedSeconds),
      untimedPracticeMinutes: normalizeDisplayMinutes(untimedSeconds),
      playbackModes: {
        tabMinutes: normalizeDisplayMinutes(modeSeconds.tab),
        songMinutes: normalizeDisplayMinutes(modeSeconds.song),
        dualMinutes: normalizeDisplayMinutes(modeSeconds.dual),
        metronomeOnlyMinutes: normalizeDisplayMinutes(modeSeconds.metronome),
      },
      tabLinkCoveragePercent:
        state.exercises.length === 0
          ? 0
          : Math.round(
              (state.exercises.filter((exercise) => exercise.linkedTabId)
                .length /
                state.exercises.length) *
                100,
            ),
      mostConsistentExercise: exerciseStreak,
      mostPracticedPlan: computeMostPracticedPlan(state.plans, state.exercises),
      mostPracticedExercise: computeMostPracticedExercise(state.exercises),
      longestSessionMinutes: computeLongestSessionMinutes(state.sessions),
      totalTabsLinked: linkedTabIds.size,
      intervalsCompletedTotal: state.intervalsCompletedTotal,
      intervalModeIntervalsCompletedToday:
        computeIntervalModeIntervalsCompletedForDate(
          state.intervalModeSessions,
          todayKey,
        ),
      intervalModeIntervalsCompletedWeek:
        computeIntervalModeIntervalsCompletedForWeek(
          state.intervalModeSessions,
          today,
        ),
      intervalModeAvgIntervalDurationSeconds:
        computeIntervalModeAverageIntervalDurationSeconds(
          state.intervalModeSessions,
        ),
      intervalModeAvgBpmIncrease: computeIntervalModeAverageBpmIncrease(
        state.intervalModeSessions,
      ),
      intervalModeLastSessionBpmProgress: latestIntervalModeSession
        ? `${latestIntervalModeSession.startBpm} → ${latestIntervalModeSession.endBpm}`
        : '—',
      intervalModeLongestStreak: computeIntervalModeLongestStreak(
        state.intervalModeSessions,
      ),
      intervalModeTimedAdherencePercent: intervalModeTimedAdherence.percent,
      intervalModeTimedPlannedMinutes:
        intervalModeTimedAdherence.plannedMinutes,
      intervalModeTimedActualMinutes: intervalModeTimedAdherence.actualMinutes,
      categories: [{ label: 'Uncategorized', percent: 100 }],
      topExercises,
      topTabs,
    };

    const planTitleById = new Map(state.plans.map((p) => [p.id, p.title]));
    const allExerciseStats = state.exercises.map((exercise) =>
      computePerExerciseStats(
        exercise,
        planTitleById.get(exercise.planId) ?? 'Unknown Plan',
        state.sessions,
        state.sessionDetails,
        state.bpmHistory,
        todayKey,
      ),
    );
    const perExercise = groupExercisesByPlan(state.plans, allExerciseStats);

    const appStore = useAppStore();
    const practicedDaysThisWeek = computeCurrentWeekStreak(dailyTotals, today);

    const habits: HabitStats = {
      currentStreakDays: computeCurrentStreak(dailyTotals, today),
      longestStreakDays: computeLongestStreak(dailyTotals),
      weeklyGoalLabel: `${practicedDaysThisWeek} / ${appStore.weeklyStreakGoalDays} days`,
    };

    const libraryStats: LibraryItemStats[] = state.libraryItemStatsPayloads.map(
      (payload) => {
        const item = libraryStore.items.find(
          (li) => li.id === payload.libraryItemId,
        );
        return {
          itemId: payload.libraryItemId,
          itemTitle: item?.title ?? 'Unknown',
          kind: item?.kind === 'audio' ? ('audio' as const) : ('tab' as const),
          playCount: payload.playCount,
          totalTimeMinutes: normalizeDisplayMinutes(payload.totalTimeSeconds),
          loopCount: payload.loopCount,
          lastPlayedAt: payload.lastPlayedAt,
        };
      },
    );

    // Time breakdown: Global Practice / Exercise Time / Time Played
    // computed for both today and lifetime. A 30-day trend array lets the
    // ratio chart show Exercise vs Time Played relative to the session
    // total on a per-day basis.
    const allSessionExercises: PracticeSessionExercise[] = [];
    for (const entries of state.sessionDetails.values()) {
      for (const entry of entries) {
        allSessionExercises.push(entry);
      }
    }
    const todayBreakdown = computeTimeBreakdown(
      state.sessions,
      allSessionExercises,
      { fromDateKey: todayKey, toDateKey: todayKey },
    );
    const lifetimeBreakdown = computeTimeBreakdown(
      state.sessions,
      allSessionExercises,
    );
    const ratioTrend: RatioTrendEntry[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = toLocalDateKey(d);
      const dayBreakdown = computeTimeBreakdown(
        state.sessions,
        allSessionExercises,
        { fromDateKey: dateKey, toDateKey: dateKey },
      );
      // Keep raw seconds — RatioTrendChart divides these into
      // percentages, and rounding to whole minutes here collapses
      // sub-minute ratios (30s exercise / 29s playback would render as
      // 0% instead of ~97%). Any display-minute rounding happens in
      // the chart itself.
      ratioTrend.push({
        date: dateKey,
        sessionSeconds: dayBreakdown.sessionSeconds,
        exerciseSeconds: dayBreakdown.exerciseSelectedSeconds,
        exercisePlaybackSeconds: dayBreakdown.exercisePlaybackSeconds,
        totalPlaybackSeconds: dayBreakdown.playbackSeconds,
      });
    }

    const journalEngagement = computeJournalEngagementRate(state.sessions);

    return {
      today: todayStats,
      trends,
      deepDive,
      habits,
      perExercise,
      libraryStats,
      todayBreakdown,
      lifetimeBreakdown,
      ratioTrend,
      feedbackRuns: state.feedbackRuns,
      journalEngagement,
    };
  }

  async function refresh(): Promise<void> {
    if (loading.value) {
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const plansPayload = await practicePersistence.listPracticePlans();
      const exercises = plansPayload.flatMap((plan) => plan.exercises);
      const plans = plansPayload.map((plan) => ({
        id: plan.id,
        title: plan.title,
        timed: plan.timed,
        sortOrder: plan.sortOrder,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      }));
      const sessions = await practicePersistence.listSessions();
      const details = new Map<string, PracticeSessionExercise[]>();
      const detailPayloads = await Promise.all(
        sessions.map(async (session) => {
          try {
            return await practicePersistence.getSessionDetail(session.id);
          } catch (err) {
            void err;
            return null;
          }
        }),
      );
      detailPayloads.forEach((payload) => {
        if (!payload) {
          return;
        }
        details.set(payload.session.id, payload.exercises);
      });
      const intervalsCompletedTotal =
        await practicePersistence.getIntervalsCompletedTotal();
      const intervalModeSessions =
        await practicePersistence.listIntervalModeSessions();
      const bpmHistory = await practicePersistence.listExerciseBpmHistory();
      const libraryItemStatsPayloads =
        await practicePersistence.listLibraryItemStats();
      // Feedback runs — fetch all, sorted newest first by the Rust
      // layer. Wrap in its own try/catch so a DB error here doesn't
      // black out the rest of the stats page (the feature is newer
      // than the rest of the dashboard and shouldn't break pre-
      // existing surfaces on failure).
      let feedbackRuns: FeedbackRunOverview[] = [];
      try {
        feedbackRuns = await listFeedbackRuns();
      } catch (err) {
        void err;
      }
      const state: StatsState = {
        plans,
        exercises,
        sessions,
        sessionDetails: details,
        intervalsCompletedTotal,
        intervalModeSessions: intervalModeSessions.map((session) => ({
          ...session,
          plannedTotalSeconds: session.plannedTotalSeconds ?? null,
        })),
        bpmHistory,
        libraryItemStatsPayloads,
        feedbackRuns,
      };
      snapshot.value = buildStats(state);
      lastFetchedAt.value = new Date().toISOString();
    } catch (err) {
      error.value = String(err ?? 'Failed to load stats.');
    } finally {
      loading.value = false;
    }
  }

  return {
    snapshot,
    loading,
    error,
    hasData,
    lastFetchedAt,
    refresh,
  };
});
