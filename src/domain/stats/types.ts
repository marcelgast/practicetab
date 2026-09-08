import type { PracticeSession, PracticeSessionExercise } from '../practice';
import type { FeedbackRunOverview } from '../../services/feedbackRunCommands';
import type { JournalEngagement } from '../journalAggregates';
import type { TimeBreakdown } from './timeBreakdown';

export type DayTotals = {
  date: string;
  seconds: number;
};

export type ExerciseSpend = {
  exerciseId: string;
  seconds: number;
};

export type TodayStats = {
  minutesPracticed: number;
  sessionsCount: number;
  avgSessionMinutes: number;
  exercisesPracticed: number;
  exercisesCompleted: number;
  planAdherencePercent: number;
  longestExerciseRunMinutes: number;
  mostPracticedExerciseTitle: string;
  tabsPracticed: number;
};

export type WeekTotal = {
  label: string;
  minutes: number;
};

export type DailyTotal = {
  date: string;
  durationSec: number;
};

export type TrendsStats = {
  dailyTotals: DailyTotal[];
  weeklyTotals: WeekTotal[];
  avgMinutesPerDay7: number;
  avgMinutesPerDay14: number;
  avgMinutesPerDay30: number;
  avgSessionMinutes7: number;
  avgSessionMinutes30: number;
  practiceDaysLast7: number;
  practiceDaysLast14: number;
  practiceDaysLast30: number;
  missedDaysLast30: number;
  weekOverWeekChangePercent: number;
  topPracticedPlanThisWeek: { title: string; minutes: number };
  mostImprovedExerciseThisWeek: { title: string; deltaMinutes: number };
  sessionsThisWeek: number;
  weekdayTotals: { label: string; minutes: number }[];
  bestDayThisWeek: { date: string; minutes: number };
  mostConsistentWeekday: { label: string; minutes: number };
};

export type PlaybackModeBreakdown = {
  tabMinutes: number;
  songMinutes: number;
  dualMinutes: number;
  metronomeOnlyMinutes: number;
};

export type DeepDiveStats = {
  /** Lifetime "global practice" time — sum of every session total. */
  lifetimeMinutes: number;
  /** Lifetime "time played" — actual tab/audio/metronome playback minutes. */
  lifetimePlaybackMinutes: number;
  /** Lifetime "exercise" time — sum of every per-exercise expansion time. */
  lifetimeExerciseMinutes: number;
  timedPracticeMinutes: number;
  untimedPracticeMinutes: number;
  playbackModes: PlaybackModeBreakdown;
  tabLinkCoveragePercent: number;
  mostConsistentExercise: { title: string; streak: number };
  mostPracticedPlan: { title: string; minutes: number };
  mostPracticedExercise: { title: string; minutes: number };
  longestSessionMinutes: number;
  totalTabsLinked: number;
  intervalsCompletedTotal: number;
  intervalModeIntervalsCompletedToday: number;
  intervalModeIntervalsCompletedWeek: number;
  intervalModeAvgIntervalDurationSeconds: number;
  intervalModeAvgBpmIncrease: number;
  intervalModeLastSessionBpmProgress: string;
  intervalModeLongestStreak: number;
  intervalModeTimedAdherencePercent: number;
  intervalModeTimedPlannedMinutes: number;
  intervalModeTimedActualMinutes: number;
  categories: { label: string; percent: number }[];
  topExercises: { title: string; minutes: number }[];
  topTabs: { title: string; minutes: number }[];
};

export type HabitStats = {
  currentStreakDays: number;
  longestStreakDays: number;
  weeklyGoalLabel: string;
};

