/**
 * Pure domain logic for building an expected-note timeline from scheduled
 * audio events.
 *
 * Kept free of Vue / Pinia / Tauri so it can be unit-tested in isolation.
 * All functions are pure: same inputs → same outputs, no I/O.
 *
 * Timing model
 * ────────────
 * `AudioTabEvent.atMs` values are computed at 1× speed and already account
 * for all internal tempo and time-signature changes within the tab (because
 * `buildAudioEvents` uses the full tempo map). The speed-trainer multiplier
 * (`tempoFactor`) is applied only at the Rust audio engine side and is NOT
 * baked into the event timestamps.
 *
 * To get the wall-clock time at which a note will actually sound:
 *   wallClockMs = event.atMs / tempoFactor
 *
 * This correctly handles both intra-tab tempo/time-signature changes and the
 * user's speed-trainer setting.
 */

/** MIDI pitch-bend neutral value (center of 0–16383 range). */
export const PITCH_BEND_CENTER = 8192;

/**
 * Pitch-bend wheel range in semitones (±16 st).
 * Matches SOURCE_BEND_RANGE_SEMITONES in the audio engine.
 */
export const SOURCE_BEND_RANGE_SEMITONES = 16;

// ---------------------------------------------------------------------------
// Input types (minimal subset of AudioTabEvent needed by the builder)
// ---------------------------------------------------------------------------

export type RawNoteEventKind =
  | { type: 'note_on'; key: number; vibrato?: 'slight' | 'wide' }
  | { type: 'note_off'; key: number }
  | { type: 'pitch_bend'; value: number; label?: 'bend' | 'slide' | 'reset' };

/**
 * Minimal subset of `AudioTabEvent` the builder needs.
 * The store layer filters and maps `AudioTabEvent[]` to `RawNoteEvent[]`
 * before calling `buildExpectedNoteTimeline`, keeping this file free of
 * service-layer imports.
 */
