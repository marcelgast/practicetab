/**
 * Build a `startMs → FretPosition[]` index of every note in the
 * active track, for the Fretboard Panel (PR 4.2).
 *
 * Sibling to `beatRectIndex.ts`: same iterate-every-beat pass, same
 * `rawStartMs` key convention (1× speed, invariant across speed-
 * trainer tempoFactor changes), same `activeTrackIndex` scoping.
 * Running alongside the rect-index means the Fretboard Panel
 * updates on the exact same `onBeatCacheRefreshed` hook without a
 * second render pipeline.
 *
 * Collision policy diverges from the rect-index: when several
 * voices share a `startMs`, the rect-index keeps only the first
 * (it just needs a visual anchor). Here the map IS the musical
 * content, so voices get merged at the same `keyMs`, deduplicated
 * by `(stringIndex, fret)` so a unison doesn't paint twice.
 *
 * String orientation — AlphaTab's `note.string` is **1-indexed from
 * the lowest-pitched string** (bottom line of the tab). Here we
 * normalise to 0-indexed lowest-first (`stringIndex = string - 1`)
 * because the rest of the app thinks of string 0 as low E on a
 * 6-string guitar. Callers (the SVG panel) assume the 0-indexed
 * convention.
 *
 * Sounding MIDI note — we prefer AlphaTab's `realValue` (the
 * pitch you'd hear accounting for capo + transposition) but fall
 * back to `midiNote` and finally to `tuning[string-1] + fret`. The
 * fretboard panel uses this for the hover / info popup
 * eventually; dot placement is purely `(stringIndex, fret)` from
 * the tab, untouched by tuning.
 *
 * Pure: no I/O, no Vue reactivity, no DOM. Safe in a plain node
 * test env.
 */

import type { AlphaTabScore, AlphaTabTrack, TempoPoint } from './types';
import { tickToMs } from './tempoMap';
import { safeArray, safeTrackStaves } from './utils';
import type {
  ATBar,
  ATBeat,
  ATNote,
  ATTickCache,
  ATVoice,
} from './alphaTabTypes';
import type { FretPosition } from '../../domain/fretboard';

export interface BuildBeatNotesByStartMsParams {
  score: AlphaTabScore | null;
  tickCache: ATTickCache | null;
  midiDivision: number;
  tempoMap: TempoPoint[];
  midiTickShift: number;
  /**
   * If provided, only beats of this track are indexed. Matches the
   * rect-index's scoping behaviour so the fretboard shows the
   * active track's notes, not every layer of a multi-track score.
   * When `null`, all tracks are indexed (useful in tests).
   */
  activeTrackIndex: number | null;
}

/**
 * Build a `rawStartMs → FretPosition[]` map. Returns an empty map
 * when required inputs are missing (no score, no tickCache) —
 * callers should treat that as "cache not yet populated".
 */
