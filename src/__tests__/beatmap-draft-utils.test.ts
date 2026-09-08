import { describe, expect, it } from 'vitest';
import {
  clampInt,
  normalizeBeatUnit,
  canSaveNewTimeDraft,
  canSaveNewLoopDraft,
} from '../components/player/beatmapDraftUtils';

describe('clampInt', () => {
  it('clamps value within range', () => {
    expect(clampInt(50, 20, 400)).toBe(50);
    expect(clampInt(10, 20, 400)).toBe(20);
    expect(clampInt(500, 20, 400)).toBe(400);
  });

  it('rounds to nearest integer', () => {
    expect(clampInt(120.7, 20, 400)).toBe(121);
    expect(clampInt(120.3, 20, 400)).toBe(120);
  });

  it('returns min for non-finite values', () => {
    expect(clampInt(NaN, 20, 400)).toBe(20);
    expect(clampInt(Infinity, 20, 400)).toBe(20);
    expect(clampInt(-Infinity, 20, 400)).toBe(20);
  });
});

describe('normalizeBeatUnit', () => {
  it('returns valid beat units unchanged', () => {
    for (const unit of [1, 2, 4, 8, 16, 32]) {
      expect(normalizeBeatUnit(unit)).toBe(unit);
    }
  });

  it('defaults invalid values to 4', () => {
    expect(normalizeBeatUnit(3)).toBe(4);
    expect(normalizeBeatUnit(0)).toBe(4);
    expect(normalizeBeatUnit(64)).toBe(4);
  });

  it('rounds before checking', () => {
    expect(normalizeBeatUnit(7.6)).toBe(8);
    expect(normalizeBeatUnit(3.9)).toBe(4);
  });
});

describe('canSaveNewTimeDraft', () => {
  it('returns true for valid draft', () => {
    expect(
      canSaveNewTimeDraft({
        barIndex: 1,
        bpm: 120,
        timeSigTop: 4,
        timeSigBottom: 4,
        _draftId: 'test',
        _isNew: true,
      }),
    ).toBe(true);
  });

  it('returns false if any field is NaN', () => {
    expect(
      canSaveNewTimeDraft({
        barIndex: NaN,
        bpm: 120,
        timeSigTop: 4,
        timeSigBottom: 4,
        _draftId: 'test',
        _isNew: true,
      }),
    ).toBe(false);
  });
});

describe('canSaveNewLoopDraft', () => {
  it('returns true for valid draft', () => {
    expect(
      canSaveNewLoopDraft({
        startBar: 1,
        endBar: 4,
        repeatCount: 2,
        _draftId: 'test',
        _isNew: true,
      }),
    ).toBe(true);
  });

  it('returns false if any field is NaN', () => {
    expect(
      canSaveNewLoopDraft({
        startBar: 1,
        endBar: NaN,
        repeatCount: 2,
        _draftId: 'test',
        _isNew: true,
      }),
    ).toBe(false);
  });
});
