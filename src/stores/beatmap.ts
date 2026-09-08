import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { LibraryItem } from '../domain/library';
import { getLibrarySourcePath } from '../domain/library';
import {
  formatPlayedBarLabel,
  normalizeLoopEvents,
  normalizeTimeEvents,
  tempoStateAtNotationBar,
  type BeatmapLoopEvent,
  type BeatmapPlayedBarRow,
  type BeatmapTimeEvent,
} from '../domain/beatmap';
import { libraryFileOps } from '../services/libraryFileOps';
import {
  beatmapPersistence,
  type StoredBeatmapEntry,
} from '../services/beatmapPersistence';
import {
  buildGpBeatmapFromBytes,
  type GpBeatmap,
} from '../services/gpBeatmapBuilder';
import { scanMaxFretFromBytes } from '../services/fretboardScan';
import { nowIso } from '../utils/date';
import { useLibraryStore } from './library';

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
  return new Uint8Array();
}

function fingerprintForItem(item: LibraryItem): string {
  const metadata = item.metadata;
  if (
    !metadata ||
    typeof metadata.size !== 'number' ||
    typeof metadata.modifiedMs !== 'number' ||
    typeof metadata.fileName !== 'string'
  ) {
    const fallbackPath = getLibrarySourcePath(item.source);
    return `unknown:${fallbackPath}`;
  }
  return `${metadata.size}:${metadata.modifiedMs}:${metadata.fileName}`;
}

function rebuildPlayedBarsFromEvents(
  endBar: number,
  timeEvents: BeatmapTimeEvent[],
  loopEvents: BeatmapLoopEvent[],
): BeatmapPlayedBarRow[] {
  const rows: BeatmapPlayedBarRow[] = [];
  const normalizedLoops = normalizeLoopEvents(loopEvents);
  const normalizedTimeEvents = [...timeEvents].sort(
    (a, b) => a.barIndex - b.barIndex,
  );
  const maxEndBar = Math.max(1, Math.round(endBar));
  let playedIndex = 1;
  let cursor = 1;

  normalizedLoops.forEach((loop) => {
    if (loop.startBar > maxEndBar) {
      return;
    }
    for (let bar = cursor; bar < loop.startBar && bar <= maxEndBar; bar += 1) {
      const state = tempoStateAtNotationBar(bar, normalizedTimeEvents);
      rows.push({
        playedBarIndex: playedIndex,
        notationBarIndex: bar,
        repeatPass: 0,
        playedBarLabel: formatPlayedBarLabel(bar, 0),
        bpm: state.bpm,
        timeSigTop: state.timeSigTop,
        timeSigBottom: state.timeSigBottom,
      });
      playedIndex += 1;
    }
    const loopEnd = Math.min(maxEndBar, loop.endBar);
    for (let pass = 0; pass <= loop.repeatCount; pass += 1) {
      for (let bar = loop.startBar; bar <= loopEnd; bar += 1) {
        const state = tempoStateAtNotationBar(bar, normalizedTimeEvents);
        rows.push({
          playedBarIndex: playedIndex,
          notationBarIndex: bar,
          repeatPass: pass,
          playedBarLabel: formatPlayedBarLabel(bar, pass),
          bpm: state.bpm,
          timeSigTop: state.timeSigTop,
          timeSigBottom: state.timeSigBottom,
        });
        playedIndex += 1;
      }
    }
    cursor = loopEnd + 1;
  });

  for (let bar = cursor; bar <= maxEndBar; bar += 1) {
    const state = tempoStateAtNotationBar(bar, normalizedTimeEvents);
    rows.push({
      playedBarIndex: playedIndex,
      notationBarIndex: bar,
      repeatPass: 0,
      playedBarLabel: formatPlayedBarLabel(bar, 0),
      bpm: state.bpm,
      timeSigTop: state.timeSigTop,
      timeSigBottom: state.timeSigBottom,
    });
    playedIndex += 1;
  }

  return rows;
}

