<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePlayerStore } from '../../stores/player';
import { useMetronomeStore } from '../../stores/metronome';
import { useSongStore } from '../../stores/song';
import {
  COUNT_IN_OPTIONS,
  COUNT_IN_TOOLTIP,
  METRONOME_SYNC_TOOLTIP,
} from '../../domain/countIn';
import { SUBDIVISION_OPTIONS } from '../../services/metronomeConfigBuilder';
import IconMetronome from '../icons/IconMetronome.vue';
import IconHourglass from '../icons/IconHourglass.vue';
import ToggleButton from '../ui/ToggleButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import AppSelect from '../ui/AppSelect.vue';

const playerStore = usePlayerStore();
const metronomeStore = useMetronomeStore();
const songStore = useSongStore();

const isPlaying = computed(() => playerStore.model.playback === 'playing');
const hasSelection = computed(
  () => playerStore.model.currentLibraryItemId !== null || songStore.isLoaded,
);
const songOnlyNoBeatmap = computed(
  () =>
    songStore.isLoaded &&
    !playerStore.model.currentLibraryItemId &&
    !songStore.hasBeatmap,
);
const metronomeEnabled = computed(() => playerStore.metronomeEnabled);
const intervalModeActive = computed(() => metronomeStore.intervalModeEnabled);
const countInEnabled = computed(() => playerStore.countInEnabled);
const countInBars = computed(() => playerStore.countInBars);
const countInDisabled = computed(
  () =>
    !hasSelection.value || !metronomeEnabled.value || intervalModeActive.value,
);
const subdivisionsSelection = computed(() =>
  metronomeStore.subdivisionsEnabled
    ? String(metronomeStore.subdivisionsValue)
    : 'off',
);
const subdivisionsDisabled = computed(
  () => isPlaying.value || !metronomeEnabled.value || intervalModeActive.value,
);

const countInHover = ref(false);
const countInFocus = ref(false);
const countInCloseTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const isCountInOverlayOpen = computed(
  () => !countInDisabled.value && (countInHover.value || countInFocus.value),
);

function handleMetronome(): void {
  playerStore.toggleMetronome();
  // Sync metronome engine when toggled during song playback
  if (songStore.isPlaying) {
    void songStore.syncMetronomeToggle(playerStore.metronomeEnabled);
  }
}

function handleCountIn(): void {
  if (countInDisabled.value) {
    return;
  }
  playerStore.toggleCountIn();
}

function toggleCountInBar(value: number): void {
  if (countInDisabled.value) {
    return;
  }
  if (countInBars.value.includes(value)) {
    playerStore.setCountInBars([]);
    return;
  }
  playerStore.setCountInBars([value]);
}

function clearCountInClose(): void {
  if (countInCloseTimer.value) {
    clearTimeout(countInCloseTimer.value);
    countInCloseTimer.value = null;
  }
}

function scheduleCountInClose(closeFocus = false): void {
  clearCountInClose();
  countInCloseTimer.value = setTimeout(() => {
    countInHover.value = false;
    if (closeFocus) {
      countInFocus.value = false;
    }
  }, 150);
}

function handleCountInMouseEnter(): void {
  if (countInDisabled.value) {
    return;
  }
  clearCountInClose();
  countInHover.value = true;
}

function handleCountInMouseLeave(): void {
  scheduleCountInClose();
}

function handleCountInFocusIn(): void {
  if (countInDisabled.value) {
    return;
  }
  clearCountInClose();
  countInFocus.value = true;
}

function handleCountInFocusOut(): void {
  scheduleCountInClose(true);
}

function handleSubdivisionsChange(value: string | number): void {
  const next = String(value);
  if (next === 'off') {
    metronomeStore.setSubdivisions(false);
    return;
  }
  metronomeStore.setSubdivisions(
    true,
    Number(next) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  );
}

defineExpose({ clearCountInClose });
</script>

<template>
  <div class="metro-wrap">
    <div class="metro-group">
      <AppTooltip :text="METRONOME_SYNC_TOOLTIP">
        <ToggleButton
          class="control-button"
          data-guide="player.metronome"
          :disabled="!hasSelection || intervalModeActive || songOnlyNoBeatmap"
          :pressed="metronomeEnabled"
          aria-label="Metronome Sync"
          @click="handleMetronome"
        >
          <IconMetronome :size="24" />
        </ToggleButton>
      </AppTooltip>

      <AppTooltip :text="COUNT_IN_TOOLTIP">
        <div
          class="countin-trigger"
          @mouseenter="handleCountInMouseEnter"
          @mouseleave="handleCountInMouseLeave"
          @focusin="handleCountInFocusIn"
          @focusout="handleCountInFocusOut"
        >
          <ToggleButton
            class="control-button"
            :disabled="countInDisabled"
            :pressed="countInEnabled"
            aria-label="Count In"
            @click="handleCountIn"
          >
            <IconHourglass :size="24" />
          </ToggleButton>
        </div>
      </AppTooltip>

      <div
        v-if="isCountInOverlayOpen"
        class="countin-overlay"
        @mouseenter="handleCountInMouseEnter"
        @mouseleave="handleCountInMouseLeave"
      >
        <div class="countin-options">
          <label
            v-for="option in COUNT_IN_OPTIONS"
            :key="option"
            class="countin-option"
          >
            <input
              type="checkbox"
              :checked="countInBars.includes(option)"
              @change="toggleCountInBar(option)"
            >
            <span>{{ option }}</span>
          </label>
        </div>
        <span class="countin-label">Bars</span>
      </div>

      <AppTooltip
        text="Subdivisions"
        side="bottom"
        :side-offset="6"
        portal-to=".app-overlays"
      >
        <div class="subdivision-tooltip-wrap">
          <AppSelect
            trigger-class="subdivision-select"
            data-testid="subdivision-select"
            content-class="subdivision-select-content"
            portal-to=".app-overlays"
            :model-value="subdivisionsSelection"
            :options="SUBDIVISION_OPTIONS"
            :disabled="subdivisionsDisabled"
            :class="{
              active: subdivisionsSelection !== 'off' && !subdivisionsDisabled,
            }"
            side="top"
            aria-label="Subdivisions"
            @update:model-value="handleSubdivisionsChange"
          />
        </div>
      </AppTooltip>
    </div>
  </div>
</template>

<style scoped>
.metro-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.metro-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.control-button {
  width: 44px;
  height: 44px;
  padding: 0;
}

.countin-trigger {
  display: inline-flex;
}

.countin-overlay {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #131720;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  z-index: 140;
}

.countin-options {
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 10px;
}

.countin-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--text);
}

.countin-option input {
  accent-color: var(--accent);
}

.countin-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

:deep(.subdivision-select.app-select-trigger) {
  height: 32px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 0.9rem;
}

:deep(.subdivision-select.app-select-trigger .app-select-value) {
  text-align: center;
}

:deep(.subdivision-select-content.app-select-content) {
  z-index: 3000;
  pointer-events: auto;
}

.subdivision-select.active {
  border-color: var(--accent);
}

.subdivision-tooltip-wrap {
  display: inline-flex;
}

.subdivision-select:disabled {
  opacity: 0.5;
}

.subdivision-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
