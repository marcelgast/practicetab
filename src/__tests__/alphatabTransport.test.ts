// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAlphaTabPlayer } from '../services/alphatabPlayer';

const seekToTick = vi.fn().mockResolvedValue(undefined);
const seekAndPlay = vi.fn().mockResolvedValue(undefined);
const getAudioPositionMs = vi.fn().mockResolvedValue(0);

vi.mock('../services/audioTabCommands', () => ({
  prepareTab: vi.fn(),
  scheduleEvents: vi.fn(),
  pauseTab: vi.fn(),
  stopTab: vi.fn(),
  seekTab: vi.fn(),
  seekToTick: (...args: unknown[]) => seekToTick(...args),
  seekAndPlay: (...args: unknown[]) => seekAndPlay(...args),
  setLoopRangeMs: vi.fn(),
  clearLoopRange: vi.fn(),
  setTempoFactor: vi.fn(),
  setTrackState: vi.fn(),
  getAudioPositionMs: (...args: unknown[]) => getAudioPositionMs(...args),
}));

describe('AlphaTab transport', () => {
  const raf = globalThis.requestAnimationFrame;

  afterEach(() => {
    seekToTick.mockClear();
    seekAndPlay.mockClear();
    getAudioPositionMs.mockClear();
    globalThis.requestAnimationFrame = raf;
  });

  it('plays from the last seek tick', async () => {
    globalThis.requestAnimationFrame = () => 1;
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const player = createAlphaTabPlayer(container, {}, () => api);
    await player.seekToTick(960);
    player.play();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seekToTick).toHaveBeenCalledWith(960);
    expect(seekAndPlay).toHaveBeenCalledWith(960);
  });

  it('restarts from 0 when ended', async () => {
    globalThis.requestAnimationFrame = () => 1;
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const player = createAlphaTabPlayer(
      container,
      {},
      () => api,
    ) as unknown as {
      play: () => void;
      __setTestDurationMs: (ms: number) => void;
      __setTestPlayheadMs: (ms: number) => void;
      __setTestTransportState: (
        state: 'stopped' | 'playing' | 'paused' | 'ended',
      ) => void;
    };
    player.__setTestDurationMs(1000);
    player.__setTestPlayheadMs(1000);
    player.__setTestTransportState('ended');
    player.play();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seekAndPlay).toHaveBeenCalledWith(0);
  });

  it('delays play until audio scheduling is ready', async () => {
    globalThis.requestAnimationFrame = () => 1;
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    let resolveReady: (() => void) | null = null;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const player = createAlphaTabPlayer(
      container,
      {},
      () => api,
    ) as unknown as {
      play: () => void;
      __setTestAudioReadyPromise: (promise: Promise<void>) => void;
    };
    player.__setTestAudioReadyPromise(readyPromise);
    player.play();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seekAndPlay).not.toHaveBeenCalled();

    resolveReady?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seekAndPlay).toHaveBeenCalled();
  });

  it('resumes from current position when paused', async () => {
    globalThis.requestAnimationFrame = () => 1;
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const player = createAlphaTabPlayer(
      container,
      {},
      () => api,
    ) as unknown as {
      play: () => void;
      __setTestDurationMs: (ms: number) => void;
      __setTestPlayheadMs: (ms: number) => void;
      __setTestTransportState: (
        state: 'stopped' | 'playing' | 'paused' | 'ended',
      ) => void;
    };
    player.__setTestDurationMs(2000);
    player.__setTestPlayheadMs(500);
    player.__setTestTransportState('paused');
    player.play();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seekAndPlay).toHaveBeenCalledWith(480);
  });

  it('reports tick from the visual playhead clock', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickPosition: 0,
    };
    const player = createAlphaTabPlayer(
      container,
      {},
      () => api,
    ) as unknown as {
      __setTestPlayheadMs: (ms: number) => void;
      getCurrentTickPosition: () => number | null;
    };
    player.__setTestPlayheadMs(500);
    expect(player.getCurrentTickPosition()).toBe(480);
  });

  it('invalidates sync on tempo change so next tick fetches fresh position', async () => {
    let rafCb: (() => void) | null = null;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCb = cb as unknown as () => void;
      return 1;
    };
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    const player = createAlphaTabPlayer(
      container,
      {},
      () => api,
    ) as unknown as {
      play: () => void;
      setTempoPercent: (percent: number) => void;
      __setTestDurationMs: (ms: number) => void;
      __setTestPlayheadMs: (ms: number) => void;
      __getTestSyncInFlight: () => Promise<void> | null;
      __getTestPlayheadMs: () => number;
    };
    player.__setTestDurationMs(10000);
    player.__setTestPlayheadMs(500);
    player.play();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // After play, a sync might be in flight — set tempo to invalidate it
    player.setTempoPercent(200);

    // syncInFlight should be cleared so the next tick starts a fresh poll
    expect(player.__getTestSyncInFlight()).toBeNull();

    // Audio engine now reports position 1000 (at the new tempo)
    getAudioPositionMs.mockResolvedValueOnce(1000);
    rafCb?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Playhead must have moved to the fresh audio position (1000),
    // not stayed at the stale pre-tempo-change value (500)
    expect(player.__getTestPlayheadMs()).toBe(1000);
  });

  it('discards stale polls after full-track loop restart', async () => {
    const rafCallbacks: (() => void)[] = [];
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb as unknown as () => void);
      return 1;
    };
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };

    // First poll resolves with a mid-track position (during play start)
    getAudioPositionMs.mockResolvedValueOnce(500);

    const player = createAlphaTabPlayer(
      container,
      {},
      () => api,
    ) as unknown as {
      play: () => void;
      setLooping: (enabled: boolean) => void;
      __setTestDurationMs: (ms: number) => void;
      __setTestPlayheadMs: (ms: number) => void;
      __getTestLoopGeneration: () => number;
      __getTestPlayheadMs: () => number;
    };
    player.__setTestDurationMs(1000);
    player.setLooping(true);
    player.__setTestPlayheadMs(500);

    // Start playback
    player.play();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now make audio report end-of-track on next poll, but as a slow promise
    let resolveEndPosition: ((value: number) => void) | null = null;
    getAudioPositionMs.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveEndPosition = resolve;
        }),
    );

    // Simulate playhead reaching end (as if a previous poll returned 1000)
    player.__setTestPlayheadMs(1000);

    const genBefore = player.__getTestLoopGeneration();

    // Execute transport tick — starts poll AND detects end-of-track → loop restart
    const cb = rafCallbacks.pop();
    cb?.();

    // Loop generation incremented and playhead reset to 0
    expect(player.__getTestLoopGeneration()).toBeGreaterThan(genBefore);
    expect(player.__getTestPlayheadMs()).toBe(0);

    // Now resolve the stale poll with a near-end position (998ms)
    resolveEndPosition?.(998);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The stale 998ms result must NOT overwrite the loop restart —
    // playhead stays at 0 (or wherever a fresh post-restart poll moved it)
    expect(player.__getTestPlayheadMs()).toBeLessThan(100);
  });

  it('does not double-apply midi tick shift to visual playhead tick', () => {
    const container = document.createElement('div');
    const api = {
      load: vi.fn().mockReturnValue(true),
      play: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      tickPosition: 0,
    };
    const player = createAlphaTabPlayer(
      container,
      {},
      () => api,
    ) as unknown as {
      __setTestPlayheadMs: (ms: number) => void;
      __setTestMidiTickShift: (shift: number) => void;
      getCurrentTickPosition: () => number | null;
      getCurrentAudioTickPosition: () => number | null;
    };

    player.__setTestMidiTickShift(960);
    player.__setTestPlayheadMs(500);

    expect(player.getCurrentTickPosition()).toBe(480);
    expect(player.getCurrentAudioTickPosition()).toBe(480);
  });
});
