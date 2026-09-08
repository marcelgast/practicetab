import {
  getAudioPositionMs,
  pauseTab,
  seekAndPlay,
  seekTab,
  seekToTick,
  setTabTuning,
  setTempoFactor,
  stopTab,
} from '../audioTabCommands';
import {
  clampTempoFactorForOverride,
  clampTempoPercent,
  isTauriRuntime,
} from './utils';
import { songSetTuning } from '../songPlaybackService';
import { msToTick, tickToMs } from './tempoMap';
import type { PlayerState } from './playerState';
import {
  applyPlayheadMs,
  emitCursorRect,
  hasPlayerBeat,
  readCurrentTickPosition,
  setClickVolume,
  startTransport,
  stopRaf,
  clampTuning,
  findTrackByIndex,
} from './playerHelpers';

/**
 * Core play logic — restarts from loop start if at end, then seeks-and-plays.
 */
export function apiPlayTransport(s: PlayerState): void {
  if (
    s.transportState === 'ended' ||
    (s.durationMs > 0 && s.playheadMs >= s.durationMs - 1)
  ) {
    const restartMs =
      s.loopEnabled && s.loopRangeMs ? s.loopRangeMs.startMs : 0;
    applyPlayheadMs(s, restartMs, true);
    s.lastAudioSyncMs = restartMs;
    s.lastAudioSyncAt = performance.now();
    s.transportState = 'stopped';
  }
  startTransport(s);
  const tick = msToTick(s.playheadMs, s.midiDivision, s.tempoMap);
  const seekPromise = seekAndPlay(tick);
  s.pendingSeek = seekPromise;
  void seekPromise.finally(() => {
    if (s.pendingSeek === seekPromise) {
      s.pendingSeek = null;
    }
  });
  void getAudioPositionMs().then((positionMs) => {
    if (typeof positionMs !== 'number' || !Number.isFinite(positionMs)) {
      return;
    }
    s.lastAudioSyncMs = Math.max(0, positionMs);
    s.lastAudioSyncAt = performance.now();
  });
}

export function playerPlay(s: PlayerState): void {
  if (s.audioReadyPromise && !s.audioReady) {
    s.pendingPlayAfterReady = true;
    void s.audioReadyPromise.then(() => {
      if (!s.pendingPlayAfterReady) {
        return;
      }
      s.pendingPlayAfterReady = false;
      apiPlayTransport(s);
    });
    return;
  }
  s.pendingPlayAfterReady = false;
  apiPlayTransport(s);
}

export function playerPause(s: PlayerState): void {
  s.pendingPlayAfterReady = false;
  s.playing = false;
  s.transportState = 'paused';
  stopRaf(s);
  void pauseTab();
}

export function playerStop(s: PlayerState): void {
  s.pendingPlayAfterReady = false;
  s.playing = false;
  s.transportState = 'stopped';
  stopRaf(s);
  s.playheadMs = 0;
  if (!s.api.player || hasPlayerBeat(s)) {
    applyPlayheadMs(s, 0, true);
  }
  s.lastAudioSyncMs = 0;
  s.lastAudioSyncAt = performance.now();
  void stopTab();
}

export function playerSetCursorTick(s: PlayerState, tick: number): void {
  const clamped = Math.max(0, Math.round(tick));
  const ms = tickToMs(clamped, s.midiDivision, s.tempoMap);
  const { api } = s;
  const canUpdate = api.player ? hasPlayerBeat(s) : true;
  if (api.player && typeof api.player.tickPosition === 'number' && canUpdate) {
    try {
      api.player.tickPosition = clamped + s.midiTickShift;
    } catch {
      /* ignore */
    }
  }
  try {
    if (typeof api.tickPosition === 'number' && (canUpdate || !api.player)) {
      api.tickPosition = clamped + s.midiTickShift;
    }
  } catch {
    /* ignore */
  }
  applyPlayheadMs(s, ms, false);
  emitCursorRect(s);
}

export async function playerSeekToMs(
  s: PlayerState,
  ms: number,
): Promise<void> {
  applyPlayheadMs(s, ms, true);
  s.pendingSeek = seekTab(ms);
  await s.pendingSeek;
  s.pendingSeek = null;
}

