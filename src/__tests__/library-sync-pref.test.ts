// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    readFileBase64: vi.fn().mockResolvedValue(''),
  },
}));

vi.mock('../services/alphatabPlayer', () => ({
  alphatabPlayer: {
    isInitialized: vi.fn(() => true),
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
    setShowStandardNotation: vi.fn(),
    setTabRhythm: vi.fn(),
    setLayoutMode: vi.fn(),
    hasUnsupportedBackingTrack: vi.fn(() => false),
    seekToStart: vi.fn(),
    getCurrentTickPosition: vi.fn(() => 0),
    getTransportState: vi.fn(() => 'stopped'),
    getPlaybackRangeTicks: vi.fn(() => null),
    supportsTrackMute: false,
    supportsTrackSolo: false,
    supportsTrackVolume: false,
  },
  base64ToUint8Array: vi.fn(() => new Uint8Array([1])),
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

import { usePlayerStore } from '../stores/player';
import { useAppStore } from '../stores/app';
import type { LibraryItem } from '../domain/library';

function tabItem(id: string): LibraryItem {
  return {
    id,
    title: id,
    source: { kind: 'reference', path: `/music/${id}.gp5` },
    metadata: { fileName: `${id}.gp5`, size: 100, modifiedMs: 1 },
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    lastKnownOk: true,
  };
}

describe('sync-to-tab default + per-tab preference', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('defaults to ON when a library tab is opened for the first time', async () => {
    const appStore = useAppStore();
    const playerStore = usePlayerStore();
    appStore.setMetronomeEnabled(false);
    expect(appStore.metronomeEnabled).toBe(false);

    await playerStore.openLibraryItem(tabItem('tab-a'), 'library');

    expect(appStore.metronomeEnabled).toBe(true);
  });

  it('restores the saved per-tab preference on subsequent library opens', async () => {
    const appStore = useAppStore();
    const playerStore = usePlayerStore();

    await playerStore.openLibraryItem(tabItem('tab-a'), 'library');
    // User toggles it OFF while tab-a is loaded.
    playerStore.toggleMetronome();
    expect(appStore.metronomeEnabled).toBe(false);

    // Load a different tab — defaults to ON again (no saved pref for it).
    await playerStore.openLibraryItem(tabItem('tab-b'), 'library');
    expect(appStore.metronomeEnabled).toBe(true);

    // Return to tab-a — the OFF preference is restored.
    await playerStore.openLibraryItem(tabItem('tab-a'), 'library');
    expect(appStore.metronomeEnabled).toBe(false);
  });

  it('forces sync ON when a tab opens via the practice source, overriding any saved pref', async () => {
    const appStore = useAppStore();
    const playerStore = usePlayerStore();

    // Saved OFF pref for tab-a.
    appStore.setLibrarySyncPref('tab-a', false);

    await playerStore.openLibraryItem(tabItem('tab-a'), 'practice');

    // Practice source ignores the library pref and forces ON.
    expect(appStore.metronomeEnabled).toBe(true);
  });

  it('does not overwrite a library pref when the user toggles while in practice mode', async () => {
    const appStore = useAppStore();
    const playerStore = usePlayerStore();

    appStore.setLibrarySyncPref('tab-a', true);

    await playerStore.openLibraryItem(tabItem('tab-a'), 'practice');
    // User toggles off during the practice session.
    playerStore.toggleMetronome();

    // The library preference must stay untouched — practice flows should
    // not bleed into what the Library page remembers.
    expect(appStore.getLibrarySyncPref('tab-a')).toBe(true);
  });
});

describe('library-load clears the expanded exercise context', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('stops the active exercise session when openLibraryItemInPlayer runs with source=library', async () => {
    const { openLibraryItemInPlayer } = await import('../services/openPlayer');
    const { usePracticeStore } = await import('../stores/practice');
    const { usePracticeUiStore } = await import('../stores/practiceUi');
    const { useUiStore } = await import('../stores/ui');

    const practiceStore = usePracticeStore();
    const practiceUi = usePracticeUiStore();
    const uiStore = useUiStore();
    const playerStore = usePlayerStore();

    // Simulate a running exercise session (expansion-driven).
    practiceUi.setExpandedExerciseId('ex-42');
    practiceUi.expandedItemByPlan = { 'plan-1': 'ex-42' };
    await practiceStore.startExercise('ex-42');
    expect(practiceStore.activeExerciseId).toBe('ex-42');

    await openLibraryItemInPlayer(
      tabItem('tab-a'),
      playerStore,
      uiStore,
      'library',
    );

    // Library-path load = context switch: exercise is no longer active,
    // expansion map is cleared so the bottom-bar timer badge reflects the
    // newly-loaded tab instead of the stale exercise.
    expect(practiceStore.activeExerciseId).toBeNull();
    expect(practiceUi.expandedExerciseId).toBeNull();
    expect(practiceUi.expandedItemByPlan).toEqual({});
  });

  it('keeps the exercise session intact when openLibraryItemInPlayer runs with source=practice', async () => {
    const { openLibraryItemInPlayer } = await import('../services/openPlayer');
    const { usePracticeStore } = await import('../stores/practice');
    const { usePracticeUiStore } = await import('../stores/practiceUi');
    const { useUiStore } = await import('../stores/ui');

    const practiceStore = usePracticeStore();
    const practiceUi = usePracticeUiStore();
    const uiStore = useUiStore();
    const playerStore = usePlayerStore();

    practiceUi.setExpandedExerciseId('ex-42');
    practiceUi.expandedItemByPlan = { 'plan-1': 'ex-42' };
    await practiceStore.startExercise('ex-42');

    await openLibraryItemInPlayer(
      tabItem('tab-a'),
      playerStore,
      uiStore,
      'practice',
    );

    expect(practiceStore.activeExerciseId).toBe('ex-42');
    expect(practiceUi.expandedExerciseId).toBe('ex-42');
  });
});
