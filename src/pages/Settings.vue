<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ChevronDown, Download, Search } from 'lucide-vue-next';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useAppStore } from '../stores/app';
import { usePracticeStore } from '../stores/practice';
import { useLibraryStore } from '../stores/library';
import { useStatsStore } from '../stores/stats';
import { useBeatmapStore } from '../stores/beatmap';
import { exportBackupFile, importBackupFile } from '../services/backupService';
import {
  getAudioInputStatus,
  type InputDevice,
  type InputStatus,
  type OutputDevice,
} from '../services/audioCommands';
import {
  buildOfflineDeviceLabel,
  shouldShowOfflineDeviceOption,
} from '../domain/audioDeviceResolve';
import BaseButton from '../components/ui/BaseButton.vue';
import AppTooltip from '../components/ui/AppTooltip.vue';
import AppSelect from '../components/ui/AppSelect.vue';
import SettingsSwitch from '../components/ui/SettingsSwitch.vue';
import PitchTestMode from '../components/settings/PitchTestMode.vue';
import { useShareImport } from './settings/useShareImport';

const appStore = useAppStore();
const practiceStore = usePracticeStore();
const libraryStore = useLibraryStore();
const statsStore = useStatsStore();
const beatmapStore = useBeatmapStore();

const {
  shareImportState,
  sharePlanDialogOpen,
  sharePlanSelection,
  sharePlanTouched,
  shareLinkDialogOpen,
  shareLinkSearch,
  sharePlanOptions,
  sharePlanDisplay,
  shareLinkCandidates,
  shareMissingDialogOpen,
  closeSharePlanDialog,
  handleShareMissingDialogOpen,
  handleShareSelectLink,
  handleShareLocateOnDisk,
  handleShareChooseFromLibrary,
  confirmSharePlanSelection,
  handleShareImportToNewPlan,
  handleShareImport,
} = useShareImport();

const practiceOpen = ref(true);
const audioOpen = ref(true);
const backupOpen = ref(true);
const shareOpen = ref(true);
const journalingOpen = ref(true);
const weeklyGoalDraft = ref(String(appStore.weeklyStreakGoalDays));
const intervalCountInDraft = ref(String(appStore.intervalChangeCountInBars));
const applySuccess = ref(false);
const audioOutputDraft = ref(appStore.audioOutputDeviceId ?? 'default');
const audioInputDraft = ref(appStore.audioInputDeviceId ?? 'default');
/**
 * Picker-facing device lists. When the persisted device isn't in
 * the live enumeration (interface unplugged, driver re-init lag,
 * etc.) we append a synthetic "(offline)" entry bound to the draft
 * id. Without it, AppSelect silently falls back to its first option
 * for display while the draft still holds the offline id — the
 * dropdown would lie ("System Default") and a follow-up Apply would
 * re-persist the offline id instead of clearing it. The store's
 * `outputDevices`/`inputDevices` stay untouched (used elsewhere as
 * the live truth source).
 */
const outputDevices = computed<OutputDevice[]>(() => {
  const base = appStore.outputDevices;
  if (!shouldShowOfflineDeviceOption(audioOutputDraft.value, base)) return base;
  return [
    ...base,
    {
      id: audioOutputDraft.value,
      name: buildOfflineDeviceLabel(audioOutputDraft.value),
      isDefault: false,
    },
  ];
});
const inputDevices = computed<InputDevice[]>(() => {
  const base = appStore.inputDevices;
  if (!shouldShowOfflineDeviceOption(audioInputDraft.value, base)) return base;
  return [
    ...base,
    {
      id: audioInputDraft.value,
      name: buildOfflineDeviceLabel(audioInputDraft.value),
      isDefault: false,
      // Unknown channel count → picker stays hidden, which matches
      // reality: we can't ask an offline interface how many inputs
      // it has.
      channels: 0,
    },
  ];
});
/**
 * Channel drafts store their numeric channel as a stringified index
 * ('0', '1', …) so AppSelect (which only deals in strings) can bind
 * directly. `'mix'` is the sentinel for the mixdown path (null on
 * the Rust side). The store's numeric value is the source of truth;
 * the draft mirrors it and resets when the device changes.
 */
