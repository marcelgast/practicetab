import { invoke } from '@tauri-apps/api/core';
import type { FileMetadata } from '../domain/library';

export type PickedFile = {
  path: string;
  metadata: FileMetadata;
};

export function isTauri(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export const libraryFileOps = {
  async pickGpFiles(): Promise<PickedFile[]> {
    if (!isTauri()) {
      return [];
    }
    return invoke<PickedFile[]>('library_pick_gp_files');
  },
  async pickAudioFiles(): Promise<PickedFile[]> {
    if (!isTauri()) {
      return [];
    }
    return invoke<PickedFile[]>('library_pick_audio_files');
  },
  async stat(path: string): Promise<FileMetadata> {
    if (!isTauri()) {
      throw new Error('Not available in browser dev');
    }
    return invoke<FileMetadata>('library_stat', { path });
  },
  async readFileBase64(path: string): Promise<string> {
    if (!isTauri()) {
      throw new Error('Not available in browser dev');
    }
    return invoke<string>('library_read_file_base64', { path });
  },
};
