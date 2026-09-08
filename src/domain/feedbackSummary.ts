/**
 * Pure aggregator that turns a list of `NoteResult`s into a presentable
 * summary for the end-of-run dialog (PR 3.6, Step 8).
 *
 * Kept free of Vue / Pinia / Tauri so it can be unit-tested in isolation.
 * The UI layer picks off fields and renders them; no formatting decisions
 * (percent signs, colours, labels) live here.
 */

import type { AccuracyRating, NoteResult } from './noteComparison';
import { isStreakWorthy } from './noteComparison';

export interface FeedbackSummary {
  /** Total number of expected notes that reached a result (hit+missed). */
  totalNotes: number;
  /** Number of results where `outcome === 'hit'`. */
  hitCount: number;
  /** Number of results where `outcome === 'missed'`. */
  missedCount: number;
  /** Number of results where `outcome === 'extra'`. */
  extraCount: number;
  /**
   * Pitch-rating histogram over the hit results. Missed/extra notes are
   * excluded because their pitchAccuracy is meaningless.
   */
  pitchHistogram: Record<AccuracyRating, number>;
  /** Timing-rating histogram over the hit results. */
  timingHistogram: Record<AccuracyRating, number>;
  /** Longest consecutive `isStreakWorthy` run (session-best). */
  longestStreak: number;
  /**
   * Rough "score" in 0..100 — average of pitch and timing means using a
   * perfect=100, good=80, acceptable=50, wrong=0 weighting. Missed notes
   * count as 0 for both axes. Returns 0 when there are no notes.
   */
  overallScore: number;
  /**
   * Whether the score is low enough to suggest slowing the practice tempo.
   * Threshold is deliberate — anything below 60 means the user struggled.
   */
  suggestSlowDown: boolean;
  /**
   * Whether the run showed enough "missed" notes alongside real hits to
   * suggest a string-muting / unclear-picking problem.
   *
   * The pitch pipeline rejects samples below a clarity threshold —
   * unclear notes (muted strings, dead-fretted, under-picked) don't
   * meet that bar and land as `missed` even when the user attempted
   * them. A high missed-ratio in an otherwise-played run is a strong
   * hint that technique, not tempo, is the bottleneck.
   */
  suggestStringMuting: boolean;
}

const RATING_WEIGHT: Record<AccuracyRating, number> = {
  perfect: 100,
  good: 80,
  acceptable: 50,
  wrong: 0,
};

const SLOW_DOWN_THRESHOLD = 60;
/**
 * Missed-ratio above which we flag likely string-muting / unclear
 * playing in the end-of-run dialog. Applied only when the user did
 * actually hit some notes (`hitCount > 0`) — a zero-attempt run just
 * means they never played, no technique hint is useful there.
 */
const STRING_MUTING_MISSED_RATIO = 0.3;

/**
 * Aggregate a completed run's results into a `FeedbackSummary`. Pure.
 * Safe to call on an empty array (returns a zero-filled summary).
 */
export function buildFeedbackSummary(
  results: readonly NoteResult[],
): FeedbackSummary {
  const pitchHistogram = zeroHistogram();
  const timingHistogram = zeroHistogram();
  let hitCount = 0;
  let missedCount = 0;
  let extraCount = 0;
  let longestStreak = 0;
  let currentStreak = 0;

  let pitchScoreSum = 0;
  let pitchScoreCount = 0;
  let timingScoreSum = 0;
  let timingScoreCount = 0;

  for (const r of results) {
    if (r.outcome === 'hit') {
      hitCount += 1;
      if (r.pitchAccuracy) {
        pitchHistogram[r.pitchAccuracy] += 1;
        pitchScoreSum += RATING_WEIGHT[r.pitchAccuracy];
        pitchScoreCount += 1;
      }
      if (r.timingAccuracy) {
        timingHistogram[r.timingAccuracy] += 1;
        timingScoreSum += RATING_WEIGHT[r.timingAccuracy];
        timingScoreCount += 1;
      }
    } else if (r.outcome === 'missed') {
      missedCount += 1;
      // Missed notes count as 0 for both axes so the overall score actually
      // reflects how many notes were played at all.
      pitchScoreCount += 1;
      timingScoreCount += 1;
    } else {
      extraCount += 1;
    }

    if (isStreakWorthy(r)) {
      currentStreak += 1;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const totalNotes = hitCount + missedCount;

  const pitchMean = pitchScoreCount > 0 ? pitchScoreSum / pitchScoreCount : 0;
  const timingMean =
    timingScoreCount > 0 ? timingScoreSum / timingScoreCount : 0;
  const overallScore =
    totalNotes === 0 ? 0 : Math.round((pitchMean + timingMean) / 2);

  const suggestStringMuting =
    hitCount > 0 &&
    totalNotes > 0 &&
    missedCount / totalNotes >= STRING_MUTING_MISSED_RATIO;

  return {
    totalNotes,
    hitCount,
    missedCount,
    extraCount,
    pitchHistogram,
    timingHistogram,
    longestStreak,
    overallScore,
    suggestSlowDown: totalNotes > 0 && overallScore < SLOW_DOWN_THRESHOLD,
    suggestStringMuting,
  };
}

function zeroHistogram(): Record<AccuracyRating, number> {
  return { perfect: 0, good: 0, acceptable: 0, wrong: 0 };
}

/**
 * Compact per-note representation persisted inside `details_json`.
 * Keys are single letters so a typical 500–2000-note run stays
 * under ~300 KB as JSON. The detail view rehydrates this into a
 * timeline chart; no other code path consumes it.
 */
export interface SerializedNoteDetail {
  /** startMs at 1× speed (matches NoteResult.expectedNote.startMs) */
  t: number;
  n: string;
  o: NoteResult['outcome'];
  pa: AccuracyRating | null;
  co: number | null;
  ta: AccuracyRating | null;
  to: number | null;
}

/**
 * Reduce the full `NoteResult[]` into the compact serialized form
 * the stats persistence stores. Pure — safe to run on arbitrarily
 * large inputs without touching the store or the DOM. Preserves the
 * array order the engine produced (by emission time), which is
 * what the timeline chart in the detail view expects.
 */
export function serializeNoteDetails(
  results: readonly NoteResult[],
): SerializedNoteDetail[] {
  const out: SerializedNoteDetail[] = new Array(results.length);
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    out[i] = {
      t: r.expectedNote.startMs,
      n: r.expectedNote.noteName,
      o: r.outcome,
      pa: r.pitchAccuracy,
      co: r.centsOff,
      ta: r.timingAccuracy,
      to: r.timingOffsetMs,
    };
  }
  return out;
}
