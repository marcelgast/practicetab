/**
 * Pure domain logic for the tuner.
 *
 * Kept free of Vue / Pinia / Tauri so it can be unit-tested in isolation.
 * All functions are pure: same inputs → same outputs, no I/O.
 */

/**
 * Accuracy bucket for a tuning reading. The thresholds match the colour
 * gates shown in the tuner display:
 * - `perfect`  ±5¢   → green
 * - `good`     ±15¢  → amber
 * - `off`      >±15¢ → red
 */
export type TunerAccuracy = 'perfect' | 'good' | 'off';

export const PERFECT_CENTS = 5;
export const GOOD_CENTS = 15;

/**
 * Classify a cent offset into a colour bucket.
 * A non-finite input is treated as `off` so the UI never surfaces NaN.
 */
export function classifyAccuracy(centsOffset: number): TunerAccuracy {
  if (!Number.isFinite(centsOffset)) return 'off';
  const abs = Math.abs(centsOffset);
  if (abs <= PERFECT_CENTS) return 'perfect';
  if (abs <= GOOD_CENTS) return 'good';
  return 'off';
}

/**
 * Map a cent offset to a normalised bar position in `[0, 1]`, where
 * `0.5` is "in tune", `0` is 50¢ flat and `1` is 50¢ sharp. Values
 * outside ±50¢ are clamped so the indicator stays pinned to the edge.
 */
export function centsToBarPosition(centsOffset: number): number {
  if (!Number.isFinite(centsOffset)) return 0.5;
  const clamped = Math.max(-50, Math.min(50, centsOffset));
  return (clamped + 50) / 100;
}

/**
 * Exponential-moving-average smoother for noisy cent readings.
 *
 * `alpha = 2 / (windowSize + 1)` — the standard EMA weighting so a
 * window of N produces a smoother whose effective averaging length is
 * roughly N samples. Resetting re-seeds on the next push, which the
 * tuner store does on onset / note change so a new note snaps to its
 * real value instead of interpolating across the boundary.
 */
export class EmaSmoother {
  private value: number | null = null;
  private readonly alpha: number;

  constructor(windowSize = 5) {
    const n = Math.max(1, Math.floor(windowSize));
    this.alpha = 2 / (n + 1);
  }

  /** Current smoothed value, or `null` if nothing has been pushed yet. */
  current(): number | null {
    return this.value;
  }

  /** Feed a new reading and return the updated smoothed value. */
  push(sample: number): number {
    if (!Number.isFinite(sample)) {
      return this.value ?? 0;
    }
    if (this.value === null) {
      this.value = sample;
      return sample;
    }
    this.value = this.alpha * sample + (1 - this.alpha) * this.value;
    return this.value;
  }

  /** Forget accumulated state so the next `push` re-seeds the filter. */
  reset(): void {
    this.value = null;
  }
}

const NOTE_NAMES_SHARP = [
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

export interface NoteReading {
  midi: number;
  noteName: string;
  centsOffset: number;
}

const EMPTY_NOTE: NoteReading = { midi: 0, noteName: '', centsOffset: 0 };

/**
 * Convert a detected frequency to the nearest equal-tempered note, using
 * a configurable A4 reference. The backend `PitchResult` hardcodes A4 =
 * 440 Hz, so whenever the user picks a different reference we recompute
 * note name + cent offset here rather than round-tripping the reference
 * into Rust. Keeping the math in the frontend also means the user can
 * scrub the reference field without restarting the pitch worker.
 */
export function frequencyToNote(
  frequency: number,
  referenceA4 = 440,
): NoteReading {
  if (
    !Number.isFinite(frequency) ||
    frequency <= 0 ||
    !Number.isFinite(referenceA4) ||
    referenceA4 <= 0
  ) {
    return EMPTY_NOTE;
  }
  const midiFloat = 69 + 12 * Math.log2(frequency / referenceA4);
  const midiRounded = Math.round(midiFloat);
  const centsOffset = (midiFloat - midiRounded) * 100;
  const midiClamped = Math.max(0, Math.min(127, midiRounded));
  const nameIndex = ((midiClamped % 12) + 12) % 12;
  const octave = Math.floor(midiClamped / 12) - 1;
  return {
    midi: midiClamped,
    noteName: `${NOTE_NAMES_SHARP[nameIndex]}${octave}`,
    centsOffset,
  };
}

/**
 * Accepted bounds for the A4 reference. Chosen to span every historical
 * and modern tuning in common use (Baroque ~415 Hz through modern "bright"
 * orchestras at ~446 Hz) plus a small safety margin. Anything outside is
 * rejected so a typo can't silently drive the tuner into a nonsensical
 * reference state.
 */
export const REFERENCE_A4_MIN_HZ = 400;
export const REFERENCE_A4_MAX_HZ = 480;

/**
 * Parse a free-form reference-A4 string (as typed in the tuner modal).
 * Accepts dot **and** comma as decimal separators so European keyboards
 * don't trip over locale. Returns `null` on anything that isn't a fully
 * numeric value inside `[REFERENCE_A4_MIN_HZ, REFERENCE_A4_MAX_HZ]`.
 *
 * Uses strict pattern matching + `Number()` — `Number.parseFloat`
 * silently accepts trailing garbage (`"440abc"` → `440`) which would let
 * typos pass the validation and land in the store.
 */
const REFERENCE_A4_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseReferenceA4(raw: string): number | null {
  const normalised = raw.trim().replace(',', '.');
  if (normalised === '') return null;
  if (!REFERENCE_A4_PATTERN.test(normalised)) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  if (value < REFERENCE_A4_MIN_HZ || value > REFERENCE_A4_MAX_HZ) return null;
  return value;
}
