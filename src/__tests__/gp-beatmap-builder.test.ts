import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGpBeatmapFromBytes } from '../services/gpBeatmapBuilder';

function loadFixtureBytes(fileName: string): Uint8Array {
  const fixturePath = path.resolve(
    process.cwd(),
    'src/__tests__/fixtures',
    fileName,
  );
  return new Uint8Array(fs.readFileSync(fixturePath));
}

describe('gp beatmap builder', () => {
  it('builds deterministic time events and played bar expansion', () => {
    const beatmap = buildGpBeatmapFromBytes(loadFixtureBytes('TestFile.gp'));

    expect(beatmap.endBar).toBe(23);
    expect(beatmap.startBpm).toBe(120);
    expect(beatmap.startTimeSigTop).toBe(10);
    expect(beatmap.startTimeSigBottom).toBe(8);

    expect(beatmap.timeEvents).toEqual(
      expect.arrayContaining([
        { barIndex: 1, bpm: 120, timeSigTop: 10, timeSigBottom: 8 },
        { barIndex: 2, bpm: 120, timeSigTop: 4, timeSigBottom: 4 },
        { barIndex: 9, bpm: 80, timeSigTop: 4, timeSigBottom: 4 },
        { barIndex: 15, bpm: 50, timeSigTop: 4, timeSigBottom: 4 },
        { barIndex: 17, bpm: 200, timeSigTop: 4, timeSigBottom: 4 },
      ]),
    );

    expect(beatmap.loopEvents).toEqual(
      expect.arrayContaining([
        { startBar: 3, endBar: 6, repeatCount: 3 },
        { startBar: 9, endBar: 9, repeatCount: 2 },
        { startBar: 17, endBar: 20, repeatCount: 3 },
      ]),
    );

    expect(beatmap.playedBars.length).toBeGreaterThan(beatmap.endBar);
    expect(beatmap.playedBars[0]?.playedBarIndex).toBe(1);
    expect(beatmap.playedBars[0]?.notationBarIndex).toBe(1);

    const secondPassBar = beatmap.playedBars.find(
      (row) => row.notationBarIndex === 3 && row.repeatPass === 1,
    );
    expect(secondPassBar?.playedBarLabel).toBe('3.1');
  });

  it('keeps played bar rows strictly sequential', () => {
    const beatmap = buildGpBeatmapFromBytes(loadFixtureBytes('TestFile.gp'));
    beatmap.playedBars.forEach((row, index) => {
      expect(row.playedBarIndex).toBe(index + 1);
      expect(row.notationBarIndex).toBeGreaterThanOrEqual(1);
      expect(row.notationBarIndex).toBeLessThanOrEqual(beatmap.endBar);
    });
  });

  it('applies repeatCount with AlphaTab semantics and keeps alternate endings aligned', () => {
    const beatmap = buildGpBeatmapFromBytes(loadFixtureBytes('TestFile.gp'));
    const labels = beatmap.playedBars.map((row) => row.playedBarLabel);

    expect(labels).toEqual(
      expect.arrayContaining([
        '3',
        '4',
        '3.1',
        '5.1',
        '3.2',
        '6.2',
        '9',
        '9.1',
        '17',
        '17.1',
        '17.2',
      ]),
    );
    expect(labels).not.toContain('3.3');
    expect(labels).not.toContain('9.2');
    expect(labels).not.toContain('17.3');
  });
});
