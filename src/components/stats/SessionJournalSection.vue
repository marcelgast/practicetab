<script setup lang="ts">
/**
 * Stats → General → Session Journal (PR 4.3).
 *
 * Master-detail view: left list of sessions with any journal
 * content, right pane shows the selected session's goal /
 * review / percent / goal-reached plus a delete button.
 *
 * The "delete" action wipes the four journal columns back to
 * NULL — it does NOT delete the underlying session row or the
 * time tracked on it. After deletion the row disappears from
 * this list (filtered by `hasJournalContent`).
 */
import { computed, onMounted, ref } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import SessionJournalAggregates from './SessionJournalAggregates.vue';
import { practicePersistence } from '../../services/practicePersistence';
import type { PracticeSession } from '../../domain/practice';
import {
  formatJournalDate,
  formatJournalPreview,
  hasJournalContent,
} from '../../domain/sessionJournal';
import { usePracticeStore } from '../../stores/practice';

const practiceStore = usePracticeStore();

const sessions = ref<PracticeSession[]>([]);
const selectedId = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const deleteConfirmId = ref<string | null>(null);

async function loadSessions(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    sessions.value = await practicePersistence.listSessionsWithJournal();
    // Preserve selection if still in the list, else clear.
    if (
      selectedId.value &&
      !sessions.value.find((s) => s.id === selectedId.value)
    ) {
      selectedId.value = null;
    }
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Failed to load journal.';
    sessions.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadSessions();
});

const selected = computed<PracticeSession | null>(() => {
  if (!selectedId.value) return null;
  return sessions.value.find((s) => s.id === selectedId.value) ?? null;
});

function handleSelect(session: PracticeSession): void {
  selectedId.value = session.id;
  deleteConfirmId.value = null;
}

function requestDelete(sessionId: string): void {
  deleteConfirmId.value = sessionId;
}

function cancelDelete(): void {
  deleteConfirmId.value = null;
}

async function confirmDelete(sessionId: string): Promise<void> {
  try {
    await practiceStore.clearJournal(sessionId);
  } finally {
    deleteConfirmId.value = null;
    // Refresh — row drops out because hasJournalContent goes false.
    await loadSessions();
  }
}

function percentLabel(session: PracticeSession): string {
  if (typeof session.goalPercent !== 'number') return '—';
  return `${session.goalPercent} %`;
}

function reachedLabel(session: PracticeSession): string {
  if (typeof session.goalReached !== 'boolean') return 'Not answered';
  return session.goalReached ? 'Goal reached' : 'Goal not reached';
}

function trimOrDash(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '—';
}

const visibleSessions = computed(() =>
  sessions.value.filter(hasJournalContent),
);
</script>

<template>
  <div class="session-journal">
    <div
      v-if="loading && sessions.length === 0"
      class="journal-state"
    >
      Loading journal…
    </div>
    <div
      v-else-if="error"
      class="journal-state journal-state--error"
    >
      {{ error }}
    </div>
    <div
      v-else-if="visibleSessions.length === 0"
      class="journal-state"
    >
      No journal entries yet. Start the timer with Journaling enabled to create
      one.
    </div>
    <SessionJournalAggregates
      v-if="visibleSessions.length > 0"
      :sessions="visibleSessions"
    />
    <div
      v-if="visibleSessions.length > 0"
      class="journal-layout"
    >
      <ul
        class="journal-list"
        role="list"
      >
        <li
          v-for="session in visibleSessions"
          :key="session.id"
        >
          <button
            type="button"
            class="journal-list-row"
            :class="{ active: selectedId === session.id }"
            @click="handleSelect(session)"
          >
            <span class="journal-list-date">
              {{ formatJournalDate(session.sessionDate) }}
            </span>
            <span class="journal-list-preview">
              {{ formatJournalPreview(session) }}
            </span>
          </button>
        </li>
      </ul>
      <div
        v-if="selected"
        class="journal-detail"
      >
        <h3 class="journal-detail-title">
          {{ formatJournalDate(selected.sessionDate) }}
        </h3>
        <div class="journal-detail-block">
          <div class="journal-detail-label">
            Goal
          </div>
          <p class="journal-detail-body">
            {{ trimOrDash(selected.goalText) }}
          </p>
        </div>
        <div class="journal-detail-block">
          <div class="journal-detail-label">
            Review
          </div>
          <p class="journal-detail-body">
            {{ trimOrDash(selected.reviewText) }}
          </p>
        </div>
        <div class="journal-detail-metrics">
          <div class="journal-metric">
            <span class="journal-detail-label">Completion</span>
            <span class="journal-metric-value">
              {{ percentLabel(selected) }}
            </span>
          </div>
          <div class="journal-metric">
            <span class="journal-detail-label">Result</span>
            <span
              class="journal-metric-value"
              :class="{
                'journal-metric-value--reached': selected.goalReached === true,
              }"
            >
              {{ reachedLabel(selected) }}
            </span>
          </div>
        </div>
        <div class="journal-detail-actions">
          <template v-if="deleteConfirmId !== selected.id">
            <BaseButton
              variant="outline-danger"
              size="sm"
              type="button"
              @click="requestDelete(selected.id)"
            >
              Delete journal
            </BaseButton>
          </template>
          <template v-else>
            <span class="journal-confirm-prompt">Remove this entry?</span>
            <BaseButton
              variant="ghost"
              size="sm"
              type="button"
              @click="cancelDelete"
            >
              Cancel
            </BaseButton>
            <BaseButton
              variant="filled-danger"
              size="sm"
              type="button"
              @click="confirmDelete(selected.id)"
            >
              Delete
            </BaseButton>
          </template>
        </div>
      </div>
      <div
        v-else
        class="journal-detail journal-detail--empty"
      >
        Select a session to view its journal.
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-journal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}

.journal-state {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.journal-state--error {
  color: #f08e8e;
}

.journal-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 16px;
  min-height: 0;
  height: 100%;
}

.journal-list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
  display: grid;
  gap: 4px;
  align-content: start;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #0f141d;
  padding: 6px;
}

.journal-list-row {
  display: grid;
  gap: 4px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease;
}

.journal-list-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.journal-list-row.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
}

.journal-list-date {
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.journal-list-preview {
  font-size: 0.9rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.journal-detail {
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #0f141d;
  overflow: auto;
}

.journal-detail--empty {
  align-content: center;
  justify-items: center;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.journal-detail-title {
  margin: 0;
  font-size: 1rem;
  color: var(--text);
  letter-spacing: 0.01em;
}

.journal-detail-block {
  display: grid;
  gap: 4px;
}

.journal-detail-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.journal-detail-body {
  margin: 0;
  color: var(--text);
  font-size: 0.92rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.journal-detail-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.journal-metric {
  display: grid;
  gap: 3px;
}

.journal-metric-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.journal-metric-value--reached {
  color: var(--accent);
}

.journal-detail-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.journal-confirm-prompt {
  margin-right: 4px;
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
