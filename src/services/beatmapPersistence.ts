import { getStoredJson, setStoredJson } from '../domain/storage';
import type { GpBeatmap } from './gpBeatmapBuilder';

export type StoredBeatmapEntry = {
  itemId: string;
  status: 'idle' | 'generating' | 'ready' | 'error';
  error?: string;
  fingerprint?: string;
  updatedAt?: string;
  beatmap?: GpBeatmap;
};

const STORAGE_KEY = 'practicetab.beatmaps.v1';

function normalize(entries: unknown): StoredBeatmapEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter(Boolean) as StoredBeatmapEntry[];
}

export const beatmapPersistence = {
  load(): StoredBeatmapEntry[] {
    return normalize(getStoredJson<StoredBeatmapEntry[]>(STORAGE_KEY, []));
  },
  save(entries: StoredBeatmapEntry[]): void {
    setStoredJson(STORAGE_KEY, entries);
  },
  reset(): void {
    setStoredJson<StoredBeatmapEntry[]>(STORAGE_KEY, []);
  },
};
