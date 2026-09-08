import type { AudioTabEvent } from '../audioTabCommands';
import type { VibratoKind } from './types';
import { PITCH_BEND_CENTER } from './types';
import type { MidiEventBuildContext as MidiEventContext } from './midiEventContext';

/** Mutable state accumulated while building audio events. */
export interface MidiEventBuilderState {
  mapped: AudioTabEvent[];
  lastCc7: Map<number, number>;
  lastCc11: Map<number, number>;
  pendingCc7Restore: Map<number, number>;
  pendingCc11Restore: Map<number, { value: number; tick: number }>;
  lastPitchBendTick: Map<number, number>;
  lastProgramByChannel: Map<number, number>;
  lastControlsByChannel: Map<number, Map<number, number>>;
  perNoteLaneByKey: Map<string, number>;
  perNoteActiveCountByKey: Map<string, number>;
  baseCc7ByChannel: Map<number, number>;
  expressionDebug: {
    cc11Events: number;
    cc7Events: number;
    cc7ZeroEvents: number;
    cc7ScaledEvents: number;
    zeroEvents: number;
    restoreQueued: number;
    restoreApplied: number;
    restoreSkippedSameTick: number;
    noteOns: number;
  };
  expressionSamples: Array<Record<string, unknown>>;
}

export function createBuilderState(): MidiEventBuilderState {
  return {
    mapped: [],
    lastCc7: new Map(),
    lastCc11: new Map(),
    pendingCc7Restore: new Map(),
    pendingCc11Restore: new Map(),
    lastPitchBendTick: new Map(),
    lastProgramByChannel: new Map(),
    lastControlsByChannel: new Map(),
    perNoteLaneByKey: new Map(),
    perNoteActiveCountByKey: new Map(),
    baseCc7ByChannel: new Map(),
    expressionDebug: {
      cc11Events: 0,
      cc7Events: 0,
      cc7ZeroEvents: 0,
      cc7ScaledEvents: 0,
      zeroEvents: 0,
      restoreQueued: 0,
      restoreApplied: 0,
      restoreSkippedSameTick: 0,
      noteOns: 0,
    },
    expressionSamples: [],
  };
}

export function pushExpressionSample(
  bs: MidiEventBuilderState,
  entry: Record<string, unknown>,
): void {
  if (bs.expressionSamples.length >= 24) {
    return;
  }
  bs.expressionSamples.push(entry);
}

export function resolveChannel(
  trackChannelMap: Map<number, number>,
  track: number | undefined,
  channel?: number,
): number {
  if (typeof channel === 'number') {
    return Math.max(0, Math.min(15, channel));
  }
  if (typeof track === 'number' && trackChannelMap.has(track)) {
    return trackChannelMap.get(track) ?? 0;
  }
  return 0;
}

export function resolveTrackIndex(
  trackChannelMap: Map<number, number>,
  channelToTrackIndex: Map<number, number>,
  track: number | undefined,
  channel?: number,
): number {
  if (typeof track === 'number' && trackChannelMap.has(track)) {
    return track;
  }
  if (typeof channel === 'number') {
    const m = channelToTrackIndex.get(channel);
    if (typeof m === 'number') {
      return m;
    }
  }
  return typeof track === 'number' && Number.isFinite(track) ? track : 0;
}

export function resolveHarmonicKey(
  harmonicMap: Map<string, number>,
  trackIndex: number,
  tick: number,
  key: number,
): number {
  const mapKey = `${trackIndex}:${tick}:${key}`;
  const mappedKey = harmonicMap.get(mapKey);
  if (typeof mappedKey === 'number' && Number.isFinite(mappedKey)) {
    return Math.max(0, Math.min(127, Math.round(mappedKey)));
  }
  return key;
}

export function laneKey(baseChannel: number, key: number): string {
  return `${baseChannel}:${key}`;
}

export function reserveLaneForKey(
  bs: MidiEventBuilderState,
  ctx: MidiEventContext,
  baseChannel: number,
  key: number,
  trackIndex: number,
  atMs: number,
): number {
  const lookupKey = laneKey(baseChannel, key);
  const existing = bs.perNoteLaneByKey.get(lookupKey);
  if (typeof existing === 'number') {
    return existing;
  }
  let lane: number | null = null;
  for (let candidate = 15; candidate >= 0; candidate -= 1) {
    if (candidate === 9 || candidate === baseChannel) {
      continue;
    }
    if (ctx.sourceChannels.has(candidate)) {
      continue;
    }
    if ([...bs.perNoteLaneByKey.values()].includes(candidate)) {
      continue;
    }
    lane = candidate;
    break;
  }
  if (lane === null) {
    return baseChannel;
  }
  bs.perNoteLaneByKey.set(lookupKey, lane);
  const offset = Math.max(0, atMs - 0.002);
  const program = bs.lastProgramByChannel.get(baseChannel);
  if (typeof program === 'number') {
    bs.mapped.push({
      atMs: offset,
      trackId: `track-${trackIndex}`,
      channel: lane,
      kind: { type: 'program_change', program },
    });
  }
  const controls = bs.lastControlsByChannel.get(baseChannel);
  if (controls) {
    controls.forEach((value, controller) => {
      bs.mapped.push({
        atMs: offset,
        trackId: `track-${trackIndex}`,
        channel: lane as number,
        kind: { type: 'control_change', controller, value },
      });
    });
  }
  return lane;
}

export function resolveOutputChannelForNote(
  bs: MidiEventBuilderState,
  ctx: MidiEventContext,
  baseChannel: number,
  key: number,
  tick: number,
  trackIndex: number,
  atMs: number,
): number {
  const lookupKey = laneKey(baseChannel, key);
  const existing = bs.perNoteLaneByKey.get(lookupKey);
  if (typeof existing === 'number') {
    return existing;
  }
  const pendingKeys = ctx.perNoteKeysAtTick.get(tick);
  if (pendingKeys?.has(lookupKey)) {
    return reserveLaneForKey(bs, ctx, baseChannel, key, trackIndex, atMs);
  }
  return baseChannel;
}

