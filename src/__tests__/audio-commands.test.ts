// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  listOutputDevices,
  refreshOutputDevices,
  setMasterVolume,
  setOutputDevice,
} from '../services/audioCommands';

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

describe('audioCommands', () => {
  const originalTauri = (window as unknown as { __TAURI__?: unknown })
    .__TAURI__;
  const originalInternals = (
    window as unknown as { __TAURI_INTERNALS__?: unknown }
  ).__TAURI_INTERNALS__;

  beforeEach(() => {
    invokeMock.mockReset();
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  });

  afterEach(() => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = originalTauri;
    (
      window as unknown as { __TAURI_INTERNALS__?: unknown }
    ).__TAURI_INTERNALS__ = originalInternals;
  });

  it('returns default output device when not in tauri', async () => {
    await expect(listOutputDevices()).resolves.toEqual([
      { id: 'default', name: 'System Default', isDefault: true },
    ]);
    await expect(refreshOutputDevices()).resolves.toEqual([
      { id: 'default', name: 'System Default', isDefault: true },
    ]);
    await setOutputDevice('device-1');
    await setMasterVolume(75);

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes tauri commands when runtime is available', async () => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {};
    invokeMock.mockResolvedValueOnce([
      { id: 'one', name: 'Device', isDefault: true },
    ]);
    const devices = await listOutputDevices();
    expect(devices).toEqual([{ id: 'one', name: 'Device', isDefault: true }]);
    expect(invokeMock).toHaveBeenCalledWith('audio_list_output_devices');

    invokeMock.mockResolvedValueOnce([
      { id: 'two', name: 'Device 2', isDefault: false },
    ]);
    const refreshed = await refreshOutputDevices();
    expect(refreshed).toEqual([
      { id: 'two', name: 'Device 2', isDefault: false },
    ]);
    expect(invokeMock).toHaveBeenCalledWith('audio_refresh_output_devices');

    await setOutputDevice('device-2');
    expect(invokeMock).toHaveBeenCalledWith('audio_set_output_device', {
      deviceId: 'device-2',
    });

    await setMasterVolume(42);
    expect(invokeMock).toHaveBeenCalledWith('audio_set_master_volume', {
      percent0to100: 42,
    });
  });
});
