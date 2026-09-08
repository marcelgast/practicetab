// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { isTauri, libraryFileOps } from '../services/libraryFileOps';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('libraryFileOps', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    delete (window as { __TAURI__?: unknown }).__TAURI__;
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    invokeMock.mockReset();
  });

  it('detects non-tauri environments', async () => {
    expect(isTauri()).toBe(false);
    await expect(libraryFileOps.pickGpFiles()).resolves.toEqual([]);
    await expect(libraryFileOps.stat('path')).rejects.toThrow(
      'Not available in browser dev',
    );
    await expect(libraryFileOps.readFileBase64('path')).rejects.toThrow(
      'Not available in browser dev',
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes tauri commands when running in Tauri', async () => {
    (window as { __TAURI__?: unknown }).__TAURI__ = true;
    invokeMock.mockResolvedValueOnce([
      {
        path: '/tmp/song.gp',
        metadata: { file_name: 'song.gp', size: 1, modified_ms: 2 },
      },
    ]);
    await expect(libraryFileOps.pickGpFiles()).resolves.toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith('library_pick_gp_files');

    invokeMock.mockResolvedValueOnce({
      file_name: 'song.gp',
      size: 12,
      modified_ms: 34,
    });
    await expect(libraryFileOps.stat('/tmp/song.gp')).resolves.toEqual({
      file_name: 'song.gp',
      size: 12,
      modified_ms: 34,
    });
    expect(invokeMock).toHaveBeenCalledWith('library_stat', {
      path: '/tmp/song.gp',
    });

    invokeMock.mockResolvedValueOnce('ZGF0YQ==');
    await expect(libraryFileOps.readFileBase64('/tmp/song.gp')).resolves.toBe(
      'ZGF0YQ==',
    );
    expect(invokeMock).toHaveBeenCalledWith('library_read_file_base64', {
      path: '/tmp/song.gp',
    });
  });
});
