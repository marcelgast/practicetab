// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBeatmapStore } from '../stores/beatmap';
import type { LibraryItem } from '../domain/library';
import { buildGpBeatmapFromBytes } from '../services/gpBeatmapBuilder';

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    readFileBase64: vi.fn(),
    pickGpFiles: vi.fn(() => Promise.resolve([])),
    pickAudioFiles: vi.fn(() => Promise.resolve([])),
    stat: vi.fn(() => Promise.reject(new Error('stat_unavailable'))),
  },
}));

vi.mock('../services/gpBeatmapBuilder', () => ({
  buildGpBeatmapFromBytes: vi.fn(() => ({
    startBpm: 120,
    startTimeSigTop: 4,
    startTimeSigBottom: 4,
    endBar: 4,
    timeEvents: [{ barIndex: 1, bpm: 120, timeSigTop: 4, timeSigBottom: 4 }],
    loopEvents: [{ startBar: 2, endBar: 3, repeatCount: 1 }],
    playedBars: [],
  })),
}));

vi.mock('../services/fretboardScan', () => ({
  scanMaxFretFromBytes: vi.fn(() => 7),
}));

import { libraryFileOps } from '../services/libraryFileOps';
import { scanMaxFretFromBytes } from '../services/fretboardScan';
import { useLibraryStore } from '../stores/library';

const readBase64 = (
  libraryFileOps as { readFileBase64: ReturnType<typeof vi.fn> }
).readFileBase64;
const buildBeatmap = buildGpBeatmapFromBytes as unknown as ReturnType<
  typeof vi.fn
>;
const scanMaxFret = scanMaxFretFromBytes as unknown as ReturnType<typeof vi.fn>;

function item(id: string): LibraryItem {
  return {
    id,
    title: 'Song',
    source: { kind: 'reference', path: `/tmp/${id}.gp5` },
    metadata: { fileName: `${id}.gp5`, size: 12, modifiedMs: 5 },
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    lastKnownOk: true,
  };
}

describe('beatmap store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    readBase64.mockResolvedValue('AA==');
    scanMaxFret.mockReset();
    scanMaxFret.mockReturnValue(7);
  });

  it('generates and stores beatmap entries', async () => {
    const store = useBeatmapStore();
    await store.ensureForItem(item('lib-1'));
    const entry = store.getEntry('lib-1');
    expect(entry?.status).toBe('ready');
    expect(entry?.beatmap?.playedBars.length).toBeGreaterThan(0);
  });

  it('deletes entries when item is removed', async () => {
    const store = useBeatmapStore();
    await store.ensureForItem(item('lib-1'));
    store.deleteForItem('lib-1');
    expect(store.getEntry('lib-1')).toBeNull();
  });

  it('sync removes orphan beatmaps', async () => {
    const store = useBeatmapStore();
    await store.ensureForItem(item('orphan'));
    await store.syncForLibrary([item('alive')], true);
    expect(store.getEntry('orphan')).toBeNull();
    expect(store.getEntry('alive')?.status).toBe('ready');
  });

  it('writes scanned maxFret onto the library item metadata', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.addReferenceStub('/tmp/lib-max.gp5', {
      fileName: 'lib-max.gp5',
      size: 12,
      modifiedMs: 5,
    });
    const seeded = libraryStore.items.find(
      (i) => i.metadata.fileName === 'lib-max.gp5',
    );
    expect(seeded).toBeTruthy();

    scanMaxFret.mockReturnValue(14);
    const store = useBeatmapStore();
    // Use the seeded item's id so the beatmap + library stores
    // reference the same record.
    await store.ensureForItem({
      ...(seeded as NonNullable<typeof seeded>),
    });
    // Let the synchronous `persistMaxFretForItem` land.
    await Promise.resolve();

    expect(scanMaxFret).toHaveBeenCalled();
    const updated = libraryStore.items.find((i) => i.id === seeded!.id);
    expect(updated?.metadata.maxFret).toBe(14);
  });

  it('skips re-writing metadata when maxFret matches the cached value', async () => {
    const libraryStore = useLibraryStore();
    libraryStore.addReferenceStub('/tmp/lib-same.gp5', {
      fileName: 'lib-same.gp5',
      size: 12,
      modifiedMs: 5,
      maxFret: 9,
    });
    const seeded = libraryStore.items.find(
      (i) => i.metadata.fileName === 'lib-same.gp5',
    )!;
    const updateSpy = vi.spyOn(libraryStore, 'updateItemMetadata');

    scanMaxFret.mockReturnValue(9);
    const store = useBeatmapStore();
    await store.ensureForItem(seeded);

    // Scan still runs (we parsed the bytes anyway), but metadata
    // stays untouched so `updatedAt` doesn't churn on reopen.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('keeps generated played bars when builder returns alternate-ending mapping', async () => {
    buildBeatmap.mockReturnValueOnce({
      startBpm: 120,
      startTimeSigTop: 4,
      startTimeSigBottom: 4,
      endBar: 4,
      timeEvents: [{ barIndex: 1, bpm: 120, timeSigTop: 4, timeSigBottom: 4 }],
      loopEvents: [{ startBar: 2, endBar: 4, repeatCount: 1 }],
      playedBars: [
        {
          playedBarIndex: 1,
          notationBarIndex: 1,
          repeatPass: 0,
          playedBarLabel: '1',
          bpm: 120,
          timeSigTop: 4,
          timeSigBottom: 4,
        },
        {
          playedBarIndex: 2,
          notationBarIndex: 2,
          repeatPass: 0,
          playedBarLabel: '2',
          bpm: 120,
          timeSigTop: 4,
          timeSigBottom: 4,
        },
        {
          playedBarIndex: 3,
          notationBarIndex: 4,
          repeatPass: 0,
          playedBarLabel: '4',
          bpm: 120,
          timeSigTop: 4,
          timeSigBottom: 4,
        },
        {
          playedBarIndex: 4,
          notationBarIndex: 2,
          repeatPass: 1,
          playedBarLabel: '2.1',
          bpm: 120,
          timeSigTop: 4,
          timeSigBottom: 4,
        },
      ],
    });
    const store = useBeatmapStore();
    await store.ensureForItem(item('lib-alt'));
    const rows = store.getEntry('lib-alt')?.beatmap?.playedBars ?? [];
    expect(rows.map((row) => row.playedBarLabel)).toEqual([
      '1',
      '2',
      '4',
      '2.1',
    ]);
  });
});
