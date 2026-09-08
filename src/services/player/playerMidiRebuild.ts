import { midi, type Settings } from '@coderline/alphatab';
import {
  prepareTab,
  scheduleEvents,
  type TempoPointPayload,
} from '../audioTabCommands';
import { appendDevLog } from '../devLog';
import type {
  AlphaTabScore,
  AlphaTabTrack,
  PitchBendDebugBeat,
  PitchBendDebugEvent,
  PitchBendDebugLookup,
  TempoPoint,
} from './types';
import type {
  ATBar,
  ATVoice,
  ATBeat,
  ATNote,
  ATTickCache,
} from './alphaTabTypes';
import {
  safeArray,
  safeTrackStaves,
  resolveEffectiveMidiTickShift,
  trackHasPlayableNotation,
} from './utils';
import {
  buildTempoMap,
  compareAudioEvents,
  normalizePitchBendValue,
  tickToMs,
} from './tempoMap';
import { buildAudioEvents } from './midiEventBuilder';
import { buildVibratoWindows } from './vibrato';
import { resolveVibrato } from './vibrato';
import { buildHarmonicMap, buildLegatoSlideEvents } from './scoreAnalysis';
import { buildLetRingEndMap } from './fadeAndLetRing';
import type { PlayerState } from './playerState';
import { applyPlayheadMs } from './playerHelpers';

