// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../stores/app';

const STORAGE_KEY = 'practicetab.settings';

describe('app store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('persists accent color updates', () => {
    const store = useAppStore();

    store.setAccentColor('#abc');

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.accentColor).toBe('#AABBCC');
  });

  it('stores last error without persisting', () => {
    const store = useAppStore();

    store.setLastError('boom');

    expect(store.lastError).toBe('boom');
  });

  it('persists staff preference', () => {
    const store = useAppStore();

    store.setShowStaff(false);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.showStaff).toBe(false);
  });

  it('defaults metronome volume to 80', () => {
    const store = useAppStore();

    expect(store.metronomeVolume).toBe(80);
  });

  it('migrates legacy 100% metronome volume to 80', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ metronomeVolume: 100 }));
    const store = useAppStore();

    expect(store.metronomeVolume).toBe(80);
  });

  it('persists metronome and count-in flags', () => {
    const store = useAppStore();

    store.setMetronomeEnabled(true);
    store.setCountInEnabled(true);
    store.setMetronomeVolume(72);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.metronomeEnabled).toBe(true);
    expect(parsed?.countInEnabled).toBe(true);
    expect(parsed?.metronomeVolume).toBe(72);
  });

  it('defaults interval change count-in to 2 and persists updates', () => {
    const store = useAppStore();

    expect(store.intervalChangeCountInBars).toBe(2);

    store.setIntervalChangeCountInBars(4);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.intervalChangeCountInBars).toBe(4);
  });

  it('persists audio output device selection', () => {
    const store = useAppStore();

    store.setAudioOutputDeviceId('device-1');

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.audioOutputDeviceId).toBe('device-1');
  });

  it('persists tuning', () => {
    const store = useAppStore();

    store.setTuning(-2);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.tuning).toBe(-2);
  });

  it('persists backup include tab files preference', () => {
    const store = useAppStore();

    store.setBackupIncludeTabFiles(true);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.backupIncludeTabFiles).toBe(true);
  });

  it('persists metronome interval mode preferences', () => {
    const store = useAppStore();

    store.setIntervalModeEnabled(true);
    store.setIntervalTimerOnlyEnabled(true);
    store.setIntervalTimedEnabled(true);
    store.setIntervalTotalDurationSeconds(900);
    store.setIntervalDurationSeconds(75);
    store.setIntervalBpmIncrementEnabled(true);
    store.setIntervalBpmIncrement(3);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.intervalModeEnabled).toBe(true);
    expect(parsed?.intervalTimerOnlyEnabled).toBe(true);
    expect(parsed?.intervalTimedEnabled).toBe(true);
    expect(parsed?.intervalTotalDurationSeconds).toBe(900);
    expect(parsed?.intervalDurationSeconds).toBe(75);
    expect(parsed?.intervalBpmIncrementEnabled).toBe(true);
    expect(parsed?.intervalBpmIncrement).toBe(3);
  });

  it('persists loop enabled preference', () => {
    const store = useAppStore();

    store.setLoopEnabled(true);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    expect(parsed?.loopEnabled).toBe(true);

    store.reloadSettings();
    expect(store.loopEnabled).toBe(true);
  });
});
