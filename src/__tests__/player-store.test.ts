import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { LibraryItem } from '../domain/library';
import { usePlayerStore } from '../stores/player';

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    readFileBase64: vi.fn(),
  },
}));

vi.mock('../services/alphatabPlayer', () => ({
  alphatabPlayer: {
    isInitialized: vi.fn(() => true),
    loadBase64: vi.fn(),
    loadBytes: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setTempoPercent: vi.fn(),
    setMetronomeEnabled: vi.fn(),
    setCountInEnabled: vi.fn(),
    setMetronomeVolume: vi.fn(),
    setCountInVolume: vi.fn(),
    setLooping: vi.fn(),
    setBpm: vi.fn(),
    setTuning: vi.fn(),
    setTrackMute: vi.fn(),
    setTrackSolo: vi.fn(),
    setTrackVolume: vi.fn(),
    setVisibleTracks: vi.fn(),
    setActiveTrack: vi.fn(),
    setShowStandardNotation: vi.fn(),
    setTabRhythm: vi.fn(),
    setLayoutMode: vi.fn(),
    hasUnsupportedBackingTrack: vi.fn(() => false),
    seekToStart: vi.fn(),
    getCurrentTickPosition: vi.fn(() => 0),
    getCurrentBeatInfo: vi.fn(() => null),
    getTempoAtTick: vi.fn(() => 120),
    getTimeSignatureAtTick: vi.fn(() => ({ top: 4, bottom: 4 })),
    getBarStartTickAtTick: vi.fn(() => 0),
    getTickDivision: vi.fn(() => 480),
    getTransportState: vi.fn(() => 'playing'),
    getPlaybackRangeTicks: vi.fn(() => null),
    getBarCount: vi.fn(() => 1),
    getBarRangeTicks: vi.fn(() => ({ start: 0, end: 960 })),
    getBarTimeSignature: vi.fn(() => ({ top: 4, bottom: 4 })),
    getBeatDurationTicksAtTick: vi.fn(() => 480),
    tickToMs: vi.fn((tick: number) => tick),
    supportsTrackMute: false,
    supportsTrackSolo: false,
    supportsTrackVolume: false,
  },
  base64ToUint8Array: vi.fn((value: string) => {
    return new Uint8Array(value.length);
  }),
}));

vi.mock('../services/audioCommands', () => ({
  setMasterVolume: vi.fn().mockResolvedValue(undefined),
  setTabVolume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/audioTabCommands', () => ({
  setTrackState: vi.fn().mockResolvedValue(undefined),
  getAudioPositionMs: vi.fn(() => new Promise(() => {})), // never resolves — position polling is a no-op in tests
}));

vi.mock('../services/metronomeCommands', () => ({
  metronomeStart: vi.fn().mockResolvedValue(undefined),
  metronomeStop: vi.fn().mockResolvedValue(undefined),
  metronomeSetConfig: vi.fn().mockResolvedValue(undefined),
  metronomeBeep: vi.fn().mockResolvedValue(undefined),
  metronomeTickFromAlphaTab: vi.fn().mockResolvedValue(undefined),
  metronomeCancelScheduled: vi.fn().mockResolvedValue(undefined),
}));

import { libraryFileOps } from '../services/libraryFileOps';
import { alphatabPlayer, base64ToUint8Array } from '../services/alphatabPlayer';
import { setMasterVolume, setTabVolume } from '../services/audioCommands';
import { setTrackState } from '../services/audioTabCommands';
import { useAppStore } from '../stores/app';
import { useBeatmapStore } from '../stores/beatmap';
import { useMetronomeStore } from '../stores/metronome';
import { useNoteRecognitionStore } from '../stores/noteRecognition';
import {
  metronomeCancelScheduled,
  metronomeSetConfig,
  metronomeStart,
  metronomeStop,
} from '../services/metronomeCommands';
import type { GpBeatmap } from '../services/gpBeatmapBuilder';

const fileOps = libraryFileOps as unknown as {
  readFileBase64: ReturnType<typeof vi.fn>;
};
const playerApi = alphatabPlayer as unknown as {
  isInitialized: ReturnType<typeof vi.fn>;
  loadBase64: ReturnType<typeof vi.fn>;
  loadBytes: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setTempoPercent: ReturnType<typeof vi.fn>;
  setMetronomeEnabled: ReturnType<typeof vi.fn>;
  setCountInEnabled: ReturnType<typeof vi.fn>;
  setMetronomeVolume: ReturnType<typeof vi.fn>;
  setCountInVolume: ReturnType<typeof vi.fn>;
  setLooping: ReturnType<typeof vi.fn>;
  setBpm: ReturnType<typeof vi.fn>;
  setTuning: ReturnType<typeof vi.fn>;
  setTrackMute: ReturnType<typeof vi.fn>;
  setTrackSolo: ReturnType<typeof vi.fn>;
  setTrackVolume: ReturnType<typeof vi.fn>;
  setVisibleTracks: ReturnType<typeof vi.fn>;
  setActiveTrack: ReturnType<typeof vi.fn>;
  setShowStandardNotation: ReturnType<typeof vi.fn>;
  setTabRhythm: ReturnType<typeof vi.fn>;
  hasUnsupportedBackingTrack: ReturnType<typeof vi.fn>;
  seekToStart: ReturnType<typeof vi.fn>;
  getCurrentTickPosition: ReturnType<typeof vi.fn>;
  getCurrentBeatInfo: ReturnType<typeof vi.fn>;
  getTransportState: ReturnType<typeof vi.fn>;
  getTempoAtTick: ReturnType<typeof vi.fn>;
  getTimeSignatureAtTick: ReturnType<typeof vi.fn>;
  getPlaybackRangeTicks: ReturnType<typeof vi.fn>;
  supportsTrackMute: boolean;
  supportsTrackSolo: boolean;
  supportsTrackVolume: boolean;
};
const decodeBase64 = base64ToUint8Array as unknown as ReturnType<typeof vi.fn>;
const setMasterVolumeMock = setMasterVolume as unknown as ReturnType<
  typeof vi.fn