const CHANNEL_MIX_SENTINEL = 'mix';
const audioInputChannelDraft = ref(
  appStore.audioInputChannel === null
    ? CHANNEL_MIX_SENTINEL
    : String(appStore.audioInputChannel),
);
/** The InputDevice currently selected in the draft (not yet applied). */
const selectedInputDevice = computed(() =>
  inputDevices.value.find((device) => device.id === audioInputDraft.value),
);
/** Only show the picker when the backend knows the channel count and it's >1. */
const showInputChannelPicker = computed(() => {
  const device = selectedInputDevice.value;
  return Boolean(device && device.channels > 1);
});
const inputChannelOptions = computed(() => {
  const device = selectedInputDevice.value;
  if (!device || device.channels <= 1) return [];
  const options: Array<{ value: string; label: string }> = [
    { value: CHANNEL_MIX_SENTINEL, label: 'Mix (all channels to mono)' },
  ];
  for (let i = 0; i < device.channels; i += 1) {
    options.push({ value: String(i), label: `Channel ${i + 1}` });
  }
  return options;
});
const audioRefreshState = ref<'idle' | 'loading'>('idle');
/**
 * Live snapshot of the Rust input stream — polled every few seconds
 * while the Settings page is mounted. Read-only: the sample rate is
 * always whatever the system/driver chose for the device, and the
 * buffer size is whatever cpal negotiated against the driver's
 * supported range. Surfaced here so a user chasing latency issues
 * can see the actual figures without digging through logs.
 */
const inputStreamStatus = ref<InputStatus>({
  running: false,
  sampleRate: 0,
  channels: 0,
  bufferFrames: 0,
});
const MAIN_CONTENT_CLASS = 'main-content--settings';
const INTERVAL_COUNT_IN_OPTIONS = [1, 2, 4, 6];
const backupIncludeTabs = computed({
  get: () => appStore.backupIncludeTabFiles,
  set: (value: boolean) => appStore.setBackupIncludeTabFiles(value),
});
const backupIncludeAudio = computed({
  get: () => appStore.backupIncludeAudioFiles,
  set: (value: boolean) => appStore.setBackupIncludeAudioFiles(value),
});
const backupState = ref<'idle' | 'exporting' | 'importing'>('idle');
const backupMessage = ref<string | null>(null);
const backupError = ref<string | null>(null);

function togglePractice(): void {
  practiceOpen.value = !practiceOpen.value;
}

function toggleAudio(): void {
  audioOpen.value = !audioOpen.value;
}

function toggleBackup(): void {
  backupOpen.value = !backupOpen.value;
}

function toggleShare(): void {
  shareOpen.value = !shareOpen.value;
}

function toggleJournaling(): void {
  journalingOpen.value = !journalingOpen.value;
}

function clampWeeklyGoal(value: number): number {
  if (!Number.isFinite(value)) {
    return appStore.weeklyStreakGoalDays;
  }
  return Math.min(7, Math.max(0, Math.round(value)));
}

function parseIntervalCountIn(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return appStore.intervalChangeCountInBars;
  }
  const rounded = Math.round(parsed);
  return INTERVAL_COUNT_IN_OPTIONS.includes(rounded) ? rounded : 2;
}

function handleApply(): void {
  const parsed = Number(weeklyGoalDraft.value);
  const next = clampWeeklyGoal(parsed);
  weeklyGoalDraft.value = String(next);
  appStore.setWeeklyStreakGoalDays(next);
  const intervalNext = parseIntervalCountIn(intervalCountInDraft.value);
  intervalCountInDraft.value = String(intervalNext);
  appStore.setIntervalChangeCountInBars(intervalNext);
  const output =
    audioOutputDraft.value === 'default' ? null : audioOutputDraft.value;
  void appStore.applyAudioOutputDeviceId(output);
  const input =
    audioInputDraft.value === 'default' ? null : audioInputDraft.value;
  void appStore.applyAudioInputDeviceId(input);
  // Parse the channel draft back to `number | null`. The draft and
  // device may be out of sync if the user just switched to a
  // different device with fewer channels — `applyAudioInputChannel`
  // would otherwise push a stale index. The store re-clamps against
  // the (possibly-updated) channel count via its own validator.
  const channel =
    audioInputChannelDraft.value === CHANNEL_MIX_SENTINEL
      ? null
      : Number.parseInt(audioInputChannelDraft.value, 10);
  void appStore.applyAudioInputChannel(
    channel === null || Number.isNaN(channel) ? null : channel,
  );
  applySuccess.value = true;
  window.setTimeout(() => {
    applySuccess.value = false;
  }, 1500);
}

