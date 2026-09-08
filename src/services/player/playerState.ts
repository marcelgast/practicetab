import type { BeatRect } from '../../domain/beatSnap';
import type { BeatRectangle } from './beatRectIndex';
import type { FretPosition } from '../../domain/fretboard';
import type {
  AlphaTabApiLike,
  AlphaTabPlayerOptions,
  AlphaTabScore,
  AlphaTabTrack,
  LoopRangeMs,
  PitchBendDebugBeat,
  PitchBendDebugEvent,
  PitchBendDebugLookup,
  TempoPoint,
  VibratoKind,
} from './types';

/** Shared mutable state for a single AlphaTabPlayer instance. */
export type PlayerState = {
  api: AlphaTabApiLike;
  container: HTMLElement;
  options: AlphaTabPlayerOptions;
  tickCacheRef: {
    getBeatStart?: (beat: unknown) => number;
    getMasterBarStart?: (bar: unknown) => number;
  } | null;
  supportsTrackMute: boolean;
  supportsTrackSolo: boolean;
  supportsTrackVolume: boolean;
  cachedScore: AlphaTabScore | null;
  cachedTracks: AlphaTabTrack[];
  activeTrackIndex: number | null;
  selectedRenderTrackIndexes: number[] | null;
  isScoreLoading: boolean;
  pendingActiveTrackIndex: number | null | undefined;
  lastSuppressedAlphaTabErrorAt: number;
  standardNotationEnabled: boolean;
  scoreTempoApplied: boolean;
  hasUnsupportedBackingTrack: boolean;
  beatRects: BeatRect[];
  /**
   * Renderable-beat index for the live-feedback overlay (PR 3.6+).
   * Keyed by raw 1×-speed startMs so the cache is invariant across
   * speed-trainer tempoFactor changes. Populated after every
   * `renderFinished` via `playerRefreshBeatCache`.
   */
  beatRectsByStartMs: Map<number, BeatRectangle>;
  /**
   * Sibling to `beatRectsByStartMs`: for each indexed beat, the list
   * of `(stringIndex, fret, midiNote)` positions driving the
   * Fretboard Panel (PR 4.2). Shares the same key convention and
   * refresh pass so a single `renderFinished` rebuilds both caches.
   */
  beatNotesByStartMs: Map<number, FretPosition[]>;
  lastCursorEmit: number;
  lastCursorSignature: string | null;
  cursorWaiters: Array<{
    resolve: (
      rect: { left: number; top: number; height: number } | null,
    ) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    lastSignature: string | null;
    requireDifferent: boolean;
  }>;
  tempoMap: TempoPoint[];
  midiDivision: number;
  midiTickShift: number;
  tickCacheBeatTicksAreShifted: boolean | null;
  tickCacheBarTicksAreShifted: boolean | null;
  durationMs: number;
  playheadMs: number;
  tempoFactor: number;
  tuningSemitones: number;
  playing: boolean;
  lastVibratoWindows: Map<
    number,
    Array<{
      key: number | null;
      startMs: number;
      endMs: number;
      startTick?: number;
      endTick?: number;
      vibrato: VibratoKind;
    }>
  >;
  vibratoWindowsTickCacheReady: boolean;
  lastPitchBendDebug: {
    events: PitchBendDebugEvent[];
    beatMatches: PitchBendDebugBeat[];
    channelToTrackIndex: Record<string, number>;
    lookupSamples: PitchBendDebugLookup[];
  } | null;
  transportState: 'stopped' | 'playing' | 'paused' | 'ended';
  rafId: number | null;
  loopRangeMs: LoopRangeMs | null;
  loopRangeTicks: { start: number; end: number } | null;
  loopEnabled: boolean;
  lastAudioSyncAt: number;
  lastAudioSyncMs: number;
  syncInFlight: Promise<void> | null;
  loopGeneration: number;
  pendingSeek: Promise<void> | null;
  audioReady: boolean;
  audioReadyPromise: Promise<void> | null;
  audioReadyToken: number;
  pendingPlayAfterReady: boolean;
  renderTracksUnavailable: boolean;
};

export function safeTrackIndex(track: AlphaTabTrack, fallback: number): number {
  try {
    const value = (track as { index?: unknown }).index;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  } catch {
    // Ignore track metadata read errors.
  }
  return fallback;
}

export function safeTrackName(track: AlphaTabTrack, fallback: string): string {
  try {
    const value = (track as { name?: unknown }).name;
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  } catch {
    // Ignore malformed track getter failures.
  }
  return fallback;
}
