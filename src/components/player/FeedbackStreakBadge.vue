<script setup lang="ts">
/**
 * Compact streak display for the Player top-bar (PR 3.6, Step 7).
 *
 * Shows the current streak (consecutive good/perfect hits) with the
 * session-best streak to its right. Hidden unless the live-feedback pipeline
 * is currently armed — a dark bar shouldn't show streak when there's nothing
 * to streak.
 *
 * Clickable while the session has at least one `NoteResult` recorded:
 * emits `reopen-summary` so the host can reopen the feedback summary
 * dialog after the user dismissed it.
 */
import { computed } from 'vue';
import { useNoteRecognitionStore } from '../../stores/noteRecognition';
import AppTooltip from '../ui/AppTooltip.vue';

const emit = defineEmits<{ (e: 'reopen-summary'): void }>();

const store = useNoteRecognitionStore();

const visible = computed(() => store.feedbackEnabled);
const current = computed(() => store.currentStreak);
const best = computed(() => store.bestStreak);
const hasResults = computed(() => store.noteResults.length > 0);
const tooltipText = computed(() =>
  hasResults.value
    ? `Click to reopen the feedback summary. Current streak of consecutive good or perfect hits. Best this session: ${best.value}.`
    : `Current streak of consecutive good or perfect hits. Best this session: ${best.value}.`,
);

function handleClick(): void {
  if (!hasResults.value) return;
  emit('reopen-summary');
}

function handleKey(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (!hasResults.value) return;
  event.preventDefault();
  emit('reopen-summary');
}
</script>

<template>
  <AppTooltip
    v-if="visible"
    :text="tooltipText"
  >
    <div
      class="streak-badge"
      :class="{ 'is-clickable': hasResults }"
      :role="hasResults ? 'button' : 'status'"
      :tabindex="hasResults ? 0 : -1"
      aria-live="polite"
      @click="handleClick"
      @keydown="handleKey"
    >
      <span class="streak-icon">🔥</span>
      <span class="streak-current">{{ current }}</span>
      <span
        v-if="best > 0"
        class="streak-best"
      >· best {{ best }}</span>
    </div>
  </AppTooltip>
</template>

<style scoped>
.streak-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  user-select: none;
}

.streak-badge.is-clickable {
  cursor: pointer;
  transition: background 120ms ease;
}

.streak-badge.is-clickable:hover,
.streak-badge.is-clickable:focus-visible {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  outline: none;
}

.streak-icon {
  font-size: 0.95em;
  line-height: 1;
}

.streak-current {
  font-variant-numeric: tabular-nums;
}

.streak-best {
  color: var(--text-muted);
  font-weight: 500;
}
</style>
