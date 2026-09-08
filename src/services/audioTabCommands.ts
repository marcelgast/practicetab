import { invoke } from '@tauri-apps/api/core';

export type AudioTabEventKind =
  | {
      type: 'note_on';
      key: number;
      velocity: number;
      vibrato?: 'slight' | 'wide';
    }
  | { type: 'note_off'; key: number; velocity: number }
  | { type: 'program_change'; program: number }
  | { type: 'control_change'; controller: number; value: number }
  | {
      type: 'pitch_bend';
      value: number;
      endpoint?: boolean;
      label?: 'bend' | 'slide' | 'reset';
    }
  | { type: 'all_notes_off' }
  | { type: 'reset' };

export type AudioTabEvent = {
  atMs: number;
  trackId: string;
  channel: number;
  kind: AudioTabEventKind;
};

export type TempoPointPayload = {
  tick: number;
  timeMs: number;
  usPerQuarter: number;
};

export type TrackStatePayload = {
  trackId: string;
  mute: boolean;
  solo: boolean;
  volume: number;
  listen: boolean;
};

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export async function prepareTab(trackIds: string[]): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_prepare', { trackIds });
}

export async function scheduleEvents(
  events: AudioTabEvent[],
  tempoMap: TempoPointPayload[],
  midiDivision: number,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_schedule_events', {
    events,
    tempoMap,
    midiDivision,
  });
}

export async function playTab(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_play');
}

export async function pauseTab(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_pause');
}

export async function stopTab(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_stop');
}

export async function seekTab(positionMs: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_seek', { positionMs });
}

export async function seekToTick(tick: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_seek', { tick });
}

export async function seekAndPlay(tick: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_seek_and_play', { tick });
}

export async function setTempoFactor(factor: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_set_tempo_factor', { factor });
}

export async function setTrackState(payload: TrackStatePayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_set_track_state', { payload });
}

export async function setLoopRangeMs(
  startMs: number,
  endMs: number,
): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_set_loop_range', { startMs, endMs });
}

export async function clearLoopRange(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_clear_loop_range');
}

export async function getAudioPositionMs(): Promise<number | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<number>('audio_tab_get_position_ms');
}

export async function setTabTuning(tuningSemitones: number): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke('audio_tab_set_tuning', { tuningSemitones });
}
