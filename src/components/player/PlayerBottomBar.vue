<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePlayerStore } from '../../stores/player';
import { useMetronomeStore } from '../../stores/metronome';
import { useSongStore } from '../../stores/song';
import { useBeatmapStore } from '../../stores/beatmap';
import { bpmDeltaFromKey } from '../../domain/player';
import IconMenuMetronome from '../icons/IconMenuMetronome.vue';
import PlayerWarningDialog from './PlayerWarningDialog.vue';
import TransportControls from './TransportControls.vue';
import MetronomeControls from './MetronomeControls.vue';
import ShortcutsHelpMenu from './ShortcutsHelpMenu.vue';
import BottomBarTimer from './BottomBarTimer.vue';
import AppTooltip from '../ui/AppTooltip.vue';

const emit = defineEmits<{
  stop: [];
}>();

const playerStore = usePlayerStore();
const metronomeStore = useMetronomeStore();
const songStore = useSongStore();
const beatmapStore = useBeatmapStore();

const status = computed(() => playerStore.model.status);
const isPlaying = computed(
  () => playerStore.model.playback === 'playing' || songStore.isPlaying,
);
const hasSelection = computed(
  () => playerStore.model.currentLibraryItemId !== null,
);
const songOnlyMode = computed(
  () => songStore.isLoaded && !playerStore.model.currentLibraryItemId,
);
const intervalModeActive = computed(() => metronomeStore.intervalModeEnabled);

const bpmInput = ref('');
const tempoUnsupportedDialogOpen = ref(false);
const audioTrackUnsupportedDialogOpen = ref(false);
const currentBpm = computed(() => playerStore.model.currentBpm);

/** Base BPM from the song beatmap (for speed factor calculation) */
const songBaseBpm = computed(() => {
  if (!songStore.loadedItemId) return null;
  const entry = beatmapStore.getEntry(songStore.loadedItemId);
  if (!entry?.beatmap?.timeEvents?.length) return null;
  return entry.beatmap.timeEvents[0].bpm;
});

/** True if the song beatmap has tempo change events (>1 time event) */
const songHasTempoChanges = computed(() => {
  if (!songStore.loadedItemId) return false;
  const entry = beatmapStore.getEntry(songStore.loadedItemId);
  return (entry?.beatmap?.timeEvents?.length ?? 0) > 1;
});

const displayBpm = computed(() => {
  if (songOnlyMode.value && songBaseBpm.value !== null) {
    return Math.round(songBaseBpm.value * songStore.speed);
  }
  if (hasSelection.value && currentBpm.value !== null) {
    return currentBpm.value;
  }
  return metronomeStore.bpm;
});
const bpmInputLockedForSource = computed(
  () => hasSelection.value && playerStore.playbackSource === 'practice',
);
const hasBpmControl = computed(
  () =>
    hasSelection.value || (songOnlyMode.value && songBaseBpm.value !== null),
);
const bpmTooltip = computed(() =>
  songOnlyMode.value ? 'Change Song BPM' : 'Change Tab BPM',
);

function handleUnsupportedTempoChangeInPlayer(): boolean {
  if (!hasSelection.value || !playerStore.hasLoadedTabTempoChanges()) {
    return false;
  }
  tempoUnsupportedDialogOpen.value = true;
  return true;
}

watch(
  () => playerStore.unsupportedAudioTrackNoticeToken,
  (next, previous) => {
    if (next > previous) {
      audioTrackUnsupportedDialogOpen.value = true;
    }
  },
);

function commitBpm(): void {
  const inputEl = document.activeElement;
  if (
    inputEl instanceof HTMLInputElement &&
    inputEl.classList.contains('bpm-input')
  ) {
    bpmInput.value = inputEl.value;
  }
  if (songOnlyMode.value && songBaseBpm.value !== null) {
    if (songHasTempoChanges.value) {
      tempoUnsupportedDialogOpen.value = true;
      bpmInput.value = String(displayBpm.value);
      return;
    }
    const parsed = Number.parseInt(bpmInput.value, 10);
    if (!Number.isFinite(parsed)) {
      bpmInput.value = String(displayBpm.value);
      return;
    }
    const factor = parsed / songBaseBpm.value;
    void songStore.setSpeed(factor);
    metronomeStore.setBpm(parsed);
    bpmInput.value = String(displayBpm.value);
    return;
  }
  if (handleUnsupportedTempoChangeInPlayer()) {
    bpmInput.value = String(displayBpm.value);
    return;
  }
  const parsed = Number.parseInt(bpmInput.value, 10);
  if (!Number.isFinite(parsed)) {
    bpmInput.value = String(displayBpm.value);
    return;
  }
  metronomeStore.setBpm(parsed);
  if (playerStore.model.baseBpm !== null) {
    playerStore.setBpm(parsed);
  }
  bpmInput.value = String(displayBpm.value);
}

function handleBpmKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.code === 'NumpadEnter') {
    event.preventDefault();
    event.stopPropagation();
    commitBpm();
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      target.blur();
    }
    return;
  }
  const delta = bpmDeltaFromKey(event.key, event.shiftKey);
  if (delta === null) {
    return;
  }
  event.preventDefault();
  if (songOnlyMode.value && songBaseBpm.value !== null) {
    if (songHasTempoChanges.value) {
      bpmInput.value = String(displayBpm.value);
      return;
    }
    const next = displayBpm.value + delta;
    const factor = next / songBaseBpm.value;
    void songStore.setSpeed(factor);
    metronomeStore.setBpm(next);
    bpmInput.value = String(displayBpm.value);
    return;
  }
  if (handleUnsupportedTempoChangeInPlayer()) {
    bpmInput.value = String(displayBpm.value);
    return;
  }
  const next = displayBpm.value + delta;
  metronomeStore.setBpm(next);
  if (playerStore.model.baseBpm !== null) {
    playerStore.setBpm(next);
  }
  bpmInput.value = String(displayBpm.value);
}

function handleBpmEnter(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  commitBpm();
}

function handleTempoWarningClose(): void {
  tempoUnsupportedDialogOpen.value = false;
  // Unload song if the warning was triggered in song-only mode
  if (songOnlyMode.value) {
    void songStore.unload();
  }
}

watch(displayBpm, () => {
  bpmInput.value = String(displayBpm.value);
});
</script>

<template>
  <div class="bottom-bar">
    <div class="bottom-left">
      <ShortcutsHelpMenu :disabled="isPlaying" />
      <BottomBarTimer />
      <AppTooltip
        v-if="intervalModeActive"
        text="Interval Mode Active"
        side="top"
        :side-offset="8"
        portal-to=".app-overlays"
      >
        <span
          class="interval-mode-indicator"
          aria-label="Interval Mode Active"
        >
          <IconMenuMetronome
            :size="20"
            aria-hidden="true"
          />
        </span>
      </AppTooltip>
    </div>
    <div class="bottom-center">
      <TransportControls @stop="emit('stop')" />
      <MetronomeControls />
    </div>
    <div class="bottom-right">
      <AppTooltip
        :text="bpmTooltip"
        side="bottom"
        :side-offset="6"
        portal-to=".app-overlays"
      >
        <label class="tempo">
          <input
            class="bpm-input"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            data-guide="player.bpm"
            :value="bpmInput"
            :disabled="
              (!hasBpmControl && !hasSelection) ||
                status === 'loading' ||
                isPlaying ||
                bpmInputLockedForSource ||
                intervalModeActive
            "
            placeholder="--"
            @input="bpmInput = ($event.target as HTMLInputElement).value"
            @change="commitBpm"
            @keydown="handleBpmKeydown"
            @keydown.enter.prevent.stop="handleBpmEnter"
            @keyup.enter="handleBpmEnter"
            @blur="commitBpm"
          >
          <span class="bpm-suffix">BPM</span>
        </label>
      </AppTooltip>
    </div>
  </div>

  <PlayerWarningDialog
    :open="tempoUnsupportedDialogOpen"
    title-id="tempo-warning-title"
    title="Tempo Change Not Supported"
    message="Changing the tempo of a file that contains tempo changes is not supported. It is advised to split the file and practice each section separately."
    button-text="I Understand"
    @close="handleTempoWarningClose"
  />
  <PlayerWarningDialog
    :open="audioTrackUnsupportedDialogOpen"
    title-id="audio-track-warning-title"
    title="Audio Tracks Not Supported"
    message="PracticeTab does not support tab files with attached audio tracks. This can lead to unexpected behavior. Please remove the attached audio track from your tab file."
    @close="audioTrackUnsupportedDialogOpen = false"
  />
</template>

<style scoped>
.bottom-bar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 70;
  border-top: 1px solid var(--border);
  height: var(--controls-bar-height, 72px);
  padding: 12px 16px;
  background: #13151c;
  backdrop-filter: blur(6px);
  border-radius: 10px;
}

.bottom-left {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: start;
}

.interval-mode-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.bottom-center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  justify-self: center;
}

.bottom-right {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-self: end;
}

.tempo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: auto;
}

.bpm-input {
  width: 46px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
  font-size: 0.9rem;
  text-align: right;
}

.bpm-input:not(:disabled) {
  border-color: var(--accent);
}

.bpm-suffix {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.bpm-input:disabled {
  opacity: 0.5;
}

.bpm-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
