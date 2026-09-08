import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { metronomeGuide } from '../domain/guides/metronome';
import { statsGuide } from '../domain/guides/stats';
import { playerGuide } from '../domain/guides/player';
import type { Guide } from '../domain/guides/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

/** Search a collection of source files for every data-guide slug
 *  the guide declares. Returns the slugs that couldn't be found
 *  anywhere. */
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

describe('metronome guide selectors', () => {
  it('every data-guide slug exists somewhere in Metronome.vue', () => {
    const missing = findMissing(metronomeGuide, [
      read('../pages/Metronome.vue'),
    ]);
    expect(missing).toEqual([]);
  });
});

describe('stats guide selectors', () => {
  it('every data-guide slug exists somewhere in Stats.vue', () => {
    const missing = findMissing(statsGuide, [read('../pages/Stats.vue')]);
    expect(missing).toEqual([]);
  });
});

describe('player guide selectors', () => {
  it('every data-guide slug is present in a Player component', () => {
    const missing = findMissing(playerGuide, [
      read('../components/player/TrackControl.vue'),
      read('../components/player/VolumeControl.vue'),
      read('../components/player/DisplayControl.vue'),
      read('../components/player/TransportControls.vue'),
      read('../components/player/MetronomeControls.vue'),
      read('../components/player/PlayerBottomBar.vue'),
      read('../components/player/BottomBarTimer.vue'),
    ]);
    expect(missing).toEqual([]);
  });
});
