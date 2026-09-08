// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLibraryStore } from '../stores/library';

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => false),
  libraryFileOps: {
    pickGpFiles: vi.fn(),
    stat: vi.fn(),
  },
}));

describe('library store (browser mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('init does not attempt file ops when not tauri', () => {
    const store = useLibraryStore();
    expect(() => store.init()).not.toThrow();
    expect(store.fileOpsAvailable).toBe(false);
  });
});
