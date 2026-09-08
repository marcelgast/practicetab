// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../stores/app';

vi.mock('../services/audioCommands', () => ({
  listOutputDevices: vi
    .fn()
    .mockResolvedValue([
      { id: 'device-1', name: 'Device 1', isDefault: false },
    ]),
  refreshOutputDevices: vi
    .fn()
    .mockResolvedValue([
      { id: 'device-1', name: 'Device 1', isDefault: false },
    ]),
  setOutputDevice: vi.fn().mockResolvedValue(undefined),
  setMasterVolume: vi.fn().mockResolvedValue(undefined),
  setTabVolume: vi.fn().mockResolvedValue(undefined),
  listInputDevices: vi.fn().mockResolvedValue([]),
  refreshInputDevices: vi.fn().mockResolvedValue([]),
  setInputDevice: vi.fn().mockResolvedValue(undefined),
  setInputChannel: vi.fn().mockResolvedValue(undefined),
}));

describe('app store audio devices', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('refreshes output devices using the basic list', async () => {
    const store = useAppStore();
    await store.refreshOutputDevicesBasic();
    expect(store.outputDevices).toEqual([
      { id: 'default', name: 'System Default', isDefault: true },
      { id: 'device-1', name: 'Device 1', isDefault: false },
    ]);
  });

  it('applies stored output device when refreshing', async () => {
    const store = useAppStore();
    await store.applyAudioOutputDeviceId('device-1');
    const { setOutputDevice } = await import('../services/audioCommands');
    (setOutputDevice as ReturnType<typeof vi.fn>).mockClear();

    await store.refreshOutputDevicesBasic();

    expect(setOutputDevice).toHaveBeenCalledWith('device-1');
  });

  it('applies audio output device via command', async () => {
    const store = useAppStore();
    await store.applyAudioOutputDeviceId('device-1');
    const { setOutputDevice } = await import('../services/audioCommands');
    expect(setOutputDevice).toHaveBeenCalledWith('device-1');
  });

  it('propagates the OS default device channel count to the synthetic "System Default" entry', async () => {
    // Regression: when the OS default IS a multi-input interface
    // (e.g. a Scarlett 4i4 plugged in at app start), the synthetic
    // "System Default" row must inherit its channel count so the
    // Settings channel picker stays visible while the user is on
    // the default path. The previous implementation hardcoded
    // `channels: 0`, which made the picker effectively unusable
    // unless the user manually picked the interface by name.
    const { listInputDevices } = await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'host|Scarlett 4i4|0',
        name: 'Scarlett 4i4',
        isDefault: true,
        channels: 4,
      },
      {
        id: 'host|Built-in Mic|1',
        name: 'Built-in Mic',
        isDefault: false,
        channels: 1,
      },
    ]);
    const store = useAppStore();
    await store.refreshInputDevicesBasic();
    const synthetic = store.inputDevices.find(
      (device) => device.id === 'default',
    );
    expect(synthetic).toBeDefined();
    expect(synthetic?.channels).toBe(4);
  });

  it('does NOT wipe the persisted input device when it is missing from this enumeration', async () => {
    // Regression for Marcel's bug: leaving the interface plugged in,
    // restarting the app, and finding `audioInputDeviceId` reset to
    // `null` — the persisted choice was being mutated to null any
    // time the device wasn't in the live list. Now the persisted id
    // survives and the device gets re-resolved on the next refresh
    // (or next app launch, when cpal sees the device again).
    const { listInputDevices, setInputDevice } =
      await import('../services/audioCommands');
    // First refresh — device IS present, get into the persisted state.
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'CoreAudio|Scarlett 4i4|0',
        name: 'Scarlett 4i4',
        isDefault: false,
        channels: 4,
      },
    ]);
    const store = useAppStore();
    await store.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|0');
    await store.refreshInputDevicesBasic();
    expect(store.audioInputDeviceId).toBe('CoreAudio|Scarlett 4i4|0');

    // Second refresh simulates the device temporarily missing from
    // the enumeration (e.g. cpal hiccup or driver re-init lag). The
    // routing should fall back to default for this session, but the
    // persisted choice MUST stay so it can resolve again later.
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (setInputDevice as ReturnType<typeof vi.fn>).mockClear();
    await store.refreshInputDevicesBasic();
    expect(store.audioInputDeviceId).toBe('CoreAudio|Scarlett 4i4|0');
    expect(setInputDevice).toHaveBeenCalledWith(null);
  });

  it('rewrites the persisted input id when name-fallback finds a renumbered device', async () => {
    // CoreAudio reordered the device list between launches — same
    // physical device, new index. The resolver matches by name and
    // the store rewrites the persisted id to the live one so future
    // launches go straight through the exact-match path.
    const { listInputDevices, setInputDevice } =
      await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'CoreAudio|Scarlett 4i4|3',
        name: 'Scarlett 4i4',
        isDefault: false,
        channels: 4,
      },
    ]);
    const store = useAppStore();
    await store.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|0');
    (setInputDevice as ReturnType<typeof vi.fn>).mockClear();
    await store.refreshInputDevicesBasic();

    expect(store.audioInputDeviceId).toBe('CoreAudio|Scarlett 4i4|3');
    expect(setInputDevice).toHaveBeenCalledWith('CoreAudio|Scarlett 4i4|3');
  });

  it('does NOT wipe the persisted output device when it is missing', async () => {
    const { listOutputDevices, setOutputDevice } =
      await import('../services/audioCommands');
    (listOutputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'host|External Speakers|0', name: 'External Speakers' },
    ]);
    const store = useAppStore();
    await store.applyAudioOutputDeviceId('host|External Speakers|0');
    await store.refreshOutputDevicesBasic();
    expect(store.audioOutputDeviceId).toBe('host|External Speakers|0');

    (listOutputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (setOutputDevice as ReturnType<typeof vi.fn>).mockClear();
    await store.refreshOutputDevicesBasic();
    expect(store.audioOutputDeviceId).toBe('host|External Speakers|0');
    expect(setOutputDevice).toHaveBeenCalledWith(null);
  });

  it('clamps a stale persisted channel when applyAudioInputDeviceId switches to a fewer-channel device', async () => {
    // Regression: switching from a 4-input interface to a single-
    // input mic via Apply used to leave audioInputChannel at e.g.
    // 3. The Rust side would silently mix down (so audio worked),
    // but the stale index lived on in localStorage and re-surfaced
    // on the next sync. Now the clamp runs on direct-Apply too,
    // mirroring the refresh path.
    const { listInputDevices, setInputChannel } =
      await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'CoreAudio|Scarlett 4i4|0',
        name: 'Scarlett 4i4',
        isDefault: false,
        channels: 4,
      },
      {
        id: 'CoreAudio|Built-in Mic|1',
        name: 'Built-in Mic',
        isDefault: false,
        channels: 1,
      },
    ]);
    const store = useAppStore();
    await store.refreshInputDevicesBasic();
    await store.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|0');
    await store.applyAudioInputChannel(3);
    expect(store.audioInputChannel).toBe(3);

    (setInputChannel as ReturnType<typeof vi.fn>).mockClear();
    await store.applyAudioInputDeviceId('CoreAudio|Built-in Mic|1');

    // Stale channel 3 doesn't fit a 1-channel device — must be
    // cleared in store AND pushed to Rust as null.
    expect(store.audioInputChannel).toBe(null);
    expect(setInputChannel).toHaveBeenCalledWith(null);
  });

  it('keeps the persisted channel when the new device has enough channels', async () => {
    const { listInputDevices, setInputChannel } =
      await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'host|Mic A|0',
        name: 'Mic A',
        isDefault: false,
        channels: 4,
      },
      {
        id: 'host|Mic B|1',
        name: 'Mic B',
        isDefault: false,
        channels: 2,
      },
    ]);
    const store = useAppStore();
    await store.refreshInputDevicesBasic();
    await store.applyAudioInputDeviceId('host|Mic A|0');
    await store.applyAudioInputChannel(1);

    (setInputChannel as ReturnType<typeof vi.fn>).mockClear();
    await store.applyAudioInputDeviceId('host|Mic B|1');

    // Channel 1 (= second channel) still fits a 2-channel device,
    // so it survives. Rust shouldn't be told to clear what's still
    // valid.
    expect(store.audioInputChannel).toBe(1);
    expect(setInputChannel).not.toHaveBeenCalledWith(null);
  });

  it('leaves the persisted channel intact when the new device id is offline (no entry in live list)', async () => {
    // Mirror the no-wipe rule on the device id: if the user picked a
    // device that's no longer in the live list (e.g. they applied
    // before refreshing and the device is gone), we don't know its
    // channel count — leaving the channel alone lets it resolve again
    // when the device comes back.
    const { listInputDevices, setInputChannel } =
      await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'host|Mic A|0',
        name: 'Mic A',
        isDefault: false,
        channels: 4,
      },
    ]);
    const store = useAppStore();
    await store.refreshInputDevicesBasic();
    await store.applyAudioInputDeviceId('host|Mic A|0');
    await store.applyAudioInputChannel(3);

    (setInputChannel as ReturnType<typeof vi.fn>).mockClear();
    await store.applyAudioInputDeviceId('host|Offline Device|9');

    expect(store.audioInputChannel).toBe(3);
    expect(setInputChannel).not.toHaveBeenCalledWith(null);
  });

  it('falls back to 0 channels for "System Default" when no device is marked default', async () => {
    // Defensive path: on obscure driver setups cpal can fail to
    // surface which device is the current default. The synthetic
    // entry then has no truth to mirror, so 0 (=unknown) is correct
    // and the picker stays hidden — same behaviour as before.
    const { listInputDevices } = await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'host|Some Mic|0',
        name: 'Some Mic',
        isDefault: false,
        channels: 2,
      },
    ]);
    const store = useAppStore();
    await store.refreshInputDevicesBasic();
    const synthetic = store.inputDevices.find(
      (device) => device.id === 'default',
    );
    expect(synthetic?.channels).toBe(0);
  });
});
