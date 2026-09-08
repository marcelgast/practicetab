import type { Settings } from '@coderline/alphatab';
import type {
  AlphaTabBeatInfo,
  AlphaTabPlayer,
  AlphaTabPlayerOptions,
  AlphaTabScoreSnapshot,
  PitchBendDebugBeat,
  PitchBendDebugEvent,
  PitchBendDebugLookup,
  VibratoKind,
} from './types';
import { VIB_DEPTH_CENTS_DEFAULT, VIB_RATE_HZ_DEFAULT } from './types';
import { createAlphaTabPlayer } from './createPlayer';

let activePlayer: AlphaTabPlayer | null = null;
let activeContainer: HTMLElement | null = null;

export const alphatabPlayer = {
  supportsTrackMute: false,
  supportsTrackSolo: false,
  supportsTrackVolume: false,
  init(container: HTMLElement, options?: AlphaTabPlayerOptions): void {
    activePlayer?.dispose();
    activePlayer = createAlphaTabPlayer(container, options);
    activeContainer = container;
    this.supportsTrackMute = activePlayer.supportsTrackMute;
    this.supportsTrackSolo = activePlayer.supportsTrackSolo;
    this.supportsTrackVolume = activePlayer.supportsTrackVolume;
  },
  loadBase64(base64: string): void {
    activePlayer?.loadBase64(base64);
  },
  loadBytes(bytes: Uint8Array): void {
    activePlayer?.loadBytes(bytes);
  },
  play(): void {
    activePlayer?.play();
  },
  pause(): void {
    activePlayer?.pause();
  },
  stop(): void {
    activePlayer?.stop();
  },
  getVibratoDebugInfo(): {
    active: boolean;
    depthCents: number;
    rateHz: number;
  } {
    return (
      activePlayer?.getVibratoDebugInfo() ?? {
        active: false,
        depthCents: VIB_DEPTH_CENTS_DEFAULT,
        rateHz: VIB_RATE_HZ_DEFAULT,
      }
    );
  },
  getVibratoWindowsDebug(): {
    trackIndex: number | null;
    playheadMs: number;
    totalWindows: number;
    nearby: Array<{
      key: number | null;
      startMs: number;
      endMs: number;
      vibrato: VibratoKind;
    }>;
  } | null {
    return activePlayer?.getVibratoWindowsDebug?.() ?? null;
  },
  getPitchBendDebugInfo(): {
    events: PitchBendDebugEvent[];
    beatMatches: PitchBendDebugBeat[];
    channelToTrackIndex: Record<string, number>;
    lookupSamples: PitchBendDebugLookup[];
  } | null {
    return activePlayer?.getPitchBendDebugInfo?.() ?? null;
  },
  seekToStart(options?: { soft?: boolean }): void {
    activePlayer?.seekToStart(options);
  },
  getCurrentCursorRect(): { left: number; top: number; height: number } | null {
    return activePlayer?.getCurrentCursorRect() ?? null;
  },
  getCurrentPositionMs(): number | null {
    return activePlayer?.getCurrentPositionMs?.() ?? null;
  },
  getCurrentAudioTickPosition(): number | null {
    return activePlayer?.getCurrentAudioTickPosition?.() ?? null;
  },
  tickToMs(tick: number): number | null {
    return activePlayer?.tickToMs?.(tick) ?? null;
  },
  waitForNextCursorRect(options?: {
    timeoutMs?: number;
    requireDifferentFromLast?: boolean;
  }): Promise<{ left: number; top: number; height: number } | null> {
    return (
      activePlayer?.waitForNextCursorRect(options) ?? Promise.resolve(null)
    );
  },
  waitForRenderFinished(options?: { timeoutMs?: number }): Promise<void> {
    return activePlayer?.waitForRenderFinished(options) ?? Promise.resolve();
  },
  getCursorRect(): { left: number; top: number; height: number } | null {
    return activePlayer?.getCursorRect() ?? null;
  },
  refreshLayout(): void {
    activePlayer?.refreshLayout();
  },
  hitTestToCursorRect(
    contentX: number,
    contentY: number,
  ): { left: number; top: number; height: number } | null {
    return activePlayer?.hitTestToCursorRect(contentX, contentY) ?? null;
  },
  refreshBeatCache(): void {
    activePlayer?.refreshBeatCache();
  },
  getBeatRectsByStartMs(): ReadonlyMap<
    number,
    {
      x: number;
      y: number;
      w: number;
      h: number;
      onNotesX: number;
      realTopY: number;
    }
  > {
    return activePlayer?.getBeatRectsByStartMs() ?? new Map();
  },
  getBeatNotesByStartMs(): ReadonlyMap<
    number,
    readonly {
      stringIndex: number;
      fret: number;
      midiNote: number;
    }[]
  > {
    return activePlayer?.getBeatNotesByStartMs() ?? new Map();
  },
  snapToNearestBeat(
    contentX: number,
    contentY: number,
  ): { left: number; top: number; height: number } | null {
    return activePlayer?.snapToNearestBeat(contentX, contentY) ?? null;
  },
  setTempoPercent(tempoPercent: number): void {
    activePlayer?.setTempoPercent(tempoPercent);
  },
  setTuning(tuningSemitones: number, options?: { force?: boolean }): void {
    activePlayer?.setTuning(tuningSemitones, options);
  },
  setMetronomeEnabled(enabled: boolean): void {
    activePlayer?.setMetronomeEnabled(enabled);
  },
  setCountInEnabled(enabled: boolean): void {
    activePlayer?.setCountInEnabled(enabled);
  },
  setMetronomeVolume(volume: number): void {
    activePlayer?.setMetronomeVolume(volume);
  },
  setCountInVolume(volume: number): void {
    activePlayer?.setCountInVolume(volume);
  },
  setLooping(isLooping: boolean): void {
    activePlayer?.setLooping(isLooping);
  },
  getBeatAtPosition(x: number, y: number): unknown | null {
    return activePlayer?.getBeatAtPosition(x, y) ?? null;
  },
  getBeatStartTick(beat: unknown): number | null {
    return activePlayer?.getBeatStartTick(beat) ?? null;
  },
  getFirstNoteTick(): number | null {
    return activePlayer?.getFirstNoteTick() ?? null;
  },
  getFirstTrackWithNotesIndex(): number | null {
    return activePlayer?.getFirstTrackWithNotesIndex() ?? null;
  },
  setCursorTick(tick: number): void {
    activePlayer?.setCursorTick(tick);
  },
  getBarStartTick(barIndex: number): number | null {
    return activePlayer?.getBarStartTick(barIndex) ?? null;
  },
  getBarRangeTicks(barIndex: number): { start: number; end: number } | null {
    return activePlayer?.getBarRangeTicks(barIndex) ?? null;
  },
  getBarCount(): number {
    return activePlayer?.getBarCount() ?? 0;
  },
  getBarTimeSignature(
    barIndex: number,
  ): { top: number; bottom: number } | null {
    return activePlayer?.getBarTimeSignature(barIndex) ?? null;
  },
  getBeatDurationTicksAtTick(tick: number): number | null {
    return activePlayer?.getBeatDurationTicksAtTick(tick) ?? null;
  },
  getCurrentTickPosition(): number | null {
    return activePlayer?.getCurrentTickPosition() ?? null;
  },
  getCurrentBeatInfo(): AlphaTabBeatInfo | null {
    return activePlayer?.getCurrentBeatInfo() ?? null;
  },
  getTempoAtTick(tick: number): number | null {
    return activePlayer?.getTempoAtTick(tick) ?? null;
  },
  hasTempoChanges(): boolean {
    return activePlayer?.hasTempoChanges() ?? false;
  },
  hasUnsupportedBackingTrack(): boolean {
    return activePlayer?.hasUnsupportedBackingTrack() ?? false;
  },
  getTimeSignatureAtTick(tick: number): { top: number; bottom: number } | null {
    return activePlayer?.getTimeSignatureAtTick(tick) ?? null;
  },
  getBarStartTickAtTick(tick: number): number | null {
    return activePlayer?.getBarStartTickAtTick(tick) ?? null;
  },
  getTickDivision(): number | null {
    return activePlayer?.getTickDivision() ?? null;
  },
  getTransportState(): 'stopped' | 'playing' | 'paused' | 'ended' {
    return activePlayer?.getTransportState() ?? 'stopped';
  },
  getBarIndexFromBeat(beat: unknown): number | null {
    return activePlayer?.getBarIndexFromBeat(beat) ?? null;
  },
  getBarIndexAtPosition(x: number, y: number): number | null {
    return activePlayer?.getBarIndexAtPosition(x, y) ?? null;
  },
  getBarBoundsByIndex(
    index: number,
  ): { x: number; y: number; w: number; h: number } | null {
    return activePlayer?.getBarBoundsByIndex(index) ?? null;
  },
  setPlaybackRangeFromBeats(startBeat: unknown, endBeat: unknown): boolean {
    return activePlayer?.setPlaybackRangeFromBeats(startBeat, endBeat) ?? false;
  },
  setPlaybackRangeFromBarIndex(startIndex: number, endIndex: number): boolean {
    return (
      activePlayer?.setPlaybackRangeFromBarIndex(startIndex, endIndex) ?? false
    );
  },
  getPlaybackRangeTicks(): { start: number; end: number } | null {
    return activePlayer?.getPlaybackRangeTicks() ?? null;
  },
  highlightPlaybackRange(startBeat: unknown, endBeat: unknown): void {
    activePlayer?.highlightPlaybackRange(startBeat, endBeat);
  },
  applyPlaybackRangeFromHighlight(): void {
    activePlayer?.applyPlaybackRangeFromHighlight();
  },
  clearPlaybackRangeHighlight(): void {
    activePlayer?.clearPlaybackRangeHighlight();
  },
  clearPlaybackRange(): void {
    activePlayer?.clearPlaybackRange();
  },
  setBpm(bpm: number, baseBpm: number): void {
    activePlayer?.setBpm(bpm, baseBpm);
  },
  setVolume(volume: number): void {
    activePlayer?.setVolume(volume);
  },
  setTrackMute(trackIndex: number, muted: boolean): void {
    activePlayer?.setTrackMute(trackIndex, muted);
  },
  setTrackSolo(trackIndex: number, soloed: boolean): void {
    activePlayer?.setTrackSolo(trackIndex, soloed);
  },
  setTrackVolume(trackIndex: number, volume: number): void {
    activePlayer?.setTrackVolume(trackIndex, volume);
  },
  async seekToMs(ms: number): Promise<void> {
    await activePlayer?.seekToMs(ms);
  },
  async seekToTick(tick: number): Promise<void> {
    await activePlayer?.seekToTick(tick);
  },
  async seekAndPlay(tick: number): Promise<void> {
    await activePlayer?.seekAndPlay(tick);
  },
  setVisibleTracks(indexes: number[]): void {
    activePlayer?.setVisibleTracks(indexes);
  },
  setActiveTrack(index: number | null): void {
    activePlayer?.setActiveTrack(index);
  },
  setShowStandardNotation(enabled: boolean): void {
    activePlayer?.setShowStandardNotation(enabled);
  },
  setTabRhythm(enabled: boolean): void {
    activePlayer?.setTabRhythm(enabled);
  },
  setLayoutMode(horizontal: boolean): void {
    activePlayer?.setLayoutMode(horizontal);
  },
  getCurrentScoreContext(): {
    score: AlphaTabScoreSnapshot;
    settings: Settings | null;
  } | null {
    return activePlayer?.getCurrentScoreContext?.() ?? null;
  },
  dispose(): void {
    activePlayer?.dispose();
    activePlayer = null;
    activeContainer = null;
    this.supportsTrackMute = false;
    this.supportsTrackSolo = false;
    this.supportsTrackVolume = false;
  },
  isInitialized(): boolean {
    return Boolean(activePlayer);
  },
  getContainerSize(): { width: number; height: number } | null {
    if (!activeContainer) {
      return null;
    }
    const rect = activeContainer.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  },
};
