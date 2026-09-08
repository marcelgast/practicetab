import type { LibraryItem } from '../../domain/library';
import { getLibrarySourcePath } from '../../domain/library';
import {
  type PtBackupDataV1,
  type PtEmbeddedAudioDTO,
  type PtDataEnvelopeV1,
  type PtShareDataV1,
} from '../../domain/ptdata';
import type {
  PtBeatmapDTO,
  PtSongMapDTO,
  PtWaveformDTO,
} from '../../domain/ptdata';
import { getStoredWaveform } from '../audioDecodeService';
import { libraryPersistence } from '../libraryPersistence';
import { libraryFileOps } from '../libraryFileOps';
import { practicePersistence } from '../practicePersistence';
import { listFeedbackRunsWithDetails } from '../feedbackRunCommands';
import { beatmapPersistence } from '../beatmapPersistence';
import { songMapPersistence } from '../songMapPersistence';
import {
  isTauriRuntime,
  loadSettings,
  buildEnvelope,
  mapPlan,
  mapExerciseBackup,
  mapExerciseShare,
  mapIntervalBackup,
  mapIntervalShare,
  mapSession,
  mapSessionExercise,
  mapLibraryItem,
  mapBpmHistoryEntry,
  mapFeedbackRun,
  mapLibraryItemStats,
  collectPracticeData,
  filterPracticeForShare,
} from './serializerMappers';

export { importPtDataEnvelope, restoreAudioMetadata } from './serializerImport';

function getAudioBeatmap(itemId: string): PtBeatmapDTO | undefined {
  const entry = beatmapPersistence
    .load()
    .find((e) => e.itemId === itemId && e.status === 'ready' && e.beatmap);
  if (!entry?.beatmap) return undefined;
  const b = entry.beatmap;
  return {
    startBpm: b.startBpm,
    startTimeSigTop: b.startTimeSigTop,
    startTimeSigBottom: b.startTimeSigBottom,
    endBar: b.endBar,
    timeEvents: b.timeEvents.map((e) => ({
      barIndex: e.barIndex,
      bpm: e.bpm,
      timeSigTop: e.timeSigTop,
      timeSigBottom: e.timeSigBottom,
    })),
    loopEvents: b.loopEvents.map((e) => ({
      startBar: e.startBar,
      endBar: e.endBar,
      repeatCount: e.repeatCount,
    })),
    playedBars: b.playedBars.map((e) => ({
      playedBarIndex: e.playedBarIndex,
      notationBarIndex: e.notationBarIndex,
      repeatPass: e.repeatPass,
      playedBarLabel: e.playedBarLabel,
      bpm: e.bpm,
      timeSigTop: e.timeSigTop,
      timeSigBottom: e.timeSigBottom,
    })),
  };
}

async function getAudioSongMap(
  itemId: string,
): Promise<PtSongMapDTO | undefined> {
  try {
    const map = await songMapPersistence.get(itemId);
    if (!map) return undefined;
    return {
      startOffsetMs: map.startOffsetMs,
      sections: map.sections.map((s) => ({
        label: s.label,
        color: s.color,
        timestampMs: s.timestampMs,
        sortOrder: s.sortOrder,
      })),
    };
  } catch {
    return undefined;
  }
}

async function getAudioWaveform(
  itemId: string,
): Promise<PtWaveformDTO | undefined> {
  try {
    const stored = await getStoredWaveform(itemId);
    if (!stored?.peaks?.length) return undefined;
    return {
      peaks: stored.peaks,
      durationMs: stored.durationMs,
      sampleRate: stored.sampleRate,
    };
  } catch {
    return undefined;
  }
}

async function embedLibraryFiles(
  items: LibraryItem[],
  kind: 'tab' | 'audio',
): Promise<{
  tabs: PtBackupDataV1['embeddedTabs'];
  audio: PtEmbeddedAudioDTO[];
}> {
  const tabs: NonNullable<PtBackupDataV1['embeddedTabs']> = [];
  const audio: PtEmbeddedAudioDTO[] = [];
  for (const item of items) {
    const itemKind = item.kind ?? 'tab';
    if (itemKind !== kind) {
      continue;
    }
    const path = getLibrarySourcePath(item.source);
    if (!path) {
      continue;
    }
    try {
      const contentBase64 = await libraryFileOps.readFileBase64(path);
      if (kind === 'tab') {
        tabs.push({
          libraryItemId: item.id,
          fileName: item.metadata.fileName,
          metadata: {
            fileName: item.metadata.fileName,
            size: item.metadata.size,
            modifiedMs: item.metadata.modifiedMs,
            hash: item.metadata.hash,
          },
          contentBase64,
        });
      } else {
        const beatmap = getAudioBeatmap(item.id);
        const songMap = await getAudioSongMap(item.id);
        const waveform = await getAudioWaveform(item.id);
        audio.push({
          libraryItemId: item.id,
          fileName: item.metadata.fileName,
          metadata: {
            fileName: item.metadata.fileName,
            size: item.metadata.size,
            modifiedMs: item.metadata.modifiedMs,
            hash: item.metadata.hash,
          },
          contentBase64,
          ...(beatmap ? { beatmap } : {}),
          ...(songMap ? { songMap } : {}),
          ...(waveform ? { waveform } : {}),
        });
      }
    } catch {
      continue;
    }
  }
  return { tabs, audio };
}

