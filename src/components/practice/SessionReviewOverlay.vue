<script setup lang="ts">
/**
 * In-session Review overlay (PR 4.3).
 *
 * Opens from a click on the BottomBarTimer's timer-text area while
 * a session is active and journaling is enabled. Shows the goal
 * read-only, lets the user write a review text, set a percent
 * slider (0–150 %) and flip a "goal reached" checkbox.
 *
 * UX choices encoded here:
 * - Slider default 0 on first open; re-open hydrates the
 *   previously-saved value so users can come back and refine.
 * - Checking "Goal reached" snaps the slider to 100 with a short
 *   ease-out animation. Unchecking leaves the slider alone.
 * - No backdrop-click dismiss here (unlike the goal dialog) —
 *   users investing effort into a review shouldn't lose it to a
 *   stray click. Escape still cancels.
 */
import { computed, nextTick, ref, watch } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import AccentSlider from '../ui/AccentSlider.vue';
import {
  JOURNAL_DEFAULT_PERCENT,
  JOURNAL_GOAL_REACHED_PERCENT,
  JOURNAL_PERCENT_MAX,
  JOURNAL_PERCENT_MIN,
  clampJournalPercent,
} from '../../domain/sessionJournal';

const props = defineProps<{
  open: boolean;
  /** Goal text from the active session (empty when the user skipped the goal). */
  goalText: string | null | undefined;
  /** Persisted review text (null on first open). */
  reviewText: string | null | undefined;
  /** Persisted percent (null on first open → use default). */
  goalPercent: number | null | undefined;
  /** Persisted goal-reached flag (null on first open → false). */
  goalReached: boolean | null | undefined;
}>();

const emit = defineEmits<{
  save: [
    payload: {
      reviewText: string;
      /**
       * `null` when the user never touched the slider on this open.
       * Lets the caller distinguish "user didn't engage with this
       * field" from "user explicitly set 0%". Without this, hitting
       * Save on a freshly-opened overlay would write `goalPercent: 0`
       * + `goalReached: false`, which `hasJournalContent` then flags
       * as a journal entry — the user gets a phantom row in Stats
       * with all dashes and "Goal not reached".
       */
      goalPercent: number | null;
      /** Same touched-vs-default logic as `goalPercent`. */
      goalReached: boolean | null;
    },
  ];
  cancel: [];
}>();

const reviewInput = ref('');
const percent = ref<number>(JOURNAL_DEFAULT_PERCENT);
const reached = ref(false);
/**
 * Tracks whether the user explicitly engaged with each control
 * during this open. Reset on open; flipped to true when the slider
 * fires `update:model-value` or the checkbox fires `change`.
 *
 * Re-opens of an already-saved review hydrate `*Touched` to true so
 * Save without further edits preserves the persisted values rather
 * than nulling them out (which would otherwise blow away an existing
 * 80%/reached entry the user just wanted to look at).
 */
const percentTouched = ref(false);
const reachedTouched = ref(false);

// Animation target for the snap-to-100 behaviour. When the user
// ticks "Goal reached" we interpolate `percent` from current →
// 100 over ~240 ms so the slider visibly glides instead of
// teleporting. Cancellable if the user un-ticks mid-animation.
const animationHandle = ref<number | null>(null);

function cancelAnimation(): void {
  if (animationHandle.value !== null) {
    cancelAnimationFrame(animationHandle.value);
    animationHandle.value = null;
  }
}

function animatePercentTo(target: number, durationMs = 240): void {
  cancelAnimation();
  const start = percent.value;
  const delta = target - start;
  if (delta === 0) return;
  const startTime = performance.now();
  const step = (now: number): void => {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / durationMs);
    // Cubic ease-out — starts quick, decelerates into the target.
    const eased = 1 - Math.pow(1 - t, 3);
    percent.value = clampJournalPercent(start + delta * eased);
    if (t < 1) {
      animationHandle.value = requestAnimationFrame(step);
    } else {
      animationHandle.value = null;
    }
  };
  animationHandle.value = requestAnimationFrame(step);
}

