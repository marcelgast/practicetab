import { invoke } from '@tauri-apps/api/core';
import type { SongMap } from '../domain/songMap';

export type SongSectionInput = {
  id?: string;
  label: string;
  color: string;
  timestampMs: number;
  sortOrder: number;
};

export type SongMapSaveInput = {
  startOffsetMs: number;
  sections: SongSectionInput[];
};

export const songMapPersistence = {
  async get(libraryItemId: string): Promise<SongMap | null> {
    return invoke<SongMap | null>('song_map_get', { libraryItemId });
  },

  async save(libraryItemId: string, input: SongMapSaveInput): Promise<SongMap> {
    return invoke<SongMap>('song_map_save', { libraryItemId, input });
  },

  async remove(libraryItemId: string): Promise<void> {
    await invoke('song_map_delete', { libraryItemId });
  },
};
