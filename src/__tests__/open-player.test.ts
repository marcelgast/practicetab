// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { openLibraryItemInPlayer } from '../services/openPlayer';
import type { LibraryItem } from '../domain/library';

describe('openLibraryItemInPlayer', () => {
  beforeEach(() => {
    // openLibraryItemInPlayer touches practiceUi / practice Pinia stores
    // on library-path loads (to clear exercise expansion) — need an
    // active Pinia instance or those store calls throw.
    setActivePinia(createPinia());
  });

  it('opens the player panel before loading the item', async () => {
    const calls: string[] = [];
    const uiStore = {
      openPlayerPanel: vi.fn(() => calls.push('openPanel')),
    };
    const playerStore = {
      openLibraryItem: vi.fn(async () => {
        calls.push('openItem');
      }),
    };
    const item: LibraryItem = {
      id: 'lib-1',
      title: 'Song',
      source: { kind: 'reference', path: '/music/song.gp5' },
      metadata: { fileName: 'song.gp5', size: 123, modifiedMs: 1 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    await openLibraryItemInPlayer(item, playerStore as never, uiStore as never);

    expect(uiStore.openPlayerPanel).toHaveBeenCalled();
    expect(playerStore.openLibraryItem).toHaveBeenCalledWith(item, 'library');
    expect(calls).toEqual(['openPanel', 'openItem']);
  });

  it('passes practice source to player open when requested', async () => {
    const uiStore = {
      openPlayerPanel: vi.fn(),
    };
    const playerStore = {
      openLibraryItem: vi.fn(async () => undefined),
    };
    const item: LibraryItem = {
      id: 'lib-2',
      title: 'Song 2',
      source: { kind: 'reference', path: '/music/song2.gp5' },
      metadata: { fileName: 'song2.gp5', size: 321, modifiedMs: 2 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    await openLibraryItemInPlayer(
      item,
      playerStore as never,
      uiStore as never,
      'practice',
    );

    expect(playerStore.openLibraryItem).toHaveBeenCalledWith(item, 'practice');
  });
});
