import { isValidCursorRect } from '../../domain/playhead';
import { getAudioPositionMs, seekTab } from '../audioTabCommands';
import { appendDevLog } from '../devLog';
import type { AlphaTabTrack } from './types';
import {
  CURSOR_EMIT_MIN_INTERVAL_MS,
  VIB_DEPTH_CENTS_DEFAULT,
  VIB_DEPTH_CENTS_WIDE,
  VIB_RATE_HZ_DEFAULT,
  VIB_RATE_HZ_WIDE,
  DEFAULT_CLICK_VOLUME,
} from './types';
import type { VibratoKind } from './types';
import { msToTick } from './tempoMap';
import { resolveTimeSignatureFromSource } from './utils';
import type { PlayerState } from './playerState';

export const devLog = (message: string, details?: Record<string, unknown>) => {
  if (!import.meta.env.DEV) {
    return;
  }
  appendDevLog(
    JSON.stringify({
      source: 'src/services/alphatabPlayer.ts',
      fn: 'createAlphaTabPlayer',
      message,
      details: details ?? {},
      ts: Date.now(),
    }),
  );
};
export const transportLog = (
  _message: string,
  _details?: Record<string, unknown>,
) => {
  void _message;
  void _details;
};
export const transportDebug = (
  _message: string,
  _details?: Record<string, unknown>,
) => {
  void _message;
  void _details;
};

export function getCurrentCursorRectInternal(
  s: PlayerState,
): { left: number; top: number; height: number } | null {
  const cursor = s.container.querySelector(
    '.at-cursor-beat',
  ) as HTMLElement | null;
  if (!cursor) {
    return null;
  }
  const raw = cursor.getBoundingClientRect();
  const containerRect = s.container.getBoundingClientRect();
  return {
    left: raw.left - containerRect.left,
    top: raw.top - containerRect.top,
    height: raw.height,
  };
}

