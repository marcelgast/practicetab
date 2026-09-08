import type {
  AlphaTabScore,
  AlphaTabTrack,
  TempoPoint,
  VibratoKind,
} from './types';
import type { ATBeat, ATNote } from './alphaTabTypes';
import { safeTrackStaves } from './utils';
import { tickToMs } from './tempoMap';

export function normalizeVibratoType(input: unknown): VibratoKind {
  if (input === null || input === undefined) {
    return 'none';
  }
  if (typeof input === 'string') {
    const lower = input.toLowerCase();
    if (lower.includes('none')) {
      return 'none';
    }
    if (lower.includes('wide')) {
      return 'wide';
    }
    return 'slight';
  }
  if (typeof input === 'number') {
    if (input === 0) {
      return 'none';
    }
    if (input === 2) {
      return 'wide';
    }
    return 'slight';
  }
  return 'slight';
}

function extractVibratoFlag(input: unknown): unknown {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const typed = input as Record<string, unknown>;
  const direct =
    typed.vibrato ??
    typed.vibratoType ??
    typed.vibratoEffect ??
    typed.vibratoStyle;
  if (direct !== undefined) {
    return direct;
  }
  const effect = (typed.effect ?? typed.effects) as
    | Record<string, unknown>
    | undefined;
  const fromEffect =
    effect?.vibrato ??
    effect?.vibratoType ??
    effect?.vibratoEffect ??
    effect?.vibratoStyle;
  if (fromEffect !== undefined) {
    return fromEffect;
  }
  const nested = (effect?.effect ?? effect?.effects) as
    | Record<string, unknown>
    | undefined;
  const fromNested =
    nested?.vibrato ??
    nested?.vibratoType ??
    nested?.vibratoEffect ??
    nested?.vibratoStyle;
  if (fromNested !== undefined) {
    return fromNested;
  }
  const properties =
    (typed.properties as unknown) ??
    (typed.property as unknown) ??
    (typed.props as unknown);
  if (Array.isArray(properties)) {
    const match = properties.find((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const name = String(
        (entry as { name?: unknown }).name ??
          (entry as { id?: unknown }).id ??
          '',
      ).toLowerCase();
      return name.includes('vibrato');
    }) as
      | {
          strength?: unknown;
          value?: unknown;
          type?: unknown;
        }
      | undefined;
    return match?.strength ?? match?.value ?? match?.type;
  }
  if (properties && typeof properties === 'object') {
    const props = properties as Record<string, unknown>;
    const directProp =
      props.VibratoWTremBar ??
      props.vibratoWTremBar ??
      props.vibrato ??
      props.Vibrato;
    if (directProp !== undefined) {
      if (directProp && typeof directProp === 'object') {
        const entry = directProp as Record<string, unknown>;
        return entry.strength ?? entry.value ?? entry.type ?? directProp;
      }
      return directProp;
    }
  }
  return undefined;
}

function hasTremBarVibrato(input: unknown): boolean {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const typed = input as Record<string, unknown>;
  const properties =
    (typed.properties as unknown) ??
    (typed.property as unknown) ??
    (typed.props as unknown);
  if (Array.isArray(properties)) {
    return properties.some((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const name = String(
        (entry as { name?: unknown }).name ??
          (entry as { id?: unknown }).id ??
          '',
      ).toLowerCase();
      return name.includes('vibratowtrembar') || name.includes('trembar');
    });
  }
  if (properties && typeof properties === 'object') {
    const props = properties as Record<string, unknown>;
    return (
      props.VibratoWTremBar !== undefined || props.vibratoWTremBar !== undefined
    );
  }
  return false;
}

export function resolveVibrato(params: {
  note: unknown;
  beat: unknown;
  voice: unknown;
}): VibratoKind {
  const { note, beat, voice } = params;
  const noteVibrato = normalizeVibratoType(extractVibratoFlag(note));
  const beatVibrato = normalizeVibratoType(extractVibratoFlag(beat));
  const voiceVibrato = normalizeVibratoType(extractVibratoFlag(voice));
  if (noteVibrato !== 'none') {
    return noteVibrato;
  }
  if (!hasTremBarVibrato(beat) && beatVibrato !== 'none') {
    return beatVibrato;
  }
  return voiceVibrato;
}

export type VibratoWindow = {
  key: number | null;
  startMs: number;
  endMs: number;
  startTick?: number;
  endTick?: number;
  vibrato: VibratoKind;
};

