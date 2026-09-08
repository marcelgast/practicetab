import { LayoutMode, TabRhythmMode, type Settings } from '@coderline/alphatab';

/**
 * Render scale applied when the horizontal one-liner layout is
 * active. A small bump over the page-layout default keeps glyphs
 * legible without shrinking the forward-lookahead horizon — `1.3`
 * was tested and rejected as "too close, can't see far enough
 * ahead". `1.1` keeps most of the legibility gain while leaving
 * roughly 4–5 bars visible past the cursor at typical viewport
 * widths.
 */
const HORIZONTAL_LAYOUT_SCALE = 1.1;
const PAGE_LAYOUT_SCALE = 1.0;
import type {
  AlphaTabApiFactory,
  AlphaTabPlayer,
  AlphaTabPlayerOptions,
} from './types';
import { base64ToUint8Array, buildSettings, defaultApiFactory } from './utils';
import { hasMeaningfulTempoChanges, msToTick, tickToMs } from './tempoMap';
import type { PlayerState } from './playerState';
import {
  applyPlayheadMs,
  devLog,
  getCurrentCursorRectInternal,
  getVibratoDebugInfo,
  readCurrentTickPosition,
  stopRaf,
} from './playerHelpers';
import {
  getCurrentBeatInfoInternal,
  resolveBarIndexFromBeat,
  resolveBeatStartTick,
  resolveTimeSignatureAtTick,
} from './playerBeatResolvers';
import { prepareForScoreLoad } from './playerScoreLoad';
import { subscribeAlphaTabEvents } from './playerEvents';
import {
  applyAlphaTabTempoShift,
  applyAlphaTabTextLineSpacing,
} from './alphaTabTextSpacing';
import {
  getBarBoundsByIndex,
  getBarIndexAtPosition,
  getBarRangeTicks,
  getBarStartTick,
  getBarStartTickAtTick,
  getBarTimeSignature,
  getBeatAtPosition,
  getBeatDurationTicksAtTick,
  getFirstNoteTick,
  getFirstTrackWithNotesIndex,
  setPlaybackRangeFromBarIndex,
  setPlaybackRangeFromBeats,
} from './playerMethodBuilders';
import {
  playerPlay,
  playerPause,
  playerStop,
  playerSetCursorTick,
  playerSeekToMs,
  playerSeekToTick,
  playerSeekAndPlay,
  playerSetTuning,
  playerSetTempoPercent,
  playerSetBpm,
  playerSetMetronomeEnabled,
  playerSetCountInEnabled,
  playerSetMetronomeVolume,
  playerSetCountInVolume,
  playerSetVolume,
  playerSetTrackMute,
  playerSetTrackSolo,
  playerSetTrackVolume,
} from './playerTransport';
import {
  playerSeekToStart,
  playerRefreshBeatCache,
  playerSnapToNearestBeat,
  playerHitTestToCursorRect,
  playerSetLooping,
  playerHighlightPlaybackRange,
  playerApplyPlaybackRangeFromHighlight,
  playerClearPlaybackRangeHighlight,
  playerClearPlaybackRange,
  playerSetVisibleTracks,
  playerSetActiveTrack,
  playerSetShowStandardNotation,
} from './playerUiMethods';
import { buildPlayerState } from './playerStateInit';

