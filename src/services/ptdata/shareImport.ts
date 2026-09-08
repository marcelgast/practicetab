import type {
  ImportReport,
  PtDataEnvelopeV1,
  PtEmbeddedAudioDTO,
  PtLibraryItemDTO,
  PtShareDataV1,
} from '../../domain/ptdata';
import {
  createLibraryItemFromPick,
  type LibraryItem,
} from '../../domain/library';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/date';
import { getLibrarySourcePath } from '../../domain/library';
import { libraryPersistence } from '../libraryPersistence';
import { backupFileOps } from '../backupFileOps';
import { shareFileOps } from '../shareFileOps';
import { importPtDataEnvelope, restoreAudioMetadata } from './serializer';

export type ShareMissingTab = {
  exerciseId: string;
  libraryItemId: string;
  title?: string;
  source?: PtLibraryItemDTO['source'];
  metadata?: PtLibraryItemDTO['metadata'];
};

export type ShareImportResult = {
  status: 'success' | 'cancelled';
  report?: ImportReport;
  missingTabs?: ShareMissingTab[];
};

export type ShareImportOptions = {
  planOverrides?: Record<string, string>;
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function findItemByPath(
  items: LibraryItem[],
  path: string,
): LibraryItem | null {
  const target = normalizePath(path);
  return (
    items.find(
      (item) => normalizePath(getLibrarySourcePath(item.source)) === target,
    ) ?? null
  );
}

function upsertLibraryItemForPath(
  items: LibraryItem[],
  path: string,
  metadata: PtLibraryItemDTO['metadata'],
  title?: string,
  kind?: 'tab' | 'audio',
): { items: LibraryItem[]; item: LibraryItem } {
  const existing = findItemByPath(items, path);
  if (existing) {
    return { items, item: existing };
  }
  const now = nowIso();
  const item = createLibraryItemFromPick(
    {
      path,
      metadata: {
        fileName: metadata.fileName,
        size: metadata.size,
        modifiedMs: metadata.modifiedMs,
        hash: metadata.hash,
      },
      title,
      kind,
    },
    now,
    () => createId(),
  );
  return { items: [...items, item], item };
}

function applyEmbeddedSources(
  data: PtShareDataV1,
  savedPaths: Map<
    string,
    { path: string; metadata: PtLibraryItemDTO['metadata'] }
  >,
): PtShareDataV1 {
  return {
    ...data,
    libraryItems: data.libraryItems.map((item) => {
      const saved = savedPaths.get(item.id);
      if (!saved) {
        return item;
      }
      return {
        ...item,
        source: { kind: 'reference', path: saved.path },
        metadata: saved.metadata,
        lastKnownOk: true,
        missingReason: undefined,
      };
    }),
  };
}

function extractDirectory(filePath: string): string {
  const separator = filePath.includes('\\') ? '\\' : '/';
  const lastSep = filePath.lastIndexOf(separator);
  return lastSep >= 0 ? filePath.substring(0, lastSep) : filePath;
}

function joinPath(base: string, fileName: string): string {
  const separator = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${separator}${fileName}`;
}

async function saveEmbeddedAudioToFolder(
  embeddedAudio: PtEmbeddedAudioDTO[],
  folderPath: string,
): Promise<
  Map<string, { path: string; metadata: PtLibraryItemDTO['metadata'] }>
> {
  const savedPaths = new Map<
    string,
    { path: string; metadata: PtLibraryItemDTO['metadata'] }
  >();
  for (const audio of embeddedAudio) {
    const savePath = joinPath(folderPath, audio.fileName);
    await backupFileOps.writeFileBase64(savePath, audio.contentBase64);
    savedPaths.set(audio.libraryItemId, {
      path: savePath,
      metadata: audio.metadata,
    });
  }
  return savedPaths;
}

export async function importShareEnvelope(
  envelope: PtDataEnvelopeV1,
  options?: ShareImportOptions,
): Promise<ShareImportResult> {
  if (envelope.format !== 'ptdata' || envelope.formatVersion !== 1) {
    throw new Error('unsupported_share_version');
  }
  if (envelope.kind !== 'share') {
    throw new Error('invalid_share_file');
  }
  const data = envelope.data as PtShareDataV1;
  const embeddedTabs = data.embeddedTabs ?? [];
  const embeddedAudio = data.embeddedAudio ?? [];
  const savedPaths = new Map<
    string,
    { path: string; metadata: PtLibraryItemDTO['metadata'] }
  >();
  let tabSaveDirectory: string | null = null;

  if (embeddedTabs.length > 0) {
    for (const tab of embeddedTabs) {
      const savePath = await shareFileOps.pickTabSavePath(tab.fileName);
      if (!savePath) {
        return { status: 'cancelled' };
      }
      if (!tabSaveDirectory) {
        tabSaveDirectory = extractDirectory(savePath);
      }
      await backupFileOps.writeFileBase64(savePath, tab.contentBase64);
      savedPaths.set(tab.libraryItemId, {
        path: savePath,
        metadata: tab.metadata,
      });
    }
  }

  if (embeddedAudio.length > 0) {
    let audioFolder = tabSaveDirectory;
    if (!audioFolder) {
      // No tabs in this share — prompt with the first audio file name to
      // determine the save directory (same UX as tab save picker).
      const firstAudioPath = await shareFileOps.pickTabSavePath(
        embeddedAudio[0].fileName,
      );
      if (!firstAudioPath) {
        return { status: 'cancelled' };
      }
      audioFolder = extractDirectory(firstAudioPath);
      // Write the first audio file that was picked
      await backupFileOps.writeFileBase64(
        firstAudioPath,
        embeddedAudio[0].contentBase64,
      );
      savedPaths.set(embeddedAudio[0].libraryItemId, {
        path: firstAudioPath,
        metadata: embeddedAudio[0].metadata,
      });
    }
    // Save remaining audio files into the same folder
    const remaining = savedPaths.has(embeddedAudio[0].libraryItemId)
      ? embeddedAudio.slice(1)
      : embeddedAudio;
    const audioPaths = await saveEmbeddedAudioToFolder(remaining, audioFolder);
    for (const [id, saved] of audioPaths.entries()) {
      savedPaths.set(id, saved);
    }
  }

  const embeddedItemIdMapping: Record<string, string> = {};
  if (savedPaths.size > 0) {
    let items = libraryPersistence.load();
    for (const [libraryItemId, saved] of savedPaths.entries()) {
      const itemInfo = data.libraryItems.find(
        (entry) => entry.id === libraryItemId,
      );
      const title = itemInfo?.title ?? saved.metadata.fileName;
      const kind = itemInfo?.kind ?? 'tab';
      const result = upsertLibraryItemForPath(
        items,
        saved.path,
        saved.metadata,
        title,
        kind,
      );
      items = result.items;
      embeddedItemIdMapping[libraryItemId] = result.item.id;
    }
    libraryPersistence.save(items);
  }

  const updatedEnvelope: PtDataEnvelopeV1 =
    savedPaths.size > 0
      ? { ...envelope, data: applyEmbeddedSources(data, savedPaths) }
      : envelope;

  const report = await importPtDataEnvelope(updatedEnvelope, 'share', {
    planOverrides: options?.planOverrides,
  });

  // Restore beatmaps, song maps, and waveforms for imported audio.
  // Use embeddedItemIdMapping (built from upsertLibraryItemForPath) because
  // report.createdIds.libraryItems only contains newly created items — items
  // matched by path are in the mapping but not in createdIds.
  if (embeddedAudio.length > 0) {
    const audioIdMapping = {
      ...report.createdIds.libraryItems,
      ...embeddedItemIdMapping,
    };
    await restoreAudioMetadata(embeddedAudio, audioIdMapping);
  }

  const missingTabs: ShareMissingTab[] = report.missingTabs
    .map((entry) => ({
      exerciseId: report.createdIds.exercises[entry.exerciseId] ?? '',
      libraryItemId: entry.libraryItemId,
      title: entry.title,
      source: entry.source,
      metadata: entry.metadata,
    }))
    .filter((entry) => entry.exerciseId.length > 0);

  return { status: 'success', report, missingTabs };
}
