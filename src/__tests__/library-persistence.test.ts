// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

const STORAGE_KEY = 'practicetab.library.v1';

describe('libraryPersistence (local)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back safely on invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');

    const items = libraryPersistence.load();

    expect(items).toEqual([]);
  });

  it('persists saves and loads', async () => {
    const { libraryPersistence } =
      await import('../services/libraryPersistence');

    libraryPersistence.save([
      {
        id: 'lib-1',
        kind: 'tab',
        title: 'Song',
        source: { kind: 'reference', path: '/music/song.gp5' },
        metadata: { fileName: 'song.gp5', size: 100, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ]);

    const items = libraryPersistence.load();
    expect(items).toHaveLength(1);
  });

  it('dedupes items by source path and keeps latest update', async () => {
    const { libraryPersistence } =
      await import('../services/libraryPersistence');

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'lib-1',
          kind: 'tab',
          title: 'Song',
          source: { kind: 'reference', path: '/music/song.gp5' },
          metadata: { fileName: 'song.gp5', size: 100, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
        {
          id: 'lib-2',
          kind: 'tab',
          title: 'Song (new)',
          source: { kind: 'reference', path: '/music/song.gp5' },
          metadata: { fileName: 'song.gp5', size: 101, modifiedMs: 2 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-02T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const items = libraryPersistence.load();

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('lib-2');
    expect(items[0].title).toBe('Song (new)');
  });

  it('migrates items without kind to tab', async () => {
    const { libraryPersistence } =
      await import('../services/libraryPersistence');

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'lib-1',
          title: 'Song',
          source: { kind: 'reference', path: '/music/song.gp5' },
          metadata: { fileName: 'song.gp5', size: 100, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const items = libraryPersistence.load();

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('tab');
  });

  it('preserves existing kind values', async () => {
    const { libraryPersistence } =
      await import('../services/libraryPersistence');

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'lib-1',
          kind: 'audio',
          title: 'Track',
          source: { kind: 'reference', path: '/music/track.mp3' },
          metadata: { fileName: 'track.mp3', size: 200, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
        {
          id: 'lib-2',
          kind: 'tab',
          title: 'Song',
          source: { kind: 'reference', path: '/music/song.gp5' },
          metadata: { fileName: 'song.gp5', size: 100, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const items = libraryPersistence.load();

    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('audio');
    expect(items[1].kind).toBe('tab');
  });
});
