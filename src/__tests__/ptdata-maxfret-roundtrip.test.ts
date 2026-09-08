// @vitest-environment happy-dom
/**
 * Verifies `metadata.maxFret` (PR 4.2) survives the backup
 * round-trip: export maps it into the `PtLibraryItemDTO`, and
 * import lands it back on the rehydrated `LibraryItem`. Missing
 * on pre-PR-4.2 backups the field simply stays undefined — the
 * panel falls back to a default neck length in that case.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapLibraryItem } from '../services/ptdata/serializerMappers';
import type { LibraryItem } from '../domain/library';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

function baseItem(
  overrides: Partial<LibraryItem['metadata']> = {},
): LibraryItem {
  return {
    id: 'lib-mf',
    kind: 'tab',
    title: 'Study',
    source: { kind: 'reference', path: '/tabs/study.gp5' },
    metadata: {
      fileName: 'study.gp5',
      size: 100,
      modifiedMs: 1,
      ...overrides,
    },
    createdAt: '2026-04-23T10:00:00Z',
    updatedAt: '2026-04-23T10:00:00Z',
    lastKnownOk: true,
  };
}

describe('ptdata maxFret round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('carries maxFret through the export DTO mapper', () => {
    const dto = mapLibraryItem(baseItem({ maxFret: 22 }));
    expect(dto.metadata.maxFret).toBe(22);
  });

  it('omits maxFret from the DTO when the source item has none', () => {
    const dto = mapLibraryItem(baseItem());
    expect('maxFret' in dto.metadata).toBe(false);
  });

  it('preserves maxFret when the DTO is re-imported into a library array', () => {
    const dto = mapLibraryItem(baseItem({ maxFret: 15 }));
    // Mirrors the `importPtDataEnvelope` backup branch: spread the
    // DTO into the library with a fresh id. The nested metadata
    // object should carry `maxFret` through untouched.
    const restored: LibraryItem = {
      ...dto,
      kind: dto.kind ?? 'tab',
      id: 'fresh-id',
    } as LibraryItem;
    expect(restored.metadata.maxFret).toBe(15);
  });
});
