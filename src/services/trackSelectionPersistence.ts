import { getStoredJson, setStoredJson } from '../domain/storage';

const STORAGE_KEY = 'practicetab.trackSelectionByLibraryId';

type TrackSelectionMap = Record<string, number>;

function sanitizeTrackIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < 0) {
    return null;
  }
  return rounded;
}

function readMap(): TrackSelectionMap {
  const stored = getStoredJson<Record<string, unknown>>(STORAGE_KEY, {});
  const map: TrackSelectionMap = {};
  Object.entries(stored).forEach(([key, value]) => {
    const trackIndex = sanitizeTrackIndex(value);
    if (trackIndex === null) {
      return;
    }
    map[key] = trackIndex;
  });
  return map;
}

function writeMap(map: TrackSelectionMap): void {
  setStoredJson<TrackSelectionMap>(STORAGE_KEY, map);
}

export function loadSelectedTrackIndex(fileKey: string): number | null {
  const map = readMap();
  return map[fileKey] ?? null;
}

export function saveSelectedTrackIndex(
  fileKey: string,
  trackIndex: number,
): void {
  const sanitized = sanitizeTrackIndex(trackIndex);
  if (sanitized === null) {
    return;
  }
  const map = readMap();
  map[fileKey] = sanitized;
  writeMap(map);
}

export const __test__ = {
  sanitizeTrackIndex,
  readMap,
};
