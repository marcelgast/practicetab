import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { UnlistenFn } from '@tauri-apps/api/event';
import {
  isPitchListening,
  setPitchConfig as setPitchConfigCmd,
  startPitchDetection as startPitchDetectionCmd,
  stopPitchDetection as stopPitchDetectionCmd,
  subscribePitch,
  type PitchConfig,
  type PitchResult,
} from '../services/pitchDetectionCommands';
import { setInputDevice } from '../services/audioCommands';
import { resolveAudioDevice } from '../domain/audioDeviceResolve';
import { useAppStore } from './app';

/**
 * Frontend state for the pitch detection engine.
 *
 * PR 3.2 ships the data pipeline only — the Tuner UI that consumes this
 * store lands in PR 3.3. The store owns the Tauri event subscription and
 * exposes `start()` / `stop()` so callers don't have to juggle listeners.
 */
export const usePitchDetectionStore = defineStore('pitchDetection', () => {
  const isListening = ref(false);
  const currentPitch = shallowRef<PitchResult | null>(null);
  const lastOnset = shallowRef<PitchResult | null>(null);

  let unlisten: UnlistenFn | null = null;

  async function ensureSubscription(): Promise<void> {
    if (unlisten) return;
    unlisten = await subscribePitch((result) => {
      currentPitch.value = result;
      if (result.onsetDetected) {
        lastOnset.value = result;
      }
    });
  }

  function teardownSubscription(): void {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  }

  async function start(): Promise<void> {
    // Subscribe before the backend starts emitting so we don't miss the
    // first onset. The Tauri `audio_start_pitch_detection` command
    // orchestrates the input stream on the Rust side (PR 3.2 review
    // finding 1), so we never end up "listening but not capturing".
    await ensureSubscription();
    // Push the user's selected input device down to the audio engine
    // before kicking off capture. If the Settings page was never opened
    // this session, the backend's `selected_device_id` would otherwise
    // still be `None` and resolve to the host's default mic instead of
    // the interface the user picked on a previous run. `'default'` is
    // the sentinel for "let the host pick".
    //
    // Persisted ids encode `{host}|{name}|{index}` and cpal can
    // renumber that index between launches, so the stored id may be
    // stale. The resolver fixes the stale-id case — but only if it
    // has a live device list to match against. main.ts's boot refresh
    // is fire-and-forget; if the user arms the tuner before that
    // resolves, `appStore.inputDevices` is still empty and the
    // resolver returns null, sending Rust `null` (= host default)
    // even though the persisted interface IS plugged in. So when
    // the list looks unloaded, force a synchronous enumeration here
    // — `refreshInputDevicesBasic` runs the resolver as a side
    // effect and rewrites the persisted id to the live one if name
    // fallback hits, so the second resolve below either short-
    // circuits via exact match or correctly returns null only when
    // the device is genuinely gone.
    try {
      const appStore = useAppStore();
      if (appStore.inputDevices.length === 0) {
        await appStore.refreshInputDevicesBasic();
      }
      const selected = appStore.audioInputDeviceId;
      const deviceId =
        selected && selected !== 'default'
          ? (resolveAudioDevice(selected, appStore.inputDevices)?.device.id ??
            null)
          : null;
      await setInputDevice(deviceId);
    } catch (err) {
      teardownSubscription();
      throw err;
    }
    try {
      await startPitchDetectionCmd();
    } catch (err) {
      // Roll the subscription back so listeners can't leak when the
      // backend refused to start (e.g. missing permission, device busy).
      teardownSubscription();
      throw err;
    }
    isListening.value = true;
  }

  async function stop(): Promise<void> {
    try {
      await stopPitchDetectionCmd();
    } finally {
      isListening.value = false;
      currentPitch.value = null;
      teardownSubscription();
    }
  }

  async function setConfig(config: PitchConfig): Promise<void> {
    await setPitchConfigCmd(config);
  }

  async function syncListeningState(): Promise<void> {
    isListening.value = await isPitchListening();
    if (isListening.value) {
      await ensureSubscription();
    }
  }

  return {
    isListening,
    currentPitch,
    lastOnset,
    start,
    stop,
    setConfig,
    syncListeningState,
  };
});