function normalizeBeatmap(beatmap: GpBeatmap): GpBeatmap {
  const endBar = Math.max(1, Math.round(beatmap.endBar));
  const timeEvents = normalizeTimeEvents(beatmap.timeEvents, {
    bpm: beatmap.startBpm,
    timeSigTop: beatmap.startTimeSigTop,
    timeSigBottom: beatmap.startTimeSigBottom,
  });
  const loopEvents = normalizeLoopEvents(beatmap.loopEvents).filter(
    (loop) => loop.startBar <= endBar,
  );
  const providedPlayedBars = Array.isArray(beatmap.playedBars)
    ? beatmap.playedBars
        .filter(
          (row) =>
            Number.isFinite(row.playedBarIndex) &&
            Number.isFinite(row.notationBarIndex) &&
            row.notationBarIndex >= 1 &&
            row.notationBarIndex <= endBar,
        )
        .map((row, index) => ({
          playedBarIndex: index + 1,
          notationBarIndex: Math.max(1, Math.round(row.notationBarIndex)),
          repeatPass: Math.max(0, Math.round(row.repeatPass)),
          playedBarLabel: formatPlayedBarLabel(
            Math.max(1, Math.round(row.notationBarIndex)),
            Math.max(0, Math.round(row.repeatPass)),
          ),
          bpm: Math.max(20, Math.round(row.bpm)),
          timeSigTop: Math.max(1, Math.round(row.timeSigTop)),
          timeSigBottom: [1, 2, 4, 8, 16, 32].includes(
            Math.round(row.timeSigBottom),
          )
            ? Math.round(row.timeSigBottom)
            : 4,
        }))
    : [];

  return {
    startBpm: timeEvents[0]?.bpm ?? beatmap.startBpm,
    startTimeSigTop: timeEvents[0]?.timeSigTop ?? beatmap.startTimeSigTop,
    startTimeSigBottom:
      timeEvents[0]?.timeSigBottom ?? beatmap.startTimeSigBottom,
    endBar,
    timeEvents,
    loopEvents,
    playedBars:
      providedPlayedBars.length > 0
        ? providedPlayedBars
        : rebuildPlayedBarsFromEvents(endBar, timeEvents, loopEvents),
  };
}

