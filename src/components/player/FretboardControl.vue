<script setup lang="ts">
/**
 * Top-bar trigger for the Fretboard Panel (PR 4.2). Pattern mirrors
 * `DisplayControl` / `TrackControl`: ghost button with an
 * AppTooltip, emits `update:overlay-lock` so the parent can run
 * its close-all coordination, and a `close()` / `isOpen` pair for
 * `defineExpose` parity with the other top-bar controls.
 *
 * Difference from the other controls: this button does NOT own the
 * panel. The panel is mounted by PlayerPanel.vue outside the top
 * bar because it's wider than a dropdown and needs to overlay the
 * score area. Clicking here only flips `playerStore.fretboardOpen`.
 *
 * The disabled gate has two layers:
 *  1. No tab loaded → hard-disabled (empty state).
 *  2. Track is percussion, tuning-less, or outside the GM
 *     guitar/bass program range → soft-disabled with an
 *     explanatory tooltip. Fretboard views don't make sense for
 *     drum kits or keyboard staves.
 */
import { computed } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import { usePlayerStore } from '../../stores/player';

const emit = defineEmits<{
  'update:overlay-lock': [];
}>();

const playerStore = usePlayerStore();

/** Mirrors the other controls' public `isOpen` contract so
 *  PlayerPanel's `closeAllOverlays` / `isAnyOverlayOpen` helpers
 *  can treat this control the same way as the rest. */
const isOpen = computed(() => playerStore.fretboardOpen);

const hasLoadedTab = computed(() =>
  Boolean(playerStore.model.currentLibraryItemId),
);

const activeTrack = computed(
  () =>
    playerStore.tracks.find((t) => t.id === playerStore.activeTrackId) ?? null,
);

/** GM program ranges: 24-31 = guitar family, 32-39 = bass family.
 *  Anything outside gets the "not a fretted instrument" tooltip. */
function programIsFretted(program: number | undefined): boolean {
  if (typeof program !== 'number') return true; // unknown → don't block
  if (program >= 24 && program <= 39) return true;
  return false;
}

const isFrettedTrack = computed(() => {
  const track = activeTrack.value;
  if (!track) return false;
  if (track.isPercussion) return false;
  const tuning = track.tuning;
  if (!Array.isArray(tuning) || tuning.length === 0) return false;
  if (!programIsFretted(track.program)) return false;
  return true;
});

const disabled = computed(() => !hasLoadedTab.value || !isFrettedTrack.value);

const tooltip = computed(() => {
  if (!hasLoadedTab.value) return 'Load a tab to show the fretboard';
  if (!isFrettedTrack.value) return 'Not a fretted instrument';
  return isOpen.value ? 'Hide fretboard' : 'Show fretboard (current chord)';
});

function toggle(): void {
  if (disabled.value) return;
  playerStore.setFretboardOpen(!isOpen.value);
  emit('update:overlay-lock');
}

function close(): void {
  if (!isOpen.value) return;
  playerStore.setFretboardOpen(false);
  emit('update:overlay-lock');
}

defineExpose({ isOpen, close });
</script>

<template>
  <div class="fretboard-control">
    <AppTooltip :text="tooltip">
      <BaseButton
        class="fretboard-trigger"
        variant="ghost"
        size="sm"
        type="button"
        :aria-pressed="isOpen"
        :disabled="disabled"
        @click="toggle"
      >
        Fretboard
      </BaseButton>
    </AppTooltip>
  </div>
</template>

<style scoped>
.fretboard-control {
  /* NO `z-index` here. See the identical comment in TrackControl
     — setting one traps child overlays under AlphaTab's cursor
     layer. The Fretboard Panel lives outside this container
     anyway (mounted by PlayerPanel.vue), but keeping the no-z
     discipline on every top-bar container prevents future regression. */
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.fretboard-trigger {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}
</style>
