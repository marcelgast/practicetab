import {
  type PracticeSession,
  type PracticeSessionExercise,
} from '../../domain/practice';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/date';
import { getLibrarySourcePath, type LibraryItem } from '../../domain/library';
import { setStoredJson } from '../../domain/storage';
import {
  type ImportReport,
  type PtBackupDataV1,
  type PtBackupPracticeExerciseDTO,
  type PtBackupPracticeIntervalDTO,
  type PtDataEnvelopeV1,
  type PtEmbeddedAudioDTO,
  type PtLibraryItemDTO,
  type PtPracticeSessionDTO,
  type PtPracticeSessionExerciseDTO,
  type PtShareDataV1,
  type PtSharePracticeExerciseDTO,
  type PtSharePracticeIntervalDTO,
} from '../../domain/ptdata';
import { storeWaveform } from '../audioDecodeService';
import { libraryPersistence } from '../libraryPersistence';
import { practicePersistence } from '../practicePersistence';
import { beatmapPersistence } from '../beatmapPersistence';
import { songMapPersistence } from '../songMapPersistence';
import { SETTINGS_STORAGE_KEY } from './serializerMappers';

type ImportExerciseDTO =
  | PtBackupPracticeExerciseDTO
  | PtSharePracticeExerciseDTO;
type ImportIntervalDTO =
  | PtBackupPracticeIntervalDTO
  | PtSharePracticeIntervalDTO;

function createEmptyReport(): ImportReport {
  return {
    createdIds: {
      plans: {},
      exercises: {},
      intervals: {},
      sessions: {},
      sessionExercises: {},
      libraryItems: {},
    },
    missingTabs: [],
    embeddedTabCount: 0,
    embeddedAudioCount: 0,
  };
}

function resolveOrCreateLibraryLinksForShare(
  libraryItems: PtLibraryItemDTO[],
  existing: LibraryItem[],
): {
  mapping: Record<string, string>;
  created: Record<string, string>;
} {
  const mapping: Record<string, string> = {};
  const created: Record<string, string> = {};
  const existingByPath = new Map<string, string>();
  let next = [...existing];
  existing.forEach((item) => {
    const path = getLibrarySourcePath(item.source);
    if (path) {
      existingByPath.set(path, item.id);
    }
  });

  libraryItems.forEach((item) => {
    const path = getLibrarySourcePath(item.source);
    if (path && existingByPath.has(path)) {
      mapping[item.id] = existingByPath.get(path)!;
      return;
    }
    const newId = createId();
    mapping[item.id] = newId;
    created[item.id] = newId;
    next = [
      ...next,
      {
        ...item,
        kind: item.kind ?? 'tab',
        id: newId,
        lastKnownOk: false,
        missingReason: path ? 'not_found' : 'unknown',
      },
    ];
  });

  if (created && Object.keys(created).length > 0) {
    libraryPersistence.save(next);
  }
  return { mapping, created };
}

function mapSessionsForRestore(
  sessions: PtPracticeSessionDTO[],
  sessionExercises: PtPracticeSessionExerciseDTO[],
  sessionIdMap: Record<string, string>,
  exerciseIdMap: Record<string, string>,
): {
  sessions: PracticeSession[];
  sessionExercises: PracticeSessionExercise[];
} {
  return {
    sessions: sessions.map((session) => ({
      id: sessionIdMap[session.id] ?? createId(),
      sessionDate: session.sessionDate,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      totalTimeSpentSeconds: session.totalTimeSpentSeconds,
      // Preserve the v22 playback counters across backup round-trips;
      // pre-v22 archives just omit them and we fall through to 0.
      totalPlaybackSeconds: session.totalPlaybackSeconds ?? 0,
      // Session Journal fields (PR 4.3). Round-trip verbatim when
      // present; pre-v24 backups leave them undefined → DB NULL.
      goalText: session.goalText ?? null,
      reviewText: session.reviewText ?? null,
      goalPercent: session.goalPercent ?? null,
      goalReached: session.goalReached ?? null,
      createdAt: session.createdAt,
    })),
    sessionExercises: sessionExercises.map((entry) => ({
      id: createId(),
      sessionId: sessionIdMap[entry.sessionId],
      exerciseId: exerciseIdMap[entry.exerciseId],
      timeSpentSeconds: entry.timeSpentSeconds,
      playbackTimeSeconds: entry.playbackTimeSeconds ?? 0,
      createdAt: entry.createdAt,
    })),
  };
}

