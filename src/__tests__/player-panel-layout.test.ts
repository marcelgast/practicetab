// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { LibraryItem } from '../domain/library';
import { useLibraryStore } from '../stores/library';
import { useMetronomeStore } from '../stores/metronome';
import { usePlayerStore } from '../stores/player';
import { useNoteRecognitionStore } from '../stores/noteRecognition';
import { alphatabPlayer } from '../services/alphatabPlayer';
vi.mock('../services/alphatabPlayer', () => ({
  alphatabPlayer: {
    isInitialized: vi.fn(() => true),
    init: vi.fn(),
    dispose: vi.fn(),
    getContainerSize: vi.fn(() => ({ width: 0, height: 0 })),
    refreshLayout: vi.fn(),
    refreshBeatCache: vi.fn(),
    clearPlaybackRangeHighlight: vi.fn(),
    clearPlaybackRange: vi.fn(),
    waitForNextCursorRect: vi.fn(async () => null),
    waitForRenderFinished: vi.fn(async () => undefined),
    seekToStart: vi.fn(),
    getCurrentCursorRect: vi.fn(() => null),
    getBeatAtPosition: vi.fn(() => null),
    getBeatStartTick: vi.fn(() => null),
    getBarCount: vi.fn(() => 0),
    getBarIndexFromBeat: vi.fn(() => null),
    getBarBoundsByIndex: vi.fn(() => null),
    getBarIndexAtPosition: vi.fn(() => null),
    getBarStartTick: vi.fn(() => null),
    getCurrentTickPosition: vi.fn(() => 0),
    getCurrentBeatInfo: vi.fn(() => null),
    seekAndPlay: vi.fn(),
    seekToTick: vi.fn(),
    seekToMs: vi.fn(),
    getTempoAtTick: vi.fn(() => 120),
    getTimeSignatureAtTick: vi.fn(() => ({ top: 4, bottom: 4 })),
    getPlaybackRangeTicks: vi.fn(() => null),
    snapToNearestBeat: vi.fn(() => null),
    setPlaybackRangeFromBeats: vi.fn(() => false),
    setPlaybackRangeFromBarIndex: vi.fn(() => false),
    applyPlaybackRangeFromHighlight: vi.fn(),
    highlightPlaybackRange: vi.fn(),
    setLooping: vi.fn(),
    setActiveTrack: vi.fn(),
    setVisibleTracks: vi.fn(),
    setTrackMute: vi.fn(),
    setTrackSolo: vi.fn(),
    setTrackVolume: vi.fn(),
    setBpm: vi.fn(),
    setTempoPercent: vi.fn(),
    setMetronomeEnabled: vi.fn(),
    setMetronomeVolume: vi.fn(),
    setCountInEnabled: vi.fn(),
    setCountInVolume: vi.fn(),
    hasUnsupportedBackingTrack: vi.fn(() => false),
    setShowStandardNotation: vi.fn(),
    setTabRhythm: vi.fn(),
    setLayoutMode: vi.fn(),
    setTuning: vi.fn(),
    loadBytes: vi.fn(),
    loadBase64: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    supportsTrackMute: false,
    supportsTrackSolo: false,
    supportsTrackVolume: false,
  },
}));

vi.mock('../services/alphatabAssets', () => ({
  getAlphaTabFontDirectory: vi.fn(() => '/alphatab/'),
}));

vi.mock('../services/audioCommands', () => ({
  setMasterVolume: vi.fn().mockResolvedValue(undefined),
  setTabVolume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/audioTabCommands', () => ({
  setTrackState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => false),
  libraryFileOps: {
    readFileBase64: vi.fn(),
  },
}));

