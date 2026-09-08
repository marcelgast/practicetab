<script setup lang="ts">
/**
 * Detail view for a single Live-Feedback run. Lazily loads the full
 * row (including `details_json`) via `getFeedbackRunDetails`
 * whenever the `runId` prop changes. The overview row from the
 * parent is accepted too so the header renders instantly — only
 * the per-note timeline block waits on the details fetch.
 *
 * Emits:
 * - `back` — parent should clear its selected-run state.
 * - `deleted` — user confirmed and the run is gone; parent should
 *   refresh its list.
 */
import { computed, ref, watch } from 'vue';
import { ArrowLeft, Trash2 } from 'lucide-vue-next';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import {
  deleteFeedbackRun,
  getFeedbackRunDetails,
  type FeedbackRunOverview,
  type FeedbackRunNoteDetail,
} from '../../services/feedbackRunCommands';
import { computePitchTimingSplit } from '../../domain/feedbackAggregates';
import { useLibraryStore } from '../../stores/library';

const props = defineProps<{
  runId: number;
  /**
   * Overview row from the parent list — used for instant header
   * render. Kept optional so deep-links (future) can still open a
   * detail page from just an id.
   */
  overview?: FeedbackRunOverview | null;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'deleted', id: number): void;
}>();

const libraryStore = useLibraryStore();

const detailsJson = ref<string | null>(null);
const loadingDetails = ref(false);
const detailsError = ref<string | null>(null);
const confirmingDelete = ref(false);
const deleting = ref(false);
// Keep the parent-supplied overview as the source of truth for the
// header. If the parent didn't pass one (rare), we read the values
// out of the fetched details instead.
const overviewFallback = ref<FeedbackRunOverview | null>(null);

const overview = computed<FeedbackRunOverview | null>(
  () => props.overview ?? overviewFallback.value,
);

const libraryItemTitle = computed(() => {
  const item = overview.value
    ? libraryStore.items.find((i) => i.id === overview.value?.libraryItemId)
    : null;
  return item?.title ?? overview.value?.libraryItemId ?? '';
});

const parsedNotes = computed<FeedbackRunNoteDetail[]>(() => {
  if (!detailsJson.value) return [];
  try {
    const raw = JSON.parse(detailsJson.value);
    return Array.isArray(raw) ? (raw as FeedbackRunNoteDetail[]) : [];
  } catch {
    return [];
  }
});

/** Total note count for the timeline (from details, not overview,
 *  so the two numbers can't drift). */
const timelineNoteCount = computed(() => parsedNotes.value.length);

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadDetails(id: number): Promise<void> {
  loadingDetails.value = true;
  detailsError.value = null;
  detailsJson.value = null;
  try {
    const fetched = await getFeedbackRunDetails(id);
    if (!fetched) {
      detailsError.value = 'Run not found — it may have been deleted.';
      return;
    }
    detailsJson.value = fetched.detailsJson;
    // If the parent didn't supply an overview, keep the one that
    // came back from the details fetch so the header can render.
    // Shallow-copy the non-blob fields out; eslint-noise-free.
    if (!props.overview) {
      overviewFallback.value = {
        id: fetched.id,
        sessionId: fetched.sessionId,
        exerciseId: fetched.exerciseId,
        libraryItemId: fetched.libraryItemId,
        endedAt: fetched.endedAt,
        durationSeconds: fetched.durationSeconds,
        strictnessPreset: fetched.strictnessPreset,
        totalNotes: fetched.totalNotes,
        hitCount: fetched.hitCount,
        missedCount: fetched.missedCount,
        extraCount: fetched.extraCount,
        pitchPerfect: fetched.pitchPerfect,
        pitchGood: fetched.pitchGood,
        pitchAcceptable: fetched.pitchAcceptable,
        pitchWrong: fetched.pitchWrong,
        timingPerfect: fetched.timingPerfect,
        timingGood: fetched.timingGood,
        timingAcceptable: fetched.timingAcceptable,
        timingWrong: fetched.timingWrong,
        longestStreak: fetched.longestStreak,
        overallScore: fetched.overallScore,
        suggestSlowDown: fetched.suggestSlowDown,
        suggestStringMuting: fetched.suggestStringMuting,
      };
    }
  } catch (err) {
    detailsError.value = String(err ?? 'Failed to load run details.');
  } finally {
    loadingDetails.value = false;
  }
}

