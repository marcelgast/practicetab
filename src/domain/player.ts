export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error';
export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface PlayerModel {
  status: PlayerStatus;
  playback: PlaybackState;
  tempoPercent: number;
  baseBpm: number | null;
  currentBpm: number | null;
  currentLibraryItemId: string | null;
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  errorMessage: string | null;
}

export function createPlayerModel(): PlayerModel {
  return {
    status: 'idle',
    playback: 'stopped',
    tempoPercent: 100,
    baseBpm: null,
    currentBpm: null,
    currentLibraryItemId: null,
    metronomeEnabled: false,
    countInEnabled: false,
    errorMessage: null,
  };
}

export function playerStartLoading(
  model: PlayerModel,
  itemId: string,
): PlayerModel {
  return {
    ...model,
    status: 'loading',
    playback: 'stopped',
    currentLibraryItemId: itemId,
    errorMessage: null,
    baseBpm: null,
    currentBpm: null,
  };
}

export function playerReady(model: PlayerModel): PlayerModel {
  return {
    ...model,
    status: 'ready',
    errorMessage: null,
  };
}

export function playerError(model: PlayerModel, message: string): PlayerModel {
  return {
    ...model,
    status: 'error',
    playback: 'stopped',
    errorMessage: message,
  };
}

export function playerSetTempo(
  model: PlayerModel,
  tempoPercent: number,
): PlayerModel {
  const clamped = Math.max(25, Math.min(200, Math.round(tempoPercent)));
  return {
    ...model,
    tempoPercent: clamped,
  };
}

export function playerSetBaseBpm(
  model: PlayerModel,
  baseBpm: number | null,
): PlayerModel {
  if (baseBpm === null) {
    return {
      ...model,
      baseBpm: null,
      currentBpm: null,
    };
  }
  if (!Number.isFinite(baseBpm) || baseBpm <= 0) {
    return model;
  }
  return {
    ...model,
    baseBpm,
    currentBpm: Math.round(baseBpm),
  };
}

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) {
    return 120;
  }
  return Math.max(20, Math.min(320, Math.round(bpm)));
}

export function playerSetBpm(model: PlayerModel, bpm: number): PlayerModel {
  return {
    ...model,
    currentBpm: clampBpm(bpm),
  };
}

export function bpmToPercent(baseBpm: number, bpm: number): number {
  if (!Number.isFinite(baseBpm) || baseBpm <= 0) {
    return 100;
  }
  const target = clampBpm(bpm);
  const percent = (target / baseBpm) * 100;
  return Math.max(25, Math.min(200, percent));
}

export function bpmDeltaFromKey(key: string, shiftKey: boolean): number | null {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') {
    return null;
  }
  const step = shiftKey ? 10 : 1;
  return key === 'ArrowUp' ? step : -step;
}

export function playerPlay(model: PlayerModel): PlayerModel {
  return {
    ...model,
    playback: 'playing',
  };
}

export function playerPause(model: PlayerModel): PlayerModel {
  return {
    ...model,
    playback: 'paused',
  };
}

export function playerStop(model: PlayerModel): PlayerModel {
  return {
    ...model,
    playback: 'stopped',
  };
}
