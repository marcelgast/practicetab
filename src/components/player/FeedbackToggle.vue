<script setup lang="ts">
/**
 * Live-feedback master switch for the Player top-bar (PR 3.6, Step 5).
 *
 * Clicking the toggle:
 * - Flips `noteRecognitionStore.feedbackEnabled`
 * - Starts or stops pitch detection so the mic is only hot while the
 *   feedback pipeline is armed
 *
 * The actual comparison lifecycle (startComparison/stopComparison) is driven
 * by playback state from `PlayerPanel.vue` — this component only owns the
 * master switch + mic lifecycle so the UI stays predictable.
 *
 * First enable per session opens a beta-disclaimer modal that the user
 * has to acknowledge once; subsequent toggles in the same session skip
 * the modal. Acknowledgement resets at app restart.
 */
import { computed, onUnmounted, ref } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import FeedbackBetaDialog from './FeedbackBetaDialog.vue';
import { feedbackBetaAcknowledged } from './feedbackBetaAck';
import { useNoteRecognitionStore } from '../../stores/noteRecognition';
import { usePitchDetectionStore } from '../../stores/pitchDetection';
import { usePlayerStore } from '../../stores/player';

const recognitionStore = useNoteRecognitionStore();
const pitchStore = usePitchDetectionStore();
const playerStore = usePlayerStore();

const errorMessage = ref<string | null>(null);
const isBusy = ref(false);
const betaDialogOpen = ref(false);

/**
 * No tab loaded = no beat-rect cache, no expected-note timeline, no
 * meaningful feedback pipeline. Gating the button here avoids users
 * clicking Feedback, seeing the mic spin up, and wondering why the
 * overlay stays blank forever. Tooltip gets a separate message in
 * that state so they know why.
 */
const hasLoadedTab = computed(() =>
  Boolean(playerStore.model.currentLibraryItemId),
);
const tooltipText = computed(() =>
  hasLoadedTab.value
    ? 'Toggle live note feedback (beta)'
    : 'Load a tab from the Library to enable Feedback',
);
const isDisabled = computed(() => isBusy.value || !hasLoadedTab.value);

async function enableFeedback(): Promise<void> {
  // Start mic first so we're capturing by the time the user hits play.
  // If mic fails, leave the master switch off.
  if (!pitchStore.isListening) {
    await pitchStore.start();
  }
  recognitionStore.setFeedbackEnabled(true);
}

async function disableFeedback(): Promise<void> {
  recognitionStore.setFeedbackEnabled(false);
  if (pitchStore.isListening) {
    await pitchStore.stop();
  }
}

async function handleClick(): Promise<void> {
  if (isBusy.value) return;
  errorMessage.value = null;

  if (recognitionStore.feedbackEnabled) {
    isBusy.value = true;
    try {
      await disableFeedback();
    } catch (err) {
      errorMessage.value =
        err instanceof Error ? err.message : String(err ?? 'feedback_failed');
    } finally {
      isBusy.value = false;
    }
    return;
  }

  // Turning ON — gate on the one-time-per-session beta disclaimer.
  if (!feedbackBetaAcknowledged.value) {
    betaDialogOpen.value = true;
    return;
  }

  isBusy.value = true;
  try {
    await enableFeedback();
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : String(err ?? 'feedback_failed');
    // Roll back to a consistent state: feedback off, mic off.
    recognitionStore.setFeedbackEnabled(false);
    try {
      if (pitchStore.isListening) {
        await pitchStore.stop();
      }
    } catch {
      // Swallow — we are already surfacing a primary error above.
    }
  } finally {
    isBusy.value = false;
  }
}

async function onBetaAcknowledge(): Promise<void> {
  // The dialog component already flipped the session-scope flag to
  // true. Close the modal and carry on with the originally requested
  // enable; any failure rolls back exactly as a direct-enable would.
  betaDialogOpen.value = false;
  isBusy.value = true;
  try {
    await enableFeedback();
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : String(err ?? 'feedback_failed');
    recognitionStore.setFeedbackEnabled(false);
    try {
      if (pitchStore.isListening) {
        await pitchStore.stop();
      }
    } catch {
      // Swallow.
    }
  } finally {
    isBusy.value = false;
  }
}

function onBetaDialogClose(): void {
  // Backdrop click / escape — leave feedback off, no rollback needed
  // since we never flipped anything on yet.
  betaDialogOpen.value = false;
}

// If the player panel unmounts while feedback is armed, release the mic so
// the backend input stream does not stay hot in the background.
onUnmounted(() => {
  if (!recognitionStore.feedbackEnabled && !pitchStore.isListening) return;
  recognitionStore.setFeedbackEnabled(false);
  if (pitchStore.isListening) {
    void pitchStore.stop().catch(() => {
      // Best-effort — nothing we can display anymore.
    });
  }
});
</script>

<template>
  <div class="feedback-toggle-row">
    <AppTooltip :text="tooltipText">
      <BaseButton
        class="feedback-trigger"
        variant="ghost"
        size="sm"
        type="button"
        :aria-pressed="recognitionStore.feedbackEnabled"
        :disabled="isDisabled"
        @click="handleClick"
      >
        <span class="feedback-label">Feedback</span>
        <span
          class="feedback-beta-flag"
          aria-label="Beta feature"
        >Beta</span>
      </BaseButton>
    </AppTooltip>
    <span
      v-if="errorMessage"
      class="feedback-error"
      role="alert"
    >
      {{ errorMessage }}
    </span>
    <FeedbackBetaDialog
      :open="betaDialogOpen"
      @acknowledge="onBetaAcknowledge"
      @close="onBetaDialogClose"
    />
  </div>
</template>

<style scoped>
.feedback-toggle-row {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
}

.feedback-trigger {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.feedback-trigger[aria-pressed='true'] {
  color: var(--accent);
  border-color: var(--accent);
}

.feedback-label {
  line-height: 1;
}

/* Matches the beta pill in the disclaimer dialog — same typography,
   same accent outline — so the UI keeps a single visual language for
   "this feature is still beta". */
.feedback-beta-flag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 999px;
  line-height: 1;
}

.feedback-error {
  color: #f87171;
  font-size: 0.75rem;
  max-width: 200px;
}
</style>