watch(
  () => appStore.audioOutputDeviceId,
  (value) => {
    audioOutputDraft.value = value ?? 'default';
  },
);

watch(
  () => appStore.audioInputDeviceId,
  (value) => {
    audioInputDraft.value = value ?? 'default';
  },
);

watch(
  () => appStore.audioInputChannel,
  (value) => {
    audioInputChannelDraft.value =
      value === null ? CHANNEL_MIX_SENTINEL : String(value);
  },
);

// When the user switches device in the picker — but hasn't applied
// yet — the selected channel index may be out of range on the new
// device. Reset the draft to the mixdown option so the user doesn't
// silently apply an invalid pick.
watch(
  () => audioInputDraft.value,
  (deviceId) => {
    const device = inputDevices.value.find((d) => d.id === deviceId);
    if (!device || device.channels <= 1) {
      audioInputChannelDraft.value = CHANNEL_MIX_SENTINEL;
      return;
    }
    if (audioInputChannelDraft.value === CHANNEL_MIX_SENTINEL) return;
    const idx = Number.parseInt(audioInputChannelDraft.value, 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= device.channels) {
      audioInputChannelDraft.value = CHANNEL_MIX_SENTINEL;
    }
  },
);

async function refreshDevices(): Promise<void> {
  if (audioRefreshState.value === 'loading') {
    return;
  }
  audioRefreshState.value = 'loading';
  await Promise.all([
    appStore.refreshOutputDevicesWithPermission(),
    appStore.refreshInputDevicesWithPermission(),
  ]);
  // No post-refresh draft/persistence cleanup here. The store's
  // `syncOutputDevice` / `syncInputDevice` already runs the two-tier
  // resolver (exact id, then name fallback) and rewrites the persisted
  // id when cpal renumbered an interface — the watchers above pick up
  // that change and update the drafts.
  //
  // When a device is genuinely missing the store deliberately leaves
  // the persisted id intact (only this session's routing drops to
  // default) so the choice can resolve again on re-plug or restart.
  // Mutating the draft to 'default' or calling
  // `applyAudio*DeviceId(null)` here would defeat that — the previous
  // version of this function did exactly that and silently wiped the
  // user's persisted interface, which is the bug PR #58 fixes. The
  // user can still pick System Default explicitly and click Apply if
  // that's what they want.
  audioRefreshState.value = 'idle';
}

function clearBackupMessage(): void {
  backupMessage.value = null;
}

function showBackupError(message: string): void {
  backupError.value = message;
}

function closeBackupError(): void {
  backupError.value = null;
}

async function handleExportBackup(): Promise<void> {
  clearBackupMessage();
  if (backupState.value !== 'idle') {
    return;
  }
  backupState.value = 'exporting';
  try {
    const result = await exportBackupFile({
      includeTabFiles: backupIncludeTabs.value,
      includeAudioFiles: backupIncludeAudio.value,
    });
    if (result.status === 'success') {
      backupMessage.value = 'Backup exported.';
    }
  } catch {
    showBackupError('Backup export failed.');
  } finally {
    backupState.value = 'idle';
  }
}

