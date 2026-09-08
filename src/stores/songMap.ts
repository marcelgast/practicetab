import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { SongMap } from '../domain/songMap';
import { songMapPersistence } from '../services/songMapPersistence';
import type { SongMapSaveInput } from '../services/songMapPersistence';

export const useSongMapStore = defineStore('songMap', () => {
  const maps = ref<Map<string, SongMap>>(new Map());
  const pendingLoads = new Map<string, Promise<SongMap | null>>();
  const editorItemId = ref<string | null>(null);

  function hasSongMap(libraryItemId: string): boolean {
    return maps.value.has(libraryItemId);
  }

  function getSongMap(libraryItemId: string): SongMap | null {
    return maps.value.get(libraryItemId) ?? null;
  }

  const allMaps = computed(() => Array.from(maps.value.values()));

  async function load(libraryItemId: string): Promise<SongMap | null> {
    const pending = pendingLoads.get(libraryItemId);
    if (pending) {
      return pending;
    }
    const promise = songMapPersistence
      .get(libraryItemId)
      .then((result) => {
        if (result) {
          maps.value.set(libraryItemId, result);
        } else {
          maps.value.delete(libraryItemId);
        }
        return result;
      })
      .finally(() => {
        pendingLoads.delete(libraryItemId);
      });
    pendingLoads.set(libraryItemId, promise);
    return promise;
  }

  async function save(
    libraryItemId: string,
    input: SongMapSaveInput,
  ): Promise<SongMap> {
    const result = await songMapPersistence.save(libraryItemId, input);
    maps.value.set(libraryItemId, result);
    return result;
  }

  async function remove(libraryItemId: string): Promise<void> {
    await songMapPersistence.remove(libraryItemId);
    maps.value.delete(libraryItemId);
  }

  function isLoading(libraryItemId: string): boolean {
    return pendingLoads.has(libraryItemId);
  }

  function openEditor(libraryItemId: string): void {
    editorItemId.value = libraryItemId;
  }

  function closeEditor(): void {
    editorItemId.value = null;
  }

  return {
    maps,
    allMaps,
    hasSongMap,
    getSongMap,
    isLoading,
    editorItemId,
    openEditor,
    closeEditor,
    load,
    save,
    remove,
  };
});