export function buildVibratoWindows(params: {
  score: AlphaTabScore;
  tempoMap: TempoPoint[];
  division: number;
  midiTickShift?: number;
  tickCache: {
    getBeatStart?: (beat: unknown) => number;
    getMasterBarStart?: (bar: unknown) => number;
    getMasterBar?: (bar: unknown) => { start: number; end: number };
    findBeat?: (
      tracks: Set<number>,
      tick: number,
    ) => {
      beatLookup?: { duration?: number };
      tickDuration?: number;
    } | null;
  } | null;
}): Map<number, VibratoWindow[]> {
  const { score, tempoMap, division, tickCache, midiTickShift = 0 } = params;
  const resolveBeatStartTickFromScore = (beat: ATBeat): number | null => {
    if (!beat) {
      return null;
    }
    const absolute = beat.absolutePlaybackStart;
    if (typeof absolute === 'number' && Number.isFinite(absolute)) {
      return Math.round(absolute);
    }
    const playbackStart = beat.playbackStart;
    const masterBarStart =
      beat?.voice?.bar?.masterBar?.start ?? beat?.voice?.bar?.start;
    if (
      typeof masterBarStart === 'number' &&
      Number.isFinite(masterBarStart) &&
      typeof playbackStart === 'number' &&
      Number.isFinite(playbackStart)
    ) {
      return Math.round(masterBarStart + playbackStart);
    }
    if (typeof playbackStart === 'number' && Number.isFinite(playbackStart)) {
      return Math.round(playbackStart);
    }
    return null;
  };
  const resolveBeatStartTick = (
    beat: ATBeat,
  ): { raw: number | null; shifted: number | null } => {
    if (!beat) {
      return { raw: null, shifted: null };
    }
    const playbackStart = beat.playbackStart;
    const masterBar = beat?.voice?.bar?.masterBar ?? beat?.voice?.bar ?? null;
    const masterBarLookup = tickCache?.getMasterBar?.(masterBar) ?? null;
    const masterBarStart =
      typeof masterBarLookup?.start === 'number' &&
      Number.isFinite(masterBarLookup.start)
        ? masterBarLookup.start
        : tickCache?.getMasterBarStart?.(masterBar);
    const playbackBased =
      typeof masterBarStart === 'number' &&
      Number.isFinite(masterBarStart) &&
      typeof playbackStart === 'number' &&
      Number.isFinite(playbackStart)
        ? masterBarStart + playbackStart
        : null;
    const cacheStart = tickCache?.getBeatStart?.(beat);
    if (
      typeof cacheStart === 'number' &&
      Number.isFinite(cacheStart) &&
      typeof playbackBased === 'number' &&
      Number.isFinite(playbackBased) &&
      Math.abs(cacheStart - playbackBased) > division / 2
    ) {
      const raw = Math.round(playbackBased);
      return { raw, shifted: Math.round(raw - midiTickShift) };
    }
    if (typeof cacheStart === 'number' && Number.isFinite(cacheStart)) {
      let shifted = Math.round(cacheStart - midiTickShift);
      const absStart =
        typeof beat.absolutePlaybackStart === 'number' &&
        Number.isFinite(beat.absolutePlaybackStart)
          ? beat.absolutePlaybackStart
          : null;
      if (absStart !== null && Math.abs(cacheStart - absStart) > division * 2) {
        shifted = Math.round(cacheStart);
      }
      return { raw: Math.round(cacheStart), shifted };
    }
    if (typeof playbackBased === 'number' && Number.isFinite(playbackBased)) {
      const raw = Math.round(playbackBased);
      return { raw, shifted: Math.round(raw - midiTickShift) };
    }
    if (
      typeof beat.absolutePlaybackStart === 'number' &&
      Number.isFinite(beat.absolutePlaybackStart)
    ) {
      const raw = Math.round(beat.absolutePlaybackStart);
      return { raw, shifted: Math.round(raw - midiTickShift) };
    }
    const raw = resolveBeatStartTickFromScore(beat);
    return raw === null
      ? { raw: null, shifted: null }
      : { raw, shifted: Math.round(raw - midiTickShift) };
  };
  const windows = new Map<number, VibratoWindow[]>();
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
            const beatStart = resolveBeatStartTick(beat);
            const beatStartTick = beatStart.shifted;
            const beatLookup =
              tickCache?.findBeat?.(trackLookup, beatStart.raw ?? 0) ?? null;
            const beatDurationTicks =
              beatLookup?.beatLookup?.duration ??
              beatLookup?.tickDuration ??
              beat.playbackDuration ??
              beat.displayDuration ??
              0;
            if (
              typeof beatStartTick !== 'number' ||
              !Number.isFinite(beatStartTick) ||
              !beatDurationTicks ||
              beatDurationTicks <= 0
            ) {
              return;
            }
            const notes: ATNote[] = (beat.notes ?? []) as ATNote[];
            notes.forEach((note) => {
              const vibratoType = resolveVibrato({ note, beat, voice });
              if (vibratoType === 'none') {
                return;
              }
              const startMs = tickToMs(beatStartTick, division, tempoMap);
              const endMs = tickToMs(
                beatStartTick + beatDurationTicks,
                division,
                tempoMap,
              );
              if (endMs <= startMs) {
                return;
              }
              const key = note.realValue ?? note.midiNote ?? note.note;
              if (!Number.isFinite(key)) {
                return;
              }
              const list = windows.get(trackIndex) ?? [];
              list.push({
                key: Number(key),
                startMs,
                endMs,
                startTick: beatStartTick,
                endTick: beatStartTick + beatDurationTicks,
                vibrato: vibratoType,
              });
              if (notes.length === 1) {
                list.push({
                  key: null,
                  startMs,
                  endMs,
                  startTick: beatStartTick,
                  endTick: beatStartTick + beatDurationTicks,
                  vibrato: vibratoType,
                });
              }
              windows.set(trackIndex, list);
            });
          });
        });
      });
    });
  });
  return windows;
}
