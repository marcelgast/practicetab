import { describe, expect, it } from 'vitest';
import {
  createLibraryItemFromPick,
  markAvailable,
  markMissing,
  needsRelink,
  relink,
  type FileMetadata,
  type LibraryItem,
} from '../domain/library';

describe('library domain', () => {
  const metadata: FileMetadata = {
    fileName: 'song.gp5',
    size: 1234,
    modifiedMs: 1700000000000,
  };

  it('creates a reference item from pick', () => {
    const item = createLibraryItemFromPick(
      { path: '/music/song.gp5', metadata },
      '2025-01-01T10:00:00Z',
      () => 'lib-1',
    );

    expect(item.id).toBe('lib-1');
    expect(item.title).toBe('song.gp5');
    expect(item.source).toEqual({
      kind: 'reference',
      path: '/music/song.gp5',
    });
    expect(item.lastKnownOk).toBe(true);
  });

  it('marks items missing and available', () => {
    const base: LibraryItem = {
      id: 'lib-1',
      kind: 'tab',
      title: 'Song',
      source: { kind: 'reference', path: '/music/song.gp5' },
      metadata,
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    const missing = markMissing(base, 'not_found', '2025-01-02T10:00:00Z');
    expect(missing.lastKnownOk).toBe(false);
    expect(missing.missingReason).toBe('not_found');
    expect(needsRelink(missing)).toBe(true);

    const available = markAvailable(missing, '2025-01-03T10:00:00Z');
    expect(available.lastKnownOk).toBe(true);
    expect(available.missingReason).toBeUndefined();
    expect(needsRelink(available)).toBe(false);
  });

  it('defaults kind to tab when not specified', () => {
    const item = createLibraryItemFromPick(
      { path: '/music/song.gp5', metadata },
      '2025-01-01T10:00:00Z',
      () => 'lib-2',
    );

    expect(item.kind).toBe('tab');
  });

  it('creates audio item when kind is audio', () => {
    const item = createLibraryItemFromPick(
      { path: '/music/track.mp3', metadata, kind: 'audio' },
      '2025-01-01T10:00:00Z',
      () => 'lib-3',
    );

    expect(item.kind).toBe('audio');
    expect(item.title).toBe('song.gp5');
    expect(item.source).toEqual({
      kind: 'reference',
      path: '/music/track.mp3',
    });
  });

  it('relinks reference items', () => {
    const base: LibraryItem = {
      id: 'lib-1',
      kind: 'tab',
      title: 'Song',
      source: { kind: 'reference', path: '/music/song.gp5' },
      metadata,
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: false,
      missingReason: 'not_found',
    };

    const relinked = relink(
      base,
      '/new/song.gp5',
      { ...metadata, fileName: 'song.gp5', modifiedMs: 1700000001000 },
      '2025-01-04T10:00:00Z',
    );

    expect(relinked.source).toEqual({
      kind: 'reference',
      path: '/new/song.gp5',
    });
    expect(relinked.lastKnownOk).toBe(true);
    expect(relinked.missingReason).toBeUndefined();
  });
});
