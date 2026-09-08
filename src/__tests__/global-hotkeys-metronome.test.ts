// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useGlobalHotkeys } from '../services/useGlobalHotkeys';
import { useMetronomeStore } from '../stores/metronome';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { useAppStore } from '../stores/app';

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => false),
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
    getCurrentTickPosition: vi.fn(() => 0),
    getCurrentBeatInfo: vi.fn(() => null),
    getTempoAtTick: vi.fn(() => 120),
    getTimeSignatureAtTick: vi.fn(() => ({ top: 4, bottom: 4 })),
    getBarStartTickAtTick: vi.fn(() => 0),
    getTickDivision: vi.fn(() => 480),
    getTransportState: vi.fn(() => 'stopped'),
    getPlaybackRangeTicks: vi.fn(() => null),
    supportsTrackMute: false,
    supportsTrackSolo: false,
    supportsTrackVolume: false,
  },
  base64ToUint8Array: vi.fn((value: string) => new Uint8Array(value.length)),
}));

vi.mock('../services/audioCommands', () => ({
  setMasterVolume: vi.fn().mockResolvedValue(undefined),
  setTabVolume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/audioTabCommands', () => ({
  setTrackState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/metronomeCommands', () => ({
  metronomeStart: vi.fn().mockResolvedValue(undefined),
  metronomeStop: vi.fn().mockResolvedValue(undefined),
  metronomeSetConfig: vi.fn().mockResolvedValue(undefined),
  metronomeBeep: vi.fn().mockResolvedValue(undefined),
  metronomeTickFromAlphaTab: vi.fn().mockResolvedValue(undefined),
  metronomeCancelScheduled: vi.fn().mockResolvedValue(undefined),
}));

const HotkeyHost = defineComponent({
  name: 'HotkeyHost',
  setup() {
    useGlobalHotkeys();
    return () => null;
  },
});

describe('global hotkeys on metronome page', () => {
  it('uses space to toggle metronome when not synced', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    window.history.pushState({}, '', '/metronome');

    const metronomeStore = useMetronomeStore();
    const playerStore = usePlayerStore();
    useUiStore();

    const toggleSpy = vi.spyOn(metronomeStore, 'toggleRunning');
    const playPauseSpy = vi.spyOn(playerStore, 'togglePlayPause');
    const stopSpy = vi.spyOn(playerStore, 'stop');

    let practiceSpaceCount = 0;
    window.addEventListener('practice-space', () => {
      practiceSpaceCount += 1;
    });

    const keydown = new KeyboardEvent('keydown', {
      code: 'Space',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keydown);

    const keyup = new KeyboardEvent('keyup', {
      code: 'Space',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keyup);

    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(playPauseSpy).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
    expect(practiceSpaceCount).toBe(0);
    expect(keyup.defaultPrevented).toBe(true);

    app.unmount();
  });

  it('uses space to control the player when synced to tab', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    window.history.pushState({}, '', '/metronome');

    const metronomeStore = useMetronomeStore();
    const playerStore = usePlayerStore();
    useUiStore();
    metronomeStore.setTabLoaded(true);
    useAppStore().setMetronomeEnabled(true);

    const toggleSpy = vi.spyOn(metronomeStore, 'toggleRunning');
    const playPauseSpy = vi.spyOn(playerStore, 'togglePlayPause');

    const keydown = new KeyboardEvent('keydown', {
      code: 'Space',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keydown);

    expect(toggleSpy).not.toHaveBeenCalled();
    expect(playPauseSpy).toHaveBeenCalledTimes(1);

    app.unmount();
  });

  it('dispatches help shortcut on F1', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    let helpCount = 0;
    window.addEventListener('open-help', () => {
      helpCount += 1;
    });

    const keydown = new KeyboardEvent('keydown', {
      code: 'F1',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keydown);

    expect(helpCount).toBe(1);
    expect(keydown.defaultPrevented).toBe(true);

    app.unmount();
  });

  it('toggles listen and stop actions', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    window.history.pushState({}, '', '/library');

    const playerStore = usePlayerStore();
    const metronomeStore = useMetronomeStore();

    const listenSpy = vi.spyOn(playerStore, 'toggleListenForActiveTrack');
    const setRunningSpy = vi.spyOn(metronomeStore, 'setRunning');

    const listenKey = new KeyboardEvent('keydown', {
      code: 'KeyL',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(listenKey);
    expect(listenSpy).toHaveBeenCalledTimes(1);

    const stopKey = new KeyboardEvent('keydown', {
      code: 'KeyS',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(stopKey);
    expect(setRunningSpy).not.toHaveBeenCalled();

    app.unmount();
  });

  it('stops metronome when stop hotkey pressed on metronome page', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    window.history.pushState({}, '', '/metronome');

    const metronomeStore = useMetronomeStore();
    const setRunningSpy = vi.spyOn(metronomeStore, 'setRunning');

    const stopKey = new KeyboardEvent('keydown', {
      code: 'KeyS',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(stopKey);
    expect(setRunningSpy).toHaveBeenCalledWith(false);

    app.unmount();
  });

  it('toggles vibrato debug via ctrl+alt+V', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    const uiStore = useUiStore();
    const toggleSpy = vi.spyOn(uiStore, 'toggleVibratoDebug');

    const keydown = new KeyboardEvent('keydown', {
      code: 'KeyV',
      ctrlKey: true,
      altKey: true,
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keydown);
    expect(toggleSpy).toHaveBeenCalledTimes(1);

    app.unmount();
  });

  it('prevents toggle when practice space event is handled', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    window.history.pushState({}, '', '/practice');

    const playerStore = usePlayerStore();
    const toggleSpy = vi.spyOn(playerStore, 'togglePlayPause');

    const onPractice = (event: Event) => {
      event.preventDefault();
    };
    window.addEventListener('practice-space', onPractice);

    const keydown = new KeyboardEvent('keydown', {
      code: 'Space',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keydown);
    expect(toggleSpy).not.toHaveBeenCalled();

    window.removeEventListener('practice-space', onPractice);
    app.unmount();
  });

  it('pauses tab playback with space on library page', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    window.history.pushState({}, '', '/library');
    const playerStore = usePlayerStore();
    playerStore.model = { ...playerStore.model, playback: 'playing' };

    const pauseSpy = vi.spyOn(playerStore, 'pause');
    const stopSpy = vi.spyOn(playerStore, 'stop');

    const keydown = new KeyboardEvent('keydown', {
      code: 'Space',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keydown);

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).not.toHaveBeenCalled();

    app.unmount();
  });

  it('stops playback with space on practice page when no exercise handles it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const app = createApp(HotkeyHost).use(pinia);
    app.mount(host);

    window.history.pushState({}, '', '/practice');
    const playerStore = usePlayerStore();
    playerStore.model = { ...playerStore.model, playback: 'playing' };

    const pauseSpy = vi.spyOn(playerStore, 'pause');
    const stopSpy = vi.spyOn(playerStore, 'stop');

    const keydown = new KeyboardEvent('keydown', {
      code: 'Space',
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(keydown);

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();

    app.unmount();
  });
});
