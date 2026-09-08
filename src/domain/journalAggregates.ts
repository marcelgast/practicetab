/**
 * Pure aggregation helpers for the Session Journal surface on the
 * Stats page. Separate from `sessionJournal.ts` because that file
 * lives in the hot path of the review overlay (clamp, preview,
 * date) and is imported by the persistence layer — the aggregates
 * here only show up inside the Stats sub-tab and have no reason
 * to pull in those imports.
 *
 * Everything is side-effect free so it can be unit-tested without
 * mocking a store or persistence.
 */

import type { PracticeSession } from './practice';
import { hasJournalContent } from './sessionJournal';

/** Cutoff (in percentage points) for `goalReached = true / null / false`
 * aggregation. A session counts as "goal answered" iff its
 * `goalReached` flag is a boolean (the overlay's tri-state collapses
 * `null` into "skipped"). */
export const JOURNAL_ENGAGEMENT_DEFAULT_WINDOW_DAYS = 28;

export type JournalHeadline = {
  /** Fraction of answered sessions where the user said the goal was
   *  reached. `0` when no session has an answer yet. */
  goalReachedRate: number;
  /** Mean of `goalPercent` across sessions that recorded one. `0`
   *  when no session recorded a percent. */
  avgPercent: number;
  /** Total number of journal-bearing sessions (any field set). */
  totalWithJournal: number;
  /** Subset that explicitly answered the goal-reached tri-state
   *  (`true` or `false`, but not `null`). Used as the denominator
   *  for `goalReachedRate` so half-filled journals don't drag the
   *  number down. */
  totalWithGoalAnswered: number;
  /** Subset with a numeric `goalPercent`. Denominator for
   *  `avgPercent`. */
  totalWithPercent: number;
};

export type JournalWeekdayEntry = {
  /** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
  weekday: number;
  /** Fraction of journal-bearing sessions that weekday where the
   *  user said they reached the goal (denominator = sessions with
   *  `goalReached` answered, NOT total-with-journal). */
  rate: number;
  /** Count of sessions that weekday used for the rate denominator
   *  — i.e. sessions whose `goalReached` was answered. */
  count: number;
};

export type JournalEngagement = {
  /** Sessions (within the window) that have any journal content. */
  tracked: number;
  /** Total sessions within the window. */
  total: number;
  /** `tracked / total`, or `0` when `total` is zero. */
  rate: number;
  /** Days in the rolling window, `null` when the rate is all-time. */
  windowDays: number | null;
};

/**
 * Aggregate the three headline numbers shown above the journal
 * list: goal-reached rate, average completion %, total count.
 *
 * `sessions` should already be the filtered "with journal" subset,
 * but the function guards against stray rows anyway — it filters
 * by `hasJournalContent` internally so it's safe to pass the raw
 * session list too.
 */
export function computeJournalHeadline(
  sessions: PracticeSession[],
): JournalHeadline {
  const withJournal = sessions.filter(hasJournalContent);

  const answered = withJournal.filter(
    (s) => typeof s.goalReached === 'boolean',
  );
  const reached = answered.filter((s) => s.goalReached === true);
  const withPercent = withJournal.filter(
    (s) => typeof s.goalPercent === 'number',
  );

  const goalReachedRate =
    answered.length === 0 ? 0 : reached.length / answered.length;

  const avgPercent =
    withPercent.length === 0
      ? 0
      : withPercent.reduce((sum, s) => sum + (s.goalPercent ?? 0), 0) /
        withPercent.length;

  return {
    goalReachedRate,
    avgPercent,
    totalWithJournal: withJournal.length,
    totalWithGoalAnswered: answered.length,
    totalWithPercent: withPercent.length,
  };
}

/**
 * Weekday breakdown of the goal-reached rate. Returns exactly seven
 * entries, indexed 0 (Sunday) through 6 (Saturday), even when no
 * sessions fall on a given weekday (those entries have `count: 0`
 * and `rate: 0` — the component renders an empty bar).
 *
 * Denominator is the per-weekday count of sessions with
 * `goalReached` answered — matching `computeJournalHeadline`'s
 * definition so the two surfaces agree.
 */
export function computeJournalWeekdayBreakdown(
  sessions: PracticeSession[],
): JournalWeekdayEntry[] {
  const entries: JournalWeekdayEntry[] = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    rate: 0,
    count: 0,
  }));

  const counters: Array<{ total: number; reached: number }> = Array.from(
    { length: 7 },
    () => ({ total: 0, reached: 0 }),
  );

  sessions.filter(hasJournalContent).forEach((session) => {
    if (typeof session.goalReached !== 'boolean') return;
    const weekday = weekdayOf(session.sessionDate);
    if (weekday === null) return;
    counters[weekday]!.total += 1;
    if (session.goalReached) counters[weekday]!.reached += 1;
  });

  for (let i = 0; i < 7; i += 1) {
    const bucket = counters[i]!;
    entries[i] = {
      weekday: i,
      count: bucket.total,
      rate: bucket.total === 0 ? 0 : bucket.reached / bucket.total,
    };
  }

  return entries;
}

/**
 * Engagement rate = share of sessions in the window that have any
 * journal content. `windowDays = null` switches to an all-time
 * computation — useful for first-run users where the 28-day window
 * would show "0/0".
 *
 * The window is computed against `sessionDate` using a local-day
 * boundary so travel / DST doesn't cause a session to flip buckets.
 * Sessions with unparseable dates are dropped from both numerator
 * and denominator.
 */
export function computeJournalEngagementRate(
  allSessions: PracticeSession[],
  windowDays: number | null = JOURNAL_ENGAGEMENT_DEFAULT_WINDOW_DAYS,
): JournalEngagement {
  const cutoff = windowDays === null ? null : cutoffEpochMs(windowDays);
  const inWindow = allSessions.filter((session) => {
    if (cutoff === null) return true;
    const epoch = dateKeyToEpochMs(session.sessionDate);
    if (epoch === null) return false;
    return epoch >= cutoff;
  });

  const tracked = inWindow.filter(hasJournalContent).length;
  const total = inWindow.length;
  const rate = total === 0 ? 0 : tracked / total;

  return {
    tracked,
    total,
    rate,
    windowDays,
  };
}

function weekdayOf(sessionDate: string): number | null {
  const epoch = dateKeyToEpochMs(sessionDate);
  if (epoch === null) return null;
  // Use the *local* weekday so "Monday practice" shows under Monday
  // regardless of the client's UTC offset.
  return new Date(epoch).getDay();
}

function cutoffEpochMs(windowDays: number): number {
  const now = new Date();
  // Local midnight, windowDays ago — inclusive start of the window.
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - windowDays + 1,
  );
  return start.getTime();
}

function dateKeyToEpochMs(sessionDate: string): number | null {
  // `sessionDate` from the DB is a YYYY-MM-DD local date. Parsing
  // with `new Date('2026-04-23')` in JS yields a UTC midnight which
  // can land on the previous local day — build a local date instead.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(sessionDate);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return null;
    return date.getTime();
  }
  const fallback = new Date(sessionDate);
  if (Number.isNaN(fallback.getTime())) return null;
  return fallback.getTime();
}
