/**
 * Thin bridge between raw GP bytes and the pure `scanMaxFret`
 * helper in `src/domain/fretboard.ts`. Parses the score via
 * AlphaTab's importer and forwards the object to the domain
 * scanner. Kept separate from `gpBeatmapBuilder` so tests can
 * mock this file without stubbing the beatmap pipeline, and so
 * the Fretboard Panel's on-import scan doesn't force the beatmap
 * store to own both concerns.
 */

import { importer } from '@coderline/alphatab';
import { scanMaxFret } from '../domain/fretboard';
import type { AlphaTabScore } from './player/types';

export function scanMaxFretFromBytes(bytes: Uint8Array): number {
  const score = importer.ScoreLoader.loadScoreFromBytes(
    bytes,
  ) as unknown as AlphaTabScore;
  return scanMaxFret(score);
}
