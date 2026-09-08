import { invoke } from '@tauri-apps/api/core';

export type OutputDevice = {
  id: string;
  name: string;
  isDefault: boolean;
};

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export async function listOutputDevices(): Promise<OutputDevice[]> {
  if (!isTauriRuntime()) {
    return [{ id: 'default', name: 'System Default', isDefault: true }];
  }
  return invoke<OutputDevice[]>('audio_list_output_devices');
}

export async function refreshOutputDevices(): Promise<OutputDevice[]> {
  if (!isTauriRuntime()) {
    return [{ id: 'default', name: 'System Default', isDefault: true }];
  }
  return invoke<OutputDevice[]>('audio_refresh_output_devices');
}

export async function setOutputDevice(deviceId: string | null): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_set_output_device', { deviceId });
}

export async function setMasterVolume(percent0to100: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_set_master_volume', { percent0to100 });
}

export async function setTabVolume(percent0to100: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_set_tab_volume', { percent0to100 });
}

export type InputDevice = {
  id: string;
  name: string;
  isDefault: boolean;
  /**
   * Number of channels the device exposes in its default config.
   * Used by the Settings page to decide whether to show the channel
   * picker (only when > 1). `0` means "unknown" — the backend
   * couldn't read the default config and the UI should hide the
   * picker so the user isn't presented with a broken dropdown.
   */
  channels: number;
};

export type InputStatus = {
  running: boolean;
  sampleRate: number;
  channels: number;
  /**
   * Audio callback buffer size in frames per callback. `0` means the
   * Rust side fell back to `BufferSize::Default` because the driver
   * didn't expose a supported range — the UI should show "device
   * default" rather than a literal 0.
   */
  bufferFrames: number;
};

export async function listInputDevices(): Promise<InputDevice[]> {
  if (!isTauriRuntime()) {
    return [
      { id: 'default', name: 'System Default', isDefault: true, channels: 0 },
    ];
  }
  return invoke<InputDevice[]>('audio_list_input_devices');
}

export async function refreshInputDevices(): Promise<InputDevice[]> {
  if (!isTauriRuntime()) {
    return [
      { id: 'default', name: 'System Default', isDefault: true, channels: 0 },
    ];
  }
  return invoke<InputDevice[]>('audio_refresh_input_devices');
}

export async function setInputDevice(deviceId: string | null): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_set_input_device', { deviceId });
}

export async function getInputChannel(): Promise<number | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const value = await invoke<number | null>('audio_get_input_channel');
  return value ?? null;
}

/**
 * Pick a specific input channel (0-indexed) for the pitch pipeline.
 * Pass `null` to fall back to the all-channels-to-mono mixdown
 * (default). The backend clamps out-of-range values to the mixdown
 * path, so callers don't need to validate against the device's
 * current channel count.
 */
export async function setInputChannel(channel: number | null): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_set_input_channel', { channel });
}

export async function startAudioInput(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_start_input');
}

export async function stopAudioInput(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_stop_input');
}

export async function getAudioInputStatus(): Promise<InputStatus> {
  if (!isTauriRuntime()) {
    return { running: false, sampleRate: 0, channels: 0, bufferFrames: 0 };
  }
  return invoke<InputStatus>('audio_get_input_status');
}

/**
 * OS-level microphone permission state.
 *
 * - `not_determined` — user hasn't been asked yet (only happens on
 *   macOS for installs where TCC has no prior decision). Calling
 *   `requestMicPermission()` will trigger the system prompt.
 * - `authorized` — granted, audio input is usable. Default value on
 *   Windows/Linux because there's no per-app prompt model we'd
 *   integrate with.
 * - `denied` — user said no, OR System Settings → Privacy & Security
 *   has the app's mic toggle off. The OS will NOT re-show the prompt
 *   from `requestMicPermission()`; the user must flip the toggle in
 *   System Settings manually. UI should show a deeplink-to-settings
 *   button.
 * - `restricted` — parental controls / MDM lockout. Practically the
 *   same as `denied` from the user's perspective.
 */
export type MicPermissionStatus =
  | 'not_determined'
  | 'authorized'
  | 'denied'
  | 'restricted';

export async function getMicPermissionStatus(): Promise<MicPermissionStatus> {
  if (!isTauriRuntime()) {
    return 'authorized';
  }
  return invoke<MicPermissionStatus>('audio_input_permission_status');
}

/**
 * Trigger the OS permission prompt and resolve once the user
 * decides. Returns `true` when access ends up granted (whether by
 * accepting the prompt or because it was already granted), `false`
 * when denied/restricted. On Windows + Linux this resolves to `true`
 * immediately. The prompt only appears on macOS when the current
 * status is `not_determined`; once decided, the verdict is sticky
 * and the user has to change it in System Settings.
 */
export async function requestMicPermission(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return true;
  }
  return invoke<boolean>('audio_input_request_permission');
}

/**
 * Open the OS-level microphone privacy settings pane.
 *
 * Calls a native Tauri command that shells out to `open` (macOS) or
 * `cmd /C start` (Windows) directly — `tauri-plugin-opener` rejects
 * the custom `x-apple.systempreferences:` / `ms-settings:` URI
 * schemes its allow-list ships with, so the previous `openUrl`
 * approach was a silent no-op. On Linux this resolves without
 * action (no canonical privacy pane across distros, banner is
 * hidden anyway).
 */
export async function openMicrophoneSettings(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_input_open_system_settings');
}
