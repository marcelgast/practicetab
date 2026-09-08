// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

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
  songSetLoop: vi.fn().mockResolvedValue(undefined),
  songClearLoop: vi.fn().mockResolvedValue(undefined),
  songGetPositionMs: vi.fn().mockResolvedValue(0),
}));

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    incrementLibraryItemLoopCount: vi.fn().mockResolvedValue(undefined),
    incrementLibraryItemPlayCount: vi.fn().mockResolvedValue(undefined),
    recordLibraryItemTime: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/alphatabPlayer', () => ({
  alphatabPlayer: {
    isInitialized: vi.fn(() => true),
    setLooping: vi.fn(),
    setTempoPercent: vi.fn(),
    setMetronomeEnabled: vi.fn(),
    setCountInEnabled: vi.fn(),
    setMetronomeVolume: vi.fn(),
    setCountInVolume: vi.fn(),
    setBpm: vi.fn(),
    setTuning: vi.fn(),
    setShowStandardNotation: vi.fn(),
    setTabRhythm: vi.fn(),
    setLayoutMode: vi.fn(),
    hasUnsupportedBackingTrack: vi.fn(() => false),
    getCurrentTickPosition: vi.fn(() => 0),
    getTransportState: vi.fn(() => 'stopped'),
    getPlaybackRangeTicks: vi.fn(() => null),
    clearPlaybackRangeHighlight: vi.fn(),
    clearPlaybackRange: vi.fn(),
    supportsTrackMute: false,
    supportsTrackSolo: false,
    supportsTrackVolume: false,
  },
  base64ToUint8Array: vi.fn(),
}));

vi.mock('../services/audioCommands', () => ({
  setMasterVolume: vi.fn().mockResolvedValue(undefined),
  setTabVolume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/metronomeCommands', () => ({
  metronomeStart: vi.fn().mockResolvedValue(undefined),
  metronomeStop: vi.fn().mockResolvedValue(undefined),
  metronomeSetConfig: vi.fn().mockResolvedValue(undefined),
  metronomeBeep: vi.fn().mockResolvedValue(undefined),
  metronomeTickFromAlphaTab: vi.fn().mockResolvedValue(undefined),
  metronomeCancelScheduled: vi.fn().mockResolvedValue(undefined),
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

import { computed, ref } from 'vue';
import { useSongStore } from '../stores/song';
import { usePlayerStore } from '../stores/player';
import { useMetronomeStore } from '../stores/metronome';
import { useLibraryStore } from '../stores/library';
import { useAlphaSelection } from '../components/player/useAlphaSelection';

describe('loop previous-state restore — songStore.repeatEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('defaults to repeat ON so files loop at end by default', () => {
    const store = useSongStore();
    expect(store.repeatEnabled).toBe(true);
  });

  it('drawing a loop while repeat=OFF turns it ON and restores OFF on dismiss', async () => {
    const store = useSongStore();
    store.repeatEnabled = false;
    // Simulate a loaded song by setting the id directly (private via store ref)
    (store as unknown as { loadedItemId: string }).loadedItemId = 'audio-1';

    await store.setLoopRegion(1000, 2000);
    expect(store.repeatEnabled).toBe(true);

    await store.clearLoopRegion();
    expect(store.repeatEnabled).toBe(false);
  });

  it('drawing a loop while repeat=ON leaves it ON after dismiss', async () => {
    const store = useSongStore();
    expect(store.repeatEnabled).toBe(true);
    (store as unknown as { loadedItemId: string }).loadedItemId = 'audio-1';

    await store.setLoopRegion(1000, 2000);
    expect(store.repeatEnabled).toBe(true);

    await store.clearLoopRegion();
    expect(store.repeatEnabled).toBe(true);
  });

  it('consecutive draws do not overwrite the original snapshot', async () => {
    const store = useSongStore();
    store.repeatEnabled = false;
    (store as unknown as { loadedItemId: string }).loadedItemId = 'audio-1';

    await store.setLoopRegion(1000, 2000);
    expect(store.repeatEnabled).toBe(true);
    // Second draw (e.g. redraw) must not snapshot ON as the new "previous".
    await store.setLoopRegion(3000, 4000);
    expect(store.repeatEnabled).toBe(true);

    await store.clearLoopRegion();
    // Original state was OFF — must restore to OFF, not ON.
    expect(store.repeatEnabled).toBe(false);
  });

  it('explicit toggleRepeat invalidates the snapshot', async () => {
    const store = useSongStore();
    store.repeatEnabled = false;
    (store as unknown as { loadedItemId: string }).loadedItemId = 'audio-1';

    await store.setLoopRegion(1000, 2000);
    expect(store.repeatEnabled).toBe(true);

    // User explicitly toggles OFF while a drawn region exists.
    store.toggleRepeat();
    expect(store.repeatEnabled).toBe(false);

    // Dismissing now must leave it OFF (no silent override of user choice).
    await store.clearLoopRegion();
    expect(store.repeatEnabled).toBe(false);
  });
});

