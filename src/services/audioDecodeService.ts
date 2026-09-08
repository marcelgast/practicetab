import { invoke } from '@tauri-apps/api/core';

export type WaveformPeaks = {
  peaks: number[];
  durationMs: number;
  sampleRate: number;
};

export async function decodeWaveform(
  path: string,
  numPeaks: number,
): Promise<WaveformPeaks> {
  return invoke<WaveformPeaks>('audio_decode_waveform', {
    path,
    numPeaks,
  });
}

export async function computeAndStoreWaveform(
  libraryItemId: string,
  path: string,
  numPeaks: number,
): Promise<WaveformPeaks> {
  return invoke<WaveformPeaks>('waveform_compute_and_store', {
    libraryItemId,
    path,
    numPeaks,
  });
}

export async function getStoredWaveform(
  libraryItemId: string,
): Promise<WaveformPeaks | null> {
  return invoke<WaveformPeaks | null>('waveform_get_stored', {
    libraryItemId,
  });
}

export async function deleteStoredWaveform(
  libraryItemId: string,
): Promise<void> {
  return invoke<void>('waveform_delete_stored', {
    libraryItemId,
  });
}

export async function storeWaveform(
  libraryItemId: string,
  peaks: number[],
  durationMs: number,
  sampleRate: number,
): Promise<void> {
  return invoke<void>('waveform_store', {
    libraryItemId,
    peaks,
    durationMs,
    sampleRate,
  });
}
