// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useMetronomeStore } from '../stores/metronome';
import { usePlayerStore } from '../stores/player';

vi.mock('../services/alphatabPlayer', () => ({
  alphatabPlayer: {
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

import PlayerPanel from '../components/player/PlayerPanel.vue';

function mountOverlayHost(): HTMLDivElement {
  const overlayHost = document.createElement('div');
  overlayHost.className = 'app-overlays';
  document.body.appendChild(overlayHost);
  return overlayHost;
}

describe('player panel subdivisions select', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
    })) as unknown as typeof fetch;
    setActivePinia(createPinia());
  });

  it('updates metronome subdivisions from the selector', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const metronomeStore = useMetronomeStore();
    const playerStore = usePlayerStore();
    playerStore.toggleMetronome();

    const overlayHost = mountOverlayHost();
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(PlayerPanel).use(pinia).mount(host);
    await nextTick();

    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-testid="subdivision-select"]',
    );
    expect(trigger).not.toBeNull();

    metronomeStore.setSubdivisions(true, 4);
    await nextTick();
    expect(metronomeStore.subdivisionsEnabled).toBe(true);
    expect(metronomeStore.subdivisionsValue).toBe(4);

    metronomeStore.setSubdivisions(false);
    await nextTick();
    expect(metronomeStore.subdivisionsEnabled).toBe(false);

    overlayHost.remove();
    host.remove();
  });
});
