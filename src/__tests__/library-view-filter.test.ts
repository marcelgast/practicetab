import { describe, expect, it } from 'vitest';
import { filterLibraryItems, getAlphaKey } from '../domain/libraryViewFilter';
import type { LibraryItem } from '../domain/library';

const baseItem = {
  kind: 'tab' as const,
  createdAt: '2025-01-01T10:00:00Z',
  updatedAt: '2025-01-01T10:00:00Z',
  lastKnownOk: true,
  metadata: {
    fileName: 'song.gp5',
    size: 100,
    modifiedMs: 1700000000000,
  },
};

describe('filterLibraryItems', () => {
  const items: LibraryItem[] = [
    {
      ...baseItem,
      id: 'lib-1',
      title: 'Alpha Song',
      source: { kind: 'reference', path: '/music/1.gp5' },
    },
    {
      ...baseItem,
      id: 'lib-2',
      title: 'Bravo Tune',
      source: { kind: 'reference', path: '/music/2.gp5' },
    },
    {
      ...baseItem,
      id: 'lib-3',
      title: '1st Practice',
      source: { kind: 'reference', path: '/music/3.gp5' },
    },
    {
      ...baseItem,
      id: 'lib-4',
      title: 'Mötley Crüe',
      source: { kind: 'reference', path: '/music/4.gp5' },
    },
    {
      ...baseItem,
      id: 'lib-5',
      title: 'Gross Tempo',
      source: { kind: 'reference', path: '/music/5.gp5' },
    },
    {
      ...baseItem,
      id: 'lib-6',
      title: 'Groß Tempo',
      source: { kind: 'reference', path: '/music/6.gp5' },
    },
    {
      ...baseItem,
      id: 'lib-7',
      title: 'Häuser Study',
      source: { kind: 'reference', path: '/music/7.gp5' },
    },
  ];

  it('filters by search query', () => {
    const result = filterLibraryItems(items, {
      query: 'brav',
      alphaFilter: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-2');
  });

  it('matches umlauts strictly when present in query', () => {
    const result = filterLibraryItems(items, {
      query: 'Ö',
      alphaFilter: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-4');

    const noMatch = filterLibraryItems(items, {
      query: 'ö',
      alphaFilter: null,
    });
    expect(noMatch[0].id).toBe('lib-4');

    const haus = filterLibraryItems(items, {
      query: 'ä',
      alphaFilter: null,
    });
    expect(haus).toHaveLength(1);
    expect(haus[0].id).toBe('lib-7');

    const motley = filterLibraryItems(items, {
      query: 'motley',
      alphaFilter: null,
    });
    expect(motley).toHaveLength(0);
  });

  it('matches ß strictly and does not match ss', () => {
    const sharp = filterLibraryItems(items, {
      query: 'ß',
      alphaFilter: null,
    });
    expect(sharp).toHaveLength(1);
    expect(sharp[0].id).toBe('lib-6');

    const ss = filterLibraryItems(items, {
      query: 'ss',
      alphaFilter: null,
    });
    expect(ss).toHaveLength(1);
    expect(ss[0].id).toBe('lib-5');
  });

  it('filters by alpha letter only', () => {
    const result = filterLibraryItems(items, {
      query: '',
      alphaFilter: { type: 'letter', letter: 'A' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-1');
  });

  it('combines alpha and search filters', () => {
    const result = filterLibraryItems(items, {
      query: 'tune',
      alphaFilter: { type: 'letter', letter: 'B' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('lib-2');
  });

  it('ignores non-letter titles for alpha filter', () => {
    const result = filterLibraryItems(items, {
      query: '',
      alphaFilter: { type: 'letter', letter: 'P' },
    });
    expect(result).toHaveLength(0);
  });

  it('normalizes leading whitespace and punctuation for alpha', () => {
    expect(getAlphaKey('  Green Day')).toEqual({ kind: 'letter', key: 'G' });
    expect(getAlphaKey('_Speed Practice')).toEqual({ kind: 'other' });
    expect(getAlphaKey('4 Alternate Picking')).toEqual({ kind: 'digit' });
    expect(getAlphaKey('#My Song')).toEqual({ kind: 'other' });
    expect(getAlphaKey('')).toEqual({ kind: 'other' });
  });

  it('filters digit and other groups', () => {
    const digit = filterLibraryItems(items, {
      query: '',
      alphaFilter: { type: 'digit' },
    });
    expect(digit).toHaveLength(1);
    expect(digit[0].id).toBe('lib-3');

    const other = filterLibraryItems(items, {
      query: '',
      alphaFilter: { type: 'other' },
    });
    expect(other).toHaveLength(0);
  });
});

describe('filterLibraryItems typeFilter', () => {
  const mixedItems: LibraryItem[] = [
    {
      ...baseItem,
      id: 'tab-1',
      kind: 'tab',
      title: 'Tab Song',
      source: { kind: 'reference', path: '/music/song.gp5' },
    },
    {
      ...baseItem,
      id: 'audio-1',
      kind: 'audio',
      title: 'Audio Track',
      source: { kind: 'reference', path: '/music/track.mp3' },
    },
    {
      ...baseItem,
      id: 'tab-2',
      kind: 'tab',
      title: 'Another Tab',
      source: { kind: 'reference', path: '/music/other.gp5' },
    },
  ];

  it('filters by typeFilter tab', () => {
    const result = filterLibraryItems(mixedItems, {
      query: '',
      alphaFilter: null,
      typeFilter: 'tab',
    });
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.kind === 'tab')).toBe(true);
  });

  it('filters by typeFilter audio', () => {
    const result = filterLibraryItems(mixedItems, {
      query: '',
      alphaFilter: null,
      typeFilter: 'audio',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('audio-1');
    expect(result[0].kind).toBe('audio');
  });

  it('returns all items when typeFilter is all', () => {
    const result = filterLibraryItems(mixedItems, {
      query: '',
      alphaFilter: null,
      typeFilter: 'all',
    });
    expect(result).toHaveLength(3);
  });
});
