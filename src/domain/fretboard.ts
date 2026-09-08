/**
 * Pure helpers for the Fretboard Panel (PR 4.2).
 *
 * Two responsibilities:
 * 1. Analyse a parsed AlphaTab score to figure out how long a neck
 *    needs to be rendered for it (`scanMaxFret`). Runs once per tab
 *    at import time; result is persisted in the LibraryItem metadata
 *    so we don't rescan on every load.
 * 2. Resolve the "what's at the cursor right now" query for the
 *    panel: given a sorted map of beat-start-ms → fret positions,
 *    return the list for the current playhead (`findFrettingsAt`).
 *
 * All functions here are pure and side-effect free. Keeps the AlphaTab
 * runtime out of unit tests — tests pass plain objects / numbers.
 */

import type { AlphaTabScore, AlphaTabTrack } from '../services/player/types';
import { safeArray, safeTrackStaves } from '../services/player/utils';
import type {
  ATBar,
  ATBeat,
  ATNote,
  ATVoice,
} from '../services/player/alphaTabTypes';

// ---------------------------------------------------------------------------
// Max-fret scan (once per tab)
// ---------------------------------------------------------------------------

/**
 * Walk every note of every beat of every track and return the highest
 * fret number used. Defaults to `0` for rest-only / notation-only
 * scores (nothing to render).
 *
 * The result drives how many frets the neck SVG has to render, so
 * higher = wider panel. The UI clamps to `[12, 28]` — a standard
 * guitar fretboard minimum, never more than a 28-fret extended neck.
 */
export function scanMaxFret(score: AlphaTabScore | null | undefined): number {
  if (!score) return 0;
  const tracks = safeArray<AlphaTabTrack>(() => score.tracks);
  let max = 0;
  for (const track of tracks) {
    for (const staff of safeTrackStaves(track)) {
      for (const bar of safeArray<ATBar>(() => staff?.bars)) {
        for (const voice of safeArray<ATVoice>(() => bar?.voices)) {
          for (const beat of safeArray<ATBeat>(() => voice?.beats)) {
            if (!beat || beat.isRest === true) continue;
            for (const note of safeArray<ATNote>(() => beat.notes)) {
              if (!note) continue;
              const fret = note.fret;
              if (typeof fret !== 'number' || !Number.isFinite(fret)) continue;
              if (fret > max) max = fret;
            }
          }
        }
      }
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Cursor → active frettings lookup
// ---------------------------------------------------------------------------

/**
 * Single-note position on the fretboard, in PracticeTab's canonical
 * 0-indexed lowest-pitched-first orientation (AlphaTab uses 1-indexed
 * lowest-first; the beat-notes index does the translation).
 */
export interface FretPosition {
  /** 0 = thickest / lowest-pitched string. */
  stringIndex: number;
  /** 0 = open string, increments toward the bridge. */
  fret: number;
  /** Sounding MIDI note after tab tuning + user tuning offset. */
  midiNote: number;
}

/**
 * Find the frettings that belong to the beat whose `startMs` is the
 * largest one less than or equal to `cursorMs`. Returns an empty
 * array before the first beat or when the map is empty.
 *
 * "Sticky" behaviour (note keeps showing through rests until the
 * next beat hits) is intentional — the panel reflects the last
 * chord the player is looking at, not "silence between beats".
 *
 * The input map MUST have numeric `startMs` keys. We build the
 * sorted keys list on every call — O(n log n) — which is fine for
 * typical tabs (≤2000 beats) and keeps the helper stateless. If
 * that becomes a hot path we'd move sorting into the builder.
 */
export function findFrettingsAtStartMs(
  byStartMs: ReadonlyMap<number, readonly FretPosition[]>,
  cursorMs: number,
): readonly FretPosition[] {
  if (!byStartMs || byStartMs.size === 0) return [];
  if (!Number.isFinite(cursorMs)) return [];
  const starts: number[] = [];
  byStartMs.forEach((_v, k) => starts.push(k));
  starts.sort((a, b) => a - b);
  // Binary search for the largest start ≤ cursorMs.
  let lo = 0;
  let hi = starts.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (starts[mid]! <= cursorMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return [];
  const key = starts[best]!;
  return byStartMs.get(key) ?? [];
}

// ---------------------------------------------------------------------------
// Tuning math — string labels
// ---------------------------------------------------------------------------

/**
 * Twelve pitch-class names starting from C. Sharp-only — tabs don't
 * generally mix flats/sharps in a tuning display, so one spelling
 * keeps the labels stable.
 */
const PITCH_CLASSES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

/**
 * MIDI integer → pitch class (no octave). `60 → "C"`, `64 → "E"`.
 *
 * Non-finite / out-of-range inputs collapse to an empty string so
 * callers don't have to guard.
 */
export function midiToPitchClass(midi: number): string {
  if (!Number.isFinite(midi)) return '';
  const int = Math.round(midi);
  if (int < 0 || int > 127) return '';
  const i = ((int % 12) + 12) % 12;
  return PITCH_CLASSES[i]!;
}

/**
 * Resolve the pitch-class labels for each open string, in
 * lowest-pitched-first order (`stringIndex` 0 → N-1).
 *
 * `tabTuning` is AlphaTab's `staff.tuning` — the array of MIDI
 * notes for each open string, ordered with the TOP TAB LINE FIRST
 * (= highest-pitched). We reverse to match our internal
 * lowest-first convention so the caller can index with
 * `stringIndex` directly.
 *
 * `tuningOffsetSemitones` is the user's runtime detune
 * (`playerStore.tuning`) — applied on top of the tab's own tuning
 * so the label shows the ACTUAL sounding pitch after both layers
 * of transposition.
 *
 * Worked example (from Marcel's spec): tab is 1-step-down
 * (`tabTuning` already reflects that, so `tuning[5] = 38 = D2`),
 * user sets `-2` → low-E label = midiToPitchClass(38 + -2) =
 * midiToPitchClass(36) = "C".
 */
export function resolveStringLabels(
  tabTuning: readonly number[] | null | undefined,
  tuningOffsetSemitones: number,
): string[] {
  if (!tabTuning || tabTuning.length === 0) return [];
  const offset = Number.isFinite(tuningOffsetSemitones)
    ? tuningOffsetSemitones
    : 0;
  // Reverse to lowest-first, then translate to pitch classes.
  const reversed = [...tabTuning].reverse();
  return reversed.map((midi) => midiToPitchClass(midi + offset));
}

// ---------------------------------------------------------------------------
// Fret-count helpers
// ---------------------------------------------------------------------------

/**
 * How many frets the neck diagram should draw. Enforces a sensible
 * floor (12 — standard half-neck) and ceiling (28 — longest commonly
 * manufactured extended neck). Undefined / missing maxFret → 24
 * (standard super-strat baseline).
 */
export function resolveFretCount(
  maxFretUsed: number | null | undefined,
): number {
  const FLOOR = 12;
  const CEIL = 28;
  const DEFAULT = 24;
  if (maxFretUsed === null || maxFretUsed === undefined) return DEFAULT;
  if (!Number.isFinite(maxFretUsed)) return DEFAULT;
  const used = Math.max(0, Math.floor(maxFretUsed));
  // Pad +1 so a fret-24 song gets a 25-fret diagram (has visual
  // headroom to the right of the highest note).
  return Math.min(CEIL, Math.max(FLOOR, used + 1));
}