async function handleImportBackup(): Promise<void> {
  clearBackupMessage();
  if (backupState.value !== 'idle') {
    return;
  }
  backupState.value = 'importing';
  try {
    const result = await importBackupFile();
    if (result.status === 'cancelled') {
      return;
    }
    beatmapStore.refresh();
    await libraryStore.refresh();
    await practiceStore.init();
    await statsStore.refresh();
    appStore.reloadSettings();
    backupMessage.value = 'Backup restored.';
  } catch (error) {
    const message = String(error ?? '');
    if (message.includes('unsupported_backup_version')) {
      showBackupError('Backup file version not supported.');
      return;
    }
    if (message.includes('legacy_backup_needs_license_key')) {
      // Legacy pre-1.4.0 encrypted backup, and the retired license
      // key isn't in localStorage on this machine — so we can't
      // derive the decrypt key. Point the user at the migration path.
      showBackupError(
        'This backup was created before PracticeTab became free and can only be imported on the machine that made it.',
      );
      return;
    }
    if (message.includes('decrypt_failed')) {
      showBackupError('Invalid backup file.');
      return;
    }
    showBackupError('Backup import failed.');
  } finally {
    backupState.value = 'idle';
  }
}

// Poll the Rust input status every 2s while Settings is mounted so
// the "Active input" line stays in sync when the user starts / stops
// the tuner or pitch detection from elsewhere. Cheap IPC read; no
// stream rebuild.
const INPUT_STATUS_POLL_MS = 2000;
let inputStatusPollHandle: ReturnType<typeof setInterval> | null = null;

async function refreshInputStatus(): Promise<void> {
  try {
    inputStreamStatus.value = await getAudioInputStatus();
  } catch {
    // Best-effort: the Tauri command can transiently fail during
    // device reshuffles. Leave the previous value up.
  }
}

function formatSampleRate(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  const khz = hz / 1000;
  // 44.1 / 48 / 88.2 / 96 / 176.4 / 192 all render cleanly at 1dp.
  const trimmed = Number.isInteger(khz) ? khz.toFixed(0) : khz.toFixed(1);
  return `${trimmed} kHz`;
}

function formatBufferFrames(status: InputStatus): string {
  if (!status.bufferFrames || status.bufferFrames <= 0) {
    return 'Buffer: device default';
  }
  const frames = status.bufferFrames;
  if (status.sampleRate > 0) {
    const ms = (frames / status.sampleRate) * 1000;
    return `Buffer: ${frames} frames (${ms.toFixed(1)} ms)`;
  }
  return `Buffer: ${frames} frames`;
}

onMounted(() => {
  void appStore.refreshOutputDevicesBasic();
  void appStore.refreshInputDevicesBasic();
  document.querySelector('.main-content')?.classList.add(MAIN_CONTENT_CLASS);
  void refreshInputStatus();
  inputStatusPollHandle = setInterval(
    () => void refreshInputStatus(),
    INPUT_STATUS_POLL_MS,
  );
});

onUnmounted(() => {
  document.querySelector('.main-content')?.classList.remove(MAIN_CONTENT_CLASS);
  if (inputStatusPollHandle !== null) {
    clearInterval(inputStatusPollHandle);
    inputStatusPollHandle = null;
  }
});
</script>

