import { describe, expect, it } from 'vitest';
import {
  JOURNAL_DEFAULT_PERCENT,
  JOURNAL_GOAL_REACHED_PERCENT,
  JOURNAL_PERCENT_MAX,
  JOURNAL_PERCENT_MIN,
  clampJournalPercent,
  formatJournalDate,
  formatJournalPreview,
  hasJournalContent,
} from '../domain/sessionJournal';
import type { PracticeSession } from '../domain/practice';

function baseSession(
  overrides: Partial<PracticeSession> = {},
): PracticeSession {
  return {
    id: 's-1',
    sessionDate: '2026-04-23',
    startedAt: '2026-04-23T10:00:00Z',
    endedAt: null,
    totalTimeSpentSeconds: 0,
    totalPlaybackSeconds: 0,
    createdAt: '2026-04-23T10:00:00Z',
    ...overrides,
  };
}

describe('clampJournalPercent', () => {
  it('rounds and clamps to the [0, 150] range', () => {
    expect(clampJournalPercent(-10)).toBe(JOURNAL_PERCENT_MIN);
    expect(clampJournalPercent(0)).toBe(0);
    expect(clampJournalPercent(42.7)).toBe(43);
    expect(clampJournalPercent(100)).toBe(100);
    expect(clampJournalPercent(150)).toBe(JOURNAL_PERCENT_MAX);
    expect(clampJournalPercent(999)).toBe(JOURNAL_PERCENT_MAX);
  });

  it('falls back to the default for non-finite / non-numeric inputs', () => {
    expect(clampJournalPercent(Number.NaN)).toBe(JOURNAL_DEFAULT_PERCENT);
    expect(clampJournalPercent(Number.POSITIVE_INFINITY)).toBe(
      JOURNAL_DEFAULT_PERCENT,
    );
    expect(clampJournalPercent('100' as unknown as number)).toBe(
      JOURNAL_DEFAULT_PERCENT,
    );
    expect(clampJournalPercent(null as unknown as number)).toBe(
      JOURNAL_DEFAULT_PERCENT,
    );
    expect(clampJournalPercent(undefined as unknown as number)).toBe(
      JOURNAL_DEFAULT_PERCENT,
    );
  });

  it('exports the "goal reached" snap value as 100', () => {
    expect(JOURNAL_GOAL_REACHED_PERCENT).toBe(100);
  });
});

describe('hasJournalContent', () => {
  it('returns false for a session with every journal field null/undefined', () => {
    expect(hasJournalContent(baseSession())).toBe(false);
    expect(
      hasJournalContent(
        baseSession({
          goalText: null,
          reviewText: null,
          goalPercent: null,
          goalReached: null,
        }),
      ),
    ).toBe(false);
  });

  it('is true as soon as any field is populated', () => {
    expect(hasJournalContent(baseSession({ goalText: 'warm up' }))).toBe(true);
    expect(hasJournalContent(baseSession({ reviewText: 'ok' }))).toBe(true);
    expect(hasJournalContent(baseSession({ goalPercent: 0 }))).toBe(true);
    expect(hasJournalContent(baseSession({ goalReached: false }))).toBe(true);
  });

  it('treats an empty-string goal as content (matches clear_session_journal semantics)', () => {
    expect(hasJournalContent(baseSession({ goalText: '' }))).toBe(true);
  });
});

describe('formatJournalPreview', () => {
  it('prefers the goal text, falls back to review text, then dash', () => {
    expect(formatJournalPreview(baseSession({ goalText: 'warm up' }))).toBe(
      'warm up',
    );
    expect(formatJournalPreview(baseSession({ reviewText: 'done' }))).toBe(
      'done',
    );
    expect(formatJournalPreview(baseSession())).toBe('—');
  });

  it('trims whitespace and truncates with an ellipsis above the cap', () => {
    const long = 'a'.repeat(80);
    const preview = formatJournalPreview(baseSession({ goalText: long }), 10);
    expect(preview.length).toBe(10);
    expect(preview.endsWith('…')).toBe(true);
    expect(
      formatJournalPreview(baseSession({ goalText: '   padded   ' })),
    ).toBe('padded');
  });

  it('shows a dash when the goal is whitespace-only', () => {
    expect(formatJournalPreview(baseSession({ goalText: '   ' }))).toBe('—');
  });
});

describe('formatJournalDate', () => {
  it('formats an ISO date via toLocaleDateString when parseable', () => {
    const out = formatJournalDate('2026-04-23');
    // Locale-dependent; assert the year shows so we don't lock to en-US.
    expect(out).toContain('2026');
  });

  it('falls back to the raw string for unparseable input', () => {
    expect(formatJournalDate('not-a-date')).toBe('not-a-date');
  });
});