>;
const setTabVolumeMock = setTabVolume as unknown as ReturnType<typeof vi.fn>;
const setTrackStateMock = setTrackState as unknown as ReturnType<typeof vi.fn>;
const metronomeSetConfigMock = metronomeSetConfig as unknown as ReturnType<
  typeof vi.fn
>;
const metronomeStartMock = metronomeStart as unknown as ReturnType<
  typeof vi.fn
>;
const metronomeStopMock = metronomeStop as unknown as ReturnType<typeof vi.fn>;
const metronomeCancelScheduledMock =
  metronomeCancelScheduled as unknown as ReturnType<typeof vi.fn>;

const SYNC_TEST_ITEM: LibraryItem = {
  id: 'sync-item',
  title: 'Sync Item',
  source: { kind: 'reference', path: '/music/sync.gp5' },
  metadata: { fileName: 'sync.gp5', size: 321, modifiedMs: 2 },
  createdAt: '2025-01-01T10:00:00Z',
  updatedAt: '2025-01-01T10:00:00Z',
  lastKnownOk: true,
};

const SYNC_TEST_BEATMAP: GpBeatmap = {
  startBpm: 120,
  startTimeSigTop: 4,
  startTimeSigBottom: 4,
  endBar: 2,
  timeEvents: [{ barIndex: 1, bpm: 120, timeSigTop: 4, timeSigBottom: 4 }],
  loopEvents: [],
  playedBars: [
    {
      playedBarIndex: 1,
      notationBarIndex: 1,
      repeatPass: 0,
      playedBarLabel: '1',
      bpm: 120,
      timeSigTop: 4,
      timeSigBottom: 4,
    },
    {
      playedBarIndex: 2,
      notationBarIndex: 2,
      repeatPass: 0,
      playedBarLabel: '2',
      bpm: 120,
      timeSigTop: 4,
      timeSigBottom: 4,
    },
  ],
};

async function prepareBeatmapSyncedPlayback(
  store: ReturnType<typeof usePlayerStore>,
) {
  await store.openLibraryItem(SYNC_TEST_ITEM);
  const beatmapStore = useBeatmapStore();
  beatmapStore.setManualBeatmap(SYNC_TEST_ITEM.id, SYNC_TEST_BEATMAP);
  store.setReady();
}

