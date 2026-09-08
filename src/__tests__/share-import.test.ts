// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PtDataEnvelopeV1 } from '../domain/ptdata';
import { libraryPersistence } from '../services/libraryPersistence';
import { practicePersistence } from '../services/practicePersistence';
import { importShareEnvelope } from '../services/ptdata/shareImport';

const { writeFileBase64, pickTabSavePath } = vi.hoisted(() => ({
  writeFileBase64: vi.fn(),
  pickTabSavePath: vi.fn(),
}));

vi.mock('../services/backupFileOps', () => ({
  backupFileOps: {
    writeFileBase64,
  },
}));

vi.mock('../services/shareFileOps', () => ({
  shareFileOps: {
    pickTabSavePath,
  },
}));

describe('share import', () => {
  beforeEach(() => {
    localStorage.clear();
    writeFileBase64.mockReset();
    pickTabSavePath.mockReset();
  });

  it('writes embedded tab files and links exercises', async () => {
    pickTabSavePath.mockResolvedValue('/tmp/etude.gp5');
    const envelope: PtDataEnvelopeV1 = {
      format: 'ptdata',
      formatVersion: 1,
      createdAt: '2025-01-02T00:00:00.000Z',
      kind: 'share',
      data: {
        plans: [
          {
            id: 'plan-1',
            title: 'Plan',
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
            title: 'Etude',
            sortOrder: 0,
            timePlannedMinutes: 10,
            intervalAuto: true,
            linkedTabId: 'lib-1',
            linkedAudioId: null,
            bpm: 100,
            notes: null,
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
          },
        ],
        intervals: [],
        libraryItems: [
          {
            id: 'lib-1',
            title: 'Etude',
            source: { kind: 'reference', path: '/tabs/etude.gp5' },
            metadata: { fileName: 'etude.gp5', size: 20, modifiedMs: 0 },
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            lastKnownOk: true,
          },
        ],
        embeddedTabs: [
          {
            libraryItemId: 'lib-1',
            fileName: 'etude.gp5',
            metadata: { fileName: 'etude.gp5', size: 20, modifiedMs: 0 },
            contentBase64: 'ZGF0YQ==',
          },
        ],
      },
    };

    const result = await importShareEnvelope(envelope);

    expect(result.status).toBe('success');
    expect(writeFileBase64).toHaveBeenCalledWith('/tmp/etude.gp5', 'ZGF0YQ==');
    const items = libraryPersistence.load();
    expect(items.some((item) => item.metadata.fileName === 'etude.gp5')).toBe(
      true,
    );
    const plans = await practicePersistence.listPracticePlans();
    expect(plans[0]?.exercises[0]?.linkedTabId).toBeTruthy();
  });
});
