import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useNoteRecognitionStore } from '../stores/noteRecognition';
import { usePitchDetectionStore } from '../stores/pitchDetection';
import { getAudioPositionMs } from '../services/audioTabCommands';
import type { AudioTabEvent } from '../services/audioTabCommands';
import { isTauri } from '../services/libraryFileOps';
import type { PitchResult } from '../services/pitchDetectionCommands';

// audioTabCommands invokes Tauri — stub position polling so RAF loop is a no-op
vi.mock('../services/audioTabCommands', () => ({
  getAudioPositionMs: vi.fn(() => new Promise(() => {})), // never resolves → tests drive position via updatePosition()
}));

// libraryFileOps.isTauri controls whether the RAF polling loop is active
vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => false), // polling disabled by default; override per test
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNoteOnEvent(
  atMs: number,
  key: number,
  channel = 0,
): AudioTabEvent {
  return {
    atMs,
    trackId: 'track-0',
    channel,
    kind: { type: 'note_on', key },
  };
}

function makeNoteOffEvent(
  atMs: number,
  key: number,
  channel = 0,
): AudioTabEvent {
  return {
    atMs,
    trackId: 'track-0',
    channel,
    kind: { type: 'note_off', key },
  };
}

/**
 * Drive a valid pitch through the pitch-detection store so the
 * noteRecognition store's internal pitch watcher forwards it into the
 * engine. Used by tests that need to disarm the engine's warmup guard —
 * without this the engine's `firstValidPitchAt` stays null and notes
 * that close without pitch are silently skipped rather than marked
 * `missed` (intentional UX: see advancePlayhead comment).
 */
