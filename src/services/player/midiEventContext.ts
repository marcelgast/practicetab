import { midi } from '@coderline/alphatab';
import { appendDevLog } from '../devLog';
import type { PitchBendSegment, TempoPoint, VibratoKind } from './types';
import { PITCH_BEND_CENTER } from './types';
import { buildTempoMap, normalizePitchBendValue } from './tempoMap';

export type MidiEventBuildContext = {
  division: number;
  tempoMap: TempoPoint[];
  tickShift: number;
  vibratoSegments: Map<number, PitchBendSegment[]>;
  noteRangeByKey: Map<string, { startTick: number; endTick: number }>;
  noteOffOverrideTicks: Map<string, number>;
  sourceChannels: Set<number>;
  perNoteKeysAtTick: Map<number, Set<string>>;
  pitchBendsByChannel: Map<number, Array<{ tick: number; value: number }>>;
  endpointTicksByChannel: Map<number, number>;
  channelVibratoWindows: Map<
    number,
    Array<{
      key: number | null;
      startMs: number;
      endMs: number;
      startTick?: number;
      endTick?: number;
      vibrato: VibratoKind;
    }>
  >;
};

export function buildMidiEventContext(
  midiFile: midi.MidiFile,
  trackChannelMap: Map<number, number>,
  channelToTrackIndex: Map<number, number>,
  vibratoWindows: Map<
    number,
    Array<{
      key: number | null;
      startMs: number;
      endMs: number;
      startTick?: number;
      endTick?: number;
      vibrato: VibratoKind;
    }>
  >,
  harmonicMap: Map<string, number>,
  letRingEndMap: Map<string, number>,
  initialUsPerQuarter = 500000,
): MidiEventBuildContext {
  const division = midiFile.division || 480;
  const events = midiFile.events ?? [];
  const tickShift = midiFile.tickShift ?? 0;
  const tempoMap = buildTempoMap(
    events,
    division,
    tickShift,
    initialUsPerQuarter,
  );

  const vibratoSegments = new Map<number, PitchBendSegment[]>();
  const noteRangeByKey = new Map<
    string,
    { startTick: number; endTick: number }
  >();
  const noteOnStacks = new Map<string, number[]>();
  const noteOffOverrideTicks = new Map<string, number>();
  const sourceChannels = new Set<number>();
  const perNoteKeysAtTick = new Map<number, Set<string>>();
  const pitchBendsByChannel = new Map<
    number,
    Array<{ tick: number; value: number }>
  >();
  let letRingDebugCount = 0;

  const resolveChannel = (
    track: number | undefined,
    channel?: number,
  ): number => {
    if (typeof channel === 'number') {
      return Math.max(0, Math.min(15, channel));
    }
    if (typeof track === 'number' && trackChannelMap.has(track)) {
      return trackChannelMap.get(track) ?? 0;
    }
    return 0;
  };
  const resolveTrackIndex = (
    track: number | undefined,
    channel?: number,
  ): number => {
    if (typeof track === 'number' && trackChannelMap.has(track)) {
      return track;
    }
    if (typeof channel === 'number') {
      const mappedIdx = channelToTrackIndex.get(channel);
      if (typeof mappedIdx === 'number') {
        return mappedIdx;
      }
    }
    return typeof track === 'number' && Number.isFinite(track) ? track : 0;
  };
  const resolveHarmonicKey = (
    trackIndex: number,
    tick: number,
    key: number,
  ): number => {
    const mapKey = `${trackIndex}:${tick}:${key}`;
    const mappedKey = harmonicMap.get(mapKey);
    if (typeof mappedKey === 'number' && Number.isFinite(mappedKey)) {
      return Math.max(0, Math.min(127, Math.round(mappedKey)));
    }
    return key;
  };

  // First pass: collect note ranges, source channels, per-note pitch bends
  for (const event of events) {
    if (
      event.type === midi.MidiEventType.NoteOn ||
      event.type === midi.MidiEventType.NoteOff
    ) {
      const note = event as midi.NoteOnEvent | midi.NoteOffEvent;
      const channel = resolveChannel(note.track, note.channel);
      sourceChannels.add(channel);
      const key =
        note.noteKey ?? (note as unknown as { key?: number }).key ?? 0;
      if (Number.isFinite(key)) {
        const tick = event.tick - tickShift;
        const stackKey = `${channel}:${key}`;
        if (
          event.type === midi.MidiEventType.NoteOn &&
          (note.noteVelocity ?? 0) > 0
        ) {
          const stack = noteOnStacks.get(stackKey) ?? [];
          stack.push(tick);
          noteOnStacks.set(stackKey, stack);
        } else {
          const stack = noteOnStacks.get(stackKey);
          if (stack && stack.length > 0) {
            const startTick = stack.pop() as number;
            const rangeKey = `${channel}:${key}:${startTick}`;
            const trackIdx = resolveTrackIndex(note.track, note.channel);
            const letRingKey = `${trackIdx}:${startTick}:${resolveHarmonicKey(
              trackIdx,
              startTick,
              key,
            )}`;
            const letRingEnd = letRingEndMap.get(letRingKey);
            const endTick =
              typeof letRingEnd === 'number' &&
              Number.isFinite(letRingEnd) &&
              letRingEnd > startTick &&
              letRingEnd < tick
                ? Math.round(letRingEnd)
                : tick;
            noteRangeByKey.set(rangeKey, { startTick, endTick });
            if (endTick !== tick) {
              noteOffOverrideTicks.set(`${channel}:${key}:${tick}`, endTick);
              if (import.meta.env.DEV && letRingDebugCount < 12) {
                letRingDebugCount += 1;
                appendDevLog(
                  JSON.stringify({
                    source: 'src/services/alphatabPlayer.ts',
                    fn: 'buildAudioEvents',
                    message: 'let_ring_note_off_override',
                    details: {
                      trackIndex: trackIdx,
                      channel,
                      key,
                      startTick,
                      midiTick: tick,
                      letRingKey,
                      endTick,
                    },
                    ts: Date.now(),
                  }),
                );
              }
            }
          }
        }
      }
    }
    if (
      event.type !== midi.MidiEventType.PitchBend &&
      event.type !== midi.MidiEventType.PerNotePitchBend
    ) {
      continue;
    }
    const bend = event as midi.PitchBendEvent;
    const channel = resolveChannel(
      (bend as unknown as { track?: number }).track,
      (bend as unknown as { channel?: number }).channel,
    );
    const tick = event.tick - tickShift;
    sourceChannels.add(channel);
    if (event.type === midi.MidiEventType.PerNotePitchBend) {
      const noteKey = (bend as unknown as { noteKey?: number }).noteKey;
      if (typeof noteKey === 'number' && Number.isFinite(noteKey)) {
        const keySet = perNoteKeysAtTick.get(tick) ?? new Set<string>();
        keySet.add(`${channel}:${Math.round(noteKey)}`);
        perNoteKeysAtTick.set(tick, keySet);
      }
    }
    const value = normalizePitchBendValue(
      (bend as unknown as { value?: number }).value ??
        (bend as unknown as { pitch?: number }).pitch ??
        0,
    );
    const list = pitchBendsByChannel.get(channel) ?? [];
    list.push({ tick, value });
    pitchBendsByChannel.set(channel, list);
  }

  // Detect vibrato segments from pitch bends
  const maxGapTicks = Math.max(24, Math.round(division / 8));
  const minDurationTicks = Math.max(48, Math.round(division / 10));
  const maxVibratoSpan = 4500;
  const maxVibratoOffsetFromCenter = 2500;
  pitchBendsByChannel.forEach((list, channel) => {
    const sorted = [...list].sort((a, b) => a.tick - b.tick);
    let segment: {
      startTick: number;
      lastTick: number;
      lastValue: number;
      lastSign: number;
      minValue: number;
      maxValue: number;
      directionChanges: number;
      count: number;
    } | null = null;
    const flush = () => {
      if (!segment) {
        return;
      }
      const dur = segment.lastTick - segment.startTick;
      const span = segment.maxValue - segment.minValue;
      if (
        dur >= minDurationTicks &&
        segment.directionChanges >= 2 &&
        segment.count >= 8 &&
        span <= maxVibratoSpan &&
        Math.abs(segment.maxValue - PITCH_BEND_CENTER) <=
          maxVibratoOffsetFromCenter &&
        Math.abs(segment.minValue - PITCH_BEND_CENTER) <=
          maxVibratoOffsetFromCenter
      ) {
        const segments = vibratoSegments.get(channel) ?? [];
        segments.push({
          startTick: segment.startTick,
          endTick: segment.lastTick,
          minValue: segment.minValue,
          maxValue: segment.maxValue,
        });
        vibratoSegments.set(channel, segments);
      }
      segment = null;
    };
    for (const item of sorted) {
      if (!segment) {
        segment = {
          startTick: item.tick,
          lastTick: item.tick,
          lastValue: item.value,
          lastSign: 0,
          minValue: item.value,
          maxValue: item.value,
          directionChanges: 0,
          count: 1,
        };
        continue;
      }
      if (item.tick - segment.lastTick > maxGapTicks) {
        flush();
        segment = {
          startTick: item.tick,
          lastTick: item.tick,
          lastValue: item.value,
          lastSign: 0,
          minValue: item.value,
          maxValue: item.value,
          directionChanges: 0,
          count: 1,
        };
        continue;
      }
      const delta = item.value - segment.lastValue;
      const sign = Math.sign(delta);
      if (sign !== 0 && segment.lastSign !== 0 && sign !== segment.lastSign) {
        segment.directionChanges += 1;
      }
      if (sign !== 0) {
        segment.lastSign = sign;
      }
      segment.lastTick = item.tick;
      segment.lastValue = item.value;
      segment.minValue = Math.min(segment.minValue, item.value);
      segment.maxValue = Math.max(segment.maxValue, item.value);
      segment.count += 1;
    }
    flush();
  });

  // Build channel-keyed vibrato windows
  const channelVibratoWindows = new Map<
    number,
    Array<{
      key: number | null;
      startMs: number;
      endMs: number;
      startTick?: number;
      endTick?: number;
      vibrato: VibratoKind;
    }>
  >();
  vibratoWindows.forEach((windows, trackIndex) => {
    const channel = trackChannelMap.get(trackIndex) ?? trackIndex;
    const windowList = channelVibratoWindows.get(channel) ?? [];
    windowList.push(...windows);
    channelVibratoWindows.set(channel, windowList);
  });

  // Build endpoint ticks
  const endpointTicksByChannel = new Map<number, number>();
  pitchBendsByChannel.forEach((bendList, channel) => {
    const sortedTicks = [...new Set(bendList.map((item) => item.tick))].sort(
      (a, b) => a - b,
    );
    let endpointTick = sortedTicks[sortedTicks.length - 1] ?? 0;
    for (let index = sortedTicks.length - 1; index >= 0; index -= 1) {
      const candidate = sortedTicks[index] ?? 0;
      const valuesAtTick = bendList
        .filter((item) => item.tick === candidate)
        .map((item) => item.value);
      if (valuesAtTick.some((candidateValue) => candidateValue === 8192)) {
        endpointTick = candidate;
        break;
      }
    }
    endpointTicksByChannel.set(channel, endpointTick);
  });

  return {
    division,
    tempoMap,
    tickShift,
    vibratoSegments,
    noteRangeByKey,
    noteOffOverrideTicks,
    sourceChannels,
    perNoteKeysAtTick,
    pitchBendsByChannel,
    endpointTicksByChannel,
    channelVibratoWindows,
  };
}
