import type { AudioTabEvent } from '../audioTabCommands';
import type {
  AlphaTabScore,
  AlphaTabTrack,
  SlidePlaybackSettingsLike,
  TempoPoint,
} from './types';
import type { ATNote } from './alphaTabTypes';
import {
  HARMONIC_TYPE_NATURAL,
  PITCH_BEND_CENTER,
  PITCH_BEND_MAX,
  SLIDE_OUT_LEGATO,
  SOURCE_BEND_RANGE_SEMITONES,
} from './types';
import {
  clampMidiKey,
  harmonicOffsetFromValue,
  safeTrackStaves,
} from './utils';
import { tickToMs } from './tempoMap';

export function buildLegatoSlideEvents(params: {
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
  slideSettings: SlidePlaybackSettingsLike | null;
}): AudioTabEvent[] {
  const {
    score,
    tempoMap,
    division,
    midiTickShift = 0,
    tickCache,
    trackChannelMap,
    slideSettings,
  } = params;
  if (!tickCache?.getBeatStart || !tickCache.findBeat) {
    return [];
  }
  const safeTickCache = tickCache as {
    getBeatStart: (beat: unknown) => number;
    findBeat: (
      tracks: Set<number>,
      tick: number,
    ) => { beatLookup?: { duration?: number }; tickDuration?: number } | null;
  };
  const ratio = Math.min(
    1,
    Math.max(0.1, slideSettings?.shiftSlideDurationRatio ?? 0.5),
  );
  const minSlideMs = 120;
  const stepMs = 20;
  const noteTimings = new Map<
    number,
    {
      startTick: number;
      durationTicks: number;
      midiNote: number;
      trackIndex: number;
    }
  >();
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
    const trackLookup = new Set<number>([trackIndex]);
    const staves = safeTrackStaves(track);
    staves.forEach((staff) => {
      (staff.bars ?? []).forEach((bar) => {
        (bar.voices ?? []).forEach((voice) => {
          (voice.beats ?? []).forEach((beat) => {
            const rawBeatStart = safeTickCache.getBeatStart(beat);
            if (
              typeof rawBeatStart !== 'number' ||
              !Number.isFinite(rawBeatStart)
            ) {
              return;
            }
            const beatLookup = safeTickCache.findBeat(
              trackLookup,
              rawBeatStart,
            );
            const beatDurationTicks =
              beatLookup?.beatLookup?.duration ?? beatLookup?.tickDuration ?? 0;
            if (!beatDurationTicks || beatDurationTicks <= 0) {
              return;
            }
            const beatStartTick = Math.round(rawBeatStart - midiTickShift);
            const notes: ATNote[] = (beat.notes ?? []) as ATNote[];
            notes.forEach((note) => {
              const midiNote = note.midiNote ?? note.note;
              if (!Number.isFinite(midiNote) || note.id === undefined) {
                return;
              }
              noteTimings.set(note.id, {
                startTick: beatStartTick,
                durationTicks: beatDurationTicks,
                midiNote: Number(midiNote),
                trackIndex,
              });
            });
          });
        });
      });
    });
  });

  const events: AudioTabEvent[] = [];
  tracks.forEach((track: AlphaTabTrack, trackIdx: number) => {
    if (!track) {
      return;
    }
    const trackIndex =
      typeof track.index === 'number' && Number.isFinite(track.index)
        ? track.index
        : trackIdx;
    const channel = trackChannelMap.get(trackIndex) ?? trackIndex;
    const staves = safeTrackStaves(track);
    staves.forEach((staff) => {
      (staff.bars ?? []).forEach((bar) => {
        (bar.voices ?? []).forEach((voice) => {
          (voice.beats ?? []).forEach((beat) => {
            const rawBeatStart = safeTickCache.getBeatStart(beat);
            if (
              typeof rawBeatStart !== 'number' ||
              !Number.isFinite(rawBeatStart)
            ) {
              return;
            }
            const beatLookup = safeTickCache.findBeat(
              new Set<number>([trackIndex]),
              rawBeatStart,
            );
            const beatDurationTicks =
              beatLookup?.beatLookup?.duration ?? beatLookup?.tickDuration ?? 0;
            if (!beatDurationTicks || beatDurationTicks <= 0) {
              return;
            }
            const beatStartTick = Math.round(rawBeatStart - midiTickShift);
            const beatStartMs = tickToMs(beatStartTick, division, tempoMap);
            const beatEndMs = tickToMs(
              beatStartTick + beatDurationTicks,
              division,
              tempoMap,
            );
            const noteDurationMs = Math.max(0, beatEndMs - beatStartMs);
            const slideDurationMs = Math.max(
              minSlideMs,
              noteDurationMs * ratio,
            );
            const notes: ATNote[] = (beat.notes ?? []) as ATNote[];
            notes.forEach((note) => {
              if (note.slideOutType !== SLIDE_OUT_LEGATO) {
                return;
              }
              const target = note.slideTarget ?? null;
              if (!target || note.id === undefined || target.id === undefined) {
                return;
              }
              const sourceInfo = noteTimings.get(note.id);
              const targetInfo = noteTimings.get(target.id);
              if (!sourceInfo || !targetInfo) {
                return;
              }
              const deltaSemitones = targetInfo.midiNote - sourceInfo.midiNote;
              const slideEndTick = targetInfo.startTick;
              const slideEndMs = tickToMs(slideEndTick, division, tempoMap);
              const slideStartMs = Math.max(
                beatStartMs,
                slideEndMs - slideDurationMs,
              );
              if (slideEndMs <= slideStartMs) {
                return;
              }
              const steps = Math.max(
                2,
                Math.round((slideEndMs - slideStartMs) / stepMs),
              );
              for (let i = 0; i <= steps; i += 1) {
                const t =
                  slideStartMs + ((slideEndMs - slideStartMs) * i) / steps;
                const semitones = (deltaSemitones * i) / steps;
                const offset = Math.round(
                  (semitones / SOURCE_BEND_RANGE_SEMITONES) * PITCH_BEND_CENTER,
                );
                const value = Math.max(
                  0,
                  Math.min(PITCH_BEND_MAX, PITCH_BEND_CENTER + offset),
                );
                events.push({
                  atMs: t,
                  trackId: `track-${trackIndex}`,
                  channel,
                  kind: {
                    type: 'pitch_bend',
                    value,
                    endpoint: i === steps,
                    label: 'slide',
                  },
                });
              }
              events.push({
                atMs: slideEndMs + 1,
                trackId: `track-${trackIndex}`,
                channel,
                kind: {
                  type: 'pitch_bend',
                  value: PITCH_BEND_CENTER,
                  endpoint: true,
                  label: 'reset',
                },
              });
            });
          });
        });
      });
    });
  });
  return events;
}

