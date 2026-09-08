<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '../../stores/player';
import { useSongStore } from '../../stores/song';
import AccentSlider from '../ui/AccentSlider.vue';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';

defineProps<{
  status: string;
}>();

const emit = defineEmits<{
  'update:overlay-lock': [];
}>();

const playerStore = usePlayerStore();
const songStore = useSongStore();

const isOpen = ref(false);

const volumeValue = computed(() => Math.round(playerStore.volume * 100));
const masterVolumeValue = computed(() =>
  Math.round(playerStore.masterVolume * 100),
);
const metronomeVolumeValue = computed(() =>
  Math.round(playerStore.metronomeVolume),
);
function toggle(): void {
  isOpen.value = !isOpen.value;
  emit('update:overlay-lock');
}

function close(): void {
  isOpen.value = false;
  emit('update:overlay-lock');
}

function handleVolumeValue(value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  playerStore.setVolume(value / 100);
}

function handleMetronomeVolumeValue(value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  playerStore.setMetronomeVolume(value);
}

function handleMasterVolumeValue(value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  playerStore.setMasterVolume(value / 100);
}

const songVolumeValue = computed(() => Math.round(songStore.volume * 100));

function handleSongVolumeValue(value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  void songStore.setVolume(value / 100);
}

defineExpose({ isOpen, close });
</script>

<template>
  <div class="volume-row">
    <AppTooltip text="Volume">
      <BaseButton
        class="volume-trigger"
        variant="ghost"
        size="sm"
        type="button"
        data-guide="player.volume"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
        @click="toggle"
      >
        Volume
      </BaseButton>
    </AppTooltip>
    <div
      v-if="isOpen"
      class="track-overlay volume-overlay"
    >
      <div class="volume-menu-list">
        <div class="volume-menu-row volume-menu-row--master">
          <span class="label">Master</span>
          <AccentSlider
            class="volume-slider"
            :model-value="masterVolumeValue"
            :max="100"
            :disabled="status === 'loading'"
            @update:model-value="handleMasterVolumeValue"
          />
          <span class="volume-value">{{ masterVolumeValue }}%</span>
        </div>
        <div class="volume-menu-row volume-menu-row--channel">
          <span class="label">Metronome</span>
          <AccentSlider
            class="volume-slider"
            :model-value="metronomeVolumeValue"
            :max="100"
            :disabled="status === 'loading'"
            @update:model-value="handleMetronomeVolumeValue"
          />
          <span class="volume-value">{{ metronomeVolumeValue }}%</span>
        </div>
        <div class="volume-menu-row volume-menu-row--channel">
          <span class="label">Tab</span>
          <AccentSlider
            class="volume-slider"
            :model-value="volumeValue"
            :max="100"
            :disabled="status === 'loading'"
            @update:model-value="handleVolumeValue"
          />
          <span class="volume-value">{{ volumeValue }}%</span>
        </div>
        <div
          v-if="songStore.isLoaded"
          class="volume-menu-row volume-menu-row--channel"
        >
          <span class="label">Song</span>
          <AccentSlider
            class="volume-slider"
            :model-value="songVolumeValue"
            :max="100"
            @update:model-value="handleSongVolumeValue"
          />
          <span class="volume-value">{{ songVolumeValue }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.volume-row {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.volume-trigger {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}

.track-overlay.volume-overlay {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  left: auto;
  width: min(360px, calc(100vw - 24px));
  min-width: min(280px, calc(100vw - 24px));
  background: #131720;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  /* Above the NoteResultOverlay canvas (z-index 1001) so the
     feedback bar doesn't paint over the open dropdown. */
  z-index: 1100;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.volume-menu-list {
  display: grid;
  gap: 6px;
}

.volume-menu-row {
  display: grid;
  grid-template-columns: 72px minmax(120px, 1fr) 52px;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 44px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.volume-menu-row--master {
  grid-template-columns: 72px minmax(140px, 1fr) 52px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  margin-bottom: 4px;
  padding-bottom: 12px;
}

.volume-menu-row--channel {
  grid-template-columns: 72px minmax(120px, 1fr) 52px;
}

.volume-menu-row .label {
  width: auto;
  flex-shrink: 1;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.volume-slider {
  flex: 1 1 auto;
  min-width: 120px;
  width: auto;
}

.volume-menu-row--master .volume-slider {
  min-width: 140px;
}

.volume-menu-row--channel .volume-slider {
  min-width: 140px;
  max-width: 180px;
}

.volume-value {
  min-width: 42px;
  text-align: right;
  color: var(--text-muted);
}
</style>
