import type { PtBackupDataV1, PtDataEnvelopeV1 } from '../domain/ptdata';
import { setStoredJson } from '../domain/storage';
import { backupFileOps } from './backupFileOps';
import {
  decodeBackupFile,
  encodeBackupFile,
  fromBase64,
  toBase64,
} from './backupCrypto';
import { libraryPersistence } from './libraryPersistence';
import { practicePersistence } from './practicePersistence';
import {
  listFeedbackRunsWithDetails,
  recordFeedbackRun,
  type FeedbackRunDetails,
} from './feedbackRunCommands';
import {
  exportBackupDTO,
  importPtDataEnvelope,
  restoreAudioMetadata,
} from './ptdata/serializer';

const SETTINGS_STORAGE_KEY = 'practicetab.settings';

export type BackupExportResult = {
  status: 'success' | 'cancelled';
};

export type BackupImportResult = {
  status: 'success' | 'cancelled';
  report?: Awaited<ReturnType<typeof importPtDataEnvelope>>;
};

type EmbeddedFileEntry = {
  libraryItemId: string;
  fileName: string;
  contentBase64: string;
  metadata: NonNullable<PtBackupDataV1['embeddedTabs']>[number]['metadata'];
};

type EmbeddedWriteTarget = {
  libraryItemId: string;
  relativePath: string;
  dataBase64: string;
  metadata: NonNullable<PtBackupDataV1['embeddedTabs']>[number]['metadata'];
};

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:"*?<>|]+/g, '_').trim() || 'tab.gp';
}

