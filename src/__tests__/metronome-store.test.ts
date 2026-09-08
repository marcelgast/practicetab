import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../stores/app';
import { useMetronomeStore } from '../stores/metronome';

vi.mock('../services/metronomeCommands', () => ({
  metronomeStart: vi.fn().mockResolvedValue(undefined),
  metronomeStop: vi.fn().mockResolvedValue(undefined),
  metronomeSetConfig: vi.fn().mockResolvedValue(undefined),
  metronomeBeep: vi.fn().mockResolvedValue(undefined),
  metronomeTickFromAlphaTab: vi.fn().mockResolvedValue(undefined),
  metronomeCancelScheduled: vi.fn().mockResolvedValue(undefined),
}));

import {
  metronomeBeep,
  metronomeSetConfig,
  metronomeStart,
  metronomeStop,
} from '../services/metronomeCommands';

describe('metronome store', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resizes beat pattern and defaults new beats to normal', () => {
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    expect(store.soundMode).toBe('tock');

    store.setTimeSigTop(3);
    expect(store.beatStates.length).toBe(3);
    expect(store.beatStates[0]).toBe('accent');
    expect(store.beatStates[1]).toBe('normal');

    store.cycleBeat(1);
    expect(store.beatStates[1]).toBe('low');

    store.setTimeSigTop(5);
    expect(store.beatStates.length).toBe(5);
    expect(store.beatStates[1]).toBe('low');
    expect(store.beatStates[3]).toBe('normal');
    expect(store.beatStates[4]).toBe('normal');

    store.setTimeSigTop(2);
    expect(store.beatStates.length).toBe(2);
    expect(store.beatStates[0]).toBe('accent');
  });

  it('includes count-in only when enabled', () => {
    setActivePinia(createPinia());
    const appStore = useAppStore();
    const store = useMetronomeStore();

    appStore.setCountInBars([2, 4]);
    appStore.setCountInEnabled(false);
    expect(store.buildCommandConfig().countInEnabled).toBe(false);

    appStore.setCountInEnabled(true);
    expect(store.buildCommandConfig().countInEnabled).toBe(true);
  });

  it('mutes click events in interval timer-only mode while keeping gain', () => {
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    store.setVolume(80);
    store.setSubdivisions(true, 3);

    store.setIntervalModeEnabled(true);
    store.setIntervalTimerOnlyEnabled(true);

    const config = store.buildCommandConfig();
    expect(config.volume).toBe(80);
    expect(config.beatStates.every((state) => state === 'mute')).toBe(true);
    expect(config.subdivisionsEnabled).toBe(false);
    expect(config.countInEnabled).toBe(false);
  });

  it('initializes interval settings from persisted app settings', () => {
    setActivePinia(createPinia());
    const appStore = useAppStore();
    appStore.setIntervalModeEnabled(true);
    appStore.setIntervalTimedEnabled(true);
    appStore.setIntervalTotalDurationSeconds(300);
    appStore.setIntervalDurationSeconds(45);
    appStore.setIntervalBpmIncrementEnabled(true);
    appStore.setIntervalBpmIncrement(2);

    const store = useMetronomeStore();

    expect(store.intervalModeEnabled).toBe(false);
    expect(store.intervalTimedEnabled).toBe(true);
    expect(store.intervalTotalDurationSeconds).toBe(300);
    expect(store.intervalDurationSeconds).toBe(45);
    expect(store.intervalBpmIncrementEnabled).toBe(true);
    expect(store.intervalBpmIncrement).toBe(2);
  });

  it('disables interval mode when sync-to-tab becomes active', async () => {
    setActivePinia(createPinia());
    const appStore = useAppStore();
    const store = useMetronomeStore();

    store.setIntervalModeEnabled(true);
    expect(store.intervalModeEnabled).toBe(true);

    store.setTabLoaded(true);
    appStore.setMetronomeEnabled(true);
    await Promise.resolve();

    expect(store.isSyncActive).toBe(true);
    expect(store.intervalModeEnabled).toBe(false);
  });

  it('disables sync-to-tab when interval mode is enabled', async () => {
    setActivePinia(createPinia());
    const appStore = useAppStore();
    const store = useMetronomeStore();

    store.setTabLoaded(true);
    appStore.setMetronomeEnabled(true);
    await Promise.resolve();
    expect(store.isSyncActive).toBe(true);

    store.setIntervalModeEnabled(true);
    await Promise.resolve();

    expect(appStore.metronomeEnabled).toBe(false);
    expect(store.isSyncActive).toBe(false);
    expect(store.intervalModeEnabled).toBe(true);
  });

  it('restores sync-to-tab after interval mode is disabled', async () => {
    setActivePinia(createPinia());
    const appStore = useAppStore();
    const store = useMetronomeStore();

    store.setTabLoaded(true);
    appStore.setMetronomeEnabled(true);
    await Promise.resolve();
    expect(store.isSyncActive).toBe(true);

    store.setIntervalModeEnabled(true);
    await Promise.resolve();
    expect(appStore.metronomeEnabled).toBe(false);

    store.setIntervalModeEnabled(false);
    await Promise.resolve();
    expect(appStore.metronomeEnabled).toBe(true);
    expect(store.isSyncActive).toBe(true);
  });

  it('updates synced config when volume changes during sync playback', async () => {
    setActivePinia(createPinia());
    const appStore = useAppStore();
    const store = useMetronomeStore();

    store.setTabLoaded(true);
    appStore.setMetronomeEnabled(true);
    await Promise.resolve();
    expect(store.isSyncActive).toBe(true);
    await store.startSynced(store.buildSyncedConfig({}));
    store.setVolume(35);
    await Promise.resolve();

    expect(metronomeSetConfig).toHaveBeenCalled();
    const lastCall = (metronomeSetConfig as typeof vi.fn).mock.calls.at(-1);
    expect(lastCall?.[0]?.volume).toBe(35);
  });

  it('does not keep the metronome running when changing volume while stopped', async () => {
    setActivePinia(createPinia());
    const store = useMetronomeStore();

    store.setVolume(55);
    await Promise.resolve();

    expect(metronomeStop).toHaveBeenCalled();
  });

  it('keeps the last synced metronome state after disabling sync-to-tab', async () => {
    setActivePinia(createPinia());
    const appStore = useAppStore();
    const store = useMetronomeStore();

    appStore.setMetronomeEnabled(true);
    await Promise.resolve();
    store.applySyncedState({
      bpm: 200,
      timeSigTop: 10,
      timeSigBottom: 16,
    });
    expect(store.timeSigBottom).toBe(16);

    appStore.setMetronomeEnabled(false);
    await Promise.resolve();

    expect(store.bpm).toBe(200);
    expect(store.timeSigTop).toBe(10);
    expect(store.timeSigBottom).toBe(16);
    expect(store.beatStates.length).toBe(10);
  });

  it('keeps metronome running when a non-timed interval ends', async () => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    (metronomeStart as unknown as ReturnType<typeof vi.fn>).mockClear();
    (metronomeStop as unknown as ReturnType<typeof vi.fn>).mockClear();
    (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mockClear();

    store.setIntervalModeEnabled(true);
    store.setIntervalDurationSeconds(1);
    await store.setRunning(true);
    await vi.advanceTimersByTimeAsync(4200);

    expect(
      (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
    expect(store.isRunning).toBe(true);
    expect(metronomeStop).not.toHaveBeenCalled();
    expect(metronomeStart).toHaveBeenCalledTimes(1);
  });

  it('stops only on the next bar when total timed duration reaches zero', async () => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mockClear();
    (metronomeStop as unknown as ReturnType<typeof vi.fn>).mockClear();

    store.setIntervalModeEnabled(true);
    store.setIntervalTimedEnabled(true);
    store.setIntervalTotalDurationSeconds(2);
    store.setIntervalDurationSeconds(1);
    await store.setRunning(true);
    await vi.advanceTimersByTimeAsync(3400);

    expect(store.isRunning).toBe(true);
    expect(metronomeStop).not.toHaveBeenCalled();
    const beepCountAtTimeout = (
      metronomeBeep as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.length;
    expect(beepCountAtTimeout).toBeGreaterThanOrEqual(1);

    // 900ms for boundary + 800ms beep play duration before metronomeStop
    await vi.advanceTimersByTimeAsync(1800);

    expect(store.isRunning).toBe(false);
    expect(
      (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(beepCountAtTimeout);
    expect(
      (metronomeStop as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('plays beep when total timed duration run stops at boundary', async () => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mockClear();

    store.setIntervalModeEnabled(true);
    store.setIntervalTimedEnabled(true);
    store.setIntervalTotalDurationSeconds(2);
    store.setIntervalDurationSeconds(10);
    await store.setRunning(true);
    await vi.advanceTimersByTimeAsync(4500);

    expect(
      (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('applies bpm increment on the next bar after an interval boundary', async () => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    (metronomeSetConfig as unknown as ReturnType<typeof vi.fn>).mockClear();
    (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mockClear();

    store.setBpm(60);
    store.setIntervalModeEnabled(true);
    store.setIntervalDurationSeconds(1);
    store.setIntervalBpmIncrementEnabled(true);
    store.setIntervalBpmIncrement(5);
    await store.setRunning(true);
    await vi.advanceTimersByTimeAsync(2100);

    expect(
      (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
    expect(store.bpm).toBe(60);
    await vi.advanceTimersByTimeAsync(2100);

    expect(store.bpm).toBe(65);
    const configCalls = (
      metronomeSetConfig as unknown as ReturnType<typeof vi.fn>
    ).mock.calls;
    expect(configCalls.some(([config]) => config?.bpm === 65)).toBe(true);
  });

  it('restarts interval immediately from timer in timer-only mode', async () => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mockClear();

    store.setBpm(30);
    store.setIntervalModeEnabled(true);
    store.setIntervalTimerOnlyEnabled(true);
    store.setIntervalDurationSeconds(1);
    store.setIntervalBpmIncrementEnabled(true);
    store.setIntervalBpmIncrement(5);

    await store.setRunning(true);
    await vi.advanceTimersByTimeAsync(1400);

    expect(store.isRunning).toBe(true);
    expect(
      (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
    expect(store.bpm).toBe(35);
  });

  it('stops immediately at timed zero in timer-only mode', async () => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    const store = useMetronomeStore();
    (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mockClear();
    (metronomeStop as unknown as ReturnType<typeof vi.fn>).mockClear();

    store.setBpm(30);
    store.setIntervalModeEnabled(true);
    store.setIntervalTimerOnlyEnabled(true);
    store.setIntervalTimedEnabled(true);
    store.setIntervalTotalDurationSeconds(2);
    store.setIntervalDurationSeconds(1);

    await store.setRunning(true);
    // 2400ms for timer + 800ms beep play duration before metronomeStop
    await vi.advanceTimersByTimeAsync(3300);

    expect(store.isRunning).toBe(false);
    expect(
      (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
    expect(metronomeStop).toHaveBeenCalled();
  });
});
