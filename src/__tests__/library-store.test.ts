// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLibraryStore } from '../stores/library';
import type { LibraryItem } from '../domain/library';

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    pickGpFiles: vi.fn(),
    stat: vi.fn(),
  },
}));

import { libraryFileOps } from '../services/libraryFileOps';

const fileOps = libraryFileOps as unknown as {
  pickGpFiles: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

describe('library store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    fileOps.pickGpFiles.mockResolvedValue([]);
    fileOps.stat.mockResolvedValue({
      fileName: 'song.gp5',
      size: 123,
      modifiedMs: 1,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('loads items on init and refreshes availability', async () => {
    const items: LibraryItem[] = [
      {
        id: 'lib-1',
        title: 'Song',
        source: { kind: 'reference', path: '/music/song.gp5' },
        metadata: { fileName: 'song.gp5', size: 123, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];
    localStorage.setItem('practicetab.library.v1', JSON.stringify(items));

    const store = useLibraryStore();
    store.init();
    await store.refreshStatus();

    expect(store.items).toHaveLength(1);
    expect(fileOps.stat).toHaveBeenCalledWith('/music/song.gp5');
  });

  it('adds picked files', async () => {
    fileOps.pickGpFiles.mockResolvedValueOnce([
      {
        path: '/music/song.gp5',
        metadata: { fileName: 'song.gp5', size: 123, modifiedMs: 1 },
      },
    ]);

    const store = useLibraryStore();
    await store.addFromFilePicker();

    expect(store.items).toHaveLength(1);
  });

  it('adds a referenced item from picker without importing', async () => {
    fileOps.pickGpFiles.mockResolvedValueOnce([
      {
        path: '/music/song.gp5',
        metadata: { fileName: 'song.gp5', size: 123, modifiedMs: 1 },
      },
    ]);

    const store = useLibraryStore();
    const item = await store.addReferenceFromPicker();

    expect(item?.source.kind).toBe('reference');
    expect(store.items).toHaveLength(1);
  });

  it('skips duplicate picks and opens duplicate dialog', async () => {
    const store = useLibraryStore();
    store.addReferenceStub('/music/song.gp5', {
      fileName: 'song.gp5',
      size: 123,
      modifiedMs: 1,
    });

    fileOps.pickGpFiles.mockResolvedValueOnce([
      {
        path: '/music/song.gp5',
        metadata: { fileName: 'song.gp5', size: 123, modifiedMs: 1 },
      },
    ]);

    await store.addFromFilePicker();

    expect(store.items).toHaveLength(1);
    expect(store.duplicateDialogOpen).toBe(true);
  });

  it('merge-patches metadata via updateItemMetadata (PR 4.2 maxFret path)', () => {
    const store = useLibraryStore();
    store.addReferenceStub('/music/song.gp5', {
      fileName: 'song.gp5',
      size: 123,
      modifiedMs: 1,
    });
    const [item] = store.items;
    expect(item.metadata.maxFret).toBeUndefined();

    store.updateItemMetadata(item.id, { maxFret: 7 });

    const updated = store.items.find((i) => i.id === item.id);
    expect(updated?.metadata.maxFret).toBe(7);
    // Non-patched fields must survive the merge.
    expect(updated?.metadata.fileName).toBe('song.gp5');
    expect(updated?.metadata.size).toBe(123);
  });

  it('updateItemMetadata no-ops when the id is unknown', () => {
    const store = useLibraryStore();
    store.addReferenceStub('/music/song.gp5', {
      fileName: 'song.gp5',
      size: 123,
      modifiedMs: 1,
    });
    const before = store.items[0].metadata;
    store.updateItemMetadata('missing-id', { maxFret: 99 });
    expect(store.items[0].metadata).toEqual(before);
  });

  it('refreshes items from persistence', async () => {
    const items: LibraryItem[] = [
      {
        id: 'lib-1',
        title: 'Song',
        source: { kind: 'reference', path: '/music/song.gp5' },
        metadata: { fileName: 'song.gp5', size: 123, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];
    localStorage.setItem('practicetab.library.v1', JSON.stringify(items));

    const store = useLibraryStore();
    await store.refresh();

    expect(store.items).toHaveLength(1);
    expect(store.items[0].id).toBe('lib-1');
  });

  it('relinks missing items', async () => {
    const store = useLibraryStore();
    store.addReferenceStub('/music/song.gp5', {
      fileName: 'song.gp5',
      size: 123,
      modifiedMs: 1,
    });
    const itemId = store.items[0].id;
    store.markMissing(itemId, 'not_found');

    fileOps.pickGpFiles.mockResolvedValueOnce([
      {
        path: '/music/new.gp5',
        metadata: { fileName: 'new.gp5', size: 200, modifiedMs: 2 },
      },
    ]);

    await store.relinkViaPicker(itemId);

    expect(store.items[0].lastKnownOk).toBe(true);
    expect(store.items[0].source).toEqual({
      kind: 'reference',
      path: '/music/new.gp5',
    });
    expect(store.items[0].metadata.fileName).toBe('new.gp5');
  });

  it('marks missing on stat error', async () => {
    const items: LibraryItem[] = [
      {
        id: 'lib-1',
        title: 'Song',
        source: { kind: 'reference', path: '/missing/song.gp5' },
        metadata: { fileName: 'song.gp5', size: 123, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];
    localStorage.setItem('practicetab.library.v1', JSON.stringify(items));
    fileOps.stat.mockRejectedValue(new Error('not_found'));

    const store = useLibraryStore();
    store.init();
    await store.refreshStatus();

    expect(store.items[0].lastKnownOk).toBe(false);
    expect(store.items[0].missingReason).toBe('not_found');
  });
});
