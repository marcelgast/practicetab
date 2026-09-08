import type { AlphaTabApiLike, AlphaTabPlayerOptions } from './types';
import type { PlayerState } from './playerState';

export function buildPlayerState(
  api: AlphaTabApiLike,
  container: HTMLElement,
  options: AlphaTabPlayerOptions,
): PlayerState {
  const tickCacheRef = (api as { tickCache?: unknown }).tickCache as {
    getBeatStart?: (beat: unknown) => number;
    getMasterBarStart?: (bar: unknown) => number;
  } | null;

  return {
    api,
    container,
    options,
    tickCacheRef,
    supportsTrackMute: typeof api.changeTrackMute === 'function',
    supportsTrackSolo: typeof api.changeTrackSolo === 'function',
    supportsTrackVolume: typeof api.changeTrackVolume === 'function',
    cachedScore: null,
    cachedTracks: [],
    activeTrackIndex: null,
    selectedRenderTrackIndexes: null,
    isScoreLoading: false,
    pendingActiveTrackIndex: undefined,
    lastSuppressedAlphaTabErrorAt: 0,
    standardNotationEnabled: true,
    scoreTempoApplied: false,
    hasUnsupportedBackingTrack: false,
    beatRects: [],
    beatRectsByStartMs: new Map(),
    beatNotesByStartMs: new Map(),
    lastCursorEmit: 0,
    lastCursorSignature: null,
    cursorWaiters: [],
    tempoMap: [{ tick: 0, timeMs: 0, usPerQuarter: 500000 }],
    midiDivision: 480,
    midiTickShift: 0,
    tickCacheBeatTicksAreShifted: null,
    tickCacheBarTicksAreShifted: null,
    durationMs: 0,
    playheadMs: 0,
    tempoFactor: 1,
    tuningSemitones: 0,
    playing: false,
    lastVibratoWindows: new Map(),
    vibratoWindowsTickCacheReady: false,
    lastPitchBendDebug: null,
    transportState: 'stopped',
    rafId: null,
    loopRangeMs: null,
    loopRangeTicks: null,
    loopEnabled: false,
    lastAudioSyncAt: 0,
    lastAudioSyncMs: 0,
    syncInFlight: null,
    loopGeneration: 0,
    pendingSeek: null,
    audioReady: true,
    audioReadyPromise: null,
    audioReadyToken: 0,
    pendingPlayAfterReady: false,
    renderTracksUnavailable: false,
  };
}
