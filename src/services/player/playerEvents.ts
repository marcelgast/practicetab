import { midi } from '@coderline/alphatab';
import type {
  AlphaTabScore,
  AlphaTabTrack,
  AlphaTabEventEmitter,
} from './types';
import type { PlayerState } from './playerState';
import { safeTrackIndex, safeTrackName } from './playerState';
import { devLog, emitCursorRect } from './playerHelpers';
import { applyStaffVisibility, rebuildMidi } from './playerScoreLoad';
import { playerRefreshBeatCache } from './playerUiMethods';

export function subscribeAlphaTabEvents(s: PlayerState): void {
  const { api, options } = s;

  // Cursor position events
  const anyApi = api as unknown as {
    player?: {
      positionChanged?: AlphaTabEventEmitter<unknown>;
      playbackPositionChanged?: AlphaTabEventEmitter<unknown>;
    };
    playbackPositionChanged?: AlphaTabEventEmitter<unknown>;
    cursorChanged?: AlphaTabEventEmitter<unknown>;
    scoreRenderer?: { cursorChanged?: AlphaTabEventEmitter<unknown> };
  };
  [
    anyApi.player?.positionChanged,
    anyApi.player?.playbackPositionChanged,
    anyApi.playbackPositionChanged,
    anyApi.cursorChanged,
    anyApi.scoreRenderer?.cursorChanged,
  ].forEach((emitter) => {
    emitter?.on?.(() => emitCursorRect(s));
  });

  // Score loaded
  if (options.onReady && api.scoreLoaded?.on) {
    api.scoreLoaded.on((score) => {
      s.isScoreLoading = false;
      s.cachedScore = (score as AlphaTabScore) ?? null;
      s.hasUnsupportedBackingTrack = Boolean(s.cachedScore?.backingTrack);
      s.scoreTempoApplied = false;
      const tracks = (
        s.cachedScore?.tracks ??
        (Array.isArray(api.tracks) ? api.tracks : []) ??
        []
      ).filter(Boolean) as AlphaTabTrack[];
      s.cachedTracks = tracks;
      const validIndexes = new Set<number>(
        tracks.map((track, idx) => safeTrackIndex(track, idx)),
      );
      const requestedActiveTrack =
        s.pendingActiveTrackIndex !== undefined
          ? s.pendingActiveTrackIndex
          : s.activeTrackIndex;
      s.pendingActiveTrackIndex = undefined;
      s.activeTrackIndex =
        requestedActiveTrack !== null &&
        requestedActiveTrack !== undefined &&
        validIndexes.has(requestedActiveTrack)
          ? requestedActiveTrack
          : null;
      s.selectedRenderTrackIndexes =
        s.activeTrackIndex === null ? null : [s.activeTrackIndex];
      options.onReady?.();
      const tempo = s.cachedScore?.tempo;
      if (typeof tempo === 'number' && Number.isFinite(tempo)) {
        options.onScoreLoaded?.(tempo);
        s.scoreTempoApplied = true;
      }
      if (options.onTracksChanged) {
        options.onTracksChanged(tracks);
      }
      rebuildMidi(s, s.cachedScore ?? score);
      const trackSummaries = tracks.map((track, idx) => ({
        index: safeTrackIndex(track, idx),
        name: safeTrackName(track, `Track ${idx + 1}`),
      }));
      devLog('AlphaTab score loaded', {
        trackCount: tracks.length,
        tracks: trackSummaries,
        activeTrackIndex: s.activeTrackIndex,
        wasLoading: true,
      });
      applyStaffVisibility(s, s.standardNotationEnabled);
      emitCursorRect(s);
    });
  }

  // SoundFont load failed
  if (options.onSoundFontError && api.soundFontLoadFailed?.on) {
    api.soundFontLoadFailed.on((error) => {
      const message = error instanceof Error ? error.message : String(error);
      options.onSoundFontError?.(message);
    });
  }

  // Error
  if (options.onError && api.error?.on) {
    api.error.on((error) => {
      s.isScoreLoading = false;
      const message = error instanceof Error ? error.message : String(error);
      const percussionOnly =
        s.cachedTracks.length > 0 &&
        s.cachedTracks.every((track) => {
          try {
            return (track as { isPercussion?: unknown }).isPercussion === true;
          } catch {
            return false;
          }
        });
      const isKnownPercussionRenderError =
        percussionOnly && message.includes('group.staves');
      if (isKnownPercussionRenderError) {
        const now = Date.now();
        if (now - s.lastSuppressedAlphaTabErrorAt > 750) {
          devLog('alphatab_error_event_suppressed', {
            message,
            percussionOnly,
          });
          s.lastSuppressedAlphaTabErrorAt = now;
        }
        return;
      }
      devLog('alphatab_error_event', {
        message,
        stack: error instanceof Error ? (error.stack ?? null) : null,
      });
      options.onError?.(message);
    });
  }

  // Playback range highlight
  if (options.onPlaybackRangeHighlightChanged) {
    api.playbackRangeHighlightChanged?.on((event) => {
      const blocks = (
        event as {
          highlightBlocks?: Array<{
            x: number;
            y: number;
            w: number;
            h: number;
          }>;
        }
      ).highlightBlocks;
      options.onPlaybackRangeHighlightChanged?.(blocks ?? []);
    });
  }

  // Beat mouse events
  if (options.onBeatMouseDown) {
    api.beatMouseDown?.on((beat) => {
      options.onBeatMouseDown?.(beat);
    });
  }
  if (options.onBeatMouseMove) {
    api.beatMouseMove?.on((beat) => {
      options.onBeatMouseMove?.(beat);
    });
  }
  if (options.onBeatMouseUp) {
    api.beatMouseUp?.on((beat) => {
      options.onBeatMouseUp?.(beat);
    });
  }

  // Metronome MIDI events
  if (options.onMetronomeMidiEvent) {
    const metronomeEventType = (
      midi as unknown as { MidiEventType?: { AlphaTabMetronome?: number } }
    ).MidiEventType?.AlphaTabMetronome;
    api.midiEventsPlayed?.on((payload) => {
      const toEventArray = (value: unknown): unknown[] => {
        if (!value) {
          return [];
        }
        if (Array.isArray(value)) {
          return value;
        }
        if (
          typeof value === 'object' &&
          Symbol.iterator in (value as Record<string, unknown>)
        ) {
          try {
            return Array.from(value as Iterable<unknown>);
          } catch {
            /* fallthrough */
          }
        }
        const maybeForEach = (
          value as { forEach?: (fn: (v: unknown) => void) => void }
        ).forEach;
        if (typeof maybeForEach === 'function') {
          const collected: unknown[] = [];
          maybeForEach((entry) => collected.push(entry));
          return collected;
        }
        return [value];
      };
      const payloadEvents = (payload as { events?: unknown } | null)?.events;
      const directEvents = payloadEvents
        ? toEventArray(payloadEvents)
        : toEventArray(payload);
      const events = directEvents as Array<{
        tick?: number;
        isMetronome?: boolean;
        type?: number;
        metronomeNumerator?: number;
        metronomeDurationInMilliseconds?: number;
      }>;
      events.forEach((event) => {
        const eventType = (event as { type?: unknown })?.type;
        const hasMetronomeFields =
          typeof event?.metronomeNumerator === 'number' &&
          typeof event?.metronomeDurationInMilliseconds === 'number' &&
          Number.isFinite(event.metronomeDurationInMilliseconds) &&
          event.metronomeDurationInMilliseconds > 0;
        const isTypedMetronomeEvent =
          typeof metronomeEventType === 'number' &&
          typeof eventType === 'number' &&
          eventType === metronomeEventType;
        const shouldUseFieldFallback =
          hasMetronomeFields &&
          (typeof metronomeEventType !== 'number' ||
            typeof eventType !== 'number');
        const isMetronomeEvent =
          event?.isMetronome === true ||
          isTypedMetronomeEvent ||
          shouldUseFieldFallback;
        if (!isMetronomeEvent) {
          return;
        }
        const beatIndex = Math.max(
          0,
          Math.round(event.metronomeNumerator ?? 0),
        );
        const beatDurationMs = Math.max(
          1,
          Number.isFinite(event.metronomeDurationInMilliseconds ?? NaN)
            ? (event.metronomeDurationInMilliseconds as number)
            : 1,
        );
        const tick =
          typeof event.tick === 'number' && Number.isFinite(event.tick)
            ? event.tick
            : null;
        options.onMetronomeMidiEvent?.({ tick, beatIndex, beatDurationMs });
      });
    });
  }

  // Player state changed
  if (options.onPlayerStateChanged) {
    api.playerStateChanged?.on((payload) => {
      const next = {
        state:
          typeof payload?.state === 'number' && Number.isFinite(payload.state)
            ? payload.state
            : null,
        stopped: Boolean(payload?.stopped),
      };
      options.onPlayerStateChanged?.(next);
    });
  }

  // Render finished → rebuild the overlay beat-rect cache (PR 3.6+).
  // `playerRefreshBeatCache` emits `onBeatCacheRefreshed` internally after
  // populating `state.beatRectsByStartMs`.
  //
  // We hook BOTH events: `renderFinished` fires after layout is complete
  // but boundsLookup may not yet cover every partial on some scores;
  // `postRenderFinished` fires after all `renderFinished` handlers run
  // and reliably sees the full bounds index. Firing twice is cheap
  // (map rebuild is O(beats)) and guarantees coverage to the last note
  // even when the first pass missed late partials.
  const apiAny = api as unknown as {
    postRenderFinished?: { on?: (cb: () => void) => void };
  };
  api.renderFinished?.on?.(() => {
    playerRefreshBeatCache(s);
  });
  apiAny.postRenderFinished?.on?.(() => {
    playerRefreshBeatCache(s);
  });
}
