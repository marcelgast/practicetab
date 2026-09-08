import { invoke } from '@tauri-apps/api/core';

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

/** Decode and load a song file into the audio engine. Returns duration in ms. */
export async function songLoad(path: string): Promise<number> {
  if (!isTauriRuntime()) return 0;
  return invoke<number>('audio_song_load', { path });
}

/** Unload the current song from the audio engine. */
export async function songUnload(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_unload');
}

/** Start song playback. */
export async function songPlay(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_play');
}

/** Start song playback after a delay (in ms) handled by the audio engine. */
export async function songPlayDelayed(delayMs: number): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_play_delayed', { delayMs });
}

/** Get time-stretcher output latency in ms. */
export async function songStretcherLatencyMs(): Promise<number> {
  if (!isTauriRuntime()) return 0;
  return invoke<number>('audio_song_stretcher_latency_ms');
}

/** Pause song playback. */
export async function songPause(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_pause');
}

/** Stop song playback and reset position to 0. */
export async function songStop(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_stop');
}

/** Seek song to a position in milliseconds. */
export async function songSeek(positionMs: number): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_seek', { positionMs });
}

/** Set song volume (0.0 to 1.0). */
export async function songSetVolume(volume: number): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_set_volume', { volume });
}

/** Set song pitch shift in semitones (-12 to +12). */
export async function songSetTuning(semitones: number): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_set_tuning', { semitones });
}

/** Set song playback speed multiplier. */
export async function songSetSpeed(speed: number): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_set_speed', { speed });
}

/** Set a loop region on the song (in milliseconds). */
export async function songSetLoop(
  startMs: number,
  endMs: number,
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_set_loop', { startMs, endMs });
}

/** Clear the song loop region. */
export async function songClearLoop(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('audio_song_clear_loop');
}

/** Get current song playback position in milliseconds. */
export async function songGetPositionMs(): Promise<number> {
  if (!isTauriRuntime()) return 0;
  return invoke<number>('audio_song_get_position_ms');
}
