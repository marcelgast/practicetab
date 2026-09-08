import { createId } from '../utils/id';

export type SongSection = {
  id: string;
  libraryItemId: string;
  label: string;
  color: string;
  timestampMs: number;
  sortOrder: number;
  createdAt: string;
};

export type SongMap = {
  libraryItemId: string;
  startOffsetMs: number;
  sections: SongSection[];
  createdAt: string;
  updatedAt: string;
};

export function createSection(
  libraryItemId: string,
  label: string,
  timestampMs: number,
  sortOrder: number,
  color = '#5dd6a2',
): SongSection {
  return {
    id: createId(),
    libraryItemId,
    label,
    color,
    timestampMs,
    sortOrder,
    createdAt: new Date().toISOString(),
  };
}

export function sortSections(sections: SongSection[]): SongSection[] {
  return [...sections].sort((a, b) => a.timestampMs - b.timestampMs);
}

export function sectionAtTime(
  sections: SongSection[],
  ms: number,
): SongSection | null {
  const sorted = sortSections(sections);
  let current: SongSection | null = null;
  for (const section of sorted) {
    if (section.timestampMs <= ms) {
      current = section;
    } else {
      break;
    }
  }
  return current;
}

export function nextSection(
  sections: SongSection[],
  ms: number,
): SongSection | null {
  const sorted = sortSections(sections);
  for (const section of sorted) {
    if (section.timestampMs > ms) {
      return section;
    }
  }
  return null;
}