export function emitCursorRect(s: PlayerState): void {
  const rect = getCurrentCursorRectInternal(s);
  if (!isValidCursorRect(rect)) {
    return;
  }
  const now = performance.now();
  const signature = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.height)}`;
  const hasWaiters = s.cursorWaiters.length > 0;
  if (!hasWaiters && now - s.lastCursorEmit < CURSOR_EMIT_MIN_INTERVAL_MS) {
    return;
  }
  s.lastCursorEmit = now;
  if (hasWaiters) {
    const waiters = s.cursorWaiters.splice(0, s.cursorWaiters.length);
    waiters.forEach((waiter) => {
      const shouldResolve =
        !waiter.requireDifferent || waiter.lastSignature !== signature;
      if (!shouldResolve) {
        s.cursorWaiters.push(waiter);
        return;
      }
      clearTimeout(waiter.timeoutId);
      waiter.resolve(rect);
    });
  }
  s.lastCursorSignature = signature;
  s.options.onCursorRectChanged?.(rect);
}

export function readCurrentBeat(s: PlayerState): unknown | null {
  const playerAny = s.api.player as
    | { _currentBeat?: unknown; currentBeat?: unknown }
    | undefined;
  if (!playerAny) {
    return null;
  }
  if (playerAny._currentBeat) {
    return playerAny._currentBeat;
  }
  try {
    return playerAny.currentBeat ?? null;
  } catch {
    return null;
  }
}

export function hasPlayerBeat(s: PlayerState): boolean {
  try {
    const beat = readCurrentBeat(s);
    const start = (beat as { start?: number } | null | undefined)?.start;
    return Number.isFinite(start);
  } catch {
    return false;
  }
}

/**
 * Apply a playhead position in score-time ms (the audio engine reports
 * position_samples scaled by tempo_factor, so its ms value is already
 * in score-time — no extra conversion needed).
 */
export function applyPlayheadMs(
  s: PlayerState,
  nextMs: number,
  seekAudio: boolean,
): void {
  const clamped = Math.max(0, Math.min(s.durationMs || nextMs, nextMs));
  s.playheadMs = clamped;
  const canUpdatePlayerTick = s.api.player ? hasPlayerBeat(s) : true;
  const shouldSkip = s.api.player && !canUpdatePlayerTick && clamped <= 0;
  if (shouldSkip) {
    if (seekAudio) {
      void seekTab(clamped);
    }
    return;
  }
  if (
    s.api.player &&
    typeof s.api.player.tickPosition === 'number' &&
    canUpdatePlayerTick
  ) {
    try {
      s.api.player.tickPosition =
        msToTick(clamped, s.midiDivision, s.tempoMap) + s.midiTickShift;
    } catch {
      // AlphaTab can throw if no current beat is available yet.
    }
  }
  try {
    (s.api as { timePosition?: number }).timePosition = clamped;
  } catch {
    // Ignore transient AlphaTab cursor errors.
  }
  const output = (
    s.api.player as { output?: { updatePosition?: (ms: number) => void } }
  )?.output;
  try {
    output?.updatePosition?.(clamped);
  } catch {
    // Ignore transient cursor errors.
  }
  if (seekAudio) {
    void seekTab(clamped);
  }
}

export function stopRaf(s: PlayerState): void {
  if (s.rafId !== null) {
    cancelAnimationFrame(s.rafId);
    s.rafId = null;
  }
}

/**
 * Main transport loop — polls audio engine position each frame
 * and feeds it to AlphaTab for cursor rendering.
 * No prediction or smoothing: the audio engine is the single source of truth.
 */
export function tickTransport(s: PlayerState): void {
  if (!s.playing) {
    stopRaf(s);
    return;
  }

  // Poll audio engine position (non-blocking: use last known value while async pending)
  if (!s.syncInFlight) {
    // Capture the loop generation so stale polls from before a loop restart
    // don't overwrite the reset position.
    const gen = s.loopGeneration;
    s.syncInFlight = getAudioPositionMs()
      .then((positionMs) => {
        if (gen !== s.loopGeneration) {
          return; // Stale poll from before loop restart — discard
        }
        if (typeof positionMs !== 'number' || !Number.isFinite(positionMs)) {
          return;
        }
        const audioMs = Math.max(0, positionMs);
        s.lastAudioSyncMs = audioMs;
        s.lastAudioSyncAt = performance.now();
        applyPlayheadMs(s, audioMs, false);
      })
      .finally(() => {
        s.syncInFlight = null;
      });
  }

  emitCursorRect(s);

  // End-of-track / full-track loop check
  if (s.durationMs > 0 && s.playheadMs >= s.durationMs) {
    if (s.loopEnabled && !s.loopRangeMs) {
      s.loopGeneration = (s.loopGeneration ?? 0) + 1;
      s.syncInFlight = null; // Discard in-flight poll
      applyPlayheadMs(s, 0, true);
      s.lastAudioSyncMs = 0;
      s.lastAudioSyncAt = performance.now();
      s.rafId = requestAnimationFrame(() => tickTransport(s));
      return;
    }
    s.playing = false;
    s.transportState = 'ended';
    stopRaf(s);
    return;
  }

  s.rafId = requestAnimationFrame(() => tickTransport(s));
}

export function startTransport(s: PlayerState): void {
  if (s.playing) {
    return;
  }
  s.playing = true;
  s.transportState = 'playing';
  s.lastAudioSyncMs = s.playheadMs;
  s.lastAudioSyncAt = performance.now();
  stopRaf(s);
  s.rafId = requestAnimationFrame(() => tickTransport(s));
}

export function clampTuning(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-12, Math.min(12, Math.round(value)));
}

export function setClickVolume(
  s: PlayerState,
  kind: 'metronome' | 'countIn',
  enabled: boolean,
  value?: number,
): void {
  const fallbackVolume = enabled ? DEFAULT_CLICK_VOLUME : 0;
  const vol =
    typeof value === 'number'
      ? Math.max(0, Math.min(1, value))
      : fallbackVolume;
  const playerAny = s.api.player as Record<string, unknown> | undefined;
  if (playerAny) {
    if (kind === 'metronome') {
      playerAny.metronomeVolume = vol;
    } else {
      playerAny.countInVolume = vol;
    }
  }
  if (s.api.settings && s.api.updateSettings) {
    const settingsPlayer = (
      s.api.settings as unknown as {
        player?: Record<string, unknown>;
      }
    ).player;
    if (settingsPlayer) {
      if (kind === 'metronome') {
        settingsPlayer.metronomeVolume = vol;
      } else {
        settingsPlayer.countInVolume = vol;
      }
      s.api.updateSettings(s.api.settings);
    }
  }
}

export function getVibratoDebugInfo(s: PlayerState): {
  active: boolean;
  depthCents: number;
  rateHz: number;
} {
  let activeType: VibratoKind | null = null;
  for (const windows of s.lastVibratoWindows.values()) {
    const match = windows.find(
      (w) => s.playheadMs >= w.startMs && s.playheadMs <= w.endMs,
    );
    if (match) {
      activeType = match.vibrato;
      break;
    }
  }
  if (activeType === 'wide') {
    return {
      active: true,
      depthCents: VIB_DEPTH_CENTS_WIDE,
      rateHz: VIB_RATE_HZ_WIDE,
    };
  }
  if (activeType === 'slight') {
    return {
      active: true,
      depthCents: VIB_DEPTH_CENTS_DEFAULT,
      rateHz: VIB_RATE_HZ_DEFAULT,
    };
  }
  return {
    active: false,
    depthCents: VIB_DEPTH_CENTS_DEFAULT,
    rateHz: VIB_RATE_HZ_DEFAULT,
  };
}

export function readCurrentTickPosition(s: PlayerState): number | null {
  const fromPlayhead = msToTick(s.playheadMs, s.midiDivision, s.tempoMap);
  if (Number.isFinite(fromPlayhead)) {
    return Math.max(0, Math.round(fromPlayhead));
  }
  const fromApi = (s.api as { tickPosition?: unknown }).tickPosition;
  if (typeof fromApi === 'number' && Number.isFinite(fromApi)) {
    return Math.max(0, Math.round(fromApi - s.midiTickShift));
  }
  const fromPlayer = (s.api as { player?: { tickPosition?: unknown } }).player
    ?.tickPosition;
  if (typeof fromPlayer === 'number' && Number.isFinite(fromPlayer)) {
    return Math.max(0, Math.round(fromPlayer - s.midiTickShift));
  }
  return null;
}

export function findTrackByIndex(
  s: PlayerState,
  index: number,
): AlphaTabTrack | null {
  const fromCache = s.cachedTracks.find((track) => {
    const trackIndex = Number.isFinite(track.index) ? track.index : null;
    return trackIndex === index;
  });
  if (fromCache) {
    return fromCache;
  }
  const apiTracks = Array.isArray(s.api.tracks) ? s.api.tracks : [];
  return (
    apiTracks.find((track) => {
      const trackIndex = Number.isFinite(track.index) ? track.index : null;
      return trackIndex === index;
    }) ?? null
  );
}

export function normalizeBeatCacheTick(
  s: PlayerState,
  rawTick: number,
  beat?: unknown,
): number {
  if (s.midiTickShift === 0) {
    return Math.max(0, Math.round(rawTick));
  }
  if (s.tickCacheBeatTicksAreShifted === null && beat) {
    const absStart = (
      beat as { absolutePlaybackStart?: number } | null | undefined
    )?.absolutePlaybackStart;
    if (typeof absStart === 'number' && Number.isFinite(absStart)) {
      const shiftedStart = absStart - s.midiTickShift;
      const tolerance = Math.max(2, Math.round(s.midiDivision / 4));
      if (Math.abs(rawTick - shiftedStart) <= tolerance) {
        s.tickCacheBeatTicksAreShifted = true;
      } else if (Math.abs(rawTick - absStart) <= tolerance) {
        s.tickCacheBeatTicksAreShifted = false;
      }
    }
  }
  const normalized = s.tickCacheBeatTicksAreShifted
    ? rawTick
    : rawTick - s.midiTickShift;
  return Math.max(0, Math.round(normalized));
}

export function normalizeBarCacheTick(
  s: PlayerState,
  rawTick: number,
  masterBar?: unknown,
): number {
  if (s.midiTickShift === 0) {
    return Math.max(0, Math.round(rawTick));
  }
  if (
    s.tickCacheBarTicksAreShifted === null &&
    s.tickCacheBeatTicksAreShifted !== null
  ) {
    s.tickCacheBarTicksAreShifted = s.tickCacheBeatTicksAreShifted;
  }
  if (s.tickCacheBarTicksAreShifted === null && masterBar) {
    const barAny = masterBar as
      | { start?: number; startTick?: number; tick?: number }
      | undefined;
    const absoluteStart = barAny?.start ?? barAny?.startTick ?? barAny?.tick;
    if (typeof absoluteStart === 'number' && Number.isFinite(absoluteStart)) {
      const shiftedStart = absoluteStart - s.midiTickShift;
      const tolerance = Math.max(2, Math.round(s.midiDivision / 4));
      if (Math.abs(rawTick - shiftedStart) <= tolerance) {
        s.tickCacheBarTicksAreShifted = true;
      } else if (Math.abs(rawTick - absoluteStart) <= tolerance) {
        s.tickCacheBarTicksAreShifted = false;
      }
    }
  }
  const normalized = s.tickCacheBarTicksAreShifted
    ? rawTick
    : rawTick - s.midiTickShift;
  return Math.max(0, Math.round(normalized));
}

export function resolveMasterBarBounds(
  s: PlayerState,
  masterBar: unknown,
  nextMasterBar?: unknown,
): { start: number; end: number | null } | null {
  const tickCache =
    (
      s.api as {
        tickCache?: {
          getMasterBar?: (bar: unknown) => { start: number; end: number };
        };
      }
    ).tickCache ?? null;
  const lookup = tickCache?.getMasterBar?.(masterBar) ?? null;
  if (
    lookup &&
    Number.isFinite(lookup.start) &&
    Number.isFinite(lookup.end) &&
    lookup.end > lookup.start
  ) {
    return {
      start: normalizeBarCacheTick(s, lookup.start, masterBar),
      end: normalizeBarCacheTick(s, lookup.end, masterBar),
    };
  }
  const readStart = (bar: unknown): number | null => {
    const barAny = bar as
      | { start?: number; startTick?: number; tick?: number }
      | undefined;
    if (!barAny) {
      return null;
    }
    const raw = barAny.start ?? barAny.startTick ?? barAny.tick;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return null;
    }
    return Math.max(0, Math.round(raw - s.midiTickShift));
  };
  const start = readStart(masterBar);
  if (start === null) {
    return null;
  }
  const nextStart = nextMasterBar ? readStart(nextMasterBar) : null;
  if (typeof nextStart === 'number' && nextStart > start) {
    return { start, end: nextStart };
  }
  const signature = resolveTimeSignatureFromSource(masterBar) ?? {
    top: 4,
    bottom: 4,
  };
  const division = s.midiDivision > 0 ? s.midiDivision : 480;
  const beatTicks = Math.round((division * 4) / signature.bottom);
  const computedEnd = start + signature.top * beatTicks;
  return { start, end: computedEnd > start ? computedEnd : null };
}