async function pushValidPitch(
  overrides: Partial<PitchResult> = {},
): Promise<void> {
  const pitchStore = usePitchDetectionStore();
  pitchStore.currentPitch = {
    frequency: 329.63,
    clarity: 0.95,
    rms: 0.1,
    midiNote: 64,
    noteName: 'E4',
    centsOffset: 0,
    timestampMs: 100,
    onsetDetected: false,
    ...overrides,
  } as PitchResult;
  await nextTick();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNoteRecognitionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(isTauri).mockReturnValue(false); // polling off by default
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with null timeline', () => {
    const store = useNoteRecognitionStore();
    expect(store.timeline).toBeNull();
  });

  it('builds timeline on onMidiRebuilt', () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    expect(store.timeline).not.toBeNull();
    expect(store.timeline!.notes).toHaveLength(1);
    expect(store.timeline!.notes[0].midiNote).toBe(64);
  });

  it('clearTimeline() sets timeline to null and resets position', () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    expect(store.timeline).not.toBeNull();

    store.clearTimeline();

    expect(store.timeline).toBeNull();
    expect(store.currentPositionMs).toBe(0);
  });

  it('clearTimeline() clears the event cache so buildForTrack is a no-op', () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    store.clearTimeline();

    // After clear, buildForTrack should not rebuild (cache is empty)
    store.buildForTrack(0);
    expect(store.timeline).toBeNull();
  });

  it('rescaleTimeline() correctly applies a new tempo factor', () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(1000, 64),
      makeNoteOffEvent(2000, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    expect(store.timeline!.notes[0].startMs).toBeCloseTo(1000, 5);

    store.rescaleTimeline(0.5);
    expect(store.timeline!.notes[0].startMs).toBeCloseTo(2000, 5);
  });

  it('buildForTrack() rebuilds for a different track without re-receiving events', () => {
    const store = useNoteRecognitionStore();
    // track-0: note 64; track-1: note 60
    const events: AudioTabEvent[] = [
      {
        atMs: 0,
        trackId: 'track-0',
        channel: 0,
        kind: { type: 'note_on', key: 64 },
      },
      {
        atMs: 500,
        trackId: 'track-0',
        channel: 0,
        kind: { type: 'note_off', key: 64 },
      },
      {
        atMs: 0,
        trackId: 'track-1',
        channel: 1,
        kind: { type: 'note_on', key: 60 },
      },
      {
        atMs: 500,
        trackId: 'track-1',
        channel: 1,
        kind: { type: 'note_off', key: 60 },
      },
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    expect(store.timeline!.notes[0].midiNote).toBe(64);

    store.buildForTrack(1);
    expect(store.timeline!.notes[0].midiNote).toBe(60);
    expect(store.timeline!.trackId).toBe('track-1');
  });

  // -------------------------------------------------------------------------
  // Position-driven engine advancement (Finding 1 regression)
  // -------------------------------------------------------------------------

  it('updatePosition() past a note end emits a missed NoteResult when comparing', async () => {
    // Warmup guard note: a silent first note is intentionally skipped
    // now (startup artefact, see advancePlayhead). Arm the guard with
    // a valid pitch before testing the miss path.
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(200, 64),
      makeNoteOnEvent(500, 67),
      makeNoteOffEvent(1000, 67),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    store.setFeedbackEnabled(true);
    store.startComparison();

    store.updatePosition(0);
    await pushValidPitch({ onsetDetected: true });
    store.updatePosition(201);
    // Open note 2's window and let it run silent through to its end —
    // a genuine miss (distinct from a same-tick open+close which the
    // engine skips as a seek-over).
    store.updatePosition(501);
    store.updatePosition(1001);

    const missed = store.noteResults.filter((r) => r.outcome === 'missed');
    expect(missed).toHaveLength(1);
  });

  it('updatePosition() does not emit results when not comparing', () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    // Deliberately NOT calling startComparison()

    store.updatePosition(0);
    store.updatePosition(501);

    expect(store.noteResults).toHaveLength(0);
  });

  // Review finding 1: transport callers fire startComparison() on every
  // play path. When the Feedback toggle is off the store must stay idle
  // regardless, or the comparison pipeline runs invisibly behind the UI.
  it('startComparison() is a no-op while feedback is disabled', () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    // feedbackEnabled defaults to false — simulate transport code calling
    // startComparison() without the user having armed the overlay.

    store.startComparison();

    expect(store.isComparing).toBe(false);
    store.updatePosition(0);
    store.updatePosition(501);
    expect(store.noteResults).toHaveLength(0);
  });

  it('startComparison() runs once feedback is enabled', () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);

    store.startComparison();
    expect(store.isComparing).toBe(false);

    store.setFeedbackEnabled(true);
    store.startComparison();
    expect(store.isComparing).toBe(true);
  });

  it('stopComparison() stops position sync and preserves results', async () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    store.setFeedbackEnabled(true);
    store.startComparison();
    store.updatePosition(0);
    await pushValidPitch({ onsetDetected: true });
    store.updatePosition(501); // emits a hit result

    store.stopComparison();

    expect(store.isComparing).toBe(false);
    // Results are preserved for the overlay
    expect(store.noteResults).toHaveLength(1);
  });

  it('clearTimeline() stops comparison and clears results', async () => {
    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    store.setFeedbackEnabled(true);
    store.startComparison();
    store.updatePosition(0);
    await pushValidPitch({ onsetDetected: true });
    store.updatePosition(501);
    expect(store.noteResults).toHaveLength(1);

    store.clearTimeline();

    expect(store.isComparing).toBe(false);
    expect(store.noteResults).toHaveLength(0);
    expect(store.timeline).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Stale position-poll generation guard (Finding 3 regression)
  // -------------------------------------------------------------------------

  it('stale getAudioPositionMs() result after stop+restart is discarded', async () => {
    // Enable the RAF polling path for this test.
    vi.mocked(isTauri).mockReturnValue(true);

    // Capture RAF callbacks so we can fire them manually.
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    // First comparison run: getAudioPositionMs returns a controllable promise.
    let resolveOldPosition!: (ms: number | null) => void;
    const oldPositionPromise = new Promise<number | null>(
      (res) => (resolveOldPosition = res),
    );
    vi.mocked(getAudioPositionMs).mockReturnValueOnce(oldPositionPromise);
    // Subsequent polls (new comparison run) never resolve — irrelevant to test.
    vi.mocked(getAudioPositionMs).mockReturnValue(new Promise(() => {}));

    const store = useNoteRecognitionStore();
    const events: AudioTabEvent[] = [
      makeNoteOnEvent(0, 64),
      makeNoteOffEvent(500, 64),
    ];
    store.onMidiRebuilt(events, 0, 1.0);
    store.setFeedbackEnabled(true);

    // Start comparison → RAF schedules the first tick.
    store.startComparison();
    expect(rafCallback).not.toBeNull();

    // Fire the first tick: coalesces into an in-flight getAudioPositionMs call
    // and schedules the next tick.
    (rafCallback as FrameRequestCallback)(0);
    rafCallback = null; // reset so we can detect if the new loop schedules

    // Stop and immediately restart before the old promise resolves.
    store.stopComparison();
    store.startComparison(); // new generation — old promise result must be dropped

    // Resolve the OLD in-flight promise with a stale position past the note end.
    // Without the generation guard this would drive advancePlayhead(501) on the
    // freshly reset engine and emit a bogus 'missed' result.
    resolveOldPosition(501);
    await Promise.resolve(); // flush microtask queue

    expect(store.noteResults).toHaveLength(0); // stale result discarded
  });

  // ---------------------------------------------------------------------------
  // bestStreak lifecycle (regression for review finding #12)
  // ---------------------------------------------------------------------------

  it('preserves bestStreak when toggling feedback off and back on within the same tab', async () => {
    // Regression: setFeedbackEnabled used to reset bestStreak in
    // BOTH directions, so toggling feedback off mid-practice (e.g.
    // to focus on a hard section) and back on wiped the user's
    // session high. The doc on bestStreak says "best run in current
    // practice session" — the practice session hasn't changed when
    // the toggle flips. Reset belongs in clearTimeline (tab swap)
    // only.
    const store = useNoteRecognitionStore();
    store.setFeedbackEnabled(true);
    // Pinia unwraps refs on the proxy — assignment works directly
    // because the test is the only mutator and we don't need to
    // round-trip through engine results to exercise the regression.
    (store as unknown as { bestStreak: number }).bestStreak = 7;

    store.setFeedbackEnabled(false);
    expect(store.bestStreak).toBe(7);

    store.setFeedbackEnabled(true);
    // currentStreak resets (each enable starts a fresh run) but the
    // session high is sacred until the user changes tab.
    expect(store.currentStreak).toBe(0);
    expect(store.bestStreak).toBe(7);
  });

  it('resets bestStreak on clearTimeline (tab swap)', async () => {
    const store = useNoteRecognitionStore();
    store.setFeedbackEnabled(true);
    (store as unknown as { bestStreak: number }).bestStreak = 7;

    store.clearTimeline();
    expect(store.bestStreak).toBe(0);
  });
});
