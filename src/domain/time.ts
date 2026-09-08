export function formatDuration(durationSec: number): string {
  const safe = Math.max(0, Math.floor(durationSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDurationHms(durationSec: number): string {
  const safe = Math.max(0, Math.floor(durationSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDurationMmss(durationSec: number): string {
  const safe = Math.max(0, Math.floor(durationSec));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function calcElapsedSec(startedAtIso: string, nowMs: number): number {
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) {
    return 0;
  }
  const diffMs = nowMs - startedMs;
  return Math.max(0, Math.floor(diffMs / 1000));
}
