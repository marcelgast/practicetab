import { midi } from '@coderline/alphatab';
import type { AudioTabEvent } from '../audioTabCommands';
import { appendDevLog } from '../devLog';
import type { TempoPoint, VibratoKind } from './types';
import { resolveProgramForTrack } from './utils';
import { normalizePitchBendValue, tickToMs } from './tempoMap';
import { buildMidiEventContext } from './midiEventContext';
import {
  type MidiEventBuilderState,
  createBuilderState,
  resolveChannel,
  resolveTrackIndex,
  resolveHarmonicKey,
  laneKey,
  resolveOutputChannelForNote,
  vibratoMatch,
  hasPitchBendMotionInRange,
  resolveWindowVibratoForRange,
  resolveSegmentVibratoForNote,
  applyPendingRestores,
} from './midiEventResolvers';
import {
  processNoteOff,
  processControlChange,
  processPerNotePitchBend,
} from './midiEventProcessors';

const devLog = (message: string, details?: Record<string, unknown>) => {
  if (!import.meta.env.DEV) {
    return;
  }
  appendDevLog(
    JSON.stringify({
      source: 'src/services/alphatabPlayer.ts',
      fn: 'createAlphaTabPlayer',
      message,
      details: details ?? {},
      ts: Date.now(),
    }),
  );
};

export function buildAudioEvents(
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
  letRingEndMap: Map<string, number> = new Map(),
  trackProgramsByIndex?: Map<number, number>,
  initialUsPerQuarter = 500000,
): { events: AudioTabEvent[]; tempoMap: TempoPoint[]; durationMs: number } {
  const ctx = buildMidiEventContext(
    midiFile,
    trackChannelMap,
    channelToTrackIndex,
    vibratoWindows,
    harmonicMap,
    letRingEndMap,
    initialUsPerQuarter,
  );
  const { division, tempoMap, tickShift } = ctx;
  const events = midiFile.events ?? [];
  const bs: MidiEventBuilderState = createBuilderState();
  let durationMs = 0;

  // First pass: track last pitch bend ticks
  for (const event of events) {
    const tick = event.tick - tickShift;
    if (
      event.type === midi.MidiEventType.PitchBend ||
      event.type === midi.MidiEventType.PerNotePitchBend
    ) {
      const bend = event as midi.PitchBendEvent;
      const channel = resolveChannel(trackChannelMap, bend.track, bend.channel);
      const last =
        bs.lastPitchBendTick.get(channel) ?? Number.NEGATIVE_INFINITY;
      if (tick > last) {
        bs.lastPitchBendTick.set(channel, tick);
      }
    }
  }

  // Second pass: generate audio events
  for (const event of events) {
    const tick = event.tick - tickShift;
    const atMs = tickToMs(tick, division, tempoMap);
    durationMs = Math.max(durationMs, atMs);
    processEvent(
      event,
      tick,
      atMs,
      bs,
      ctx,
      trackChannelMap,
      channelToTrackIndex,
      vibratoWindows,
      harmonicMap,
      trackProgramsByIndex,
    );
  }

  if (
    bs.expressionDebug.cc11Events > 0 ||
    bs.expressionDebug.restoreQueued > 0
  ) {
    devLog('audio_expression_mapping_debug', {
      summary: bs.expressionDebug,
      samples: bs.expressionSamples,
      cc7Baselines: Object.fromEntries(bs.baseCc7ByChannel.entries()),
      totalMappedEvents: bs.mapped.length,
    });
  }
  return { events: bs.mapped, tempoMap, durationMs };
}

