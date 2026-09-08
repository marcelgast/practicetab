/**
 * Pure domain types and functions for comparing detected pitch against the
 * expected-note timeline.
 *
 * Kept free of Vue / Pinia / Tauri so it can be unit-tested in isolation.
 * All functions are pure: same inputs → same outputs, no I/O.
 */

import type { BendInfo, ExpectedNote } from './expectedNoteTimeline';

// ---------------------------------------------------------------------------
// Rating types
// ---------------------------------------------------------------------------

/** Four-level accuracy rating used for both pitch and timing. */
export type AccuracyRating = 'perfect' | 'good' | 'acceptable' | 'wrong';

/** How a note was played relative to expectation. */
export type NoteOutcome =
  | 'hit' // Note was played and compared
  | 'missed' // Expected note passed with no detected pitch
  | 'extra'; // Pitch detected where no note was expected (rest/silence)

// ---------------------------------------------------------------------------
// Strictness
// ---------------------------------------------------------------------------

export type StrictnessPreset = 'beginner' | 'intermediate' | 'pro';

export interface StrictnessConfig {
  /** Pitch tolerance bands in cents. */
  pitch: { perfect: number; good: number; acceptable: number };
  /** Timing tolerance bands in milliseconds. */
  timing: { perfect: number; good: number; acceptable: number };
  /** Bend target tolerance bands in cents from the target pitch. */
  bend: { perfect: number; good: number };
  /**
   * How rests/silence are enforced:
   * - 'ignore'  — extra notes during rests are silently ignored
   * - 'deduct'  — contributes a wrong rating to the result
   * - 'fail'    — extra note during rest → NoteResult with outcome 'extra'
   */
  pausePenalty: 'ignore' | 'deduct' | 'fail';
}