export function createAlphaTabPlayer(
  container: HTMLElement,
  options: AlphaTabPlayerOptions = {},
  apiFactory: AlphaTabApiFactory = defaultApiFactory,
): AlphaTabPlayer {
  const api = apiFactory(container, buildSettings(options.settings));
  const s: PlayerState = buildPlayerState(api, container, options);

  const rect = container.getBoundingClientRect();
  devLog('AlphaTab init', {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
  subscribeAlphaTabEvents(s);

  // AlphaTab uses lazy loading by default: renderFinished and
  // postRenderFinished fire when only empty placeholder divs exist.
  // partialRenderFinished fires per partial AFTER beginUpdateRenderResults
  // sets placeholder.innerHTML, which is the only point at which the
  // <text> elements actually live in the DOM for us to walk.
  const apiAny = api as unknown as {
    renderer?: {
      partialRenderFinished?: { on?: (cb: () => void) => void };
    };
  };
  apiAny.renderer?.partialRenderFinished?.on?.(() => {
    applyAlphaTabTextLineSpacing(container);
    applyAlphaTabTempoShift(container);
  });

  const player: AlphaTabPlayer = {
    loadBase64(base64) {
      const bytes = base64ToUint8Array(base64);
      prepareForScoreLoad(s, 'base64', bytes.length);
      try {
        api.load(bytes);
      } catch (error) {
        s.isScoreLoading = false;
        s.options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    loadBytes(bytes) {
      prepareForScoreLoad(s, 'bytes', bytes.length);
      try {
        api.load(bytes);
      } catch (error) {
        s.isScoreLoading = false;
        s.options.onError?.(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    getVibratoDebugInfo() {
      return getVibratoDebugInfo(s);
    },
    getVibratoWindowsDebug() {
      const trackIndex = s.activeTrackIndex ?? null;
      const windows =
        trackIndex !== null ? (s.lastVibratoWindows.get(trackIndex) ?? []) : [];
      const sorted = [...windows].sort((a, b) => a.startMs - b.startMs);
      const nearby = sorted
        .filter(
          (w) =>
            w.endMs >= s.playheadMs - 5000 && w.startMs <= s.playheadMs + 5000,
        )
        .slice(0, 60);
      return {
        trackIndex,
        playheadMs: s.playheadMs,
        totalWindows: windows.length,
        midiTickShift: s.midiTickShift,
        tempoMapHead: s.tempoMap.slice(0, 4),
        nearby,
      };
    },
    getPitchBendDebugInfo() {
      return s.lastPitchBendDebug;
    },
    play() {
      playerPlay(s);
    },
    pause() {
      playerPause(s);
    },
    stop() {
      playerStop(s);
    },
    seekToStart(opts) {
      playerSeekToStart(s, opts, () => player.refreshLayout());
    },
    getCurrentCursorRect() {
      return getCurrentCursorRectInternal(s);
    },
    getCurrentPositionMs() {
      return s.playheadMs;
    },
    getCurrentAudioTickPosition() {
      return Math.max(
        0,
        Math.round(msToTick(s.playheadMs, s.midiDivision, s.tempoMap)),
      );
    },
    tickToMs(tick) {
      if (!Number.isFinite(tick)) {
        return null;
      }
      return tickToMs(
        Math.max(0, Math.round(tick)),
        s.midiDivision,
        s.tempoMap,
      );
    },
    getCursorRect() {
      return getCurrentCursorRectInternal(s);
    },
    waitForNextCursorRect(opts) {
      const timeoutMs = opts?.timeoutMs ?? 200;
      const requireDifferent = opts?.requireDifferentFromLast ?? false;
      const lastSignature = requireDifferent ? s.lastCursorSignature : null;
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          const idx = s.cursorWaiters.findIndex(
            (w) => w.timeoutId === timeoutId,
          );
          if (idx >= 0) {
            s.cursorWaiters.splice(idx, 1);
          }
          resolve(null);
        }, timeoutMs);
        s.cursorWaiters.push({
          resolve,
          timeoutId,
          lastSignature,
          requireDifferent,
        });
      });
    },
    waitForRenderFinished(opts) {
      const timeoutMs = opts?.timeoutMs ?? 500;
      const lookup =
        (api.renderer?.boundsLookup as { isFinished?: boolean } | null) ?? null;
      if (lookup?.isFinished) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        }, timeoutMs);
        api.renderFinished?.on?.(() => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          resolve();
        });
      });
    },
    refreshLayout() {
      const score = s.cachedScore ?? api.score ?? null;
      if (api.renderScore && score) {
        try {
          api.renderScore(score);
        } catch {
          /* ignore */
        }
        return;
      }
      if (api.updateSettings && api.settings) {
        api.updateSettings(api.settings);
      }
    },
    refreshBeatCache() {
      playerRefreshBeatCache(s);
    },
    getBeatRectsByStartMs() {
      return s.beatRectsByStartMs;
    },
    getBeatNotesByStartMs() {
      return s.beatNotesByStartMs;
    },
    snapToNearestBeat(contentX, contentY) {
      return playerSnapToNearestBeat(
        s,
        contentX,
        contentY,
        (x, y) => player.getBeatAtPosition(x, y),
        () => player.refreshBeatCache(),
        (x, y) => player.hitTestToCursorRect(x, y),
      );
    },
    hitTestToCursorRect(contentX, contentY) {
      return playerHitTestToCursorRect(s, contentX, contentY);
    },
    setTempoPercent(tempoPercent) {
      playerSetTempoPercent(s, tempoPercent);
    },
    setTuning(value, opts) {
      playerSetTuning(s, value, opts);
    },
    setMetronomeEnabled(enabled) {
      playerSetMetronomeEnabled(s, enabled);
    },
    setCountInEnabled(enabled) {
      playerSetCountInEnabled(s, enabled);
    },
    setMetronomeVolume(volume) {
      playerSetMetronomeVolume(s, volume);
    },
    setCountInVolume(volume) {
      playerSetCountInVolume(s, volume);
    },
    setLooping(isLooping) {
      playerSetLooping(s, isLooping);
    },
    hasLoopRange() {
      return s.loopRangeMs !== null;
    },
    getBeatAtPosition(x, y) {
      return getBeatAtPosition(s, x, y);
    },
    getBeatStartTick(beat) {
      return resolveBeatStartTick(s, beat);
    },
    getFirstNoteTick() {
      return getFirstNoteTick(s);
    },
    getFirstTrackWithNotesIndex() {
      return getFirstTrackWithNotesIndex(s);
    },
    setCursorTick(tick) {
      playerSetCursorTick(s, tick);
    },
    getBarStartTick(barIndex) {
      return getBarStartTick(s, barIndex);
    },
    getBarRangeTicks(barIndex) {
      return getBarRangeTicks(s, barIndex);
    },
    getBarCount() {
      return (
        (
          (s.cachedScore ?? api.score ?? null)?.masterBars as
            | unknown[]
            | undefined
        )?.length ?? 0
      );
    },
    getBarTimeSignature(barIndex) {
      return getBarTimeSignature(s, barIndex);
    },
    getBeatDurationTicksAtTick(tick) {
      return getBeatDurationTicksAtTick(s, tick);
    },
    getCurrentTickPosition() {
      return readCurrentTickPosition(s);
    },
    getCurrentBeatInfo() {
      return getCurrentBeatInfoInternal(s);
    },
    getTempoAtTick(tick) {
      if (!Number.isFinite(tick)) {
        return null;
      }
      if (s.tempoMap.length === 0) {
        return 120;
      }
      let point = s.tempoMap[0];
      for (const c of s.tempoMap) {
        if (c.tick <= tick) {
          point = c;
        } else {
          break;
        }
      }
      return Math.round((60_000_000 / point.usPerQuarter) * s.tempoFactor);
    },
    hasTempoChanges() {
      return hasMeaningfulTempoChanges(s.tempoMap);
    },
    hasUnsupportedBackingTrack() {
      return s.hasUnsupportedBackingTrack;
    },
    getTimeSignatureAtTick(tick) {
      return resolveTimeSignatureAtTick(s, tick);
    },
    getBarStartTickAtTick(tick) {
      return getBarStartTickAtTick(s, tick);
    },
    getTickDivision() {
      return s.midiDivision ?? null;
    },
    getTransportState() {
      return s.transportState;
    },
    getBarIndexFromBeat(beat) {
      return resolveBarIndexFromBeat(beat);
    },
    getBarIndexAtPosition(x, y) {
      return getBarIndexAtPosition(s, x, y);
    },
    getBarBoundsByIndex(index) {
      return getBarBoundsByIndex(s, index);
    },
    setPlaybackRangeFromBeats(startBeat, endBeat) {
      return setPlaybackRangeFromBeats(s, startBeat, endBeat);
    },
    setPlaybackRangeFromBarIndex(startIndex, endIndex) {
      return setPlaybackRangeFromBarIndex(s, startIndex, endIndex);
    },
    getPlaybackRangeTicks() {
      return s.loopRangeTicks;
    },
    highlightPlaybackRange(startBeat, endBeat) {
      playerHighlightPlaybackRange(s, startBeat, endBeat);
    },
    applyPlaybackRangeFromHighlight() {
      playerApplyPlaybackRangeFromHighlight(s);
    },
    clearPlaybackRangeHighlight() {
      playerClearPlaybackRangeHighlight(s);
    },
    clearPlaybackRange() {
      playerClearPlaybackRange(s);
    },
    setBpm(bpm, baseBpm) {
      playerSetBpm(s, bpm, baseBpm);
    },
    setVolume(volume) {
      playerSetVolume(s, volume);
    },
    setTrackMute(trackIndex, muted) {
      playerSetTrackMute(s, trackIndex, muted);
    },
    setTrackSolo(trackIndex, soloed) {
      playerSetTrackSolo(s, trackIndex, soloed);
    },
    setTrackVolume(trackIndex, volume) {
      playerSetTrackVolume(s, trackIndex, volume);
    },
    async seekToMs(ms) {
      await playerSeekToMs(s, ms);
    },
    async seekToTick(tick) {
      await playerSeekToTick(s, tick);
    },
    async seekAndPlay(tick) {
      await playerSeekAndPlay(s, tick);
    },
    supportsTrackMute: s.supportsTrackMute,
    supportsTrackSolo: s.supportsTrackSolo,
    supportsTrackVolume: s.supportsTrackVolume,
    setVisibleTracks(indexes) {
      playerSetVisibleTracks(s, indexes);
    },
    setActiveTrack(index) {
      playerSetActiveTrack(s, index);
    },
    setShowStandardNotation(enabled) {
      playerSetShowStandardNotation(s, enabled);
    },
    setTabRhythm(enabled) {
      if (!api.settings || !api.updateSettings) {
        return;
      }
      api.settings.notation.rhythmMode = enabled
        ? TabRhythmMode.ShowWithBars
        : TabRhythmMode.Hidden;
      api.updateSettings(api.settings);
    },
    /**
     * Switch between the default Page layout and the Horizontal
     * (one-liner) teleprompter layout. Horizontal bumps the render
     * scale so the single-row view uses the vertical real estate
     * for legibility. Triggers a re-render — the caller is
     * expected to invalidate any beat-rect cache afterwards (the
     * player state's renderFinished handler rebuilds it).
     */
    setLayoutMode(horizontal) {
      if (!api.settings || !api.updateSettings || !api.render) {
        return;
      }
      api.settings.display.layoutMode = horizontal
        ? LayoutMode.Horizontal
        : LayoutMode.Page;
      api.settings.display.scale = horizontal
        ? HORIZONTAL_LAYOUT_SCALE
        : PAGE_LAYOUT_SCALE;
      // Force eager rendering on the running session too. AlphaTab's
      // default lazy-load ships only the on-screen SVG sub-chunks,
      // which in horizontal mode drops the tail of the tab — the
      // "last bars cut off" symptom. Disabling it here guarantees
      // the switch takes effect without a full app restart.
      if (api.settings.core) {
        (
          api.settings.core as { enableLazyLoading?: boolean }
        ).enableLazyLoading = false;
      }
      api.updateSettings(api.settings);
      api.render();
    },
    getCurrentScoreContext() {
      const score = s.cachedScore ?? api.score ?? null;
      if (!score) {
        return null;
      }
      return {
        score,
        settings: (api.settings as Settings | undefined) ?? null,
      };
    },
    dispose() {
      s.playing = false;
      stopRaf(s);
      api.destroy();
    },
    ...(import.meta.env.MODE === 'test'
      ? {
          __setTestDurationMs(ms: number) {
            s.durationMs = Math.max(0, ms);
          },
          __setTestPlayheadMs(ms: number) {
            applyPlayheadMs(s, ms, false);
            s.lastAudioSyncMs = ms;
            s.lastAudioSyncAt = performance.now();
          },
          __setTestTransportState(
            state: 'stopped' | 'playing' | 'paused' | 'ended',
          ) {
            s.transportState = state;
            s.playing = state === 'playing';
          },
          __setTestAudioReady(ready: boolean) {
            s.audioReady = ready;
            if (ready) {
              s.audioReadyPromise = null;
            }
          },
          __setTestAudioReadyPromise(promise: Promise<void>) {
            s.audioReady = false;
            s.audioReadyPromise = promise;
          },
          __setTestMidiTickShift(shift: number) {
            s.midiTickShift = Math.round(shift);
          },
          __setTestTempoFactor(factor: number) {
            s.tempoFactor = factor;
          },
          __setTestLoopEnabled(enabled: boolean) {
            s.loopEnabled = enabled;
          },
          __setTestPlaying(playing: boolean) {
            s.playing = playing;
            s.transportState = playing ? 'playing' : 'stopped';
          },
          __getTestSyncInFlight() {
            return s.syncInFlight;
          },
          __getTestLoopGeneration() {
            return s.loopGeneration;
          },
          __getTestPlayheadMs() {
            return s.playheadMs;
          },
        }
      : {}),
  };

  return player;
}
