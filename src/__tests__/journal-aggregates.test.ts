import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JOURNAL_ENGAGEMENT_DEFAULT_WINDOW_DAYS,
  computeJournalEngagementRate,
  computeJournalHeadline,
  computeJournalWeekdayBreakdown,
} from '../domain/journalAggregates';
import type { PracticeSession } from '../domain/practice';

function baseSession(
  overrides: Partial<PracticeSession> = {},
): PracticeSession {
  return {
    id: 's-x',
    sessionDate: '2026-04-23',
    startedAt: '2026-04-23T10:00:00Z',
    endedAt: null,
    totalTimeSpentSeconds: 0,
    totalPlaybackSeconds: 0,
    createdAt: '2026-04-23T10:00:00Z',
    ...overrides,
  };
}

describe('computeJournalHeadline', () => {
  it('returns zeroed headline when no sessions carry journal content', () => {
    const result = computeJournalHeadline([
      baseSession({ id: 'a' }),
      baseSession({ id: 'b' }),
    ]);
    expect(result).toEqual({
      goalReachedRate: 0,
      avgPercent: 0,
      totalWithJournal: 0,
      totalWithGoalAnswered: 0,
      totalWithPercent: 0,
    });
  });

  it('computes goal-reached rate off the answered subset, not total-with-journal', () => {
    const result = computeJournalHeadline([
      baseSession({ id: 'a', goalReached: true, goalPercent: 100 }),
      baseSession({ id: 'b', goalReached: false, goalPercent: 60 }),
      // Goal written but never reviewed → "journal content" but no answer.
      baseSession({ id: 'c', goalText: 'warm up' }),
    ]);
    expect(result.totalWithJournal).toBe(3);
    expect(result.totalWithGoalAnswered).toBe(2);
    expect(result.goalReachedRate).toBe(0.5);
    expect(result.totalWithPercent).toBe(2);
    expect(result.avgPercent).toBe(80);
  });

  it('ignores goalPercent=0 only when it is literal null/undefined, not a real zero', () => {
    const result = computeJournalHeadline([
      baseSession({ id: 'a', goalPercent: 0, goalReached: false }),
      baseSession({ id: 'b', goalPercent: 50, goalReached: true }),
    ]);
    expect(result.totalWithPercent).toBe(2);
    expect(result.avgPercent).toBe(25);
  });
});

describe('computeJournalWeekdayBreakdown', () => {
  it('returns seven zeroed entries when nothing is tracked', () => {
    const result = computeJournalWeekdayBreakdown([]);
    expect(result.length).toBe(7);
    expect(result.every((e) => e.count === 0 && e.rate === 0)).toBe(true);
    expect(result.map((e) => e.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('buckets sessions by local weekday and computes per-bucket rates', () => {
    // 2026-04-20 = Monday (weekday 1), 2026-04-22 = Wednesday (3).
    const sessions = [
      baseSession({
        id: 'mon-hit',
        sessionDate: '2026-04-20',
        goalReached: true,
      }),
      baseSession({
        id: 'mon-miss',
        sessionDate: '2026-04-20',
        goalReached: false,
      }),
      baseSession({
        id: 'wed-hit',
        sessionDate: '2026-04-22',
        goalReached: true,
      }),
      // Goal not answered — should not count.
      baseSession({
        id: 'wed-skipped',
        sessionDate: '2026-04-22',
        goalText: 'warm up',
      }),
    ];
    const result = computeJournalWeekdayBreakdown(sessions);

    expect(result[1]).toEqual({ weekday: 1, count: 2, rate: 0.5 });
    expect(result[3]).toEqual({ weekday: 3, count: 1, rate: 1 });
    // Other weekdays stay at zero.
    expect(result[0]).toEqual({ weekday: 0, count: 0, rate: 0 });
    expect(result[5]).toEqual({ weekday: 5, count: 0, rate: 0 });
  });

  it('drops sessions with unparseable sessionDate', () => {
    const sessions = [
      baseSession({
        id: 'bad',
        sessionDate: 'not-a-date',
        goalReached: true,
      }),
      baseSession({
        id: 'ok',
        sessionDate: '2026-04-20',
        goalReached: true,
      }),
    ];
    const result = computeJournalWeekdayBreakdown(sessions);
    const total = result.reduce((sum, e) => sum + e.count, 0);
    expect(total).toBe(1);
  });
});

describe('computeJournalEngagementRate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor "now" at 2026-04-23 local noon so windowDays math is
    // deterministic regardless of the host TZ.
    vi.setSystemTime(new Date(2026, 3, 23, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns zero rate + zero counts when no sessions exist', () => {
    const result = computeJournalEngagementRate([], 28);
    expect(result).toEqual({
      tracked: 0,
      total: 0,
      rate: 0,
      windowDays: 28,
    });
  });

  it('counts only sessions inside a rolling window by default', () => {
    const sessions = [
      baseSession({ id: 'old', sessionDate: '2026-01-01' }),
      baseSession({
        id: 'recent-journaled',
        sessionDate: '2026-04-22',
        goalText: 'warm up',
      }),
      baseSession({ id: 'recent-bare', sessionDate: '2026-04-20' }),
    ];
    const result = computeJournalEngagementRate(sessions);
    expect(result.windowDays).toBe(JOURNAL_ENGAGEMENT_DEFAULT_WINDOW_DAYS);
    expect(result.total).toBe(2);
    expect(result.tracked).toBe(1);
    expect(result.rate).toBe(0.5);
  });

  it('switches to all-time when windowDays is null', () => {
    const sessions = [
      baseSession({
        id: 'ancient',
        sessionDate: '2020-01-01',
        goalReached: true,
      }),
      baseSession({
        id: 'recent',
        sessionDate: '2026-04-20',
      }),
    ];
    const result = computeJournalEngagementRate(sessions, null);
    expect(result.windowDays).toBeNull();
    expect(result.total).toBe(2);
    expect(result.tracked).toBe(1);
    expect(result.rate).toBe(0.5);
  });

  it('drops rows with unparseable sessionDate when the window is active', () => {
    const sessions = [
      baseSession({ id: 'bad', sessionDate: 'not-a-date' }),
      baseSession({
        id: 'good',
        sessionDate: '2026-04-22',
        goalText: 'x',
      }),
    ];
    const result = computeJournalEngagementRate(sessions, 28);
    expect(result.total).toBe(1);
    expect(result.tracked).toBe(1);
  });
});
