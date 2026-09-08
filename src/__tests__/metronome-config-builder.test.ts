import { describe, expect, it } from 'vitest';
import {
  clampNumber,
  createBeatStates,
  nextBeatState,
  buildDefaultBeatStates,
  scaledVolume,
  toSubdivisionSteps,
  buildCommandConfig,
  buildSyncedConfig,
  type ConfigInputs,
} from '../services/metronomeConfigBuilder';

function makeInputs(overrides: Partial<ConfigInputs> = {}): ConfigInputs {
  return {
    bpm: 120,
    timeSigTop: 4,
    timeSigBottom: 4,
    volume: 80,
    beatStates: ['accent', 'normal', 'normal', 'normal'],
    subdivisionsEnabled: false,
    subdivisionsValue: 2,
    soundMode: 'tock',
    countInBars: [],
    countInEnabled: false,
    intervalModeEnabled: false,
    intervalTimerOnlyEnabled: false,
    ...overrides,
  };
}

describe('clampNumber', () => {
  it('clamps within range', () => {
    expect(clampNumber(5, 1, 10)).toBe(5);
    expect(clampNumber(-3, 1, 10)).toBe(1);
    expect(clampNumber(15, 1, 10)).toBe(10);
  });

  it('rounds to nearest integer', () => {
    expect(clampNumber(5.7, 1, 10)).toBe(6);
    expect(clampNumber(5.2, 1, 10)).toBe(5);
  });

  it('returns min for non-finite values', () => {
    expect(clampNumber(NaN, 1, 10)).toBe(1);
    expect(clampNumber(Infinity, 1, 10)).toBe(1);
    expect(clampNumber(-Infinity, 1, 10)).toBe(1);
  });
});

describe('createBeatStates', () => {
  it('creates default beat states with accent on first beat', () => {
    const states = createBeatStates(4);
    expect(states).toEqual(['accent', 'normal', 'normal', 'normal']);
  });

  it('preserves existing states when expanding', () => {
    const existing = ['accent', 'low', 'mute'] as const;
    const states = createBeatStates(5, [...existing]);
    expect(states).toEqual(['accent', 'low', 'mute', 'normal', 'normal']);
  });

  it('forces accent on first beat even if existing has different', () => {
    const states = createBeatStates(3, ['normal', 'low', 'mute']);
    expect(states[0]).toBe('accent');
  });

  it('truncates when shrinking', () => {
    const existing = ['accent', 'low', 'mute', 'normal'] as const;
    const states = createBeatStates(2, [...existing]);
    expect(states).toEqual(['accent', 'low']);
  });

  it('clamps length to valid range', () => {
    expect(createBeatStates(0).length).toBe(1);
    expect(createBeatStates(100).length).toBe(32);
  });
});

describe('nextBeatState', () => {
  it('cycles through states', () => {
    expect(nextBeatState('accent')).toBe('normal');
    expect(nextBeatState('normal')).toBe('low');
    expect(nextBeatState('low')).toBe('mute');
    expect(nextBeatState('mute')).toBe('accent');
  });
});

describe('buildDefaultBeatStates', () => {
  it('creates accent + normal pattern', () => {
    expect(buildDefaultBeatStates(3)).toEqual(['accent', 'normal', 'normal']);
  });
});

describe('scaledVolume', () => {
  it('passes volume through as 0-100', () => {
    expect(scaledVolume(0)).toBe(0);
    expect(scaledVolume(100)).toBe(100);
    expect(scaledVolume(50)).toBe(50);
  });
});

describe('toSubdivisionSteps', () => {
  it('returns 1 when disabled', () => {
    expect(toSubdivisionSteps(false, 3)).toBe(1);
  });

  it('returns value + 1 when enabled', () => {
    expect(toSubdivisionSteps(true, 3)).toBe(4);
    expect(toSubdivisionSteps(true, 1)).toBe(2);
  });
});

describe('buildCommandConfig', () => {
  it('builds a valid config from inputs', () => {
    const config = buildCommandConfig(makeInputs());
    expect(config.bpm).toBe(120);
    expect(config.timeSigTop).toBe(4);
    expect(config.volume).toBe(80);
    expect(config.beatStates).toEqual(['accent', 'normal', 'normal', 'normal']);
    expect(config.subdivisionsEnabled).toBe(false);
    expect(config.subdivisionsValue).toBe(1);
    expect(config.countInEnabled).toBe(false);
  });

  it('mutes beats in interval timer-only mode', () => {
    const config = buildCommandConfig(
      makeInputs({
        intervalModeEnabled: true,
        intervalTimerOnlyEnabled: true,
        subdivisionsEnabled: true,
        countInEnabled: true,
      }),
    );
    expect(config.beatStates.every((s) => s === 'mute')).toBe(true);
    expect(config.subdivisionsEnabled).toBe(false);
    expect(config.countInEnabled).toBe(false);
  });

  it('disables count-in when interval timer-only is active', () => {
    const config = buildCommandConfig(
      makeInputs({
        intervalModeEnabled: true,
        intervalTimerOnlyEnabled: true,
        countInEnabled: true,
      }),
    );
    expect(config.countInEnabled).toBe(false);
  });

  it('enables count-in when not in timer-only mode', () => {
    const config = buildCommandConfig(makeInputs({ countInEnabled: true }));
    expect(config.countInEnabled).toBe(true);
  });
});

describe('buildSyncedConfig', () => {
  it('applies overrides and disables count-in', () => {
    const config = buildSyncedConfig(makeInputs({ countInEnabled: true }), {
      bpm: 200,
      timeSigTop: 6,
    });
    expect(config.bpm).toBe(200);
    expect(config.timeSigTop).toBe(6);
    expect(config.countInEnabled).toBe(false);
    expect(config.beatStates.length).toBe(6);
  });

  it('uses default beat states when no override provided', () => {
    const config = buildSyncedConfig(makeInputs(), {});
    expect(config.beatStates).toEqual(['accent', 'normal', 'normal', 'normal']);
  });
});
