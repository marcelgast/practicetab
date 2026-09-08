import type { PracticeInterval } from '../domain/practice';

export type IntervalTick = {
  intervalIndex: number;
  intervalId: string;
  remainingSeconds: number;
  totalSeconds: number;
};

export type IntervalRunner = {
  start: () => void;
  stop: () => void;
  reset: () => void;
  jumpToIndex: (index: number) => void;
  isRunning: () => boolean;
  getIndex: () => number;
};

export function createIntervalRunner(
  intervals: PracticeInterval[],
  onTick: (tick: IntervalTick) => void,
  onIntervalEnd: (index: number, interval: PracticeInterval) => boolean | void,
  onAllDone: () => void,
  transitionDelayMs = 0,
): IntervalRunner {
  let timerId: number | null = null;
  let transitionTimerId: number | null = null;
  let transitioning = false;
  let running = false;
  let intervalIndex = 0;
  let intervalStartMs = 0;
  let totalSeconds = 0;
  let lastRemainingSeconds: number | null = null;

  const clampIndex = (index: number) =>
    Math.min(Math.max(0, index), Math.max(0, intervals.length - 1));

  const currentInterval = () => intervals[intervalIndex] ?? null;

  const emitTick = (remainingSeconds: number) => {
    const current = currentInterval();
    if (!current) {
      return;
    }
    onTick({
      intervalIndex,
      intervalId: current.id,
      remainingSeconds,
      totalSeconds: current.durationSeconds,
    });
  };

  const startInterval = (index: number) => {
    intervalIndex = clampIndex(index);
    const current = currentInterval();
    if (!current) {
      running = false;
      onAllDone();
      return;
    }
    totalSeconds = current.durationSeconds;
    intervalStartMs = Date.now();
    lastRemainingSeconds = null;
    emitTick(totalSeconds);
  };

  const step = () => {
    if (transitioning) {
      return;
    }
    const current = currentInterval();
    if (!current) {
      return;
    }
    const elapsedMs = Date.now() - intervalStartMs;
    const remainingMs = Math.max(0, current.durationSeconds * 1000 - elapsedMs);
    const remainingSeconds = Math.round(remainingMs / 1000);
    if (remainingSeconds !== lastRemainingSeconds) {
      lastRemainingSeconds = remainingSeconds;
      emitTick(remainingSeconds);
    }
    if (remainingMs <= 0) {
      const shouldAdvance = onIntervalEnd(intervalIndex, current) !== false;
      if (!shouldAdvance) {
        running = false;
        stop();
        return;
      }
      if (intervalIndex + 1 >= intervals.length) {
        running = false;
        stop();
        onAllDone();
        return;
      }
      if (transitionDelayMs > 0) {
        transitioning = true;
        transitionTimerId = globalThis.setTimeout(() => {
          transitionTimerId = null;
          transitioning = false;
          startInterval(intervalIndex + 1);
        }, transitionDelayMs);
        return;
      }
      startInterval(intervalIndex + 1);
    }
  };

  const start = () => {
    if (running) {
      return;
    }
    running = true;
    if (intervals.length === 0) {
      running = false;
      onAllDone();
      return;
    }
    startInterval(intervalIndex);
    timerId = globalThis.setInterval(step, 250);
  };

  const stop = () => {
    if (transitionTimerId !== null) {
      globalThis.clearTimeout(transitionTimerId);
      transitionTimerId = null;
    }
    if (timerId !== null) {
      globalThis.clearInterval(timerId);
      timerId = null;
    }
    transitioning = false;
    running = false;
  };

  const reset = () => {
    stop();
    intervalIndex = 0;
    const current = currentInterval();
    if (current) {
      emitTick(current.durationSeconds);
    }
  };

  const jumpToIndex = (index: number) => {
    intervalIndex = clampIndex(index);
    if (running) {
      startInterval(intervalIndex);
    }
  };

  return {
    start,
    stop,
    reset,
    jumpToIndex,
    isRunning: () => running,
    getIndex: () => intervalIndex,
  };
}