describe('player store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    fileOps.readFileBase64.mockResolvedValue('BASE64');
    playerApi.isInitialized.mockReturnValue(true);
    playerApi.hasUnsupportedBackingTrack.mockReturnValue(false);
  });

  it('loads imported items using managedPath', async () => {
    const store = usePlayerStore();

    const item: LibraryItem = {
      id: 'lib-1',
      title: 'Song',
      source: {
        kind: 'imported',
        managedPath: '/app/library/lib-1.gpx',
        originalPath: '/music/song.gpx',
        originalFileName: 'song.gpx',
      },
      metadata: { fileName: 'song.gpx', size: 123, modifiedMs: 1 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    await store.openLibraryItem(item);

    expect(fileOps.readFileBase64).toHaveBeenCalledWith(
      '/app/library/lib-1.gpx',
    );
    expect(decodeBase64).toHaveBeenCalledWith('BASE64');
    expect(playerApi.loadBytes).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(playerApi.setTuning).toHaveBeenCalledWith(0, { force: true });
  });

  it('starts and stops beatmap-synced metronome on play/pause', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    await prepareBeatmapSyncedPlayback(store);

    store.play();
    expect(metronomeStartMock).toHaveBeenCalled();

    store.pause();
    expect(metronomeStopMock).toHaveBeenCalled();
  });

  it('starts alphatab playback before synced metronome start', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    await prepareBeatmapSyncedPlayback(store);

    store.play();

    expect(playerApi.play).toHaveBeenCalled();
    expect(metronomeStartMock).toHaveBeenCalled();
    const playOrder = playerApi.play.mock.invocationCallOrder[0] ?? 0;
    const metronomeOrder = metronomeStartMock.mock.invocationCallOrder[0] ?? 0;
    expect(playOrder).toBeGreaterThan(0);
    expect(metronomeOrder).toBeGreaterThan(playOrder);
  });

  it('does not stop synced metronome on player state=0 when stopped=false', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    store.setReady();
    await store.play();
    metronomeCancelScheduledMock.mockClear();

    await store.handleAlphaTabPlayerStateChanged({ state: 0, stopped: false });

    expect(metronomeCancelScheduledMock).not.toHaveBeenCalled();
  });

  it('does not stop synced metronome on stopped=true while playback is still playing', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    store.setReady();
    await store.play();
    metronomeCancelScheduledMock.mockClear();

    await store.handleAlphaTabPlayerStateChanged({ state: 0, stopped: true });

    expect(metronomeCancelScheduledMock).not.toHaveBeenCalled();
  });

  it('reconfigures beatmap schedule when tempo percent changes during playback', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    await prepareBeatmapSyncedPlayback(store);
    store.play();
    await Promise.resolve();
    await Promise.resolve();
    metronomeSetConfigMock.mockClear();
    metronomeStartMock.mockClear();
    store.setTempoPercent(80);
    await Promise.resolve();
    await store.refreshSyncedMetronomeAtCurrentPosition();
    expect(metronomeStartMock).toHaveBeenCalled();
  });

  it('stops synced metronome when playback ends', async () => {
    vi.useFakeTimers();
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    await prepareBeatmapSyncedPlayback(store);
    store.play();
    playerApi.getTransportState.mockReturnValue('ended');
    metronomeStopMock.mockClear();

    await store.handleAlphaTabPlayerStateChanged({ state: 0, stopped: true });
    vi.advanceTimersByTime(900);

    expect(metronomeStopMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps metronome running during count-in', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    await prepareBeatmapSyncedPlayback(store);
    store.model = { ...store.model, playback: 'stopped', countInEnabled: true };
    store.setCountInBars([1]);
    store.play();
    metronomeStopMock.mockClear();

    await Promise.resolve();

    expect(metronomeStopMock).not.toHaveBeenCalled();
  });

  it('loads reference items using path', async () => {
    const store = usePlayerStore();

    const item: LibraryItem = {
      id: 'lib-2',
      title: 'Ref Song',
      source: { kind: 'reference', path: '/music/ref.gp5' },
      metadata: { fileName: 'ref.gp5', size: 321, modifiedMs: 2 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    await store.openLibraryItem(item);

    expect(fileOps.readFileBase64).toHaveBeenCalledWith('/music/ref.gp5');
  });

  it('stops playback and metronome before loading a new tab', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    store.model = { ...store.model, playback: 'playing' };

    const item: LibraryItem = {
      id: 'lib-3',
      title: 'Next Song',
      source: { kind: 'reference', path: '/music/next.gp5' },
      metadata: { fileName: 'next.gp5', size: 111, modifiedMs: 3 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    await store.openLibraryItem(item);

    expect(playerApi.stop).toHaveBeenCalled();
    expect(metronomeCancelScheduledMock).toHaveBeenCalled();
  });

  it('disables feedback and clears results when switching to a different library item', async () => {
    // Regression: live-feedback is opt-in per tab. Opening a new tab
    // while feedback was enabled on the previous one must drop the
    // toggle so the user consciously turns it back on for the new
    // piece — otherwise stale note-results flash onto the new tab
    // and the overlay paints before any actual comparison has run.
    const firstItem: LibraryItem = {
      id: 'lib-first',
      title: 'First Song',
      source: { kind: 'reference', path: '/music/first.gp5' },
      metadata: { fileName: 'first.gp5', size: 100, modifiedMs: 1 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };
    const secondItem: LibraryItem = {
      id: 'lib-second',
      title: 'Second Song',
      source: { kind: 'reference', path: '/music/second.gp5' },
      metadata: { fileName: 'second.gp5', size: 200, modifiedMs: 2 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    const store = usePlayerStore();
    const recognitionStore = useNoteRecognitionStore();

    await store.openLibraryItem(firstItem);
    recognitionStore.setFeedbackEnabled(true);
    expect(recognitionStore.feedbackEnabled).toBe(true);

    await store.openLibraryItem(secondItem);

    expect(recognitionStore.feedbackEnabled).toBe(false);
    expect(recognitionStore.noteResults).toEqual([]);
  });

  it('stops the player BEFORE clearing the feedback timeline on tab switch', async () => {
    // Regression for review finding #1: previously openLibraryItem
    // called clearTimeline FIRST, which synchronously wiped
    // `feedbackEnabled` and `noteResults`. The PlayerPanel watcher
    // (default 'pre' flush) then fired AFTER the wipe, saw
    // `enabled=false / noteResults=[]`, and silently dropped the
    // in-flight feedback run — Stats DB never saw the run, summary
    // dialog never opened.
    //
    // The fix: stop() runs first so the playback transition triggers
    // the watcher with intact state, then `await nextTick()` flushes
    // the watcher (giving it a chance to capture noteResults via
    // `buildFeedbackSummary` and trigger persistCompletedRun), and
    // ONLY THEN clearTimeline wipes for the new tab.
    //
    // We assert the structural order (stop before clearTimeline) via
    // `mock.invocationCallOrder` and also check the live state at the
    // moment stop() ran — which is what the watcher would observe.
    const firstItem: LibraryItem = {
      id: 'lib-order-1',
      title: 'First',
      source: { kind: 'reference', path: '/music/order-1.gp5' },
      metadata: { fileName: 'order-1.gp5', size: 100, modifiedMs: 1 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };
    const secondItem: LibraryItem = {
      id: 'lib-order-2',
      title: 'Second',
      source: { kind: 'reference', path: '/music/order-2.gp5' },
      metadata: { fileName: 'order-2.gp5', size: 200, modifiedMs: 2 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    const store = usePlayerStore();
    const recognitionStore = useNoteRecognitionStore();

    await store.openLibraryItem(firstItem);
    recognitionStore.setFeedbackEnabled(true);
    // Simulate a run in progress: feedback armed, results accumulated.
    (
      recognitionStore as unknown as {
        noteResults: ReadonlyArray<{ outcome: string }>;
      }
    ).noteResults = [{ outcome: 'hit' }];
    // wasActive in openLibraryItem fires on transportState !== 'stopped'.
    // No need to drive the store's playback state — the test only
    // needs the stop() branch to be reached.
    playerApi.getTransportState.mockReturnValue('playing');

    // Capture state at the moment alphatabPlayer.stop is invoked —
    // this is what the watcher would see when its 'pre' flush runs.
    let stopObservedFeedbackEnabled: boolean | null = null;
    let stopObservedNoteResultsLength: number | null = null;
    playerApi.stop.mockImplementation(() => {
      stopObservedFeedbackEnabled = recognitionStore.feedbackEnabled;
      stopObservedNoteResultsLength = recognitionStore.noteResults.length;
    });
    const clearTimelineSpy = vi.spyOn(recognitionStore, 'clearTimeline');

    await store.openLibraryItem(secondItem);

    expect(stopObservedFeedbackEnabled).toBe(true);
    expect(stopObservedNoteResultsLength).toBe(1);
    // Structural assertion: stop ran before clearTimeline.
    expect(playerApi.stop.mock.invocationCallOrder[0]).toBeLessThan(
      clearTimelineSpy.mock.invocationCallOrder[0]!,
    );
    // Post-condition: clearTimeline DID still run, just second.
    expect(recognitionStore.feedbackEnabled).toBe(false);
    expect(recognitionStore.noteResults).toEqual([]);
  });

  it('keeps feedback state when reopening the same library item', async () => {
    // Opening the same tab twice (e.g. on app restart or via the
    // Library list refresh path) must not reset the feedback toggle.
    const item: LibraryItem = {
      id: 'lib-same',
      title: 'Same Song',
      source: { kind: 'reference', path: '/music/same.gp5' },
      metadata: { fileName: 'same.gp5', size: 50, modifiedMs: 1 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    const store = usePlayerStore();
    const recognitionStore = useNoteRecognitionStore();

    await store.openLibraryItem(item);
    recognitionStore.setFeedbackEnabled(true);
    await store.openLibraryItem(item);

    expect(recognitionStore.feedbackEnabled).toBe(true);
  });

  it('stops transport before loading when transport is active', async () => {
    const store = usePlayerStore();
    playerApi.getTransportState.mockReturnValue('playing');

    const item: LibraryItem = {
      id: 'lib-4',
      title: 'Stop First',
      source: { kind: 'reference', path: '/music/stop-first.gp5' },
      metadata: { fileName: 'stop-first.gp5', size: 222, modifiedMs: 4 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    await store.openLibraryItem(item);

    expect(playerApi.stop).toHaveBeenCalledTimes(1);
  });

  it('does not call stop when transport is already stopped', async () => {
    const store = usePlayerStore();
    playerApi.getTransportState.mockReturnValue('stopped');

    const item: LibraryItem = {
      id: 'lib-5',
      title: 'Already Stopped',
      source: { kind: 'reference', path: '/music/stopped.gp5' },
      metadata: { fileName: 'stopped.gp5', size: 333, modifiedMs: 5 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: true,
    };

    await store.openLibraryItem(item);

    expect(playerApi.stop).not.toHaveBeenCalled();
  });

  it('sets error state when load fails', async () => {
    fileOps.readFileBase64.mockRejectedValueOnce(new Error('read failed'));
    const store = usePlayerStore();

    const item: LibraryItem = {
      id: 'lib-3',
      title: 'Broken',
      source: { kind: 'reference', path: '/music/missing.gp5' },
      metadata: { fileName: 'missing.gp5', size: 0, modifiedMs: 2 },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      lastKnownOk: false,
    };

    await store.openLibraryItem(item);

    expect(store.model.status).toBe('error');
    expect(store.model.errorMessage).toBe('read failed');
  });

  it('clamps tempo and calls player', () => {
    const store = usePlayerStore();

    store.setTempoPercent(999);

    expect(store.model.tempoPercent).toBe(200);
    expect(playerApi.setTempoPercent).toHaveBeenCalledWith(200);
  });

  it('plays, pauses, and stops via player api', () => {
    const store = usePlayerStore();

    store.play();
    store.pause();
    store.stop();

    expect(playerApi.play).toHaveBeenCalled();
    expect(playerApi.pause).toHaveBeenCalled();
    expect(playerApi.stop).toHaveBeenCalled();
  });

  it('does not start tab playback while interval mode is enabled', () => {
    const metronomeStore = useMetronomeStore();
    const store = usePlayerStore();
    metronomeStore.setIntervalModeEnabled(true);

    store.play();

    expect(playerApi.play).not.toHaveBeenCalled();
    expect(store.model.errorMessage).toBeNull();
  });

  it('blocks playback when tab has unsupported backing track', () => {
    const store = usePlayerStore();
    playerApi.hasUnsupportedBackingTrack.mockReturnValue(true);

    store.play();

    expect(playerApi.play).not.toHaveBeenCalled();
    expect(store.unsupportedAudioTrackNoticeToken).toBe(1);
  });

  it('keeps external metronome running when allowed', async () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(false);
    const metronomeStore = useMetronomeStore();
    const store = usePlayerStore();

    await metronomeStore.setRunning(true);
    (metronomeStop as unknown as ReturnType<typeof vi.fn>).mockClear();

    store.allowExternalMetronomeOnce();
    store.play();

    expect(metronomeStop).not.toHaveBeenCalled();
  });

  it('toggles play/pause based on state', () => {
    const store = usePlayerStore();

    store.togglePlayPause();
    expect(playerApi.play).toHaveBeenCalled();

    store.togglePlayPause();
    expect(playerApi.pause).toHaveBeenCalled();
  });

  it('plays immediately when count-in is disabled', () => {
    vi.useFakeTimers();
    const appStore = useAppStore();
    const store = usePlayerStore();

    appStore.setMetronomeEnabled(true);
    appStore.setCountInEnabled(false);
    store.setCountInBars([2]);

    store.play();

    expect(playerApi.play).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('delays playback when count-in is enabled and clears after', async () => {
    vi.useFakeTimers();
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    await prepareBeatmapSyncedPlayback(store);

    store.model = { ...store.model, countInEnabled: true };
    appStore.setCountInEnabled(true);
    store.setCountInBars([1]);

    store.play();
    expect(playerApi.play).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2100);
    expect(playerApi.play).toHaveBeenCalled();
    expect(store.countInEnabled).toBe(true);

    vi.useRealTimers();
  });

  it('resets playhead and reapplies tuning for interval count-in', () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();

    store.setTuning(3);
    (playerApi.setTuning as ReturnType<typeof vi.fn>).mockClear();
    (playerApi.seekToStart as ReturnType<typeof vi.fn>).mockClear();

    store.playWithCountInBars(2);

    expect(playerApi.seekToStart).toHaveBeenCalledWith({ soft: false });
    expect(playerApi.setTuning).toHaveBeenCalledWith(3, { force: true });
  });

  it('resets playhead and tuning even if metronome is disabled', () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(false);
    const store = usePlayerStore();

    store.setTuning(-2);
    (playerApi.setTuning as ReturnType<typeof vi.fn>).mockClear();
    (playerApi.seekToStart as ReturnType<typeof vi.fn>).mockClear();

    store.playWithCountInBars(1);

    expect(playerApi.seekToStart).toHaveBeenCalledWith({ soft: false });
    expect(playerApi.setTuning).toHaveBeenCalledWith(-2, { force: true });
  });

  it('blocks count-in playback when tab has unsupported backing track', () => {
    const store = usePlayerStore();
    playerApi.hasUnsupportedBackingTrack.mockReturnValue(true);

    store.playWithCountInBars(1);

    expect(playerApi.seekToStart).not.toHaveBeenCalled();
    expect(playerApi.play).not.toHaveBeenCalled();
    expect(store.unsupportedAudioTrackNoticeToken).toBe(1);
  });

  it('toggles loop mode', () => {
    const store = usePlayerStore();

    // Loop defaults to ON so files repeat out of the box.
    expect(store.isLoopEnabled).toBe(true);

    store.toggleLoop();
    expect(store.isLoopEnabled).toBe(false);
    expect(playerApi.setLooping).toHaveBeenCalledWith(false);

    store.toggleLoop();
    expect(store.isLoopEnabled).toBe(true);
    expect(playerApi.setLooping).toHaveBeenCalledWith(true);
  });

  it('toggles metronome and count-in', () => {
    const store = usePlayerStore();

    expect(store.metronomeEnabled).toBe(false);
    expect(store.countInEnabled).toBe(false);

    store.toggleMetronome();
    expect(store.metronomeEnabled).toBe(true);
    expect(playerApi.setMetronomeEnabled).toHaveBeenCalledWith(true);

    store.toggleCountIn();
    expect(store.countInEnabled).toBe(true);
    expect(playerApi.setCountInEnabled).toHaveBeenCalledWith(false);
  });

  it('disables sync-to-tab when selection is cleared', () => {
    const appStore = useAppStore();
    const store = usePlayerStore();

    store.toggleMetronome();
    expect(store.metronomeEnabled).toBe(true);
    expect(appStore.metronomeEnabled).toBe(true);

    store.clearSelection();

    expect(store.metronomeEnabled).toBe(false);
    expect(appStore.metronomeEnabled).toBe(false);
    expect(metronomeCancelScheduledMock).toHaveBeenCalled();
  });

  it('defaults count-in bars to 2 when enabling without a selection', () => {
    const store = usePlayerStore();

    store.setCountInBars([]);
    store.toggleCountIn();

    expect(store.countInEnabled).toBe(true);
    expect(store.countInBars).toEqual([2]);
  });

  it('clamps metronome volume and keeps alphaTab metronome events enabled', () => {
    const store = usePlayerStore();

    store.setMetronomeVolume(150);
    expect(store.metronomeVolume).toBe(100);
    expect(playerApi.setMetronomeVolume).toHaveBeenCalledWith(1);

    store.toggleMetronome();
    store.setMetronomeVolume(20);
    expect(store.metronomeVolume).toBe(20);
    expect(playerApi.setMetronomeVolume).toHaveBeenCalledWith(1);
  });

  it('sets bpm and calls player percent', () => {
    const store = usePlayerStore();

    store.setBaseBpm(120);
    store.setBpm(180);

    expect(store.model.baseBpm).toBe(120);
    expect(store.model.currentBpm).toBe(180);
    expect(store.model.tempoPercent).toBe(150);
    expect(playerApi.setBpm).toHaveBeenCalledWith(180, 120);
  });

  it('ignores invalid bpm inputs', () => {
    const store = usePlayerStore();

    store.setBaseBpm(120);
    store.setBpm(Number.NaN);

    expect(store.model.currentBpm).toBe(120);
  });

  it('updates volume via audio command', () => {
    const store = usePlayerStore();

    store.setVolume(0.5);

    expect(store.volume).toBe(0.5);
    expect(setTabVolumeMock).toHaveBeenCalledWith(60);
  });

  it('updates master volume via audio command', () => {
    const store = usePlayerStore();

    store.setMasterVolume(0.5);

    expect(store.masterVolume).toBe(0.5);
    expect(setMasterVolumeMock).toHaveBeenCalledWith(11);
  });

  it('sets tracks and selects the active track by default', () => {
    const store = usePlayerStore();

    store.setTracks([
      { id: 'track-0', index: 0, name: 'Guitar' },
      { id: 'track-1', index: 1, name: 'Bass' },
    ]);

    expect(store.tracks).toHaveLength(2);
    expect(store.selectedTrackIds).toEqual(['track-0']);
    expect(store.activeTrackId).toBe('track-0');
    expect(store.activeTrackLabel).toBe('Guitar');
    expect(playerApi.setActiveTrack).toHaveBeenCalledWith(0);
    expect(playerApi.setShowStandardNotation).toHaveBeenCalledWith(true);
    expect(playerApi.setTabRhythm).toHaveBeenCalledWith(false);
  });

  it('prefers a non-percussion track as active on load', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Drums', isPercussion: true },
      { id: 'track-1', index: 1, name: 'Guitar' },
    ]);

    expect(store.activeTrackId).toBe('track-1');
    expect(playerApi.setActiveTrack).toHaveBeenCalledWith(1);
  });

  it('toggles tracks and updates visible indexes', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Guitar' },
      { id: 'track-1', index: 1, name: 'Bass' },
    ]);

    store.toggleTrack('track-1');

    expect(store.selectedTrackIds).toEqual(['track-0', 'track-1']);
    expect(playerApi.setActiveTrack).toHaveBeenCalledWith(null);
  });

  it('selects a single track and applies active index', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Guitar' },
      { id: 'track-1', index: 1, name: 'Bass' },
    ]);

    store.selectOnlyTrack('track-1');

    expect(store.activeTrackId).toBe('track-1');
    expect(store.activeTrackLabel).toBe('Bass');
    expect(playerApi.setActiveTrack).toHaveBeenCalledWith(1);
  });

  it('resets previous active track volume to default when switching tracks', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Guitar' },
      { id: 'track-1', index: 1, name: 'Bass' },
    ]);

    expect(store.getEffectiveMix('track-0').volume).toBe(80);
    expect(store.getEffectiveMix('track-1').volume).toBe(50);

    store.selectOnlyTrack('track-1');

    expect(store.getEffectiveMix('track-0').volume).toBe(50);
    expect(store.getEffectiveMix('track-1').volume).toBe(80);
  });

  it('keeps user-touched volume when switching away from active track', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Guitar' },
      { id: 'track-1', index: 1, name: 'Bass' },
    ]);

    store.setTrackVolume('track-0', 77);
    store.selectOnlyTrack('track-1');

    expect(store.getEffectiveMix('track-0').volume).toBe(77);
    expect(store.getEffectiveMix('track-1').volume).toBe(80);
  });

  it('does not auto-raise drum track volume when selecting it', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Guitar' },
      { id: 'track-1', index: 1, name: 'Drums', isPercussion: true },
    ]);

    expect(store.getEffectiveMix('track-1').volume).toBe(80);
    store.selectOnlyTrack('track-1');

    expect(store.getEffectiveMix('track-1').volume).toBe(80);
    expect(store.getEffectiveMix('track-0').volume).toBe(50);
  });

  it('computes an active track label based on active selection', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);

    expect(store.activeTrackLabel).toBe('Rhythm');
    store.selectOnlyTrack('track-1');
    expect(store.activeTrackLabel).toBe('Lead');
  });

  it('applies solo logic by muting non-solo tracks', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);

    store.toggleTrackSolo('track-1');

    expect(store.getEffectiveMix('track-0').effectiveMute).toBe(true);
    expect(store.getEffectiveMix('track-1').effectiveMute).toBe(false);
  });

  it('clamps track volume values', () => {
    const store = usePlayerStore();
    store.setTracks([{ id: 'track-0', index: 0, name: 'Rhythm' }]);

    store.setTrackVolume('track-0', 140);
    expect(store.getEffectiveMix('track-0').volume).toBe(100);
  });

  it('keeps existing track volumes when reloading same track ids', () => {
    const store = usePlayerStore();
    store.setTracks([{ id: 'track-0', index: 0, name: 'Rhythm' }]);
    store.setTrackVolume('track-0', 60);
    expect(store.getEffectiveMix('track-0').volume).toBe(60);

    store.setTracks([{ id: 'track-0', index: 0, name: 'Rhythm' }]);
    expect(store.getEffectiveMix('track-0').volume).toBe(60);
  });

  it('toggles listen mode for the active track', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);

    store.toggleListenForActiveTrack();
    expect(store.listenTrackId).toBe('track-0');
    store.toggleListenForActiveTrack();
    expect(store.listenTrackId).toBeNull();
  });

  it('keeps listen mode on the selected track when active track changes', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);

    store.toggleListenForActiveTrack();
    store.selectOnlyTrack('track-1');

    expect(store.listenTrackId).toBe('track-0');
  });

  it('toggles listen for a specific track', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);

    store.toggleListenForTrack('track-1');
    expect(store.listenTrackId).toBe('track-1');
    store.toggleListenForTrack('track-1');
    expect(store.listenTrackId).toBeNull();
  });

  it('supports multiple listen tracks and restores newly listened track volume', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
      { id: 'track-2', index: 2, name: 'Harmony' },
    ]);
    store.setTrackVolume('track-0', 90);
    store.setTrackVolume('track-1', 70);
    store.setTrackVolume('track-2', 60);

    store.toggleListenForTrack('track-0');
    expect(store.effectiveTrackVolume('track-1')).toBe(49);
    expect(store.effectiveTrackVolume('track-2')).toBe(42);

    store.toggleListenForTrack('track-1');
    expect(store.getEffectiveMix('track-0').listen).toBe(true);
    expect(store.getEffectiveMix('track-1').listen).toBe(true);
    expect(store.effectiveTrackVolume('track-0')).toBe(90);
    expect(store.effectiveTrackVolume('track-1')).toBe(70);
    expect(store.effectiveTrackVolume('track-2')).toBe(42);
  });

  it('ducks other tracks when listen mode is active', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);
    store.setTrackVolume('track-0', 80);
    store.setTrackVolume('track-1', 80);
    store.toggleListenForActiveTrack();

    expect(store.effectiveTrackVolume('track-0')).toBe(80);
    expect(store.effectiveTrackVolume('track-1')).toBe(56);
  });

  it('keeps non-listen track volume unchanged without listen mode', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);
    store.setTrackVolume('track-0', 80);
    store.setTrackVolume('track-1', 80);

    store.selectOnlyTrack('track-0');

    expect(store.effectiveTrackVolume('track-0')).toBe(80);
    expect(store.effectiveTrackVolume('track-1')).toBe(80);
  });

  it('applies effective volume to wrapper when supported', () => {
    const store = usePlayerStore();
    alphatabPlayer.supportsTrackVolume = true;
    playerApi.setTrackVolume.mockClear();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);

    store.setTrackVolume('track-0', 80);
    store.setTrackVolume('track-1', 80);
    store.toggleListenForActiveTrack();

    expect(playerApi.setTrackVolume).toHaveBeenCalledWith(0, 0.8);
    expect(playerApi.setTrackVolume).toHaveBeenCalledWith(1, 0.56);
  });

  it('defaults drum tracks to 80% and boosts output volume', () => {
    const store = usePlayerStore();
    alphatabPlayer.supportsTrackVolume = true;
    playerApi.setTrackVolume.mockClear();
    setTrackStateMock.mockClear();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Drums', isPercussion: true },
      { id: 'track-1', index: 1, name: 'Guitar' },
    ]);

    expect(store.getEffectiveMix('track-0').volume).toBe(80);
    expect(store.getEffectiveMix('track-1').volume).toBe(80);
    expect(playerApi.setTrackVolume).toHaveBeenCalledWith(0, 1);
    expect(playerApi.setTrackVolume).toHaveBeenCalledWith(1, 0.8);
    expect(setTrackStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: 'track-0',
        volume: 1.44,
      }),
    );
  });

  it('calls wrapper when mixer support is enabled', () => {
    const store = usePlayerStore();
    playerApi.setTrackMute.mockClear();
    alphatabPlayer.supportsTrackMute = true;
    store.setTracks([{ id: 'track-0', index: 0, name: 'Rhythm' }]);

    store.setTrackMute('track-0', true);

    expect(playerApi.setTrackMute).toHaveBeenCalledWith(0, true);
  });

  it('updates staff toggle via player api', () => {
    const store = usePlayerStore();

    store.setShowStandardNotation(false);

    expect(store.showStandardNotation).toBe(false);
    expect(playerApi.setShowStandardNotation).toHaveBeenCalledWith(false);
    expect(playerApi.setTabRhythm).toHaveBeenCalledWith(true);
  });

  it('keeps rendered active track after notation re-render', () => {
    const store = usePlayerStore();
    store.setTracks([
      { id: 'track-0', index: 0, name: 'Rhythm' },
      { id: 'track-1', index: 1, name: 'Lead' },
    ]);
    store.selectOnlyTrack('track-1');
    playerApi.setActiveTrack.mockClear();

    store.setShowStandardNotation(true);

    expect(playerApi.setActiveTrack).toHaveBeenCalledWith(1);
  });

  it('clamps tuning values to the supported range', () => {
    const store = usePlayerStore();
    store.setTuning(20);
    expect(store.tuning).toBe(12);
    expect(playerApi.setTuning).toHaveBeenCalledWith(12);
    store.setTuning(-30);
    expect(store.tuning).toBe(-12);
    expect(playerApi.setTuning).toHaveBeenCalledWith(-12);
    store.setTuning(5.4);
    expect(store.tuning).toBe(5);
    expect(playerApi.setTuning).toHaveBeenCalledWith(5);
  });

  // -------------------------------------------------------------------------
  // playWithCountInBars: note comparison wiring (Finding 2 regression)
  // -------------------------------------------------------------------------

  it('playWithCountInBars starts note comparison on immediate play path', () => {
    // Metronome enabled but no beatmap → config = null → delayMs = 0 →
    // hits the immediate play path (not the delayed timer path, not play()).
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    const noteRecognitionStore = useNoteRecognitionStore();
    noteRecognitionStore.setFeedbackEnabled(true);

    store.playWithCountInBars(0);

    expect(noteRecognitionStore.isComparing).toBe(true);
  });

  it('playWithCountInBars stops note comparison on stop', () => {
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    const noteRecognitionStore = useNoteRecognitionStore();
    noteRecognitionStore.setFeedbackEnabled(true);

    store.playWithCountInBars(0);
    expect(noteRecognitionStore.isComparing).toBe(true);

    store.stop();
    expect(noteRecognitionStore.isComparing).toBe(false);
  });

  it('playWithCountInBars does NOT start note comparison when feedback is off', () => {
    // Review finding 1: transport paths call startComparison unconditionally,
    // but the store must stay idle while feedback is disabled.
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    const store = usePlayerStore();
    const noteRecognitionStore = useNoteRecognitionStore();
    // feedbackEnabled defaults to false.

    store.playWithCountInBars(0);

    expect(noteRecognitionStore.isComparing).toBe(false);
  });

  it('keeps the fretboard open through playback / pause / seek', async () => {
    // Only tab change + manual toggle close the fretboard. Playback
    // transitions must NOT auto-dismiss it — practicing through a
    // chord change is the panel's primary use case.
    const store = usePlayerStore();
    store.setFretboardOpen(true);

    store.model.playback = 'playing';
    await nextTick();
    expect(store.fretboardOpen).toBe(true);

    store.model.playback = 'paused';
    await nextTick();
    expect(store.fretboardOpen).toBe(true);

    store.model.playback = 'stopped';
    await nextTick();
    expect(store.fretboardOpen).toBe(true);
  });

  it('closes the fretboard when the active tab changes', async () => {
    const store = usePlayerStore();
    store.model.currentLibraryItemId = 'tab-a';
    await nextTick();
    store.setFretboardOpen(true);

    store.model.currentLibraryItemId = 'tab-b';
    await nextTick();

    expect(store.fretboardOpen).toBe(false);
  });

  it('calls setLayoutMode exactly once per setHorizontalLayout toggle', async () => {
    // Regression for review finding #9. setHorizontalLayout used
    // to mutate appStore.horizontalLayout AND call
    // alphatabPlayer.setLayoutMode directly — the watcher then
    // fired and called setLayoutMode a SECOND time, triggering
    // two full api.render() passes per toggle (visible flicker,
    // beat-rect cache rebuilt twice). The fix routes the toggle
    // through the store ref only and lets the watcher do the
    // single push.
    const store = usePlayerStore();
    // Pin a known starting state so the test is independent of the
    // store's initial default value (which is `false` since 1.3.0
    // shipped the multi-line view as the new default; previously
    // `true`). Without this, asserting "first toggle calls
    // setLayoutMode once" would silently break whenever the
    // default flips.
    store.setHorizontalLayout(true);
    await nextTick();
    playerApi.setLayoutMode.mockClear();

    store.setHorizontalLayout(false);
    await nextTick();
    expect(playerApi.setLayoutMode).toHaveBeenCalledTimes(1);
    expect(playerApi.setLayoutMode).toHaveBeenLastCalledWith(false);

    store.setHorizontalLayout(true);
    await nextTick();
    expect(playerApi.setLayoutMode).toHaveBeenCalledTimes(2);
    expect(playerApi.setLayoutMode).toHaveBeenLastCalledWith(true);
  });

  it('skips the direct setLayoutMode call when a tab is loaded — reload applies it once via setReady', async () => {
    // P3 review finding: the layout watcher used to call
    // `setLayoutMode` directly AND trigger `reloadCurrentLibraryItem`.
    // For a loaded tab that meant rendering the OLD in-memory score
    // with the new layout (just to throw it away when the reload
    // landed) — visible flicker for no benefit. Now the watcher
    // gates: tab loaded → reload only, no direct setLayoutMode (the
    // reload's openLibraryItem → setReady applies it on the fresh
    // alphatab instance).
    //
    // We assert via the observable side effect: `playerApi.
    // setLayoutMode` is NOT called from the watcher. The reload's
    // own setLayoutMode (via setReady) doesn't fire here either —
    // libraryFileOps.readFileBase64 isn't mocked to return content
    // so the reload's loadBytes never reaches the scoreLoaded
    // handler. Net call count remains zero.
    const store = usePlayerStore();
    store.setHorizontalLayout(true);
    await nextTick();
    store.model.currentLibraryItemId = 'tab-loaded';
    playerApi.setLayoutMode.mockClear();

    store.setHorizontalLayout(false);
    await nextTick();

    expect(playerApi.setLayoutMode).not.toHaveBeenCalled();
  });

  it('still calls setLayoutMode directly when no tab is loaded (no reload to do)', async () => {
    // Companion test: when there's no library item to reload, the
    // layout setting still has to reach alphatab so the next score
    // that loads picks it up. The watcher's else-branch covers this.
    const store = usePlayerStore();
    store.setHorizontalLayout(true);
    await nextTick();
    expect(store.model.currentLibraryItemId).toBeNull();
    playerApi.setLayoutMode.mockClear();

    store.setHorizontalLayout(false);
    await nextTick();

    expect(playerApi.setLayoutMode).toHaveBeenCalledTimes(1);
    expect(playerApi.setLayoutMode).toHaveBeenLastCalledWith(false);
  });
});
