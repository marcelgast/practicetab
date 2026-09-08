import { midi } from '@coderline/alphatab';
import { PITCH_BEND_CENTER } from './types';
import { normalizePitchBendValue, tickToMs } from './tempoMap';
import type { MidiEventBuildContext } from './midiEventContext';
import {
  type MidiEventBuilderState,
  pushExpressionSample,
  resolveChannel,
  resolveTrackIndex,
  resolveHarmonicKey,
  laneKey,
  reserveLaneForKey,
} from './midiEventResolvers';

export function processNoteOff(
  event: midi.MidiEvent,
  tick: number,
  atMs: number,
  bs: MidiEventBuilderState,
  ctx: MidiEventBuildContext,
  trackChannelMap: Map<number, number>,
  channelToTrackIndex: Map<number, number>,
  harmonicMap: Map<string, number>,
): void {
  const note = event as midi.NoteOffEvent;
  const baseChannel = resolveChannel(trackChannelMap, note.track, note.channel);
  const trackIndex = resolveTrackIndex(
    trackChannelMap,
    channelToTrackIndex,
    note.track,
    note.channel,
  );
  const noteKey =
    typeof note.noteKey === 'number' ? Math.round(note.noteKey) : 0;
  const key = resolveHarmonicKey(harmonicMap, trackIndex, tick, noteKey);
  const activeKey = laneKey(baseChannel, key);
  const lane = bs.perNoteLaneByKey.get(activeKey);
  const channel = typeof lane === 'number' ? lane : baseChannel;
  const overrideTick = ctx.noteOffOverrideTicks.get(
    `${baseChannel}:${noteKey}:${tick}`,
  );
  const effectiveTick =
    typeof overrideTick === 'number' && Number.isFinite(overrideTick)
      ? overrideTick
      : tick;
  const effectiveAtMs =
    effectiveTick === tick
      ? atMs
      : tickToMs(effectiveTick, ctx.division, ctx.tempoMap);
  bs.mapped.push({
    atMs: effectiveAtMs,
    trackId: `track-${trackIndex}`,
    channel,
    kind: { type: 'note_off', key, velocity: note.noteVelocity },
  });
  if (typeof lane === 'number') {
    const remaining = Math.max(
      0,
      (bs.perNoteActiveCountByKey.get(activeKey) ?? 1) - 1,
    );
    if (remaining > 0) {
      bs.perNoteActiveCountByKey.set(activeKey, remaining);
    } else {
      bs.perNoteActiveCountByKey.delete(activeKey);
      bs.perNoteLaneByKey.delete(activeKey);
      bs.mapped.push({
        atMs: Math.max(0, effectiveAtMs + 0.001),
        trackId: `track-${trackIndex}`,
        channel,
        kind: {
          type: 'pitch_bend',
          value: PITCH_BEND_CENTER,
          endpoint: true,
          label: 'reset',
        },
      });
    }
  }
}