watch(
  () => props.runId,
  (id) => {
    if (Number.isFinite(id)) {
      void loadDetails(id);
    }
  },
  { immediate: true },
);

async function handleDelete(): Promise<void> {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const ok = await deleteFeedbackRun(props.runId);
    if (ok) {
      emit('deleted', props.runId);
    }
  } finally {
    deleting.value = false;
    confirmingDelete.value = false;
  }
}

const pitchTimingSplit = computed(() => {
  const o = overview.value;
  if (!o) return null;
  return computePitchTimingSplit(o);
});

// Pitch / timing histogram rows for the two stacked tables.
const pitchRows = computed(() => {
  const o = overview.value;
  if (!o) return [];
  return [
    { label: 'Perfect', count: o.pitchPerfect, key: 'perfect' },
    { label: 'Good', count: o.pitchGood, key: 'good' },
    { label: 'Acceptable', count: o.pitchAcceptable, key: 'acceptable' },
    { label: 'Wrong', count: o.pitchWrong, key: 'wrong' },
  ] as const;
});
const timingRows = computed(() => {
  const o = overview.value;
  if (!o) return [];
  return [
    { label: 'Perfect', count: o.timingPerfect, key: 'perfect' },
    { label: 'Good', count: o.timingGood, key: 'good' },
    { label: 'Acceptable', count: o.timingAcceptable, key: 'acceptable' },
    { label: 'Wrong', count: o.timingWrong, key: 'wrong' },
  ] as const;
});

/** Colour per note for the timeline strip — same band colours used
 *  by the live overlay so the two surfaces feel like one feature. */
function timelineColor(n: FeedbackRunNoteDetail): string {
  if (n.o === 'extra') return '#64748b';
  if (n.o === 'missed') return '#94a3b8';
  // Hit — colour by the worse of pitch / timing.
  const ratings: ('perfect' | 'good' | 'acceptable' | 'wrong')[] = [];
  if (n.pa) ratings.push(n.pa);
  if (n.ta) ratings.push(n.ta);
  if (ratings.includes('wrong')) return '#ef4444';
  if (ratings.every((r) => r === 'perfect')) return '#22c55e';
  if (ratings.includes('acceptable')) return '#eab308';
  return '#84cc16';
}
</script>

