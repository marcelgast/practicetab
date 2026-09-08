import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useToastStore } from '../stores/toast';

describe('useToastStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast with default variant + 3s duration', () => {
    const store = useToastStore();
    store.show('Guide completed ✓');
    expect(store.current).not.toBeNull();
    expect(store.current!.message).toBe('Guide completed ✓');
    expect(store.current!.variant).toBe('success');
    expect(store.current!.durationMs).toBe(3000);
  });

  it('auto-dismisses after the configured duration', () => {
    const store = useToastStore();
    store.show('Hello', { durationMs: 1000 });
    expect(store.current).not.toBeNull();
    vi.advanceTimersByTime(999);
    expect(store.current).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.current).toBeNull();
  });

  it('replaces the previous toast when a new one comes in (no stacking)', () => {
    const store = useToastStore();
    store.show('First');
    const firstId = store.current!.id;
    store.show('Second');
    expect(store.current!.message).toBe('Second');
    expect(store.current!.id).not.toBe(firstId);
  });

  it('does not dismiss a replacement toast when the original timer fires', () => {
    const store = useToastStore();
    store.show('First', { durationMs: 1000 });
    vi.advanceTimersByTime(500);
    store.show('Second', { durationMs: 1000 });
    vi.advanceTimersByTime(600); // first timer would have fired at 1000ms
    expect(store.current?.message).toBe('Second');
  });

  it('manual dismiss clears immediately', () => {
    const store = useToastStore();
    store.show('Visible');
    store.dismiss();
    expect(store.current).toBeNull();
  });

  it('clamps durations below the minimum', () => {
    const store = useToastStore();
    store.show('Short', { durationMs: 10 });
    expect(store.current!.durationMs).toBe(500);
  });
});
