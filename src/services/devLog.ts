import { invoke } from '@tauri-apps/api/core';
import { backupFileOps } from './backupFileOps';
import { fromBase64, toBase64 } from './backupCrypto';
import { isTauri } from './libraryFileOps';

const MAX_LOG_CHARS = 200_000;
/**
 * Coalesce dev-log writes in memory and flush on a timer. Each flush
 * is a single read-modify-write cycle, no matter how many log lines
 * were buffered since the last flush. Writing on every call was the
 * root cause of visible cursor jitter during live-feedback runs — the
 * pitch + position watchers fire 30–60 times per second and each
 * `appendDevLog` ran a Tauri IPC round-trip that read the whole log
 * file (up to 200KB), concatenated, and wrote it back. Batching cuts
 * that to ~2 IPC calls per second regardless of log volume.
 */
const FLUSH_INTERVAL_MS = 500;
let writeQueue: Promise<void> = Promise.resolve();
let devLogPath: string | null | undefined;
let pendingLines: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function getDevLogPath(): Promise<string | null> {
  if (devLogPath !== undefined) {
    return devLogPath;
  }
  try {
    devLogPath = await invoke<string>('dev_get_log_path');
  } catch {
    devLogPath = null;
  }
  return devLogPath;
}

function normalizeLines(entry: string | string[]): string {
  if (Array.isArray(entry)) {
    return entry.join('\n');
  }
  return entry;
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPending();
  }, FLUSH_INTERVAL_MS);
}

function flushPending(): void {
  if (pendingLines.length === 0) return;
  const batch = `${pendingLines.join('\n')}\n`;
  pendingLines = [];
  writeQueue = writeQueue
    .then(async () => {
      const path = await getDevLogPath();
      if (!path) {
        return;
      }
      let existing = '';
      try {
        const base64 = await backupFileOps.readFileBase64(path);
        existing = new TextDecoder().decode(fromBase64(base64));
      } catch {
        existing = '';
      }
      let next = `${existing}${batch}`;
      if (next.length > MAX_LOG_CHARS) {
        next = next.slice(next.length - MAX_LOG_CHARS);
        const firstNewline = next.indexOf('\n');
        if (firstNewline >= 0) {
          next = next.slice(firstNewline + 1);
        }
      }
      const encoded = new TextEncoder().encode(next);
      await backupFileOps.writeFileBase64(path, toBase64(encoded));
    })
    .catch(() => {
      // Silent: dev log is best-effort only.
    });
}

export function appendDevLog(entry: string | string[]): void {
  if (!import.meta.env.DEV || !isTauri()) {
    return;
  }
  const line = normalizeLines(entry);
  if (!line.trim()) {
    return;
  }
  pendingLines.push(line);
  scheduleFlush();
}

/**
 * Force an immediate flush — useful for tests that want to assert on
 * log contents synchronously, and for app-unload paths that would
 * otherwise lose the last sub-FLUSH_INTERVAL_MS of entries. Returns
 * the promise chain so callers can await completion.
 */
export function flushDevLog(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushPending();
  return writeQueue;
}
