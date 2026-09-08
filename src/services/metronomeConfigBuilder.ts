import type {
  BeatState as CommandBeatState,
  MetronomeConfig as CommandConfig,
} from './metronomeCommands';

export type BeatState = 'accent' | 'normal' | 'low' | 'mute';
export type SubdivisionValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * UI options for the subdivision picker. Labels are clicks-per-beat
 * (1 = quarter notes only, 2 = eighth notes, 3 = triplets, …, 8 =
 * 32nd notes), values are extra-subdivisions-per-beat — the legacy
 * shape from when `'off'` meant "no extra clicks beyond the beat
 * itself". Keeping the wire format unchanged means existing user
 * settings + Rust scheduling don't need migration; only the UI
 * presentation shifts to the musically intuitive numbering.
 *
 * Shared between MetronomeControls.vue (player) and Metronome.vue
 * (dedicated page) so the two stay in sync.
 */
export type SubdivisionOption = {
  value: 'off' | SubdivisionValue;
  label: string;
};

// Not `readonly` — `AppSelect`'s `options` prop expects a mutable
// array. We don't actually mutate this at runtime; the lint/type
// guard is via the `const` binding and the immutable literal.
export const SUBDIVISION_OPTIONS: SubdivisionOption[] = [
  { value: 'off', label: '1' },
  { value: 1, label: '2' },
  { value: 2, label: '3' },
  { value: 3, label: '4' },
  { value: 4, label: '5' },
  { value: 5, label: '6' },
  { value: 6, label: '7' },
  { value: 7, label: '8' },
];
export type TimeSigBottom = 1 | 2 | 4 | 8 | 16 | 32;
export type SoundMode =
  | 'blip'
  | 'tock'
  | 'drumKit'
  | 'hype'
  | 'metalKit'
  | 'rideKit';

export const VALID_DENOMINATORS = new Set([1, 2, 4, 8, 16, 32]);
export const MIN_NUMERATOR = 1;
export const MAX_NUMERATOR = 32;
export const MAX_METRONOME_VOLUME = 100;

const BEAT_STATE_CYCLE: BeatState[] = ['accent', 'normal', 'low', 'mute'];

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function createBeatStates(
  length: number,
  existing: BeatState[] = [],
): BeatState[] {
  const clampedLength = clampNumber(length, MIN_NUMERATOR, MAX_NUMERATOR);
  return Array.from({ length: clampedLength }, (_, index) => {
    if (existing[index]) {
      return index === 0 ? 'accent' : existing[index];
    }
    return index === 0 ? 'accent' : 'normal';
  });
}

export function nextBeatState(current: BeatState): BeatState {
  const index = BEAT_STATE_CYCLE.indexOf(current);
  return BEAT_STATE_CYCLE[(index + 1) % BEAT_STATE_CYCLE.length];
}

export function buildDefaultBeatStates(top: number): BeatState[] {
  return Array.from({ length: top }, (_, index) =>
    index === 0 ? 'accent' : 'normal',
  );
}

export function toCommandBeatState(state: BeatState): CommandBeatState {
  return state;
}

export function scaledVolume(value: number): number {
  return Math.round((value / 100) * MAX_METRONOME_VOLUME);
}

export function toSubdivisionSteps(
  subdivisionsEnabled: boolean,
  subdivisionsValue: number,
): number {
  if (!subdivisionsEnabled) {
    return 1;
  }
  return Math.max(1, subdivisionsValue + 1);
}

export type ConfigInputs = {
  bpm: number;
  timeSigTop: number;
  timeSigBottom: TimeSigBottom;
  volume: number;
  beatStates: BeatState[];
  subdivisionsEnabled: boolean;
  subdivisionsValue: SubdivisionValue;
  soundMode: SoundMode;
  countInBars: number[];
  countInEnabled: boolean;
  intervalModeEnabled: boolean;
  intervalTimerOnlyEnabled: boolean;
};

function isIntervalTimerOnlyActive(inputs: ConfigInputs): boolean {
  return inputs.intervalModeEnabled && inputs.intervalTimerOnlyEnabled;
}

function resolveConfigBeatStates(inputs: ConfigInputs): CommandBeatState[] {
  if (isIntervalTimerOnlyActive(inputs)) {
    return inputs.beatStates.map(() => 'mute');
  }
  return inputs.beatStates.map(toCommandBeatState);
}

function resolveConfigSubdivisionsEnabled(inputs: ConfigInputs): boolean {
  if (isIntervalTimerOnlyActive(inputs)) {
    return false;
  }
  return inputs.subdivisionsEnabled;
}

function resolveConfigCountInEnabled(inputs: ConfigInputs): boolean {
  if (inputs.intervalModeEnabled && inputs.intervalTimerOnlyEnabled) {
    return false;
  }
  return inputs.countInEnabled;
}

export function buildCommandConfig(inputs: ConfigInputs): CommandConfig {
  return {
    bpm: inputs.bpm,
    timeSigTop: inputs.timeSigTop,
    timeSigBottom: inputs.timeSigBottom,
    volume: scaledVolume(inputs.volume),
    beatStates: resolveConfigBeatStates(inputs),
    subdivisionsEnabled: resolveConfigSubdivisionsEnabled(inputs),
    subdivisionsValue: toSubdivisionSteps(
      inputs.subdivisionsEnabled,
      inputs.subdivisionsValue,
    ),
    soundMode: inputs.soundMode,
    countInBars: [...inputs.countInBars],
    countInEnabled: resolveConfigCountInEnabled(inputs),
    startBeatIndex: 0,
    startSubIndex: 0,
    startDelayMs: 0,
  };
}

export function buildSyncedConfig(
  inputs: ConfigInputs,
  overrides: Partial<
    Pick<
      CommandConfig,
      | 'bpm'
      | 'timeSigTop'
      | 'timeSigBottom'
      | 'beatStates'
      | 'startBeatIndex'
      | 'startSubIndex'
      | 'startDelayMs'
    >
  >,
): CommandConfig {
  const top = overrides.timeSigTop ?? inputs.timeSigTop;
  return {
    ...buildCommandConfig(inputs),
    bpm: overrides.bpm ?? inputs.bpm,
    timeSigTop: top,
    timeSigBottom: overrides.timeSigBottom ?? inputs.timeSigBottom,
    beatStates: overrides.beatStates ?? buildDefaultBeatStates(top),
    countInEnabled: false,
    startBeatIndex: overrides.startBeatIndex ?? 0,
    startSubIndex: overrides.startSubIndex ?? 0,
    startDelayMs: overrides.startDelayMs ?? 0,
  };
}