<template>
  <section class="page">
    <h1 class="page-title">
      Settings
    </h1>
    <div class="settings-section">
      <button
        class="section-header"
        type="button"
        @click="togglePractice"
      >
        <span>Practice Settings</span>
        <ChevronDown
          class="chevron"
          :class="{ open: practiceOpen }"
        />
      </button>
      <div
        v-if="practiceOpen"
        class="section-body"
      >
        <label class="field-row">
          <span>Weekly Streak Goal (Days)</span>
          <input
            v-model="weeklyGoalDraft"
            class="field-input field-input--wide"
            type="number"
            min="0"
            max="7"
            step="1"
          >
        </label>
        <label class="field-row">
          <span>Interval Change Count In</span>
          <AppSelect
            trigger-class="field-select field-select--compact field-select--accent"
            aria-label="Interval change count in"
            :options="
              INTERVAL_COUNT_IN_OPTIONS.map((option) => ({
                value: String(option),
                label: String(option),
              }))
            "
            :model-value="intervalCountInDraft"
            @update:model-value="intervalCountInDraft = String($event)"
          />
        </label>
      </div>
    </div>
    <div class="settings-section">
      <button
        class="section-header"
        type="button"
        @click="toggleAudio"
      >
        <span>Audio</span>
        <ChevronDown
          class="chevron"
          :class="{ open: audioOpen }"
        />
      </button>
      <div
        v-if="audioOpen"
        class="section-body"
      >
        <label class="field-block">
          <span>Output device</span>
          <div class="field-inline">
            <AppSelect
              trigger-class="field-select"
              aria-label="Output device"
              :options="
                outputDevices.map((device) => ({
                  value: device.id,
                  label: device.name,
                }))
              "
              :model-value="audioOutputDraft"
              @update:model-value="audioOutputDraft = String($event)"
            />
            <AppTooltip text="Refresh devices">
              <BaseButton
                class="refresh-button"
                variant="ghost"
                size="sm"
                type="button"
                :disabled="audioRefreshState === 'loading'"
                @click="refreshDevices"
              >
                <RefreshCw
                  class="audio-refresh-icon"
                  :class="{ 'is-spinning': audioRefreshState === 'loading' }"
                />
                Refresh
              </BaseButton>
            </AppTooltip>
          </div>
        </label>
        <label class="field-block">
          <span>Input device</span>
          <div class="field-inline">
            <AppSelect
              trigger-class="field-select"
              aria-label="Input device"
              :options="
                inputDevices.map((device) => ({
                  value: device.id,
                  label: device.name,
                }))
              "
              :model-value="audioInputDraft"
              @update:model-value="audioInputDraft = String($event)"
            />
          </div>
        </label>
        <label
          v-if="showInputChannelPicker"
          class="field-block"
        >
          <span>Input channel</span>
          <div class="field-inline">
            <AppSelect
              trigger-class="field-select"
              aria-label="Input channel"
              :options="inputChannelOptions"
              :model-value="audioInputChannelDraft"
              @update:model-value="audioInputChannelDraft = String($event)"
            />
          </div>
          <span class="field-hint">
            Pick the channel your guitar is plugged into. &ldquo;Mix&rdquo;
            averages all channels to mono (default) — fine for a 2-in interface
            with only one source, but picks up noise on the unused inputs.
          </span>
        </label>
        <div
          v-if="inputStreamStatus.running"
          class="input-status-line"
          role="status"
          aria-live="polite"
        >
          <span class="input-status-label">Active input:</span>
          <span>{{ formatSampleRate(inputStreamStatus.sampleRate) }}</span>
          <span class="input-status-sep">·</span>
          <span>{{ formatBufferFrames(inputStreamStatus) }}</span>
        </div>
        <PitchTestMode />
      </div>
    </div>
    <div class="actions">
      <BaseButton
        class="apply-button"
        variant="filled-accent"
        size="sm"
        type="button"
        @click="handleApply"
      >
        Apply
      </BaseButton>
      <div
        v-if="applySuccess"
        class="apply-success"
      >
        <Check />
        Applied
      </div>
    </div>
    <div class="settings-section">
      <button
        class="section-header"
        type="button"
        @click="toggleBackup"
      >
        <span>Backup &amp; Restore</span>
        <ChevronDown
          class="chevron"
          :class="{ open: backupOpen }"
        />
      </button>
      <div
        v-if="backupOpen"
        class="section-body"
      >
        <div class="field-row field-row--compact">
          <span>Include Tab Files</span>
          <SettingsSwitch
            v-model="backupIncludeTabs"
            aria-label="Include tab files in backup"
          />
        </div>
        <div class="field-row field-row--compact">
          <span>Include Audio Files</span>
          <SettingsSwitch
            v-model="backupIncludeAudio"
            aria-label="Include audio files in backup"
          />
        </div>
        <div class="backup-actions">
          <BaseButton
            variant="ghost"
            size="sm"
            type="button"
            :disabled="backupState !== 'idle'"
            @click="handleImportBackup"
          >
            Import Backup
          </BaseButton>
          <BaseButton
            variant="filled-accent"
            size="sm"
            type="button"
            :disabled="backupState !== 'idle'"
            @click="handleExportBackup"
          >
            Export Backup
          </BaseButton>
        </div>
        <p
          v-if="backupMessage"
          class="backup-status"
        >
          {{ backupMessage }}
        </p>
      </div>
    </div>
    <div class="settings-section">
      <button
        class="section-header"
        type="button"
        @click="toggleShare"
      >
        <span>Import Shared Content</span>
        <ChevronDown
          class="chevron"
          :class="{ open: shareOpen }"
        />
      </button>
      <div
        v-if="shareOpen"
        class="section-body"
      >
        <div class="field-row">
          <span>Import shared plans or exercises</span>
          <BaseButton
            variant="filled-accent"
            size="sm"
            type="button"
            :disabled="shareImportState === 'importing'"
            class="share-import-button"
            aria-label="Import Shared Data"
            @click="handleShareImport"
          >
            <Download
              :size="18"
              aria-hidden="true"
            />
          </BaseButton>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <button
        class="section-header"
        type="button"
        @click="toggleJournaling"
      >
        <span>Journaling</span>
        <ChevronDown
          class="chevron"
          :class="{ open: journalingOpen }"
        />
      </button>
      <div
        v-if="journalingOpen"
        class="section-body"
      >
        <div class="journaling-row">
          <div class="journaling-copy">
            <span class="journaling-title">Session journal</span>
            <span class="journaling-help">
              Prompt for a session goal when you start the timer, then surface a
              review overlay from the timer. Disable if you'd rather keep the
              bottom bar quiet.
            </span>
          </div>
          <SettingsSwitch
            :model-value="appStore.journalingEnabled"
            aria-label="Toggle session journaling"
            @update:model-value="appStore.setJournalingEnabled"
          />
        </div>
      </div>
    </div>
    <DialogRoot v-model:open="sharePlanDialogOpen">
      <DialogPortal>
        <DialogOverlay class="share-dialog-overlay">
          <DialogContent class="share-dialog">
            <DialogTitle class="share-dialog-title">
              Choose Plan
            </DialogTitle>
            <p class="share-dialog-text">
              Where should this exercise be added?
            </p>
            <label class="share-dialog-row share-dialog-row--stacked">
              <AppSelect
                trigger-class="share-dialog-select"
                content-class="share-dialog-select-content"
                aria-label="Choose plan"
                :options="sharePlanOptions"
                :model-value="sharePlanSelection"
                :display-value="sharePlanDisplay"
                :modal="false"
                :disable-outside-pointer-events="false"
                :portalled="false"
                @update:model-value="
                  (value) => {
                    sharePlanSelection = String(value);
                    sharePlanTouched = true;
                  }
                "
              />
            </label>
            <p class="share-dialog-note">
              Create new plan will add this exercise to a not timed plan named
              “Import”.
            </p>
            <div class="share-dialog-actions">
              <BaseButton
                variant="ghost"
                size="sm"
                type="button"
                @click="closeSharePlanDialog"
              >
                Cancel
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                type="button"
                @click="handleShareImportToNewPlan"
              >
                Create new plan
              </BaseButton>
              <BaseButton
                variant="filled-accent"
                size="sm"
                type="button"
                @click="confirmSharePlanSelection"
              >
                Import
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot
      :open="shareMissingDialogOpen"
      @update:open="handleShareMissingDialogOpen"
    >
      <DialogPortal>
        <DialogOverlay class="share-dialog-overlay">
          <DialogContent class="share-dialog">
            <DialogTitle class="share-dialog-title">
              Tab file missing
            </DialogTitle>
            <p class="share-dialog-text">
              Choose an option:
            </p>
            <div class="share-dialog-actions share-dialog-actions--stacked">
              <BaseButton
                variant="filled-accent"
                size="sm"
                type="button"
                @click="handleShareChooseFromLibrary"
              >
                Choose from Library
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                type="button"
                @click="handleShareLocateOnDisk"
              >
                Locate on Disk
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="shareLinkDialogOpen">
      <DialogPortal>
        <DialogOverlay class="link-dialog-overlay">
          <DialogContent class="link-dialog">
            <DialogTitle class="link-title">
              Choose Tab
            </DialogTitle>
            <div class="link-search-field">
              <Search
                class="link-search-icon"
                :size="16"
                aria-hidden="true"
              />
              <input
                v-model="shareLinkSearch"
                class="link-search"
                placeholder="Search Tab"
              >
            </div>
            <div class="link-list">
              <div class="link-list-content">
                <button
                  v-for="tab in shareLinkCandidates"
                  :key="tab.id"
                  class="link-row"
                  type="button"
                  @click="handleShareSelectLink(tab.id)"
                >
                  {{ tab.title }}
                </button>
              </div>
            </div>
            <div class="link-actions">
              <BaseButton
                class="link-close"
                variant="outline-accent"
                size="sm"
                type="button"
                @click="shareLinkDialogOpen = false"
              >
                Close
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <teleport to="body">
      <div
        v-if="backupError"
        class="backup-error-overlay"
        aria-modal="true"
        role="dialog"
        @click="closeBackupError"
      >
        <div
          class="backup-error-modal"
          @click.stop
        >
          <h2 class="backup-error-title">
            Backup error
          </h2>
          <p class="backup-error-message">
            {{ backupError }}
          </p>
          <div class="backup-error-actions">
            <BaseButton
              variant="filled-accent"
              size="sm"
              type="button"
              @click="closeBackupError"
            >
              OK
            </BaseButton>
          </div>
        </div>
      </div>
    </teleport>
  </section>
