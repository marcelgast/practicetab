// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PtDataEnvelopeV1 } from '../domain/ptdata';
import { libraryPersistence } from '../services/libraryPersistence';
import { practicePersistence } from '../services/practicePersistence';
import { restoreBackupEnvelope } from '../services/backupService';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('backup restore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('replaces practice and library data on restore', async () => {
    const existingPlan = await practicePersistence.createPracticePlan(
      'Existing',
      false,
    );
    await practicePersistence.createExercise(existingPlan.id, {
      title: 'Old Exercise',
      timePlannedMinutes: 5,
    });
    libraryPersistence.save([
      {
        id: 'lib-old',
        title: 'Old Tab',
        source: { kind: 'reference', path: '/tabs/old.gp5' },
        metadata: { fileName: 'old.gp5', size: 1, modifiedMs: 0 },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        lastKnownOk: true,
      },
    ]);

    const envelope: PtDataEnvelopeV1 = {
      format: 'ptdata',
      formatVersion: 1,
      createdAt: '2025-01-02T00:00:00.000Z',
      kind: 'backup',
      data: {
        plans: [
          {
            id: 'plan-1',
            title: 'Imported Plan',
            timed: false,
            sortOrder: 0,
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
          },
        ],
        exercises: [
          {
            id: 'exercise-1',
            planId: 'plan-1',
            title: 'Imported Exercise',
            sortOrder: 0,
            timePlannedMinutes: 10,
            intervalAuto: true,
            linkedTabId: 'lib-1',
            linkedAudioId: null,
            totalTimeSpentSeconds: 120,
            bpm: 90,
            notes: null,
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
          },
        ],
        intervals: [
          {
            id: 'interval-1',
            exerciseId: 'exercise-1',
            name: null,
            durationSeconds: 60,
            bpm: 90,
            sortIndex: 0,
            done: true,
            createdAt: 0,
          },
        ],
        sessions: [
          {
            id: 'session-1',
            sessionDate: '2025-01-02',
            startedAt: '2025-01-02T10:00:00.000Z',
            endedAt: '2025-01-02T10:05:00.000Z',
            totalTimeSpentSeconds: 300,
            createdAt: '2025-01-02T10:00:00.000Z',
          },
        ],
        sessionExercises: [
          {
            id: 'session-ex-1',
            sessionId: 'session-1',
            exerciseId: 'exercise-1',
            timeSpentSeconds: 300,
            createdAt: '2025-01-02T10:00:00.000Z',
          },
        ],
        intervalsCompletedTotal: 4,
        settings: {
          accentColor: '#5dd6a2',
          darkMode: true,
          lastOpenedRoute: '/library',
          showStaff: true,
          metronomeEnabled: false,
          countInEnabled: false,
          metronomeVolume: 80,
          countInBars: [2],
          checkUpdatesOnStartup: true,
          updatesDefaultsApplied: true,
          updatesStartupPreferenceSet: true,
          intervalChangeCountInBars: 2,
          weeklyStreakGoalDays: 5,
          audioOutputDeviceId: null,
          tuning: 0,
        },
        libraryItems: [
          {
            id: 'lib-1',
            title: 'New Tab',
            source: { kind: 'reference', path: '/tabs/new.gp5' },
            metadata: { fileName: 'new.gp5', size: 10, modifiedMs: 0 },
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            lastKnownOk: true,
          },
        ],
      },
    };

    await restoreBackupEnvelope(envelope);

    const plans = await practicePersistence.listPracticePlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]?.title).toBe('Imported Plan');
    expect(plans[0]?.exercises[0]?.totalTimeSpentSeconds).toBe(120);

    const libraryItems = libraryPersistence.load();
    expect(libraryItems).toHaveLength(1);
    expect(libraryItems[0]?.title).toBe('New Tab');
  });
});