function processEvent(
  event: midi.MidiEvent,
  tick: number,
  atMs: number,
  bs: MidiEventBuilderState,
  ctx: ReturnType<typeof buildMidiEventContext>,
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
  trackProgramsByIndex?: Map<number, number>,
): void {
  switch (event.type) {
    case midi.MidiEventType.NoteOn: {
      processNoteOn(
        event,
        tick,
        atMs,
        bs,
        ctx,
        trackChannelMap,
        channelToTrackIndex,
        vibratoWindows,
        harmonicMap,
      );
      break;
    }
    case midi.MidiEventType.NoteOff: {
      processNoteOff(
        event,
        tick,
        atMs,
        bs,
        ctx,
        trackChannelMap,
        channelToTrackIndex,
        harmonicMap,
      );
      break;
    }
    case midi.MidiEventType.ProgramChange: {
      const program = event as midi.ProgramChangeEvent;
      const channel = resolveChannel(
        trackChannelMap,
        program.track,
        program.channel,
      );
      const trackIndex = resolveTrackIndex(
        trackChannelMap,
        channelToTrackIndex,
        program.track,
        program.channel,
      );
      const resolvedProgram = resolveProgramForTrack(
        trackIndex,
        program.program,
        trackProgramsByIndex,
      );
      bs.mapped.push({
        atMs,
        trackId: `track-${trackIndex}`,
        channel,
        kind: { type: 'program_change', program: resolvedProgram },
      });
      bs.lastProgramByChannel.set(channel, resolvedProgram);
      break;
    }
    case midi.MidiEventType.ControlChange: {
      processControlChange(
        event,
        tick,
        atMs,
        bs,
        trackChannelMap,
        channelToTrackIndex,
      );
      break;
    }
    case midi.MidiEventType.PitchBend: {
      const bend = event as midi.PitchBendEvent;
      const channel = resolveChannel(trackChannelMap, bend.track, bend.channel);
      const trackIndex = resolveTrackIndex(
        trackChannelMap,
        channelToTrackIndex,
        bend.track,
        bend.channel,
      );
      const value = normalizePitchBendValue(bend.value);
      const endpoint =
        tick ===
        (ctx.endpointTicksByChannel.get(channel) ??
          bs.lastPitchBendTick.get(channel) ??
          tick);
      bs.mapped.push({
        atMs,
        trackId: `track-${trackIndex}`,
        channel,
        kind: {
          type: 'pitch_bend',
          value,
          endpoint,
          label: endpoint ? 'bend' : undefined,
        },
      });
      break;
    }
    case midi.MidiEventType.PerNotePitchBend: {
      processPerNotePitchBend(
        event,
        atMs,
        bs,
        ctx,
        trackChannelMap,
        channelToTrackIndex,
      );
      break;
    }
    default:
      break;
  }
}

function processNoteOn(
  event: midi.MidiEvent,
  tick: number,
  atMs: number,
  bs: MidiEventBuilderState,
  ctx: ReturnType<typeof buildMidiEventContext>,
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
): void {
  const note = event as midi.NoteOnEvent;
  const baseChannel = resolveChannel(trackChannelMap, note.track, note.channel);
  const trackIndex = resolveTrackIndex(
    trackChannelMap,
    channelToTrackIndex,
    note.track,
    note.channel,
  );
  const noteKey =
    typeof note.noteKey === 'number' ? Math.round(note.noteKey) : 0;
  const channel = resolveOutputChannelForNote(
    bs,
    ctx,
    baseChannel,
    noteKey,
    tick,
    trackIndex,
    atMs,
  );
  const vibratoWindow = vibratoMatch(
    ctx,
    vibratoWindows,
    trackIndex,
    baseChannel,
    noteKey,
    atMs,
    tick,
  );
  const segmentVibrato = resolveSegmentVibratoForNote(
    ctx,
    baseChannel,
    noteKey,
    tick,
  );
  const noteRange = ctx.noteRangeByKey.get(`${baseChannel}:${noteKey}:${tick}`);
  const hasPBMotion =
    noteRange !== undefined
      ? hasPitchBendMotionInRange(
          ctx,
          baseChannel,
          noteRange.startTick,
          noteRange.endTick,
        )
      : false;
  const rangeVibrato =
    noteRange !== undefined
      ? resolveWindowVibratoForRange(
          vibratoWindows,
          ctx,
          trackIndex,
          baseChannel,
          noteKey,
          noteRange.startTick,
          noteRange.endTick,
        )
      : null;
  const explicitVib =
    vibratoWindow?.vibrato === 'slight' || vibratoWindow?.vibrato === 'wide'
      ? vibratoWindow.vibrato
      : rangeVibrato;
  const noteVibrato = hasPBMotion
    ? undefined
    : (explicitVib ?? segmentVibrato ?? undefined);
  bs.expressionDebug.noteOns += 1;
  applyPendingRestores(bs, baseChannel, trackIndex, atMs, tick);
  const key = resolveHarmonicKey(harmonicMap, trackIndex, tick, noteKey);
  const velocity = Math.max(1, note.noteVelocity ?? 0);
  if (channel !== baseChannel && velocity > 0) {
    const activeKey = laneKey(baseChannel, key);
    bs.perNoteActiveCountByKey.set(
      activeKey,
      (bs.perNoteActiveCountByKey.get(activeKey) ?? 0) + 1,
    );
  }
  bs.mapped.push({
    atMs,
    trackId: `track-${trackIndex}`,
    channel,
    kind: { type: 'note_on', key, velocity, vibrato: noteVibrato },
  });
}
