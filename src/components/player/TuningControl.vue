<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '../../stores/player';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';

defineProps<{
  intervalModeActive: boolean;
}>();

const emit = defineEmits<{
  'update:overlay-lock': [];
}>();

const playerStore = usePlayerStore();

const isOpen = ref(false);

const tuningValue = computed(() => playerStore.tuning);
const tuningDisplay = computed(() => {
  if (tuningValue.value === 0) {
    return '0';
  }
  return tuningValue.value > 0
    ? `+${tuningValue.value}`
    : `${tuningValue.value}`;
});
const tuningActive = computed(() => tuningValue.value !== 0);

function toggle(): void {
  isOpen.value = !isOpen.value;
  emit('update:overlay-lock');
}

function close(): void {
  isOpen.value = false;
  emit('update:overlay-lock');
}

function handleStep(delta: number): void {
  playerStore.adjustTuning(delta);
}

defineExpose({ isOpen, close });
</script>

<template>
  <div class="tuning-control">
    <AppTooltip text="Adjust tuning">
      <BaseButton
        class="tuning-trigger"
        :class="{
          'is-active': tuningActive,
          'is-inactive': !tuningActive,
        }"
        variant="ghost"
        size="sm"
        type="button"
        :disabled="intervalModeActive"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
        @click="toggle"
      >
        Tuning
      </BaseButton>
    </AppTooltip>
    <div
      v-if="isOpen"
      class="tuning-overlay"
    >
      <BaseButton
        class="tuning-step"
        variant="ghost"
        size="sm"
        type="button"
        aria-label="Tune down"
        @click="handleStep(-1)"
      >
        &#9660;
      </BaseButton>
      <input
        class="tuning-display"
        type="text"
        readonly
        :value="tuningDisplay"
        aria-label="Tuning value"
      >
      <BaseButton
        class="tuning-step"
        variant="ghost"
        size="sm"
        type="button"
        aria-label="Tune up"
        @click="handleStep(1)"
      >
        &#9650;
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.tuning-control {
  /* No `z-index` — see TrackControl.vue for the same rationale.
     A z-index here would trap the overlay below AlphaTab's cursor. */
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tuning-trigger {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
}

.tuning-trigger.is-active {
  color: var(--accent);
}

.tuning-overlay {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: #131720;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  /* Above the NoteResultOverlay canvas (z-index 1001). */
  z-index: 1100;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.tuning-display {
  width: calc(4ch + 2px);
  text-align: center;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text);
  background: #0f1218;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px 6px;
}

.tuning-step {
  min-width: 28px;
  padding: 4px 6px;
  font-size: 0.8rem;
  line-height: 1;
}
</style>
