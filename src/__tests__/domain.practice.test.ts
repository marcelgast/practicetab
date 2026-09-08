import { describe, expect, it } from 'vitest';
import {
  aggregateDailyTotals,
  computeStreak,
  totalDurationSec,
  weeklyTotals,
  type PracticeSession,
} from '../domain/practice';

describe('practice domain', () => {
  it('aggregateDailyTotals groups and sorts by sessionDate', () => {
    const sessions: PracticeSession[] = [
      {
        id: 's1',
        sessionDate: '2025-01-02',
        startedAt: '2025-01-02T08:00:00.000Z',
        endedAt: '2025-01-02T08:10:00.000Z',
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-02T08:00:00.000Z',
      },
      {
        id: 's2',
        sessionDate: '2025-01-01',
        startedAt: '2025-01-01T08:00:00.000Z',
        endedAt: '2025-01-01T08:05:00.000Z',
        totalTimeSpentSeconds: 300,
        createdAt: '2025-01-01T08:00:00.000Z',
      },
      {
        id: 's3',
        sessionDate: '2025-01-02',
        startedAt: '2025-01-02T09:00:00.000Z',
        endedAt: '2025-01-02T09:05:00.000Z',
        totalTimeSpentSeconds: 300,
        createdAt: '2025-01-02T09:00:00.000Z',
      },
    ];

    const totals = aggregateDailyTotals(sessions);
    expect(totals).toEqual([
      { date: '2025-01-01', durationSec: 300 },
      { date: '2025-01-02', durationSec: 900 },
    ]);
  });

  it('totalDurationSec respects date bounds', () => {
    const sessions: PracticeSession[] = [
      {
        id: 's1',
        sessionDate: '2025-01-01',
        startedAt: '2025-01-01T08:00:00.000Z',
        endedAt: '2025-01-01T08:10:00.000Z',
        totalTimeSpentSeconds: 600,
        createdAt: '2025-01-01T08:00:00.000Z',
      },
      {
        id: 's2',
        sessionDate: '2025-01-03',
        startedAt: '2025-01-03T08:00:00.000Z',
        endedAt: '2025-01-03T08:05:00.000Z',
        totalTimeSpentSeconds: 300,
        createdAt: '2025-01-03T08:00:00.000Z',
      },
    ];

    expect(totalDurationSec(sessions)).toBe(900);
    expect(totalDurationSec(sessions, '2025-01-02')).toBe(300);
    expect(totalDurationSec(sessions, '2025-01-01', '2025-01-01')).toBe(600);
  });

  it('computeStreak handles gaps and thresholds', () => {
    const dailyTotals = [
      { date: '2025-01-01', durationSec: 600 },
      { date: '2025-01-02', durationSec: 100 },
      { date: '2025-01-03', durationSec: 700 },
      { date: '2025-01-04', durationSec: 800 },
    ];

    expect(computeStreak(dailyTotals, 600)).toBe(2);
    expect(computeStreak(dailyTotals, 900)).toBe(0);
  });

  it('weeklyTotals groups by ISO week', () => {
    const dailyTotals = [
      { date: '2025-01-01', durationSec: 600 },
      { date: '2025-01-02', durationSec: 300 },
      { date: '2025-01-08', durationSec: 200 },
    ];

    const totals = weeklyTotals(dailyTotals);
    expect(totals).toEqual([
      { date: '2025-W01', durationSec: 900 },
      { date: '2025-W02', durationSec: 200 },
    ]);
  });
});
