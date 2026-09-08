import { describe, expect, it } from 'vitest';
import {
  createSection,
  sortSections,
  sectionAtTime,
  nextSection,
} from '../domain/songMap';
import type { SongSection } from '../domain/songMap';

function makeSection(
  label: string,
  timestampMs: number,
  sortOrder = 0,
): SongSection {
  return {
    id: `section-${label}`,
    libraryItemId: 'item-1',
    label,
    color: '#5dd6a2',
    timestampMs,
    sortOrder,
    createdAt: '2025-01-01T00:00:00Z',
  };
}

describe('songMap domain', () => {
  it('creates a section with defaults', () => {
    const section = createSection('item-1', 'Intro', 0, 0);
    expect(section.label).toBe('Intro');
    expect(section.timestampMs).toBe(0);
    expect(section.color).toBe('#5dd6a2');
    expect(section.id).toBeTruthy();
  });

  it('creates a section with custom color', () => {
    const section = createSection('item-1', 'Solo', 5000, 1, '#ff0000');
    expect(section.color).toBe('#ff0000');
  });

  it('sorts sections by timestamp', () => {
    const sections = [
      makeSection('Chorus', 30000),
      makeSection('Intro', 0),
      makeSection('Verse', 15000),
    ];
    const sorted = sortSections(sections);
    expect(sorted.map((s) => s.label)).toEqual(['Intro', 'Verse', 'Chorus']);
  });

  it('returns section at given time', () => {
    const sections = [
      makeSection('Intro', 0),
      makeSection('Verse', 10000),
      makeSection('Chorus', 25000),
    ];
    expect(sectionAtTime(sections, 0)?.label).toBe('Intro');
    expect(sectionAtTime(sections, 5000)?.label).toBe('Intro');
    expect(sectionAtTime(sections, 10000)?.label).toBe('Verse');
    expect(sectionAtTime(sections, 20000)?.label).toBe('Verse');
    expect(sectionAtTime(sections, 30000)?.label).toBe('Chorus');
  });

  it('returns null for sectionAtTime before any section', () => {
    const sections = [makeSection('Verse', 10000)];
    expect(sectionAtTime(sections, 5000)).toBeNull();
  });

  it('returns next section after given time', () => {
    const sections = [
      makeSection('Intro', 0),
      makeSection('Verse', 10000),
      makeSection('Chorus', 25000),
    ];
    expect(nextSection(sections, 0)?.label).toBe('Verse');
    expect(nextSection(sections, 5000)?.label).toBe('Verse');
    expect(nextSection(sections, 10000)?.label).toBe('Chorus');
    expect(nextSection(sections, 25000)).toBeNull();
    expect(nextSection(sections, 30000)).toBeNull();
  });

  it('returns null for nextSection when empty', () => {
    expect(nextSection([], 0)).toBeNull();
  });
});
