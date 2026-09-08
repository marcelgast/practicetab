import { describe, expect, it } from 'vitest';
import {
  findFirstPlayedBarForNotationBar,
  formatPlayedBarLabel,
  mapPlayedBarToNotationBar,
  normalizeLoopEvents,
  normalizeTimeEvents,
  tempoStateAtNotationBar,
} from '../domain/beatmap';

describe('beatmap domain', () => {
  it('normalizes and sorts time events and enforces bar 1 event', () => {
    const events = normalizeTimeEvents(
      [
        { barIndex: 8, bpm: 145, timeSigTop: 7, timeSigBottom: 8 },
        { barIndex: 3, bpm: 132, timeSigTop: 4, timeSigBottom: 4 },
        { barIndex: 3, bpm: 140, timeSigTop: 5, timeSigBottom: 8 },
      ],
      { bpm: 120, timeSigTop: 4, timeSigBottom: 4 },
    );

    expect(events[0]).toEqual({
      barIndex: 1,
      bpm: 120,
      timeSigTop: 4,
      timeSigBottom: 4,
    });
    expect(events[1]).toEqual({
      barIndex: 3,
      bpm: 140,
      timeSigTop: 5,
      timeSigBottom: 8,
    });
    expect(events[2]).toEqual({
      barIndex: 8,
      bpm: 145,
      timeSigTop: 7,
      timeSigBottom: 8,
    });
  });

  it('drops overlapping loop events', () => {
    const loops = normalizeLoopEvents([
      { startBar: 5, endBar: 8, repeatCount: 2 },
      { startBar: 6, endBar: 9, repeatCount: 3 },
      { startBar: 12, endBar: 12, repeatCount: 2 },
    ]);
    expect(loops).toEqual([
      { startBar: 5, endBar: 8, repeatCount: 2 },
      { startBar: 12, endBar: 12, repeatCount: 2 },
    ]);
  });

  it('maps played bars to notation bars for repeated loops', () => {
    const loops = [{ startBar: 26, endBar: 29, repeatCount: 4 }];
    expect(mapPlayedBarToNotationBar(26, loops)).toEqual({
      notationBarIndex: 26,
      repeatPass: 0,
    });
    expect(mapPlayedBarToNotationBar(30, loops)).toEqual({
      notationBarIndex: 26,
      repeatPass: 1,
    });
    expect(mapPlayedBarToNotationBar(46, loops)).toEqual({
      notationBarIndex: 30,
      repeatPass: 0,
    });
  });

  it('finds first played bar for notation bar (first run seek semantics)', () => {
    const loops = [{ startBar: 5, endBar: 6, repeatCount: 2 }];
    expect(findFirstPlayedBarForNotationBar(5, loops)).toBe(5);
    expect(findFirstPlayedBarForNotationBar(6, loops)).toBe(6);
    expect(findFirstPlayedBarForNotationBar(7, loops)).toBe(11);
  });

  it('formats played bar labels with repeat pass suffix', () => {
    expect(formatPlayedBarLabel(8, 0)).toBe('8');
    expect(formatPlayedBarLabel(8, 1)).toBe('8.1');
    expect(formatPlayedBarLabel(8, 2)).toBe('8.2');
  });

  it('returns active tempo state at notation bar', () => {
    const events = normalizeTimeEvents(
      [
        { barIndex: 1, bpm: 120, timeSigTop: 4, timeSigBottom: 4 },
        { barIndex: 5, bpm: 90, timeSigTop: 7, timeSigBottom: 8 },
        { barIndex: 12, bpm: 140, timeSigTop: 4, timeSigBottom: 4 },
      ],
      { bpm: 120, timeSigTop: 4, timeSigBottom: 4 },
    );

    expect(tempoStateAtNotationBar(4, events)).toEqual({
      bpm: 120,
      timeSigTop: 4,
      timeSigBottom: 4,
    });
    expect(tempoStateAtNotationBar(5, events)).toEqual({
      bpm: 90,
      timeSigTop: 7,
      timeSigBottom: 8,
    });
    expect(tempoStateAtNotationBar(16, events)).toEqual({
      bpm: 140,
      timeSigTop: 4,
      timeSigBottom: 4,
    });
  });
});