export function processControlChange(
  event: midi.MidiEvent,
  tick: number,
  atMs: number,
  bs: MidiEventBuilderState,
  trackChannelMap: Map<number, number>,
  channelToTrackIndex: Map<number, number>,
): void {
  const control = event as midi.ControlChangeEvent;
  const channel = resolveChannel(
    trackChannelMap,
    control.track,
    control.channel,
  );
  const trackIndex = resolveTrackIndex(
    trackChannelMap,
    channelToTrackIndex,
    control.track,
    control.channel,
  );
  const rawValue = control.value;
  if (control.controller === 7) {
    bs.expressionDebug.cc7Events += 1;
    if (rawValue === 0) {
      bs.expressionDebug.cc7ZeroEvents += 1;
    }
    pushExpressionSample(bs, {
      type: 'cc7_event_raw',
      channel,
      trackIndex,
      tick,
      value: rawValue,
    });
  }
  if (control.controller === 7) {
    const baseline = bs.baseCc7ByChannel.get(channel);
    if (typeof baseline !== 'number' || baseline <= 0) {
      if (rawValue > 0) {
        bs.baseCc7ByChannel.set(channel, rawValue);
      }
      control.value = 127;
    } else {
      const scaled = Math.round((rawValue / baseline) * 127);
      control.value = Math.max(0, Math.min(127, scaled));
      if (control.value !== 127) {
        bs.expressionDebug.cc7ScaledEvents += 1;
      }
    }
    if (control.value === 0) {
      const last = bs.lastCc7.get(channel);
      if (typeof last === 'number' && last > 0) {
        bs.pendingCc7Restore.set(channel, last);
      }
    } else {
      bs.lastCc7.set(channel, control.value);
      bs.pendingCc7Restore.delete(channel);
    }
  }
  if (control.controller === 11) {
    bs.expressionDebug.cc11Events += 1;
    pushExpressionSample(bs, {
      type: 'cc11_event',
      channel,
      trackIndex,
      tick,
      value: rawValue,
    });
    if (control.value === 0) {
      bs.expressionDebug.zeroEvents += 1;
      const last = bs.lastCc11.get(channel);
      if (typeof last === 'number' && last > 0) {
        bs.pendingCc11Restore.set(channel, { value: last, tick });
        bs.expressionDebug.restoreQueued += 1;
        pushExpressionSample(bs, {
          type: 'cc11_restore_queue',
          channel,
          trackIndex,
          tick,
          restoreValue: last,
        });
      }
    } else {
      bs.lastCc11.set(channel, control.value);
      bs.pendingCc11Restore.delete(channel);
    }
  }
  bs.mapped.push({
    atMs,
    trackId: `track-${trackIndex}`,
    channel,
    kind: {
      type: 'control_change',
      controller: control.controller as number,
      value: control.value,
    },
  });
  if (control.controller === 7 || control.controller === 11) {
    pushExpressionSample(bs, {
      type: control.controller === 7 ? 'cc7_event_mapped' : 'cc11_event_mapped',
      channel,
      trackIndex,
      tick,
      value: control.value,
    });
  }
  const controlState =
    bs.lastControlsByChannel.get(channel) ?? new Map<number, number>();
  controlState.set(control.controller as number, control.value);
  bs.lastControlsByChannel.set(channel, controlState);
}

export function processPerNotePitchBend(
  event: midi.MidiEvent,
  atMs: number,
  bs: MidiEventBuilderState,
  ctx: MidiEventBuildContext,
  trackChannelMap: Map<number, number>,
  channelToTrackIndex: Map<number, number>,
): void {
  const bend = event as midi.Midi20PerNotePitchBendEvent;
  const raw =
    typeof bend.pitch === 'number'
      ? bend.pitch
      : ((bend as unknown as { value?: number }).value ?? 0);
  const eventTrack = (bend as unknown as { track?: number }).track;
  const eventChannel = (bend as unknown as { channel?: number }).channel;
  const baseChannel =
    typeof eventChannel === 'number'
      ? Math.max(0, Math.min(15, eventChannel))
      : typeof eventTrack === 'number'
        ? Math.max(0, Math.min(15, eventTrack))
        : resolveChannel(trackChannelMap, eventTrack, eventChannel);
  const trackIndex = resolveTrackIndex(
    trackChannelMap,
    channelToTrackIndex,
    eventTrack,
    eventChannel,
  );
  const noteKeyRaw = (bend as unknown as { noteKey?: number }).noteKey;
  const noteKey =
    typeof noteKeyRaw === 'number' && Number.isFinite(noteKeyRaw)
      ? Math.round(noteKeyRaw)
      : null;
  const channel =
    noteKey !== null
      ? reserveLaneForKey(bs, ctx, baseChannel, noteKey, trackIndex, atMs)
      : baseChannel;
  const value = normalizePitchBendValue(raw);
  bs.mapped.push({
    atMs,
    trackId: `track-${trackIndex}`,
    channel,
    kind: { type: 'pitch_bend', value, endpoint: false, label: 'bend' },
  });
}
