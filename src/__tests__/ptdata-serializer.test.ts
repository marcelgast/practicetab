// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, keys));
    return keys;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      keys.add(key);
      collectKeys(entry, keys);
    });
  }
  return keys;
}

describe('ptdata serializer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T10:00:00.000Z'));
  });

  it('exports backups without license or device fields', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportBackupDTO } = await import('../services/ptdata/serializer');

    localStorage.setItem(
      'practicetab.license',
      JSON.stringify({ licenseKey: 'KEY-123', deviceId: 'device-1' }),
    );
    localStorage.setItem(
      'practicetab.trial',
      JSON.stringify({ deviceId: 'device-1', startedAt: '2024-01-01' }),
    );

    const plan = await practicePersistence.createPracticePlan('Focus', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Warmups',
      timePlannedMinutes: 10,
    });
    await practicePersistence.createInterval(exercise.id, {
      durationSeconds: 30,
      sortIndex: 0,
      bpm: 90,
    });

    const now = new Date().toISOString();
    libraryPersistence.save([
      {
        id: 'lib-1',
        title: 'Song',
        source: { kind: 'reference', path: '/tabs/song.gp5' },
        metadata: { fileName: 'song.gp5', size: 100, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
    ]);

    const envelope = await exportBackupDTO({
      includeTabFiles: false,
      includeAudioFiles: false,
    });
    const keys = collectKeys(envelope);

    expect(keys.has('licenseKey')).toBe(false);
    expect(keys.has('deviceId')).toBe(false);
    expect(keys.has('trial')).toBe(false);
  });

  it('exports share payloads without stats or settings', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportShareDTO } = await import('../services/ptdata/serializer');

    const plan = await practicePersistence.createPracticePlan('Share', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Etude',
      timePlannedMinutes: 20,
      bpm: 120,
    });
    await practicePersistence.linkExerciseToLibraryItem(exercise.id, 'lib-1');
    await practicePersistence.createInterval(exercise.id, {
      durationSeconds: 45,
      sortIndex: 0,
      bpm: 120,
    });

    const now = new Date().toISOString();
    libraryPersistence.save([
      {
        id: 'lib-1',
        title: 'Etude',
        source: { kind: 'reference', path: '/tabs/etude.gp5' },
        metadata: { fileName: 'etude.gp5', size: 200, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
    ]);

    const envelope = await exportShareDTO({
      planId: plan.id,
      includeTabFile: false,
      includeAudioFile: false,
    });
    const data = envelope.data as {
      exercises: Array<Record<string, unknown>>;
      shareKind?: string;
    };
    const keys = collectKeys(envelope);

    expect(keys.has('settings')).toBe(false);
    expect(keys.has('sessions')).toBe(false);
    expect(keys.has('intervalsCompletedTotal')).toBe(false);
    expect(keys.has('licenseKey')).toBe(false);
    expect(keys.has('deviceId')).toBe(false);
    expect(data.shareKind).toBe('plan');
    expect(
      data.exercises.some((exercise) =>
        Object.prototype.hasOwnProperty.call(exercise, 'totalTimeSpentSeconds'),
      ),
    ).toBe(false);
  });

  it('imports without overwriting existing ids', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { importPtDataEnvelope } =
      await import('../services/ptdata/serializer');

    const existing = await practicePersistence.createPracticePlan(
      'Existing',
      false,
    );

    const envelope = {
      format: 'ptdata',
      formatVersion: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      kind: 'share',
      data: {
        plans: [
          {
            id: existing.id,
            title: 'Imported Plan',
            timed: false,
            sortOrder: 0,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        exercises: [
          {
            id: 'exercise-1',
            planId: existing.id,
            title: 'Exercise',
            sortOrder: 0,
            timePlannedMinutes: 5,
            intervalAuto: true,
            linkedTabId: null,
            linkedAudioId: null,
            bpm: 100,
            notes: null,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        intervals: [
          {
            id: 'interval-1',
            exerciseId: 'exercise-1',
            name: 'Warmup',
            durationSeconds: 30,
            bpm: 100,
            sortIndex: 0,
            createdAt: 0,
          },
        ],
        libraryItems: [],
      },
    } as const;

    const report = await importPtDataEnvelope(envelope, 'share');
    const plans = await practicePersistence.listPracticePlans();

    expect(plans.some((plan) => plan.id === existing.id)).toBe(true);
    expect(report.createdIds.plans[existing.id]).toBeTruthy();
    expect(report.createdIds.plans[existing.id]).not.toBe(existing.id);
    expect(plans).toHaveLength(2);
  });

  it('imports linked tabs without prompting when share references are missing', async () => {
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { importPtDataEnvelope } =
      await import('../services/ptdata/serializer');
    const { practicePersistence } =
      await import('../services/practicePersistence');

    const now = new Date().toISOString();
    libraryPersistence.save([
      {
        id: 'lib-existing',
        title: 'Existing',
        source: { kind: 'reference', path: '/tabs/existing.gp5' },
        metadata: { fileName: 'existing.gp5', size: 100, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
    ]);

    const envelope = {
      format: 'ptdata',
      formatVersion: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      kind: 'share',
      data: {
        plans: [
          {
            id: 'plan-1',
            title: 'Imported Plan',
            timed: false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          },
        ],
        exercises: [
          {
            id: 'exercise-1',
            planId: 'plan-1',
            title: 'Exercise',
            sortOrder: 0,
            timePlannedMinutes: 15,
            intervalAuto: true,
            linkedTabId: 'lib-missing',
            linkedAudioId: null,
            bpm: 90,
            notes: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        intervals: [
          {
            id: 'interval-1',
            exerciseId: 'exercise-1',
            name: null,
            durationSeconds: 60,
            bpm: null,
            sortIndex: 0,
            createdAt: 0,
          },
        ],
        libraryItems: [
          {
            id: 'lib-missing',
            title: 'Missing Song',
            source: { kind: 'reference', path: '/tabs/missing.gp5' },
            metadata: { fileName: 'missing.gp5', size: 120, modifiedMs: 0 },
            createdAt: now,
            updatedAt: now,
            lastKnownOk: true,
          },
        ],
      },
    } as const;

    const report = await importPtDataEnvelope(envelope, 'share');
    const plans = await practicePersistence.listPracticePlans();
    const importedExercise = plans[0]?.exercises[0];
    const savedItems = libraryPersistence.load();

    expect(report.missingTabs).toHaveLength(0);
    expect(importedExercise?.linkedTabId).toBeTruthy();
    expect(
      savedItems.some((item) => item.metadata.fileName === 'missing.gp5'),
    ).toBe(true);
  });

  it('share export without audio produces no embeddedAudio key', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportShareDTO } = await import('../services/ptdata/serializer');

    const plan = await practicePersistence.createPracticePlan('NoAudio', false);
    await practicePersistence.createExercise(plan.id, {
      title: 'Tab Only',
      timePlannedMinutes: 5,
    });

    const now = new Date().toISOString();
    libraryPersistence.save([
      {
        id: 'lib-tab',
        title: 'Tab',
        source: { kind: 'reference', path: '/tabs/tab.gp5' },
        metadata: { fileName: 'tab.gp5', size: 100, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
    ]);

    const envelope = await exportShareDTO({
      planId: plan.id,
      includeTabFile: false,
      includeAudioFile: false,
    });
    const data = envelope.data as {
      libraryItems: Array<Record<string, unknown>>;
      embeddedAudio?: unknown;
    };
    expect(data.embeddedAudio).toBeUndefined();
    // Tab-only library items should not have a kind field
    for (const item of data.libraryItems) {
      expect(item.kind).toBeUndefined();
    }
  });

  it('backup export includes kind for audio library items', async () => {
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportBackupDTO } = await import('../services/ptdata/serializer');

    const now = new Date().toISOString();
    libraryPersistence.save([
      {
        id: 'lib-tab',
        title: 'Tab',
        source: { kind: 'reference', path: '/tabs/tab.gp5' },
        metadata: { fileName: 'tab.gp5', size: 100, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
      {
        id: 'lib-audio',
        kind: 'audio',
        title: 'Song',
        source: { kind: 'reference', path: '/music/song.mp3' },
        metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
    ]);

    const envelope = await exportBackupDTO({
      includeTabFiles: false,
      includeAudioFiles: false,
    });
    const data = envelope.data as {
      libraryItems: Array<{ id: string; kind?: string }>;
    };
    const tabItem = data.libraryItems.find((item) => item.id === 'lib-tab');
    const audioItem = data.libraryItems.find((item) => item.id === 'lib-audio');

    expect(tabItem?.kind).toBeUndefined();
    expect(audioItem?.kind).toBe('audio');
  });

  it('import report includes embeddedAudioCount', async () => {
    const { importPtDataEnvelope } =
      await import('../services/ptdata/serializer');

    const envelope = {
      format: 'ptdata',
      formatVersion: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      kind: 'share',
      data: {
        plans: [
          {
            id: 'plan-1',
            title: 'Test',
            timed: false,
            sortOrder: 0,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        exercises: [],
        intervals: [],
        libraryItems: [],
        embeddedAudio: [
          {
            libraryItemId: 'lib-audio-1',
            fileName: 'song.mp3',
            metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 0 },
            contentBase64: 'AAAA',
          },
        ],
      },
    } as const;

    const report = await importPtDataEnvelope(envelope, 'share');
    expect(report.embeddedAudioCount).toBe(1);
    expect(report.embeddedTabCount).toBe(0);
  });

  it('restoreAudioMetadata restores beatmap entries', async () => {
    const { restoreAudioMetadata } =
      await import('../services/ptdata/serializer');
    const { beatmapPersistence } =
      await import('../services/beatmapPersistence');

    const embeddedAudio = [
      {
        libraryItemId: 'orig-audio-1',
        fileName: 'song.mp3',
        metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 0 },
        contentBase64: 'AAAA',
        beatmap: {
          startBpm: 120,
          startTimeSigTop: 4,
          startTimeSigBottom: 4,
          endBar: 32,
          timeEvents: [
            { barIndex: 1, bpm: 120, timeSigTop: 4, timeSigBottom: 4 },
          ],
          loopEvents: [],
          playedBars: [],
        },
      },
    ];
    const libraryIdMapping = { 'orig-audio-1': 'new-audio-1' };

    await restoreAudioMetadata(embeddedAudio, libraryIdMapping);

    const entries = beatmapPersistence.load();
    const restored = entries.find((e) => e.itemId === 'new-audio-1');
    expect(restored).toBeTruthy();
    expect(restored?.status).toBe('ready');
    expect(restored?.beatmap?.startBpm).toBe(120);
    expect(restored?.beatmap?.timeEvents).toHaveLength(1);
  });

  it('restoreAudioMetadata restores waveform via storeWaveform', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(invoke);
    const { restoreAudioMetadata } =
      await import('../services/ptdata/serializer');

    const embeddedAudio = [
      {
        libraryItemId: 'orig-audio-1',
        fileName: 'song.mp3',
        metadata: { fileName: 'song.mp3', size: 5000, modifiedMs: 0 },
        contentBase64: 'AAAA',
        waveform: {
          peaks: [0.1, 0.5, 0.3],
          durationMs: 180000,
          sampleRate: 44100,
        },
      },
    ];
    const libraryIdMapping = { 'orig-audio-1': 'new-audio-1' };

    await restoreAudioMetadata(embeddedAudio, libraryIdMapping);

    const storeCall = mockInvoke.mock.calls.find(
      ([cmd]) => cmd === 'waveform_store',
    );
    expect(storeCall).toBeTruthy();
    expect(storeCall?.[1]).toEqual({
      libraryItemId: 'new-audio-1',
      peaks: [0.1, 0.5, 0.3],
      durationMs: 180000,
      sampleRate: 44100,
    });
  });

  it('preserves preferredSource in share export and import', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportShareDTO, importPtDataEnvelope } =
      await import('../services/ptdata/serializer');

    const now = new Date().toISOString();
    libraryPersistence.save([
      {
        id: 'tab-1',
        title: 'Tab',
        source: { kind: 'reference', path: '/tabs/tab.gp5' },
        metadata: { fileName: 'tab.gp5', size: 100, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
      {
        id: 'audio-1',
        kind: 'audio' as const,
        title: 'Audio',
        source: { kind: 'reference', path: '/audio/track.mp3' },
        metadata: { fileName: 'track.mp3', size: 5000, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
    ]);

    const plan = await practicePersistence.createPracticePlan('Test', false);
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Dual',
      timePlannedMinutes: 10,
    });
    await practicePersistence.linkExerciseToLibraryItem(exercise.id, 'tab-1');
    await practicePersistence.linkExerciseToAudio(exercise.id, 'audio-1');
    await practicePersistence.updateExercise(exercise.id, {
      preferredSource: 'audio',
    });

    const envelope = await exportShareDTO({
      planId: plan.id,
      includeTabFile: false,
      includeAudioFile: false,
    });
    const data = envelope.data as {
      exercises: Array<{ preferredSource?: string | null }>;
    };
    expect(data.exercises[0].preferredSource).toBe('audio');

    // Import and verify preferredSource is restored
    const report = await importPtDataEnvelope(envelope, 'share');
    const plans = await practicePersistence.listPracticePlans();
    const imported = plans.find((p) =>
      p.exercises.some(
        (e) => e.id === report.createdIds.exercises[exercise.id],
      ),
    );
    const importedExercise = imported?.exercises.find(
      (e) => e.id === report.createdIds.exercises[exercise.id],
    );
    expect(importedExercise?.preferredSource).toBe('audio');
  });

  it('round-trips the v22 playback counters through backup export/import', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportBackupDTO, importPtDataEnvelope } =
      await import('../services/ptdata/serializer');

    const plan = await practicePersistence.createPracticePlan(
      'Backup Round-trip',
      false,
    );
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Scales',
      timePlannedMinutes: 10,
    });
    libraryPersistence.save([]);

    // Populate all three timer counters: session global time, per-exercise
    // expansion time, and per-exercise playback time (plus a bucket of
    // session-level playback with no exercise attached).
    await practicePersistence.startSessionIfNeeded();
    await practicePersistence.addSessionTime(600);
    await practicePersistence.addExerciseTime(exercise.id, 120);
    await practicePersistence.addPlaybackTime(exercise.id, 90);
    await practicePersistence.addPlaybackTime(null, 45);

    const envelope = await exportBackupDTO({
      includeTabFiles: false,
      includeAudioFiles: false,
    });
    const data = envelope.data as {
      sessions: Array<{
        id: string;
        totalTimeSpentSeconds: number;
        totalPlaybackSeconds?: number;
      }>;
      sessionExercises: Array<{
        exerciseId: string;
        timeSpentSeconds: number;
        playbackTimeSeconds?: number;
      }>;
    };

    // Export carries the playback counters (regression for the silent
    // data-loss bug where they were absent from the DTO entirely).
    expect(data.sessions[0].totalTimeSpentSeconds).toBe(600);
    // 90 playback for the exercise + 45 playback session-only = 135.
    expect(data.sessions[0].totalPlaybackSeconds).toBe(135);
    const exerciseEntry = data.sessionExercises.find(
      (e) => e.exerciseId === exercise.id,
    );
    expect(exerciseEntry?.timeSpentSeconds).toBe(120);
    expect(exerciseEntry?.playbackTimeSeconds).toBe(90);

    // Import round-trip: both counters survive into the restored session.
    const report = await importPtDataEnvelope(envelope, 'backup');
    expect(report.createdIds.sessions).toBeDefined();
    const sessions = await practicePersistence.listSessions();
    const restored = sessions.find(
      (s) => s.id !== data.sessions[0].id && s.totalTimeSpentSeconds === 600,
    );
    expect(restored).toBeDefined();
    expect(restored!.totalPlaybackSeconds).toBe(135);
    const activeDetail = await practicePersistence.getSessionDetail(
      restored!.id,
    );
    const restoredEntry = activeDetail.exercises.find(
      (entry) => entry.timeSpentSeconds === 120,
    );
    expect(restoredEntry).toBeDefined();
    expect(restoredEntry!.playbackTimeSeconds).toBe(90);
  });

  it('defaults playback counters to 0 when importing older archives that pre-date them', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { importPtDataEnvelope } =
      await import('../services/ptdata/serializer');

    const plan = await practicePersistence.createPracticePlan(
      'Legacy import',
      false,
    );
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Legacy ex',
      timePlannedMinutes: 10,
    });

    // Simulate a pre-v22 archive: no totalPlaybackSeconds / playbackTimeSeconds.
    const envelope = {
      format: 'ptdata' as const,
      formatVersion: 1 as const,
      createdAt: '2025-01-01T00:00:00.000Z',
      kind: 'backup' as const,
      data: {
        plans: [],
        exercises: [],
        intervals: [],
        sessions: [
          {
            id: 'legacy-session',
            sessionDate: '2025-01-01',
            startedAt: '2025-01-01T10:00:00Z',
            endedAt: null,
            totalTimeSpentSeconds: 300,
            createdAt: '2025-01-01T10:00:00Z',
          },
        ],
        sessionExercises: [
          {
            id: 'legacy-entry',
            sessionId: 'legacy-session',
            exerciseId: exercise.id,
            timeSpentSeconds: 60,
            createdAt: '2025-01-01T10:00:00Z',
          },
        ],
        intervalsCompletedTotal: 0,
        settings: {},
        libraryItems: [],
      },
    };

    const report = await importPtDataEnvelope(envelope, 'backup');
    const sessions = await practicePersistence.listSessions();
    const restored = sessions.find(
      (s) => report.createdIds.sessions['legacy-session'] === s.id,
    );
    expect(restored).toBeDefined();
    expect(restored!.totalPlaybackSeconds).toBe(0);
    const detail = await practicePersistence.getSessionDetail(restored!.id);
    expect(detail.exercises[0].playbackTimeSeconds).toBe(0);
  });

  it('backup export includes bpmHistory entries', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportBackupDTO } = await import('../services/ptdata/serializer');

    const plan = await practicePersistence.createPracticePlan(
      'BPM Test',
      false,
    );
    const exercise = await practicePersistence.createExercise(plan.id, {
      title: 'Speed Drill',
      timePlannedMinutes: 10,
      bpm: 100,
    });

    libraryPersistence.save([]);

    await practicePersistence.recordExerciseBpm(exercise.id, 120);

    const envelope = await exportBackupDTO({
      includeTabFiles: false,
      includeAudioFiles: false,
    });
    const data = envelope.data as {
      bpmHistory?: Array<{
        id: string;
        exerciseId: string;
        bpm: number;
        sessionDate: string;
        recordedAt: string;
      }>;
    };

    expect(data.bpmHistory).toBeDefined();
    expect(data.bpmHistory!.length).toBeGreaterThanOrEqual(1);
    const entry = data.bpmHistory!.find((e) => e.exerciseId === exercise.id);
    expect(entry).toBeTruthy();
    expect(entry!.bpm).toBe(120);
    expect(entry!.sessionDate).toBeTruthy();
    expect(entry!.recordedAt).toBeTruthy();
  });

  it('backup export includes libraryItemStats when present', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { libraryPersistence } =
      await import('../services/libraryPersistence');
    const { exportBackupDTO } = await import('../services/ptdata/serializer');

    const now = new Date().toISOString();
    libraryPersistence.save([
      {
        id: 'lib-1',
        title: 'Song',
        source: { kind: 'reference', path: '/tabs/song.gp5' },
        metadata: { fileName: 'song.gp5', size: 100, modifiedMs: 0 },
        createdAt: now,
        updatedAt: now,
        lastKnownOk: true,
      },
    ]);

    await practicePersistence.recordLibraryItemTime('lib-1', 120);
    await practicePersistence.incrementLibraryItemPlayCount('lib-1');

    const envelope = await exportBackupDTO({
      includeTabFiles: false,
      includeAudioFiles: false,
    });
    const data = envelope.data as {
      libraryItemStats?: Array<{
        libraryItemId: string;
        playCount: number;
        totalTimeSeconds: number;
        loopCount: number;
        lastPlayedAt: string | null;
      }>;
    };

    expect(data.libraryItemStats).toBeDefined();
    expect(data.libraryItemStats!.length).toBeGreaterThanOrEqual(1);
    const entry = data.libraryItemStats!.find(
      (e) => e.libraryItemId === 'lib-1',
    );
    expect(entry).toBeTruthy();
    expect(entry!.playCount).toBe(1);
    expect(entry!.totalTimeSeconds).toBe(120);
    expect(entry!.loopCount).toBe(0);
  });

  it('imports share exercises into an existing plan when overridden', async () => {
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { importPtDataEnvelope } =
      await import('../services/ptdata/serializer');

    const existing = await practicePersistence.createPracticePlan(
      'Existing',
      false,
    );
    const now = new Date().toISOString();
    const envelope = {
      format: 'ptdata',
      formatVersion: 1,
      createdAt: now,
      kind: 'share',
      data: {
        plans: [
          {
            id: 'plan-1',
            title: 'Imported Plan',
            timed: false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          },
        ],
        exercises: [
          {
            id: 'exercise-1',
            planId: 'plan-1',
            title: 'Exercise',
            sortOrder: 0,
            timePlannedMinutes: 10,
            intervalAuto: true,
            linkedTabId: null,
            linkedAudioId: null,
            bpm: 110,
            notes: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        intervals: [],
        libraryItems: [],
      },
    } as const;

    const report = await importPtDataEnvelope(envelope, 'share', {
      planOverrides: { 'plan-1': existing.id },
    });
    const plans = await practicePersistence.listPracticePlans();

    expect(plans).toHaveLength(1);
    expect(report.createdIds.plans['plan-1']).toBe(existing.id);
    expect(plans[0].exercises).toHaveLength(1);
    expect(plans[0].exercises[0].title).toBe('Exercise');
  });
});

