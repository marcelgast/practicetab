import type { LibraryItem } from './library';

export type LibraryTypeFilter = 'all' | 'tab' | 'audio';

export type AlphaFilter =
  | { type: 'letter'; letter: string }
  | { type: 'digit' }
  | { type: 'other' }
  | null;

type FilterOptions = {
  query: string;
  alphaFilter: AlphaFilter;
  typeFilter?: LibraryTypeFilter;
};

function normalizeForSearch(input: string): string {
  return input.normalize('NFC').toLocaleLowerCase('de-DE');
}

function hasGermanSpecialChars(query: string): boolean {
  return /[äöüßÄÖÜ]/.test(query);
}

function matchesQuery(title: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return true;
  }
  const titleNorm = normalizeForSearch(title);
  const queryNorm = normalizeForSearch(trimmed);
  if (hasGermanSpecialChars(trimmed)) {
    return titleNorm.includes(queryNorm);
  }
  return titleNorm.includes(queryNorm);
}

export function getAlphaKey(
  title: string,
): { kind: 'letter'; key: string } | { kind: 'digit' } | { kind: 'other' } {
  const value = title.trimStart();
  if (!value) {
    return { kind: 'other' };
  }
  const first = value[0];
  const upper = first.toUpperCase();
  if (upper >= 'A' && upper <= 'Z') {
    return { kind: 'letter', key: upper };
  }
  if (first >= '0' && first <= '9') {
    return { kind: 'digit' };
  }
  return { kind: 'other' };
}

export function filterLibraryItems(
  items: LibraryItem[],
  options: FilterOptions,
): LibraryItem[] {
  const query = options.query.trim();
  const typeFilter = options.typeFilter ?? 'all';
  const base = items.filter(
    (item) =>
      (item.source.kind === 'imported' || item.source.kind === 'reference') &&
      matchesQuery(item.title, query) &&
      (typeFilter === 'all' || item.kind === typeFilter),
  );

  if (!options.alphaFilter) {
    return base;
  }

  return base.filter((item) => {
    const key = getAlphaKey(item.title);
    if (options.alphaFilter?.type === 'letter') {
      return key.kind === 'letter' && key.key === options.alphaFilter.letter;
    }
    if (options.alphaFilter?.type === 'digit') {
      return key.kind === 'digit';
    }
    return key.kind === 'other';
  });
}
