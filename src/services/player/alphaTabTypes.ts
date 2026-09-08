/**
 * Minimal interfaces for AlphaTab's internal score structure objects.
 *
 * These cover only the properties actually accessed by the player services.
 * Every field is optional because AlphaTab's internal types may vary across
 * versions and score formats.
 */

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

export interface ATNote {
  id?: number;
  isRest?: boolean;
  midiNote?: number;
  /** Alias used in some AlphaTab versions */
  note?: number;
  realValue?: number;
  realValueWithoutHarmonic?: number;
  isHarmonic?: boolean;
  harmonicType?: number;
  harmonicValue?: number;
  harmonicPitch?: number;
  calculateRealValue?: (
    applyTransposition: boolean,
    applyHarmonic: boolean,
  ) => number;
  isLetRing?: boolean;
  letRingDestination?: { beat?: unknown } | null;
  slideOutType?: number;
  slideTarget?: ATNote | null;
  /**
   * AlphaTab's fret number for a stringed instrument. `0` is the
   * nut (open string). Only present on tab / stringed tracks —
   * standard-notation or percussion tracks don't populate it.
   */
  fret?: number;
  /**
   * AlphaTab's string number. **1-indexed, 1 = lowest-pitched**
   * (bottom line of the tab). Increases up to the instrument's
   * string count. PracticeTab normalises to 0-indexed
   * `stringIndex` (0 = lowest-pitched) in the fretboard index —
   * see `src/services/player/beatNotesIndex.ts`.
   */
  string?: number;
}

// ---------------------------------------------------------------------------
// Beat
// ---------------------------------------------------------------------------

export interface ATBeat {
  notes?: ATNote[];
  isRest?: boolean;
  absolutePlaybackStart?: number;
  playbackStart?: number;
  displayDuration?: number;
  playbackDuration?: number;
  duration?: number;
  /** Fade type enum value (0 = none, 1 = in, 2 = out, 3 = swell) */
  fade?: number;
  fadeIn?: boolean;
  isLetRing?: boolean;
  /** Back-reference to containing voice */
  voice?: ATVoice | null;
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export interface ATVoice {
  beats?: ATBeat[];
  bar?: ATBar | null;
}

// ---------------------------------------------------------------------------
// Bar
// ---------------------------------------------------------------------------

export interface ATBar {
  voices?: ATVoice[];
  masterBar?: ATMasterBar | null;
  start?: number;
}

// ---------------------------------------------------------------------------
// MasterBar
// ---------------------------------------------------------------------------

export interface ATMasterBar {
  start?: number;
  startTick?: number;
  tick?: number;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export interface ATStaff {
  bars?: ATBar[];
}

// ---------------------------------------------------------------------------
// TickCache — the lookup structure attached to AlphaTab's API
// ---------------------------------------------------------------------------

export interface ATTickCache {
  getBeatStart?: (beat: unknown) => number;
  getMasterBar?: (bar: unknown) => { start: number; end: number };
  getMasterBarStart?: (bar: unknown) => number;
  findBeat?: (
    tracks: Set<number>,
    tick: number,
  ) => {
    beatLookup?: { duration?: number };
    tickDuration?: number;
  } | null;
}
