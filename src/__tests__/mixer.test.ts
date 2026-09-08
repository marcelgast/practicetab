import { describe, expect, it } from 'vitest';
import {
  applyMode,
  normalizeVolume,
  toggleMode,
  type MixerBaseState,
  type MixerUiState,
} from '../domain/mixer';

function createBaseState(): MixerBaseState {
  return {
    tracks: {
      0: { volume: 1, muted: false },
      1: { volume: 0.8, muted: true },
      2: { volume: 0.6, muted: false },
    },
  };
}

describe('mixer domain', () => {
  it('normalizes volume into the 0..1 range', () => {
    expect(normalizeVolume(-1)).toBe(0);
    expect(normalizeVolume(2)).toBe(1);
    expect(normalizeVolume(0.25)).toBe(0.25);
  });

  it('listen mode lowers non-selected tracks by 30% without mutating base state', () => {
    const base = createBaseState();
    const effective = applyMode(base, 'listen', 0);
    expect(effective.tracks[0].volume).toBe(1);
    expect(effective.tracks[1].volume).toBeCloseTo(0.56, 6);
    expect(effective.tracks[2].volume).toBeCloseTo(0.42, 6);
    expect(base.tracks[1].volume).toBe(0.8);
    expect(base.tracks[2].volume).toBe(0.6);
  });

  it('solo mode mutes all non-selected tracks', () => {
    const effective = applyMode(createBaseState(), 'solo', 2);
    expect(effective.tracks[2].muted).toBe(false);
    expect(effective.tracks[0].muted).toBe(true);
    expect(effective.tracks[1].muted).toBe(true);
  });

  it('toggleMode reverts to exact snapshot when disabling active mode', () => {
    const base = createBaseState();
    const ui: MixerUiState = { mode: 'none', selectedTrackId: 1 };
    const first = toggleMode(ui, base, 'mute');
    expect(first.effectiveState.tracks[1].muted).toBe(true);
    const second = toggleMode(first.uiState, first.baseState, 'mute');
    expect(second.uiState.mode).toBe('none');
    expect(second.baseState).toEqual(base);
    expect(second.effectiveState).toEqual(base);
  });

  it('switching mode restores snapshot before applying the new mode', () => {
    const base = createBaseState();
    const ui: MixerUiState = { mode: 'none', selectedTrackId: 0 };
    const muteOn = toggleMode(ui, base, 'mute');
    expect(muteOn.effectiveState.tracks[0].muted).toBe(true);
    const listenOn = toggleMode(muteOn.uiState, muteOn.baseState, 'listen');
    expect(listenOn.uiState.mode).toBe('listen');
    expect(listenOn.baseState).toEqual(base);
    expect(listenOn.effectiveState.tracks[0].muted).toBe(false);
    expect(listenOn.effectiveState.tracks[1].volume).toBeCloseTo(0.56, 6);
  });
});