export function rebuildMidi(s: PlayerState, score: AlphaTabScore): void {
  try {
    const midiFile = new midi.MidiFile();
    const handler = new midi.AlphaSynthMidiFileHandler(midiFile, true);
    const generator = new midi.MidiFileGenerator(
      score as unknown as ConstructorParameters<
        typeof midi.MidiFileGenerator
      >[0],
      (s.api.settings as Settings | undefined) ?? null,
      handler,
    );
    generator.applyTranspositionPitches = true;
    generator.generate();
    const trackChannelMap = new Map<number, number>();
    const scoreTracks =
      ((score.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [];
    const playableTrackIndexes = new Set<number>();
    scoreTracks.forEach((track: AlphaTabTrack, idx: number) => {
      if (!track || !trackHasPlayableNotation(track)) {
        return;
      }
      const index =
        typeof track.index === 'number' && Number.isFinite(track.index)
          ? track.index
          : idx;
      playableTrackIndexes.add(index);
    });
    const hasNonPlayableTracks =
      scoreTracks.length > 0 && playableTrackIndexes.size < scoreTracks.length;
    scoreTracks.forEach((track: AlphaTabTrack, idx: number) => {
      if (!track) {
        return;
      }
      const index =
        typeof track.index === 'number' && Number.isFinite(track.index)
          ? track.index
          : idx;
      if (playableTrackIndexes.size > 0 && !playableTrackIndexes.has(index)) {
        return;
      }
      const playbackInfo = (track as { playbackInfo?: unknown }).playbackInfo;
      const isPercussion =
        (track as { isPercussion?: unknown }).isPercussion === true;
      const channel =
        typeof (playbackInfo as { primaryChannel?: number } | undefined)
          ?.primaryChannel === 'number'
          ? ((playbackInfo as { primaryChannel?: number }).primaryChannel ?? 0)
          : isPercussion
            ? 9
            : 0;
      trackChannelMap.set(index, Math.max(0, Math.min(15, channel)));
    });
    const channelToTrackIndex = new Map<number, number>();
    trackChannelMap.forEach((channel, index) => {
      if (!channelToTrackIndex.has(channel)) {
        channelToTrackIndex.set(channel, index);
      }
    });
    const midiEvents = (midiFile.events ?? []).filter((event) => {
      const track = (event as { track?: unknown }).track;
      if (typeof track !== 'number' || !Number.isFinite(track)) {
        return true;
      }
      if (playableTrackIndexes.size === 0) {
        return true;
      }
      return playableTrackIndexes.has(Math.round(track));
    });
    s.midiDivision = midiFile.division || 480;
    const rawTickShift = midiFile.tickShift ?? 0;
    const tickCache =
      ((s.api as { tickCache?: unknown }).tickCache as ATTickCache | null) ??
      null;
    const firstPlayableTickRaw = resolveFirstPlayableTick(
      score,
      playableTrackIndexes,
      tickCache,
    );
    s.midiTickShift = resolveEffectiveMidiTickShift(
      rawTickShift,
      firstPlayableTickRaw,
      s.midiDivision,
      hasNonPlayableTracks,
    );
    const scoreTempo =
      typeof score.tempo === 'number' &&
      Number.isFinite(score.tempo) &&
      score.tempo > 0
        ? score.tempo
        : null;
    const initialUsPerQuarter = scoreTempo
      ? Math.round(60_000_000 / scoreTempo)
      : 500000;
    const tempoMapLocal = buildTempoMap(
      midiEvents,
      s.midiDivision,
      s.midiTickShift,
      initialUsPerQuarter,
    );
    if (!s.scoreTempoApplied && tempoMapLocal.length > 0) {
      const baseTempo = Math.round(60_000_000 / tempoMapLocal[0].usPerQuarter);
      if (Number.isFinite(baseTempo) && baseTempo > 0) {
        s.options.onScoreLoaded?.(baseTempo);
        s.scoreTempoApplied = true;
      }
    }
    s.tickCacheRef = tickCache ?? s.tickCacheRef;
    const vibratoWindows = buildVibratoWindows({
      score,
      tempoMap: tempoMapLocal,
      division: s.midiDivision,
      midiTickShift: s.midiTickShift,
      tickCache: tickCache ?? null,
    });
    s.lastVibratoWindows = vibratoWindows;
    s.vibratoWindowsTickCacheReady = Boolean(tickCache?.getBeatStart);
    const harmonicMap = buildHarmonicMap({
      score,
      tickCache: tickCache ?? null,
      midiTickShift: s.midiTickShift,
    });
    const letRingEndMap = buildLetRingEndMap({
      score,
      tickCache: tickCache ?? null,
      harmonicMap,
      midiTickShift: s.midiTickShift,
    });
    if (import.meta.env.DEV) {
      const samples: Array<[string, number]> = [];
      for (const entry of letRingEndMap.entries()) {
        samples.push(entry);
        if (samples.length >= 12) {
          break;
        }
      }
      appendDevLog(
        JSON.stringify({
          source: 'src/services/alphatabPlayer.ts',
          fn: 'createAlphaTabPlayer',
          message: 'let_ring_map_built',
          details: { size: letRingEndMap.size, samples },
          ts: Date.now(),
        }),
      );
    }
    const slideEvents = buildLegatoSlideEvents({
      score,
      tempoMap: tempoMapLocal,
      division: s.midiDivision,
      midiTickShift: s.midiTickShift,
      tickCache: tickCache ?? null,
      trackChannelMap,
      slideSettings: s.api.settings?.player?.slide ?? null,
    });
    const trackProgramsByIndex = new Map<number, number>();
    scoreTracks.forEach((track: AlphaTabTrack, idx: number) => {
      if (!track) {
        return;
      }
      const index =
        typeof track.index === 'number' && Number.isFinite(track.index)
          ? track.index
          : idx;
      const playbackInfo = (track as { playbackInfo?: unknown }).playbackInfo;
      const program =
        typeof (playbackInfo as { program?: number } | undefined)?.program ===
        'number'
          ? (playbackInfo as { program?: number }).program
          : null;
      if (typeof program === 'number' && Number.isFinite(program)) {
        trackProgramsByIndex.set(index, program);
      }
    });
    const built = buildAudioEvents(
      {
        ...midiFile,
        tickShift: s.midiTickShift,
        events: midiEvents,
      } as midi.MidiFile,
      trackChannelMap,
      channelToTrackIndex,
      vibratoWindows,
      harmonicMap,
      letRingEndMap,
      trackProgramsByIndex,
      initialUsPerQuarter,
    );
    buildPitchBendDebug(
      s,
      midiFile,
      midiEvents,
      tempoMapLocal,
      trackChannelMap,
      channelToTrackIndex,
      tickCache,
    );
    const mergedEvents = [...built.events, ...slideEvents].sort(
      compareAudioEvents,
    );
    s.tempoMap = built.tempoMap;
    s.durationMs = Math.max(
      built.durationMs,
      slideEvents.reduce((max, event) => Math.max(max, event.atMs), 0),
    );
    s.playheadMs = 0;
    applyPlayheadMs(s, 0, true);
    const trackIds = (
      s.cachedTracks.length > 0
        ? s.cachedTracks
        : (((score.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [])
    )
      .filter(Boolean)
      .map((track: AlphaTabTrack, idx: number) => {
        if (!track) {
          return null;
        }
        const index =
          typeof track.index === 'number' && Number.isFinite(track.index)
            ? track.index
            : idx;
        return `track-${index}`;
      })
      .filter((id): id is string => Boolean(id));
    const tempoPayload: TempoPointPayload[] = s.tempoMap.map((point) => ({
      tick: point.tick,
      timeMs: point.timeMs,
      usPerQuarter: point.usPerQuarter,
    }));
    const readyToken = (s.audioReadyToken += 1);
    s.audioReady = false;
    s.audioReadyPromise = (async () => {
      await prepareTab(trackIds);
      await scheduleEvents(mergedEvents, tempoPayload, s.midiDivision);
      if (s.audioReadyToken === readyToken) {
        s.audioReady = true;
      }
    })().catch(() => {
      if (s.audioReadyToken === readyToken) {
        s.audioReady = false;
      }
    });

    // Notify consumers (e.g. noteRecognition store) that the event list is
    // ready. Inside the success path so the callback only fires when
    // `mergedEvents` is fully populated. Nested try/catch isolates
    // derived-data failures from the MIDI generation error path.
    try {
      s.options.onMidiRebuilt?.({
        events: mergedEvents,
        activeTrackIndex: s.activeTrackIndex,
        tempoFactor: s.tempoFactor,
      });
    } catch (callbackError) {
      const message =
        callbackError instanceof Error
          ? callbackError.message
          : String(callbackError);
      s.options.onError?.(`Note timeline build failed: ${message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    s.options.onError?.(`Midi generation failed: ${message}`);
  }
}

export function resolveFirstPlayableTick(
  score: AlphaTabScore,
  playableTrackIndexes: Set<number>,
  tickCache: { getBeatStart?: (beat: unknown) => number } | null,
): number | null {
  let best: number | null = null;
  const consider = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return;
    }
    const rounded = Math.round(value);
    if (best === null || rounded < best) {
      best = rounded;
    }
  };
  const scoreTracks =
    ((score.tracks ?? []).filter(Boolean) as AlphaTabTrack[]) ?? [];
  for (let idx = 0; idx < scoreTracks.length; idx += 1) {
    const track = scoreTracks[idx];
    const trackIndex =
      typeof track.index === 'number' && Number.isFinite(track.index)
        ? track.index
        : idx;
    if (
      playableTrackIndexes.size > 0 &&
      !playableTrackIndexes.has(trackIndex)
    ) {
      continue;
    }
    const staves = safeTrackStaves(track);
    for (const staff of staves) {
      const bars = safeArray<ATBar>(() => staff?.bars);
      for (const bar of bars) {
        const voices = safeArray<ATVoice>(() => bar?.voices);
        for (const voice of voices) {
          const beats = safeArray<ATBeat>(() => voice?.beats);
          for (const beat of beats) {
            if (!beat || beat.isRest === true) {
              continue;
            }
            const notes = safeArray<ATNote>(() => beat?.notes);
            const hasPlayableNote =
              notes.length === 0 || notes.some((note) => note?.isRest !== true);
            if (!hasPlayableNote) {
              continue;
            }
            consider(
              (beat as { absolutePlaybackStart?: number })
                .absolutePlaybackStart,
            );
            const playbackStart = (beat as { playbackStart?: number })
              .playbackStart;
            const masterBarStart = (
              beat as {
                voice?: {
                  bar?: {
                    masterBar?: {
                      start?: number;
                      startTick?: number;
                      tick?: number;
                    };
                  };
                };
              }
            )?.voice?.bar?.masterBar;
            const barStartRaw =
              masterBarStart?.start ??
              masterBarStart?.startTick ??
              masterBarStart?.tick;
            if (
              typeof playbackStart === 'number' &&
              Number.isFinite(playbackStart) &&
              typeof barStartRaw === 'number' &&
              Number.isFinite(barStartRaw)
            ) {
              consider(barStartRaw + playbackStart);
            }
            consider(tickCache?.getBeatStart?.(beat));
          }
        }
      }
    }
  }
  return best;
}

function buildPitchBendDebug(
  s: PlayerState,
  midiFile: midi.MidiFile,
  _midiEvents: midi.MidiEvent[],
  tempoMapLocal: TempoPoint[],
  trackChannelMap: Map<number, number>,
  channelToTrackIndex: Map<number, number>,
  tickCache: ATTickCache | null,
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const pitchBends: PitchBendDebugEvent[] = [];
  const beatMatches: PitchBendDebugBeat[] = [];
  const lookupSamples: PitchBendDebugLookup[] = [];
  const channelToTrackLookup: Record<string, number> = {};
  channelToTrackIndex.forEach((trackIndex, channel) => {
    channelToTrackLookup[String(channel)] = trackIndex;
  });
  for (const event of midiFile.events ?? []) {
    if (
      event.type !== midi.MidiEventType.PitchBend &&
      event.type !== midi.MidiEventType.PerNotePitchBend
    ) {
      continue;
    }
    const tick = event.tick - (midiFile.tickShift ?? 0);
    const atMs = tickToMs(tick, s.midiDivision, tempoMapLocal);
    const bend = event as midi.PitchBendEvent;
    const channel =
      typeof bend.channel === 'number'
        ? bend.channel
        : (trackChannelMap.get(
            typeof bend.track === 'number' ? bend.track : -1,
          ) ?? 0);
    const trackIndex =
      typeof bend.track === 'number'
        ? bend.track
        : (channelToTrackIndex.get(channel) ?? null);
    const value = normalizePitchBendValue(
      (bend as unknown as { value?: number }).value ?? 0,
    );
    pitchBends.push({ tick, atMs, channel, trackIndex, value });
    if (trackIndex !== null && tickCache?.findBeat) {
      const trackLookup = new Set<number>([trackIndex]);
      const rawTick = tick + s.midiTickShift;
      const lookup = tickCache.findBeat(trackLookup, rawTick);
      if (lookupSamples.length < 20) {
        const lookupRecord = lookup as Record<string, unknown> | null;
        lookupSamples.push({
          tick,
          rawTick,
          keys: lookupRecord ? Object.keys(lookupRecord) : [],
          beatLookupType:
            lookupRecord && typeof lookupRecord.beatLookup === 'object'
              ? typeof lookupRecord.beatLookup
              : null,
        });
      }
      const beat = lookup?.beatLookup ?? null;
      const beatDurationTicks =
        lookup?.beatLookup?.duration ?? lookup?.tickDuration ?? null;
      let beatStartTick: number | null = null;
      if (beat) {
        const cacheStart = tickCache?.getBeatStart?.(beat) ?? null;
        if (typeof cacheStart === 'number' && Number.isFinite(cacheStart)) {
          beatStartTick = Math.round(cacheStart - s.midiTickShift);
        }
      }
      const vibrato = beat
        ? resolveVibrato({
            note: null,
            beat,
            voice: (beat as Record<string, unknown> | null)?.voice ?? null,
          })
        : 'none';
      beatMatches.push({
        tick,
        beatDurationTicks: beatDurationTicks
          ? Math.round(beatDurationTicks)
          : null,
        beatStartTick,
        vibrato,
      });
    }
  }
  s.lastPitchBendDebug = {
    events: pitchBends.slice(0, 400),
    beatMatches: beatMatches.slice(0, 400),
    channelToTrackIndex: channelToTrackLookup,
    lookupSamples,
  };
}
