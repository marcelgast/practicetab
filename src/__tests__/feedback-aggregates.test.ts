import { describe, expect, it } from 'vitest';
import {
  PITCH_TIMING_RECOMMENDATION_THRESHOLD,
  computePitchTimingSplit,
} from '../domain/feedbackAggregates';
import type { FeedbackRunOverview } from '../services/feedbackRunCommands';

function baseRun(
  overrides: Partial<FeedbackRunOverview> = {},
): FeedbackRunOverview {
  return {
    id: 1,
    sessionId: null,
    exerciseId: null,
    libraryItemId: 'lib-1',
    endedAt: '2026-04-23T10:00:00Z',
    durationSeconds: 60,
    strictnessPreset: 'normal',
    totalNotes: 100,
    hitCount: 100,
    missedCount: 0,
    extraCount: 0,
    pitchPerfect: 0,
    pitchGood: 0,
    pitchAcceptable: 0,
    pitchWrong: 0,
    timingPerfect: 0,
    timingGood: 0,
    timingAcceptable: 0,
    timingWrong: 0,
    longestStreak: 0,
    overallScore: 0,
    suggestSlowDown: false,
    suggestStringMuting: false,
    ...overrides,
  };
}

describe('computePitchTimingSplit', () => {
  it('collapses to balanced / zero accuracy when no notes were recorded', () => {
    const result = computePitchTimingSplit(
      baseRun({ totalNotes: 0, hitCount: 0 }),
    );
    expect(result).toMatchObject({
      pitchAccuracy: 0,
      timingAccuracy: 0,
      recommendation: 'balanced',
    });
    expect(result.recommendationText).toContain('No notes');
  });

  it('reports balanced when pitch and timing are within the threshold', () => {
    // 60% pitch, 50% timing — 10pp gap, below the 15pp threshold.
    const result = computePitchTimingSplit(
      baseRun({
        totalNotes: 100,
        pitchPerfect: 40,
        pitchGood: 20,
        timingPerfect: 30,
        timingGood: 20,
      }),
    );
    expect(result.pitchAccuracy).toBeCloseTo(0.6, 5);
    expect(result.timingAccuracy).toBeCloseTo(0.5, 5);
    expect(result.recommendation).toBe('balanced');
    expect(result.recommendationText).toContain('Balanced');
  });

  it('recommends pitch focus when pitch lags timing by ≥ threshold', () => {
    // 40% pitch, 80% timing — 40pp gap.
    const result = computePitchTimingSplit(
      baseRun({
        totalNotes: 100,
        pitchPerfect: 30,
        pitchGood: 10,
        timingPerfect: 60,
        timingGood: 20,
      }),
    );
    expect(result.recommendation).toBe('pitch');
    expect(result.recommendationText.toLowerCase()).toContain('pitch');
  });

  it('recommends timing focus when timing lags pitch by ≥ threshold', () => {
    const result = computePitchTimingSplit(
      baseRun({
        totalNotes: 100,
        pitchPerfect: 80,
        pitchGood: 10,
        timingPerfect: 20,
        timingGood: 10,
      }),
    );
    expect(result.recommendation).toBe('timing');
    expect(result.recommendationText.toLowerCase()).toContain('timing');
  });

  it('treats the threshold boundary as triggering a focus (inclusive)', () => {
    // Pitch 50 %, timing 65 % — gap = 15pp = threshold.
    const result = computePitchTimingSplit(
      baseRun({
        totalNotes: 100,
        pitchPerfect: 50,
        pitchGood: 0,
        timingPerfect: 65,
        timingGood: 0,
      }),
    );
    expect(PITCH_TIMING_RECOMMENDATION_THRESHOLD).toBeCloseTo(0.15);
    expect(result.recommendation).toBe('pitch');
  });

  it('clamps absurd inputs into the [0, 1] accuracy range', () => {
    const result = computePitchTimingSplit(
      baseRun({
        totalNotes: 10,
        // Buggy data: perfect alone exceeds total. Accuracy must clamp.
        pitchPerfect: 15,
        pitchGood: 0,
        timingPerfect: 5,
        timingGood: 0,
      }),
    );
    expect(result.pitchAccuracy).toBe(1);
    expect(result.timingAccuracy).toBe(0.5);
  });
});