<template>
  <div class="run-detail">
    <header class="run-detail-header">
      <BaseButton
        variant="ghost"
        size="sm"
        type="button"
        class="back-button"
        @click="emit('back')"
      >
        <ArrowLeft :size="16" />
        Back
      </BaseButton>
      <div class="header-title-block">
        <h2>Feedback Run</h2>
        <p class="header-subtitle">
          {{ libraryItemTitle }} · {{ formatDate(overview?.endedAt) }}
        </p>
      </div>
      <div class="header-actions">
        <AppTooltip text="Delete this run">
          <BaseButton
            v-if="!confirmingDelete"
            variant="ghost"
            size="sm"
            type="button"
            class="delete-button"
            @click="confirmingDelete = true"
          >
            <Trash2 :size="14" />
            Delete
          </BaseButton>
        </AppTooltip>
        <div
          v-if="confirmingDelete"
          class="delete-confirm"
          role="alertdialog"
        >
          <span>Delete this run?</span>
          <BaseButton
            variant="filled-accent"
            size="sm"
            type="button"
            :disabled="deleting"
            @click="handleDelete"
          >
            Delete
          </BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            type="button"
            :disabled="deleting"
            @click="confirmingDelete = false"
          >
            Cancel
          </BaseButton>
        </div>
      </div>
    </header>

    <section class="score-section">
      <span class="score-label">Score</span>
      <span class="score-value">{{ overview?.overallScore ?? 0 }}</span>
      <span class="score-max">/ 100</span>
      <span class="score-strictness">
        {{ capitalize(overview?.strictnessPreset ?? '') }} strictness
      </span>
    </section>

    <section class="counts-row">
      <div>
        <span class="count-label">Hit</span>
        <span class="count-value">{{ overview?.hitCount ?? 0 }}</span>
      </div>
      <div>
        <span class="count-label">Missed</span>
        <span class="count-value">{{ overview?.missedCount ?? 0 }}</span>
      </div>
      <div>
        <span class="count-label">Extra</span>
        <span class="count-value">{{ overview?.extraCount ?? 0 }}</span>
      </div>
      <div>
        <span class="count-label">Best Streak</span>
        <span class="count-value">{{ overview?.longestStreak ?? 0 }}</span>
      </div>
      <div>
        <span class="count-label">Duration</span>
        <span class="count-value">{{
          formatDuration(overview?.durationSeconds)
        }}</span>
      </div>
    </section>

    <section class="histograms">
      <div class="histogram">
        <h3>Pitch</h3>
        <ul>
          <li
            v-for="row in pitchRows"
            :key="row.key"
          >
            <span
              class="hist-dot"
              :class="`hist-dot--${row.key}`"
            />
            <span class="hist-label">{{ row.label }}</span>
            <span class="hist-value">{{ row.count }}</span>
          </li>
        </ul>
      </div>
      <div class="histogram">
        <h3>Timing</h3>
        <ul>
          <li
            v-for="row in timingRows"
            :key="row.key"
          >
            <span
              class="hist-dot"
              :class="`hist-dot--${row.key}`"
            />
            <span class="hist-label">{{ row.label }}</span>
            <span class="hist-value">{{ row.count }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section
      v-if="pitchTimingSplit && (overview?.totalNotes ?? 0) > 0"
      class="pt-split"
      aria-label="Pitch vs timing accuracy"
    >
      <header class="section-header">
        <h3>Pitch vs timing</h3>
      </header>
      <div class="pt-split-bars">
        <div class="pt-split-row">
          <span class="pt-split-label">Pitch</span>
          <div class="pt-split-track">
            <div
              class="pt-split-fill pt-split-fill--pitch"
              :class="{
                'pt-split-fill--focus':
                  pitchTimingSplit.recommendation === 'pitch',
              }"
              :style="{
                width: `${Math.round(pitchTimingSplit.pitchAccuracy * 100)}%`,
              }"
            />
          </div>
          <span class="pt-split-value">
            {{ Math.round(pitchTimingSplit.pitchAccuracy * 100) }} %
          </span>
        </div>
        <div class="pt-split-row">
          <span class="pt-split-label">Timing</span>
          <div class="pt-split-track">
            <div
              class="pt-split-fill pt-split-fill--timing"
              :class="{
                'pt-split-fill--focus':
                  pitchTimingSplit.recommendation === 'timing',
              }"
              :style="{
                width: `${Math.round(pitchTimingSplit.timingAccuracy * 100)}%`,
              }"
            />
          </div>
          <span class="pt-split-value">
            {{ Math.round(pitchTimingSplit.timingAccuracy * 100) }} %
          </span>
        </div>
      </div>
      <p
        class="pt-split-recommendation"
        :class="`pt-split-recommendation--${pitchTimingSplit.recommendation}`"
      >
        {{ pitchTimingSplit.recommendationText }}
      </p>
    </section>

    <p
      v-if="overview?.suggestSlowDown"
      class="suggestion"
    >
      The score indicates some notes slipped — slowing down by 10% is often
      enough to lock them in on the next run.
    </p>
    <p
      v-if="overview?.suggestStringMuting"
      class="suggestion"
    >
      A lot of notes came through unclear — usually a string-muting issue.
      Palm-muting with the picking hand and double-checking left-hand placement
      tends to help.
    </p>

    <section class="timeline-section">
      <header class="section-header">
        <h3>Note timeline</h3>
        <span
          v-if="!loadingDetails && timelineNoteCount > 0"
          class="section-count"
        >
          {{ timelineNoteCount }} notes
        </span>
      </header>
      <div
        v-if="loadingDetails"
        class="timeline-empty"
      >
        Loading…
      </div>
      <div
        v-else-if="detailsError"
        class="timeline-error"
      >
        {{ detailsError }}
      </div>
      <div
        v-else-if="parsedNotes.length === 0"
        class="timeline-empty"
      >
        No per-note detail was recorded for this run.
      </div>
      <div
        v-else
        class="timeline-strip"
        :aria-label="`Per-note result strip of ${timelineNoteCount} notes`"
      >
        <span
          v-for="(n, idx) in parsedNotes"
          :key="idx"
          class="timeline-cell"
          :style="{ backgroundColor: timelineColor(n) }"
          :title="`${n.n} · ${n.o}${n.pa ? ` · pitch ${n.pa}` : ''}${n.ta ? ` · timing ${n.ta}` : ''}`"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.run-detail {
  display: grid;
  gap: 18px;
  max-width: 840px;
}