export function vibratoMatch(
  ctx: MidiEventContext,
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
  trackIndex: number,
  channel: number,
  key: number,
  atMs: number,
  tick: number,
): {
  startMs: number;
  endMs: number;
  startTick?: number;
  endTick?: number;
  vibrato: VibratoKind;
} | null {
  const windowList =
    vibratoWindows.get(trackIndex) ??
    ctx.channelVibratoWindows.get(channel) ??
    [];
  const tickTolerance = 2;
  const segments = ctx.vibratoSegments.get(channel) ?? [];
  if (segments.some((s) => tick >= s.startTick && tick <= s.endTick)) {
    return {
      startMs: atMs,
      endMs: atMs + 1,
      startTick: tick,
      endTick: tick,
      vibrato: 'slight',
    };
  }
  const tickMatch = windowList.find((w) => {
    if (w.key !== null && w.key !== key) {
      return false;
    }
    if (typeof w.startTick === 'number' && typeof w.endTick === 'number') {
      return (
        tick + tickTolerance >= w.startTick && tick <= w.endTick + tickTolerance
      );
    }
    return false;
  });
  if (tickMatch) {
    return tickMatch;
  }
  const keyAgnostic = windowList.find((w) => {
    if (typeof w.startTick === 'number' && typeof w.endTick === 'number') {
      return (
        tick + tickTolerance >= w.startTick && tick <= w.endTick + tickTolerance
      );
    }
    return false;
  });
  if (keyAgnostic) {
    return keyAgnostic;
  }
  let timeFallback: {
    startMs: number;
    endMs: number;
    startTick?: number;
    endTick?: number;
    vibrato: VibratoKind;
  } | null = null;
  for (const w of windowList) {
    if (w.key !== null && w.key !== key) {
      continue;
    }
    if (atMs + 6 >= w.startMs && atMs <= w.endMs + 6) {
      if (w.key === null) {
        timeFallback = w;
        continue;
      }
      return w;
    }
  }
  return timeFallback;
}

export function hasPitchBendMotionInRange(
  ctx: MidiEventContext,
  channel: number,
  startTick: number,
  endTick: number,
): boolean {
  const bends = ctx.pitchBendsByChannel.get(channel) ?? [];
  if (bends.length === 0) {
    return false;
  }
  const from = Math.max(0, startTick - 2);
  const to = endTick + 2;
  return bends.some(
    (item) =>
      item.tick >= from &&
      item.tick <= to &&
      Math.abs(item.value - PITCH_BEND_CENTER) > 80,
  );
}

export function resolveWindowVibratoForRange(
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
  ctx: MidiEventContext,
  trackIndex: number,
  channel: number,
  key: number,
  startTick: number,
  endTick: number,
): 'slight' | 'wide' | null {
  const windowList =
    vibratoWindows.get(trackIndex) ??
    ctx.channelVibratoWindows.get(channel) ??
    [];
  const match = windowList.find((w) => {
    if (w.key !== null && w.key !== key) {
      return false;
    }
    if (typeof w.startTick !== 'number' || typeof w.endTick !== 'number') {
      return false;
    }
    return w.startTick <= endTick && w.endTick >= startTick;
  });
  if (!match) {
    return null;
  }
  return match.vibrato === 'wide' ? 'wide' : 'slight';
}

export function resolveSegmentVibratoForNote(
  ctx: MidiEventContext,
  channel: number,
  key: number,
  tick: number,
): 'slight' | 'wide' | null {
  const segments = ctx.vibratoSegments.get(channel) ?? [];
  if (segments.length === 0) {
    return null;
  }
  const range = ctx.noteRangeByKey.get(`${channel}:${key}:${tick}`);
  if (!range) {
    return null;
  }
  return segments.some(
    (s) => s.startTick <= range.endTick && s.endTick >= range.startTick,
  )
    ? 'slight'
    : null;
}

export function applyPendingRestores(
  bs: MidiEventBuilderState,
  channel: number,
  trackIndex: number,
  atMs: number,
  noteTick: number,
): void {
  const offset = Math.max(0, atMs - 0.001);
  const pending7 = bs.pendingCc7Restore.get(channel);
  if (typeof pending7 === 'number') {
    bs.mapped.push({
      atMs: offset,
      trackId: `track-${trackIndex}`,
      channel,
      kind: { type: 'control_change', controller: 7, value: pending7 },
    });
    bs.pendingCc7Restore.delete(channel);
  }
  const pending11 = bs.pendingCc11Restore.get(channel);
  if (pending11 && noteTick > pending11.tick) {
    bs.expressionDebug.restoreApplied += 1;
    pushExpressionSample(bs, {
      type: 'cc11_restore_apply',
      channel,
      trackIndex,
      noteTick,
      restoreFromTick: pending11.tick,
      value: pending11.value,
    });
    bs.mapped.push({
      atMs: offset,
      trackId: `track-${trackIndex}`,
      channel,
      kind: {
        type: 'control_change',
        controller: 11,
        value: pending11.value,
      },
    });
    bs.pendingCc11Restore.delete(channel);
  } else if (pending11 && noteTick <= pending11.tick) {
    bs.expressionDebug.restoreSkippedSameTick += 1;
    pushExpressionSample(bs, {
      type: 'cc11_restore_skip_same_tick',
      channel,
      trackIndex,
      noteTick,
      restoreFromTick: pending11.tick,
      value: pending11.value,
    });
  }
}
