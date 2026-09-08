// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePitchDetectionStore } from '../stores/pitchDetection';
import { useAppStore } from '../stores/app';

vi.mock('../services/audioCommands', () => ({
  listOutputDevices: vi.fn().mockResolvedValue([]),
  refreshOutputDevices: vi.fn().mockResolvedValue([]),
  setOutputDevice: vi.fn().mockResolvedValue(undefined),
  setMasterVolume: vi.fn().mockResolvedValue(undefined),
  setTabVolume: vi.fn().mockResolvedValue(undefined),
  listInputDevices: vi.fn().mockResolvedValue([]),
  refreshInputDevices: vi.fn().mockResolvedValue([]),
  setInputDevice: vi.fn().mockResolvedValue(undefined),
  setInputChannel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/pitchDetectionCommands', () => ({
  isPitchListening: vi.fn().mockResolvedValue(false),
  setPitchConfig: vi.fn().mockResolvedValue(undefined),
  startPitchDetection: vi.fn().mockResolvedValue(undefined),
  stopPitchDetection: vi.fn().mockResolvedValue(undefined),
  subscribePitch: vi.fn().mockResolvedValue(() => {
    /* unlisten no-op */
  }),
}));

/**
 * Regression for review finding #6. `pitchDetection.start()` used to
 * push the persisted device id straight to Rust without going
 * through `resolveAudioDevice`. If cpal renumbered the device's
 * index between launches AND the user armed the tuner before the
 * boot refresh resolved (fire-and-forget in `main.ts`), Rust got an
 * id that no longer matched any live device and routed audio to the
 * host default. The fix runs the persisted id through the same
 * resolver `syncInputDevice` uses, so name-fallback covers index
 * drift on this path too.
 */
describe('pitchDetection.start — device resolution', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('resolves a renumbered persisted id via name-fallback before pushing to Rust', async () => {
    const { setInputDevice } = await import('../services/audioCommands');
    const appStore = useAppStore();
    // Persisted from a previous launch when cpal had the Scarlett at
    // index 2; this session it landed at index 1.
    await appStore.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|2');
    appStore.inputDevices = [
      { id: 'default', name: 'System Default', isDefault: true, channels: 0 },
      {
        id: 'CoreAudio|Scarlett 4i4|1',
        name: 'Scarlett 4i4',
        isDefault: false,
        channels: 4,
      },
    ];

    (setInputDevice as ReturnType<typeof vi.fn>).mockClear();
    const pitchStore = usePitchDetectionStore();
    await pitchStore.start();

    // Resolved (live) id wins, NOT the stale persisted one.
    expect(setInputDevice).toHaveBeenCalledWith('CoreAudio|Scarlett 4i4|1');
  });

  it('passes null when the persisted device is genuinely missing', async () => {
    // No name match either — Rust should fall back to host default
    // for this session. The persisted id stays in localStorage so
    // the choice resurfaces when the device returns (no-wipe rule).
    const { setInputDevice } = await import('../services/audioCommands');
    const appStore = useAppStore();
    await appStore.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|2');
    appStore.inputDevices = [
      { id: 'default', name: 'System Default', isDefault: true, channels: 0 },
      {
        id: 'CoreAudio|Built-in Mic|0',
        name: 'Built-in Mic',
        isDefault: false,
        channels: 1,
      },
    ];

    (setInputDevice as ReturnType<typeof vi.fn>).mockClear();
    const pitchStore = usePitchDetectionStore();
    await pitchStore.start();

    expect(setInputDevice).toHaveBeenCalledWith(null);
    // Persisted id MUST survive — same no-wipe rule as the device sync.
    expect(appStore.audioInputDeviceId).toBe('CoreAudio|Scarlett 4i4|2');
  });

  it('passes null when the persisted id is the synthetic default sentinel', async () => {
    const { setInputDevice } = await import('../services/audioCommands');
    const appStore = useAppStore();
    await appStore.applyAudioInputDeviceId(null);

    (setInputDevice as ReturnType<typeof vi.fn>).mockClear();
    const pitchStore = usePitchDetectionStore();
    await pitchStore.start();

    expect(setInputDevice).toHaveBeenCalledWith(null);
  });

  it('passes the exact id through when it matches a live device verbatim', async () => {
    const { setInputDevice } = await import('../services/audioCommands');
    const appStore = useAppStore();
    await appStore.applyAudioInputDeviceId('host|Mic|0');
    appStore.inputDevices = [
      { id: 'host|Mic|0', name: 'Mic', isDefault: false, channels: 1 },
    ];

    (setInputDevice as ReturnType<typeof vi.fn>).mockClear();
    const pitchStore = usePitchDetectionStore();
    await pitchStore.start();

    expect(setInputDevice).toHaveBeenCalledWith('host|Mic|0');
  });

  it('forces a fresh enumeration when inputDevices is empty (PR #59 boot-race fix)', async () => {
    // Follow-up finding on PR #59. main.ts kicks off
    // refreshInputDevicesBasic fire-and-forget at boot; if the user
    // arms the tuner before that resolves, `appStore.inputDevices`
    // is `[]` and the resolver returns null even though the
    // persisted Scarlett is plugged in under a renumbered index.
    // start() now triggers a synchronous enumeration when the list
    // is empty so the resolver has live data to match against.
    const { listInputDevices, setInputDevice } =
      await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'CoreAudio|Scarlett 4i4|1',
        name: 'Scarlett 4i4',
        isDefault: false,
        channels: 4,
      },
    ]);

    const appStore = useAppStore();
    await appStore.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|2');
    // Deliberately DO NOT pre-populate inputDevices — this is exactly
    // the boot-race scenario (refresh hasn't settled yet).
    expect(appStore.inputDevices).toHaveLength(0);

    (setInputDevice as ReturnType<typeof vi.fn>).mockClear();
    const pitchStore = usePitchDetectionStore();
    await pitchStore.start();

    // refreshInputDevicesBasic runs the resolver as a side effect
    // and rewrites the persisted id to the live one — the final
    // setInputDevice call (the one start() makes after the await)
    // must point at the live id, NOT null.
    expect(setInputDevice).toHaveBeenLastCalledWith('CoreAudio|Scarlett 4i4|1');
  });
});