export interface RawNoteEvent {
  atMs: number;
  trackId: string;
  channel: number;
  kind: RawNoteEventKind;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * Simplified bend descriptor extracted from pitch-bend events that accompany
 * a note. Values are in semitones relative to the note's base MIDI pitch.
 */
export interface BendInfo {
  /** Guitar bend technique: ascending, descending, or pre-bent. */
  type: 'bend' | 'release' | 'bend_release' | 'pre_bend';
  /** Pitch offset in semitones at note onset (0 = struck at normal pitch). */
  startPitchOffset: number;
  /** Pitch offset in semitones at note end. */
  endPitchOffset: number;
}

export interface VibratoInfo {
  type: 'normal' | 'wide';
}

export interface ExpectedNote {
  /** Onset time in ms relative to playback start, adjusted for tempoFactor. */
  startMs: number;
  /** Note-off time in ms relative to playback start, adjusted for tempoFactor. */
  endMs: number;
  /** MIDI note number (0–127). */
  midiNote: number;
  /** Expected frequency in Hz (equal temperament, A4 = 440 Hz). */
  frequency: number;
  /** Note name in scientific notation, e.g. "E4", "A2". */
  noteName: string;
  /** Track identifier, e.g. "track-0". */
  trackId: string;
  /**
   * AlphaTab bar index (0-based).
   * TODO: populate via score structure walk in a future PR.
   */
  barIndex: number;
  /**
   * AlphaTab beat index within the bar.
   * TODO: populate via score structure walk in a future PR.
   */
  beatIndex: number;
  /**
   * Whether this is a rest (no audible note expected).
   * Rests produce no note_on events so this is always false for now.
   * TODO: populate via score structure walk in a future PR.
   */
  isRest: boolean;
  /** Bend information extracted from pitch-bend events, or null. */
  bend: BendInfo | null;
  /** Vibrato decoration from the note_on event, or null. */
  vibrato: VibratoInfo | null;
  /**
   * True when this note is the source of a legato slide (pitch_bend
   * events with `label: 'slide'` fall inside its raw time window).
   * The comparison engine scores these leniently — only the initial
   * onset pitch/timing are evaluated; subsequent pitch movement
   * during the slide is not penalised.
   */
  isSlideStart: boolean;
  /**
   * True when this is the last expected note in the piece. Scored
   * leniently for the same reason as slides: guitarists often hold
   * the final note to practise vibrato or sustain, which must not
   * be counted as a scoring error.
   */
  isLastNote: boolean;
  /**
   * True when this note shares its `startMs` with at least one other
   * note on the same timeline — i.e. it's a voice within a chord.
   * The comparison engine uses this to relax the clarity gate for
   * chord voices: a blended multi-string signal produces a lower
   * clarity score than a single string, so applying the single-note
   * threshold to every voice would drop chord hits entirely.
   */
  isChord: boolean;
}

export interface ExpectedNoteTimeline {
  notes: ExpectedNote[];
  /** Track identifier this timeline was built for. */
  trackId: string;
  /** Tempo multiplier that was applied (1.0 = normal speed). */
  tempoFactor: number;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit-testing
// ---------------------------------------------------------------------------

const NOTE_NAMES = [
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
 * Convert a MIDI note number to its frequency in Hz (A4 = 440 Hz,
 * equal temperament). Exact inverse of the tuner's `frequencyToNote`.
 */
export function midiNoteToFrequency(
  midiNote: number,
  referenceA4 = 440,
): number {
  if (!Number.isFinite(midiNote)) return 0;
  return referenceA4 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Convert a MIDI note number to its scientific name, e.g. 69 → "A4".
 * MIDI 0 = C-1, MIDI 12 = C0 (AlphaTab / guitar convention).
 */
export function midiNoteToName(midiNote: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midiNote)));
  const nameIndex = ((clamped % 12) + 12) % 12;
  const octave = Math.floor(clamped / 12) - 1;
  return `${NOTE_NAMES[nameIndex]}${octave}`;
}

/**
 * Convert a raw MIDI pitch-bend value (0–16383, center 8192) to semitones.
 * Full range: ±SOURCE_BEND_RANGE_SEMITONES (±16 st).
 */
export function bendValueToSemitones(value: number): number {
  return (
    ((value - PITCH_BEND_CENTER) / PITCH_BEND_CENTER) *
    SOURCE_BEND_RANGE_SEMITONES
  );
}

/**
 * Classify a sequence of MIDI pitch-bend values (from events with
 * `label === 'bend'`) into a `BendInfo`. Returns `null` when there is no
 * significant bend (all values within ±0.3 semitones of center).
 */
export function classifyBend(bendValues: readonly number[]): BendInfo | null {
  if (bendValues.length === 0) return null;

  const THRESHOLD = 0.3;
  const semitones = bendValues.map(bendValueToSemitones);
  const first = semitones[0];
  const last = semitones[semitones.length - 1];
  const peak = Math.max(...semitones);

  if (
    Math.abs(first) < THRESHOLD &&
    Math.abs(last) < THRESHOLD &&
    peak < THRESHOLD
  ) {
    return null;
  }

  let type: BendInfo['type'];
  if (first > THRESHOLD) {
    // Note struck while already bent → pre-bend, or releasing a pre-bend
    type = last < first - THRESHOLD ? 'release' : 'pre_bend';
  } else {
    // Starts at neutral; check whether it returns to neutral (bend_release)
    type = peak > last + THRESHOLD ? 'bend_release' : 'bend';
  }

  return { type, startPitchOffset: first, endPitchOffset: last };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * How far before a note_on to look for pitch-bend events. Pre-bends are
 * struck after the string is bent, so the pitch_bend arrives before the
 * note_on in the event stream.
 */
const PRE_BEND_LOOKAHEAD_MS = 50;

/**
 * Build an `ExpectedNoteTimeline` from a sorted list of raw note events.
 *
 * @param events - All audio events from the last MIDI rebuild, sorted
 *   ascending by `atMs` (`compareAudioEvents` guarantees this after
 *   `rebuildMidi`). Events for other tracks are ignored.
 * @param activeTrackIndex - Zero-based index of the track to build for.
 *   Notes are filtered to `trackId === "track-${activeTrackIndex}"`.
 * @param tempoFactor - Speed-trainer multiplier (1.0 = normal, 0.5 = half
 *   speed). Applied as `wallClockMs = rawAtMs / tempoFactor`. The raw event
 *   timestamps already incorporate all intra-tab tempo changes.
 */
export function buildExpectedNoteTimeline(
  events: readonly RawNoteEvent[],
  activeTrackIndex: number,
  tempoFactor: number,
): ExpectedNoteTimeline {
  const trackId = `track-${activeTrackIndex}`;
  const factor =
    Number.isFinite(tempoFactor) && tempoFactor > 0 ? tempoFactor : 1;
  const scaleMs = (raw: number) => raw / factor;

  // Open notes waiting for a matching note_off, keyed by "channel:key" so
  // two voices/channels can hold the same MIDI key simultaneously without
  // interfering.
  const pending = new Map<
    string,
    { rawStartMs: number; vibrato: VibratoInfo | null }
  >();

  // All pitch_bend events with label='bend' for this track, kept with their
  // channel so bend values are only attached to notes on the same channel.
  const bendLog: Array<{ atMs: number; value: number; channel: number }> = [];

  // Raw times of slide pitch-bend events per channel. A note is flagged
  // as a slide-start when any such event falls inside its raw window.
  const slideLog: Array<{ atMs: number; channel: number }> = [];

  const notes: ExpectedNote[] = [];
  const rawWindowOfNote: Array<{ rawStartMs: number; rawEndMs: number }> = [];

  const pushNote = (
    midiKey: number,
    rawStartMs: number,
    rawEndMs: number,
    vibrato: VibratoInfo | null,
    channel: number,
  ): void => {
    notes.push(
      makeNote(
        midiKey,
        rawStartMs,
        rawEndMs,
        factor,
        scaleMs,
        trackId,
        vibrato,
        collectBendValues(bendLog, rawStartMs, rawEndMs, channel),
      ),
    );
    rawWindowOfNote.push({ rawStartMs, rawEndMs });
  };

  for (const event of events) {
    if (event.trackId !== trackId) continue;

    const { kind } = event;

    if (kind.type === 'pitch_bend' && kind.label === 'bend') {
      bendLog.push({
        atMs: event.atMs,
        value: kind.value,
        channel: event.channel,
      });
      continue;
    }
    if (kind.type === 'pitch_bend' && kind.label === 'slide') {
      slideLog.push({ atMs: event.atMs, channel: event.channel });
      continue;
    }

    if (kind.type === 'note_on') {
      const pendingKey = `${event.channel}:${kind.key}`;
      // Re-trigger: close the previous note on the same channel+key immediately.
      const prev = pending.get(pendingKey);
      if (prev) {
        pushNote(
          kind.key,
          prev.rawStartMs,
          event.atMs,
          prev.vibrato,
          event.channel,
        );
      }
      pending.set(pendingKey, {
        rawStartMs: event.atMs,
        vibrato: resolveVibratoInfo(kind.vibrato),
      });
      continue;
    }

    if (kind.type === 'note_off') {
      const pendingKey = `${event.channel}:${kind.key}`;
      const prev = pending.get(pendingKey);
      if (!prev) continue;
      pending.delete(pendingKey);
      pushNote(
        kind.key,
        prev.rawStartMs,
        event.atMs,
        prev.vibrato,
        event.channel,
      );
    }
  }

  // Close any notes that are still open (missing note_off at end of file).
  const lastRawMs = events.length > 0 ? events[events.length - 1].atMs : 0;
  for (const [pendingKey, entry] of pending) {
    const [channelStr, keyStr] = pendingKey.split(':');
    const midiKey = Number(keyStr);
    const channel = Number(channelStr);
    const endMs = Math.max(entry.rawStartMs, lastRawMs);
    pushNote(midiKey, entry.rawStartMs, endMs, entry.vibrato, channel);
  }

  // Pair each note with its raw window and re-sort by startMs; the two
  // arrays are kept in lock-step so we can post-annotate slide / last
  // flags without running another full pass.
  const paired = notes
    .map((note, i) => ({ note, window: rawWindowOfNote[i] }))
    .sort((a, b) => a.note.startMs - b.note.startMs);

  for (const { note, window } of paired) {
    const hasSlide = slideLog.some(
      (e) =>
        e.atMs >= window.rawStartMs - SLIDE_LOOKBACK_MS &&
        e.atMs <= window.rawEndMs,
    );
    if (hasSlide) note.isSlideStart = true;
  }
  if (paired.length > 0) {
    paired[paired.length - 1].note.isLastNote = true;
  }

  // Chord detection: sweep the sorted list and link any two consecutive
  // notes whose raw onsets are within CHORD_GROUPING_WINDOW_MS.
  // AlphaTab emits strum voices a few ticks apart, not exactly
  // simultaneously — rounding to the nearest ms missed most real
  // chords. A 20ms window absorbs natural strum stagger without
  // swallowing distinct sequential notes (intermediate strictness
  // puts the `perfect` timing band at 60ms, so 20ms is comfortably
  // below a deliberate beat spacing).
  const groupIndex = new Array<number>(paired.length);
  if (paired.length > 0) {
    let currentGroup = 0;
    groupIndex[0] = currentGroup;
    for (let i = 1; i < paired.length; i += 1) {
      const prevRaw = paired[i - 1].window.rawStartMs;
      const currRaw = paired[i].window.rawStartMs;
      if (currRaw - prevRaw > CHORD_GROUPING_WINDOW_MS) {
        currentGroup += 1;
      }
      groupIndex[i] = currentGroup;
    }
    const groupSize = new Map<number, number>();
    for (const g of groupIndex) {
      groupSize.set(g, (groupSize.get(g) ?? 0) + 1);
    }
    for (let i = 0; i < paired.length; i += 1) {
      const g = groupIndex[i];
      if ((groupSize.get(g) ?? 0) > 1) {
        paired[i].note.isChord = true;
      }
    }
  }

  return {
    notes: paired.map((p) => p.note),
    trackId,
    tempoFactor: factor,
  };
}

/**
 * Slide pitch-bend events can start a handful of ms after the note-on
 * (slide is a fraction of the beat duration — see
 * `buildLegatoSlideEvents`). A small lookback absorbs rounding so the
 * slide-start note is reliably flagged.
 */
const SLIDE_LOOKBACK_MS = 2;

/**
 * Maximum onset-to-onset gap between two voices for them to be treated
 * as siblings of the same chord. Guitar Pro sources frequently emit
 * chord voices several ticks apart (not exactly simultaneous), and a
 * natural manual strum spans 10–30ms across six strings. 20ms is well
 * below the intermediate `perfect` timing band (60ms) and below a
 * typical sixteenth-note at 120 BPM (125ms), so it does not merge
 * deliberately sequential notes into a single chord group.
 */
const CHORD_GROUPING_WINDOW_MS = 20;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function collectBendValues(
  bendLog: ReadonlyArray<{ atMs: number; value: number; channel: number }>,
  noteStartMs: number,
  noteEndMs: number,
  channel: number,
): number[] {
  const windowStart = noteStartMs - PRE_BEND_LOOKAHEAD_MS;
  return bendLog
    .filter(
      (e) =>
        e.channel === channel && e.atMs >= windowStart && e.atMs <= noteEndMs,
    )
    .map((e) => e.value);
}

function resolveVibratoInfo(
  vibrato: 'slight' | 'wide' | undefined,
): VibratoInfo | null {
  if (vibrato === 'wide') return { type: 'wide' };
  if (vibrato === 'slight') return { type: 'normal' };
  return null;
}

function makeNote(
  midiNote: number,
  rawStartMs: number,
  rawEndMs: number,
  _tempoFactor: number,
  scaleMs: (raw: number) => number,
  trackId: string,
  vibrato: VibratoInfo | null,
  bendValues: number[],
): ExpectedNote {
  return {
    startMs: scaleMs(rawStartMs),
    endMs: scaleMs(rawEndMs),
    midiNote,
    frequency: midiNoteToFrequency(midiNote),
    noteName: midiNoteToName(midiNote),
    trackId,
    barIndex: 0,
    beatIndex: 0,
    isRest: false,
    bend: classifyBend(bendValues),
    vibrato,
    isSlideStart: false,
    isLastNote: false,
    isChord: false,
  };
}