</template>

<style scoped>
:global(.main-content.main-content--settings) {
  padding: 28px clamp(20px, 4vw, 40px);
  scrollbar-gutter: stable both-edges;
}

.page-title {
  text-align: center;
  margin: 0;
}

.page {
  padding-left: 16px;
  padding-right: 16px;
}

.update-status {
  margin: 6px 0 0;
  color: var(--accent);
  font-size: 13px;
}

.update-current-version {
  color: var(--accent);
  font-weight: 600;
}

.backup-note {
  margin: 0 0 12px;
  color: var(--text-muted);
  font-size: 13px;
}

.backup-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  justify-content: flex-end;
}

.backup-status {
  margin: 10px 0 0;
  color: var(--accent);
  font-size: 13px;
  text-align: right;
}

.backup-error-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100005;
}

.backup-error-modal {
  width: min(460px, 90vw);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  color: var(--text);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.backup-error-title {
  margin: 0 0 10px;
  font-size: 18px;
}

.backup-error-message {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.5;
}

.backup-error-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.share-dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.share-dialog {
  position: relative;
  width: min(440px, 92vw);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
  display: grid;
  gap: 12px;
  overflow: visible;
  min-height: 250px;
}

.share-dialog :deep(.app-select-content) {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 10020;
}

.share-dialog-title {
  text-align: center;
  font-size: 1.05rem;
}

.share-dialog-text {
  margin: 0;
  text-align: center;
}

.share-dialog-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
}

