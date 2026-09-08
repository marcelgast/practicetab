import type { Settings } from '@coderline/alphatab';
import type { AudioTabEvent } from '../audioTabCommands';

/**
 * Context passed to the `onMidiRebuilt` callback after every `rebuildMidi`
 * call. Callers use it to build the expected-note timeline without reaching
 * into internal player state.
 */
export interface MidiRebuildContext {
  /** All merged audio events sorted ascending by `atMs` (1× speed). */
  events: readonly AudioTabEvent[];
  /** Zero-based index of the active track, or null if none. */
  activeTrackIndex: number | null;
  /** Current speed-trainer factor (1.0 = normal speed). */
  tempoFactor: number;
}

export interface AlphaTabEventEmitter<T> {
  on: (handler: (value: T) => void) => void;
}

export type AlphaTabMetronomeEventPayload = {
  tick: number | null;
  beatIndex: number;
  beatDurationMs: number;
};

export type AlphaTabPlayerStatePayload = {
  state: number | null;
  stopped: boolean;
};

export type AlphaTabTrack = {
  index?: number;
  name?: string;
  /**
   * `program` = General MIDI program number. Ranges `24..31` are
   * guitar, `32..39` are bass — the Fretboard Panel (PR 4.2) uses
   * these plus a non-empty staff `tuning` to decide whether the
   * panel toggle should be enabled for the current track.
   */
  playbackInfo?: { primaryChannel?: number; program?: number };
  isPercussion?: boolean;
  staves?: Array<{
    /**
     * Ordered MIDI notes of each open string as the tab stores
     * them — top tab line first (highest-pitched). Empty / missing
     * on non-stringed staves (drums, standard-notation-only).
     */
    tuning?: number[];
    bars?: Array<{
      voices?: Array<{ beats?: Array<unknown> }>;
    }>;
  }>;
};

export type AlphaTabScore = {
  tracks?: AlphaTabTrack[];
  masterBars?: unknown[];
  tempo?: number;
  backingTrack?: unknown;
  /** Score header fields. AlphaTab renders these in Page (multi-line)
   *  mode; in Horizontal (one-liner) mode the title block is suppressed
   *  by alphatab's layout, so PracticeTab pulls the values out and
   *  renders its own title strip above the score. Optional because not
   *  every Guitar Pro file has them populated. */
  title?: string;
  subTitle?: string;
  artist?: string;
};

export type AlphaTabScoreSnapshot = AlphaTabScore;

