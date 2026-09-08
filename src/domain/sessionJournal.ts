/**
 * Pure helpers for the Session Journal feature (PR 4.3).
 *
 * Everything in here is side-effect free so the component layer
 * stays thin: the review overlay clamps via `clampJournalPercent`
 * and the Stats list filters + truncates via
 * `hasJournalContent` / `formatJournalPreview`.
 */

import type { PracticeSession } from './practice';

/**
 * Review overlay's percent slider range. Goes above 100 % on
 * purpose — users who exceed their goal (e.g. practiced longer
 * or nailed a tougher passage than planned) get to express that
 * explicitly instead of being capped at the nominal success mark.
 */
export const JOURNAL_PERCENT_MIN = 0;
export const JOURNAL_PERCENT_MAX = 150;

/**
 * Value the "Goal reached" checkbox snaps the slider to when
 * checked — a shorthand for "I reached exactly what I set out to
 * do". Exported so both the overlay and its component tests read
 * the same number.
 */
export const JOURNAL_GOAL_REACHED_PERCENT = 100;

/**
 * Review overlay defaults on first open for a session that has no
 * prior review. Percent starts at zero on purpose (the user should
 * actively express completion rather than accept a pre-filled
 * estimate); goal-reached starts false.
 */
export const JOURNAL_DEFAULT_PERCENT = 0;

/**
 * Clamp an arbitrary number to the journal percent range and
 * round to integer. Non-finite input snaps to the default so the
 * overlay never shows `NaN%`.
 */
export function clampJournalPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return JOURNAL_DEFAULT_PERCENT;
  }
  const rounded = Math.round(value);
  if (rounded < JOURNAL_PERCENT_MIN) return JOURNAL_PERCENT_MIN;
  if (rounded > JOURNAL_PERCENT_MAX) return JOURNAL_PERCENT_MAX;
  return rounded;
}

/**
 * True when any of the four journal fields on a session is
 * populated. Mirrors the SQL filter in
 * `Repository::list_sessions_with_journal` so the TS-side Stats
 * UI stays consistent with the persistence layer (important for
 * the browser adapter that doesn't hit Rust).
 *
 * Empty strings count as content on purpose — if the user typed
 * something and deleted it back to empty before saving, the DB
 * keeps the empty string until `clearSessionJournal` is called.
 * Treating "" as content here means the delete button behaves as
 * advertised (the row disappears from the list).
 */
export function hasJournalContent(session: PracticeSession): boolean {
  return (
    (session.goalText !== null && session.goalText !== undefined) ||
    (session.reviewText !== null && session.reviewText !== undefined) ||
    typeof session.goalPercent === 'number' ||
    typeof session.goalReached === 'boolean'
  );
}

/**
 * Short preview string for the master-detail list. Prefers the
 * goal text (that's what the user typed first), falls back to the
 * review text (if they skipped the goal), and finally to a dash
 * so the row is never blank. Trimmed + truncated with an ellipsis
 * so long goals don't blow out the list column.
 */
export function formatJournalPreview(
  session: PracticeSession,
  maxChars = 48,
): string {
  const raw = session.goalText ?? session.reviewText ?? '';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '—';
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Short human date for the master-detail list row. Kept alongside
 * the preview formatter so both render rules live next to each
 * other — changing the date presentation is a single-file edit.
 *
 * Uses the user's locale with the short style so "2026-04-23"
 * turns into "Apr 23, 2026" (en-US) or "23.04.2026" (de-DE) on
 * the respective systems. Invalid input collapses to the raw
 * string rather than throwing.
 */
export function formatJournalDate(sessionDate: string): string {
  try {
    const date = new Date(sessionDate);
    if (Number.isNaN(date.getTime())) return sessionDate;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return sessionDate;
  }
}
