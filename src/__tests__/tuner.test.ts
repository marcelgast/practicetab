import { describe, expect, it } from 'vitest';
import {
  EmaSmoother,
  GOOD_CENTS,
  PERFECT_CENTS,
  REFERENCE_A4_MAX_HZ,
  REFERENCE_A4_MIN_HZ,
  centsToBarPosition,
  classifyAccuracy,
  frequencyToNote,
  parseReferenceA4,
} from '../domain/tuner';

describe('classifyAccuracy', () => {
  it('flags |cents| ≤ 5 as perfect', () => {
    expect(classifyAccuracy(0)).toBe('perfect');
    expect(classifyAccuracy(PERFECT_CENTS)).toBe('perfect');
    expect(classifyAccuracy(-PERFECT_CENTS)).toBe('perfect');
  });

  it('flags |cents| ≤ 15 as good', () => {
    expect(classifyAccuracy(6)).toBe('good');
    expect(classifyAccuracy(-GOOD_CENTS)).toBe('good');
  });

  it('flags larger offsets as off', () => {
    expect(classifyAccuracy(20)).toBe('off');
    expect(classifyAccuracy(-50)).toBe('off');
  });

  it('returns off for non-finite input', () => {
    expect(classifyAccuracy(Number.NaN)).toBe('off');
    expect(classifyAccuracy(Number.POSITIVE_INFINITY)).toBe('off');
  });
});

describe('centsToBarPosition', () => {
  it('maps 0 cents to the centre', () => {
    expect(centsToBarPosition(0)).toBeCloseTo(0.5, 6);
  });

  it('clamps beyond ±50¢', () => {
    expect(centsToBarPosition(-80)).toBeCloseTo(0, 6);
    expect(centsToBarPosition(80)).toBeCloseTo(1, 6);
  });

  it('is monotonic across ±50¢', () => {
    expect(centsToBarPosition(-25)).toBeCloseTo(0.25, 6);
    expect(centsToBarPosition(25)).toBeCloseTo(0.75, 6);
  });

  it('falls back to centre on non-finite input', () => {
    expect(centsToBarPosition(Number.NaN)).toBe(0.5);
  });
});

describe('EmaSmoother', () => {
  it('returns null before any push', () => {
    expect(new EmaSmoother().current()).toBeNull();
  });

  it('seeds with the first sample', () => {
    const s = new EmaSmoother(5);
    expect(s.push(10)).toBe(10);
  });

  it('smooths subsequent readings toward the target', () => {
    const s = new EmaSmoother(5);
    s.push(0);
    const first = s.push(10);
    const second = s.push(10);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(10);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(10);
  });

  it('reset makes the next push re-seed', () => {
    const s = new EmaSmoother();
    s.push(5);
    s.reset();
    expect(s.push(42)).toBe(42);
  });

  it('ignores non-finite inputs', () => {
    const s = new EmaSmoother();
    s.push(1);
    expect(s.push(Number.NaN)).toBe(1);
  });
});

describe('frequencyToNote', () => {
  it('returns an empty reading for non-positive or non-finite input', () => {
    expect(frequencyToNote(0).noteName).toBe('');
    expect(frequencyToNote(-100).noteName).toBe('');
    expect(frequencyToNote(Number.NaN).noteName).toBe('');
  });

  it('recognises A4 at the default reference', () => {
    const r = frequencyToNote(440);
    expect(r.noteName).toBe('A4');
    expect(r.midi).toBe(69);
    expect(r.centsOffset).toBeCloseTo(0, 5);
  });

  it('reports cent offsets in (-50, +50]', () => {
    const sharp = frequencyToNote(443);
    expect(sharp.noteName).toBe('A4');
    expect(sharp.centsOffset).toBeGreaterThan(0);
    const flat = frequencyToNote(437);
    expect(flat.noteName).toBe('A4');
    expect(flat.centsOffset).toBeLessThan(0);
  });

  it('shifts the reference A4 so the same 440 Hz reads sharp', () => {
    // If the user declares A4 = 432 Hz, a played 440 Hz is ~+31.77¢
    // sharp of A4.
    const r = frequencyToNote(440, 432);
    expect(r.noteName).toBe('A4');
    expect(r.centsOffset).toBeGreaterThan(30);
    expect(r.centsOffset).toBeLessThan(33);
  });

  it('handles low-E (~82.41 Hz)', () => {
    const r = frequencyToNote(82.41);
    expect(r.noteName).toBe('E2');
    expect(Math.abs(r.centsOffset)).toBeLessThan(1);
  });
});

describe('parseReferenceA4', () => {
  it('accepts plain integers and decimals', () => {
    expect(parseReferenceA4('440')).toBe(440);
    expect(parseReferenceA4('432.5')).toBe(432.5);
  });

  it('accepts comma as decimal separator', () => {
    expect(parseReferenceA4('432,1')).toBeCloseTo(432.1, 5);
  });

  it('trims whitespace', () => {
    expect(parseReferenceA4('  440  ')).toBe(440);
  });

  it('rejects empty, non-numeric, or out-of-range values', () => {
    expect(parseReferenceA4('')).toBeNull();
    expect(parseReferenceA4('abc')).toBeNull();
    expect(parseReferenceA4('-10')).toBeNull();
    expect(parseReferenceA4(String(REFERENCE_A4_MAX_HZ + 1))).toBeNull();
    expect(parseReferenceA4(String(REFERENCE_A4_MIN_HZ - 0.5))).toBeNull();
  });

  it('rejects partial numeric input instead of silently truncating', () => {
    // `Number.parseFloat` would return 440 / 44 here and let typos leak
    // into the store — the parser must reject them outright.
    expect(parseReferenceA4('440abc')).toBeNull();
    expect(parseReferenceA4('440 Hz')).toBeNull();
    expect(parseReferenceA4('44O')).toBeNull();
    expect(parseReferenceA4('440.')).not.toBeNull(); // still a valid decimal
    expect(parseReferenceA4('440..5')).toBeNull();
    expect(parseReferenceA4('4 40')).toBeNull();
  });

  it('enforces the documented 400–480 Hz range', () => {
    expect(REFERENCE_A4_MIN_HZ).toBe(400);
    expect(REFERENCE_A4_MAX_HZ).toBe(480);
    expect(parseReferenceA4('399.99')).toBeNull();
    expect(parseReferenceA4('480.01')).toBeNull();
    expect(parseReferenceA4('400')).toBe(400);
    expect(parseReferenceA4('480')).toBe(480);
    // Old "anything positive" contract must no longer pass.
    expect(parseReferenceA4('1')).toBeNull();
    expect(parseReferenceA4('2000')).toBeNull();
  });
});
