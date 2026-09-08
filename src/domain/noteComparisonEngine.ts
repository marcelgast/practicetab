/**
 * Stateful note-comparison engine.
 *
 * Connects a stream of `PitchResult` events (from the pitch-detection
 * pipeline) to an `ExpectedNoteTimeline` and produces `NoteResult` objects.
 *
 * Design principles
 * ─────────────────
 * - No I/O, no Vue reactivity, no timers. The caller feeds in pitch events
 *   and playhead position; the engine emits results. This makes it fully
 *   unit-testable by replaying sequences.
 * - Pure state transitions: each public method returns new results and
 *   updates internal state. The engine itself is a plain class, not a Pinia
 *   store — the store is a thin orchestration layer on top.
 *
 * Timing model
 * ────────────
 * `ExpectedNote.startMs / endMs` are already in wall-clock time (tempo-
 * factor applied). The engine receives `positionMs` values on the same
 * scale, polled from the Rust audio engine via `getAudioPositionMs()` in
 * the noteRecognition store's RAF loop.
 *
 * Chord handling (v1.3.0)
 * ───────────────────────
 * Simultaneous notes (chords) share the same `startMs`. The engine matches
 * an onset to the chord as a whole and emits a single timing result. Pitch
 * accuracy per individual chord voice is deferred to PR 3.11.
 */

import type {
  ExpectedNote,
  ExpectedNoteTimeline,
} from './expectedNoteTimeline';
import type { PitchResult } from '../services/pitchDetectionCommands';
import {
  type AccuracyRating,
  type BendResult,
  type LatencyCompensatorState,
  type NoteResult,
  type StrictnessConfig,
  STRICTNESS_PRESETS,
  addOnsetOffset,
  buildBendResult,
  buildExtraResult,
  buildMissedResult,
  classifyPitch,
  classifyTiming,
  compensateOffset,
  createLatencyCompensator,
  frequencyToCentsOffOctaveAgnostic,
} from './noteComparison';

// ---------------------------------------------------------------------------
// Internal state per tracked note
// ---------------------------------------------------------------------------

