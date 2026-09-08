import { computed, ref } from 'vue';

type TapTempoOptions = {
  minTaps?: number;
  maxTaps?: number;
  resetMs?: number;
  minBpm?: number;
  maxBpm?: number;
  now?: () => number;
};

const DEFAULT_MIN_TAPS = 4;
const DEFAULT_MAX_TAPS = 8;
const DEFAULT_RESET_MS = 2000;
const DEFAULT_MIN_BPM = 30;
const DEFAULT_MAX_BPM = 240;

export function computeBpmFromTaps(
  taps: number[],
  minBpm: number,
  maxBpm: number,
): number | null {
  if (taps.length < 2) {
    return null;
  }
  const minInterval = 60000 / maxBpm;
  const maxInterval = 60000 / minBpm;
  const intervals = taps
    .slice(1)
    .map((value, index) => value - taps[index])
    .filter((delta) => delta >= minInterval && delta <= maxInterval);
  if (intervals.length === 0) {
    return null;
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(60000 / median);
}

export function useTapTempo(options: TapTempoOptions = {}) {
  const minTaps = options.minTaps ?? DEFAULT_MIN_TAPS;
  const maxTaps = options.maxTaps ?? DEFAULT_MAX_TAPS;
  const resetMs = options.resetMs ?? DEFAULT_RESET_MS;
  const minBpm = options.minBpm ?? DEFAULT_MIN_BPM;
  const maxBpm = options.maxBpm ?? DEFAULT_MAX_BPM;
  const now = options.now ?? (() => performance.now());

  const taps = ref<number[]>([]);
  const tapCount = computed(() => taps.value.length);
  const requiredTaps = computed(() => minTaps);
  const lastTapAt = ref<number | null>(null);

  function reset(): void {
    taps.value = [];
    lastTapAt.value = null;
  }

  function tap(): number | null {
    const current = now();
    if (lastTapAt.value !== null && current - lastTapAt.value > resetMs) {
      reset();
    }
    taps.value = [...taps.value, current].slice(-maxTaps);
    lastTapAt.value = current;
    if (taps.value.length < minTaps) {
      return null;
    }
    return computeBpmFromTaps(taps.value, minBpm, maxBpm);
  }

  return {
    tap,
    reset,
    tapCount,
    requiredTaps,
  };
}
