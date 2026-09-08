import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importer, Settings } from '@coderline/alphatab';
import { buildMidiBytesForScore } from '../services/alphatabMidiExport';

function loadFixtureBytes(fileName: string): Uint8Array {
  const fixturePath = path.resolve(
    process.cwd(),
    'src/__tests__/fixtures',
    fileName,
  );
  return new Uint8Array(fs.readFileSync(fixturePath));
}

function countTrackChunks(bytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i <= bytes.length - 4; i += 1) {
    if (
      bytes[i] === 0x4d &&
      bytes[i + 1] === 0x54 &&
      bytes[i + 2] === 0x72 &&
      bytes[i + 3] === 0x6b
    ) {
      count += 1;
    }
  }
  return count;
}

describe('alphatabMidiExport', () => {
  it('exports non-empty SMF bytes with at least one track chunk', () => {
    const score = importer.ScoreLoader.loadScoreFromBytes(
      loadFixtureBytes('TestFile.gp'),
    );
    const bytes = buildMidiBytesForScore(score, new Settings());

    expect(bytes.length).toBeGreaterThan(14);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(countTrackChunks(bytes)).toBeGreaterThan(0);
  });
});
