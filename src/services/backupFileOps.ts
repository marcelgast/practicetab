import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './libraryFileOps';

export type BackupEmbeddedFileInput = {
  relativePath: string;
  dataBase64: string;
};

export const backupFileOps = {
  async pickBackupSavePath(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return invoke<string | null>('backup_pick_save_file');
  },
  async pickBackupFile(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return invoke<string | null>('backup_pick_open_file');
  },
  async pickRestoreFolder(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    return invoke<string | null>('backup_pick_folder');
  },
  async readFileBase64(path: string): Promise<string> {
    return invoke<string>('backup_read_file_base64', { path });
  },
  async writeFileBase64(path: string, dataBase64: string): Promise<void> {
    await invoke('backup_write_file_base64', { path, dataBase64 });
  },
  async writeEmbeddedFiles(
    baseDir: string,
    files: BackupEmbeddedFileInput[],
  ): Promise<string[]> {
    return invoke<string[]>('backup_write_embedded_files', {
      baseDir,
      files,
    });
  },
};
