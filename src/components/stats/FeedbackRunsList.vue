<script setup lang="ts">
/**
 * Compact list of Live-Feedback runs. Used in three places:
 *
 * 1. The top-level Stats "Feedback" tab (all runs ever).
 * 2. The per-exercise detail page (runs filtered by exercise).
 * 3. The per-library-item detail page (runs filtered by tab).
 *
 * Each row shows date · context · score · streak · duration. Hover
 * reveals a Details button on the right — clicking it (or the row
 * itself) emits `select` with the run id so the parent can open
 * the detail view. The component itself owns no navigation state.
 */
import { computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import type { FeedbackRunOverview } from '../../services/feedbackRunCommands';

const props = defineProps<{
  runs: FeedbackRunOverview[];
  /**
   * Resolver for the "context" column — lets the parent inject the
   * right display string. Exercise detail knows the run always
   * belongs to the same exercise (so it shows the run's date plus
   * maybe library-item name), the top-level tab wants to show
   * both exercise and library item, etc. Keep this component
   * presentation-only.
   */
  contextFor?: (run: FeedbackRunOverview) => string;
  /** Truncates the rendered list. Omit for no cap. */
  limit?: number;
  /** Currently-selected run id, highlighted if present. */
  selectedId?: number | null;
}>();

const emit = defineEmits<{
  (e: 'select', id: number): void;
}>();

const visibleRuns = computed(() =>
  typeof props.limit === 'number'
    ? props.runs.slice(0, props.limit)
    : props.runs,
);

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function scoreClass(score: number): string {
  if (score >= 85) return 'score-excellent';
  if (score >= 70) return 'score-good';
  if (score >= 50) return 'score-ok';
  return 'score-low';
}
</script>

<template>
  <div
    v-if="visibleRuns.length === 0"
    class="runs-empty"
  >
    No feedback runs yet.
  </div>
  <ul
    v-else
    class="runs-list"
    role="list"
  >
    <li
      v-for="run in visibleRuns"
      :key="run.id"
      class="run-row"
      :class="{ 'run-row--selected': selectedId === run.id }"
      tabindex="0"
      role="button"
      :aria-label="`Open details for run on ${formatDate(run.endedAt)}`"
      @click="emit('select', run.id)"
      @keydown.enter.prevent="emit('select', run.id)"
      @keydown.space.prevent="emit('select', run.id)"
    >
      <span class="run-date">{{ formatDate(run.endedAt) }}</span>
      <span class="run-context">{{ contextFor ? contextFor(run) : '' }}</span>
      <span
        class="run-score"
        :class="scoreClass(run.overallScore)"
      >{{
        run.overallScore
      }}</span>
      <span class="run-streak">Streak {{ run.longestStreak }}</span>
      <span class="run-duration">{{
        formatDuration(run.durationSeconds)
      }}</span>
      <span class="run-details-cta">
        Details
        <ChevronRight :size="14" />
      </span>
    </li>
  </ul>
</template>

<style scoped>
.runs-empty {
  padding: 16px;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
}

.runs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.run-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto auto;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.run-row:hover,
.run-row:focus-visible {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.04);
  outline: none;
}

.run-row--selected {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb, 34, 197, 94), 0.08);
}

.run-date {
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
}

.run-context {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.run-score {
  font-size: 1rem;
  font-weight: 600;
  min-width: 2.5ch;
  text-align: right;
}

.score-excellent {
  color: #22c55e;
}
.score-good {
  color: #84cc16;
}
.score-ok {
  color: #eab308;
}
.score-low {
  color: #ef4444;
}

.run-streak,
.run-duration {
  color: var(--text-muted);
  white-space: nowrap;
  font-size: 0.78rem;
}

/* Hidden by default, revealed on hover/focus of the row. Keeps the
   list rhythm clean when idle but gives the user an obvious CTA at
   the moment they care about one run. */
.run-details-cta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0;
  transition: opacity 120ms ease;
  white-space: nowrap;
}

.run-row:hover .run-details-cta,
.run-row:focus-visible .run-details-cta,
.run-row--selected .run-details-cta {
  opacity: 1;
}
</style>
