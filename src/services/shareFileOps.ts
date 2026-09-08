import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './libraryFileOps';

export const shareFileOps = {
  async pickShareSavePath(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return invoke<string | null>('share_pick_save_file');
  },
  async pickShareFile(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return invoke<string | null>('share_pick_open_file');
  },
  async pickTabSavePath(fileName: string): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return invoke<string | null>('share_pick_tab_save_file', { fileName });
  },
};
