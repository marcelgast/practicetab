// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  clearLoopRange,
  getAudioPositionMs,
  pauseTab,
  playTab,
  prepareTab,
  scheduleEvents,
  seekTab,
  seekAndPlay,
  seekToTick,
  setLoopRangeMs,
  setTabTuning,
  setTempoFactor,
  setTrackState,
  stopTab,
  type AudioTabEvent,
  type TempoPointPayload,
} from '../services/audioTabCommands';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('audioTabCommands', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = true;
    invokeMock.mockClear();
  });

  it('no-ops when not running in tauri', async () => {
    delete (window as { __TAURI__?: unknown }).__TAURI__;
    await prepareTab(['track-1']);
    await scheduleEvents([], [], 480);
    await playTab();
    await pauseTab();
    await stopTab();
    await seekTab(1000);
    await seekToTick(1000);
    await seekAndPlay(1000);
    await setTempoFactor(1.1);
    await setTrackState({
      trackId: 'track-1',
      mute: false,
      solo: false,
      volume: 1,
      listen: false,
    });
    await setLoopRangeMs(0, 1000);
    await clearLoopRange();
    await setTabTuning(0);
    await expect(getAudioPositionMs()).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('schedules events with tempo metadata', async () => {
    const events: AudioTabEvent[] = [
      {
        atMs: 100,
        trackId: 'track-0',
        channel: 0,
        kind: { type: 'note_on', key: 60, velocity: 100 },
      },
    ];
    const tempoMap: TempoPointPayload[] = [
      { tick: 0, timeMs: 0, usPerQuarter: 500000 },
    ];
    await scheduleEvents(events, tempoMap, 480);
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_schedule_events', {
      events,
      tempoMap,
      midiDivision: 480,
    });
  });

  it('seeks by tick', async () => {
    await seekToTick(960);
    expect(invokeMock).toHaveBeenCalledWith('audio_seek', { tick: 960 });
  });

  it('seeks and plays by tick', async () => {
    await seekAndPlay(480);
    expect(invokeMock).toHaveBeenCalledWith('audio_seek_and_play', {
      tick: 480,
    });
  });

  it('invokes playback and control commands', async () => {
    await prepareTab(['track-1']);
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_prepare', {
      trackIds: ['track-1'],
    });

    await playTab();
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_play');

    await pauseTab();
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_pause');

    await stopTab();
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_stop');

    await seekTab(1234);
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_seek', {
      positionMs: 1234,
    });

    await setTempoFactor(0.9);
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_set_tempo_factor', {
      factor: 0.9,
    });

    await setTrackState({
      trackId: 'track-1',
      mute: true,
      solo: false,
      volume: 0.5,
      listen: true,
    });
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_set_track_state', {
      payload: {
        trackId: 'track-1',
        mute: true,
        solo: false,
        volume: 0.5,
        listen: true,
      },
    });

    await setLoopRangeMs(200, 400);
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_set_loop_range', {
      startMs: 200,
      endMs: 400,
    });

    await clearLoopRange();
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_clear_loop_range');

    invokeMock.mockResolvedValueOnce(987);
    await expect(getAudioPositionMs()).resolves.toBe(987);
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_get_position_ms');

    await setTabTuning(-1);
    expect(invokeMock).toHaveBeenCalledWith('audio_tab_set_tuning', {
      tuningSemitones: -1,
    });
  });
});