export const useBeatmapStore = defineStore('beatmap', () => {
  const entries = ref<StoredBeatmapEntry[]>(beatmapPersistence.load());
  const editorItemId = ref<string | null>(null);

  const entryById = computed(() => {
    const map = new Map<string, StoredBeatmapEntry>();
    entries.value.forEach((entry) => map.set(entry.itemId, entry));
    return map;
  });

  function persist(): void {
    beatmapPersistence.save(entries.value);
  }

  function refresh(): void {
    entries.value = beatmapPersistence.load();
  }

  function upsertEntry(next: StoredBeatmapEntry): void {
    const index = entries.value.findIndex(
      (entry) => entry.itemId === next.itemId,
    );
    if (index === -1) {
      entries.value = [...entries.value, next];
      persist();
      return;
    }
    const cloned = [...entries.value];
    cloned[index] = next;
    entries.value = cloned;
    persist();
  }

  function deleteForItem(itemId: string): void {
    entries.value = entries.value.filter((entry) => entry.itemId !== itemId);
    if (editorItemId.value === itemId) {
      editorItemId.value = null;
    }
    persist();
  }

  function statusForItem(itemId: string): StoredBeatmapEntry['status'] {
    return entryById.value.get(itemId)?.status ?? 'idle';
  }

  function getEntry(itemId: string): StoredBeatmapEntry | null {
    return entryById.value.get(itemId) ?? null;
  }

  function openEditor(itemId: string): void {
    editorItemId.value = itemId;
  }

  function closeEditor(): void {
    editorItemId.value = null;
  }

  function setManualBeatmap(itemId: string, beatmap: GpBeatmap): void {
    const normalized = normalizeBeatmap(beatmap);
    const existing = getEntry(itemId);
    upsertEntry({
      itemId,
      status: 'ready',
      error: undefined,
      fingerprint: existing?.fingerprint,
      updatedAt: nowIso(),
      beatmap: normalized,
    });
  }

  /**
   * Cache the tab's highest-fret-used number in the library item's
   * metadata so the Fretboard Panel (PR 4.2) can size its SVG
   * without rescanning on every open. Runs best-effort — a scan
   * failure must not derail the beatmap ensure path. Skips when
   * `metadata.maxFret` is already populated with the same value
   * so we don't churn `updatedAt` on every reopen.
   */
  function persistMaxFretForItem(item: LibraryItem, bytes: Uint8Array): void {
    if (item.kind === 'audio') return;
    try {
      const maxFret = scanMaxFretFromBytes(bytes);
      if (!Number.isFinite(maxFret)) return;
      if (item.metadata.maxFret === maxFret) return;
      useLibraryStore().updateItemMetadata(item.id, { maxFret });
    } catch {
      // Scanner errors are non-fatal — the panel falls back to a
      // sensible default when `metadata.maxFret` is missing.
    }
  }

  /**
   * One-shot background scan for items that already have a fresh
   * beatmap but lack `metadata.maxFret` (pre-PR-4.2 backups).
   * Reads the file once and persists the result. Failures are
   * swallowed — the fretboard panel has a fallback neck length
   * when the field stays undefined.
   */
  async function lazyScanMaxFret(
    item: LibraryItem,
    path: string,
  ): Promise<void> {
    const readFileBase64 = (
      libraryFileOps as unknown as {
        readFileBase64?: (p: string) => Promise<string>;
      }
    ).readFileBase64;
    if (typeof readFileBase64 !== 'function') return;
    try {
      const base64 = await readFileBase64(path);
      const bytes = base64ToUint8Array(base64);
      persistMaxFretForItem(item, bytes);
    } catch {
      // Non-fatal — see persistMaxFretForItem.
    }
  }

  async function ensureForItem(
    item: LibraryItem,
    force = false,
  ): Promise<void> {
    if (!item?.id || !item?.source) {
      return;
    }
    if (item.kind === 'audio') {
      return;
    }
    const path = getLibrarySourcePath(item.source);
    const fingerprint = fingerprintForItem(item);
    const existing = getEntry(item.id);
    if (
      !force &&
      existing?.status === 'ready' &&
      existing.fingerprint === fingerprint &&
      existing.beatmap
    ) {
      // Beatmap is cached, but a pre-PR-4.2 backup (or a legacy
      // library item) may still be missing `metadata.maxFret`.
      // Do a one-shot lazy scan so the Fretboard Panel gets a
      // correct neck length without forcing a re-import.
      if (item.metadata.maxFret === undefined) {
        void lazyScanMaxFret(item, path);
      }
      return;
    }

    upsertEntry({
      itemId: item.id,
      status: 'generating',
      fingerprint,
      updatedAt: nowIso(),
      beatmap: existing?.beatmap,
    });

    try {
      const readFileBase64 = (
        libraryFileOps as unknown as {
          readFileBase64?: (p: string) => Promise<string>;
        }
      ).readFileBase64;
      if (typeof readFileBase64 !== 'function') {
        throw new Error('read_file_unavailable');
      }
      const base64 = await readFileBase64(path);
      const bytes = base64ToUint8Array(base64);
      const beatmap = normalizeBeatmap(buildGpBeatmapFromBytes(bytes));
      upsertEntry({
        itemId: item.id,
        status: 'ready',
        error: undefined,
        fingerprint,
        updatedAt: nowIso(),
        beatmap,
      });
      persistMaxFretForItem(item, bytes);
    } catch (error) {
      upsertEntry({
        itemId: item.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        fingerprint,
        updatedAt: nowIso(),
        beatmap: existing?.beatmap,
      });
    }
  }

  async function syncForLibrary(
    items: LibraryItem[],
    fileOpsAvailable: boolean,
  ): Promise<void> {
    const validIds = new Set(items.map((item) => item.id));
    entries.value
      .filter((entry) => !validIds.has(entry.itemId))
      .forEach((entry) => {
        deleteForItem(entry.itemId);
      });
    if (!fileOpsAvailable) {
      return;
    }
    for (const item of items) {
      await ensureForItem(item);
    }
  }

  return {
    entries,
    editorItemId,
    entryById,
    statusForItem,
    getEntry,
    openEditor,
    closeEditor,
    deleteForItem,
    setManualBeatmap,
    refresh,
    ensureForItem,
    syncForLibrary,
  };
});
