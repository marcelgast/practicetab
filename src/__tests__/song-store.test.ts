// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/songPlaybackService', () => ({
  songLoad: vi.fn().mockResolvedValue(180000),
  songUnload: vi.fn().mockResolvedValue(undefined),
  songPlay: vi.fn().mockResolvedValue(undefined),
  songPause: vi.fn().mockResolvedValue(undefined),
  songStop: vi.fn().mockResolvedValue(undefined),
  songSeek: vi.fn().mockResolvedValue(undefined),
  songSetVolume: vi.fn().mockResolvedValue(undefined),
  songSetSpeed: vi.fn().mockResolvedValue(undefined),
  songSetTuning: vi.fn().mockResolvedValue(undefined),
  songGetPositionMs: vi.fn().mockResolvedValue(0),
}));

vi.mock('../services/songMapPersistence', () => ({
  songMapPersistence: {
    get: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/libraryPersistence', () => ({
  libraryPersistence: {
    load: vi.fn(() => []),
    save: vi.fn(),
  },
}));

vi.mock('../services/libraryFileOps', () => ({
  isTauri: () => false,
  libraryFileOps: {
    pickGpFiles: vi.fn(),
    pickAudioFiles: vi.fn(),
    stat: vi.fn(),
    readFileBase64: vi.fn(),
  },
}));

vi.mock('../services/audioDecodeService', () => ({
  computeAndStoreWaveform: vi.fn(),
  deleteStoredWaveform: vi.fn(),
}));

vi.mock('../services/beatmapPersistence', () => ({
  beatmapPersistence: {
    load: vi.fn(() => []),
    save: vi.fn(),
  },
}));

vi.mock('../services/gpBeatmapBuilder', () => ({
  buildGpBeatmapFromBytes: vi.fn(),
}));

import { useSongStore } from '../stores/song';
import { useLibraryStore } from '../stores/library';
import * as songService from '../services/songPlaybackService';

describe('useSongStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('starts with no loaded item', () => {
    const store = useSongStore();
    expect(store.isLoaded).toBe(false);
    expect(store.loadedItemId).toBeNull();
    expect(store.durationMs).toBe(0);
    expect(store.currentMs).toBe(0);
    expect(store.isPlaying).toBe(false);
  });

  it('loads a song by library item id', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.items = [
      {
        id: 'audio-1',
        kind: 'audio',
        title: 'Test Song',
        source: { kind: 'reference', path: '/music/song.mp3' },
        metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 1 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastKnownOk: true,
      },
    ];

    const store = useSongStore();
    await store.load('audio-1');

    expect(songService.songLoad).toHaveBeenCalledWith('/music/song.mp3');
    expect(store.isLoaded).toBe(true);
    expect(store.loadedItemId).toBe('audio-1');
    expect(store.durationMs).toBe(180000);
  });

  it('unloads the song', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.items = [
      {
        id: 'audio-1',
        kind: 'audio',
        title: 'Test Song',
        source: { kind: 'reference', path: '/music/song.mp3' },
        metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 1 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastKnownOk: true,
      },
    ];

    const store = useSongStore();
    await store.load('audio-1');
    await store.unload();

    expect(songService.songUnload).toHaveBeenCalled();
    expect(store.isLoaded).toBe(false);
    expect(store.loadedItemId).toBeNull();
    expect(store.durationMs).toBe(0);
  });

  it('does not load if library item is not found', async () => {
    const store = useSongStore();
    await store.load('nonexistent');

    expect(songService.songLoad).not.toHaveBeenCalled();
    expect(store.isLoaded).toBe(false);
  });

  it('seek updates currentMs', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.items = [
      {
        id: 'audio-1',
        kind: 'audio',
        title: 'Test Song',
        source: { kind: 'reference', path: '/music/song.mp3' },
        metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 1 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastKnownOk: true,
      },
    ];

    const store = useSongStore();
    await store.load('audio-1');
    await store.seek(42000);

    expect(songService.songSeek).toHaveBeenCalledWith(42000);
    expect(store.currentMs).toBe(42000);
  });

  it('stop resets currentMs to 0', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.items = [
      {
        id: 'audio-1',
        kind: 'audio',
        title: 'Test Song',
        source: { kind: 'reference', path: '/music/song.mp3' },
        metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 1 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastKnownOk: true,
      },
    ];

    const store = useSongStore();
    await store.load('audio-1');
    await store.seek(42000);
    await store.stop();

    expect(store.currentMs).toBe(0);
    expect(store.isPlaying).toBe(false);
  });
});