.share-dialog-row--stacked {
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.share-dialog-checkbox {
  width: 16px;
  height: 16px;
}

.share-dialog-select {
  width: 100%;
}

.share-dialog-select-content {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 10020;
}

.share-dialog-note {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
  text-align: center;
}

.share-dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.share-dialog-actions--stacked {
  flex-direction: column;
  align-items: stretch;
}

.link-dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
}

.link-dialog {
  position: relative;
  width: min(520px, 90vw);
  height: min(70vh, 520px);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.link-title {
  text-align: center;
  font-size: 1.05rem;
}

.link-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0 12px 0 6px;
  box-sizing: border-box;
}

.link-search-icon {
  color: var(--text-muted);
  pointer-events: none;
}

.link-search {
  flex: 1;
  background: #0f141d;
  border: 1px solid var(--accent);
  border-radius: 10px;
  color: var(--text);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.95rem;
  height: 36px;
}

.link-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px 0 6px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) rgba(255, 255, 255, 0.12);
}

.link-list-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-row {
  display: flex;
  align-items: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-actions {
  display: flex;
  justify-content: flex-end;
}

.share-import-button.base-button {
  min-height: 32px;
  height: 32px;
  padding-block: 0;
}

.update-switch {
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  padding: 3px;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}

.update-switch[data-state='checked'] {
  background: color-mix(in srgb, var(--accent) 40%, rgba(255, 255, 255, 0.08));
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
}

.update-switch__thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #eef2f7;
  transform: translateX(0);
  transition: transform 150ms ease;
}