export function buildBeatNotesByStartMs(
  params: BuildBeatNotesByStartMsParams,
): Map<number, FretPosition[]> {
  const {
    score,
    tickCache,
    midiDivision,
    tempoMap,
    midiTickShift,
    activeTrackIndex,
  } = params;

  const result = new Map<number, FretPosition[]>();
  if (!score) return result;
  if (!tickCache?.getBeatStart) return result;
  if (!Number.isFinite(midiDivision) || midiDivision <= 0) return result;

  const tracks = safeArray<AlphaTabTrack>(() => score.tracks);
  // Mirror `beatRectIndex`'s track-index resolution: match array
  // position OR the AlphaTab `track.index` field (other player code
  // uses the AlphaTab index).
  const scopedTracks =
    activeTrackIndex !== null && activeTrackIndex >= 0
      ? tracks.filter((track, idx) => {
          const trackIdx = (track as { index?: unknown }).index;
          return (
            idx === activeTrackIndex ||
            (typeof trackIdx === 'number' && trackIdx === activeTrackIndex)
          );
        })
      : tracks;

  for (const track of scopedTracks) {
    // Tuning is per-staff; cached so we resolve it once per track
    // even with multi-staff (notation + tab) setups.
    const stringCount = resolveStringCount(track);
    const staves = safeTrackStaves(track);
    for (const staff of staves) {
      for (const bar of safeArray<ATBar>(() => staff?.bars)) {
        for (const voice of safeArray<ATVoice>(() => bar?.voices)) {
          for (const beat of safeArray<ATBeat>(() => voice?.beats)) {
            indexBeat({
              beat,
              tickCache,
              midiDivision,
              tempoMap,
              midiTickShift,
              stringCount,
              result,
            });
          }
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

interface IndexBeatParams {
  beat: ATBeat | undefined;
  tickCache: ATTickCache;
  midiDivision: number;
  tempoMap: TempoPoint[];
  midiTickShift: number;
  stringCount: number;
  result: Map<number, FretPosition[]>;
}

function indexBeat(params: IndexBeatParams): void {
  const {
    beat,
    tickCache,
    midiDivision,
    tempoMap,
    midiTickShift,
    stringCount,
    result,
  } = params;

  if (!beat || beat.isRest === true) return;
  if (!tickCache.getBeatStart) return;

  let rawTick: number;
  try {
    rawTick = tickCache.getBeatStart(beat);
  } catch {
    return;
  }
  if (typeof rawTick !== 'number' || !Number.isFinite(rawTick)) return;

  const shiftedTick = rawTick - midiTickShift;
  if (shiftedTick < 0) return;

  const rawStartMs = tickToMs(shiftedTick, midiDivision, tempoMap);
  const keyMs = Math.round(rawStartMs);

  const notes: FretPosition[] = [];
  for (const note of safeArray<ATNote>(() => beat.notes)) {
    const pos = normaliseNote(note, stringCount);
    if (pos) notes.push(pos);
  }
  if (notes.length === 0) return;

  // Multi-voice merge. Unlike the rect cache (which only needs ONE
  // visual anchor per startMs and picks the first beat that arrives),
  // this map is the MUSICAL content for that position — if AlphaTab
  // encodes a chord / sustain / melody split as multiple voices
  // sharing a beat start, dropping later voices would show an
  // incomplete chord on the fretboard. Merge instead, deduplicating
  // identical `(stringIndex, fret)` pairs so the same physical
  // position isn't painted twice when two voices line up.
  const existing = result.get(keyMs);
  if (!existing) {
    result.set(keyMs, notes);
    return;
  }
  const seen = new Set<string>();
  for (const p of existing) seen.add(`${p.stringIndex}:${p.fret}`);
  for (const p of notes) {
    const signature = `${p.stringIndex}:${p.fret}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    existing.push(p);
  }
}

function normaliseNote(
  note: ATNote | undefined,
  stringCount: number,
): FretPosition | null {
  if (!note) return null;
  if (note.isRest === true) return null;
  const string = note.string;
  const fret = note.fret;
  if (typeof string !== 'number' || !Number.isFinite(string)) return null;
  if (typeof fret !== 'number' || !Number.isFinite(fret)) return null;
  if (string < 1) return null;
  if (stringCount > 0 && string > stringCount) return null;
  const stringIndex = string - 1;
  const midi = resolveMidi(note);
  return {
    stringIndex,
    fret: Math.max(0, Math.floor(fret)),
    midiNote: midi,
  };
}

function resolveMidi(note: ATNote): number {
  if (typeof note.realValue === 'number' && Number.isFinite(note.realValue)) {
    return note.realValue;
  }
  if (typeof note.midiNote === 'number' && Number.isFinite(note.midiNote)) {
    return note.midiNote;
  }
  if (typeof note.note === 'number' && Number.isFinite(note.note)) {
    return note.note;
  }
  return 0;
}

function resolveStringCount(track: AlphaTabTrack | undefined): number {
  if (!track) return 0;
  // First stringed staff wins — AlphaTab's tuning array length is
  // our string count. 0 = not a stringed instrument (the caller's
  // `normaliseNote` will then reject notes that claim `string > 0`
  // beyond the count).
  const staves = safeTrackStaves(track);
  for (const staff of staves) {
    const tuning = (staff as { tuning?: unknown } | undefined)?.tuning;
    if (Array.isArray(tuning) && tuning.length > 0) {
      return tuning.length;
    }
  }
  return 0;
}