function joinPath(base: string, relative: string): string {
  const separator = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${separator}${relative}`;
}

function buildEmbeddedWriteTargets(
  entries: EmbeddedFileEntry[],
): EmbeddedWriteTarget[] {
  return entries.map((entry) => {
    const safeName = sanitizeFileName(entry.fileName);
    return {
      libraryItemId: entry.libraryItemId,
      relativePath: safeName,
      dataBase64: entry.contentBase64,
      metadata: entry.metadata,
    };
  });
}

function applyEmbeddedTabPaths(
  data: PtBackupDataV1,
  folderPath: string,
  embeddedTargets: EmbeddedWriteTarget[],
): PtBackupDataV1 {
  const targetMap = new Map(
    embeddedTargets.map((target) => [target.libraryItemId, target]),
  );
  const libraryItems = data.libraryItems.map((item) => {
    const target = targetMap.get(item.id);
    if (!target) {
      return item;
    }
    return {
      ...item,
      source: {
        kind: 'reference',
        path: joinPath(folderPath, target.relativePath),
      } as PtBackupDataV1['libraryItems'][number]['source'],
      metadata: target.metadata,
      lastKnownOk: true,
      missingReason: undefined,
    };
  });
  return {
    ...data,
    libraryItems,
  };
}

function assertBackupEnvelope(
  envelope: PtDataEnvelopeV1,
): asserts envelope is PtDataEnvelopeV1 & { data: PtBackupDataV1 } {
  if (envelope.format !== 'ptdata' || envelope.formatVersion !== 1) {
    throw new Error('unsupported_backup_version');
  }
  if (envelope.kind !== 'backup') {
    throw new Error('invalid_backup_file');
  }
}

async function resetAppDataForRestore(): Promise<void> {
  await practicePersistence.resetPracticeDb();
  libraryPersistence.reset();
  setStoredJson(SETTINGS_STORAGE_KEY, {});
}

export async function restoreBackupEnvelope(
  envelope: PtDataEnvelopeV1,
): Promise<Awaited<ReturnType<typeof importPtDataEnvelope>>> {
  assertBackupEnvelope(envelope);
  // Snapshot any existing feedback runs before the reset nukes the
  // table. If the backup itself carries feedback runs (v23+), the
  // user expects a full replace and we throw these away. If not
  // (pre-v23 backup), the backup is silent on feedback history and
  // a naive reset-then-import would wipe the user's runs invisibly —
  // so we rehydrate the snapshot after the import. Session- and
  // exercise-links get nulled on rehydrate because their source ids
  // no longer exist post-reset; library_item_id is kept as-is, which
  // may leave runs referencing library ids the new backup re-created
  // with different ids. Runs still appear in the top-level Feedback
  // tab with their scores intact — losing context is acceptable, the
  // alternative was silent data loss which review finding #2 called
  // out.
  const backupHasFeedbackRuns = Boolean(envelope.data.feedbackRuns?.length);
  const preservedFeedbackRuns: FeedbackRunDetails[] = backupHasFeedbackRuns
    ? []
    : await snapshotFeedbackRunsForRestore();
  await resetAppDataForRestore();
  const report = await importPtDataEnvelope(envelope, 'backup');
  if (preservedFeedbackRuns.length > 0) {
    await rehydrateFeedbackRuns(preservedFeedbackRuns);
  }
  return report;
}

async function snapshotFeedbackRunsForRestore(): Promise<FeedbackRunDetails[]> {
  try {
    return await listFeedbackRunsWithDetails();
  } catch {
    // Best-effort: a DB read failure here shouldn't block the
    // restore itself. The user loses their runs in that case, but
    // they'd have lost them anyway without the snapshot.
    return [];
  }
}

async function rehydrateFeedbackRuns(
  runs: readonly FeedbackRunDetails[],
): Promise<void> {
  for (const run of runs) {
    try {
      await recordFeedbackRun({
        // The practice_sessions + practice_exercises tables were
        // wiped by the reset — null out the FKs so we don't write
        // dangling references. library_item_id stays as-is: the
        // schema requires it NOT NULL and orphaned runs still
        // render in the top-level Feedback tab.
        sessionId: null,
        exerciseId: null,
        libraryItemId: run.libraryItemId,
        endedAt: run.endedAt,
        durationSeconds: run.durationSeconds,
        strictnessPreset: run.strictnessPreset,
        totalNotes: run.totalNotes,
        hitCount: run.hitCount,
        missedCount: run.missedCount,
        extraCount: run.extraCount,
        pitchPerfect: run.pitchPerfect,
        pitchGood: run.pitchGood,
        pitchAcceptable: run.pitchAcceptable,
        pitchWrong: run.pitchWrong,
        timingPerfect: run.timingPerfect,
        timingGood: run.timingGood,
        timingAcceptable: run.timingAcceptable,
        timingWrong: run.timingWrong,
        longestStreak: run.longestStreak,
        overallScore: run.overallScore,
        suggestSlowDown: run.suggestSlowDown,
        suggestStringMuting: run.suggestStringMuting,
        detailsJson: run.detailsJson,
      });
    } catch {
      // Per-row failure: skip and keep going. Losing one run is
      // better than aborting the whole rehydrate mid-way.
    }
  }
}

export async function exportBackupFile(input: {
  includeTabFiles: boolean;
  includeAudioFiles: boolean;
}): Promise<BackupExportResult> {
  const path = await backupFileOps.pickBackupSavePath();
  if (!path) {
    return { status: 'cancelled' };
  }
  const envelope = await exportBackupDTO({
    includeTabFiles: input.includeTabFiles,
    includeAudioFiles: input.includeAudioFiles,
  });
  const json = JSON.stringify(envelope);
  const plaintext = new TextEncoder().encode(json);
  const wrapped = await encodeBackupFile(plaintext);
  const base64 = toBase64(wrapped);
  await backupFileOps.writeFileBase64(path, base64);
  return { status: 'success' };
}

export async function importBackupFile(): Promise<BackupImportResult> {
  const path = await backupFileOps.pickBackupFile();
  if (!path) {
    return { status: 'cancelled' };
  }
  const base64 = await backupFileOps.readFileBase64(path);
  let envelope: PtDataEnvelopeV1;
  try {
    const wrappedBytes = fromBase64(base64);
    const decoded = await decodeBackupFile(wrappedBytes);
    const json = new TextDecoder().decode(decoded);
    envelope = JSON.parse(json) as PtDataEnvelopeV1;
  } catch (err) {
    // Re-throw specific errors from decodeBackupFile so the UI can
    // tell the user why it failed (e.g. legacy backup needing a
    // license key that isn't in localStorage anymore). Unknown
    // errors collapse to `decrypt_failed` for backwards compatibility
    // with existing Settings.vue error handling.
    const message = err instanceof Error ? err.message : String(err);
    if (
      message === 'legacy_backup_needs_license_key' ||
      message === 'unsupported_backup_version' ||
      message === 'invalid_backup_file'
    ) {
      throw err;
    }
    throw new Error('decrypt_failed');
  }

  assertBackupEnvelope(envelope);
  const data = envelope.data;
  const embeddedTabs = data.embeddedTabs ?? [];
  const embeddedAudio = data.embeddedAudio ?? [];
  const hasEmbeddedFiles = embeddedTabs.length > 0 || embeddedAudio.length > 0;
  let resolvedEnvelope = envelope;
  if (hasEmbeddedFiles) {
    const folder = await backupFileOps.pickRestoreFolder();
    if (!folder) {
      return { status: 'cancelled' };
    }
    const tabTargets = buildEmbeddedWriteTargets(embeddedTabs);
    const audioTargets = buildEmbeddedWriteTargets(embeddedAudio);
    const allTargets = [...tabTargets, ...audioTargets];
    await backupFileOps.writeEmbeddedFiles(
      folder,
      allTargets.map((target) => ({
        relativePath: target.relativePath,
        dataBase64: target.dataBase64,
      })),
    );
    const updatedData = applyEmbeddedTabPaths(data, folder, allTargets);
    resolvedEnvelope = {
      ...envelope,
      data: updatedData,
    };
  }

  const report = await restoreBackupEnvelope(resolvedEnvelope);

  if (embeddedAudio.length > 0) {
    await restoreAudioMetadata(embeddedAudio, report.createdIds.libraryItems);
  }

  return { status: 'success', report };
}
