// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  createAlphaTabPlayer,
  base64ToUint8Array,
  getAlphaTabFontDirectory,
  getAlphaTabSoundFontUrl,
  resolveProgramForTrack,
  ALPHATAB_COLORS,
  __test__,
} from '../services/alphatabPlayer';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

function encodeBase64(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  return Buffer.from(value, 'utf-8').toString('base64');
}

function decodeBytes(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(bytes).toString('utf-8');
}

describe('createAlphaTabPlayer', () => {
  it('initializes and loads base64 bytes', () => {
    const container = document.createElement('div');
    const load = vi.fn().mockReturnValue(true);
    const play = vi.fn().mockReturnValue(true);
    const pause = vi.fn();
    const stop = vi.fn();
    const destroy = vi.fn();
    const api = { load, play, pause, stop, destroy };
    const factory = vi.fn().mockReturnValue(api);

    const player = createAlphaTabPlayer(
      container,
      { onReady: vi.fn() },
      factory,
    );
    player.loadBase64(encodeBase64('abc'));

    expect(factory).toHaveBeenCalledWith(
      container,
      expect.objectContaining({
        core: expect.objectContaining({
          fontDirectory: expect.stringMatching(/\/alphatab\/$/),
        }),
        player: expect.objectContaining({
          playerMode: 4,
        }),
      }),
    );
    const arg = load.mock.calls[0]?.[0] as Uint8Array;
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(decodeBytes(arg)).toBe('abc');
  });

  it('sets playback speed from tempo percent and disposes', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      playbackSpeed: 1,
      tickPosition: 120,
    };
    const factory = vi.fn().mockReturnValue(api);

    const player = createAlphaTabPlayer(container, {}, factory);
    player.setTempoPercent(200);
    expect(api.playbackSpeed).toBe(2);
    player.seekToStart({ soft: true });
    expect(api.tickPosition).toBe(0);
    player.dispose();
    expect(api.destroy).toHaveBeenCalled();
  });

  it('keeps playback speed unchanged in Tauri runtime', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      playbackSpeed: 1,
    };
    const factory = vi.fn().mockReturnValue(api);
    const originalTauri = (window as unknown as { __TAURI__?: unknown })
      .__TAURI__;
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {};
    const player = createAlphaTabPlayer(container, {}, factory);
    player.setTempoPercent(200);
    expect(api.playbackSpeed).toBe(1);
    player.dispose();
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = originalTauri;
  });

  it('allows setBpm override above 200 percent ratio', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      playbackSpeed: 1,
    };
    const factory = vi.fn().mockReturnValue(api);

    const player = createAlphaTabPlayer(container, {}, factory);
    player.setBpm(120, 25);
    expect(api.playbackSpeed).toBeCloseTo(4.8, 3);
    player.dispose();
  });

  it('resolves beat start tick from tick cache', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        getBeatStart: () => 960,
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBeatStartTick({})).toBe(960);
  });

  it('does not double-shift beat cache ticks when cache is already shifted', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        getBeatStart: () => 0,
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory) as unknown as {
      __setTestMidiTickShift: (shift: number) => void;
      getBeatStartTick: (beat: unknown) => number | null;
    };
    player.__setTestMidiTickShift(960);
    expect(player.getBeatStartTick({ absolutePlaybackStart: 960 })).toBe(0);
  });

  it('resolves beat start tick from beat playback start', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBeatStartTick({ playbackStart: 480 })).toBe(480);
  });

  it('resolves beat start tick from beat start value', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBeatStartTick({ start: 720 })).toBe(720);
  });

  it('resolves bar start tick from tick cache', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        getMasterBarStart: () => 1920,
      },
      score: {
        masterBars: [{}, {}],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBarStartTick(1)).toBe(1920);
  });

  it('resolves bar range ticks from tick cache', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        getMasterBar: () => ({ start: 480, end: 960 }),
      },
      score: {
        masterBars: [{}, {}],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBarRangeTicks(0)).toEqual({ start: 480, end: 960 });
  });

  it('snaps playback range end to the next bar beat boundary', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        getBeatStart: (beat: { start?: number }) => beat.start ?? 0,
        findBeat: () => ({ beatLookup: { duration: 120 } }),
        getMasterBar: () => ({ start: 0, end: 1920 }),
      },
      score: {
        masterBars: [{ timeSignatureNumerator: 4 }],
        tracks: [{ index: 0 }],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    const applied = player.setPlaybackRangeFromBeats(
      { start: 0 },
      { start: 720 },
    );

    expect(applied).toBe(true);
    expect(player.getPlaybackRangeTicks()).toEqual({ start: 0, end: 960 });
  });

  it('keeps loop range aligned when tick cache values are already shifted', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        getBeatStart: (beat: { id?: string }) => {
          if (beat.id === 'start') return 0;
          if (beat.id === 'end') return 480;
          return 0;
        },
        getMasterBar: () => ({ start: 0, end: 1920 }),
      },
      score: {
        masterBars: [{ timeSignatureNumerator: 4 }],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory) as unknown as {
      __setTestMidiTickShift: (shift: number) => void;
      setPlaybackRangeFromBeats: (
        startBeat: unknown,
        endBeat: unknown,
      ) => boolean;
      getPlaybackRangeTicks: () => { start: number; end: number } | null;
    };

    player.__setTestMidiTickShift(960);
    const applied = player.setPlaybackRangeFromBeats(
      { id: 'start', absolutePlaybackStart: 960 },
      { id: 'end', absolutePlaybackStart: 1440 },
    );

    expect(applied).toBe(true);
    expect(player.getPlaybackRangeTicks()).toEqual({ start: 0, end: 960 });
  });

  it('returns bar count from score', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      score: {
        masterBars: [{}, {}, {}],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBarCount()).toBe(3);
  });

  it('returns bar time signature from master bar data', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      score: {
        masterBars: [
          { timeSignatureNumerator: 3, timeSignatureDenominator: 8 },
        ],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBarTimeSignature(0)).toEqual({ top: 3, bottom: 8 });
  });

  it('returns beat duration ticks at the given tick', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        findBeat: () => ({ beatLookup: { duration: 240 } }),
      },
      score: {
        tracks: [{ index: 0 }],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    expect(player.getBeatDurationTicksAtTick(120)).toBe(240);
  });

  it('reads current tick position from playhead clock', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickPosition: 1234,
      player: {
        tickPosition: 4321,
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory) as unknown as {
      __setTestPlayheadMs: (ms: number) => void;
      getCurrentTickPosition: () => number | null;
    };
    player.__setTestPlayheadMs(500);
    expect(player.getCurrentTickPosition()).toBe(480);
  });

  it('uses current beat time signature while playing', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: {
        currentBeat: {
          voice: {
            bar: {
              masterBar: {
                timeSignatureNumerator: 7,
                timeSignatureDenominator: 8,
              },
            },
          },
        },
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    player.__setTestTransportState?.('playing');
    expect(player.getTimeSignatureAtTick(9999)).toEqual({ top: 7, bottom: 8 });
  });

  it('updates visual position on seek without current beat', async () => {
    const container = document.createElement('div');
    const updatePosition = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: {
        tickPosition: 0,
        output: { updatePosition },
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    await player.seekToMs(1000);
    expect(api.player.tickPosition).toBe(0);
    expect(updatePosition).toHaveBeenCalledWith(1000);
  });

  it('does not set player tick position when playing without a current beat', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: {
        tickPosition: 123,
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    player.__setTestTransportState?.('playing');
    player.setCursorTick(999);
    expect(api.player.tickPosition).toBe(123);
  });

  it('sets volume and applies track and notation updates', () => {
    const container = document.createElement('div');
    const cursor = document.createElement('div');
    cursor.className = 'at-cursor-beat';
    cursor.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        height: 50,
        width: 10,
        right: 20,
        bottom: 70,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;
    container.appendChild(cursor);
    const renderScore = vi.fn();
    const renderTracks = vi.fn();
    const updateSettings = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      renderScore,
      renderTracks,
      updateSettings,
      masterVolume: 1,
      score: {
        tracks: [
          { playbackInfo: { program: 0 } },
          { playbackInfo: { program: 0 } },
        ],
      },
      tracks: [
        { index: 0, staves: [{ showStandardNotation: true }] },
        { index: 1, staves: [{ showStandardNotation: true }] },
      ],
      settings: {
        notation: {
          rhythmMode: 3,
        },
      },
      player: { masterVolume: 1 },
    };
    let emitPosition: (() => void) | null = null;
    const apiWithEvents = {
      ...api,
      player: {
        ...api.player,
        positionChanged: {
          on(handler: () => void) {
            emitPosition = handler;
          },
        },
      },
    };
    const factoryWithEvents = vi.fn().mockReturnValue(apiWithEvents);
    const onCursorRectChanged = vi.fn();

    const player = createAlphaTabPlayer(
      container,
      { onCursorRectChanged },
      factoryWithEvents,
    );
    player.setVolume(0.4);
    player.setVisibleTracks([0]);
    player.setActiveTrack(1);
    player.setShowStandardNotation(false);
    player.setTabRhythm(false);
    player.refreshLayout();
    player.getCursorRect();
    player.getCurrentCursorRect();
    player.hitTestToCursorRect(10, 20);
    player.refreshBeatCache();
    player.snapToNearestBeat(10, 20);
    emitPosition?.();

    expect(apiWithEvents.masterVolume).toBeCloseTo(0.4);
    expect(apiWithEvents.player?.masterVolume).toBeCloseTo(0.4);
    expect(renderTracks).toHaveBeenCalledWith([api.tracks[0]]);
    expect(renderTracks).toHaveBeenCalledWith([api.tracks[1]]);
    expect(api.tracks[0].staves[0].showStandardNotation).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith(api.settings);
    expect(onCursorRectChanged).toHaveBeenCalled();
  });

  it('falls back to renderScore when renderTracks throws', () => {
    const container = document.createElement('div');
    const renderTracks = vi.fn(() => {
      throw new Error('group.staves');
    });
    const renderScore = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      renderTracks,
      renderScore,
      score: {
        tracks: [{ playbackInfo: { program: 0 } }],
      },
      tracks: [{ index: 0, staves: [{ showStandardNotation: true }] }],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    player.setActiveTrack(0);
    player.setShowStandardNotation(false);

    expect(renderTracks).toHaveBeenCalled();
    expect(renderScore).toHaveBeenCalledWith(api.score, [0]);
  });

  it('renders percussion-only selected tracks via renderTracks', () => {
    const container = document.createElement('div');
    const renderTracks = vi.fn();
    const renderScore = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      renderTracks,
      renderScore,
      score: {
        tracks: [{ playbackInfo: { program: 0 }, isPercussion: true }],
      },
      tracks: [
        {
          index: 0,
          isPercussion: true,
          staves: [{ showStandardNotation: true }],
        },
      ],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    player.setActiveTrack(0);

    expect(renderTracks).toHaveBeenCalledWith(api.tracks);
    expect(renderScore).not.toHaveBeenCalled();
  });

  it('falls back to rendering all tracks when renderScore with selected tracks throws', () => {
    const container = document.createElement('div');
    const renderScore = vi.fn((...args: unknown[]) => {
      if (args.length > 1) {
        throw new Error('group.staves');
      }
    });
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      renderScore,
      score: {
        tracks: [{ playbackInfo: { program: 0 } }],
      },
      tracks: [{ index: 0, staves: [{ showStandardNotation: true }] }],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(() => player.setActiveTrack(0)).not.toThrow();
    expect(renderScore).toHaveBeenNthCalledWith(1, api.score, [0]);
    expect(renderScore).toHaveBeenNthCalledWith(2, api.score);
  });

  it('does not throw if renderScore fails for all render paths', () => {
    const container = document.createElement('div');
    const renderScore = vi.fn(() => {
      throw new Error('group.staves');
    });
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      renderScore,
      score: {
        tracks: [{ playbackInfo: { program: 0 } }],
      },
      tracks: [{ index: 0, staves: [{ showStandardNotation: true }] }],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(() => player.setActiveTrack(0)).not.toThrow();
    expect(() => player.refreshLayout()).not.toThrow();
    expect(renderScore).toHaveBeenCalled();
  });

  it('does not throw when refreshLayout renderScore fails', () => {
    const container = document.createElement('div');
    const renderScore = vi.fn(() => {
      throw new Error('group.staves');
    });
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      renderScore,
      score: {
        tracks: [{ playbackInfo: { program: 0 } }],
      },
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(() => player.refreshLayout()).not.toThrow();
  });

  it('handles scoreLoaded track metadata getters that throw', () => {
    const container = document.createElement('div');
    let emitScoreLoaded: ((score: unknown) => void) | null = null;
    const badTrack = {
      get index() {
        throw new Error('group.staves');
      },
      get name() {
        throw new Error('group.staves');
      },
    };
    const onTracksChanged = vi.fn();
    const onReady = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      scoreLoaded: {
        on(handler: (score: unknown) => void) {
          emitScoreLoaded = handler;
        },
      },
      tracks: [badTrack],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    createAlphaTabPlayer(container, { onReady, onTracksChanged }, factory);

    expect(() =>
      emitScoreLoaded?.({
        tracks: [badTrack],
      }),
    ).not.toThrow();
    expect(onReady).toHaveBeenCalled();
    expect(onTracksChanged).toHaveBeenCalled();
  });

  it('suppresses known group.staves errors for percussion-only scores', () => {
    const container = document.createElement('div');
    let emitScoreLoaded: ((score: unknown) => void) | null = null;
    let emitError: ((error: Error) => void) | null = null;
    const onError = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      scoreLoaded: {
        on(handler: (score: unknown) => void) {
          emitScoreLoaded = handler;
        },
      },
      error: {
        on(handler: (error: Error) => void) {
          emitError = handler;
        },
      },
      tracks: [
        {
          index: 0,
          isPercussion: true,
          playbackInfo: { primaryChannel: 9 },
          staves: [],
        },
      ],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    createAlphaTabPlayer(container, { onError, onReady: vi.fn() }, factory);

    emitScoreLoaded?.({ tracks: api.tracks });
    onError.mockClear();
    emitError?.(
      new Error("undefined is not an object (evaluating 'group.staves')"),
    );

    expect(onError).not.toHaveBeenCalled();
  });

  it('defers track activation while a new score is loading', () => {
    const container = document.createElement('div');
    let emitScoreLoaded: ((score: unknown) => void) | null = null;
    const badOldTrack = {
      get staves() {
        throw new Error('group.staves');
      },
      index: 3,
    };
    const newTrack = { index: 0, staves: [{ showStandardNotation: true }] };
    const renderScore = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      scoreLoaded: {
        on(handler: (score: unknown) => void) {
          emitScoreLoaded = handler;
        },
      },
      renderScore,
      tracks: [badOldTrack],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    player.loadBytes(new Uint8Array([1, 2, 3]));
    expect(() => player.setActiveTrack(0)).not.toThrow();
    expect(renderScore).not.toHaveBeenCalled();

    expect(() => emitScoreLoaded?.({ tracks: [newTrack] })).not.toThrow();
  });

  it('does not crash when track staves getter throws', () => {
    const container = document.createElement('div');
    const badTrack = {
      index: 0,
      get staves() {
        throw new Error('group.staves');
      },
    };
    const renderScore = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      renderScore,
      score: { tracks: [badTrack] },
      tracks: [badTrack],
      settings: { notation: { rhythmMode: 3 } },
      updateSettings: vi.fn(),
      player: { masterVolume: 1 },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(() => player.setShowStandardNotation(false)).not.toThrow();
    expect(() => player.getFirstNoteTick()).not.toThrow();
    expect(() => player.getFirstTrackWithNotesIndex()).not.toThrow();
    expect(renderScore).toHaveBeenCalled();
  });

  it('toggles metronome and count-in volumes', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: {
        metronomeVolume: 0,
        countInVolume: 0,
      },
      updateSettings: vi.fn(),
      settings: {
        player: {
          metronomeVolume: 0,
          countInVolume: 0,
        },
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    player.setMetronomeEnabled(true);
    player.setCountInEnabled(true);
    player.setMetronomeVolume(0.4);
    player.setCountInVolume(0.5);
    expect(api.player.metronomeVolume).toBeGreaterThan(0);
    expect(api.player.countInVolume).toBeGreaterThan(0);
    expect(api.player.metronomeVolume).toBe(0.4);
    expect(api.player.countInVolume).toBe(0.5);

    player.setMetronomeEnabled(false);
    player.setCountInEnabled(false);
    expect(api.player.metronomeVolume).toBe(0);
    expect(api.player.countInVolume).toBe(0);
  });

  it('forwards metronome midi events even when isMetronome flag is missing', () => {
    const container = document.createElement('div');
    let midiHandler:
      | ((payload: {
          events?: Array<{
            tick?: number;
            metronomeNumerator?: number;
            metronomeDurationInMilliseconds?: number;
          }>;
        }) => void)
      | null = null;
    const onMetronomeMidiEvent = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      midiEventsPlayed: {
        on: vi.fn(
          (
            handler: (payload: {
              events?: Array<{
                tick?: number;
                metronomeNumerator?: number;
                metronomeDurationInMilliseconds?: number;
              }>;
            }) => void,
          ) => {
            midiHandler = handler;
          },
        ),
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    createAlphaTabPlayer(container, { onMetronomeMidiEvent }, factory);

    midiHandler?.({
      events: [
        {
          tick: 1440,
          metronomeNumerator: 2,
          metronomeDurationInMilliseconds: 250,
        },
      ],
    });

    expect(onMetronomeMidiEvent).toHaveBeenCalledWith({
      tick: 1440,
      beatIndex: 2,
      beatDurationMs: 250,
    });
  });

  it('forwards metronome midi events when payload is a direct single event', () => {
    const container = document.createElement('div');
    let midiHandler: ((payload: unknown) => void) | null = null;
    const onMetronomeMidiEvent = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      midiEventsPlayed: {
        on: vi.fn((handler: (payload: unknown) => void) => {
          midiHandler = handler;
        }),
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    createAlphaTabPlayer(container, { onMetronomeMidiEvent }, factory);

    midiHandler?.({
      tick: 960,
      metronomeNumerator: 1,
      metronomeDurationInMilliseconds: 300,
    });

    expect(onMetronomeMidiEvent).toHaveBeenCalledWith({
      tick: 960,
      beatIndex: 1,
      beatDurationMs: 300,
    });
  });

  it('forwards metronome midi events when payload.events is a forEach-style collection', () => {
    const container = document.createElement('div');
    let midiHandler: ((payload: unknown) => void) | null = null;
    const onMetronomeMidiEvent = vi.fn();
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      midiEventsPlayed: {
        on: vi.fn((handler: (payload: unknown) => void) => {
          midiHandler = handler;
        }),
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    createAlphaTabPlayer(container, { onMetronomeMidiEvent }, factory);

    const eventsLikeCollection = {
      forEach: (cb: (entry: unknown) => void) => {
        cb({
          tick: 1920,
          metronomeNumerator: 3,
          metronomeDurationInMilliseconds: 180,
        });
      },
    };
    midiHandler?.({ events: eventsLikeCollection });

    expect(onMetronomeMidiEvent).toHaveBeenCalledWith({
      tick: 1920,
      beatIndex: 3,
      beatDurationMs: 180,
    });
  });

  it('ignores missing tracks when finding the first note tick', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      score: {
        tracks: [
          undefined,
          {
            staves: [
              {
                bars: [
                  {
                    voices: [
                      {
                        beats: [
                          {
                            start: 10,
                            notes: [{ isRest: false }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(() => player.getFirstNoteTick()).not.toThrow();
    expect(player.getFirstNoteTick()).toBe(10);
  });

  it('waits for the next cursor rect update', async () => {
    const container = document.createElement('div');
    const cursor = document.createElement('div');
    cursor.className = 'at-cursor-beat';
    cursor.getBoundingClientRect = () =>
      ({
        left: 12,
        top: 24,
        height: 50,
        width: 10,
        right: 22,
        bottom: 74,
        x: 12,
        y: 24,
        toJSON: () => ({}),
      }) as DOMRect;
    container.appendChild(cursor);
    let emitPosition: (() => void) | null = null;
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: {
        positionChanged: {
          on(handler: () => void) {
            emitPosition = handler;
          },
        },
      },
    };
    const factory = vi.fn().mockReturnValue(api);

    const player = createAlphaTabPlayer(container, {}, factory);
    const pending = player.waitForNextCursorRect({ timeoutMs: 50 });
    emitPosition?.();
    await expect(pending).resolves.toEqual({ left: 12, top: 24, height: 50 });
  });

  it('requires a changed cursor rect when requested', async () => {
    const container = document.createElement('div');
    const cursor = document.createElement('div');
    cursor.className = 'at-cursor-beat';
    cursor.getBoundingClientRect = () =>
      ({
        left: 12,
        top: 24,
        height: 50,
        width: 10,
        right: 22,
        bottom: 74,
        x: 12,
        y: 24,
        toJSON: () => ({}),
      }) as DOMRect;
    container.appendChild(cursor);
    let emitPosition: (() => void) | null = null;
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: {
        positionChanged: {
          on(handler: () => void) {
            emitPosition = handler;
          },
        },
      },
    };
    const factory = vi.fn().mockReturnValue(api);

    const player = createAlphaTabPlayer(container, {}, factory);
    emitPosition?.();
    cursor.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 24,
        height: 50,
        width: 10,
        right: 50,
        bottom: 74,
        x: 40,
        y: 24,
        toJSON: () => ({}),
      }) as DOMRect;

    const pending = player.waitForNextCursorRect({
      timeoutMs: 50,
      requireDifferentFromLast: true,
    });
    emitPosition?.();
    await expect(pending).resolves.toEqual({ left: 40, top: 24, height: 50 });
  });

  it('decodes base64 into bytes', () => {
    const bytes = base64ToUint8Array(encodeBase64('tab'));
    expect(decodeBytes(bytes)).toBe('tab');
  });

  it('returns the default font directory', () => {
    expect(getAlphaTabFontDirectory()).toMatch(/\/alphatab\/$/);
  });

  it('returns the soundfont url', () => {
    expect(getAlphaTabSoundFontUrl()).toMatch(/\/alphatab\/sonivox\.sf2$/);
  });

  it('uses playback info programs when available', () => {
    const programs = new Map<number, number>([
      [2, 24],
      [3, 12],
    ]);
    expect(resolveProgramForTrack(2, 25, programs)).toBe(24);
    expect(resolveProgramForTrack(3, 99, programs)).toBe(12);
    expect(resolveProgramForTrack(4, 30, programs)).toBe(30);
  });

  it('exposes readable glyph colors for dark theme', () => {
    expect(ALPHATAB_COLORS.mainGlyph).toBe('#e6e6ea');
  });

  it('ignores tickShift when notation starts at tick 0 (audio track offset)', () => {
    expect(__test__.resolveEffectiveMidiTickShift(960, 0, 480, false)).toBe(0);
  });

  it('ignores tickShift when it only trims leading notation rests', () => {
    expect(__test__.resolveEffectiveMidiTickShift(960, 962, 480, false)).toBe(
      0,
    );
  });

  it('ignores tickShift even when unrelated to notation start offset', () => {
    expect(__test__.resolveEffectiveMidiTickShift(960, 1920, 480, false)).toBe(
      0,
    );
  });

  it('forces tickShift off when non-playable tracks exist', () => {
    expect(__test__.resolveEffectiveMidiTickShift(960, 1920, 480, true)).toBe(
      0,
    );
  });

  it('detects playable notation tracks', () => {
    expect(
      __test__.trackHasPlayableNotation({
        staves: [
          {
            bars: [
              {
                voices: [
                  {
                    beats: [
                      { isRest: true },
                      { isRest: false, notes: [{ isRest: false }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      __test__.trackHasPlayableNotation({
        staves: [
          {
            bars: [
              {
                voices: [
                  {
                    beats: [{ isRest: true }, { isRest: true }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it('resolves time signatures from master bars and current beat', () => {
    const container = document.createElement('div');
    const masterBars = [
      {
        start: 0,
        end: 960,
        timeSignatureNumerator: 3,
        timeSignatureDenominator: 8,
      },
      { start: 960, end: 1920 },
      { start: 1920, end: 2880 },
    ];
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickCache: {
        getMasterBar: (bar: { start: number; end: number }) => ({
          start: bar.start,
          end: bar.end,
        }),
      },
      score: {
        masterBars,
      },
      player: {
        _currentBeat: {
          voice: {
            bar: {
              masterBar: {
                timeSignatureNumerator: 5,
                timeSignatureDenominator: 4,
              },
            },
          },
        },
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(player.getTimeSignatureAtTick(100)).toEqual({ top: 3, bottom: 8 });

    (
      player as unknown as {
        __setTestTransportState?: (
          state: 'stopped' | 'playing' | 'paused' | 'ended',
        ) => void;
      }
    ).__setTestTransportState?.('playing');
    expect(player.getTimeSignatureAtTick(100)).toEqual({ top: 5, bottom: 4 });

    expect(player.getBarStartTickAtTick(1000)).toBe(960);
    expect(player.getBarStartTickAtTick(1920)).toBe(1920);
  });

  it('uses master bar start values when tick cache is missing', () => {
    const container = document.createElement('div');
    const masterBars = [
      {
        start: 0,
        timeSignatureNumerator: 10,
        timeSignatureDenominator: 8,
      },
      {
        start: 4800,
        timeSignatureNumerator: 4,
        timeSignatureDenominator: 4,
      },
    ];
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      score: {
        masterBars,
      },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(player.getTimeSignatureAtTick(100)).toEqual({ top: 10, bottom: 8 });
    expect(player.getTimeSignatureAtTick(5000)).toEqual({ top: 4, bottom: 4 });
    expect(player.getBarStartTickAtTick(5000)).toBe(4800);
  });

  it('uses master bar start plus playback start for current beat timing', () => {
    const container = document.createElement('div');
    const beat = {
      playbackStart: 960,
      voice: {
        bar: {
          masterBar: {
            start: 4800,
            timeSignatureNumerator: 4,
            timeSignatureDenominator: 4,
          },
        },
      },
    };
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      score: { masterBars: [] },
      player: { _currentBeat: beat },
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);
    (
      player as unknown as {
        __setTestTransportState?: (
          state: 'stopped' | 'playing' | 'paused' | 'ended',
        ) => void;
      }
    ).__setTestTransportState?.('playing');
    const info = player.getCurrentBeatInfo();
    expect(info?.beatStartTick).toBe(5760);
  });

  it('handles throwing currentBeat getter without crashing', () => {
    const container = document.createElement('div');
    const playerState = {
      _currentBeat: null as unknown,
      get currentBeat() {
        throw new TypeError(
          "null is not an object (evaluating 'this._currentBeat.start')",
        );
      },
    };
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: playerState,
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(() => player.getCurrentBeatInfo()).not.toThrow();
    expect(player.getCurrentBeatInfo()).toBeNull();
  });

  it('handles output update errors when no current beat is available', () => {
    const container = document.createElement('div');
    const updatePosition = vi.fn(() => {
      throw new Error('should-not-run');
    });
    const playerState = {
      _currentBeat: null as unknown,
      tickPosition: 0,
      output: { updatePosition },
      get currentBeat() {
        throw new TypeError(
          "null is not an object (evaluating 'this._currentBeat.start')",
        );
      },
    };
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      player: playerState,
    };
    const factory = vi.fn().mockReturnValue(api);
    const player = createAlphaTabPlayer(container, {}, factory);

    expect(() => player.seekToStart()).not.toThrow();
    expect(() => player.stop()).not.toThrow();
    expect(updatePosition).not.toHaveBeenCalled();
  });
});

describe('base64ToUint8Array', () => {
  it('uses Buffer when atob is unavailable', () => {
    const originalAtob = (globalThis as unknown as { atob?: typeof atob }).atob;
    const originalBuffer = (globalThis as unknown as { Buffer?: typeof Buffer })
      .Buffer;
    delete (globalThis as unknown as { atob?: typeof atob }).atob;
    const value = Buffer.from('hello', 'utf-8').toString('base64');
    const bytes = base64ToUint8Array(value);
    expect(new TextDecoder().decode(bytes)).toBe('hello');
    (globalThis as unknown as { atob?: typeof atob }).atob = originalAtob;
    (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer =
      originalBuffer;
  });

  it('throws when neither atob nor Buffer are available', () => {
    const originalAtob = (globalThis as unknown as { atob?: typeof atob }).atob;
    const originalBuffer = (globalThis as unknown as { Buffer?: typeof Buffer })
      .Buffer;
    delete (globalThis as unknown as { atob?: typeof atob }).atob;
    (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer = undefined;
    expect(() => base64ToUint8Array('aGVsbG8=')).toThrow(
      'Base64 decoding is not available in this environment.',
    );
    (globalThis as unknown as { atob?: typeof atob }).atob = originalAtob;
    (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer =
      originalBuffer;
  });
});
