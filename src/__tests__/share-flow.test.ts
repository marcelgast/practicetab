// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { practicePersistence } from '../services/practicePersistence';
import { libraryPersistence } from '../services/libraryPersistence';
import {
  exportShareDTO,
  importPtDataEnvelope,
} from '../services/ptdata/serializer';
import {
  readPtShareFile,
  writePtShareFile,
} from '../services/ptdata/shareFile';
import { readPtshareFormatVersion } from '../services/ptdata/validators';
import { fromBase64 } from '../services/backupCrypto';

const fileStore = new Map<string, string>();

vi.mock('../services/backupFileOps', () => ({
  backupFileOps: {
    writeFileBase64: vi.fn(async (path: string, dataBase64: string) => {
      fileStore.set(path, dataBase64);
    }),
    readFileBase64: vi.fn(async (path: string) => {
      const value = fileStore.get(path);
      if (!value) {
        throw new Error('missing');
      }
      return value;
    }),
  },
}));

describe('share export/import flow', () => {
  beforeEach(() => {
    localStorage.clear();
    fileStore.clear();
  });

  it('roundtrips a share file and imports into a chosen plan', async () => {
    const sourcePlan = await practicePersistence.createPracticePlan(
      'Share',
      false,
    );
    const exercise = await practicePersistence.createExercise(sourcePlan.id, {
      title: 'Etude',
      timePlannedMinutes: 10,
      bpm: 120,
    });
    await practicePersistence.createInterval(exercise.id, {
      durationSeconds: 30,
      sortIndex: 0,
      bpm: 120,
    });

    libraryPersistence.save([
      {
        id: 'lib-1',
        title: 'Etude',
        source: { kind: 'reference', path: '/tabs/etude.gp5' },
        metadata: { fileName: 'etude.gp5', size: 200, modifiedMs: 0 },
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        lastKnownOk: true,
      },
    ]);

    const envelope = await exportShareDTO({
      exerciseId: exercise.id,
      includeTabFile: false,
      includeAudioFile: false,
    });
    expect((envelope.data as { shareKind?: string }).shareKind).toBe(
      'exercise',
    );

    await writePtShareFile(envelope, '/tmp/share.ptshare');
    const base64 = fileStore.get('/tmp/share.ptshare');
    expect(base64).toBeTruthy();
    const bytes = fromBase64(base64 ?? '');
    expect(readPtshareFormatVersion(bytes)).toBe(1);

    const loaded = await readPtShareFile('/tmp/share.ptshare');
    const targetPlan = await practicePersistence.createPracticePlan(
      'Target',
      false,
    );
    await importPtDataEnvelope(loaded, 'share', {
      planOverrides: { [loaded.data.plans[0].id]: targetPlan.id },
    });

    const plans = await practicePersistence.listPracticePlans();
    const target = plans.find((plan) => plan.id === targetPlan.id);
    expect(target?.exercises.some((item) => item.title === 'Etude')).toBe(true);
  });
});
