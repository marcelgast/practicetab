<script setup lang="ts">
/**
 * Session-start goal dialog (PR 4.3).
 *
 * Shown every time the user starts the global timer AND
 * journaling is enabled AND the active session has no goal yet
 * AND the user hasn't already dismissed the dialog for that
 * session (tracked in the practice store).
 *
 * Three user paths out of this dialog:
 * - Save → persist the goal text on the active session, then
 *   continue starting the timer. Always closes.
 * - Skip → continue starting the timer without touching the
 *   goal. The dialog will fire again for the next fresh session,
 *   but stays off for the current one (practice store tracks this).
 * - Don't show again → flips `journalingEnabled` off, regardless
 *   of whether the user picks Save or Skip. The explicit opt-out
 *   path; closing via Escape / backdrop does NOT flip the flag.
 */
import { computed, nextTick, ref, watch } from 'vue';
import BaseButton from '../ui/BaseButton.vue';

const props = defineProps<{
  /** Controls visibility. Parent owns the open state. */
  open: boolean;
}>();

const emit = defineEmits<{
  /** User confirmed a goal. Parent should persist + start timer. */
  save: [payload: { goalText: string; dontShowAgain: boolean }];
  /** User chose to proceed without a goal. */
  skip: [payload: { dontShowAgain: boolean }];
  /** Escape / backdrop click — equivalent to skip, but keeps the
   *  setting flag off so a later session re-prompts. */
  dismiss: [];
}>();

const goalInput = ref('');
const dontShowAgain = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const canSave = computed(() => goalInput.value.trim().length > 0);

watch(
  () => props.open,
  async (value) => {
    if (!value) return;
    // Reset on each open so a previous session's draft doesn't leak
    // into the next prompt.
    goalInput.value = '';
    dontShowAgain.value = false;
    await nextTick();
    textareaRef.value?.focus();
  },
  { immediate: true },
);

function handleSave(): void {
  if (!canSave.value) return;
  emit('save', {
    goalText: goalInput.value.trim(),
    dontShowAgain: dontShowAgain.value,
  });
}

function handleSkip(): void {
  emit('skip', { dontShowAgain: dontShowAgain.value });
}

function handleBackdrop(): void {
  emit('dismiss');
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('dismiss');
    return;
  }
  // ⌘/Ctrl + Enter submits the form when the text is valid.
  if (
    event.key === 'Enter' &&
    (event.metaKey || event.ctrlKey) &&
    canSave.value
  ) {
    event.preventDefault();
    handleSave();
  }
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      class="journal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-goal-title"
      @click.self="handleBackdrop"
      @keydown="handleKeydown"
    >
      <div class="journal-modal">
        <h2
          id="journal-goal-title"
          class="journal-title"
        >
          What do you want to practice?
        </h2>
        <p class="journal-hint">
          A short intention helps focus the next session. Skip if you'd rather
          just get started.
        </p>
        <textarea
          ref="textareaRef"
          v-model="goalInput"
          class="journal-textarea"
          rows="3"
          maxlength="500"
          placeholder="E.g. clean chord changes in the chorus"
        />
        <label class="journal-checkbox">
          <input
            v-model="dontShowAgain"
            type="checkbox"
          >
          <span>Don't show this again</span>
        </label>
        <div class="journal-actions">
          <BaseButton
            variant="ghost"
            size="sm"
            type="button"
            @click="handleSkip"
          >
            Skip
          </BaseButton>
          <BaseButton
            variant="filled-accent"
            size="sm"
            type="button"
            :disabled="!canSave"
            @click="handleSave"
          >
            Save &amp; start
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
  width: min(520px, 92vw);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 22px 24px 20px;
  color: var(--text);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
}

.journal-title {
  margin: 0 0 6px;
  font-size: 20px;
  letter-spacing: 0.01em;
}

.journal-hint {
  margin: 0 0 14px;
  color: var(--text-muted);
  font-size: 13px;
}

.journal-textarea {
  width: 100%;
  resize: vertical;
  min-height: 72px;
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

.journal-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
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
