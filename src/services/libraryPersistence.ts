import type { LibraryItem } from '../domain/library';
import { getLibrarySourcePath } from '../domain/library';
import { getStoredJson, setStoredJson } from '../domain/storage';

const STORAGE_KEY = 'practicetab.library.v1';

function normalizeItems(payload: unknown): LibraryItem[] {
  return Array.isArray(payload) ? (payload as LibraryItem[]) : [];
}

function migrateKind(items: LibraryItem[]): {
  items: LibraryItem[];
  changed: boolean;
} {
  let changed = false;
  const migrated = items.map((item) => {
    if (!item.kind) {
      changed = true;
      return { ...item, kind: 'tab' as const };
    }
    return item;
  });
  return { items: migrated, changed };
}

function getItemKey(item: LibraryItem): string | null {
  const path = getLibrarySourcePath(item.source);
  if (!path) {
    return null;
  }
  return `${item.source.kind}:${path}`;
}

function getItemTimestamp(item: LibraryItem): number {
  const updated = Date.parse(item.updatedAt ?? '');
  if (!Number.isNaN(updated) && updated > 0) {
    return updated;
  }
  const created = Date.parse(item.createdAt ?? '');
  return Number.isNaN(created) ? 0 : created;
}

function dedupeItems(items: LibraryItem[]): {
  items: LibraryItem[];
  changed: boolean;
} {
  const deduped: LibraryItem[] = [];
  const seen = new Map<string, number>();
  let changed = false;

  for (const item of items) {
    const key = getItemKey(item);
    if (!key) {
      deduped.push(item);
      continue;
    }
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, deduped.length);
      deduped.push(item);
      continue;
    }
    const existing = deduped[existingIndex];
    if (getItemTimestamp(item) > getItemTimestamp(existing)) {
      deduped[existingIndex] = item;
    }
    changed = true;
  }

  return { items: deduped, changed };
}

export const libraryPersistence = {
  load(): LibraryItem[] {
    const stored = getStoredJson<LibraryItem[]>(STORAGE_KEY, []);
    const normalized = normalizeItems(stored);
    const migrated = migrateKind(normalized);
    const { items, changed: dedupeChanged } = dedupeItems(migrated.items);
    if (migrated.changed || dedupeChanged) {
      setStoredJson(STORAGE_KEY, items);
    }
    return items;
  },
  save(items: LibraryItem[]): void {
    setStoredJson(STORAGE_KEY, items);
  },
  reset(): void {
    setStoredJson<LibraryItem[]>(STORAGE_KEY, []);
  },
};