describe('loop previous-state restore — playerStore.isLoopEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('defaults to loop ON', () => {
    const store = usePlayerStore();
    expect(store.isLoopEnabled).toBe(true);
  });

  it('enableLoopForDrawnRange turns loop ON and remembers previous=OFF', () => {
    const store = usePlayerStore();
    store.toggleLoop(); // OFF
    expect(store.isLoopEnabled).toBe(false);

    store.enableLoopForDrawnRange();
    expect(store.isLoopEnabled).toBe(true);

    store.restoreLoopFromDrawnRange();
    expect(store.isLoopEnabled).toBe(false);
  });

  it('enableLoopForDrawnRange while already ON remembers previous=ON', () => {
    const store = usePlayerStore();
    expect(store.isLoopEnabled).toBe(true);

    store.enableLoopForDrawnRange();
    expect(store.isLoopEnabled).toBe(true);

    store.restoreLoopFromDrawnRange();
    expect(store.isLoopEnabled).toBe(true);
  });

  it('consecutive enableLoopForDrawnRange calls preserve the original snapshot', () => {
    const store = usePlayerStore();
    store.toggleLoop(); // OFF

    store.enableLoopForDrawnRange();
    // Simulate a redraw — must not overwrite the OFF snapshot.
    store.enableLoopForDrawnRange();

    store.restoreLoopFromDrawnRange();
    expect(store.isLoopEnabled).toBe(false);
  });

  it('toggleLoop invalidates any pending snapshot', () => {
    const store = usePlayerStore();
    store.toggleLoop(); // OFF

    store.enableLoopForDrawnRange();
    expect(store.isLoopEnabled).toBe(true);

    // User explicitly toggles off.
    store.toggleLoop();
    expect(store.isLoopEnabled).toBe(false);

    // restoreLoopFromDrawnRange now must be a no-op.
    store.restoreLoopFromDrawnRange();
    expect(store.isLoopEnabled).toBe(false);
  });

  it('restoreLoopFromDrawnRange without a snapshot is a no-op', () => {
    const store = usePlayerStore();
    expect(store.isLoopEnabled).toBe(true);
    store.restoreLoopFromDrawnRange();
    expect(store.isLoopEnabled).toBe(true);
  });
});

describe('loop previous-state restore — song load/unload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  function seedLibrary(): void {
    const libraryStore = useLibraryStore();
    libraryStore.items = [
      {
        id: 'audio-1',
        kind: 'audio',
        title: 'Song 1',
        source: { kind: 'reference', path: '/music/song1.mp3' },
        metadata: { fileName: 'song1.mp3', size: 5000, modifiedMs: 1 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastKnownOk: true,
      },
      {
        id: 'audio-2',
        kind: 'audio',
        title: 'Song 2',
        source: { kind: 'reference', path: '/music/song2.mp3' },
        metadata: { fileName: 'song2.mp3', size: 5000, modifiedMs: 1 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        lastKnownOk: true,
      },
    ];
  }

  it('loading a new song restores the pre-draw repeat state', async () => {
    seedLibrary();
    const store = useSongStore();
    store.repeatEnabled = false;

    await store.load('audio-1');
    await store.setLoopRegion(1000, 2000);
    expect(store.repeatEnabled).toBe(true);

    // Loading a different song dismisses the region — must restore OFF.
    await store.load('audio-2');
    expect(store.repeatEnabled).toBe(false);
  });

  it('unloading the song restores the pre-draw repeat state', async () => {
    seedLibrary();
    const store = useSongStore();
    store.repeatEnabled = false;

    await store.load('audio-1');
    await store.setLoopRegion(1000, 2000);
    expect(store.repeatEnabled).toBe(true);

    await store.unload();
    expect(store.repeatEnabled).toBe(false);
  });
});

describe('loop previous-state restore — useAlphaSelection.resetSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('resetSelection dismisses a drawn range and restores the pre-draw loop state', () => {
    const playerStore = usePlayerStore();
    const metronomeStore = useMetronomeStore();

    // User turns loop OFF explicitly.
    playerStore.toggleLoop();
    expect(playerStore.isLoopEnabled).toBe(false);

    // A drawn range is created — player forces loop ON and snapshots OFF.
    playerStore.enableLoopForDrawnRange();
    expect(playerStore.isLoopEnabled).toBe(true);

    // Tab change / explicit reset dismisses the range. Must restore OFF
    // instead of leaking the auto-enabled loop into the next file.
    const selection = useAlphaSelection({
      containerRef: ref(null),
      alphaAreaRef: ref(null),
      playerStore,
      metronomeStore,
      hasSelection: computed(() => true),
      isPlaying: computed(() => false),
      status: computed(() => 'ready'),
      isLoopEnabled: computed(() => playerStore.isLoopEnabled),
      overlayLocked: computed(() => false),
    });
    selection.resetSelection();

    expect(playerStore.isLoopEnabled).toBe(false);
  });
});
