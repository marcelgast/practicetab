// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { midi, type Score } from '@coderline/alphatab';
import { __test__ } from '../services/alphatabPlayer';

describe('alphatab audio mappings', () => {
  it('maps natural harmonics to audible pitches', () => {
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
                          notes: [
                            {
                              isHarmonic: true,
                              harmonicType: 1,
                              harmonicValue: 12,
                              realValueWithoutHarmonic: 60,
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
    } as unknown as Score;
    const map = __test__.buildHarmonicMap({
      score,
      tickCache: {
        getBeatStart: () => 0,
      },
      midiTickShift: 0,
    });
    expect(map.get('0:0:60')).toBe(72);
  });

  it('keeps expression controller values and restores next note level', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.ControlChange,
          tick: 0,
          track: 0,
          channel: 0,
          controller: 11,
          value: 80,
        },
        {
          type: midi.MidiEventType.ControlChange,
          tick: 480,
          track: 0,
          channel: 0,
          controller: 11,
          value: 0,
        },
        {
          type: midi.MidiEventType.NoteOn,
          tick: 480,
          track: 0,
          channel: 0,
          noteKey: 64,
          noteVelocity: 90,
        },
        {
          type: midi.MidiEventType.NoteOn,
          tick: 960,
          track: 0,
          channel: 0,
          noteKey: 67,
          noteVelocity: 90,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;

    const trackChannelMap = new Map<number, number>([[0, 0]]);
    const channelToTrackIndex = new Map<number, number>([[0, 0]]);
    const { events } = __test__.buildAudioEvents(
      midiFile,
      trackChannelMap,
      channelToTrackIndex,
      new Map(),
      new Map(),
    );
    const expressionChanges = events.filter(
      (event) =>
        event.kind.type === 'control_change' && event.kind.controller === 11,
    );
    expect(expressionChanges).toHaveLength(3);
    expect(
      expressionChanges.map((event) =>
        event.kind.type === 'control_change' ? event.kind.value : -1,
      ),
    ).toEqual([80, 0, 80]);
  });

  it('keeps channel volume controller neutral at 127', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.ControlChange,
          tick: 0,
          track: 0,
          channel: 0,
          controller: 7,
          value: 35,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;

    const { events } = __test__.buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map(),
      new Map(),
    );
    const volumeChange = events.find(
      (event) =>
        event.kind.type === 'control_change' && event.kind.controller === 7,
    );
    expect(volumeChange).toBeTruthy();
    if (volumeChange?.kind.type === 'control_change') {
      expect(volumeChange.kind.value).toBe(127);
    }
  });

  it('builds fade-out expression ramps from beat fade metadata', () => {
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
                          fade: 2,
                          playbackDuration: 480,
                          notes: [{ note: 60 }],
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
    } as unknown as Score;

    const events = __test__.buildFadeExpressionEvents({
      score,
      tempoMap: [{ tick: 0, timeMs: 0, usPerQuarter: 500000 }],
      division: 480,
      midiTickShift: 0,
      tickCache: {
        getBeatStart: () => 0,
        findBeat: () => ({ beatLookup: { duration: 480 } }),
      },
      trackChannelMap: new Map([[0, 0]]),
      channelToTrackIndex: new Map([[0, 0]]),
    });
    const cc11 = events.filter(
      (event) =>
        event.kind.type === 'control_change' && event.kind.controller === 11,
    );
    expect(cc11.length).toBeGreaterThan(2);
    if (cc11.length > 0) {
      expect(cc11[0].kind.type).toBe('control_change');
      expect(cc11[0].kind.value).toBe(127);
      expect(cc11[cc11.length - 1].kind.type).toBe('control_change');
      expect(cc11[cc11.length - 1].kind.value).toBe(127);
      const minValue = Math.min(
        ...cc11.map((event) =>
          event.kind.type === 'control_change' ? event.kind.value : 127,
        ),
      );
      expect(minValue).toBe(0);
      const maxAtMs = Math.max(...cc11.map((event) => event.atMs));
      expect(cc11[cc11.length - 1].atMs).toBe(maxAtMs);
    }
  });

  it('uses displayDuration for fade timing when playback duration is longer', () => {
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
                          fade: 2,
                          displayDuration: 480,
                          playbackDuration: 960,
                          notes: [{ note: 60 }],
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
    } as unknown as Score;

    const events = __test__.buildFadeExpressionEvents({
      score,
      tempoMap: [{ tick: 0, timeMs: 0, usPerQuarter: 500000 }],
      division: 480,
      midiTickShift: 0,
      tickCache: {
        getBeatStart: () => 0,
        findBeat: () => ({ beatLookup: { duration: 960 } }),
      },
      trackChannelMap: new Map([[0, 0]]),
      channelToTrackIndex: new Map([[0, 0]]),
    });
    const cc11 = events.filter(
      (event) =>
        event.kind.type === 'control_change' && event.kind.controller === 11,
    );
    expect(cc11.length).toBeGreaterThan(0);
    const last = cc11[cc11.length - 1];
    expect(last.kind.type).toBe('control_change');
    expect(last.kind.value).toBe(127);
    expect(last.atMs).toBeCloseTo(500, 2);
  });

  it('does not create trill note-ons for vibrato notes', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          track: 0,
          channel: 0,
          noteKey: 64,
          noteVelocity: 90,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;

    const trackChannelMap = new Map<number, number>([[0, 0]]);
    const channelToTrackIndex = new Map<number, number>([[0, 0]]);
    const vibratoWindows = new Map([
      [
        0,
        [
          {
            key: 64,
            startMs: 0,
            endMs: 200,
            vibrato: 'slight' as const,
          },
        ],
      ],
    ]);
    const { events } = __test__.buildAudioEvents(
      midiFile,
      trackChannelMap,
      channelToTrackIndex,
      vibratoWindows,
      new Map(),
    );
    const noteOns = events.filter((event) => event.kind.type === 'note_on');
    expect(noteOns).toHaveLength(1);
    const hasExtraNoteOn = events.some(
      (event) => event.kind.type === 'note_on' && event.atMs > 0,
    );
    expect(hasExtraNoteOn).toBe(false);
  });

  it('builds vibrato windows without tick cache using beat playback timing', () => {
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
                          playbackStart: 480,
                          playbackDuration: 480,
                          vibrato: 0,
                          notes: [
                            {
                              realValue: 64,
                              vibrato: 1,
                              hasBend: false,
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
    } as unknown as Score;
    const windows = __test__.buildVibratoWindows({
      score,
      tempoMap: [{ tick: 0, timeMs: 0, usPerQuarter: 500000 }],
      division: 480,
      tickCache: null,
    });
    const trackWindows = windows.get(0) ?? [];
    expect(trackWindows).toHaveLength(2);
    const keyed = trackWindows.find((window) => window.key === 64) ?? null;
    expect(keyed?.key).toBe(64);
    if (keyed) {
      expect(keyed.startMs).toBeCloseTo(500, 1);
      expect(keyed.endMs).toBeCloseTo(1000, 1);
    }
  });

  it('uses tick cache master bar start when beat start is unavailable', () => {
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
                          playbackStart: 480,
                          playbackDuration: 480,
                          notes: [
                            {
                              realValue: 64,
                              vibrato: 1,
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
    } as unknown as Score;
    const windows = __test__.buildVibratoWindows({
      score,
      tempoMap: [{ tick: 0, timeMs: 0, usPerQuarter: 500000 }],
      division: 480,
      tickCache: {
        getBeatStart: () => NaN,
        getMasterBarStart: () => 1000,
      },
    });
    const trackWindows = windows.get(0) ?? [];
    const keyed = trackWindows.find((window) => window.key === 64) ?? null;
    expect(keyed).not.toBeNull();
    if (keyed) {
      expect(keyed.startMs).toBeCloseTo(1541.666, 1);
      expect(keyed.endMs).toBeCloseTo(2041.666, 1);
    }
  });

  it('does not suppress bends from vibrato windows alone', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.PitchBend,
          tick: 0,
          track: 0,
          channel: 0,
          value: 9000,
        },
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          track: 0,
          channel: 0,
          noteKey: 64,
          noteVelocity: 90,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;
    const trackChannelMap = new Map<number, number>([[0, 0]]);
    const channelToTrackIndex = new Map<number, number>([[0, 0]]);
    const vibratoWindows = new Map([
      [
        0,
        [
          {
            key: 64,
            startMs: 0,
            endMs: 200,
            vibrato: 'slight' as const,
          },
        ],
      ],
    ]);
    const { events } = __test__.buildAudioEvents(
      midiFile,
      trackChannelMap,
      channelToTrackIndex,
      vibratoWindows,
      new Map(),
    );
    const bends = events.filter((event) => event.kind.type === 'pitch_bend');
    expect(bends).toHaveLength(1);
  });

  it('keeps oscillating bends and disables synthetic vibrato when bend motion exists', () => {
    const events: midi.MidiEvent[] = [];
    let tick = 0;
    for (const value of [8192, 8500, 8300, 8600, 8250, 8550, 8325, 8500]) {
      events.push({
        type: midi.MidiEventType.PitchBend,
        tick,
        track: 0,
        channel: 0,
        value,
      } as unknown as midi.MidiEvent);
      tick += 10;
    }
    events.push({
      type: midi.MidiEventType.NoteOn,
      tick: 0,
      track: 0,
      channel: 0,
      noteKey: 64,
      noteVelocity: 96,
    } as unknown as midi.MidiEvent);
    events.push({
      type: midi.MidiEventType.NoteOff,
      tick: 120,
      track: 0,
      channel: 0,
      noteKey: 64,
      noteVelocity: 0,
    } as unknown as midi.MidiEvent);
    const midiFile = {
      division: 480,
      tickShift: 0,
      events,
    } as unknown as midi.MidiFile;
    const { events: mapped } = __test__.buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map([
        [
          0,
          [
            {
              key: null,
              startMs: 0,
              endMs: 500,
              startTick: 0,
              endTick: 200,
              vibrato: 'slight' as const,
            },
          ],
        ],
      ]),
      new Map(),
    );
    const bends = mapped.filter((event) => event.kind.type === 'pitch_bend');
    expect(bends.length).toBeGreaterThan(1);
    const noteOn = mapped.find((event) => event.kind.type === 'note_on');
    expect(noteOn).toBeDefined();
    if (noteOn?.kind.type === 'note_on') {
      expect(noteOn.kind.vibrato).toBeUndefined();
    }
  });

  it('keeps center reset pitch bend even inside vibrato windows', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.PitchBend,
          tick: 0,
          track: 0,
          channel: 0,
          value: 8192,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;

    const trackChannelMap = new Map<number, number>([[0, 0]]);
    const channelToTrackIndex = new Map<number, number>([[0, 0]]);
    const vibratoWindows = new Map([
      [
        0,
        [
          {
            key: null,
            startMs: 0,
            endMs: 200,
            vibrato: 'slight' as const,
          },
        ],
      ],
    ]);
    const { events } = __test__.buildAudioEvents(
      midiFile,
      trackChannelMap,
      channelToTrackIndex,
      vibratoWindows,
      new Map(),
    );
    const bends = events.filter((event) => event.kind.type === 'pitch_bend');
    expect(bends).toHaveLength(1);
    if (bends[0]?.kind.type === 'pitch_bend') {
      expect(bends[0].kind.value).toBe(8192);
    }
  });

  it('assigns vibrato on note-on when tied range overlaps a later vibrato window', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          track: 0,
          channel: 0,
          noteKey: 64,
          noteVelocity: 96,
        },
        {
          type: midi.MidiEventType.NoteOff,
          tick: 960,
          track: 0,
          channel: 0,
          noteKey: 64,
          noteVelocity: 0,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;
    const { events } = __test__.buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map([
        [
          0,
          [
            {
              key: 64,
              startMs: 200,
              endMs: 700,
              startTick: 384,
              endTick: 720,
              vibrato: 'slight' as const,
            },
          ],
        ],
      ]),
      new Map(),
    );
    const noteOn = events.find((event) => event.kind.type === 'note_on');
    expect(noteOn).toBeDefined();
    if (noteOn?.kind.type === 'note_on') {
      expect(noteOn.kind.vibrato).toBe('slight');
    }
  });

  it('does not suppress wide oscillating bends (whammy-like)', () => {
    const events: midi.MidiEvent[] = [];
    let tick = 0;
    for (const value of [8192, 12000, 7000, 12500, 6800, 12300, 7100, 12100]) {
      events.push({
        type: midi.MidiEventType.PitchBend,
        tick,
        track: 0,
        channel: 0,
        value,
      } as unknown as midi.MidiEvent);
      tick += 10;
    }
    const midiFile = {
      division: 480,
      tickShift: 0,
      events,
    } as unknown as midi.MidiFile;
    const { events: mapped } = __test__.buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map(),
      new Map(),
    );
    const bends = mapped.filter((event) => event.kind.type === 'pitch_bend');
    expect(bends.length).toBeGreaterThan(0);
  });

  it('does not suppress whammy-like bends inside vibrato windows', () => {
    const events: midi.MidiEvent[] = [];
    let tick = 0;
    for (const value of [8192, 12200, 6400, 12400, 6500, 12100, 6700, 12000]) {
      events.push({
        type: midi.MidiEventType.PitchBend,
        tick,
        track: 0,
        channel: 0,
        value,
      } as unknown as midi.MidiEvent);
      tick += 10;
    }
    const midiFile = {
      division: 480,
      tickShift: 0,
      events,
    } as unknown as midi.MidiFile;
    const { events: mapped } = __test__.buildAudioEvents(
      midiFile,
      new Map([[0, 0]]),
      new Map([[0, 0]]),
      new Map([
        [
          0,
          [
            {
              key: null,
              startMs: 0,
              endMs: 500,
              startTick: 0,
              endTick: 300,
              vibrato: 'slight' as const,
            },
          ],
        ],
      ]),
      new Map(),
    );
    const bends = mapped.filter((event) => event.kind.type === 'pitch_bend');
    expect(bends.length).toBeGreaterThan(1);
  });

  it('uses the explicit MIDI channel for track events', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          track: 0,
          channel: 5,
          noteKey: 64,
          noteVelocity: 100,
        },
        {
          type: midi.MidiEventType.PitchBend,
          tick: 10,
          track: 0,
          channel: 5,
          value: 9000,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;

    const trackChannelMap = new Map<number, number>([[0, 4]]);
    const channelToTrackIndex = new Map<number, number>([[4, 0]]);
    const { events } = __test__.buildAudioEvents(
      midiFile,
      trackChannelMap,
      channelToTrackIndex,
      new Map(),
      new Map(),
    );

    const noteOn = events.find((event) => event.kind.type === 'note_on');
    const bend = events.find((event) => event.kind.type === 'pitch_bend');
    expect(noteOn?.channel).toBe(5);
    expect(bend?.channel).toBe(5);
  });

  it('keeps simultaneous bends on separate channels audible', () => {
    const midiFile = {
      division: 480,
      tickShift: 0,
      events: [
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          track: 0,
          channel: 4,
          noteKey: 64,
          noteVelocity: 100,
        },
        {
          type: midi.MidiEventType.NoteOn,
          tick: 0,
          track: 0,
          channel: 5,
          noteKey: 67,
          noteVelocity: 100,
        },
        {
          type: midi.MidiEventType.PitchBend,
          tick: 20,
          track: 0,
          channel: 4,
          value: 8800,
        },
        {
          type: midi.MidiEventType.PitchBend,
          tick: 20,
          track: 0,
          channel: 5,
          value: 7600,
        },
      ] as unknown as midi.MidiEvent[],
    } as unknown as midi.MidiFile;

    const trackChannelMap = new Map<number, number>([[0, 4]]);
    const channelToTrackIndex = new Map<number, number>([
      [4, 0],
      [5, 0],
    ]);
    const { events } = __test__.buildAudioEvents(
      midiFile,
      trackChannelMap,
      channelToTrackIndex,
      new Map(),
      new Map(),
    );

    const bendChannels = events
      .filter((event) => event.kind.type === 'pitch_bend')
      .map((event) => event.channel)
      .sort((a, b) => a - b);
    expect(bendChannels).toEqual([4, 5]);
  });
});
