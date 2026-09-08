import { describe, expect, it } from 'vitest';
import {
  COUNT_IN_OPTIONS,
  COUNT_IN_TOOLTIP,
  METRONOME_SYNC_TOOLTIP,
} from '../domain/countIn';

describe('count-in UI options', () => {
  it('exposes the count-in bar options', () => {
    expect(COUNT_IN_OPTIONS).toEqual([1, 2, 4, 6]);
  });

  it('uses the updated tooltip labels', () => {
    expect(METRONOME_SYNC_TOOLTIP).toBe('Sync Metronome');
    expect(COUNT_IN_TOOLTIP).toBe('Set count in');
  });
});