export interface AlphaTabApiLike {
  load: (scoreData: unknown, trackIndexes?: number[]) => boolean;
  play: () => boolean;
  pause: () => void;
  stop: () => void;
  tickPosition?: number;
  timePosition?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AlphaTab API uses specific Score/Track types; must stay compatible
  renderScore?: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AlphaTab API uses specific Score/Track types; must stay compatible
  renderTracks?: (...args: any[]) => void;
  score?: AlphaTabScore | null;
  tracks?: AlphaTabTrack[];
  settings?: Settings;
  updateSettings?: (settings: Settings) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AlphaTab expects its internal Track type
  changeTrackMute?: (tracks: any[], mute: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AlphaTab expects its internal Track type
  changeTrackSolo?: (tracks: any[], solo: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AlphaTab expects its internal Track type
  changeTrackVolume?: (tracks: any[], volume: number) => void;
  destroy: () => void;
  playbackSpeed?: number;
  masterVolume?: number;
  metronomeVolume?: number;
  countInVolume?: number;
  player?: {
    output?: {
      activate?: () => void;
    };
    isLooping?: boolean;
    tickPosition?: number;
    masterVolume?: number;
    metronomeVolume?: number;
    countInVolume?: number;
  } | null;
  scoreLoaded?: AlphaTabEventEmitter<unknown>;
  error?: AlphaTabEventEmitter<Error>;
  soundFontLoaded?: AlphaTabEventEmitter<void>;
  soundFontLoadFailed?: AlphaTabEventEmitter<Error>;
  playbackRangeHighlightChanged?: AlphaTabEventEmitter<unknown>;
  beatMouseDown?: AlphaTabEventEmitter<unknown>;
  beatMouseMove?: AlphaTabEventEmitter<unknown>;
  beatMouseUp?: AlphaTabEventEmitter<unknown | null>;
  midiEventsPlayed?: AlphaTabEventEmitter<{
    events?: Array<{
      tick?: number;
      isMetronome?: boolean;
      metronomeNumerator?: number;
      metronomeDurationInMilliseconds?: number;
    }>;
  }>;
  midiEventsPlayedFilter?: unknown;
  playerStateChanged?: AlphaTabEventEmitter<{
    state?: number;
    stopped?: boolean;
  }>;
  renderer?: { boundsLookup?: unknown };
  render?: () => void;
  renderFinished?: AlphaTabEventEmitter<unknown>;
  getBeatAtPosition?: (x: number, y: number) => unknown | null;
  playbackRange?: unknown;
}

export type AlphaTabSettings = Settings | Record<string, unknown>;
export type AlphaTabApiFactory = (
  container: HTMLElement,
  settings: AlphaTabSettings,
) => AlphaTabApiLike;

export interface AlphaTabPlayerOptions {
  settings?: AlphaTabSettings;
  onReady?: () => void;
  onError?: (message: string) => void;
  onScoreLoaded?: (tempoBpm: number) => void;
  onSoundFontError?: (message: string) => void;
  onTracksChanged?: (tracks: AlphaTabTrack[]) => void;
  onCursorRectChanged?: (rect: {
    left: number;
    top: number;
    height: number;
  }) => void;
  onPlaybackRangeHighlightChanged?: (
    blocks: Array<{ x: number; y: number; w: number; h: number }>,
  ) => void;
  onBeatMouseDown?: (beat: unknown) => void;
  onBeatMouseMove?: (beat: unknown) => void;
  onBeatMouseUp?: (beat: unknown | null) => void;
  onMetronomeMidiEvent?: (event: AlphaTabMetronomeEventPayload) => void;
  onPlayerStateChanged?: (event: AlphaTabPlayerStatePayload) => void;
  /**
   * Called at the end of every `rebuildMidi` run (score load and re-renders).
   * Receives the merged audio events and current tempo factor so consumers
   * can build derived structures (e.g. expected-note timeline) without
   * coupling to internal player state.
   */
  onMidiRebuilt?: (context: MidiRebuildContext) => void;
  /**
   * Called after every `refreshBeatCache` (triggered by `renderFinished`) with
   * the fresh `rawStartMs → BeatRectangle` map used by the live-feedback
   * overlay (PR 3.6+). The map is invariant across speed-trainer tempoFactor
   * changes — consumers convert at lookup time via
   * `expectedNote.startMs * timeline.tempoFactor`.
   */
  onBeatCacheRefreshed?: (
    rectsByStartMs: ReadonlyMap<
      number,
      {
        x: number;
        y: number;
        w: number;
        h: number;
        onNotesX: number;
        realTopY: number;
      }
    >,
  ) => void;
}

export interface AlphaTabPlayer {
  loadBase64: (base64: string) => void;
  loadBytes: (bytes: Uint8Array) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  getCurrentPositionMs?: () => number | null;
  getCurrentAudioTickPosition?: () => number | null;
  tickToMs?: (tick: number) => number | null;
  getVibratoDebugInfo: () => {
    active: boolean;
    depthCents: number;
    rateHz: number;
  };
  getVibratoWindowsDebug?: () => {
    trackIndex: number | null;
    playheadMs: number;
    totalWindows: number;
    nearby: Array<{
      key: number | null;
      startMs: number;
      endMs: number;
      vibrato: VibratoKind;
    }>;
  };
  getPitchBendDebugInfo?: () => {
    events: PitchBendDebugEvent[];
    beatMatches: PitchBendDebugBeat[];
    channelToTrackIndex: Record<string, number>;
    lookupSamples: PitchBendDebugLookup[];
  } | null;
  getCurrentCursorRect: () => {
    left: number;
    top: number;
    height: number;
  } | null;
  getCursorRect: () => { left: number; top: number; height: number } | null;
  waitForNextCursorRect: (options?: {
    timeoutMs?: number;
    requireDifferentFromLast?: boolean;
  }) => Promise<{ left: number; top: number; height: number } | null>;
  waitForRenderFinished: (options?: { timeoutMs?: number }) => Promise<void>;
  seekToStart: (options?: { soft?: boolean }) => void;
  refreshLayout: () => void;
  hitTestToCursorRect: (
    contentX: number,
    contentY: number,
  ) => {
    left: number;
    top: number;
    height: number;
  } | null;
  refreshBeatCache: () => void;
  /**
   * Snapshot of the overlay beat-rect index keyed by raw 1× startMs.
   * Useful for consumers that connect later than the `onBeatCacheRefreshed`
   * callback (e.g. overlay components mounted after initial render).
   * Returns an empty map until the first refresh has run.
   */
  getBeatRectsByStartMs: () => ReadonlyMap<
    number,
    {
      x: number;
      y: number;
      w: number;
      h: number;
      onNotesX: number;
      realTopY: number;
    }
  >;
  /**
   * Snapshot of the Fretboard Panel's per-beat note positions, keyed
   * by the same raw 1× `startMs` used by `getBeatRectsByStartMs`.
   * Populated by the same `refreshBeatCache` pass — consumers that
   * mount later than the initial render can pull the current state
   * here instead of waiting for the next cache refresh.
   */
  getBeatNotesByStartMs: () => ReadonlyMap<
    number,
    readonly {
      stringIndex: number;
      fret: number;
      midiNote: number;
    }[]
  >;
  snapToNearestBeat: (
    contentX: number,
    contentY: number,
  ) => {
    left: number;
    top: number;
    height: number;
    cursorMs?: number;
    cursorTick?: number;
  } | null;
  seekToMs: (ms: number) => Promise<void>;
  seekToTick: (tick: number) => Promise<void>;
  seekAndPlay: (tick: number) => Promise<void>;
  setTempoPercent: (tempoPercent: number) => void;
  setTuning: (tuningSemitones: number, options?: { force?: boolean }) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setCountInEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;
  setCountInVolume: (volume: number) => void;
  setLooping: (isLooping: boolean) => void;
  hasLoopRange: () => boolean;
  getBeatAtPosition: (x: number, y: number) => unknown | null;
  getBeatStartTick: (beat: unknown) => number | null;
  getFirstNoteTick: () => number | null;
  getFirstTrackWithNotesIndex: () => number | null;
  setCursorTick: (tick: number) => void;
  getBarStartTick: (barIndex: number) => number | null;
  getBarRangeTicks: (barIndex: number) => { start: number; end: number } | null;
  getBarCount: () => number;
  getBarTimeSignature: (
    barIndex: number,
  ) => { top: number; bottom: number } | null;
  getBeatDurationTicksAtTick: (tick: number) => number | null;
  getCurrentTickPosition: () => number | null;
  getCurrentBeatInfo: () => AlphaTabBeatInfo | null;
  getTempoAtTick: (tick: number) => number | null;
  hasTempoChanges: () => boolean;
  hasUnsupportedBackingTrack: () => boolean;
  getTimeSignatureAtTick: (
    tick: number,
  ) => { top: number; bottom: number } | null;
  getBarStartTickAtTick: (tick: number) => number | null;
  getTickDivision: () => number | null;
  getTransportState: () => 'stopped' | 'playing' | 'paused' | 'ended';
  getBarIndexFromBeat: (beat: unknown) => number | null;
  getBarIndexAtPosition: (x: number, y: number) => number | null;
  getBarBoundsByIndex: (
    index: number,
  ) => { x: number; y: number; w: number; h: number } | null;
  setPlaybackRangeFromBeats: (startBeat: unknown, endBeat: unknown) => boolean;
  setPlaybackRangeFromBarIndex: (
    startIndex: number,
    endIndex: number,
  ) => boolean;
  getPlaybackRangeTicks: () => { start: number; end: number } | null;
  highlightPlaybackRange: (startBeat: unknown, endBeat: unknown) => void;
  applyPlaybackRangeFromHighlight: () => void;
  clearPlaybackRangeHighlight: () => void;
  clearPlaybackRange: () => void;
  setBpm: (bpm: number, baseBpm: number) => void;
  setVolume: (volume: number) => void;
  setTrackMute: (trackIndex: number, muted: boolean) => void;
  setTrackSolo: (trackIndex: number, soloed: boolean) => void;
  setTrackVolume: (trackIndex: number, volume: number) => void;
  supportsTrackMute: boolean;
  supportsTrackSolo: boolean;
  supportsTrackVolume: boolean;
  setVisibleTracks: (indexes: number[]) => void;
  setActiveTrack: (index: number | null) => void;
  setShowStandardNotation: (enabled: boolean) => void;
  setTabRhythm: (enabled: boolean) => void;
  setLayoutMode: (horizontal: boolean) => void;
  getCurrentScoreContext?: () => {
    score: AlphaTabScoreSnapshot;
    settings: Settings | null;
  } | null;
  dispose: () => void;
}

export type AlphaTabBeatInfo = {
  beat: unknown;
  barIndex: number | null;
  barStartTick: number | null;
  beatIndex: number | null;
  beatStartTick: number | null;
  beatDurationTicks: number | null;
  timeSignature: { top: number; bottom: number };
  currentTick: number;
};

export type VibratoKind = 'none' | 'slight' | 'wide';

export type TempoPoint = {
  tick: number;
  timeMs: number;
  usPerQuarter: number;
};

export type LoopRangeMs = {
  startMs: number;
  endMs: number;
};

export type PitchBendDebugEvent = {
  tick: number;
  atMs: number;
  channel: number;
  trackIndex: number | null;
  value: number;
};

export type PitchBendDebugBeat = {
  tick: number;
  beatDurationTicks: number | null;
  beatStartTick: number | null;
  vibrato: VibratoKind;
};

export type PitchBendDebugLookup = {
  tick: number;
  rawTick: number;
  keys: string[];
  beatLookupType: string | null;
};

export type PitchBendSegment = {
  startTick: number;
  endTick: number;
  minValue: number;
  maxValue: number;
};

export type SlidePlaybackSettingsLike = {
  shiftSlideDurationRatio?: number;
};

export const ALPHATAB_FONT_DIR = '/alphatab/';
export const ALPHATAB_FONT_CHECK_FILE = 'Bravura.woff2';
export const ALPHATAB_SOUNDFONT_FILE = 'sonivox.sf2';
// Font stack for rendered text inside the AlphaTab score (words, markers,
// lyrics, score header). Mirrors the app UI font so score text visually
// matches the rest of the app instead of AlphaTab's serif defaults.
export const ALPHATAB_TEXT_FONT_FAMILY =
  "'Space Grotesk', 'SF Pro Text', 'Segoe UI', sans-serif";
export const DEFAULT_CLICK_VOLUME = 0.6;
export const HARMONIC_TYPE_NATURAL = 1;
export const CURSOR_EMIT_MIN_INTERVAL_MS = 33;
export const ALPHATAB_COLORS = {
  staffLine: '#6f7684',
  barSeparator: '#b7bcc7',
  barNumber: '#b7bcc7',
  mainGlyph: '#e6e6ea',
  secondaryGlyph: 'rgba(230, 230, 234, 0.5)',
  scoreInfo: '#b7bcc7',
} as const;

export const PITCH_BEND_CENTER = 8192;
export const PITCH_BEND_MAX = 16383;
export const SOURCE_BEND_RANGE_SEMITONES = 16;
export const FADE_TYPE_NONE = 0;
export const FADE_TYPE_IN = 1;
export const FADE_TYPE_OUT = 2;
export const FADE_TYPE_SWELL = 3;
export const EXPRESSION_MAX = 127;
export const FADE_STEPS = 8;
export const SLIDE_OUT_LEGATO = 2;
export const VIB_DEPTH_CENTS_DEFAULT = 1.6;
export const VIB_DEPTH_CENTS_WIDE = 3;
export const VIB_RATE_HZ_DEFAULT = 4.8;
export const VIB_RATE_HZ_WIDE = 4.8;