export async function playerSeekToTick(
  s: PlayerState,
  tick: number,
): Promise<void> {
  const clamped = Math.max(0, Math.round(tick));
  const ms = tickToMs(clamped, s.midiDivision, s.tempoMap);
  applyPlayheadMs(s, ms, false);
  s.pendingSeek = seekToTick(clamped);
  await s.pendingSeek;
  s.pendingSeek = null;
}

export async function playerSeekAndPlay(
  s: PlayerState,
  tick: number,
): Promise<void> {
  const clamped = Math.max(0, Math.round(tick));
  const ms = tickToMs(clamped, s.midiDivision, s.tempoMap);
  applyPlayheadMs(s, ms, false);
  await seekAndPlay(clamped);
  if (s.playing) {
    s.lastAudioSyncMs = ms;
    s.lastAudioSyncAt = performance.now();
  }
}

export function playerSetTuning(
  s: PlayerState,
  value: number,
  opts?: { force?: boolean },
): void {
  const clamped = clampTuning(value);
  if (!opts?.force && s.tuningSemitones === clamped) {
    return;
  }
  s.tuningSemitones = clamped;
  void setTabTuning(clamped);
  void songSetTuning(clamped);
  if (!s.playing) {
    return;
  }
  const tick = readCurrentTickPosition(s) ?? 0;
  const seekPromise = seekAndPlay(tick);
  s.pendingSeek = seekPromise;
  void seekPromise.finally(() => {
    if (s.pendingSeek === seekPromise) {
      s.pendingSeek = null;
    }
  });
}

export function playerSetTempoPercent(
  s: PlayerState,
  tempoPercent: number,
): void {
  const clamped = clampTempoPercent(tempoPercent);
  s.tempoFactor = clamped / 100;
  if (!isTauriRuntime()) {
    s.api.playbackSpeed = s.tempoFactor;
  }
  // Invalidate sync so next transport frame fetches fresh audio position
  s.syncInFlight = null;
  void setTempoFactor(s.tempoFactor);
}

export function playerSetBpm(
  s: PlayerState,
  bpm: number,
  baseBpm: number,
): void {
  if (!Number.isFinite(baseBpm) || baseBpm <= 0) {
    return;
  }
  s.tempoFactor = clampTempoFactorForOverride(bpm / baseBpm);
  if (!isTauriRuntime()) {
    s.api.playbackSpeed = s.tempoFactor;
  }
  void setTempoFactor(s.tempoFactor);
}

export function playerSetMetronomeEnabled(
  s: PlayerState,
  enabled: boolean,
): void {
  setClickVolume(s, 'metronome', enabled);
}

export function playerSetCountInEnabled(
  s: PlayerState,
  enabled: boolean,
): void {
  setClickVolume(s, 'countIn', enabled);
}

export function playerSetMetronomeVolume(s: PlayerState, volume: number): void {
  setClickVolume(s, 'metronome', volume > 0, volume);
}

export function playerSetCountInVolume(s: PlayerState, volume: number): void {
  setClickVolume(s, 'countIn', volume > 0, volume);
}

export function playerSetVolume(s: PlayerState, volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  const { api } = s;
  if (typeof api.masterVolume === 'number' || 'masterVolume' in api) {
    api.masterVolume = clamped;
  }
  if (api.player && typeof api.player.masterVolume === 'number') {
    api.player.masterVolume = clamped;
  }
}

export function playerSetTrackMute(
  s: PlayerState,
  trackIndex: number,
  muted: boolean,
): void {
  if (!s.supportsTrackMute || !s.api.changeTrackMute) {
    return;
  }
  const track = findTrackByIndex(s, trackIndex);
  if (!track) {
    return;
  }
  s.api.changeTrackMute([track], muted);
}

export function playerSetTrackSolo(
  s: PlayerState,
  trackIndex: number,
  soloed: boolean,
): void {
  if (!s.supportsTrackSolo || !s.api.changeTrackSolo) {
    return;
  }
  const track = findTrackByIndex(s, trackIndex);
  if (!track) {
    return;
  }
  s.api.changeTrackSolo([track], soloed);
}

export function playerSetTrackVolume(
  s: PlayerState,
  trackIndex: number,
  volume: number,
): void {
  if (!s.supportsTrackVolume || !s.api.changeTrackVolume) {
    return;
  }
  const track = findTrackByIndex(s, trackIndex);
  if (!track) {
    return;
  }
  s.api.changeTrackVolume([track], Math.max(0, Math.min(1, volume)));
}
