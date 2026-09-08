export type TrackId = number;

export type MixerTrackState = {
  volume: number;
  muted: boolean;
};

export type MixerBaseState = {
  tracks: Record<TrackId, MixerTrackState>;
};

export type MixerMode = 'none' | 'mute' | 'solo' | 'listen';

export type MixerUiState = {
  mode: MixerMode;
  selectedTrackId: TrackId;
  snapshotBeforeMode?: MixerBaseState;
};

export type MixerToggleResult = {
  uiState: MixerUiState;
  baseState: MixerBaseState;
  effectiveState: MixerBaseState;
};

function cloneBaseState(baseState: MixerBaseState): MixerBaseState {
  const cloned: Record<TrackId, MixerTrackState> = {};
  Object.entries(baseState.tracks).forEach(([trackId, state]) => {
    const key = Number(trackId);
    cloned[key] = {
      volume: normalizeVolume(state.volume),
      muted: Boolean(state.muted),
    };
  });
  return { tracks: cloned };
}

export function normalizeVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function applyMode(
  baseState: MixerBaseState,
  mode: MixerMode,
  selectedTrackId: TrackId,
): MixerBaseState {
  const next = cloneBaseState(baseState);
  if (mode === 'none') {
    return next;
  }
  Object.keys(next.tracks).forEach((trackId) => {
    const key = Number(trackId);
    const state = next.tracks[key];
    if (!state) {
      return;
    }
    if (mode === 'mute') {
      if (key === selectedTrackId) {
        state.muted = true;
      }
      return;
    }
    if (mode === 'solo') {
      state.muted = key !== selectedTrackId;
      return;
    }
    if (mode === 'listen' && key !== selectedTrackId) {
      state.volume = normalizeVolume(state.volume * 0.7);
    }
  });
  return next;
}

export function toggleMode(
  uiState: MixerUiState,
  baseState: MixerBaseState,
  requestedMode: MixerMode,
): MixerToggleResult {
  const currentMode = uiState.mode;
  const selectedTrackId = uiState.selectedTrackId;
  const snapshot = uiState.snapshotBeforeMode
    ? cloneBaseState(uiState.snapshotBeforeMode)
    : cloneBaseState(baseState);
  if (requestedMode === currentMode) {
    const resetUiState: MixerUiState = {
      mode: 'none',
      selectedTrackId,
    };
    const restoredBase = cloneBaseState(snapshot);
    return {
      uiState: resetUiState,
      baseState: restoredBase,
      effectiveState: cloneBaseState(restoredBase),
    };
  }
  const revertedBase =
    currentMode === 'none' ? cloneBaseState(baseState) : snapshot;
  const nextUiState: MixerUiState = {
    mode: requestedMode,
    selectedTrackId,
    snapshotBeforeMode: cloneBaseState(revertedBase),
  };
  return {
    uiState: nextUiState,
    baseState: revertedBase,
    effectiveState: applyMode(revertedBase, requestedMode, selectedTrackId),
  };
}
