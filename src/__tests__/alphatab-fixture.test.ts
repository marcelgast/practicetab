import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importer, midi, Settings, type Score } from '@coderline/alphatab';
import { __test__ } from '../services/alphatabPlayer';

function loadFixtureScore(fileName: string): Score {
  const fixturePath = path.resolve(
    process.cwd(),
    'src/__tests__/fixtures',
    fileName,
  );
  const bytes = new Uint8Array(fs.readFileSync(fixturePath));
  return importer.ScoreLoader.loadScoreFromBytes(bytes);
}

function tickToMs(
  tick: number,
  division: number,
  tempoMap: Array<{ tick: number; timeMs: number; usPerQuarter: number }>,
): number {
  let point = tempoMap[0] ?? { tick: 0, timeMs: 0, usPerQuarter: 500000 };
  for (const candidate of tempoMap) {
    if (candidate.tick <= tick) {
      point = candidate;
    } else {
      break;
    }
  }
  const deltaTicks = tick - point.tick;
  return point.timeMs + (deltaTicks * point.usPerQuarter) / (division * 1000);
}

function barTimeRangeMs(
  score: Score,
  barNumber: number,
  division: number,
  tempoMap: Array<{ tick: number; timeMs: number; usPerQuarter: number }>,
): { startMs: number; endMs: number } {
  const index = barNumber - 1;
  const bars = score.masterBars ?? [];
  const current = bars[index];
  const next = bars[index + 1];
  if (!current || typeof current.start !== 'number') {
    throw new Error(`bar ${barNumber} missing`);
  }
  const startTick = Math.round(current.start);
  const fallbackLength = Math.round(
    current.calculateDuration?.() ?? division * 4,
  );
  const endTick =
    typeof next?.start === 'number'
      ? Math.round(next.start)
      : startTick + fallbackLength;
  return {
    startMs: tickToMs(startTick, division, tempoMap),
    endMs: tickToMs(endTick, division, tempoMap),
  };
}