export function buildHarmonicMap(params: {
  score: AlphaTabScore;
  tickCache: {
    getBeatStart?: (beat: unknown) => number;
  } | null;
  midiTickShift: number;
}): Map<string, number> {
  const { score, tickCache, midiTickShift } = params;
  if (!tickCache?.getBeatStart) {
    return new Map();
  }
  const safeTickCache = tickCache as {
    getBeatStart: (beat: unknown) => number;
  };
  const map = new Map<string, number>();
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
            const rawTick = safeTickCache.getBeatStart?.(beat);
            if (typeof rawTick !== 'number' || !Number.isFinite(rawTick)) {
              return;
            }
            const beatTick = rawTick - midiTickShift;
            const notes: ATNote[] = (beat.notes ?? []) as ATNote[];
            notes.forEach((note) => {
              if (
                !note.isHarmonic ||
                note.harmonicType !== HARMONIC_TYPE_NATURAL
              ) {
                return;
              }
              const baseValue =
                note.calculateRealValue?.(true, false) ??
                note.realValueWithoutHarmonic ??
                note.midiNote ??
                note.note ??
                NaN;
              if (!Number.isFinite(baseValue)) {
                return;
              }
              const harmonicValue =
                note.calculateRealValue?.(true, true) ??
                (Number.isFinite(note.harmonicPitch)
                  ? baseValue + Number(note.harmonicPitch)
                  : NaN);
              let target = harmonicValue;
              if (!Number.isFinite(target)) {
                const offset = harmonicOffsetFromValue(
                  Number(note.harmonicValue ?? 0),
                );
                target = baseValue + offset;
              }
              if (!Number.isFinite(target)) {
                return;
              }
              const key = `${trackIndex}:${beatTick}:${clampMidiKey(baseValue)}`;
              map.set(key, clampMidiKey(target));
            });
          });
        });
      });
    });
  });
  return map;
}