export async function importPtDataEnvelope(
  envelope: PtDataEnvelopeV1,
  mode: 'backup' | 'share',
  options?: { planOverrides?: Record<string, string> },
): Promise<ImportReport> {
  if (envelope.format !== 'ptdata' || envelope.formatVersion !== 1) {
    throw new Error('unsupported_ptdata_format');
  }
  if (envelope.kind !== mode) {
    throw new Error('ptdata_mode_mismatch');
  }

  const report = createEmptyReport();
  const data = envelope.data;
  const backupData = mode === 'backup' ? (data as PtBackupDataV1) : null;
  const shareData = mode === 'share' ? (data as PtShareDataV1) : null;
  const libraryItems = (backupData ?? shareData)!.libraryItems;

  let libraryMapping: Record<string, string> = {};
  if (mode === 'backup') {
    const existing = libraryPersistence.load();
    const mapped: Record<string, string> = {};
    const next = [...existing];
    libraryItems.forEach((item) => {
      const newId = createId();
      mapped[item.id] = newId;
      next.push({
        ...item,
        kind: item.kind ?? 'tab',
        id: newId,
      });
    });
    libraryPersistence.save(next);
    libraryMapping = mapped;
    report.createdIds.libraryItems = mapped;
  } else {
    const existing = libraryPersistence.load();
    const resolved = resolveOrCreateLibraryLinksForShare(
      libraryItems,
      existing,
    );
    libraryMapping = resolved.mapping;
    report.createdIds.libraryItems = resolved.created;
  }

  const plans = (backupData ?? shareData)!.plans;
  const exercises = (backupData ?? shareData)!.exercises;
  const intervals = (backupData ?? shareData)!.intervals;

  const plansSorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const plan of plansSorted) {
    const overrideId = options?.planOverrides?.[plan.id];
    if (overrideId) {
      report.createdIds.plans[plan.id] = overrideId;
      continue;
    }
    const created = await practicePersistence.createPracticePlan(
      plan.title,
      plan.timed,
    );
    report.createdIds.plans[plan.id] = created.id;
  }

  const exercisesByPlan = new Map<string, ImportExerciseDTO[]>();
  exercises.forEach((exercise) => {
    const bucket = exercisesByPlan.get(exercise.planId) ?? [];
    bucket.push(exercise);
    exercisesByPlan.set(exercise.planId, bucket);
  });

  for (const [planId, list] of exercisesByPlan.entries()) {
    const newPlanId = report.createdIds.plans[planId];
    const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const exercise of sorted) {
      const created = await practicePersistence.createExercise(newPlanId, {
        title: exercise.title,
        timePlannedMinutes: exercise.timePlannedMinutes ?? null,
        bpm: exercise.bpm ?? undefined,
        notes: exercise.notes ?? null,
      });
      report.createdIds.exercises[exercise.id] = created.id;
      if (exercise.intervalAuto === false) {
        await practicePersistence.updateExercise(created.id, {
          intervalAuto: false,
        });
      }
      const preferredSource =
        'preferredSource' in exercise ? exercise.preferredSource : undefined;
      if (
        preferredSource === 'tab' ||
        preferredSource === 'audio' ||
        preferredSource === 'both'
      ) {
        await practicePersistence.updateExercise(created.id, {
          preferredSource,
        });
      }
      const linkedTabId =
        exercise.linkedTabId ?? exercise.linkedLibraryItemId ?? null;
      const linkedAudioId = exercise.linkedAudioId ?? null;
      if (linkedTabId) {
        const mapped = libraryMapping[linkedTabId];
        if (mapped) {
          await practicePersistence.linkExerciseToLibraryItem(
            created.id,
            mapped,
          );
        }
      }
      if (linkedAudioId) {
        const mapped = libraryMapping[linkedAudioId];
        if (mapped) {
          await practicePersistence.linkExerciseToAudio(created.id, mapped);
        }
      }
    }
    const orderedIds = sorted.map(
      (exercise) => report.createdIds.exercises[exercise.id],
    );
    await practicePersistence.reorderExercises(newPlanId, orderedIds);
  }

  const intervalsByExercise = new Map<string, ImportIntervalDTO[]>();
  intervals.forEach((interval) => {
    const bucket = intervalsByExercise.get(interval.exerciseId) ?? [];
    bucket.push(interval);
    intervalsByExercise.set(interval.exerciseId, bucket);
  });

  for (const [exerciseId, list] of intervalsByExercise.entries()) {
    const newExerciseId = report.createdIds.exercises[exerciseId];
    const sorted = [...list].sort((a, b) => a.sortIndex - b.sortIndex);
    for (const interval of sorted) {
      const created = await practicePersistence.createInterval(newExerciseId, {
        name: interval.name ?? null,
        durationSeconds: interval.durationSeconds,
        sortIndex: interval.sortIndex,
        bpm: interval.bpm ?? null,
      });
      report.createdIds.intervals[interval.id] = created.id;
      const done =
        'done' in interval && typeof interval.done === 'boolean'
          ? interval.done
          : false;
      if (done) {
        await practicePersistence.updateInterval(created.id, { done: true });
      }
    }
    const orderedIds = sorted.map(
      (interval) => report.createdIds.intervals[interval.id],
    );
    await practicePersistence.reorderIntervals(newExerciseId, orderedIds);
  }

  if (mode === 'backup' && backupData) {
    if (backupData.settings) {
      setStoredJson(SETTINGS_STORAGE_KEY, backupData.settings);
    }
    const sessionIdMap: Record<string, string> = {};
    backupData.sessions.forEach((session) => {
      sessionIdMap[session.id] = createId();
    });
    report.createdIds.sessions = sessionIdMap;
    const sessionExerciseIdMap: Record<string, string> = {};
    backupData.sessionExercises.forEach((entry) => {
      sessionExerciseIdMap[entry.id] = createId();
    });
    report.createdIds.sessionExercises = sessionExerciseIdMap;
    const mapped = mapSessionsForRestore(
      backupData.sessions,
      backupData.sessionExercises,
      sessionIdMap,
      report.createdIds.exercises,
    );
    const exerciseTotals = backupData.exercises.map((exercise) => ({
      exerciseId: report.createdIds.exercises[exercise.id],
      totalTimeSpentSeconds: exercise.totalTimeSpentSeconds,
    }));
    const mappedBpmHistory = (backupData.bpmHistory ?? [])
      .filter((entry) => report.createdIds.exercises[entry.exerciseId])
      .map((entry) => ({
        ...entry,
        id: createId(),
        exerciseId: report.createdIds.exercises[entry.exerciseId],
      }));
    const mappedLibraryItemStats = (backupData.libraryItemStats ?? [])
      .filter((entry) => libraryMapping[entry.libraryItemId])
      .map((entry) => ({
        ...entry,
        libraryItemId: libraryMapping[entry.libraryItemId],
      }));
    // Feedback runs: remap the ids that reference the post-restore
    // world. `library_item_id` is the only strictly-required link
    // (schema NOT NULL + runs with no matching library import are
    // dropped rather than error-out — their library target vanished
    // during the backup cycle anyway). `exerciseId` and `sessionId`
    // are nullable on the schema, so a missing mapping simply falls
    // back to null — the run survives without a broken FK.
    const mappedFeedbackRuns = (backupData.feedbackRuns ?? [])
      .filter((run) => libraryMapping[run.libraryItemId])
      .map((run) => ({
        ...run,
        libraryItemId: libraryMapping[run.libraryItemId],
        exerciseId: run.exerciseId
          ? (report.createdIds.exercises[run.exerciseId] ?? null)
          : null,
        sessionId: run.sessionId ? (sessionIdMap[run.sessionId] ?? null) : null,
      }));
    await practicePersistence.restorePracticeStats({
      sessions: mapped.sessions,
      sessionExercises: mapped.sessionExercises,
      exerciseTotals,
      intervalsCompletedTotal: backupData.intervalsCompletedTotal ?? 0,
      bpmHistory: mappedBpmHistory,
      libraryItemStats: mappedLibraryItemStats.length
        ? mappedLibraryItemStats
        : undefined,
      feedbackRuns: mappedFeedbackRuns.length ? mappedFeedbackRuns : undefined,
    });
  }

  report.embeddedTabCount =
    backupData?.embeddedTabs?.length ?? shareData?.embeddedTabs?.length ?? 0;
  report.embeddedAudioCount =
    backupData?.embeddedAudio?.length ?? shareData?.embeddedAudio?.length ?? 0;
  return report;
}

