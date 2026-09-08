<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore, type TrackMixState } from '../../stores/player';
import { alphatabPlayer } from '../../services/alphatabPlayer';
import AccentSlider from '../ui/AccentSlider.vue';
import BaseButton from '../ui/BaseButton.vue';
import ToggleButton from '../ui/ToggleButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';

defineProps<{
  intervalModeActive: boolean;
}>();

const emit = defineEmits<{
  'update:overlay-lock': [];
}>();

const playerStore = usePlayerStore();

const isOpen = ref(false);

const tracks = computed(() => playerStore.tracks);
const trackMix = computed(() => playerStore.trackMix);
const activeTrackId = computed(() => playerStore.activeTrackId);
const supportsTrackMute = computed(() => alphatabPlayer.supportsTrackMute);
const supportsTrackSolo = computed(() => alphatabPlayer.supportsTrackSolo);
const supportsTrackVolume = computed(() => alphatabPlayer.supportsTrackVolume);
const mixerSupported = computed(
  () =>
    supportsTrackMute.value ||
    supportsTrackSolo.value ||
    supportsTrackVolume.value,
);

function getTrackMixState(trackId: string): TrackMixState {
  return (
    trackMix.value[trackId] ?? {
      mute: false,
      solo: false,
      listen: false,
      volume: 80,
    }
  );
}

function open(): void {
  isOpen.value = true;
  emit('update:overlay-lock');
}

function close(): void {
  isOpen.value = false;
  emit('update:overlay-lock');
}

function toggle(): void {
  if (isOpen.value) {
    close();
    return;
  }
  open();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close();
  }
}

function handleTrackMute(trackId: string): void {
  const mix = getTrackMixState(trackId);
  playerStore.setTrackMute(trackId, !mix.mute);
}

function handleTrackSolo(trackId: string): void {
  playerStore.toggleTrackSolo(trackId);
}

function handleTrackListen(trackId: string): void {
  playerStore.toggleListenForTrack(trackId);
}

function handleTrackVolumeValue(trackId: string, value: number): void {
  playerStore.setTrackVolume(trackId, value);
}

defineExpose({ isOpen, close });
</script>

