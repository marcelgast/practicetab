<script setup lang="ts">
/**
 * Tuner entry point in the Player top-bar.
 *
 * Renders a single compact button. Clicking it opens a modal dialog
 * (`TunerModal`) containing the actual tuner display, the A4 reference
 * input and the tuning preset selector. Pitch detection is started
 * when the modal opens and stopped when it closes — so the microphone
 * is only live while the user is actually looking at the tuner.
 */
import { computed, onUnmounted, ref } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import TunerModal from './TunerModal.vue';
import { usePitchTunerStore } from '../../stores/tuner';
import { useNoteRecognitionStore } from '../../stores/noteRecognition';

const tunerStore = usePitchTunerStore();
const recognitionStore = useNoteRecognitionStore();

const isOpen = ref(false);
const errorMessage = ref<string | null>(null);
const isBusy = ref(false);

// Visual hint when the live-feedback pipeline has flagged many notes
// as wrong-pitch — the most common cause is the guitar being out of
// tune or the wrong input device being selected.
const suggestTuning = computed(() => recognitionStore.shouldSuggestTuning);
const tooltipText = computed(() =>
  suggestTuning.value
    ? 'Many notes are coming in off-pitch — check tuning?'
    : 'Open tuner',
);

async function openModal(): Promise<void> {
  if (isBusy.value || isOpen.value) return;
  isBusy.value = true;
  errorMessage.value = null;
  try {
    await tunerStore.start();
    isOpen.value = true;
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : String(err ?? 'tuner_failed');
  } finally {
    isBusy.value = false;
  }
}

async function handleOpenChange(open: boolean): Promise<void> {
  if (open) return;
  isOpen.value = false;
  if (isBusy.value) return;
  isBusy.value = true;
  try {
    await tunerStore.stop();
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : String(err ?? 'tuner_failed');
  } finally {
    isBusy.value = false;
  }
}

// The Pinia tuner store is app-global but this toggle owns the lifecycle
// of the modal. If the Player panel unmounts (route change, rerender)
// while the tuner is still open, reka-ui tears the dialog down without
// running the `update:open` close path, so `stop()` would never fire and
// the Rust input stream + pitch worker would stay live in the
// background — breaking the "mic is only live while the user is looking
// at the tuner" contract. Best-effort stop on unmount closes the gap.
onUnmounted(() => {
  if (!isOpen.value && !tunerStore.isActive) return;
  isOpen.value = false;
  void tunerStore.stop().catch(() => {
    // Swallow — the component is gone, there's no UI to surface an
    // error on. The backend stop command is idempotent so a failure
    // here can't leave the tuner half-running on the next mount.
  });
});
</script>

<template>
  <div class="tuner-row">
    <AppTooltip :text="tooltipText">
      <BaseButton
        class="tuner-trigger"
        :class="{ 'tuner-suggest': suggestTuning }"
        variant="ghost"
        size="sm"
        type="button"
        :aria-pressed="isOpen"
        :disabled="isBusy"
        @click="openModal"
      >
        Tuner
      </BaseButton>
    </AppTooltip>
    <span
      v-if="errorMessage"
      class="tuner-error"
      role="alert"
    >
      {{ errorMessage }}
    </span>
    <TunerModal
      :open="isOpen"
      @update:open="handleOpenChange"
    />
  </div>
</template>

<style scoped>
.tuner-row {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
}

.tuner-trigger {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}

.tuner-trigger[aria-pressed='true'] {
  color: var(--accent);
  border-color: var(--accent);
}

/* Subtle pulsing glow when the feedback pipeline suggests tuning. */
.tuner-trigger.tuner-suggest {
  color: #fbbf24;
  border-color: #fbbf24;
  animation: tuner-suggest-pulse 1.6s ease-in-out infinite;
}

@keyframes tuner-suggest-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.45);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(251, 191, 36, 0);
  }
}

.tuner-error {
  color: #f87171;
  font-size: 0.75rem;
  max-width: 200px;
}
</style>
