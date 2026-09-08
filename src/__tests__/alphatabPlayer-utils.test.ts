// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { midi, NotationElement } from '@coderline/alphatab';
import {
  __test__,
  ALPHATAB_TEXT_FONT_FAMILY,
  base64ToUint8Array,
  buildAlphaTabElementFonts,
  buildSettings,
  getAlphaTabFontDirectory,
  getAlphaTabSoundFontUrl,
  resolveProgramForTrack,
} from '../services/alphatabPlayer';

const originalAtob = globalThis.atob;
const originalBuffer = (globalThis as unknown as { Buffer?: typeof Buffer })
  .Buffer;
const originalLocation = window.location;

function setLocation(origin: string) {
  Object.defineProperty(window, 'location', {
    value: { origin },
    configurable: true,
  });
}

afterEach(() => {
  if (originalAtob) {
    globalThis.atob = originalAtob;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).atob = undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Buffer = originalBuffer;
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    configurable: true,
  });
});

describe('alphatabPlayer utilities', () => {
  it('resolves program overrides when provided', () => {
    const overrides = new Map([[1, 42]]);
    expect(resolveProgramForTrack(1, 7, overrides)).toBe(42);
    expect(resolveProgramForTrack(2, 7, overrides)).toBe(7);
  });

  it('builds font directory URLs from origin', () => {
    setLocation('http://localhost');
    expect(getAlphaTabFontDirectory()).toBe('http://localhost/alphatab/');
    setLocation('null');
    expect(getAlphaTabFontDirectory()).toBe('/alphatab/');
  });

  it('builds the soundfont URL', () => {
    setLocation('http://example.com');
    expect(getAlphaTabSoundFontUrl()).toBe(
      'http://example.com/alphatab/sonivox.sf2',
    );
  });

  it('overrides AlphaTab element fonts with the app text font stack', () => {
    const fonts = buildAlphaTabElementFonts();
    // Words block (the multi-line text above bars) must use the app font,
    // not AlphaTab's default serif. Size bumped vs. default 15px.
    const words = fonts.get(NotationElement.ScoreWords);
    expect(words).toBeDefined();
    expect(words).toContain(ALPHATAB_TEXT_FONT_FAMILY);
    expect(words).toMatch(/\b17px\b/);
    // Section markers stay bold so they still stand out visually.
    expect(fonts.get(NotationElement.EffectMarker)).toMatch(/^bold /);
    // Score header entries all share the same font family.
    for (const element of [
      NotationElement.ScoreTitle,
      NotationElement.ScoreSubTitle,
      NotationElement.ScoreArtist,
      NotationElement.ScoreAlbum,
      NotationElement.ScoreMusic,
      NotationElement.ScoreWordsAndMusic,
      NotationElement.ScoreCopyright,
      NotationElement.EffectLyrics,
      NotationElement.EffectDirections,
      NotationElement.EffectChordNames,
      NotationElement.EffectCapo,
      // Beat text annotations (GP "Text" block above bars) — primary bug.
      NotationElement.EffectText,
      NotationElement.EffectTempo,
      NotationElement.TrackNames,
    ]) {
      expect(fonts.get(element)).toContain(ALPHATAB_TEXT_FONT_FAMILY);
    }
  });

  it('buildSettings wires elementFonts into display.resources', () => {
    const built = buildSettings() as {
      display?: { resources?: { elementFonts?: Map<NotationElement, string> } };
    };
    const elementFonts = built.display?.resources?.elementFonts;
    expect(elementFonts).toBeInstanceOf(Map);
    expect(elementFonts?.get(NotationElement.ScoreWords)).toContain(
      ALPHATAB_TEXT_FONT_FAMILY,
    );
  });

  it('buildSettings preserves caller-provided display resource fields', () => {
    const built = buildSettings({
      display: { resources: { staffLineColor: '#ff0000' } },
    } as unknown as Parameters<typeof buildSettings>[0]) as {
      display?: { resources?: { elementFonts?: Map<NotationElement, string> } };
    };
    // elementFonts still set, and caller's color is spread in before it.
    const elementFonts = built.display?.resources?.elementFonts;
    expect(elementFonts).toBeInstanceOf(Map);
  });

  it('decodes base64 with atob when available', () => {
    globalThis.atob = vi.fn(() => 'hi');
    const bytes = base64ToUint8Array('aGk=');
    expect([...bytes]).toEqual([104, 105]);
  });

  it('decodes base64 with Buffer when atob is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).atob = undefined;
    const bytes = base64ToUint8Array('YWI=');
    expect(new TextDecoder().decode(bytes)).toBe('ab');
  });

  it('throws when no base64 decoder is available', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).atob = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Buffer = undefined;
    expect(() => base64ToUint8Array('YQ==')).toThrow(
      'Base64 decoding is not available in this environment.',
    );
  });

  it('resolves vibrato priority across note, beat, and voice', () => {
    const { resolveVibrato } = __test__;
    expect(
      resolveVibrato({ note: { vibrato: 'wide' }, beat: {}, voice: {} }),
    ).toBe('wide');
    expect(
      resolveVibrato({
        note: { vibrato: 'none' },
        beat: { vibrato: 2 },
        voice: { vibrato: 0 },
      }),
    ).toBe('wide');
    expect(
      resolveVibrato({ note: {}, beat: { vibrato: 0 }, voice: { vibrato: 1 } }),
    ).toBe('slight');
  });

  it('does not treat initial tempo setup at tick 0 as a tempo change', () => {
    const { hasMeaningfulTempoChanges } = __test__;
    expect(
      hasMeaningfulTempoChanges([
        { tick: 0, timeMs: 0, usPerQuarter: 500000 },
        { tick: 0, timeMs: 0, usPerQuarter: 428571 },
      ]),
    ).toBe(false);
  });

  it('detects tempo changes after the initial tick', () => {
    const { hasMeaningfulTempoChanges } = __test__;
    expect(
      hasMeaningfulTempoChanges([
        { tick: 0, timeMs: 0, usPerQuarter: 500000 },
        { tick: 960, timeMs: 1000, usPerQuarter: 600000 },
      ]),
    ).toBe(true);
  });

  it('includes vibrato windows when vibrato is explicitly flagged', () => {
    const { buildVibratoWindows } = __test__;
    const tempoMap = [{ tick: 0, timeMs: 0, usPerQuarter: 500000 }];
    const score = {
      tracks: [
        {
          index: 0,
          staves: [
            {
              bars: [
                {
                  voices: [
                    {
                      beats: [
                        {
                          playbackStart: 0,
                          playbackDuration: 480,
                          whammyBarPoints: [{}],
                          notes: [{ realValue: 60, vibrato: 1 }],
                        },
                        {
                          playbackStart: 480,
                          playbackDuration: 480,
                          notes: [{ realValue: 62, vibrato: 1, hasBend: true }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const windows = buildVibratoWindows({
      score,
      tempoMap,
      division: 480,
      tickCache: null,
    });
    const result = windows.get(0);
    expect(result).toHaveLength(4);
  });

  it('applies vibrato when timing matches even if keys differ', () => {
    const { buildAudioEvents } = __test__;
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          noteKey: 60,
          noteVelocity: 100,
          track: 0,
          channel: 0,
        },
        {
          type: midi.MidiEventType.NoteOff,
          tick: 480,
          noteKey: 60,
          noteVelocity: 0,
          track: 0,
          channel: 0,
        },
      ],
    } as unknown as midi.MidiFile;
    const vibratoWindows = new Map([
      [
        0,
        [
          {
            key: null,
            startMs: 0,
            endMs: 500,
            vibrato: 'slight' as const,
          },
        ],
      ],
    ]);
    const result = buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      vibratoWindows,
      new Map(),
    );
    const noteOn = result.events.find((event) => event.kind.type === 'note_on');
    expect(noteOn?.kind.type).toBe('note_on');
    if (noteOn?.kind.type === 'note_on') {
      expect(noteOn.kind.vibrato).toBe('slight');
    }
  });

  it('keeps per-note pitch bends even inside vibrato windows', () => {
    const { buildAudioEvents } = __test__;
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.PerNotePitchBend,
          tick: 0,
          pitch: 1024,
          track: 0,
          channel: 0,
        },
      ],
    } as unknown as midi.MidiFile;
    const vibratoWindows = new Map([
      [
        0,
        [
          {
            key: null,
            startMs: 0,
            endMs: 500,
            vibrato: 'slight' as const,
          },
        ],
      ],
    ]);

    const result = buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      vibratoWindows,
      new Map(),
    );

    const bends = result.events.filter(
      (event) => event.kind.type === 'pitch_bend',
    );
    expect(bends).toHaveLength(1);
  });

  it('uses track channel fallback for per-note bends when channel is missing', () => {
    const { buildAudioEvents } = __test__;
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.PerNotePitchBend,
          tick: 0,
          pitch: 1024,
          track: 3,
        },
      ],
    } as unknown as midi.MidiFile;

    const result = buildAudioEvents(
      midiFile,
      new Map([[3, 0]]),
      new Map([[0, 3]]),
      new Map(),
      new Map(),
    );

    const bend = result.events.find(
      (event) => event.kind.type === 'pitch_bend',
    );
    expect(bend).toBeDefined();
    expect(bend?.channel).toBe(3);
  });

  it('maps MIDI 2.0 32-bit per-note bend center to 14-bit center', () => {
    const { buildAudioEvents } = __test__;
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.PerNotePitchBend,
          tick: 0,
          pitch: 2147483648,
          track: 0,
          channel: 0,
        },
      ],
    } as unknown as midi.MidiFile;

    const result = buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map(),
      new Map(),
    );
    const bend = result.events.find(
      (event) => event.kind.type === 'pitch_bend',
    );
    expect(bend?.kind.type).toBe('pitch_bend');
    if (bend?.kind.type === 'pitch_bend') {
      expect(bend.kind.value).toBe(8192);
    }
  });

  it('routes simultaneous per-note bends for different keys to different channels', () => {
    const { buildAudioEvents } = __test__;
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          noteKey: 64,
          noteVelocity: 100,
          track: 0,
          channel: 0,
        },
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          noteKey: 69,
          noteVelocity: 100,
          track: 0,
          channel: 0,
        },
        {
          type: midi.MidiEventType.PerNotePitchBend,
          tick: 0,
          noteKey: 64,
          pitch: 3221225472,
          track: 0,
          channel: 0,
        },
        {
          type: midi.MidiEventType.PerNotePitchBend,
          tick: 0,
          noteKey: 69,
          pitch: 3221225472,
          track: 0,
          channel: 0,
        },
      ],
    } as unknown as midi.MidiFile;

    const result = buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map(),
      new Map(),
    );
    const bends = result.events.filter(
      (event) => event.kind.type === 'pitch_bend',
    );
    expect(bends).toHaveLength(2);
    expect(new Set(bends.map((event) => event.channel)).size).toBe(2);
  });

  it('clamps note-off timing when let-ring end is shorter', () => {
    const { buildAudioEvents } = __test__;
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          noteKey: 60,
          noteVelocity: 100,
          track: 0,
          channel: 0,
        },
        {
          type: midi.MidiEventType.NoteOff,
          tick: 960,
          noteKey: 60,
          noteVelocity: 0,
          track: 0,
          channel: 0,
        },
      ],
    } as unknown as midi.MidiFile;
    const letRingEndMap = new Map([['0:0:60', 480]]);
    const result = buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map(),
      new Map(),
      letRingEndMap,
    );
    const noteOff = result.events.find(
      (event) => event.kind.type === 'note_off',
    );
    expect(noteOff?.atMs).toBeDefined();
    expect(noteOff?.atMs ?? 0).toBeCloseTo(500, 1);
  });

  it('returns empty harmonic map without tick cache', () => {
    const { buildHarmonicMap } = __test__;
    const map = buildHarmonicMap({
      score: { tracks: [] },
      tickCache: null,
      midiTickShift: 0,
    });
    expect(map.size).toBe(0);
  });

  it('builds let-ring end map from note destination beats', () => {
    const { buildLetRingEndMap } = __test__;
    const beat1 = { start: 0, duration: 480 };
    const beat2 = { start: 480, duration: 480 };
    const score = {
      tracks: [
        {
          index: 0,
          staves: [
            {
              bars: [
                {
                  voices: [
                    {
                      beats: [
                        {
                          ...beat1,
                          notes: [
                            {
                              isLetRing: true,
                              letRingDestination: { beat: beat2 },
                              realValue: 60,
                            },
                          ],
                        },
                        {
                          ...beat2,
                          notes: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const letRingEndMap = buildLetRingEndMap({
      score,
      tickCache: {
        getBeatStart: (beat) => (beat as { start?: number }).start ?? 0,
        findBeat: (_tracks, tick) => ({
          beatLookup: { duration: tick === 480 ? 480 : 480 },
        }),
      },
      harmonicMap: new Map(),
      midiTickShift: 0,
    });
    expect(letRingEndMap.get('0:0:60')).toBe(960);
  });

  it('builds let-ring end map from beat let-ring flags', () => {
    const { buildLetRingEndMap } = __test__;
    const beat1 = { start: 0, duration: 480, isLetRing: true };
    const score = {
      tracks: [
        {
          index: 0,
          staves: [
            {
              bars: [
                {
                  voices: [
                    {
                      beats: [
                        {
                          ...beat1,
                          notes: [
                            {
                              realValue: 62,
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const letRingEndMap = buildLetRingEndMap({
      score,
      tickCache: {
        getBeatStart: (beat) => (beat as { start?: number }).start ?? 0,
        findBeat: (_tracks, tick) => ({
          beatLookup: { duration: tick === 0 ? 480 : 480 },
        }),
      },
      harmonicMap: new Map(),
      midiTickShift: 0,
    });
    expect(letRingEndMap.get('0:0:62')).toBe(480);
  });
});
