import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type PitchResult = {
  frequency: number;
  clarity: number;
  rms: number;
  midiNote: number;
  noteName: string;
  centsOffset: number;
  timestampMs: number;
  onsetDetected: boolean;
};

export type PitchConfig = {
  windowSize: number;
  hopSize: number;
  clarityThreshold: number;
  rmsThreshold: number;
};

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export async function startPitchDetection(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_start_pitch_detection');
}

export async function stopPitchDetection(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_stop_pitch_detection');
}

export async function setPitchConfig(config: PitchConfig): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_set_pitch_config', { config });
}

export async function isPitchListening(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  return invoke<boolean>('audio_is_pitch_listening');
}

/**
 * Subscribe to the `"pitch-detected"` Tauri event. Returns an unlisten
 * function the caller MUST invoke on teardown to avoid leaking listeners.
 *
 * Outside of the Tauri runtime (unit tests, Vite dev) this is a no-op
 * that returns an unlisten stub so callers don't need to branch.
 */
export async function subscribePitch(
  handler: (result: PitchResult) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {};
  }
  return listen<PitchResult>('pitch-detected', (event) =>
    handler(event.payload),
  );
}
