// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import {
  __test__,
  loadSelectedTrackIndex,
  saveSelectedTrackIndex,
} from '../services/trackSelectionPersistence';

describe('trackSelectionPersistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('saves and loads selected track index by file key', () => {
    saveSelectedTrackIndex('lib-1', 3);
    expect(loadSelectedTrackIndex('lib-1')).toBe(3);
    expect(loadSelectedTrackIndex('lib-2')).toBeNull();
  });

  it('ignores invalid entries in storage map', () => {
    localStorage.setItem(
      'practicetab.trackSelectionByLibraryId',
      JSON.stringify({
        good: 2,
        badString: 'abc',
        badNegative: -1,
      }),
    );
    const map = __test__.readMap();
    expect(map).toEqual({ good: 2 });
  });
});
