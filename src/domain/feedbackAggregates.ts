/**
 * Pure aggregation helpers for the Live-Feedback run detail view.
 *
 * The pitch/timing histograms on a run already live as pre-computed
 * counts on `FeedbackRunOverview` (the Rust layer updates them when
 * a run lands), so these helpers only turn those counts into
 * UI-friendly accuracy ratios + a single "where should the user
 * focus next?" recommendation.
 */

import type { FeedbackRunOverview } from '../services/feedbackRunCommands';

/** Percentage-point gap that makes one axis decisively worse than
 * the other — below this, we call the run "balanced" and don't push
 * the user toward one dimension. Picked at 15pp because smaller
 * gaps are inside the noise floor of the rating bands and would
 * flip-flop between runs of the same song. */
export const PITCH_TIMING_RECOMMENDATION_THRESHOLD = 0.15;

export type PitchTimingRecommendation = 'pitch' | 'timing' | 'balanced';

export type PitchTimingSplit = {
  /** (pitchPerfect + pitchGood) / totalNotes, clamped to [0, 1]. */
  pitchAccuracy: number;
  /** (timingPerfect + timingGood) / totalNotes, clamped to [0, 1]. */
  timingAccuracy: number;
  /** The axis the user should focus on, or `'balanced'` when the
   *  two are within `PITCH_TIMING_RECOMMENDATION_THRESHOLD`. */
  recommendation: PitchTimingRecommendation;
  /** Short human-readable recommendation, English. Translation is
   *  not wired up in this app so we keep the copy inline. */
  recommendationText: string;
};

/**
 * Split a feedback run into pitch-vs-timing accuracy plus a
 * recommendation. `totalNotes = 0` collapses to zero accuracy on
 * both axes and a balanced recommendation (the detail view uses the
 * empty state elsewhere so it doesn't matter much, but returning
 * the same shape keeps callers from having to null-check).
 */
export function computePitchTimingSplit(
  run: FeedbackRunOverview,
): PitchTimingSplit {
  const total = Math.max(0, run.totalNotes);
  if (total === 0) {
    return {
      pitchAccuracy: 0,
      timingAccuracy: 0,
      recommendation: 'balanced',
      recommendationText: 'No notes were recorded for this run.',
    };
  }

  const pitchAccuracy = clamp01((run.pitchPerfect + run.pitchGood) / total);
  const timingAccuracy = clamp01((run.timingPerfect + run.timingGood) / total);

  const gap = pitchAccuracy - timingAccuracy;
  let recommendation: PitchTimingRecommendation;
  let recommendationText: string;
  if (gap <= -PITCH_TIMING_RECOMMENDATION_THRESHOLD) {
    recommendation = 'pitch';
    recommendationText =
      'Focus on pitch — check tuning and try the passage slower.';
  } else if (gap >= PITCH_TIMING_RECOMMENDATION_THRESHOLD) {
    recommendation = 'timing';
    recommendationText =
      'Focus on timing — lock in with the metronome and start slower.';
  } else {
    recommendation = 'balanced';
    recommendationText = 'Balanced — pitch and timing are tracking together.';
  }

  return {
    pitchAccuracy,
    timingAccuracy,
    recommendation,
    recommendationText,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
