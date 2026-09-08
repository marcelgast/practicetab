import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { beatmapEditorGuide } from '../domain/guides/beatmapEditor';
import { songMapEditorGuide } from '../domain/guides/songMapEditor';
import type { Guide } from '../domain/guides/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

function findMissing(guide: Guide, sources: string[]): string[] {
  const blob = sources.join('\n');
  const missing: string[] = [];
  guide.steps.forEach((step) => {
    const match = step.selector.match(/^\[data-guide="(.+)"\]$/);
    expect(match, `malformed selector: ${step.selector}`).not.toBeNull();
    const slug = match![1];
    const attrRegex = new RegExp(`data-guide="${slug}"`);
    if (!attrRegex.test(blob)) missing.push(slug);
  });
  return missing;
}

describe('beatmap-editor guide selectors', () => {
  it('every data-guide slug exists in the beatmap editor component', () => {
    const missing = findMissing(beatmapEditorGuide, [
      read('../components/player/BeatmapEditorContent.vue'),
    ]);
    expect(missing).toEqual([]);
  });
});

describe('song-map-editor guide selectors', () => {
  it('every data-guide slug exists in the song-map editor component', () => {
    const missing = findMissing(songMapEditorGuide, [
      read('../components/library/SongMapEditorPanel.vue'),
    ]);
    expect(missing).toEqual([]);
  });
});
