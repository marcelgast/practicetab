import { invoke } from '@tauri-apps/api/core';

export type BeatState = 'accent' | 'normal' | 'low' | 'mute';
export type SoundMode =
  | 'blip'
  | 'tock'
  | 'drumKit'
  | 'hype'
  | 'metalKit'
  | 'rideKit';
export type AlphaTabBeatType = BeatState;

export type MetronomeScheduleEvent = {
  offsetMs: number;
  kind: BeatState;
};

export type MetronomeConfig = {
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
  volume: number;
  beatStates: BeatState[];
  subdivisionsEnabled: boolean;
  subdivisionsValue: number;
  soundMode: SoundMode;
  countInBars: number[];
  countInEnabled: boolean;
  startBeatIndex: number;
  startSubIndex: number;
  startDelayMs: number;
  schedule?: MetronomeScheduleEvent[];
  scheduleLoopMs?: number | null;
  scheduleStartOffsetMs?: number | null;
};

export type AlphaTabMetronomeTickPayload = {
  beatIndex: number;
  beatDurationMs: number;
  subdivisions: number;
  soundMode: SoundMode;
  beatType: AlphaTabBeatType;
  volumeScalar: number;
};

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export async function metronomeStart(config: MetronomeConfig): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('metronome_start', { config });
}

export async function metronomeStop(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('metronome_stop');
}

export async function metronomeSetConfig(
  config: MetronomeConfig,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('metronome_set_config', { config });
}

export async function metronomeBeep(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('metronome_beep');
}

export async function metronomeTickFromAlphaTab(
  payload: AlphaTabMetronomeTickPayload,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('metronome_tick_from_alphatab', { payload });
}

export async function metronomeCancelScheduled(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('metronome_cancel_scheduled');
}