vi.mock('../services/metronomeCommands', () => ({
  metronomeStart: vi.fn().mockResolvedValue(undefined),
  metronomeStop: vi.fn().mockResolvedValue(undefined),
  metronomeSetConfig: vi.fn().mockResolvedValue(undefined),
  metronomeBeep: vi.fn().mockResolvedValue(undefined),
  metronomeTickFromAlphaTab: vi.fn().mockResolvedValue(undefined),
  metronomeCancelScheduled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../components/ui/AppTooltip.vue', () => ({
  default: {
    name: 'AppTooltip',
    inheritAttrs: false,
    props: {
      text: { type: String, default: '' },
      side: { type: String, default: 'bottom' },
      align: { type: String, default: 'center' },
      open: { type: Boolean, default: undefined },
    },
    setup(_: never, { slots }: { slots: Record<string, () => unknown> }) {
      return () => slots.default?.();
    },
  },
}));

vi.mock('../components/ui/AccentSlider.vue', () => ({
  default: {
    name: 'AccentSlider',
    props: {
      modelValue: { type: Number, default: 0 },
    },
    emits: ['update:modelValue'],
    setup(
      props: { modelValue: number },
      {
        emit,
      }: {
        emit: (event: 'update:modelValue', value: number) => void;
      },
    ) {
      return () =>
        h('button', {
          class: 'accent-slider-stub',
          type: 'button',
          onClick: () =>
            emit('update:modelValue', Number(props.modelValue) + 1),
        });
    },
  },
}));

import PlayerPanel from '../components/player/PlayerPanel.vue';

function mountOverlayHost(): HTMLDivElement {
  const overlayHost = document.createElement('div');
  overlayHost.className = 'app-overlays';
  document.body.appendChild(overlayHost);
  return overlayHost;
}

