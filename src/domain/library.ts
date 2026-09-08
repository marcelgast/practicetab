export type LibraryItemId = string;
export type LibraryItemKind = 'tab' | 'audio';

export const TAB_EXTENSIONS = ['gp3', 'gp4', 'gp5', 'gpx', 'gp'] as const;
export const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'ogg',
  'aac',
  'm4a',
] as const;

export type LibrarySource =
  | { kind: 'reference'; path: string }
  | {
      kind: 'imported';
      managedPath: string;
      originalPath?: string;
      originalFileName?: string;
    };

export type FileMetadata = {
  fileName: string;
  size: number;
  modifiedMs: number;
  hash?: string;
  /**
   * Highest fret number used anywhere in the tab (PR 4.2 —
   * Fretboard Panel). Populated lazily on first beatmap build so
   * the panel can size its neck SVG without rescanning on every
   * open. Absent for audio items and pre-PR-4.2 library items;
   * the panel falls back to a sensible default when missing.
   */
  maxFret?: number;
};

export type LibraryItem = {
  id: LibraryItemId;
  kind: LibraryItemKind;
  title: string;
  source: LibrarySource;
  metadata: FileMetadata;
  createdAt: string;
  updatedAt: string;
  lastKnownOk: boolean;
  missingReason?: 'not_found' | 'no_permission' | 'unknown';
  linkedAudioId?: LibraryItemId | null;
};

type IdGenerator = () => string;

type PickInput = {
  path: string;
  metadata: FileMetadata;
  title?: string;
  kind?: LibraryItemKind;
};

export function createLibraryItemFromPick(
  input: PickInput,
  now: string,
  idGen: IdGenerator,
): LibraryItem {
  const title = input.title?.trim() || input.metadata.fileName;
  return {
    id: idGen(),
    kind: input.kind ?? 'tab',
    title,
    source: { kind: 'reference', path: input.path },
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
    lastKnownOk: true,
  };
}

export function stripFileExtension(value: string): string {
  return value.replace(/\.[^./\\]+$/, '');
}

export function markMissing(
  item: LibraryItem,
  reason: LibraryItem['missingReason'],
  now: string,
): LibraryItem {
  return {
    ...item,
    lastKnownOk: false,
    missingReason: reason ?? 'unknown',
    updatedAt: now,
  };
}

export function markAvailable(item: LibraryItem, now: string): LibraryItem {
  return {
    ...item,
    lastKnownOk: true,
    missingReason: undefined,
    updatedAt: now,
  };
}

export function needsRelink(item: LibraryItem): boolean {
  return !item.lastKnownOk;
}

export function getLibrarySourcePath(source: LibrarySource): string {
  return source.kind === 'reference'
    ? source.path
    : (source.originalPath ?? source.managedPath);
}

export function relink(
  item: LibraryItem,
  newPath: string,
  newMetadata: FileMetadata,
  now: string,
): LibraryItem {
  const source: LibrarySource =
    item.source.kind === 'reference'
      ? { kind: 'reference', path: newPath }
      : {
          kind: 'imported',
          managedPath: item.source.managedPath,
          originalPath: newPath,
          originalFileName: item.source.originalFileName,
        };

  return {
    ...item,
    source,
    metadata: newMetadata,
    lastKnownOk: true,
    missingReason: undefined,
    updatedAt: now,
  };
}
