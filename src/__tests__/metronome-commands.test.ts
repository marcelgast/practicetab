// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  metronomeCancelScheduled,
  metronomeBeep,
  metronomeSetConfig,
  metronomeStart,
  metronomeStop,
  metronomeTickFromAlphaTab,
  type AlphaTabMetronomeTickPayload,
  type MetronomeConfig,
} from '../services/metronomeCommands';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('metronomeCommands', () => {
  const invokeMock = vi.mocked(invoke);
  const baseConfig: MetronomeConfig = {
    bpm: 120,
    timeSigTop: 4,
    timeSigBottom: 4,
    volume: 0.5,
    beatStates: ['accent', 'normal', 'normal', 'normal'],
    subdivisionsEnabled: false,
    subdivisionsValue: 1,
    soundMode: 'blip',
    countInBars: [],
    countInEnabled: false,
    startBeatIndex: 0,
    startSubIndex: 0,
    startDelayMs: 0,
  };
  const tickPayload: AlphaTabMetronomeTickPayload = {
    beatIndex: 2,
    beatDurationMs: 250,
    subdivisions: 4,
    soundMode: 'drumKit',
    beatType: 'normal',
    volumeScalar: 0.5,
  };

  beforeEach(() => {
    delete (window as { __TAURI__?: unknown }).__TAURI__;
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    invokeMock.mockReset();
  });

  it('no-ops outside tauri runtime', async () => {
    await metronomeStart(baseConfig);
    await metronomeStop();
    await metronomeSetConfig(baseConfig);
    await metronomeBeep();
    await metronomeTickFromAlphaTab(tickPayload);
    await metronomeCancelScheduled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes tauri commands when available', async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = true;

    await metronomeStart(baseConfig);
    expect(invokeMock).toHaveBeenCalledWith('metronome_start', {
      config: baseConfig,
    });

    await metronomeStop();
    expect(invokeMock).toHaveBeenCalledWith('metronome_stop');

    await metronomeSetConfig(baseConfig);
    expect(invokeMock).toHaveBeenCalledWith('metronome_set_config', {
      config: baseConfig,
    });

    await metronomeBeep();
    expect(invokeMock).toHaveBeenCalledWith('metronome_beep');

    await metronomeTickFromAlphaTab(tickPayload);
    expect(invokeMock).toHaveBeenCalledWith('metronome_tick_from_alphatab', {
      payload: tickPayload,
    });

    await metronomeCancelScheduled();
    expect(invokeMock).toHaveBeenCalledWith('metronome_cancel_scheduled');
  });
});
