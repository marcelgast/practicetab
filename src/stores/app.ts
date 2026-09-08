import { defineStore } from 'pinia';
import { ref } from 'vue';
import { resolveAudioDevice } from '../domain/audioDeviceResolve';
import { DEFAULT_ACCENT, normalizeHexColor } from '../domain/color';
import { getStoredJson, setStoredJson } from '../domain/storage';
import type { GuideId } from '../domain/guides/types';
import {
  getMicPermissionStatus,
  listInputDevices,
  listOutputDevices,
  refreshInputDevices,
  refreshOutputDevices,
  requestMicPermission,
  setInputChannel,
  setInputDevice,
  setOutputDevice,
  type InputDevice,
  type MicPermissionStatus,
  type OutputDevice,
} from '../services/audioCommands';

const STORAGE_KEY = 'practicetab.settings';
const INTERVAL_CHANGE_COUNT_IN_OPTIONS = [1, 2, 4, 6];

type StoredSettings = {
  accentColor?: string;
  darkMode?: boolean;
  lastOpenedRoute?: string;
  showStaff?: boolean;
  horizontalLayout?: boolean;
  metronomeEnabled?: boolean;
  countInEnabled?: boolean;
  metronomeVolume?: number;
  countInBars?: number[];
  intervalChangeCountInBars?: number;
  weeklyStreakGoalDays?: number;
  audioOutputDeviceId?: string | null;
  audioInputDeviceId?: string | null;
  audioInputChannel?: number | null;
  tuning?: number;
  backupIncludeTabFiles?: boolean;
  backupIncludeAudioFiles?: boolean;
  intervalModeEnabled?: boolean;
  intervalTimerOnlyEnabled?: boolean;
  intervalTimedEnabled?: boolean;
  intervalTotalDurationSeconds?: number;
  intervalDurationSeconds?: number;
  intervalBpmIncrementEnabled?: boolean;
  intervalBpmIncrement?: number;
  loopEnabled?: boolean;
  librarySyncPrefs?: Record<string, boolean>;
  /**
   * Session Journaling (PR 4.3). Absent key hydrates to `true`
   * so users upgrading from pre-PR-4.3 see the goal dialog on
   * their next session start rather than being silently opted-out.
   */
  journalingEnabled?: boolean;
  /**
   * Guided onboarding. Persisted fields are the user-controlled
   * startup toggle plus per-guide completion timestamps. The
   * Welcome-shown-this-session state is in-memory only (see
   * `useGuideStore.dismissedThisSession`) so the Welcome always
   * re-appears on the next launch while the toggle is on.
   */
  guideState?: StoredGuideState;
};

type StoredGuideState = {
  showAtStartup?: boolean;
  completed?: Record<string, string>;
};

type AppSettings = {
  accentColor: string;
  darkMode: boolean;
  lastOpenedRoute: string;
  showStaff: boolean;
  horizontalLayout: boolean;
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  metronomeVolume: number;
  countInBars: number[];
  intervalChangeCountInBars: number;
  weeklyStreakGoalDays: number;
  audioOutputDeviceId: string | null;
  audioInputDeviceId: string | null;
  audioInputChannel: number | null;
  tuning: number;
  backupIncludeTabFiles: boolean;
  backupIncludeAudioFiles: boolean;
  intervalModeEnabled: boolean;
  intervalTimerOnlyEnabled: boolean;
  intervalTimedEnabled: boolean;
  intervalTotalDurationSeconds: number;
  intervalDurationSeconds: number;
  intervalBpmIncrementEnabled: boolean;
  intervalBpmIncrement: number;
  loopEnabled: boolean;
  librarySyncPrefs: Record<string, boolean>;
  journalingEnabled: boolean;
  guideState: GuideState;
};

export type GuideState = {
  showAtStartup: boolean;
  completed: Record<GuideId, string>;
};

