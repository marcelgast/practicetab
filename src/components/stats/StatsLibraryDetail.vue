<script setup lang="ts">
import { computed } from 'vue';
import type { LibraryItemStats } from '../../domain/stats/types';
import type { FeedbackRunOverview } from '../../services/feedbackRunCommands';
import { formatMinutes, formatDate } from '../../domain/stats/formatters';
import FeedbackScoreChart from './FeedbackScoreChart.vue';
import FeedbackRunsList from './FeedbackRunsList.vue';

const props = defineProps<{
  item: LibraryItemStats;
  feedbackRuns?: FeedbackRunOverview[];
}>();

const emit = defineEmits<{
  (e: 'open-feedback', id: number): void;
}>();

const kindLabel = props.item.kind === 'tab' ? 'Tab' : 'Audio';

function formatLastPlayed(date: string | null): string {
  return formatDate(date);
}

const libraryFeedbackRuns = computed<FeedbackRunOverview[]>(() =>
  (props.feedbackRuns ?? []).filter(
    (r) => r.libraryItemId === props.item.itemId,
  ),
);

const HISTORY_LIST_LIMIT = 10;
</script>

<template>
  <div class="library-detail">
    <div class="library-header">
      <h2 class="library-title">
        {{ item.itemTitle }}
      </h2>
      <span class="kind-badge">{{ kindLabel }}</span>
    </div>
    <div class="stat-grid">
      <div class="stat-card-sm">
        <div class="stat-label">
          Play Count
        </div>
        <div class="stat-value">
          {{ item.playCount }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Total Time
        </div>
        <div class="stat-value">
          {{ formatMinutes(item.totalTimeMinutes) }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Loops Used
        </div>
        <div class="stat-value">
          {{ item.loopCount }}
        </div>
      </div>
      <div class="stat-card-sm">
        <div class="stat-label">
          Last Played
        </div>
        <div class="stat-value">
          {{ formatLastPlayed(item.lastPlayedAt) }}
        </div>
      </div>
    </div>

    <div v-if="libraryFeedbackRuns.length > 0">
      <div class="section-label">
        Feedback score
      </div>
      <FeedbackScoreChart :runs="libraryFeedbackRuns" />
      <div class="feedback-history-list">
        <FeedbackRunsList
          :runs="libraryFeedbackRuns"
          :limit="HISTORY_LIST_LIMIT"
          @select="emit('open-feedback', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-detail {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
}

.library-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.library-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.kind-badge {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 6px;
  padding: 2px 8px;
  white-space: nowrap;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.stat-card-sm {
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 70px;
}

.stat-label {
  font-size: 0.72rem;
  color: var(--muted);
}

.stat-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  text-align: right;
}

.section-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.feedback-history-list {
  margin-top: 10px;
}
</style>