export async function exportBackupDTO(options: {
  includeTabFiles: boolean;
  includeAudioFiles: boolean;
}): Promise<PtDataEnvelopeV1> {
  const { plans, exercises, intervals } = await collectPracticeData();
  const sessions = await practicePersistence.listSessions();
  const sessionDetails = await Promise.all(
    sessions.map(async (session) => {
      try {
        return await practicePersistence.getSessionDetail(session.id);
      } catch {
        return null;
      }
    }),
  );
  const sessionExercises = sessionDetails
    .flatMap((detail) => (detail ? detail.exercises : []))
    .map((entry) => mapSessionExercise(entry));
  const intervalsCompletedTotal =
    await practicePersistence.getIntervalsCompletedTotal();
  const bpmHistory = await practicePersistence.listExerciseBpmHistory();
  const libraryItemStats = await practicePersistence.listLibraryItemStats();
  // Feedback runs with full details_json — wrapped in its own
  // try so a DB read failure here doesn't torpedo the entire
  // backup. The feature is newer than the rest of the stats
  // pipeline and an older DB (pre-v23) could realistically still
  // be in use when a user runs backup for the first time.
  let feedbackRuns: Awaited<ReturnType<typeof listFeedbackRunsWithDetails>> =
    [];
  try {
    feedbackRuns = await listFeedbackRunsWithDetails();
  } catch {
    feedbackRuns = [];
  }
  const settings = loadSettings();
  const allItems = libraryPersistence.load();
  const libraryItems = allItems.map(mapLibraryItem);

  let embeddedTabs: PtBackupDataV1['embeddedTabs'] = undefined;
  let embeddedAudio: PtEmbeddedAudioDTO[] | undefined = undefined;

  if (options.includeTabFiles && isTauriRuntime()) {
    const result = await embedLibraryFiles(allItems, 'tab');
    embeddedTabs = result.tabs;
  }
  if (options.includeAudioFiles && isTauriRuntime()) {
    const result = await embedLibraryFiles(allItems, 'audio');
    embeddedAudio = result.audio;
  }

  const data: PtBackupDataV1 = {
    plans: plans.map((plan) => mapPlan(plan)),
    exercises: exercises.map((exercise) => mapExerciseBackup(exercise)),
    intervals: intervals.map((interval) => mapIntervalBackup(interval)),
    sessions: sessions.map(mapSession),
    sessionExercises,
    intervalsCompletedTotal,
    settings,
    libraryItems,
    bpmHistory: bpmHistory.map(mapBpmHistoryEntry),
    libraryItemStats: libraryItemStats.length
      ? libraryItemStats.map(mapLibraryItemStats)
      : undefined,
    feedbackRuns: feedbackRuns.length
      ? feedbackRuns.map(mapFeedbackRun)
      : undefined,
    embeddedTabs: embeddedTabs?.length ? embeddedTabs : undefined,
    embeddedAudio: embeddedAudio?.length ? embeddedAudio : undefined,
  };

  return buildEnvelope('backup', data);
}

export async function exportShareDTO(input: {
  planId?: string;
  exerciseId?: string;
  includeTabFile: boolean;
  includeAudioFile: boolean;
}): Promise<PtDataEnvelopeV1> {
  const { plans, exercises, intervals } = await collectPracticeData();
  const filtered = filterPracticeForShare(plans, exercises, intervals, input);
  const mappedPlans = filtered.plans.map((plan) => mapPlan(plan));
  const mappedExercises = filtered.exercises.map((exercise) =>
    mapExerciseShare(exercise),
  );
  const mappedIntervals = filtered.intervals.map((interval) =>
    mapIntervalShare(interval),
  );
  const linkedLibraryIds = new Set(
    mappedExercises
      .flatMap((exercise) => [exercise.linkedTabId, exercise.linkedAudioId])
      .filter((value): value is string => Boolean(value)),
  );
  const linkedItems = libraryPersistence
    .load()
    .filter((item) => linkedLibraryIds.has(item.id));
  const libraryItems = linkedItems.map(mapLibraryItem);

  let embeddedTabs: PtShareDataV1['embeddedTabs'] = undefined;
  let embeddedAudio: PtEmbeddedAudioDTO[] | undefined = undefined;

  if (input.includeTabFile && isTauriRuntime()) {
    const result = await embedLibraryFiles(
      linkedItems.filter((item) => (item.kind ?? 'tab') === 'tab'),
      'tab',
    );
    embeddedTabs = result.tabs;
  }
  if (input.includeAudioFile && isTauriRuntime()) {
    const result = await embedLibraryFiles(
      linkedItems.filter((item) => item.kind === 'audio'),
      'audio',
    );
    embeddedAudio = result.audio;
  }

  const data: PtShareDataV1 = {
    shareKind: input.exerciseId ? 'exercise' : 'plan',
    plans: mappedPlans,
    exercises: mappedExercises,
    intervals: mappedIntervals,
    libraryItems,
    embeddedTabs: embeddedTabs?.length ? embeddedTabs : undefined,
    embeddedAudio: embeddedAudio?.length ? embeddedAudio : undefined,
  };

  return buildEnvelope('share', data);
}