function loadSettings(): AppSettings {
  const stored = getStoredJson<StoredSettings>(STORAGE_KEY, {});
  const guideState = hydrateGuideState(stored);
  const storedMetronomeVolume = stored.metronomeVolume;
  const metronomeVolume =
    storedMetronomeVolume === undefined || storedMetronomeVolume === null
      ? 80
      : storedMetronomeVolume === 100
        ? 80
        : storedMetronomeVolume;

  return {
    accentColor: normalizeHexColor(stored.accentColor, DEFAULT_ACCENT),
    darkMode: true,
    lastOpenedRoute: stored.lastOpenedRoute ?? '/library',
    showStaff: stored.showStaff ?? true,
    // Classic multi-line score is the initial default — that's what
    // users coming from Guitar Pro / Songsterr / sheet music expect
    // when they first open a tab. The One-Liner (horizontal) layout
    // is a deliberate opt-in via the toggle next to Staff in the
    // volume bar; once flipped, the choice persists across launches
    // (`stored.horizontalLayout` reads `true`/`false` faithfully and
    // only an absent key — first-time user — falls through to the
    // default below).
    horizontalLayout: stored.horizontalLayout ?? false,
    metronomeEnabled: stored.metronomeEnabled ?? false,
    countInEnabled: stored.countInEnabled ?? false,
    metronomeVolume,
    countInBars:
      stored.countInBars && stored.countInBars.length > 0
        ? stored.countInBars
        : [2],
    intervalChangeCountInBars: stored.intervalChangeCountInBars ?? 2,
    weeklyStreakGoalDays: stored.weeklyStreakGoalDays ?? 5,
    audioOutputDeviceId: stored.audioOutputDeviceId ?? null,
    audioInputDeviceId: stored.audioInputDeviceId ?? null,
    audioInputChannel:
      typeof stored.audioInputChannel === 'number' &&
      Number.isFinite(stored.audioInputChannel) &&
      stored.audioInputChannel >= 0
        ? Math.round(stored.audioInputChannel)
        : null,
    tuning: stored.tuning ?? 0,
    backupIncludeTabFiles: stored.backupIncludeTabFiles ?? false,
    backupIncludeAudioFiles: stored.backupIncludeAudioFiles ?? false,
    intervalModeEnabled: stored.intervalModeEnabled ?? false,
    intervalTimerOnlyEnabled: stored.intervalTimerOnlyEnabled ?? false,
    intervalTimedEnabled: stored.intervalTimedEnabled ?? false,
    intervalTotalDurationSeconds: Math.max(
      0,
      Math.round(stored.intervalTotalDurationSeconds ?? 0),
    ),
    intervalDurationSeconds: Math.max(
      1,
      Math.round(stored.intervalDurationSeconds ?? 60),
    ),
    intervalBpmIncrementEnabled: stored.intervalBpmIncrementEnabled ?? false,
    intervalBpmIncrement: Math.max(
      0,
      Math.round(stored.intervalBpmIncrement ?? 0),
    ),
    loopEnabled: stored.loopEnabled ?? true,
    librarySyncPrefs: stored.librarySyncPrefs ?? {},
    journalingEnabled: stored.journalingEnabled ?? true,
    guideState,
  };
}

/**
 * Hydrate the guided-onboarding state from stored settings.
 *
 * Defaults `showAtStartup` to `true` for everyone — new and
 * existing users alike — so the Help-dropdown toggle advertises
 * its availability when you first look. Users who don't want the
 * startup prompt can flip the toggle off (or pick "No thanks" on
 * the Welcome) and it stays off.
 *
 * Exported so `src/__tests__/guides-app-store.test.ts` can exercise
 * the migration paths without going through the full Pinia store.
 */
export function hydrateGuideState(stored: StoredSettings): GuideState {
  const storedState = stored.guideState;
  return {
    showAtStartup: storedState?.showAtStartup ?? true,
    completed: (storedState?.completed ?? {}) as Record<GuideId, string>,
  };
}