describe('alphatab fixture regression', () => {
  it('keeps expected time-signature transitions in TestFile.gp', () => {
    const score = loadFixtureScore('TestFile.gp');
    const bars = score.masterBars ?? [];

    expect(bars.length).toBeGreaterThan(2);
    expect(bars[0]?.timeSignatureNumerator).toBe(10);
    expect(bars[0]?.timeSignatureDenominator).toBe(8);
    expect(bars[1]?.timeSignatureNumerator).toBe(4);
    expect(bars[1]?.timeSignatureDenominator).toBe(4);
  });

  it('contains vibrato windows and bend-heavy beats in TestFile.gp', () => {
    const score = loadFixtureScore('TestFile.gp');
    const midiFile = new midi.MidiFile();
    const handler = new midi.AlphaSynthMidiFileHandler(midiFile, true);
    const generator = new midi.MidiFileGenerator(
      score,
      new Settings(),
      handler,
    );
    generator.applyTranspositionPitches = true;
    generator.generate();

    const { tempoMap } = __test__.buildAudioEvents(
      midiFile,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    );
    const vibratoWindows = __test__.buildVibratoWindows({
      score,
      tempoMap,
      division: midiFile.division,
      tickCache: null,
    });
    const windows = Array.from(vibratoWindows.values()).flat();
    const hasSlightVibrato = windows.some(
      (window) => window.vibrato === 'slight' || window.vibrato === 'wide',
    );
    expect(windows.length).toBeGreaterThan(0);
    expect(hasSlightVibrato).toBe(true);

    let beatsWithMultipleBentNotes = 0;
    for (const track of score.tracks ?? []) {
      for (const staff of track.staves ?? []) {
        for (const bar of staff.bars ?? []) {
          for (const voice of bar.voices ?? []) {
            for (const beat of voice.beats ?? []) {
              const bentNotes = (beat.notes ?? []).filter((note) => {
                const typed = note as {
                  hasBend?: boolean;
                  bendPoints?: unknown[];
                };
                return typed.hasBend || (typed.bendPoints?.length ?? 0) > 0;
              });
              if (bentNotes.length >= 2) {
                beatsWithMultipleBentNotes += 1;
              }
            }
          }
        }
      }
    }
    expect(beatsWithMultipleBentNotes).toBeGreaterThan(0);
  });

  it('keeps vibrato playback signal in bars 2 and 10 and marks bar 15 vibrato window', () => {
    const score = loadFixtureScore('TestFile.gp');
    const midiFile = new midi.MidiFile();
    const handler = new midi.AlphaSynthMidiFileHandler(midiFile, true);
    const generator = new midi.MidiFileGenerator(
      score,
      new Settings(),
      handler,
    );
    generator.applyTranspositionPitches = true;
    generator.generate();

    const initial = __test__.buildAudioEvents(
      midiFile,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    );
    const vibratoWindows = __test__.buildVibratoWindows({
      score,
      tempoMap: initial.tempoMap,
      division: midiFile.division,
      tickCache: null,
    });
    const { events, tempoMap } = __test__.buildAudioEvents(
      midiFile,
      new Map(),
      new Map(),
      vibratoWindows,
      new Map(),
    );

    for (const bar of [2, 10]) {
      const { startMs, endMs } = barTimeRangeMs(
        score,
        bar,
        midiFile.division,
        tempoMap,
      );
      const hasVibratoNote = events.some(
        (event) =>
          event.kind.type === 'note_on' &&
          event.atMs >= startMs &&
          event.atMs < endMs &&
          (event.kind.vibrato === 'slight' || event.kind.vibrato === 'wide'),
      );
      expect(hasVibratoNote).toBe(true);
    }

    const bar15 = barTimeRangeMs(score, 15, midiFile.division, tempoMap);
    const bar15WindowExists = Array.from(vibratoWindows.values())
      .flat()
      .some(
        (window) =>
          window.startMs < bar15.endMs &&
          window.endMs > bar15.startMs &&
          (window.vibrato === 'slight' || window.vibrato === 'wide'),
      );
    expect(bar15WindowExists).toBe(true);
  });

  it('keeps whammy base pitch anchored in bars 14, 16, and 22', () => {
    const score = loadFixtureScore('TestFile.gp');
    const midiFile = new midi.MidiFile();
    const handler = new midi.AlphaSynthMidiFileHandler(midiFile, true);
    const generator = new midi.MidiFileGenerator(
      score,
      new Settings(),
      handler,
    );
    generator.applyTranspositionPitches = true;
    generator.generate();

    const { events, tempoMap } = __test__.buildAudioEvents(
      midiFile,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    );

    for (const bar of [14, 16]) {
      const { startMs, endMs } = barTimeRangeMs(
        score,
        bar,
        midiFile.division,
        tempoMap,
      );
      const bends = events.filter(
        (event) =>
          event.kind.type === 'pitch_bend' &&
          event.atMs >= startMs &&
          event.atMs < endMs,
      );
      const firstNonCenter = bends.find((event) =>
        event.kind.type === 'pitch_bend' ? event.kind.value !== 8192 : false,
      );
      const hasCenterBeforeFirstNonCenter = bends.some((event) => {
        if (event.kind.type !== 'pitch_bend') {
          return false;
        }
        if (!firstNonCenter) {
          return false;
        }
        return event.kind.value === 8192 && event.atMs <= firstNonCenter.atMs;
      });
      expect(firstNonCenter).toBeDefined();
      expect(hasCenterBeforeFirstNonCenter).toBe(true);
    }

    const bar22 = barTimeRangeMs(score, 22, midiFile.division, tempoMap);
    const bar22Bends = events.filter(
      (event) =>
        event.kind.type === 'pitch_bend' &&
        event.atMs >= bar22.startMs &&
        event.atMs < bar22.endMs,
    );
    expect(
      bar22Bends.some(
        (event) =>
          event.kind.type === 'pitch_bend' && event.kind.value === 8192,
      ),
    ).toBe(true);
  });
});
