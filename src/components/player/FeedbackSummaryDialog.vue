<script setup lang="ts">
/**
 * End-of-run feedback summary dialog (PR 3.6, Step 8).
 *
 * Rendered when playback ends with results in `noteRecognitionStore.noteResults`.
 * Pure presentation — all aggregation lives in `buildFeedbackSummary()`.
 */
import { computed, ref, watch } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import { useNoteRecognitionStore } from '../../stores/noteRecognition';
import { usePlayerStore } from '../../stores/player';
import { buildFeedbackSummary } from '../../domain/feedbackSummary';
import type { NoteResult } from '../../domain/noteComparison';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const recognitionStore = useNoteRecognitionStore();
const playerStore = usePlayerStore();

/**
 * Snapshot of `noteResults` taken when `open` transitions to true.
 * The dialog represents a finished run — it must not react to
 * subsequent store mutations like `clearTimeline()` that rightly
 * wipe state when the user swaps tabs or starts a new run. Without
 * this snapshot, openLibraryItem's clearTimeline call would empty
 * the dialog mid-display the moment the user clicked another song
 * in the library while still reading the summary. Implemented as a
 * one-shot capture rather than a reactive computed.
 */
const snapshotResults = ref<NoteResult[]>([]);
watch(
  () => props.open,
  (open) => {
    if (open) {
      snapshotResults.value = [...recognitionStore.noteResults];
    }
  },
  { immediate: true },
);

const summary = computed(() => buildFeedbackSummary(snapshotResults.value));

const pitchRows = computed(() => [
  { label: 'Perfect', count: summary.value.pitchHistogram.perfect },
  { label: 'Good', count: summary.value.pitchHistogram.good },
  { label: 'Acceptable', count: summary.value.pitchHistogram.acceptable },
  { label: 'Wrong', count: summary.value.pitchHistogram.wrong },
]);

const timingRows = computed(() => [
  { label: 'Perfect', count: summary.value.timingHistogram.perfect },
  { label: 'Good', count: summary.value.timingHistogram.good },
  { label: 'Acceptable', count: summary.value.timingHistogram.acceptable },
  { label: 'Wrong', count: summary.value.timingHistogram.wrong },
]);

function close(): void {
  emit('update:open', false);
}

function slowDownAndRetry(): void {
  const current = playerStore.model.tempoPercent ?? 100;
  const next = Math.max(50, current - 10);
  playerStore.setTempoPercent(next);
  close();
}
</script>

<template>
  <div
    v-if="props.open"
    class="summary-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feedback-summary-title"
  >
    <div class="summary-modal">
      <header class="summary-header">
        <h2 id="feedback-summary-title">
          Practice Feedback
        </h2>
        <p class="summary-score">
          Score: <strong>{{ summary.overallScore }}</strong>
          <span class="summary-score-max">/ 100</span>
        </p>
      </header>

      <section class="summary-counts">
        <div>
          <span class="count-label">Hit</span>
          <span class="count-value">{{ summary.hitCount }}</span>
        </div>
        <div>
          <span class="count-label">Missed</span>
          <span class="count-value">{{ summary.missedCount }}</span>
        </div>
        <div>
          <span class="count-label">Extra</span>
          <span class="count-value">{{ summary.extraCount }}</span>
        </div>
        <div>
          <span class="count-label">Best Streak</span>
          <span class="count-value">{{ summary.longestStreak }}</span>
        </div>
      </section>

      <section class="summary-histograms">
        <div class="histogram">
          <h3>Pitch</h3>
          <ul>
            <li
              v-for="row in pitchRows"
              :key="row.label"
            >
              <span>{{ row.label }}</span>
              <span>{{ row.count }}</span>
            </li>
          </ul>
        </div>
        <div class="histogram">
          <h3>Timing</h3>
          <ul>
            <li
              v-for="row in timingRows"
              :key="row.label"
            >
              <span>{{ row.label }}</span>
              <span>{{ row.count }}</span>
            </li>
          </ul>
        </div>
      </section>

      <p
        v-if="summary.suggestSlowDown"
        class="summary-hint"
      >
        A few notes slipped — slowing down by 10% can help you lock them in.
      </p>
      <p
        v-if="summary.suggestStringMuting"
        class="summary-hint"
      >
        A lot of notes came through unclear. That's usually a string-muting
        issue — adjacent open strings ringing or fretted notes not fully
        pressed. Try palm-muting with your picking hand and double-check
        left-hand finger placement.
      </p>

      <footer class="summary-actions">
        <BaseButton
          v-if="summary.suggestSlowDown"
          variant="filled-accent"
          size="sm"
          type="button"
          @click="slowDownAndRetry"
        >
          Slow down 10% &amp; close
        </BaseButton>
        <BaseButton
          variant="ghost"
          size="sm"
          type="button"
          @click="close"
        >
          Close
        </BaseButton>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.summary-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  /* Matches the TrialWelcome / License / FeedbackBeta tier at 100002.
     Now that the template is body-level-portaled via Teleport, this
     sits correctly against other app-chrome modals instead of being
     capped inside the player pane's local stacking context. */
  z-index: 100002;
}

.summary-modal {
  background: #11131a;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  padding: 20px 22px;
  width: min(460px, 92vw);
  display: grid;
  gap: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5);
}

.summary-header h2 {
  margin: 0 0 4px;
  font-size: 1.15rem;
}

.summary-score {
  margin: 0;
  color: var(--text-muted);
}

.summary-score strong {
  color: var(--accent);
  font-size: 1.4rem;
  margin-right: 4px;
}

.summary-score-max {
  font-size: 0.85rem;
}

.summary-counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.summary-counts div {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.count-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.count-value {
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.summary-histograms {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.histogram h3 {
  margin: 0 0 6px;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.histogram ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.histogram li {
  display: flex;
  justify-content: space-between;
  font-size: 0.86rem;
  font-variant-numeric: tabular-nums;
}

.summary-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.4;
}

.summary-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
