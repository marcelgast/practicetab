import type { AudioTabEvent } from '../audioTabCommands';
import { appendDevLog } from '../devLog';
import type { AlphaTabScore, AlphaTabTrack, TempoPoint } from './types';
import type { ATNote } from './alphaTabTypes';
import {
  EXPRESSION_MAX,
  FADE_STEPS,
  FADE_TYPE_IN,
  FADE_TYPE_NONE,
  FADE_TYPE_OUT,
  FADE_TYPE_SWELL,
} from './types';
import { clampMidiKey, safeTrackStaves } from './utils';
import { tickToMs } from './tempoMap';

export function buildFadeExpressionEvents(params: {
  score: AlphaTabScore;
  tempoMap: TempoPoint[];
  division: number;
  midiTickShift?: number;
  tickCache: {
    getBeatStart?: (beat: unknown) => number;
    findBeat?: (
      tracks: Set<number>,
      tick: number,
    ) => {
      beatLookup?: { duration?: number };
      tickDuration?: number;
    } | null;
  } | null;
  trackChannelMap: Map<number, number>;
  channelToTrackIndex: Map<number, number>;
}): AudioTabEvent[] {
  const {
    score,
    tempoMap,
    division,
    midiTickShift = 0,
    tickCache,
    trackChannelMap,
    channelToTrackIndex,
  } = params;
  const events: AudioTabEvent[] = [];
  const pushRamp = (
    trackId: string,
    channel: number,
    startMs: number,
    endMs: number,
    from: number,
    to: number,
  ) => {
    const safeStart = Math.max(0, startMs);
    const safeEnd = Math.max(safeStart, endMs);
    const duration = safeEnd - safeStart;
    const steps = Math.max(1, FADE_STEPS);
    for (let step = 0; step <= steps; step += 1) {
      const t = safeStart + (duration * step) / steps;
      const value = Math.round(from + ((to - from) * step) / steps);
      events.push({
        atMs: t,
        trackId,
        channel,
        kind: {
          type: 'control_change',
          controller: 11,
          value: Math.max(0, Math.min(EXPRESSION_MAX, value)),
        },
      });
    }
  };
  const tracks =
    ((score.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [];
  tracks.forEach((track: AlphaTabTrack, trackIdx: number) => {
    if (!track) {
      return;
    }
    const trackIndex =
      typeof track.index === 'number' && Number.isFinite(track.index)
        ? track.index
        : trackIdx;
    const trackId = `track-${trackIndex}`;
    const channelSet = new Set<number>();
    const primaryChannel = trackChannelMap.get(trackIndex) ?? trackIndex;
    channelSet.add(primaryChannel);
    channelToTrackIndex.forEach((mappedTrackIndex, channel) => {
      if (mappedTrackIndex === trackIndex) {
        channelSet.add(channel);
      }
    });
    const channels = [...channelSet];
    const trackLookup = new Set<number>([trackIndex]);
    const staves = safeTrackStaves(track);
    staves.forEach((staff) => {
      (staff.bars ?? []).forEach((bar) => {
        (bar.voices ?? []).forEach((voice) => {
          (voice.beats ?? []).forEach((beat) => {
            const fadeType =
              Number.isFinite(beat?.fade) &&
              Math.round(Number(beat.fade)) >= FADE_TYPE_NONE
                ? Math.round(Number(beat.fade))
                : beat?.fadeIn
                  ? FADE_TYPE_IN
                  : FADE_TYPE_NONE;
            if (fadeType === FADE_TYPE_NONE) {
              return;
            }
            const notes = (beat?.notes ?? []) as unknown[];
            if (notes.length === 0) {
              return;
            }
            const rawBeatStart =
              tickCache?.getBeatStart?.(beat) ??
              (typeof beat?.absolutePlaybackStart === 'number'
                ? beat.absolutePlaybackStart
                : null);
            if (
              typeof rawBeatStart !== 'number' ||
              !Number.isFinite(rawBeatStart)
            ) {
              return;
            }
            const beatStartTick = Math.round(rawBeatStart - midiTickShift);
            const beatLookup =
              tickCache?.findBeat?.(trackLookup, rawBeatStart) ?? null;
            const displayDuration =
              typeof beat?.displayDuration === 'number' &&
              Number.isFinite(beat.displayDuration) &&
              beat.displayDuration > 0
                ? Math.round(beat.displayDuration)
                : 0;
            const playbackDuration =
              typeof beat?.playbackDuration === 'number' &&
              Number.isFinite(beat.playbackDuration) &&
              beat.playbackDuration > 0
                ? Math.round(beat.playbackDuration)
                : 0;
            const lookupDuration =
              beatLookup?.beatLookup?.duration ?? beatLookup?.tickDuration ?? 0;
            const beatDurationTicks =
              displayDuration || playbackDuration || lookupDuration || 0;
            if (
              typeof beatDurationTicks !== 'number' ||
              !Number.isFinite(beatDurationTicks) ||
              beatDurationTicks <= 0
            ) {
              return;
            }
            const startMs = tickToMs(beatStartTick, division, tempoMap);
            const endMs = tickToMs(
              beatStartTick + Math.round(beatDurationTicks),
              division,
              tempoMap,
            );
            if (!(endMs > startMs)) {
              return;
            }
            const startOffset = Math.max(0, startMs - 0.001);
            switch (fadeType) {
              case FADE_TYPE_IN:
                channels.forEach((channel) => {
                  pushRamp(
                    trackId,
                    channel,
                    startOffset,
                    endMs,
                    0,
                    EXPRESSION_MAX,
                  );
                });
                break;
              case FADE_TYPE_OUT:
                channels.forEach((channel) => {
                  pushRamp(
                    trackId,
                    channel,
                    startOffset,
                    endMs,
                    EXPRESSION_MAX,
                    0,
                  );
                  events.push({
                    atMs: endMs,
                    trackId,
                    channel,
                    kind: {
                      type: 'control_change',
                      controller: 11,
                      value: EXPRESSION_MAX,
                    },
                  });
                });
                break;
              case FADE_TYPE_SWELL: {
                const midMs = startOffset + (endMs - startOffset) / 2;
                channels.forEach((channel) => {
                  pushRamp(
                    trackId,
                    channel,
                    startOffset,
                    midMs,
                    EXPRESSION_MAX,
                    0,
                  );
                  pushRamp(trackId, channel, midMs, endMs, 0, EXPRESSION_MAX);
                  events.push({
                    atMs: endMs,
                    trackId,
                    channel,
                    kind: {
                      type: 'control_change',
                      controller: 11,
                      value: EXPRESSION_MAX,
                    },
                  });
                });
                break;
              }
              default:
                break;
            }
          });
        });
      });
    });
  });
  return events;
}

export function buildLetRingEndMap(params: {
  score: AlphaTabScore;
  tickCache: {
    getBeatStart?: (beat: unknown) => number;
    findBeat?: (
      tracks: Set<number>,
      tick: number,
    ) => {
      beatLookup?: { duration?: number };
      tickDuration?: number;
    } | null;
  } | null;
  harmonicMap: Map<string, number>;
  midiTickShift: number;
}): Map<string, number> {
  const { score, tickCache, midiTickShift, harmonicMap } = params;
  if (!tickCache?.getBeatStart) {
    return new Map();
  }
  const safeTickCache = tickCache as {
    getBeatStart: (beat: unknown) => number;
    findBeat?: (
      tracks: Set<number>,
      tick: number,
    ) => {
      beatLookup?: { duration?: number };
      tickDuration?: number;
    } | null;
  };
  const resolveBeatStart = (beat: unknown): number | null => {
    if (!beat) {
      return null;
    }
    const raw = safeTickCache.getBeatStart?.(beat);
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.round(raw);
    }
    const absolute = (beat as { absolutePlaybackStart?: number | null })
      .absolutePlaybackStart;
    if (typeof absolute === 'number' && Number.isFinite(absolute)) {
      return Math.round(absolute);
    }
    return null;
  };
  const resolveBeatDuration = (
    beat: unknown,
    trackIndex: number,
    rawStart: number,
  ): number => {
    if (!beat) {
      return 0;
    }
    const beatAny = beat as {
      displayDuration?: number;
      playbackDuration?: number;
      duration?: number;
    };
    const displayDuration =
      typeof beatAny.displayDuration === 'number' &&
      Number.isFinite(beatAny.displayDuration) &&
      beatAny.displayDuration > 0
        ? Math.round(beatAny.displayDuration)
        : 0;
    const playbackDuration =
      typeof beatAny.playbackDuration === 'number' &&
      Number.isFinite(beatAny.playbackDuration) &&
      beatAny.playbackDuration > 0
        ? Math.round(beatAny.playbackDuration)
        : 0;
    const duration =
      typeof beatAny.duration === 'number' &&
      Number.isFinite(beatAny.duration) &&
      beatAny.duration > 0
        ? Math.round(beatAny.duration)
        : 0;
    const lookup =
      safeTickCache.findBeat?.(new Set([trackIndex]), rawStart) ?? null;
    const lookupDuration =
      lookup?.beatLookup?.duration ?? lookup?.tickDuration ?? 0;
    return (
      displayDuration || playbackDuration || duration || lookupDuration || 0
    );
  };
  const map = new Map<string, number>();
  let noteLetRingCount = 0;
  let beatLetRingCount = 0;
  const letRingSamples: Array<Record<string, unknown>> = [];
  const tracks =
    ((score.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [];
  tracks.forEach((track: AlphaTabTrack, trackIdx: number) => {
    if (!track) {
      return;
    }
    const trackIndex =
      typeof track.index === 'number' && Number.isFinite(track.index)
        ? track.index
        : trackIdx;
    const staves = safeTrackStaves(track);
    staves.forEach((staff) => {
      (staff.bars ?? []).forEach((bar) => {
        (bar.voices ?? []).forEach((voice) => {
          (voice.beats ?? []).forEach((beat) => {
            const rawTick = resolveBeatStart(beat);
            if (typeof rawTick !== 'number' || !Number.isFinite(rawTick)) {
              return;
            }
            const beatTick = Math.round(rawTick - midiTickShift);
            const beatDurationTicks = resolveBeatDuration(
              beat,
              trackIndex,
              rawTick,
            );
            const beatHasLetRing = Boolean(beat?.isLetRing);
            if (beatHasLetRing) {
              beatLetRingCount += 1;
            }
            const notes: ATNote[] = (beat.notes ?? []) as ATNote[];
            notes.forEach((note) => {
              const noteHasLetRing = Boolean(note.isLetRing);
              if (noteHasLetRing) {
                noteLetRingCount += 1;
              }
              if (!noteHasLetRing && !beatHasLetRing) {
                return;
              }
              const baseValue =
                note.calculateRealValue?.(true, false) ??
                note.realValueWithoutHarmonic ??
                note.realValue ??
                note.midiNote ??
                note.note ??
                NaN;
              if (!Number.isFinite(baseValue)) {
                return;
              }
              let endTick: number | null = null;
              if (noteHasLetRing) {
                const destinationNote = note.letRingDestination;
                const destinationBeat = destinationNote?.beat ?? null;
                const destinationStart = resolveBeatStart(destinationBeat);
                if (
                  typeof destinationStart === 'number' &&
                  Number.isFinite(destinationStart)
                ) {
                  const destDuration = resolveBeatDuration(
                    destinationBeat,
                    trackIndex,
                    destinationStart,
                  );
                  const destStartTick = Math.round(
                    destinationStart - midiTickShift,
                  );
                  endTick =
                    destDuration > 0
                      ? destStartTick + destDuration
                      : destStartTick;
                }
              }
              if (endTick === null && beatHasLetRing && beatDurationTicks > 0) {
                endTick = beatTick + beatDurationTicks;
              }
              if (endTick === null && beatDurationTicks > 0) {
                endTick = beatTick + beatDurationTicks;
              }
              if (
                typeof endTick !== 'number' ||
                !Number.isFinite(endTick) ||
                endTick <= beatTick
              ) {
                return;
              }
              const baseKey = clampMidiKey(baseValue);
              const harmonicKey =
                harmonicMap.get(`${trackIndex}:${beatTick}:${baseKey}`) ??
                baseKey;
              const key = `${trackIndex}:${beatTick}:${clampMidiKey(harmonicKey)}`;
              map.set(key, Math.round(endTick));
              if (import.meta.env.DEV && letRingSamples.length < 8) {
                letRingSamples.push({
                  trackIndex,
                  beatTick,
                  beatHasLetRing,
                  noteHasLetRing,
                  key: clampMidiKey(harmonicKey),
                  endTick,
                });
              }
            });
          });
        });
      });
    });
  });
  if (import.meta.env.DEV) {
    appendDevLog(
      JSON.stringify({
        source: 'src/services/alphatabPlayer.ts',
        fn: 'buildLetRingEndMap',
        message: 'let_ring_scan_summary',
        details: {
          noteLetRingCount,
          beatLetRingCount,
          mapSize: map.size,
          samples: letRingSamples,
        },
        ts: Date.now(),
      }),
    );
  }
  return map;
}
