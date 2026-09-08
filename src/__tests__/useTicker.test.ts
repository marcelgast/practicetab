import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTicker } from '../services/useTicker';

describe('useTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks only while active', async () => {
    const isActive = ref(false);
    const scope = effectScope();
    let nowMs: ReturnType<typeof useTicker> | null = null;

    scope.run(() => {
      nowMs = useTicker(isActive, 1000);
    });

    if (!nowMs) {
      throw new Error('Ticker ref not initialized');
    }
    const initial = nowMs.value;
    vi.advanceTimersByTime(2000);
    expect(nowMs.value).toBe(initial);

    isActive.value = true;
    await nextTick();
    const started = nowMs.value;
    vi.advanceTimersByTime(1000);
    expect(nowMs.value).toBe(started + 1000);

    isActive.value = false;
    await nextTick();
    vi.advanceTimersByTime(1000);
    expect(nowMs.value).toBe(started + 1000);

    scope.stop();
  });

  it('stops ticking on scope dispose', async () => {
    const isActive = ref(true);
    const scope = effectScope();
    let nowMs: ReturnType<typeof useTicker> | null = null;

    scope.run(() => {
      nowMs = useTicker(isActive, 500);
    });

    if (!nowMs) {
      throw new Error('Ticker ref not initialized');
    }
    await nextTick();
    const started = nowMs.value;
    vi.advanceTimersByTime(500);
    expect(nowMs.value).toBe(started + 500);

    scope.stop();
    vi.advanceTimersByTime(1000);
    expect(nowMs.value).toBe(started + 500);
  });
});