export type RatioTrendEntry = {
  date: string;
  /** Global/session timer seconds for the day. Kept as raw seconds so
   * sub-minute ratios don't collapse to 0% / 100% at minute boundaries. */
  sessionSeconds: number;
  /** Per-exercise expansion seconds for the day. */
  exerciseSeconds: number;
  /**
   * Playback seconds that landed in an exercise bucket — the right
   * numerator for the Played / Exercise ratio. Excludes session-only
   * playback (library tabs / general metronome runs) so a day of pure
   * metronome practice can't inflate the exercise ratio past 100%.
   */
  exercisePlaybackSeconds: number;
  /** Total playback for the day incl. session-only playback. */
  totalPlaybackSeconds: number;
};

export type StatsSnapshot = {
  today: TodayStats;
  trends: TrendsStats;
  deepDive: DeepDiveStats;
  habits: HabitStats;
  perExercise: InDepthExerciseGroup[];
  libraryStats: LibraryItemStats[];
  /** Session / Exercise / Playback split for today. */
  todayBreakdown: TimeBreakdown;
  /** Same split aggregated across every session. */
  lifetimeBreakdown: TimeBreakdown;
  /** Last 30 days of per-day minute totals — drives the ratio trend. */
  ratioTrend: RatioTrendEntry[];
  /**
   * Every Live-Feedback run ever recorded, newest first. Overview
   * rows only (no per-note `details_json` — that's fetched lazily
   * when a detail view opens via `getFeedbackRunDetails`). Drives
   * the top-level "Feedback" tab plus the score-history sections on
   * exercise and library detail pages.
   */
  feedbackRuns: FeedbackRunOverview[];
  /**
   * Share of recent sessions where the user filled in the session
   * journal (goal / review / percent / goal-reached). Rendered on
   * the Stats → Overview page as a neutral engagement metric — not
   * a nag. Window is rolling; see `computeJournalEngagementRate`.
   */
  journalEngagement: JournalEngagement;
};

export type SessionDetail = {
  session: PracticeSession;
  exercises: PracticeSessionExercise[];
};

export type ExerciseBpmHistoryEntry = {
  id: string;
  exerciseId: string;
  sessionDate: string;
  bpm: number;
  recordedAt: string;
};

export type ExercisePlaybackModeLabel = 'tab' | 'song' | 'dual' | 'metronome';

export type ModeBreakdownEntry = {
  minutes: number;
  percent: number;
};

export type PerExerciseModeBreakdown = {
  tab: ModeBreakdownEntry;
  song: ModeBreakdownEntry;
  dual: ModeBreakdownEntry;
  metronome: ModeBreakdownEntry;
};

export type PerExerciseStats = {
  exerciseId: string;
  exerciseTitle: string;
  planId: string;
  planTitle: string;
  playbackMode: ExercisePlaybackModeLabel;
  /** Exercise-timer total (expansion time). Kept as `totalTimeMinutes`
   * for backwards compatibility with the existing UI card label. */
  totalTimeMinutes: number;
  /** Actual tab/audio playback time spent on this exercise. */
  playbackTimeMinutes: number;
  avgTimePerSessionMinutes: number;
  lastSessionDate: string | null;
  trendVsLastWeekPercent: number | null;
  intervalSessionsCount: number;
  bpmHistory: { date: string; bpm: number }[];
  intervalsCompleted: number;
  practiceDays: number;
  longestStreakDays: number;
  adherencePercent: number | null;
  modeBreakdown: PerExerciseModeBreakdown;
};

export type LibraryItemStats = {
  itemId: string;
  itemTitle: string;
  kind: 'tab' | 'audio';
  playCount: number;
  totalTimeMinutes: number;
  loopCount: number;
  lastPlayedAt: string | null;
};

export type InDepthExerciseGroup = {
  planId: string;
  planTitle: string;
  exercises: PerExerciseStats[];
};

export type IntervalModeSession = {
  id: string;
  sessionDate: string;
  startedAt: string;
  endedAt: string;
  timedMode: boolean;
  plannedTotalSeconds: number | null;
  actualRunSeconds: number;
  intervalDurationSeconds: number;
  intervalsCompleted: number;
  startBpm: number;
  endBpm: number;
};