export const STRICTNESS_PRESETS: Record<StrictnessPreset, StrictnessConfig> = {
  beginner: {
    // Very forgiving. Users on beginner should be able to "get the
    // basics" — right note in the general area, roughly on time —
    // without discouraging red cells. The goal is a fast ramp to
    // intermediate, not a lifelong mode.
    pitch: { perfect: 40, good: 70, acceptable: 120 },
    timing: { perfect: 200, good: 320, acceptable: 450 },
    bend: { perfect: 60, good: 100 },
    pausePenalty: 'ignore',
  },
  intermediate: {
    // The default target level — Marcel's real-play test confirmed
    // these feel right after the pipeline-latency corrections.
    pitch: { perfect: 10, good: 25, acceptable: 50 },
    timing: { perfect: 60, good: 110, acceptable: 180 },
    bend: { perfect: 15, good: 30 },
    pausePenalty: 'deduct',
  },
  pro: {
    // Minimally tighter than intermediate on timing — still realistic
    // after the ~40ms pipeline latency the soft-onset fallback
    // absorbs; 15ms-perfect of the original pro preset was
    // physically unreachable. Pitch bands stay tight (pro should hit
    // the actual note, no semitone wiggle room).
    pitch: { perfect: 5, good: 10, acceptable: 25 },
    timing: { perfect: 45, good: 85, acceptable: 140 },
    bend: { perfect: 8, good: 15 },
    pausePenalty: 'fail',
  },
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface BendResult {
  expectedBend: BendInfo;
  /** Highest pitch offset reached during the note (in semitones). */
  maxPitchOffsetSt: number;
  /** Cents deviation from the expected end pitch at note close. */
  targetCentsOff: number;
  bendAccuracy: 'perfect' | 'good' | 'wrong';
}

export interface NoteResult {
  /** The expected note this result relates to. */
  expectedNote: ExpectedNote;
  outcome: NoteOutcome;
  /** Pitch accuracy — null when outcome is 'missed'. */
  pitchAccuracy: AccuracyRating | null;
  /** Cents offset of the detected pitch from the expected frequency. */
  centsOff: number | null;
  /** Timing accuracy — null when outcome is 'missed'. */
  timingAccuracy: AccuracyRating | null;
  /**
   * Onset timing offset in ms after latency compensation.
   * Positive = late, negative = early. Null when no onset was detected.
   */
  timingOffsetMs: number | null;
  /** Bend result — null when the note has no bend, or outcome is 'missed'. */
  bendResult: BendResult | null;
}

/**
 * Rank how "good" a NoteResult's display outcome is. Lower = better.
 *
 * The bar overlay collapses chord voices — which share the same
 * `startMs` — into a single coloured cell. Picking the WORST voice
 * would paint the cell red whenever the pitch detector (which tracks
 * a single fundamental) couldn't lock on every voice, even when the
 * chord was struck correctly. We instead lift the BEST voice's rating
 * to the cell — the detector proved at least one voice was in range,
 * which is the most reliable signal we have.
 *
 * Ranking:
 *   0  hit + perfect          (best signal — exact match on a voice)
 *   1  hit + good
 *   2  hit + acceptable
 *   3  hit + wrong / no rating
 *   4  extra
 *   5  missed                 (no audio at all)
 */
export function noteResultRank(result: NoteResult): number {
  if (result.outcome === 'missed') return 5;
  if (result.outcome === 'extra') return 4;
  switch (result.pitchAccuracy) {
    case 'perfect':
      return 0;
    case 'good':
      return 1;
    case 'acceptable':
      return 2;
    default:
      return 3;
  }
}

/**
 * Return `a` when it ranks better than or equal to `b`, otherwise `b`.
 * Stable tie-break picks `a` (arrival order).
 */
export function pickBetterResult(a: NoteResult, b: NoteResult): NoteResult {
  return noteResultRank(a) <= noteResultRank(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Latency compensator
// ---------------------------------------------------------------------------

/**
 * Rolling-median latency estimator.
 *
 * The detection pipeline has inherent latency (analyzer buffer
 * fill + MPM window). Without compensation every onset looks
 * systematically late even when the user is perfectly in time.
 * The compensator estimates the pipeline latency from the
 * distribution of recent onset offsets and subtracts it before
 * timing classification.
 *
 * Design choices:
 * - Median (not mean): robust against individual real timing mistakes.
 * - Window of 20: large enough to be stable, small enough to adapt when
 *   the user switches to a different interface or changes buffer size.
 * - Active after `MIN_SAMPLES` (3): the median stabilises fast enough
 *   that making early notes wait for 8 readings — a full bar at 120 BPM
 *   — before ANY correction was biasing run-opening timing grades late.
 * - Hard cap at `MAX_COMPENSATION_MS` (240): sized above the analyzer's
 *   ~186 ms worst-case onset lag at the 8192-sample window default +
 *   some input-buffer slack. Above that it's hardware misbehaviour, not
 *   pipeline latency.
 * - Optional `initialEstimateMs` seed: when the caller knows the
 *   expected analyzer lag (e.g. the 8192-sample default is ~140 ms
 *   on typical hardware), we can seed the first correction so the
 *   very first onsets of a run aren't reported a full window late.
 *   Real readings replace the seed as they come in.
 */
export interface LatencyCompensatorState {
  recentOffsets: number[];
  estimatedLatencyMs: number;
}

const LATENCY_WINDOW_SIZE = 20;
const LATENCY_MIN_SAMPLES = 3;
const LATENCY_MAX_COMPENSATION_MS = 240;

/**
 * Default initial-estimate seed. 140 ms corresponds to the ~¾-window
 * lag of the 8192-sample pitch analyzer at 44.1 kHz (the shipping
 * default) — see `src-tauri/src/audio/pitch/types.rs`. Callers that
 * run the analyzer with a different window should override.
 */
export const DEFAULT_LATENCY_SEED_MS = 140;

export function createLatencyCompensator(
  initialEstimateMs: number = DEFAULT_LATENCY_SEED_MS,
): LatencyCompensatorState {
  const seed = Number.isFinite(initialEstimateMs)
    ? Math.max(0, Math.min(LATENCY_MAX_COMPENSATION_MS, initialEstimateMs))
    : 0;
  return { recentOffsets: [], estimatedLatencyMs: seed };
}

/**
 * Record a new raw onset offset and return an updated compensator state.
 * Pure: does not mutate the input.
 *
 * Early samples: once at least `MIN_SAMPLES` readings have landed, the
 * median replaces the seeded estimate. Before that, we keep the seed so
 * the first couple of onsets still get corrected.
 */
export function addOnsetOffset(
  state: LatencyCompensatorState,
  rawOffsetMs: number,
): LatencyCompensatorState {
  const next = [...state.recentOffsets, rawOffsetMs].slice(
    -LATENCY_WINDOW_SIZE,
  );
  const estimated =
    next.length >= LATENCY_MIN_SAMPLES
      ? Math.min(computeMedian(next), LATENCY_MAX_COMPENSATION_MS)
      : state.estimatedLatencyMs;
  return { recentOffsets: next, estimatedLatencyMs: estimated };
}

/**
 * Apply the current latency estimate to a raw onset offset.
 * Returns the compensated offset (positive = late, negative = early).
 */
export function compensateOffset(
  state: LatencyCompensatorState,
  rawOffsetMs: number,
): number {
  return rawOffsetMs - state.estimatedLatencyMs;
}

// ---------------------------------------------------------------------------
// Pure classification helpers
// ---------------------------------------------------------------------------

/**
 * Classify pitch accuracy from a cents deviation (absolute value).
 */
export function classifyPitch(
  absCentsOff: number,
  strictness: StrictnessConfig,
): AccuracyRating {
  const t = strictness.pitch;
  if (absCentsOff <= t.perfect) return 'perfect';
  if (absCentsOff <= t.good) return 'good';
  if (absCentsOff <= t.acceptable) return 'acceptable';
  return 'wrong';
}

/**
 * Classify timing accuracy from an offset in ms (absolute value).
 */
export function classifyTiming(
  absOffsetMs: number,
  strictness: StrictnessConfig,
): AccuracyRating {
  const t = strictness.timing;
  if (absOffsetMs <= t.perfect) return 'perfect';
  if (absOffsetMs <= t.good) return 'good';
  if (absOffsetMs <= t.acceptable) return 'acceptable';
  return 'wrong';
}

/**
 * Classify bend accuracy from a cents deviation from the target pitch.
 */
export function classifyBendAccuracy(
  absCentsOffFromTarget: number,
  strictness: StrictnessConfig,
): 'perfect' | 'good' | 'wrong' {
  const t = strictness.bend;
  if (absCentsOffFromTarget <= t.perfect) return 'perfect';
  if (absCentsOffFromTarget <= t.good) return 'good';
  return 'wrong';
}

/**
 * Convert a frequency ratio to cents deviation.
 * `centsOff > 0` means detected is sharp, `< 0` means flat.
 */
export function frequencyToCentsOff(
  detectedHz: number,
  expectedHz: number,
): number {
  if (expectedHz <= 0 || detectedHz <= 0) return 0;
  return 1200 * Math.log2(detectedHz / expectedHz);
}

/**
 * Same as `frequencyToCentsOff` but octave-normalised: if the
 * detector locked on the 2nd / 3rd harmonic (or the user played an
 * octave up/down for layout reasons), the raw cents reading is
 * ±1200¢ / ±1902¢ and every such note scores as `wrong`. This
 * helper folds the reading into the nearest-octave equivalent so
 * a correctly-fingered note played one octave off the tab's written
 * pitch counts as the right pitch class.
 *
 * Returned value is in [-600, +600]¢.
 */
export function frequencyToCentsOffOctaveAgnostic(
  detectedHz: number,
  expectedHz: number,
): number {
  const raw = frequencyToCentsOff(detectedHz, expectedHz);
  // Fold to the nearest octave. `Math.round(raw / 1200)` picks the
  // closest multiple-of-1200 and we subtract it, leaving the pitch
  // class offset in [-600, +600].
  return raw - Math.round(raw / 1200) * 1200;
}

/**
 * Build a NoteResult for a note that was not played at all.
 */
export function buildMissedResult(expectedNote: ExpectedNote): NoteResult {
  return {
    expectedNote,
    outcome: 'missed',
    pitchAccuracy: null,
    centsOff: null,
    timingAccuracy: null,
    timingOffsetMs: null,
    bendResult: null,
  };
}

/**
 * Build a NoteResult for a pitch detected during a rest/silence.
 * Returns null when the strictness setting says to ignore rest violations.
 */
export function buildExtraResult(
  expectedNote: ExpectedNote,
  strictness: StrictnessConfig,
): NoteResult | null {
  if (strictness.pausePenalty === 'ignore') return null;
  return {
    expectedNote,
    outcome: 'extra',
    pitchAccuracy: 'wrong',
    centsOff: null,
    timingAccuracy: null,
    timingOffsetMs: null,
    bendResult: null,
  };
}

/**
 * Build the final BendResult from a series of pitch samples collected during
 * a bend note.
 *
 * @param expectedBend - The bend decoration on the expected note.
 * @param pitchSamplesCents - Pitch offsets in cents relative to the note's
 *   base MIDI pitch, sampled throughout the note's duration.
 * @param strictness - Active strictness config.
 */
export function buildBendResult(
  expectedBend: BendInfo,
  pitchSamplesCents: readonly number[],
  strictness: StrictnessConfig,
): BendResult {
  if (pitchSamplesCents.length === 0) {
    return {
      expectedBend,
      maxPitchOffsetSt: 0,
      targetCentsOff: Math.abs(expectedBend.endPitchOffset * 100),
      bendAccuracy: 'wrong',
    };
  }

  // Convert semitones to cents for comparison
  const targetCents = expectedBend.endPitchOffset * 100;
  const maxCents = Math.max(...pitchSamplesCents);
  const lastCents = pitchSamplesCents[pitchSamplesCents.length - 1];
  const targetCentsOff = Math.abs(lastCents - targetCents);

  return {
    expectedBend,
    maxPitchOffsetSt: maxCents / 100,
    targetCentsOff,
    bendAccuracy: classifyBendAccuracy(targetCentsOff, strictness),
  };
}

// ---------------------------------------------------------------------------
// Streak helpers
// ---------------------------------------------------------------------------

/**
 * A NoteResult counts toward the streak when the user clearly hit the note:
 * - outcome must be 'hit' (missed/extra always break the streak)
 * - pitch and timing (where present) must be 'perfect' or 'good'
 * - a bend, if present, must be 'perfect' or 'good'
 *
 * Pure: no side-effects, safe to call on every result.
 */
export function isStreakWorthy(result: NoteResult): boolean {
  if (result.outcome !== 'hit') return false;
  if (result.pitchAccuracy && !isGoodOrBetter(result.pitchAccuracy)) {
    return false;
  }
  if (result.timingAccuracy && !isGoodOrBetter(result.timingAccuracy)) {
    return false;
  }
  if (result.bendResult && result.bendResult.bendAccuracy === 'wrong') {
    return false;
  }
  return true;
}

function isGoodOrBetter(rating: AccuracyRating): boolean {
  return rating === 'perfect' || rating === 'good';
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function computeMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
