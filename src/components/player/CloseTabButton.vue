<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '../../stores/player';
import { useSongStore } from '../../stores/song';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';

defineProps<{
  intervalModeActive: boolean;
}>();

const playerStore = usePlayerStore();
const songStore = useSongStore();

const isPlaying = computed(
  () => playerStore.model.playback === 'playing' || songStore.isPlaying,
);
const hasAnythingLoaded = computed(
  () => playerStore.model.currentLibraryItemId !== null || songStore.isLoaded,
);

function handleClose(): void {
  const hasBoth =
    songStore.isLoaded && playerStore.model.currentLibraryItemId !== null;
  if (hasBoth) {
    // Dual mode: Close tab, reload song for clean state
    const songItemId = songStore.loadedItemId;
    playerStore.clearSelection();
    if (songItemId) {
      void songStore.unload().then(() => songStore.load(songItemId));
    }
    return;
  }
  // Single mode: close whatever is loaded
  if (songStore.isLoaded) {
    void songStore.unload();
  }
  if (playerStore.model.currentLibraryItemId) {
    playerStore.clearSelection();
  }
}
</script>

<template>
  <AppTooltip text="Close Tab">
    <BaseButton
      class="close-tab-button"
      size="sm"
      type="button"
      :disabled="!hasAnythingLoaded || isPlaying || intervalModeActive"
      @click="handleClose"
    >
      Close
    </BaseButton>
  </AppTooltip>
</template>

<style scoped>
.close-tab-button.base-button {
  border: 1px solid rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.close-tab-button.base-button:hover,
.close-tab-button.base-button:focus-visible,
.close-tab-button.base-button:active {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.close-tab-button.base-button:disabled {
  border-color: rgba(255, 107, 107, 0.35);
  color: rgba(255, 138, 138, 0.45);
}
</style>