interface TrackedNote {
  note: ExpectedNote;
  /** Best pitch rating seen so far. */
  bestPitchAccuracy: AccuracyRating | null;
  bestCentsOff: number | null;
  /** Compensated timing offset from the onset (positive = late). */
  onsetOffsetMs: number | null;
  /**
   * Position (ms) of the first sample that both passed clarity/RMS
   * gating AND classified as perfect / good / acceptable against this
   * note's expected frequency. Used as a soft-onset fallback when the
   * Rust onset detector never flags `onsetDetected: true` — without
   * this, long-sustained notes with no distinct attack report
   * `timingAccuracy: null` and drag the overall score down.
   */
  softOnsetPositionMs: number | null;
  /** Pitch samples in cents relative to note base, for bend tracking. */
  bendSamplesCents: number[];
  /** Whether at least one pitch event was received for this note. */
  hasPitch: boolean;
  /**
   * Once set, pitch updates stop altering this note's score. Used for
   * notes that are deliberately held past their score-relevant window
   * — slide-starts and the final note of the piece — so that vibrato,
   * long holds and slide-out pitch movement don't re-score them.
   */
  pitchLocked: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class NoteComparisonEngine {
  private timeline: ExpectedNoteTimeline | null = null;
  private strictness: StrictnessConfig = STRICTNESS_PRESETS.beginner;
  private latency: LatencyCompensatorState = createLatencyCompensator();

  /**
   * Cursor into the timeline: index of the first note not yet fully past.
   * Notes before `cursorIndex` have already been emitted or are being
   * tracked.
   */
  private cursorIndex = 0;

  /**
   * Notes currently within the active window (started but not yet ended).
   * Keyed by note array index.
   */
  private activeNotes = new Map<number, TrackedNote>();

  /**
   * `positionMs` at which the engine first received a pitch event that
   * passed clarity / RMS gating. Used to distinguish a genuine `missed`
   * from a warmup-period artefact: on start-up the Rust audio engine
   * returns `null` for `getAudioPositionMs` for a few hundred ms and the
   * mic / pitch pipeline needs similar time to produce its first valid
   * sample — during that window notes that close without a pitch are
   * not the user's fault and should NOT be marked missed.
   *
   * Cross-platform relevance: the warmup is observed on both macOS
   * (CoreAudio) and Windows (WASAPI / WDM-KS), so this guard is not
   * gated on host.
   */
  private firstValidPitchAt: number | null = null;

  /**
   * Global transposition applied to every expected frequency, in
   * semitones. Matches the player's `tuning` setting (-12..+12): when
   * the user tunes down 2 semitones to play along with a tab in
   * standard notation, the AUDIO already plays the transposed pitch,
   * so the user's detected pitch also lands transposed — but the
   * timeline's `note.frequency` field is derived from the original
   * MIDI key. Without this offset every note would score as "wrong"
   * by a constant 100¢ / semitone.
   */
  private tuningSemitones = 0;

  /**
   * Flag flipped to `true` the moment an `extra` result is emitted for
   * the current rest region, and back to `false` whenever a note
   * closes. A sustained guitar note rings for several seconds after
   * the user stops playing — without this flag, every pitch frame in
   * that decay tail fires its own `extra` result and the summary
   * dialog ends up showing more extras than hits, like the 1464-extras
   * run Marcel reported. One extra per gap is enough signal without
   * punishing natural instrument decay.
   */
  private extraReportedInCurrentGap = false;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setTimeline(timeline: ExpectedNoteTimeline | null): void {
    this.timeline = timeline;
    this.cursorIndex = 0;
    this.activeNotes.clear();
    this.firstValidPitchAt = null;
    this.extraReportedInCurrentGap = false;
  }

  setStrictness(preset: StrictnessConfig): void {
    this.strictness = preset;
  }

  /**
   * Apply a global transposition (in semitones) to every expected
   * frequency during comparison. `0` means the tab's written pitch,
   * `-2` means the user is tuned two semitones down, etc.
   */
  setTuningSemitones(semitones: number): void {
    if (!Number.isFinite(semitones)) return;
    this.tuningSemitones = semitones;
  }

  reset(): void {
    this.cursorIndex = 0;
    this.activeNotes.clear();
    this.latency = createLatencyCompensator();
    this.firstValidPitchAt = null;
    this.extraReportedInCurrentGap = false;
  }

  // ---------------------------------------------------------------------------
  // Main update methods — called by the store on each event
  // ---------------------------------------------------------------------------

  /**
   * Advance the internal playhead to `positionMs`.
   *
   * - Opens notes that have started since the last call.
   * - Closes notes whose `endMs` has been passed; emits results for them.
   *
   * Returns any `NoteResult`s that were finalised by this advance.
   *
   * Startup / warmup guard: on playback start the Rust audio engine
   * returns `null` for the position for a few hundred ms, and the
   * pitch pipeline needs similar warmup before it produces its first
   * clarity-validated sample. Notes that close without ever having had
   * a valid pitch AND whose window is entirely behind the engine's
   * first real observation are silently dropped — a `missed` result
   * there would paint the cell red for a note the user never had a
   * chance to play. See the `advancePlayhead` body for the exact
   * conditions. Cross-platform: same warmup is present on CoreAudio,
   * WASAPI and WDM-KS.
   */
  advancePlayhead(positionMs: number): NoteResult[] {
    if (!this.timeline) return [];
    const notes = this.timeline.notes;
    const results: NoteResult[] = [];

    // Track which notes are being opened for the first time in this
    // same tick — used by the startup-lag guard below.
    const justOpenedIndices = new Set<number>();

    while (
      this.cursorIndex < notes.length &&
      notes[this.cursorIndex].startMs <= positionMs
    ) {
      const note = notes[this.cursorIndex];
      this.activeNotes.set(this.cursorIndex, {
        note,
        bestPitchAccuracy: null,
        bestCentsOff: null,
        onsetOffsetMs: null,
        softOnsetPositionMs: null,
        bendSamplesCents: [],
        hasPitch: false,
        pitchLocked: false,
      });
      justOpenedIndices.add(this.cursorIndex);
      this.cursorIndex++;
    }

    for (const [idx, tracked] of this.activeNotes) {
      if (tracked.note.endMs <= positionMs) {
        // Startup / warmup guard — skip emitting `missed` for notes
        // that close with no pitch because the engine hadn't reached a
        // steady state yet:
        //
        //   a) same-tick phantom: the note was opened AND closed in
        //      this same advancePlayhead call (first real position
        //      landed past the note's endMs), OR
        //   b) warmup: the engine has never seen a valid pitch — the
        //      Rust audio position poll and the mic pitch pipeline
        //      both need a few hundred ms to produce their first usable
        //      sample (observed on both CoreAudio and WASAPI). A note
        //      whose endMs is before the first valid pitch closed
        //      before the user could physically be heard.
        //
        // In either case the cell stays pending grey — marking it
        // `missed` paints red over a note the user never had a chance
        // to play.
        const warmupBeforeAnyPitch =
          this.firstValidPitchAt === null ||
          tracked.note.endMs <= this.firstValidPitchAt;
        const sameTickPhantom = justOpenedIndices.has(idx);
        if (!tracked.hasPitch && (warmupBeforeAnyPitch || sameTickPhantom)) {
          this.activeNotes.delete(idx);
          continue;
        }
        results.push(this.finaliseNote(tracked));
        this.activeNotes.delete(idx);
        // A note just closed — the user is about to enter a new
        // rest region. Re-arm the extra-note reporter so the next
        // rest gets its own (single) extra result instead of
        // inheriting the previous gap's already-reported flag.
        this.extraReportedInCurrentGap = false;
      }
    }

    promoteChordVoices(results);

    return results;
  }

  /**
   * Process an incoming `PitchResult` from the pitch-detection pipeline.
   *
   * - Updates pitch tracking for all currently active notes.
   * - If an onset was detected, records the timing offset and updates the
   *   latency compensator.
   *
   * Returns any `NoteResult`s that are ready (none in normal flow — notes are
   * finalised by `advancePlayhead`; this method only updates in-flight state).
   */
  processPitchResult(pitch: PitchResult, positionMs: number): NoteResult[] {
    // Record the first valid-pitch timestamp on every entry point so
    // the startup / warmup guard in `advancePlayhead` has a consistent
    // signal regardless of whether pitch arrives inside a note window
    // or during a rest.
    if (this.firstValidPitchAt === null && isPitchValid(pitch)) {
      this.firstValidPitchAt = positionMs;
    }

    if (!this.timeline || this.activeNotes.size === 0) {
      return this.handleExtraPitch(pitch, positionMs);
    }

    for (const tracked of this.activeNotes.values()) {
      this.updateTrackedNote(tracked, pitch, positionMs);
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private updateTrackedNote(
    tracked: TrackedNote,
    pitch: PitchResult,
    positionMs: number,
  ): void {
    const { note } = tracked;

    // Only process if pitch is within the note's time window
    if (positionMs < note.startMs || positionMs > note.endMs) return;

    // Clarity / RMS gating — chord voices get a lower clarity floor
    // because blended multi-string signals autocorrelate less
    // cleanly than single notes and would otherwise be filtered out.
    if (!isPitchValidForNote(pitch, note)) return;

    tracked.hasPitch = true;

    // Onset handling: record timing offset and update latency compensator.
    //
    // Late-onset guard for lenient-scored notes (slide-starts + last
    // note): onsets that fire AFTER the reasonable-reaction window are
    // almost always vibrato / sustain artefacts on a held note, not
    // the initial attack. The engine saw the attack as a continuous
    // pitch stream, never got a `onsetDetected: true` flag for it,
    // then a later vibrato excursion triggered one. Accepting that
    // late onset would lock in a huge `timingOffsetMs` (~700ms in
    // practice) and paint the note red for a user who actually
    // played it correctly. Drop those onsets instead.
    if (pitch.onsetDetected && tracked.onsetOffsetMs === null) {
      const rawOffset = positionMs - note.startMs;
      const isLenient = note.isSlideStart || note.isLastNote;
      if (!isLenient || rawOffset <= LATE_ONSET_GUARD_MS) {
        this.latency = addOnsetOffset(this.latency, rawOffset);
        tracked.onsetOffsetMs = compensateOffset(this.latency, rawOffset);
      }
    }

    // Once pitch scoring is locked (slide-start or final note that's
    // already been scored at its onset), further samples must not
    // change the note's score. Vibrato / sustained hold / slide pitch
    // movement otherwise oscillates the rating and is a known source
    // of the "bar jitter" / "final note still wrong" reports.
    if (tracked.pitchLocked) return;

    // Pitch accuracy — compared against the tuned expected frequency
    // (so the user can retune the guitar without every note scoring
    // wrong by 100¢ × semitones) AND using octave-agnostic folding
    // so a 2nd/3rd-harmonic mis-lock from the detector doesn't score
    // as "wrong" on a correctly-fingered note.
    const expectedHz =
      this.tuningSemitones !== 0
        ? note.frequency * Math.pow(2, this.tuningSemitones / 12)
        : note.frequency;
    const centsOff = frequencyToCentsOffOctaveAgnostic(
      pitch.frequency,
      expectedHz,
    );
    const absCentsOff = Math.abs(centsOff);
    // Chord voices use a wider tolerance — pitch detector accuracy
    // is noisier on multi-string strums. Classification runs on the
    // scaled value; `bestCentsOff` keeps the raw reading so the
    // overlay's pitch arrow reflects the real deviation.
    const classifyCentsOff = note.isChord
      ? absCentsOff / CHORD_PITCH_TOLERANCE_FACTOR
      : absCentsOff;
    const rating = classifyPitch(classifyCentsOff, this.strictness);

    if (
      tracked.bestPitchAccuracy === null ||
      ratingRank(rating) < ratingRank(tracked.bestPitchAccuracy)
    ) {
      tracked.bestPitchAccuracy = rating;
      tracked.bestCentsOff = centsOff;
    }

    // Soft-onset fallback. The Rust detector's `onsetDetected` flag is
    // unreliable for legato / sustained attacks — dev log shows 23 of
    // 26 hits had `onset:false` across an entire run, leaving their
    // timing unscored and dragging the overall score down. Capture the
    // first positionMs where the user's pitch matched the note (at
    // least `acceptable` band) and use that as an implicit onset if no
    // real one fires. Stays near-startMs for legato runs — not perfect
    // for strict timing feedback, but closer to the user's experience
    // than "timing: unknown" on every note.
    if (
      tracked.softOnsetPositionMs === null &&
      rating !== 'wrong' &&
      positionMs >= note.startMs
    ) {
      tracked.softOnsetPositionMs = positionMs;
    }

    // Lock the rating for lenient-scored notes once we have both an
    // onset-time rating AND some onset signal (real or soft). Until
    // both are captured we stay open to better samples so a
    // late-arriving good pitch can still flip a "wrong" to the
    // correct rating.
    if (
      (note.isSlideStart || note.isLastNote) &&
      tracked.bestPitchAccuracy !== null &&
      (tracked.onsetOffsetMs !== null || tracked.softOnsetPositionMs !== null)
    ) {
      tracked.pitchLocked = true;
    }

    // Bend pitch sample collection (in cents relative to base note).
    // Skip for slide-start / last notes — they're scored on initial
    // onset only, so the bend-classifier's "pitch drifted during
    // sustain" logic would otherwise fight the pitch-lock.
    if (note.bend !== null && !note.isSlideStart && !note.isLastNote) {
      tracked.bendSamplesCents.push(centsOff);
    }
  }

  private finaliseNote(tracked: TrackedNote): NoteResult {
    const { note } = tracked;

    if (!tracked.hasPitch) {
      return buildMissedResult(note);
    }

    const pitchAccuracy = tracked.bestPitchAccuracy ?? 'wrong';

    // Prefer the real onset offset. Fall back to the soft-onset
    // position (first time the user's pitch matched the note inside
    // its window) when no real onset was observed — covers the
    // common legato / sustained-attack case where the Rust detector
    // doesn't flag `onsetDetected: true`. Leaves `timingOffsetMs`
    // null only when neither signal is available, i.e. a note that
    // was hit with off-pitch playing throughout.
    //
    // The soft-onset branch subtracts a fixed latency compensation —
    // the pitch detector lags the physical attack by ~40ms, and the
    // LatencyCompensator that normally handles this only sees real
    // onsets. Without the constant, every sustained note scored
    // ~40ms late across the board.
    let timingOffsetMs = tracked.onsetOffsetMs;
    if (timingOffsetMs === null && tracked.softOnsetPositionMs !== null) {
      timingOffsetMs =
        tracked.softOnsetPositionMs - note.startMs - SOFT_ONSET_LATENCY_MS;
    }
    const timingAccuracy: AccuracyRating | null =
      timingOffsetMs !== null
        ? classifyTiming(Math.abs(timingOffsetMs), this.strictness)
        : null;

    let bendResult: BendResult | null = null;
    if (note.bend !== null && !note.isSlideStart && !note.isLastNote) {
      bendResult = buildBendResult(
        note.bend,
        tracked.bendSamplesCents,
        this.strictness,
      );
    }

    return {
      expectedNote: note,
      outcome: 'hit',
      pitchAccuracy,
      centsOff: tracked.bestCentsOff,
      timingAccuracy,
      timingOffsetMs,
      bendResult,
    };
  }

  /**
   * Handle a pitch event that occurs outside any active note window.
   * Emits an 'extra' result if strictness says to penalise extra notes.
   */
  private handleExtraPitch(
    _pitch: PitchResult,
    positionMs: number,
  ): NoteResult[] {
    if (!this.timeline || !isPitchValid(_pitch)) return [];

    const notes = this.timeline.notes;
    // Vibrato tolerance at the piece's end: players often hold the
    // final note as a long sustained tone to practice vibrato, which
    // keeps emitting pitch samples well past the note's scored end.
    // Treat anything past the last expected note's end as out-of-scope
    // — we neither penalise it nor try to match it.
    if (notes.length > 0 && positionMs >= notes[notes.length - 1].endMs) {
      return [];
    }

    // One extra per contiguous rest region. Without this dedupe a
    // single ringing-out guitar note fires an extra on every pitch
    // frame of its decay tail — dozens per rest, swamping the
    // summary. The flag resets the moment any real note closes.
    if (this.extraReportedInCurrentGap) return [];

    // Find the surrounding rest (between two consecutive expected notes)
    const restNote = findRestNote(notes, positionMs);
    if (!restNote) return [];

    const result = buildExtraResult(restNote, this.strictness);
    if (!result) return [];
    this.extraReportedInCurrentGap = true;
    return [result];
  }

  /** Expose estimated latency for diagnostics / UI. */
  get estimatedLatencyMs(): number {
    return this.latency.estimatedLatencyMs;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/** Pitch is considered valid if clarity and RMS meet minimum thresholds. */
function isPitchValid(pitch: PitchResult): boolean {
  return pitch.clarity >= MIN_CLARITY && pitch.rms >= MIN_RMS;
}

/**
 * Post-process a batch of closing results: for chord voices sharing a
 * `startMs`, if any voice scored better than `wrong`, promote the
 * wrong siblings to match that best rating.
 *
 * Rationale: the pitch detector reports a SINGLE fundamental per
 * frame. When the user plays a chord, the detector typically locks
 * on one voice (often the bass) — that voice scores well, the rest
 * score `wrong` by coincidence because their expected frequencies
 * are simply different pitch classes from what the detector saw.
 * Treating those as errors misrepresents the user's actual playing;
 * they struck the whole chord, the detector just can't see it.
 *
 * Only promotes when at least one sibling voice cleared the wrong
 * bar — if NONE of the chord voices matched, something really was
 * wrong (muted chord that never resolved, wrong chord altogether)
 * and we keep the `wrong` labels.
 *
 * Mutates `results` in place for simplicity (the array is freshly
 * built inside `advancePlayhead` and not yet observed).
 */
function promoteChordVoices(results: NoteResult[]): void {
  if (results.length < 2) return;
  // Group chord-flagged results by rounded startMs.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.expectedNote.isChord || r.outcome !== 'hit') continue;
    const key = Math.round(r.expectedNote.startMs);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(i);
  }
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    // Find the voice with the best pitch rating in this chord.
    let bestRank = Infinity;
    let bestIndex = -1;
    for (const idx of indices) {
      const rank = ratingRank(results[idx].pitchAccuracy);
      if (rank < bestRank) {
        bestRank = rank;
        bestIndex = idx;
      }
    }
    // Only promote when the best voice actually cleared `wrong`
    // (rank 0 = perfect, 1 = good, 2 = acceptable). If every voice
    // landed at `wrong` (rank 3) there's nothing to copy from — the
    // chord really was off.
    if (bestIndex === -1 || bestRank >= 3) continue;
    const best = results[bestIndex];
    for (const idx of indices) {
      if (idx === bestIndex) continue;
      const voice = results[idx];
      if (ratingRank(voice.pitchAccuracy) > bestRank) {
        results[idx] = {
          ...voice,
          pitchAccuracy: best.pitchAccuracy,
          centsOff: best.centsOff,
        };
      }
    }
  }
}

/**
 * Chord-aware pitch validity — applies a lower clarity gate to
 * chord voices so blended multi-string signals aren't filtered out.
 * Falls through to the standard gate for single-note voices.
 */
function isPitchValidForNote(pitch: PitchResult, note: ExpectedNote): boolean {
  const minClarity = note.isChord ? MIN_CLARITY_CHORD : MIN_CLARITY;
  return pitch.clarity >= minClarity && pitch.rms >= MIN_RMS;
}

// Pitch pipeline on guitar hardware commonly produces clarity values
// in the 0.70–0.95 range for single notes; blended chord strums dip
// lower because multiple fundamentals correlate less cleanly. 0.60
// is still well above the noise floor (<0.30) and covers the
// 0.79-bordering attacks Marcel's dev log surfaced.
const MIN_CLARITY = 0.6;
// Chord voices (multiple notes sharing a startMs) see a blended
// signal — autocorrelation peaks are shallower. Use a lower gate so
// chord strums aren't silently dropped as missed.
const MIN_CLARITY_CHORD = 0.45;
// Energy gate. Back to 0.01 (-40 dBFS) after a trial at 0.003 let
// electrical hum (60Hz cable buzz, fan rumble) through: hum IS
// tonal, so it sails through the MPM clarity gate at ~0.95 and
// paints the overlay green with the guitar untouched. 0.01 is the
// minimum that reliably keeps an idle line-in silent on typical
// consumer gear; anything softer than that the user wasn't
// actually playing.
const MIN_RMS = 0.01;

/**
 * Fixed compensation for the pitch-pipeline latency applied to
 * soft-onset timing readings. The Rust detector reports a pitch
 * match roughly 30–50ms after the physical attack (buffer fill,
 * autocorrelation window, Tauri IPC). Real onsets go through the
 * `LatencyCompensator` which estimates this dynamically; soft
 * onsets bypass that path, so we subtract a static estimate instead
 * of leaving a systematic ~40ms late bias on every sustained note.
 */
const SOFT_ONSET_LATENCY_MS = 40;

/**
 * Chord voices get their `|centsOff|` reading scaled down by this
 * factor before strictness classification. A strum produces a
 * blended multi-fundamental signal with strong transients — the
 * pitch detector's reported frequency per frame is inherently noisy
 * compared to a sustained single note, and applying the same
 * cents-tolerance as single notes drops half of a correctly-played
 * chord into the `wrong` bucket. 3.0× reflects observed detector
 * scatter on palm-muted and open strums in real-play testing — 2.5×
 * still left too many correctly-played chords red. Combined with the
 * chord-voice promotion pass in `advancePlayhead` and the widened
 * chord-grouping window in `buildExpectedNoteTimeline`, it keeps
 * correctly-played chords green without letting actual wrong-chord
 * voicings slip through (a genuine wrong voice at ≥150¢ is still
 * classified as `wrong` under intermediate strictness: 150 / 3 = 50¢,
 * on the `acceptable`/`wrong` boundary).
 */
const CHORD_PITCH_TOLERANCE_FACTOR = 3.0;

/**
 * Cap for accepting an `onsetDetected` flag on lenient-scored notes
 * (slide-starts + last note). A real attack onset always lands
 * comfortably inside this window; anything later is a vibrato or
 * sustained-pitch artefact and must not be treated as the initial
 * strike — it would otherwise score the note with a multi-hundred-ms
 * timing offset when the user actually hit the attack on time.
 */
const LATE_ONSET_GUARD_MS = 300;

/** Lower rank = better. */
function ratingRank(r: AccuracyRating | null): number {
  // `null` pitchAccuracy comes through for `missed` / `extra` outcomes
  // — we treat it as worse-than-wrong for ranking purposes so the
  // chord-voice promoter never picks a missing rating as the winner.
  if (r === null) return 4;
  return { perfect: 0, good: 1, acceptable: 2, wrong: 3 }[r];
}

/**
 * Given a playhead position that is NOT inside any active note, find the
 * nearest expected note to use as the "context" for an extra-note result.
 * Returns the note whose window is closest to `positionMs`, or null if the
 * notes array is empty.
 */
function findRestNote(
  notes: readonly ExpectedNote[],
  positionMs: number,
): ExpectedNote | null {
  if (notes.length === 0) return null;

  let closest: ExpectedNote | null = null;
  let minDist = Infinity;

  for (const note of notes) {
    const dist = Math.min(
      Math.abs(positionMs - note.startMs),
      Math.abs(positionMs - note.endMs),
    );
    if (dist < minDist) {
      minDist = dist;
      closest = note;
    }
  }

  return closest;
}