<template>
  <div class="track-control">
    <AppTooltip text="Open Track Manager">
      <BaseButton
        class="track-trigger"
        variant="ghost"
        size="sm"
        type="button"
        data-guide="player.track"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
        @click="toggle"
        @keydown="handleKeydown"
      >
        Track
      </BaseButton>
    </AppTooltip>
    <div
      v-if="isOpen"
      class="track-overlay track-menu track-menu--wide"
    >
      <div
        v-if="!mixerSupported"
        class="mixer-note"
      >
        Mixer controls not supported yet.
      </div>
      <div class="track-menu-list">
        <div
          v-for="track in tracks"
          :key="track.id"
          class="track-row"
          :class="{
            active: activeTrackId === track.id,
            listen: getTrackMixState(track.id).listen,
          }"
        >
          <BaseButton
            class="track-name-button"
            variant="ghost"
            size="sm"
            type="button"
            @click="playerStore.selectOnlyTrack(track.id)"
          >
            {{ track.name }}
          </BaseButton>
          <ToggleButton
            class="mix-toggle mix-toggle--listen"
            :class="{
              'mix-toggle--listen-active': getTrackMixState(track.id).listen,
            }"
            size="sm"
            :pressed="getTrackMixState(track.id).listen"
            aria-label="Listen to track"
            @click="handleTrackListen(track.id)"
          >
            L
          </ToggleButton>
          <ToggleButton
            class="mix-toggle mix-toggle--mute"
            :class="{
              'mix-toggle--mute-active': getTrackMixState(track.id).mute,
            }"
            size="sm"
            :pressed="getTrackMixState(track.id).mute"
            aria-label="Mute track"
            :disabled="!supportsTrackMute || intervalModeActive"
            @click="handleTrackMute(track.id)"
          >
            M
          </ToggleButton>
          <ToggleButton
            class="mix-toggle mix-toggle--solo"
            :class="{
              'mix-toggle--solo-active': getTrackMixState(track.id).solo,
            }"
            size="sm"
            :pressed="getTrackMixState(track.id).solo"
            aria-label="Solo track"
            :disabled="!supportsTrackSolo || intervalModeActive"
            @click="handleTrackSolo(track.id)"
          >
            S
          </ToggleButton>
          <div class="mix-slider">
            <span class="mix-label">Vol</span>
            <AccentSlider
              class="mix-slider-control"
              :model-value="getTrackMixState(track.id).volume"
              :disabled="!supportsTrackVolume || intervalModeActive"
              @update:model-value="handleTrackVolumeValue(track.id, $event)"
            />
          </div>
          <span class="mix-value">
            {{ getTrackMixState(track.id).volume }}%
          </span>
        </div>
        <div
          v-if="tracks.length === 0"
          class="muted"
        >
          No tracks loaded.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.track-control {
  /* NO `z-index` here. Setting one turns `.track-control` into a
     stacking context capped at that z-index relative to siblings —
     which traps the `.track-overlay` (z-index: 1100) below
     AlphaTab's playback cursor (z-index: 1000 but in the
     document's root stacking context). Leaving the container
     without z-index lets the overlay's 1100 apply at document
     level, so it reliably paints above the cursor. */
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.track-trigger {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}

.muted {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.track-overlay {
  position: absolute;
  top: 100%;
  left: 0;
  width: 760px;
  max-width: calc(100vw - 24px);
  z-index: 50;
  pointer-events: auto;
}

.track-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 760px;
  min-width: 760px;
  max-width: calc(100vw - 24px);
  --track-menu-max-height: min(
    60vh,
    520px,
    calc(100vh - var(--controls-bar-height, 72px) - 140px)
  );
  --mix-slider-width: clamp(120px, 16vw, 180px);
  background: #131720;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  /* Above the NoteResultOverlay canvas (z-index 1001). */
  z-index: 1100;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.mixer-note {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.track-menu-list {
  display: grid;
  gap: 6px;
  max-height: calc(var(--track-menu-max-height) - 56px);
  overflow: auto;
  min-height: 0;
  position: relative;
  pointer-events: auto;
  z-index: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}

.track-menu-list::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.track-menu-list::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 8px;
}

.track-menu-list::-webkit-scrollbar-thumb:hover {
  background: var(--accent);
}

.track-menu-list::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 8px;
}

.track-row {
  display: grid;
  grid-template-columns: 1fr 40px 40px 40px 180px 56px;
  gap: 10px;
  align-items: center;
  padding: 10px;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  position: relative;
  pointer-events: auto;
  z-index: 2;
}

.track-row.active {
  border-color: rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 3px 0 0 rgba(255, 255, 255, 0.45);
}

.track-row.listen {
  background: rgba(255, 255, 255, 0.22);
}

.track-name-button {
  border: none;
  padding: 0;
  height: auto;
  justify-content: flex-start;
  text-align: left;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  pointer-events: auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mix-toggle {
  width: 40px;
  height: 40px;
  padding: 0;
  font-size: 0.7rem;
  pointer-events: auto;
}

.mix-toggle--mute-active.pressed {
  border-color: #ff6b6b;
  color: #ff6b6b;
}

.mix-toggle--solo-active.pressed {
  border-color: #ffd166;
  color: #ffd166;
}

.mix-toggle--listen-active.pressed {
  border-color: #ff9f43;
  color: #ff9f43;
}

.mix-slider {
  display: grid;
  grid-template-columns: auto 180px;
  gap: 8px;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.7rem;
  pointer-events: auto;
}

.mix-slider-control {
  width: 100%;
  pointer-events: auto;
}

.mix-value {
  font-size: 0.7rem;
  color: var(--text-muted);
  min-width: 32px;
  text-align: right;
  pointer-events: auto;
}

@media (max-width: 640px) {
  .track-menu {
    width: calc(100vw - 24px);
    min-width: 360px;
  }
}
</style>