export const useAppStore = defineStore('app', () => {
  const initial = loadSettings();

  const accentColor = ref(initial.accentColor);
  const darkMode = ref(initial.darkMode);
  const lastOpenedRoute = ref(initial.lastOpenedRoute);
  const showStaff = ref(initial.showStaff);
  const horizontalLayout = ref(initial.horizontalLayout);
  const metronomeEnabled = ref(initial.metronomeEnabled);
  const countInEnabled = ref(initial.countInEnabled);
  const metronomeVolume = ref(initial.metronomeVolume);
  const countInBars = ref(initial.countInBars);
  const intervalChangeCountInBars = ref(initial.intervalChangeCountInBars);
  const weeklyStreakGoalDays = ref(initial.weeklyStreakGoalDays);
  const audioOutputDeviceId = ref<string | null>(initial.audioOutputDeviceId);
  const audioInputDeviceId = ref<string | null>(initial.audioInputDeviceId);
  const audioInputChannel = ref<number | null>(initial.audioInputChannel);
  const tuning = ref(initial.tuning);
  const backupIncludeTabFiles = ref(initial.backupIncludeTabFiles);
  const backupIncludeAudioFiles = ref(initial.backupIncludeAudioFiles);
  const intervalModeEnabled = ref(initial.intervalModeEnabled);
  const intervalTimerOnlyEnabled = ref(initial.intervalTimerOnlyEnabled);
  const intervalTimedEnabled = ref(initial.intervalTimedEnabled);
  const intervalTotalDurationSeconds = ref(
    initial.intervalTotalDurationSeconds,
  );
  const intervalDurationSeconds = ref(initial.intervalDurationSeconds);
  const intervalBpmIncrementEnabled = ref(initial.intervalBpmIncrementEnabled);
  const intervalBpmIncrement = ref(initial.intervalBpmIncrement);
  const loopEnabled = ref(initial.loopEnabled);
  const journalingEnabled = ref(initial.journalingEnabled);
  const guideState = ref<GuideState>({
    showAtStartup: initial.guideState.showAtStartup,
    completed: { ...initial.guideState.completed },
  });
  /** Per-library-tab "sync metronome to tab" preference. Absent keys
   * default to ON when a tab is loaded. Only touched by Library-path
   * toggles — practice-path opens always force ON regardless. */
  const librarySyncPrefs = ref<Record<string, boolean>>({
    ...initial.librarySyncPrefs,
  });
  const outputDevices = ref<OutputDevice[]>([]);
  const inputDevices = ref<InputDevice[]>([]);
  const lastError = ref<string | null>(null);
  /**
   * OS-level microphone permission. Initialised optimistically as
   * `authorized` so the banner doesn't flash on app boot before the
   * first status query lands; the real value is filled in by
   * `refreshMicPermissionStatus()` from `App.vue` on mount and on
   * window focus. Only meaningful on macOS — Windows / Linux always
   * report `authorized`.
   */
  const micPermissionStatus = ref<MicPermissionStatus>('authorized');
  /**
   * Latches once we've asked the OS for the microphone prompt this
   * session. Apple only shows the system prompt the first time
   * `requestAccess` is called when the status is `not_determined`;
   * we still call the API on every "Grant access" click so the
   * promise resolves correctly, but the latch protects us from
   * looping if a future re-render path re-triggers
   * `ensureMicPromptIfNeeded()` while the user has the prompt open.
   */
  const micPromptShownThisSession = ref(false);

  function persist(): void {
    setStoredJson<AppSettings>(STORAGE_KEY, {
      accentColor: accentColor.value,
      darkMode: darkMode.value,
      lastOpenedRoute: lastOpenedRoute.value,
      showStaff: showStaff.value,
      horizontalLayout: horizontalLayout.value,
      metronomeEnabled: metronomeEnabled.value,
      countInEnabled: countInEnabled.value,
      metronomeVolume: metronomeVolume.value,
      countInBars: countInBars.value,
      intervalChangeCountInBars: intervalChangeCountInBars.value,
      weeklyStreakGoalDays: weeklyStreakGoalDays.value,
      audioOutputDeviceId: audioOutputDeviceId.value,
      audioInputDeviceId: audioInputDeviceId.value,
      audioInputChannel: audioInputChannel.value,
      tuning: tuning.value,
      backupIncludeTabFiles: backupIncludeTabFiles.value,
      backupIncludeAudioFiles: backupIncludeAudioFiles.value,
      intervalModeEnabled: intervalModeEnabled.value,
      intervalTimerOnlyEnabled: intervalTimerOnlyEnabled.value,
      intervalTimedEnabled: intervalTimedEnabled.value,
      intervalTotalDurationSeconds: intervalTotalDurationSeconds.value,
      intervalDurationSeconds: intervalDurationSeconds.value,
      intervalBpmIncrementEnabled: intervalBpmIncrementEnabled.value,
      intervalBpmIncrement: intervalBpmIncrement.value,
      loopEnabled: loopEnabled.value,
      librarySyncPrefs: librarySyncPrefs.value,
      journalingEnabled: journalingEnabled.value,
      guideState: guideState.value,
    });
  }

  function setAccentColor(value: string): void {
    accentColor.value = normalizeHexColor(value, DEFAULT_ACCENT);
    persist();
  }

  function reloadSettings(): void {
    const next = loadSettings();
    accentColor.value = next.accentColor;
    darkMode.value = next.darkMode;
    lastOpenedRoute.value = next.lastOpenedRoute;
    showStaff.value = next.showStaff;
    horizontalLayout.value = next.horizontalLayout;
    metronomeEnabled.value = next.metronomeEnabled;
    countInEnabled.value = next.countInEnabled;
    metronomeVolume.value = next.metronomeVolume;
    countInBars.value = next.countInBars;
    intervalChangeCountInBars.value = next.intervalChangeCountInBars;
    weeklyStreakGoalDays.value = next.weeklyStreakGoalDays;
    audioOutputDeviceId.value = next.audioOutputDeviceId;
    audioInputDeviceId.value = next.audioInputDeviceId;
    audioInputChannel.value = next.audioInputChannel;
    tuning.value = next.tuning;
    backupIncludeTabFiles.value = next.backupIncludeTabFiles;
    backupIncludeAudioFiles.value = next.backupIncludeAudioFiles;
    intervalModeEnabled.value = next.intervalModeEnabled;
    intervalTimerOnlyEnabled.value = next.intervalTimerOnlyEnabled;
    intervalTimedEnabled.value = next.intervalTimedEnabled;
    intervalTotalDurationSeconds.value = next.intervalTotalDurationSeconds;
    intervalDurationSeconds.value = next.intervalDurationSeconds;
    intervalBpmIncrementEnabled.value = next.intervalBpmIncrementEnabled;
    intervalBpmIncrement.value = next.intervalBpmIncrement;
    loopEnabled.value = next.loopEnabled;
    librarySyncPrefs.value = { ...next.librarySyncPrefs };
    journalingEnabled.value = next.journalingEnabled;
    guideState.value = {
      showAtStartup: next.guideState.showAtStartup,
      completed: { ...next.guideState.completed },
    };
  }

  /** Sync-to-tab preference for a Library-opened tab. `undefined` means no
   * user choice yet, which the caller should treat as default-ON. */
  function getLibrarySyncPref(libraryItemId: string): boolean | undefined {
    return librarySyncPrefs.value[libraryItemId];
  }

  function setLibrarySyncPref(libraryItemId: string, enabled: boolean): void {
    librarySyncPrefs.value = {
      ...librarySyncPrefs.value,
      [libraryItemId]: enabled,
    };
    persist();
  }

  function setBackupIncludeTabFiles(value: boolean): void {
    backupIncludeTabFiles.value = value;
    persist();
  }

  function setBackupIncludeAudioFiles(value: boolean): void {
    backupIncludeAudioFiles.value = value;
    persist();
  }

  function setIntervalModeEnabled(value: boolean): void {
    intervalModeEnabled.value = value;
    persist();
  }

  function setIntervalTimerOnlyEnabled(value: boolean): void {
    intervalTimerOnlyEnabled.value = value;
    persist();
  }

  function setIntervalTimedEnabled(value: boolean): void {
    intervalTimedEnabled.value = value;
    persist();
  }

  function setIntervalTotalDurationSeconds(value: number): void {
    intervalTotalDurationSeconds.value = Math.max(0, Math.round(value));
    persist();
  }

  function setIntervalDurationSeconds(value: number): void {
    intervalDurationSeconds.value = Math.max(1, Math.round(value));
    persist();
  }

  function setIntervalBpmIncrementEnabled(value: boolean): void {
    intervalBpmIncrementEnabled.value = value;
    persist();
  }

  function setIntervalBpmIncrement(value: number): void {
    intervalBpmIncrement.value = Math.max(0, Math.round(value));
    persist();
  }

  function setLoopEnabled(value: boolean): void {
    loopEnabled.value = value;
    persist();
  }

  function setJournalingEnabled(value: boolean): void {
    journalingEnabled.value = value;
    persist();
  }

  function setGuideShowAtStartup(value: boolean): void {
    guideState.value = { ...guideState.value, showAtStartup: value };
    persist();
  }

  function markGuideCompleted(id: GuideId): void {
    guideState.value = {
      ...guideState.value,
      completed: {
        ...guideState.value.completed,
        [id]: new Date().toISOString(),
      },
    };
    persist();
  }

  function resetGuideCompleted(id: GuideId): void {
    const next = { ...guideState.value.completed };
    delete next[id];
    guideState.value = { ...guideState.value, completed: next };
    persist();
  }

  function setLastOpenedRoute(value: string): void {
    lastOpenedRoute.value = value;
    persist();
  }

  function setShowStaff(value: boolean): void {
    showStaff.value = value;
    persist();
  }

  function setHorizontalLayout(value: boolean): void {
    horizontalLayout.value = value;
    persist();
  }

  function setMetronomeEnabled(value: boolean): void {
    metronomeEnabled.value = value;
    persist();
  }

  function setCountInEnabled(value: boolean): void {
    countInEnabled.value = value;
    persist();
  }

  function setMetronomeVolume(value: number): void {
    metronomeVolume.value = Math.max(0, Math.min(100, Math.round(value)));
    persist();
  }

  function setCountInBars(value: number[]): void {
    countInBars.value = value;
    persist();
  }

  function setIntervalChangeCountInBars(value: number): void {
    const candidate = Math.max(1, Math.round(value));
    const next = INTERVAL_CHANGE_COUNT_IN_OPTIONS.includes(candidate)
      ? candidate
      : 2;
    intervalChangeCountInBars.value = next;
    persist();
  }

  function setWeeklyStreakGoalDays(value: number): void {
    weeklyStreakGoalDays.value = Math.max(0, Math.round(value));
    persist();
  }

  function setAudioOutputDeviceId(value: string | null): void {
    audioOutputDeviceId.value = value;
    persist();
  }

  function setAudioInputDeviceId(value: string | null): void {
    audioInputDeviceId.value = value;
    persist();
  }

  function setAudioInputChannel(value: number | null): void {
    if (value === null) {
      audioInputChannel.value = null;
    } else if (
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      value >= 0
    ) {
      audioInputChannel.value = value;
    } else {
      audioInputChannel.value = null;
    }
    persist();
  }

  function setTuning(value: number): void {
    tuning.value = value;
    persist();
  }

  function withDefaultDevice(devices: OutputDevice[]): OutputDevice[] {
    const hasDefault = devices.some((device) => device.id === 'default');
    if (hasDefault) {
      return devices;
    }
    return [
      { id: 'default', name: 'System Default', isDefault: true },
      ...devices,
    ];
  }

  async function refreshOutputDevicesBasic(): Promise<void> {
    const devices = await listOutputDevices();
    outputDevices.value = withDefaultDevice(devices);
    await syncOutputDevice(outputDevices.value);
  }

  async function refreshOutputDevicesWithPermission(): Promise<void> {
    const devices = await refreshOutputDevices();
    outputDevices.value = withDefaultDevice(devices);
    await syncOutputDevice(outputDevices.value);
  }

  async function applyAudioOutputDeviceId(value: string | null): Promise<void> {
    setAudioOutputDeviceId(value);
    await setOutputDevice(value);
  }

  function withDefaultInputDevice(devices: InputDevice[]): InputDevice[] {
    const hasDefault = devices.some((device) => device.id === 'default');
    if (hasDefault) {
      return devices;
    }
    // Mirror the default device's actual channel count onto the
    // synthetic "System Default" row so the Settings channel picker
    // stays visible when the OS default is a multi-input interface
    // (e.g. a Scarlett 4i4 plugged in at app start). Without this,
    // selecting "System Default" would always hide the picker — the
    // user would have to pick the interface by name just to get the
    // channel dropdown, even though the default already points at
    // that same interface. `isDefault: true` identifies the device
    // the host considers current.
    const osDefault = devices.find((device) => device.isDefault);
    return [
      {
        id: 'default',
        name: 'System Default',
        isDefault: true,
        channels: osDefault?.channels ?? 0,
      },
      ...devices,
    ];
  }

  async function refreshInputDevicesBasic(): Promise<void> {
    const devices = await listInputDevices();
    inputDevices.value = withDefaultInputDevice(devices);
    await syncInputDevice(inputDevices.value);
  }

  async function refreshInputDevicesWithPermission(): Promise<void> {
    const devices = await refreshInputDevices();
    inputDevices.value = withDefaultInputDevice(devices);
    await syncInputDevice(inputDevices.value);
  }

  /**
   * Pull the current OS-level microphone permission status into the
   * store. Safe to call repeatedly (cheap on macOS, no-op on
   * Windows/Linux). `App.vue` calls it on mount and on window focus
   * so the banner reacts when the user grants/revokes access in
   * System Settings while the app is running.
   */
  async function refreshMicPermissionStatus(): Promise<MicPermissionStatus> {
    try {
      const status = await getMicPermissionStatus();
      micPermissionStatus.value = status;
      return status;
    } catch {
      // Defensive: if the IPC fails for any reason, leave the
      // existing value alone rather than blanking it out — better to
      // miss a state transition than to spuriously show the banner.
      return micPermissionStatus.value;
    }
  }

  /**
   * Trigger the OS microphone prompt if (and only if) the current
   * status is `not_determined`. Returns the resolved status after
   * the user has decided. No-op on platforms where the prompt model
   * doesn't apply.
   *
   * The session-latch (`micPromptShownThisSession`) protects against
   * re-firing while the prompt is already open — Apple's API blocks
   * the completion handler until the user clicks Allow / Don't Allow,
   * so two concurrent calls would just stack pending closures behind
   * the same prompt. Cheap to gate, no harm done either way, but
   * keeps the code intent explicit.
   */
  async function ensureMicPromptIfNeeded(): Promise<MicPermissionStatus> {
    const current = await refreshMicPermissionStatus();
    if (current !== 'not_determined') {
      return current;
    }
    if (micPromptShownThisSession.value) {
      return current;
    }
    micPromptShownThisSession.value = true;
    try {
      await requestMicPermission();
    } catch {
      // Swallow IPC errors — the next status refresh will surface
      // whatever the OS actually decided (e.g. user dismissed the
      // prompt, or AVCaptureDevice failed for an unrelated reason).
    }
    return refreshMicPermissionStatus();
  }

  /**
   * Reset the persisted input channel to mixdown (`null`) when the
   * stored index exceeds the device's channel count. Returns `true`
   * iff the channel was actually changed — callers use that to
   * decide whether to push the new value to Rust.
   *
   * `device === null` (no resolved entry — e.g. persisted id missing
   * from the live list) leaves the channel intact so it survives a
   * transient device disappearance, mirroring the no-wipe rule on
   * the device id itself (see `syncInputDevice`).
   */
  function clampInputChannelForDevice(device: InputDevice | null): boolean {
    const current = audioInputChannel.value;
    if (current === null) return false;
    if (!device || device.channels <= 0) return false;
    if (current < device.channels) return false;
    setAudioInputChannel(null);
    return true;
  }

  async function applyAudioInputDeviceId(value: string | null): Promise<void> {
    setAudioInputDeviceId(value);
    await setInputDevice(value);
    // Reconcile the persisted channel against the new device. Without
    // this, switching from a 4-input interface to a single-input mic
    // leaves a stale index in localStorage that re-surfaces on the
    // next sync (Rust silently mixes down in the meantime). The same
    // rule lives in `syncInputDevice` for the refresh path; this keeps
    // direct-Apply consistent regardless of caller. The lookup uses
    // `'default'` for `value === null` because the synthetic default
    // entry mirrors the OS default device's channel count.
    const targetId = value ?? 'default';
    const device = inputDevices.value.find((d) => d.id === targetId) ?? null;
    if (clampInputChannelForDevice(device)) {
      await setInputChannel(null);
    }
  }

  async function applyAudioInputChannel(value: number | null): Promise<void> {
    setAudioInputChannel(value);
    await setInputChannel(audioInputChannel.value);
  }

  async function syncInputDevice(devices: InputDevice[]): Promise<void> {
    const selected = audioInputDeviceId.value;
    // Two-tier resolve (exact id, then name fallback) so a still-
    // plugged-in interface that cpal renumbered between launches
    // is recognised. Returning null means the device is genuinely
    // gone for this session — we route to default but DO NOT clear
    // the persisted id so the choice comes back when the device does.
    const resolved = resolveAudioDevice(selected, devices);
    if (resolved) {
      // Name-fallback hit a different id than the persisted one —
      // rewrite so future launches go straight through tier 1.
      if (resolved.via === 'name' && resolved.device.id !== selected) {
        setAudioInputDeviceId(resolved.device.id);
      }
      await setInputDevice(resolved.device.id);
    } else {
      // Persisted choice survives in localStorage; only this
      // session's routing falls back to default. Re-plugging the
      // device + refreshing (or restarting) restores it.
      await setInputDevice(null);
    }
    // Push the persisted channel pick every time the input side
    // syncs (startup, after refresh, after device change). If the
    // device now has fewer channels than the stored pick, the Rust
    // side clamps silently to the mixdown path — but we still need
    // to clear the stale pick locally so Settings shows the correct
    // state. Same clamp helper that `applyAudioInputDeviceId` uses
    // so both code paths stay in lockstep.
    clampInputChannelForDevice(resolved?.device ?? null);
    await setInputChannel(audioInputChannel.value);
  }

  async function syncOutputDevice(devices: OutputDevice[]): Promise<void> {
    const selected = audioOutputDeviceId.value;
    const resolved = resolveAudioDevice(selected, devices);
    if (resolved) {
      if (resolved.via === 'name' && resolved.device.id !== selected) {
        setAudioOutputDeviceId(resolved.device.id);
      }
      await setOutputDevice(resolved.device.id);
      return;
    }
    // Same no-wipe rule as syncInputDevice — persisted choice
    // stays so it can resolve again when the device returns.
    await setOutputDevice(null);
  }

  function setLastError(value: string | null): void {
    lastError.value = value;
  }

  return {
    accentColor,
    darkMode,
    lastOpenedRoute,
    showStaff,
    horizontalLayout,
    metronomeEnabled,
    countInEnabled,
    metronomeVolume,
    countInBars,
    intervalChangeCountInBars,
    weeklyStreakGoalDays,
    audioOutputDeviceId,
    audioInputDeviceId,
    audioInputChannel,
    tuning,
    backupIncludeTabFiles,
    backupIncludeAudioFiles,
    intervalModeEnabled,
    intervalTimerOnlyEnabled,
    intervalTimedEnabled,
    intervalTotalDurationSeconds,
    intervalDurationSeconds,
    intervalBpmIncrementEnabled,
    intervalBpmIncrement,
    loopEnabled,
    journalingEnabled,
    guideState,
    outputDevices,
    inputDevices,
    micPermissionStatus,
    lastError,
    setAccentColor,
    reloadSettings,
    setBackupIncludeTabFiles,
    setBackupIncludeAudioFiles,
    setIntervalModeEnabled,
    setIntervalTimerOnlyEnabled,
    setIntervalTimedEnabled,
    setIntervalTotalDurationSeconds,
    setIntervalDurationSeconds,
    setIntervalBpmIncrementEnabled,
    setIntervalBpmIncrement,
    setLoopEnabled,
    setJournalingEnabled,
    setGuideShowAtStartup,
    markGuideCompleted,
    resetGuideCompleted,
    librarySyncPrefs,
    getLibrarySyncPref,
    setLibrarySyncPref,
    setLastOpenedRoute,
    setShowStaff,
    setHorizontalLayout,
    setMetronomeEnabled,
    setCountInEnabled,
    setMetronomeVolume,
    setCountInBars,
    setIntervalChangeCountInBars,
    setWeeklyStreakGoalDays,
    setAudioOutputDeviceId,
    setAudioInputDeviceId,
    setAudioInputChannel,
    setTuning,
    refreshOutputDevicesBasic,
    refreshOutputDevicesWithPermission,
    applyAudioOutputDeviceId,
    refreshInputDevicesBasic,
    refreshInputDevicesWithPermission,
    applyAudioInputDeviceId,
    applyAudioInputChannel,
    refreshMicPermissionStatus,
    ensureMicPromptIfNeeded,
    setLastError,
  };
});