watch(
  () => props.open,
  (value) => {
    if (!value) {
      cancelAnimation();
      return;
    }
    // Seed from persisted values on open. First-time opens land on
    // (0, false); revisits hydrate whatever's in the DB.
    reviewInput.value = props.reviewText ?? '';
    percent.value = clampJournalPercent(
      props.goalPercent ?? JOURNAL_DEFAULT_PERCENT,
    );
    reached.value = Boolean(props.goalReached);
    // Treat persisted values as already-touched so Save preserves
    // them. Only first-opens (props are null/undefined) start with
    // `*Touched = false` and emit `null` on Save.
    percentTouched.value = typeof props.goalPercent === 'number';
    reachedTouched.value = typeof props.goalReached === 'boolean';
  },
  { immediate: true },
);

const percentLabel = computed(() => `${percent.value} %`);
const goalDisplay = computed(() => {
  const trimmed = (props.goalText ?? '').trim();
  return trimmed.length > 0 ? trimmed : '(No goal was set for this session.)';
});

function handleSave(): void {
  cancelAnimation();
  emit('save', {
    reviewText: reviewInput.value.trim(),
    goalPercent: percentTouched.value ? percent.value : null,
    goalReached: reachedTouched.value ? reached.value : null,
  });
}

function handleCancel(): void {
  cancelAnimation();
  emit('cancel');
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
  }
}

async function handleReachedToggle(event: Event): Promise<void> {
  const next = (event.target as HTMLInputElement).checked;
  reached.value = next;
  reachedTouched.value = true;
  // The snap-to-100 animation is a meaningful slider edit on its
  // own — flag the slider as touched so Save persists 100%.
  if (next) {
    percentTouched.value = true;
  }
  if (!next) return;
  // Wait a frame so the checkbox's native transition doesn't stall
  // the rAF chain in some browsers.
  await nextTick();
  animatePercentTo(JOURNAL_GOAL_REACHED_PERCENT);
}

/** User dragged the slider — flag percent as touched. */
function handlePercentInput(value: number): void {
  percent.value = value;
  percentTouched.value = true;
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      class="journal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-review-title"
      @keydown="handleKeydown"
    >
      <div class="journal-modal">
        <h2
          id="journal-review-title"
          class="journal-title"
        >
          Session review
        </h2>
        <div class="journal-goal-readonly">
          <div class="journal-field-label">
            Goal
          </div>
          <p class="journal-goal-text">
            {{ goalDisplay }}
          </p>
        </div>
        <div class="journal-review-block">
          <label
            class="journal-field-label"
            for="journal-review-input"
          >
            What happened this session?
          </label>
          <textarea
            id="journal-review-input"
            v-model="reviewInput"
            class="journal-textarea"
            rows="4"
            maxlength="1000"
            placeholder="Wins, stuck spots, what to try next time…"
          />
        </div>
        <div class="journal-percent-block">
          <div class="journal-percent-row">
            <span class="journal-field-label">Completion</span>
            <span class="journal-percent-value">{{ percentLabel }}</span>
          </div>
          <AccentSlider
            :model-value="percent"
            :min="JOURNAL_PERCENT_MIN"
            :max="JOURNAL_PERCENT_MAX"
            :step="1"
            @update:model-value="handlePercentInput"
          />
        </div>
        <label class="journal-checkbox">
          <input
            :checked="reached"
            type="checkbox"
            @change="handleReachedToggle"
          >
          <span>Goal reached</span>
        </label>
        <div class="journal-actions">
          <BaseButton
            variant="ghost"
            size="sm"
            type="button"
            @click="handleCancel"
          >
            Cancel
          </BaseButton>
          <BaseButton
            variant="filled-accent"
            size="sm"
            type="button"
            @click="handleSave"
          >
            Save review
          </BaseButton>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.journal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: grid;
  place-items: center;
  z-index: 100002;
  padding: 24px;
}

.journal-modal {
  width: min(560px, 92vw);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 22px 24px 20px;
  color: var(--text);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
}

.journal-title {
  margin: 0 0 14px;
  font-size: 20px;
  letter-spacing: 0.01em;
}

.journal-field-label {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.journal-goal-readonly {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #0f141d;
}

.journal-goal-text {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}

.journal-review-block {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
}

.journal-textarea {
  width: 100%;
  resize: vertical;
  min-height: 96px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #0f141d;
  color: var(--text);
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.4;
}

.journal-textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
}

.journal-percent-block {
  margin-bottom: 12px;
}

.journal-percent-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.journal-percent-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--accent);
}

.journal-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.journal-checkbox input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
}

.journal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>