/**
 * Restore beatmaps and song maps for imported audio items.
 * Waveform computation is handled on-demand by PlayerPanel when
 * the song is first loaded — no need to precompute during import.
 */
export async function restoreAudioMetadata(
  embeddedAudio: PtEmbeddedAudioDTO[],
  libraryIdMapping: Record<string, string>,
): Promise<void> {
  for (const audio of embeddedAudio) {
    const newId = libraryIdMapping[audio.libraryItemId];
    if (!newId) continue;

    // Restore beatmap
    if (audio.beatmap) {
      const entries = beatmapPersistence.load();
      const existing = entries.findIndex((e) => e.itemId === newId);
      const entry = {
        itemId: newId,
        status: 'ready' as const,
        fingerprint: `${audio.metadata.size}:${audio.metadata.modifiedMs}:${audio.metadata.fileName}`,
        updatedAt: nowIso(),
        beatmap: audio.beatmap,
      };
      if (existing >= 0) {
        entries[existing] = entry;
      } else {
        entries.push(entry);
      }
      beatmapPersistence.save(entries);
    }

    // Restore song map
    if (audio.songMap) {
      try {
        await songMapPersistence.save(newId, {
          startOffsetMs: audio.songMap.startOffsetMs,
          sections: audio.songMap.sections,
        });
      } catch {
        // Song map restore is non-critical
      }
    }

    // Restore waveform
    if (audio.waveform) {
      try {
        await storeWaveform(
          newId,
          audio.waveform.peaks,
          audio.waveform.durationMs,
          audio.waveform.sampleRate,
        );
      } catch {
        // Waveform restore is non-critical
      }
    }
  }
}
