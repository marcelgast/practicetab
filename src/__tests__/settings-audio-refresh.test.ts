// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import SettingsPage from '../pages/Settings.vue';
import { useAppStore } from '../stores/app';

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
  getAudioInputStatus: vi.fn().mockResolvedValue({
    running: false,
    sampleRate: 0,
    channels: 0,
    bufferFrames: 0,
  }),
}));

/**
 * Regression test for PR #58 finding. The Settings page Refresh
 * button used to call `applyAudio*DeviceId(null)` whenever a
 * persisted device wasn't in the freshly enumerated list — silently
 * wiping the user's saved interface in localStorage. The fix moves
 * that responsibility entirely onto the store's resolver-aware sync;
 * Settings.vue must NOT mutate persistence on the refresh path.
 */
describe('Settings audio refresh — persisted device survives a missing enumeration', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  async function clickAudioRefresh(host: HTMLElement): Promise<void> {
    // The audio Refresh button is the first .refresh-button in the
    // page (license refresh sits inside .license-toolbar — not
    // present when the user isn't activated, which is the default
    // for these tests).
    const refresh = host.querySelector(
      '.refresh-button',
    ) as HTMLButtonElement | null;
    expect(refresh).toBeTruthy();
    refresh?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Two refresh promises + setInputDevice/setOutputDevice + status
    // poll all need to settle. nextTick + a microtask flush is enough
    // for happy-dom.
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
  }

  it('keeps the persisted output device id when the device is missing from the live list', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    await store.applyAudioOutputDeviceId('CoreAudio|Scarlett 4i4|1');
    expect(store.audioOutputDeviceId).toBe('CoreAudio|Scarlett 4i4|1');

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(SettingsPage).use(pinia).mount(host);
    await nextTick();

    await clickAudioRefresh(host);

    // The Scarlett wasn't in the (empty) enumeration — but the
    // persisted id MUST survive so it can resolve again on re-plug.
    expect(store.audioOutputDeviceId).toBe('CoreAudio|Scarlett 4i4|1');
  });

  it('keeps the persisted input device id when the device is missing from the live list', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    await store.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|0');
    expect(store.audioInputDeviceId).toBe('CoreAudio|Scarlett 4i4|0');

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(SettingsPage).use(pinia).mount(host);
    await nextTick();

    await clickAudioRefresh(host);

    expect(store.audioInputDeviceId).toBe('CoreAudio|Scarlett 4i4|0');
  });

  it('rewrites the persisted input id when refresh finds a renumbered device by name', async () => {
    // Same physical interface, new index — the Settings refresh
    // path must see the rewritten id propagate through the store's
    // sync (not its own strict-equality check).
    const { listInputDevices, refreshInputDevices } =
      await import('../services/audioCommands');
    (listInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'CoreAudio|Scarlett 4i4|0',
        name: 'Scarlett 4i4',
        isDefault: false,
        channels: 4,
      },
    ]);
    (refreshInputDevices as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'CoreAudio|Scarlett 4i4|3',
        name: 'Scarlett 4i4',
        isDefault: false,
        channels: 4,
      },
    ]);

    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    await store.applyAudioInputDeviceId('CoreAudio|Scarlett 4i4|0');

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(SettingsPage).use(pinia).mount(host);
    await nextTick();

    await clickAudioRefresh(host);

    expect(store.audioInputDeviceId).toBe('CoreAudio|Scarlett 4i4|3');
  });
});