describe('player panel layout warning', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
    })) as unknown as typeof fetch;
    const initMock = alphatabPlayer.init as unknown as {
      mockClear: () => void;
    };
    initMock.mockClear?.();
  });

  it('does not show the layout warning when no tab is selected', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    expect(host.textContent).not.toContain('Player area has no size');

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('disables score click interactions while an overlay is locked', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const item: LibraryItem = {
      id: 'item-1',
      title: 'Test',
      source: { kind: 'reference', path: '/tmp/test.gp' },
      metadata: { fileName: 'test.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [item];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-1',
    };
    playerStore.setOverlayLock(true);

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();

    const area = host.querySelector('.alpha-area') as HTMLElement;
    area.dispatchEvent(new MouseEvent('click', { clientX: 10, clientY: 10 }));

    const playerApi = alphatabPlayer as unknown as {
      snapToNearestBeat: ReturnType<typeof vi.fn>;
    };
    expect(playerApi.snapToNearestBeat).not.toHaveBeenCalled();

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('shows interval mode indicator in bottom bar when interval mode is active', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const metronomeStore = useMetronomeStore();
    metronomeStore.setIntervalModeEnabled(true);

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();

    expect(
      host.querySelector('[aria-label="Interval Mode Active"]'),
    ).toBeTruthy();

    metronomeStore.setIntervalModeEnabled(false);
    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('clears selection overlays when switching tabs while loading', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const itemA: LibraryItem = {
      id: 'item-a',
      title: 'Test A',
      source: { kind: 'reference', path: '/tmp/test-a.gp' },
      metadata: { fileName: 'test-a.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    const itemB: LibraryItem = {
      id: 'item-b',
      title: 'Test B',
      source: { kind: 'reference', path: '/tmp/test-b.gp' },
      metadata: { fileName: 'test-b.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [itemA, itemB];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-a',
    };
    vi.spyOn(playerStore, 'openLibraryItem').mockResolvedValue(
      undefined as never,
    );

    type AlphaTabInitOptions = {
      onReady?: () => void;
      onPlaybackRangeHighlightChanged?: (
        blocks: Array<{ x: number; y: number; w: number; h: number }>,
      ) => void;
    };
    let initOptions: AlphaTabInitOptions | null = null;
    const initMock = alphatabPlayer.init as unknown as {
      mockImplementation: (
        fn: (container: HTMLElement, options: AlphaTabInitOptions) => void,
      ) => void;
    };
    initMock.mockImplementation((_container, options) => {
      initOptions = options;
      options.onReady?.();
    });

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    initOptions?.onBeatMouseDown?.(null);
    initOptions?.onPlaybackRangeHighlightChanged?.([
      { x: 0, y: 0, w: 40, h: 20 },
    ]);
    await nextTick();
    expect(host.querySelectorAll('.selection-overlay')).toHaveLength(1);

    playerStore.model = {
      ...playerStore.model,
      status: 'loading',
      currentLibraryItemId: 'item-b',
    };
    await nextTick();

    expect(host.querySelectorAll('.selection-overlay')).toHaveLength(0);

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('suppresses stale highlights until a new selection starts', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const itemA: LibraryItem = {
      id: 'item-a',
      title: 'Test A',
      source: { kind: 'reference', path: '/tmp/test-a.gp' },
      metadata: { fileName: 'test-a.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    const itemB: LibraryItem = {
      id: 'item-b',
      title: 'Test B',
      source: { kind: 'reference', path: '/tmp/test-b.gp' },
      metadata: { fileName: 'test-b.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [itemA, itemB];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-a',
    };
    vi.spyOn(playerStore, 'openLibraryItem').mockResolvedValue(
      undefined as never,
    );

    type AlphaTabInitOptions = {
      onReady?: () => void;
      onPlaybackRangeHighlightChanged?: (
        blocks: Array<{ x: number; y: number; w: number; h: number }>,
      ) => void;
      onBeatMouseDown?: (beat: unknown) => void;
    };
    let initOptions: AlphaTabInitOptions | null = null;
    const initMock = alphatabPlayer.init as unknown as {
      mockImplementation: (
        fn: (container: HTMLElement, options: AlphaTabInitOptions) => void,
      ) => void;
    };
    initMock.mockImplementation((_container, options) => {
      initOptions = options;
      options.onReady?.();
    });

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    initOptions?.onBeatMouseDown?.(null);
    initOptions?.onPlaybackRangeHighlightChanged?.([
      { x: 0, y: 0, w: 40, h: 20 },
    ]);
    await nextTick();
    expect(host.querySelectorAll('.selection-overlay')).toHaveLength(1);

    playerStore.model = {
      ...playerStore.model,
      status: 'loading',
      currentLibraryItemId: 'item-b',
    };
    await nextTick();

    initOptions?.onPlaybackRangeHighlightChanged?.([
      { x: 0, y: 0, w: 40, h: 20 },
    ]);
    await nextTick();
    expect(host.querySelectorAll('.selection-overlay')).toHaveLength(0);

    initOptions?.onBeatMouseDown?.(null);
    initOptions?.onPlaybackRangeHighlightChanged?.([
      { x: 0, y: 0, w: 40, h: 20 },
    ]);
    await nextTick();
    expect(host.querySelectorAll('.selection-overlay')).toHaveLength(1);

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('scrolls to top when a score is loaded', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const library = useLibraryStore();
    const item: LibraryItem = {
      id: 'item-1',
      title: 'Test',
      source: { kind: 'reference', path: '/tmp/test.gp5' },
      metadata: { fileName: 'test.gp5', size: 1, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    library.items = [item];
    const player = usePlayerStore();
    player.setReady();
    player.model.currentLibraryItemId = item.id;

    const app = createApp(PlayerPanel, {
      overlayLocked: false,
    });
    app.use(pinia);
    app.mount(host);
    await nextTick();
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    const initArgs = (
      alphatabPlayer.init as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    const options = initArgs?.[1] as
      | { onScoreLoaded?: (tempo: number) => void }
      | undefined;
    const alphaArea = host.querySelector('.alpha-area') as HTMLElement | null;
    if (!alphaArea) {
      throw new Error('Missing alpha area');
    }
    alphaArea.scrollTop = 120;
    alphaArea.scrollLeft = 80;
    options?.onScoreLoaded?.(120);
    await nextTick();
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(alphaArea.scrollTop).toBe(0);
    expect(alphaArea.scrollLeft).toBe(0);

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('disables the help button while playing', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const playerStore = usePlayerStore();
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      playback: 'playing',
    };

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();

    const helpButton = host.querySelector(
      'button[aria-label="Help"]',
    ) as HTMLButtonElement | null;
    expect(helpButton).not.toBeNull();
    expect(helpButton?.disabled).toBe(true);

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('keeps help button enabled when interval mode is active but not playing', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const playerStore = usePlayerStore();
    const metronomeStore = useMetronomeStore();
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      playback: 'paused',
    };
    metronomeStore.intervalModeEnabled = true;

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();

    const helpButton = host.querySelector(
      'button[aria-label="Help"]',
    ) as HTMLButtonElement | null;
    expect(helpButton).not.toBeNull();
    expect(helpButton?.disabled).toBe(false);

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('opens and closes the track menu, updating overlay lock', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const item: LibraryItem = {
      id: 'item-2',
      title: 'Test',
      source: { kind: 'reference', path: '/tmp/test.gp' },
      metadata: { fileName: 'test.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [item];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-2',
    };
    playerStore.setTracks([
      { id: 'track-1', index: 0, name: 'Track 1', isPercussion: false },
    ]);

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();

    const trigger = host.querySelector('.track-trigger') as HTMLElement;
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(playerStore.overlayLocked).toBe(true);
    expect(host.querySelector('.track-overlay')).not.toBeNull();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await nextTick();

    expect(playerStore.overlayLocked).toBe(false);
    expect(host.querySelector('.track-overlay')).toBeNull();

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('toggles tuning overlay and adjusts tuning', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const item: LibraryItem = {
      id: 'item-3',
      title: 'Test',
      source: { kind: 'reference', path: '/tmp/test.gp' },
      metadata: { fileName: 'test.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [item];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-3',
    };

    const adjustSpy = vi.spyOn(playerStore, 'adjustTuning');

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();

    const trigger = host.querySelector('.tuning-trigger') as HTMLElement;
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(playerStore.overlayLocked).toBe(true);
    expect(host.querySelector('.tuning-overlay')).not.toBeNull();

    const upButton = host.querySelector(
      '[aria-label=\"Tune up\"]',
    ) as HTMLElement;
    upButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(adjustSpy).toHaveBeenCalledWith(1);

    const downButton = host.querySelector(
      '[aria-label=\"Tune down\"]',
    ) as HTMLElement;
    downButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(adjustSpy).toHaveBeenCalledWith(-1);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await nextTick();

    expect(playerStore.overlayLocked).toBe(false);
    expect(host.querySelector('.tuning-overlay')).toBeNull();

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('renders volume dropdown with tab and metronome sliders and updates both', async () => {
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const playerStore = usePlayerStore();
    const setVolumeSpy = vi.spyOn(playerStore, 'setVolume');
    const setMasterVolumeSpy = vi.spyOn(playerStore, 'setMasterVolume');
    const setMetronomeVolumeSpy = vi.spyOn(playerStore, 'setMetronomeVolume');

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();

    const trigger = host.querySelector('.volume-trigger') as HTMLButtonElement;
    trigger.click();
    await nextTick();

    const rows = Array.from(host.querySelectorAll('.volume-menu-row')).map(
      (row) => row.textContent?.trim(),
    );
    expect(rows.some((text) => text?.includes('Master'))).toBe(true);
    expect(rows.some((text) => text?.includes('Tab'))).toBe(true);
    expect(rows.some((text) => text?.includes('Metronome'))).toBe(true);

    const sliders = host.querySelectorAll(
      '.volume-menu-row .accent-slider-stub',
    ) as NodeListOf<HTMLButtonElement>;
    expect(sliders).toHaveLength(3);
    sliders[0]?.click();
    sliders[1]?.click();
    sliders[2]?.click();

    expect(setVolumeSpy).toHaveBeenCalled();
    expect(setMasterVolumeSpy).toHaveBeenCalled();
    expect(setMetronomeVolumeSpy).toHaveBeenCalled();

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('reloads the tab from disk when feedback is enabled mid-playback', async () => {
    // Earlier iterations seekToStart'd here but the comparison
    // engine ended up ahead of the audio buffer because alphatab's
    // playhead reset wasn't tightly synchronised with the audio
    // engine. Marcel asked for a hard tab-file reload instead — a
    // clean re-init of alphatab + audio guarantees no inherited
    // state can drift, so the comparison and audio always start
    // at exactly the same musical position.
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const noteRecognitionStore = useNoteRecognitionStore();
    const item: LibraryItem = {
      id: 'item-feedback',
      title: 'Test',
      source: { kind: 'reference', path: '/tmp/feedback.gp' },
      metadata: { fileName: 'feedback.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [item];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-feedback',
    };
    expect(noteRecognitionStore.feedbackEnabled).toBe(false);

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    playerStore.model = { ...playerStore.model, playback: 'playing' };
    await nextTick();

    const reloadSpy = vi
      .spyOn(playerStore, 'reloadCurrentLibraryItem')
      .mockResolvedValue();
    const startComparisonSpy = vi.spyOn(
      noteRecognitionStore,
      'startComparison',
    );

    noteRecognitionStore.setFeedbackEnabled(true);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    expect(reloadSpy).toHaveBeenCalled();
    // P2 review finding: the watcher must RETURN after triggering
    // the reload so it doesn't fall through into the stale
    // playing-state branch and call startComparison against
    // pre-reload state. After the reload's `stop()` settles, the
    // watcher fires again with [true, 'stopped'] and the user has
    // to press Play to actually start the run.
    expect(startComparisonSpy).not.toHaveBeenCalled();

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('also reloads the tab when feedback is enabled while stopped', async () => {
    // Same reload contract regardless of playback state. The user
    // arming feedback always wants their next run to start from a
    // clean bar-1 — playing/paused/stopped all go through reload.
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const noteRecognitionStore = useNoteRecognitionStore();
    const item: LibraryItem = {
      id: 'item-feedback-pre',
      title: 'Test',
      source: { kind: 'reference', path: '/tmp/feedback-pre.gp' },
      metadata: { fileName: 'feedback-pre.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [item];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-feedback-pre',
      playback: 'stopped',
    };

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    const reloadSpy = vi
      .spyOn(playerStore, 'reloadCurrentLibraryItem')
      .mockResolvedValue();

    noteRecognitionStore.setFeedbackEnabled(true);
    await nextTick();
    expect(reloadSpy).toHaveBeenCalled();

    app.unmount();
    overlayHost.remove();
    host.remove();
  });

  it('does NOT reload the tab when feedback is toggled off', async () => {
    // Symmetric guard: only the off→on transition reloads.
    // Disabling feedback (e.g. during a run the user wants to
    // abandon) must NOT yank the tab back to bar 1 — that would
    // disrupt practice. User keeps playing, comparison just stops.
    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);

    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const noteRecognitionStore = useNoteRecognitionStore();
    const item: LibraryItem = {
      id: 'item-feedback-off',
      title: 'Test',
      source: { kind: 'reference', path: '/tmp/feedback-off.gp' },
      metadata: { fileName: 'feedback-off.gp', size: 10, modifiedMs: 0 },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastKnownOk: true,
    };
    libraryStore.items = [item];
    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'item-feedback-off',
    };

    const app = createApp(PlayerPanel);
    app.use(pinia).mount(host);
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();

    // Arm feedback first so we have a true→false transition to test,
    // then spy AFTER the on-toggle to skip its expected reload call.
    noteRecognitionStore.setFeedbackEnabled(true);
    await nextTick();

    const reloadSpy = vi
      .spyOn(playerStore, 'reloadCurrentLibraryItem')
      .mockResolvedValue();

    noteRecognitionStore.setFeedbackEnabled(false);
    await nextTick();
    expect(reloadSpy).not.toHaveBeenCalled();

    app.unmount();
    overlayHost.remove();
    host.remove();
  });
});