.run-detail-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.header-title-block h2 {
  margin: 0;
  font-size: 1.2rem;
}

.header-subtitle {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.delete-button {
  color: #ef4444;
}

.delete-button:hover {
  color: #f87171;
}

.delete-confirm {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
  color: var(--text);
  font-size: 0.82rem;
}

.score-section {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.score-label {
  color: var(--text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.score-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.score-max {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.score-strictness {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.counts-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.counts-row > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.count-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.count-value {
  font-size: 1.15rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.histograms {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.histogram {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 14px 16px;
}

.histogram h3 {
  margin: 0 0 10px;
  font-size: 0.9rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.histogram ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.histogram li {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}

.hist-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.hist-dot--perfect {
  background: #22c55e;
}
.hist-dot--good {
  background: #84cc16;
}
.hist-dot--acceptable {
  background: #eab308;
}
.hist-dot--wrong {
  background: #ef4444;
}

.pt-split {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
}

.pt-split-bars {
  display: grid;
  gap: 8px;
}

.pt-split-row {
  display: grid;
  grid-template-columns: 60px 1fr 48px;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.pt-split-label {
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.72rem;
}

.pt-split-track {
  height: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.pt-split-fill {
  height: 100%;
  background: color-mix(in srgb, var(--accent) 55%, transparent);
  border-radius: 6px;
  transition: width 160ms ease;
}

.pt-split-fill--focus {
  background: var(--accent);
}

.pt-split-value {
  text-align: right;
  color: var(--text);
  font-weight: 600;
}

.pt-split-recommendation {
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text);
  font-size: 0.85rem;
  line-height: 1.4;
  border-left: 3px solid color-mix(in srgb, var(--accent) 40%, transparent);
}

.pt-split-recommendation--pitch,
.pt-split-recommendation--timing {
  border-left-color: var(--accent);
}

.suggestion {
  margin: 0;
  padding: 10px 14px;
  color: var(--text);
  font-size: 0.88rem;
  line-height: 1.4;
  background: rgba(var(--accent-rgb, 34, 197, 94), 0.06);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
}

.timeline-section {
  display: grid;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.section-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.section-count {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.timeline-empty,
.timeline-error {
  padding: 12px 14px;
  color: var(--text-muted);
  font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
}

.timeline-error {
  color: #f87171;
}

/* One pixel-column per note, colour-coded by outcome/accuracy. No
   per-note interactivity yet (hover title serves as tooltip); a
   richer chart can slot in here in a follow-up without changing
   the persistence contract. */
.timeline-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 36px;
}

.timeline-cell {
  width: 6px;
  height: 24px;
  border-radius: 2px;
  flex-shrink: 0;
  cursor: help;
}
</style>
