import { computed, nextTick, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  createLibraryItemFromPick,
  markAvailable,
  markMissing,
  needsRelink,
  relink,
  type FileMetadata,
  type LibraryItem,
} from '../domain/library';
import { getLibrarySourcePath } from '../domain/library';
import { libraryPersistence } from '../services/libraryPersistence';
import { createId } from '../utils/id';
import { nowIso } from '../utils/date';
import { isTauri, libraryFileOps } from '../services/libraryFileOps';
import {
  computeAndStoreWaveform,
  deleteStoredWaveform,
} from '../services/audioDecodeService';
import { useBeatmapStore } from './beatmap';
import { useSongMapStore } from './songMap';

function toMissingReason(error: unknown): LibraryItem['missingReason'] {
  const message = String(error ?? '');
  if (message.includes('not_found')) {
    return 'not_found';
  }
  if (message.includes('no_permission')) {
    return 'no_permission';
  }
  return 'unknown';
}

function isValidFileMetadata(value: unknown): value is FileMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const metadata = value as Partial<FileMetadata>;
  return (
    typeof metadata.fileName === 'string' &&
    typeof metadata.size === 'number' &&
    typeof metadata.modifiedMs === 'number'
  );
}

export const useLibraryStore = defineStore('library', () => {
  const beatmapStore = useBeatmapStore();
  const songMapStore = useSongMapStore();
  const items = ref<LibraryItem[]>([]);
  const selectedId = ref<string | null>(null);
  const isReady = ref(false);
  const fileOpsAvailable = ref(isTauri());
  const refreshPromise = ref<Promise<void> | null>(null);
  const duplicateDialogOpen = ref(false);
  const importProgress = ref<string | null>(null);

  const selectedItem = computed(
    () => items.value.find((item) => item.id === selectedId.value) ?? null,
  );

  function normalizePath(value: string): string {
    return value.replace(/\\/g, '/').toLowerCase();
  }

  function hasDuplicatePath(path: string): boolean {
    const target = normalizePath(path);
    return items.value.some((item) => {
      const itemPath = getLibrarySourcePath(item.source);
      return normalizePath(itemPath) === target;
    });
  }

  function findByPath(path: string): LibraryItem | null {
    const target = normalizePath(path);
    return (
      items.value.find((item) => {
        const itemPath = getLibrarySourcePath(item.source);
        return normalizePath(itemPath) === target;
      }) ?? null
    );
  }

  function openDuplicateDialog(): void {
    duplicateDialogOpen.value = true;
  }

  function closeDuplicateDialog(): void {
    duplicateDialogOpen.value = false;
  }

  function persist(): void {
    libraryPersistence.save(items.value);
  }

  function loadItems(): void {
    items.value = libraryPersistence.load();
    if (!selectedId.value && items.value.length > 0) {
      selectedId.value = items.value[0].id;
    }
  }

  function init(): void {
    fileOpsAvailable.value = isTauri();
    loadItems();
    void beatmapStore.syncForLibrary(items.value, fileOpsAvailable.value);
    if (fileOpsAvailable.value) {
      void refreshStatus();
    }
    isReady.value = true;
  }

  async function refresh(): Promise<void> {
    if (refreshPromise.value) {
      return refreshPromise.value;
    }
    refreshPromise.value = (async () => {
      fileOpsAvailable.value = isTauri();
      loadItems();
      await beatmapStore.syncForLibrary(items.value, fileOpsAvailable.value);
      if (fileOpsAvailable.value) {
        await refreshStatus();
      }
      isReady.value = true;
    })().finally(() => {
      refreshPromise.value = null;
    });
    return refreshPromise.value;
  }

  async function addFromFilePicker(): Promise<void> {
    if (!fileOpsAvailable.value) {
      return;
    }
    let picks = [] as Awaited<ReturnType<typeof libraryFileOps.pickGpFiles>>;
    try {
      picks = await libraryFileOps.pickGpFiles();
    } catch (error) {
      void error;
      return;
    }
    if (!picks.length) {
      return;
    }

    for (const pick of picks) {
      if (hasDuplicatePath(pick.path)) {
        openDuplicateDialog();
        continue;
      }
      const now = nowIso();
      const item = createLibraryItemFromPick(
        { path: pick.path, metadata: pick.metadata, kind: 'tab' },
        now,
        () => createId(),
      );
      items.value = [...items.value, item];
      selectedId.value = item.id;
      persist();
      void beatmapStore.ensureForItem(item, true);
    }
  }

  async function addAudioFromFilePicker(): Promise<void> {
    if (!fileOpsAvailable.value) {
      return;
    }
    let picks = [] as Awaited<ReturnType<typeof libraryFileOps.pickAudioFiles>>;
    try {
      picks = await libraryFileOps.pickAudioFiles();
    } catch (error) {
      void error;
      return;
    }
    if (!picks.length) {
      return;
    }

    for (const pick of picks) {
      if (hasDuplicatePath(pick.path)) {
        openDuplicateDialog();
        continue;
      }
      const fileName =
        pick.path.split('/').pop() ?? pick.path.split('\\').pop() ?? pick.path;
      importProgress.value = `Importing "${fileName}"…`;
      const now = nowIso();
      const item = createLibraryItemFromPick(
        { path: pick.path, metadata: pick.metadata, kind: 'audio' },
        now,
        () => createId(),
      );
      items.value = [...items.value, item];
      selectedId.value = item.id;
      persist();
      importProgress.value = `Generating waveform for "${fileName}"…`;
      // nextTick flushes Vue reactivity, then rAF ensures browser paints the overlay
      await nextTick();
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      try {
        await computeAndStoreWaveform(item.id, pick.path, 8000);
      } catch {
        // Waveform generation is non-critical; continue with import
      }
    }
    importProgress.value = null;
  }

  async function addReferenceFromPicker(): Promise<LibraryItem | null> {
    if (!fileOpsAvailable.value) {
      return null;
    }
    let picks = [] as Awaited<ReturnType<typeof libraryFileOps.pickGpFiles>>;
    try {
      picks = await libraryFileOps.pickGpFiles();
    } catch (error) {
      void error;
      return null;
    }
    const pick = picks[0];
    if (!pick) {
      return null;
    }
    if (hasDuplicatePath(pick.path)) {
      openDuplicateDialog();
      return null;
    }
    const now = nowIso();
    const item = createLibraryItemFromPick(
      { path: pick.path, metadata: pick.metadata },
      now,
      () => createId(),
    );
    items.value = [...items.value, item];
    selectedId.value = item.id;
    persist();
    void beatmapStore.ensureForItem(item, true);
    return item;
  }

  function addReferenceStub(
    path: string,
    metadata: FileMetadata,
    title?: string,
  ): void {
    void addReferenceFromPath(path, metadata, title);
  }

  function addReferenceFromPath(
    path: string,
    metadata: FileMetadata,
    title?: string,
  ): LibraryItem | null {
    const existing = findByPath(path);
    if (existing) {
      return existing;
    }
    if (hasDuplicatePath(path)) {
      openDuplicateDialog();
      return null;
    }
    const now = nowIso();
    const item = createLibraryItemFromPick({ path, metadata, title }, now, () =>
      createId(),
    );
    items.value = [...items.value, item];
    selectedId.value = item.id;
    persist();
    void beatmapStore.ensureForItem(item, true);
    return item;
  }

  /**
   * Merge-patch a library item's metadata. Used by the beatmap
   * store to persist derived facts (e.g. `maxFret`) after a tab
   * parse, without re-importing the file. No-op when the item is
   * missing; caller shouldn't rely on the promise for ordering.
   */
  function updateItemMetadata(
    itemId: string,
    patch: Partial<FileMetadata>,
  ): void {
    const existing = items.value.find((item) => item.id === itemId);
    if (!existing) {
      return;
    }
    const merged: FileMetadata = { ...existing.metadata, ...patch };
    const now = nowIso();
    items.value = items.value.map((item) =>
      item.id === itemId ? { ...item, metadata: merged, updatedAt: now } : item,
    );
    persist();
  }

  function renameItem(itemId: string, title: string): void {
    const now = nowIso();
    items.value = items.value.map((item) =>
      item.id === itemId
        ? { ...item, title: title.trim(), updatedAt: now }
        : item,
    );
    persist();
  }

  function deleteItem(itemId: string): void {
    items.value = items.value.filter((item) => item.id !== itemId);
    if (selectedId.value === itemId) {
      selectedId.value = items.value[0]?.id ?? null;
    }
    persist();
    beatmapStore.deleteForItem(itemId);
    void songMapStore.remove(itemId).catch(() => {});
    void deleteStoredWaveform(itemId).catch(() => {});
  }

  function markItemMissing(
    itemId: string,
    reason: LibraryItem['missingReason'],
  ): void {
    const now = nowIso();
    items.value = items.value.map((item) =>
      item.id === itemId ? markMissing(item, reason, now) : item,
    );
    persist();
  }

  function markItemAvailable(itemId: string): void {
    const now = nowIso();
    items.value = items.value.map((item) =>
      item.id === itemId ? markAvailable(item, now) : item,
    );
    persist();
  }

  function relinkItem(
    itemId: string,
    newPath: string,
    metadata: FileMetadata,
  ): void {
    const now = nowIso();
    items.value = items.value.map((item) =>
      item.id === itemId ? relink(item, newPath, metadata, now) : item,
    );
    persist();
    const updated = items.value.find((item) => item.id === itemId);
    if (updated) {
      void beatmapStore.ensureForItem(updated, true);
    }
  }

  async function relinkViaPicker(itemId: string): Promise<void> {
    if (!fileOpsAvailable.value) {
      return;
    }
    let picks = [] as Awaited<ReturnType<typeof libraryFileOps.pickGpFiles>>;
    try {
      picks = await libraryFileOps.pickGpFiles();
    } catch (error) {
      void error;
      return;
    }
    const pick = picks[0];
    if (!pick) {
      return;
    }
    relinkItem(itemId, pick.path, pick.metadata);
  }

  async function refreshStatus(): Promise<void> {
    if (!fileOpsAvailable.value) {
      return;
    }
    for (const item of items.value) {
      const path =
        item.source.kind === 'reference'
          ? item.source.path
          : item.source.managedPath;
      try {
        const metadataResult = await libraryFileOps.stat(path);
        if (!isValidFileMetadata(metadataResult)) {
          throw new Error('invalid_metadata');
        }
        const metadata = metadataResult;
        const now = nowIso();
        const updated = markAvailable(
          { ...item, metadata, updatedAt: now },
          now,
        );
        items.value = items.value.map((entry) =>
          entry.id === item.id ? updated : entry,
        );
        persist();
        void beatmapStore.ensureForItem(updated);
      } catch (error) {
        const reason = toMissingReason(error);
        const now = nowIso();
        const updated = markMissing(item, reason, now);
        items.value = items.value.map((entry) =>
          entry.id === item.id ? updated : entry,
        );
        persist();
      }
    }
  }

  function linkAudio(tabItemId: string, audioItemId: string): void {
    const now = nowIso();
    items.value = items.value.map((entry) =>
      entry.id === tabItemId
        ? { ...entry, linkedAudioId: audioItemId, updatedAt: now }
        : entry,
    );
    persist();
  }

  function unlinkAudio(tabItemId: string): void {
    const now = nowIso();
    items.value = items.value.map((entry) =>
      entry.id === tabItemId
        ? { ...entry, linkedAudioId: null, updatedAt: now }
        : entry,
    );
    persist();
  }

  function getLinkedAudio(tabItemId: string): LibraryItem | null {
    const tab = items.value.find((i) => i.id === tabItemId);
    if (!tab?.linkedAudioId) return null;
    return items.value.find((i) => i.id === tab.linkedAudioId) ?? null;
  }

  return {
    items,
    selectedId,
    selectedItem,
    isReady,
    fileOpsAvailable,
    duplicateDialogOpen,
    importProgress,
    init,
    refresh,
    addFromFilePicker,
    addAudioFromFilePicker,
    addReferenceStub,
    addReferenceFromPath,
    renameItem,
    deleteItem,
    markMissing: markItemMissing,
    markAvailable: markItemAvailable,
    relink: relinkItem,
    relinkViaPicker,
    refreshStatus,
    addReferenceFromPicker,
    needsRelink,
    closeDuplicateDialog,
    linkAudio,
    unlinkAudio,
    getLinkedAudio,
    updateItemMetadata,
  };
});