describe('feedback runs backup mapping', () => {
  it('mapFeedbackRun drops the auto-increment id and preserves every other field', async () => {
    // Pins the DTO contract. If `FeedbackRunDetails` or
    // `PtFeedbackRunDTO` ever diverge in field names the existing
    // set, this test fails — and the restore round-trip would
    // silently break since the Rust `FeedbackRunInsert` shape is
    // also checked against the DTO on the importer side.
    const { mapFeedbackRun } =
      await import('../services/ptdata/serializerMappers');
    const mapped = mapFeedbackRun({
      id: 42, // ← must be stripped
      sessionId: 'session-123',
      exerciseId: 'ex-1',
      libraryItemId: 'lib-1',
      endedAt: '2025-04-22T12:00:00Z',
      durationSeconds: 180,
      strictnessPreset: 'intermediate',
      totalNotes: 100,
      hitCount: 85,
      missedCount: 10,
      extraCount: 5,
      pitchPerfect: 40,
      pitchGood: 30,
      pitchAcceptable: 10,
      pitchWrong: 5,
      timingPerfect: 35,
      timingGood: 30,
      timingAcceptable: 15,
      timingWrong: 5,
      longestStreak: 12,
      overallScore: 78,
      suggestSlowDown: false,
      suggestStringMuting: false,
      detailsJson:
        '[{"t":0,"n":"E4","o":"hit","pa":"perfect","co":0,"ta":"perfect","to":0}]',
    });
    expect((mapped as unknown as { id?: unknown }).id).toBeUndefined();
    expect(mapped.sessionId).toBe('session-123');
    expect(mapped.exerciseId).toBe('ex-1');
    expect(mapped.libraryItemId).toBe('lib-1');
    expect(mapped.endedAt).toBe('2025-04-22T12:00:00Z');
    expect(mapped.strictnessPreset).toBe('intermediate');
    expect(mapped.overallScore).toBe(78);
    expect(mapped.longestStreak).toBe(12);
    expect(mapped.detailsJson).toContain('"o":"hit"');
  });

  it('importer remaps feedback-run library / exercise / session ids to their restored equivalents', async () => {
    // Restore-side integrity: after a backup cycle every FK that
    // points into practice data (library_item_id, exercise_id,
    // session_id) must be rewritten to the newly-minted id in the
    // target DB. Runs whose library_item_id has no mapping are
    // dropped — NOT_NULL on the DB, and we don't want a silent FK
    // break.
    const { practicePersistence } =
      await import('../services/practicePersistence');
    const { importPtDataEnvelope } =
      await import('../services/ptdata/serializer');
    const restoreSpy = vi
      .spyOn(practicePersistence, 'restorePracticeStats')
      .mockResolvedValue();

    const now = '2025-04-22T10:00:00Z';
    const envelope = {
      format: 'ptdata' as const,
      formatVersion: 1 as const,
      kind: 'backup' as const,
      createdAt: now,
      data: {
        plans: [
          {
            id: 'plan-src',
            title: 'P',
            timed: false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          },
        ],
        exercises: [
          {
            id: 'ex-src',
            planId: 'plan-src',
            title: 'Ex',
            sortOrder: 0,
            timePlannedMinutes: null,
            intervalAuto: true,
            totalTimeSpentSeconds: 0,
            bpm: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        intervals: [],
        sessions: [],
        sessionExercises: [],
        intervalsCompletedTotal: 0,
        settings: {},
        libraryItems: [
          {
            id: 'lib-src',
            title: 'Song',
            source: { kind: 'reference' as const, path: '/tabs/song.gp5' },
            metadata: { fileName: 'song.gp5', size: 100, modifiedMs: 0 },
            createdAt: now,
            updatedAt: now,
            lastKnownOk: true,
          },
        ],
        feedbackRuns: [
          // Run 1: fully linkable — all three references should remap.
          {
            sessionId: null,
            exerciseId: 'ex-src',
            libraryItemId: 'lib-src',
            endedAt: now,
            durationSeconds: 60,
            strictnessPreset: 'intermediate',
            totalNotes: 10,
            hitCount: 8,
            missedCount: 2,
            extraCount: 0,
            pitchPerfect: 5,
            pitchGood: 2,
            pitchAcceptable: 1,
            pitchWrong: 0,
            timingPerfect: 4,
            timingGood: 3,
            timingAcceptable: 1,
            timingWrong: 0,
            longestStreak: 6,
            overallScore: 80,
            suggestSlowDown: false,
            suggestStringMuting: false,
            detailsJson: '[]',
          },
          // Run 2: references a library item that isn't in the
          // backup — MUST be filtered out on restore rather than
          // inserted with a dangling FK.
          {
            sessionId: null,
            exerciseId: null,
            libraryItemId: 'lib-missing',
            endedAt: now,
            durationSeconds: 30,
            strictnessPreset: 'intermediate',
            totalNotes: 5,
            hitCount: 3,
            missedCount: 2,
            extraCount: 0,
            pitchPerfect: 1,
            pitchGood: 1,
            pitchAcceptable: 1,
            pitchWrong: 0,
            timingPerfect: 1,
            timingGood: 1,
            timingAcceptable: 1,
            timingWrong: 0,
            longestStreak: 2,
            overallScore: 55,
            suggestSlowDown: true,
            suggestStringMuting: false,
            detailsJson: '[]',
          },
        ],
      },
    };

    const report = await importPtDataEnvelope(envelope, 'backup');

    // restorePracticeStats must be called with exactly ONE
    // feedback run — the other one got filtered out for missing
    // library mapping.
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    const callArg = restoreSpy.mock.calls[0][0];
    const runs = callArg.feedbackRuns ?? [];
    expect(runs).toHaveLength(1);
    // library_item_id is remapped to the freshly-created id.
    const newLibraryId = report.createdIds.libraryItems['lib-src'];
    const newExerciseId = report.createdIds.exercises['ex-src'];
    expect(newLibraryId).toBeTruthy();
    expect(newExerciseId).toBeTruthy();
    expect(runs[0].libraryItemId).toBe(newLibraryId);
    expect(runs[0].exerciseId).toBe(newExerciseId);
    // Detail blob is preserved verbatim.
    expect(runs[0].detailsJson).toBe('[]');
    expect(runs[0].overallScore).toBe(80);

    restoreSpy.mockRestore();
  });

  it('round-trips guideState through backup export → import (1.3.0+ field)', async () => {
    // Regression: guideState (showAtStartup + per-guide completion
    // timestamps) was added in 1.3.0 but initially missing from
    // PtSettingsDTO. Without the round-trip, restoring a backup
    // wiped the user's "I've already done these guides" progress.
    // Now the field is included verbatim by mapSettings + dropped
    // straight into localStorage on import, so progress survives.
    const { loadSettings } =
      await import('../services/ptdata/serializerMappers');

    localStorage.setItem(
      'practicetab.settings',
      JSON.stringify({
        accentColor: '#5dd6a2',
        guideState: {
          showAtStartup: false,
          completed: {
            practice: '2026-04-01T10:00:00.000Z',
            library: '2026-04-02T10:00:00.000Z',
          },
        },
      }),
    );

    const dto = loadSettings();
    expect(dto.guideState).toEqual({
      showAtStartup: false,
      completed: {
        practice: '2026-04-01T10:00:00.000Z',
        library: '2026-04-02T10:00:00.000Z',
      },
    });
  });

  it('synthesises a default guideState when the stored settings predate the field', async () => {
    // Backwards compat: pre-1.3.0 backups (or fresh-install
    // localStorage) don't carry guideState. Export must still
    // produce a well-formed DTO so the file is internally
    // consistent — defaults match the appStore's hydrate path
    // (showAtStartup=true, completed={}).
    const { loadSettings } =
      await import('../services/ptdata/serializerMappers');

    localStorage.setItem(
      'practicetab.settings',
      JSON.stringify({ accentColor: '#5dd6a2' }),
    );

    const dto = loadSettings();
    expect(dto.guideState).toEqual({
      showAtStartup: true,
      completed: {},
    });
  });
});
