<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '../../stores/player';
import { useMetronomeStore } from '../../stores/metronome';
import { useSongStore } from '../../stores/song';
import IconLoop from '../icons/IconLoop.vue';
import IconCrosshair from '../icons/IconCrosshair.vue';
import IconButton from '../ui/IconButton.vue';
import ToggleButton from '../ui/ToggleButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';

const emit = defineEmits<{
  stop: [];
}>();

const playerStore = usePlayerStore();
const metronomeStore = useMetronomeStore();
const songStore = useSongStore();

const status = computed(() => playerStore.model.status);
const playback = computed(() => playerStore.model.playback);
const songLoaded = computed(() => songStore.isLoaded);
const canPlay = computed(() => status.value === 'ready' || songLoaded.value);
const canPause = computed(
  () =>
    (status.value === 'ready' && playback.value === 'playing') ||
    songStore.isPlaying,
);
const canStop = computed(() => status.value === 'ready' || songLoaded.value);
const hasSelection = computed(
  () => playerStore.model.currentLibraryItemId !== null || songLoaded.value,
);
const isLoopEnabled = computed(() => playerStore.isLoopEnabled);
const autoFollowEnabled = computed(() => playerStore.autoFollowEnabled);
const intervalModeActive = computed(() => metronomeStore.intervalModeEnabled);
const songOnlyMode = computed(
  () => songLoaded.value && !playerStore.model.currentLibraryItemId,
);
const songIsPlaying = computed(() => songStore.isPlaying);

function handlePlay(): void {
  if (songLoaded.value) {
    void songStore.play();
  }
  if (playerStore.model.currentLibraryItemId) {
    playerStore.play();
  }
}

function handlePause(): void {
  if (songLoaded.value) {
    void songStore.pause();
  }
  if (playerStore.model.currentLibraryItemId) {
    playerStore.pause();
  }
}

function handleLoopToggle(): void {
  if (!hasSelection.value) {
    return;
  }
  // Song loaded → always toggle song repeat
  if (songLoaded.value) {
    songStore.toggleRepeat();
  }
  // Tab loaded → also toggle tab loop
  if (playerStore.model.currentLibraryItemId) {
    playerStore.toggleLoop();
  }
}

function handleAutoFollowToggle(): void {
  playerStore.toggleAutoFollow();
}
</script>

<template>
  <div class="control-row">
    <AppTooltip text="Play">
      <IconButton
        class="control-button"
        data-guide="player.play"
        :disabled="
          !hasSelection || !canPlay || intervalModeActive || songIsPlaying
        "
        :class="{ active: playback === 'playing' || songStore.isPlaying }"
        aria-label="Play"
        @click="handlePlay"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polygon points="7 5 19 12 7 19 7 5" />
        </svg>
      </IconButton>
    </AppTooltip>
    <AppTooltip text="Pause">
      <IconButton
        class="control-button"
        data-guide="player.pause"
        :disabled="!hasSelection || !canPause || intervalModeActive"
        :class="{ active: playback === 'paused' }"
        aria-label="Pause"
        @click="handlePause"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line
            x1="9"
            y1="5"
            x2="9"
            y2="19"
          />
          <line
            x1="15"
            y1="5"
            x2="15"
            y2="19"
          />
        </svg>
      </IconButton>
    </AppTooltip>
    <AppTooltip text="Stop">
      <IconButton
        class="control-button"
        data-guide="player.stop"
        :disabled="!hasSelection || !canStop || intervalModeActive"
        aria-label="Stop"
        @click="emit('stop')"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect
            x="7"
            y="7"
            width="10"
            height="10"
            rx="1"
          />
        </svg>
      </IconButton>
    </AppTooltip>
    <AppTooltip text="Loop File">
      <ToggleButton
        class="control-button"
        data-guide="player.loop"
        :disabled="!hasSelection || intervalModeActive"
        :pressed="songLoaded ? songStore.repeatEnabled : isLoopEnabled"
        aria-label="Loop File"
        @click="handleLoopToggle"
      >
        <IconLoop />
      </ToggleButton>
    </AppTooltip>
    <AppTooltip text="Toggle Auto-follow">
      <ToggleButton
        class="control-button"
        :disabled="!hasSelection || intervalModeActive || songOnlyMode"
        :pressed="autoFollowEnabled"
        aria-label="Auto-follow"
        @click="handleAutoFollowToggle"
      >
        <IconCrosshair />
      </ToggleButton>
    </AppTooltip>
  </div>
</template>

<style scoped>
.control-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-button {
  width: 44px;
  height: 44px;
  padding: 0;
}

.control-button :deep(svg) {
  width: 24px;
  height: 24px;
}

.control-button.active {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}
</style>