.update-switch[data-state='checked'] .update-switch__thumb {
  transform: translateX(20px);
}

.settings-section {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  display: grid;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: transparent;
  border: 0;
  color: var(--text);
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  padding: 4px 0;
}

.chevron {
  width: 18px;
  height: 18px;
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.section-body {
  display: grid;
  gap: 10px;
}

.journaling-row {
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: space-between;
}

.journaling-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.journaling-title {
  font-size: 0.95rem;
  color: var(--text);
}

.journaling-help {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.license-empty {
  display: grid;
  gap: 10px;
}

.license-text {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.license-active {
  display: grid;
  gap: 12px;
}

.license-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.license-status {
  color: var(--text);
  font-weight: 600;
}

.license-devices {
  display: grid;
  gap: 10px;
}

.license-device {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

.license-device-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.license-device-icon {
  color: var(--text);
}

.license-device-info {
  display: grid;
  gap: 2px;
}

.license-device-name {
  font-weight: 600;
}

.license-device-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.license-device-actions {
  display: grid;
  gap: 6px;
  justify-items: end;
  position: relative;
}

.license-revoke-confirm {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 6px);
  display: grid;
  gap: 6px;
  justify-items: center;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 140px;
  z-index: 5;
}

.license-revoke-confirm span {
  text-align: center;
}

.license-revoke-actions {
  display: inline-flex;
  gap: 8px;
  justify-content: center;
}

.license-revoke-confirm--up {
  top: auto;
  bottom: calc(100% + 6px);
}
.license-revoke-button.base-button {
  border: 1px solid rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.license-revoke-button.base-button:hover,
.license-revoke-button.base-button:focus-visible,
.license-revoke-button.base-button:active {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.license-revoke-trigger.base-button {
  border: 1px solid rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.license-revoke-trigger.base-button:hover,
.license-revoke-trigger.base-button:focus-visible,
.license-revoke-trigger.base-button:active {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.refresh-button.base-button :deep(svg) {
  flex-shrink: 0;
}

.license-refresh-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}

.license-refresh-icon.is-spinning {
  animation: spin 1s linear infinite;
}

.audio-refresh-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}

.audio-refresh-icon.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text);
}

.field-row--compact {
  align-items: center;
}

.field-row > span {
  font-size: 0.9rem;
}

.field-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.field-input {
  width: 72px;
  text-align: right;
  background: transparent;
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 6px 8px;
  height: 28px;
  color: var(--text);
  font-size: 0.95rem;
}

.field-input--wide {
  width: 56px;
  min-width: 56px;
}

:deep(.field-select.app-select-trigger) {
  min-width: 220px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 8px;
  height: 28px;
  color: var(--text);
  font-size: 0.95rem;
}

:deep(.field-select.app-select-trigger .app-select-value) {
  text-align: left;
}

:deep(.field-select--compact.app-select-trigger) {
  width: 56px;
  min-width: 56px;
}

:deep(.field-select--compact.app-select-trigger .app-select-value) {
  text-align: right;
}

:deep(.field-select--accent.app-select-trigger) {
  border-color: var(--accent);
}

.field-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.field-block {
  display: grid;
  gap: 6px;
  color: var(--text);
}

.field-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.field-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.4;
}

/* Diagnostic read-only line under the input device picker. Muted so
   it reads as info rather than an actionable control, with a tight
   font-feature-settings so the numeric figures line up cleanly. */
.input-status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  margin-top: -4px;
}

.input-status-label {
  font-weight: 600;
}

.input-status-sep {
  opacity: 0.5;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  align-items: center;
  gap: 10px;
}

.apply-button {
  padding-inline: 12px;
}

.apply-success {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: 0.85rem;
}

.apply-success :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
