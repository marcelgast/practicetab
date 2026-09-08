<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ChevronDown } from 'lucide-vue-next';
import { useStatsStore } from '../stores/stats';
import { useLibraryStore } from '../stores/library';
import type { LibraryItemStats, PerExerciseStats } from '../domain/stats/types';
import type { FeedbackRunOverview } from '../services/feedbackRunCommands';
import { formatMinutes } from '../domain/stats/formatters';
import StatsHome from '../components/stats/StatsHome.vue';
import StatsSessionToday from '../components/stats/StatsSessionToday.vue';
import StatsTrends from '../components/stats/StatsTrends.vue';
import StatsOverview from '../components/stats/StatsOverview.vue';
import SessionJournalSection from '../components/stats/SessionJournalSection.vue';
import StatsExerciseDetail from '../components/stats/StatsExerciseDetail.vue';
import StatsLibraryDetail from '../components/stats/StatsLibraryDetail.vue';
import StatsFeedbackRunDetail from '../components/stats/StatsFeedbackRunDetail.vue';
import FeedbackRunsList from '../components/stats/FeedbackRunsList.vue';

const statsStore = useStatsStore();
const libraryStore = useLibraryStore();
const route = useRoute();

const activeTab = ref<'general' | 'indepth' | 'feedback'>('general');
const selectedSection = ref<
  'session' | 'trends' | 'overview' | 'journal' | null
>(null);
const selectedExerciseId = ref<string | null>(null);
const expandedPlans = ref(new Set<string>());
const inDepthSubTab = ref<'practice' | 'library'>('practice');
const selectedLibraryItemId = ref<string | null>(null);
/**
 * When set, the detail view for a specific feedback run takes over
 * the Teleport target — regardless of which tab the user came in
 * from. Cleared on Back / Delete. This lets a "Details" click from
 * an Exercise or Library page's Feedback-history list hand off to
 * the same detail component without a tab-jump.
 */
const selectedFeedbackRunId = ref<number | null>(null);

const stats = computed(() => statsStore.snapshot);

const generalSections = [
  { id: 'session' as const, label: 'Session / Today' },
  { id: 'trends' as const, label: 'Trends / Long-term' },
  { id: 'overview' as const, label: 'Overview' },
  { id: 'journal' as const, label: 'Session Journal' },
];

const selectedExercise = computed<PerExerciseStats | null>(() => {
  if (!stats.value || !selectedExerciseId.value) {
    return null;
  }
  for (const group of stats.value.perExercise) {
    const found = group.exercises.find(
      (e) => e.exerciseId === selectedExerciseId.value,
    );
    if (found) {
      return found;
    }
  }
  return null;
});

const libraryStats = computed<LibraryItemStats[]>(
  () => stats.value?.libraryStats ?? [],
);
const selectedLibraryItem = computed<LibraryItemStats | null>(
  () =>
    libraryStats.value.find(
      (item) => item.itemId === selectedLibraryItemId.value,
    ) ?? null,
);

function kindLabel(kind: 'tab' | 'audio'): string {
  return kind === 'tab' ? 'Tab' : 'Audio';
}

const allFeedbackRuns = computed<FeedbackRunOverview[]>(
  () => stats.value?.feedbackRuns ?? [],
);

const selectedFeedbackRun = computed<FeedbackRunOverview | null>(
  () =>
    allFeedbackRuns.value.find((r) => r.id === selectedFeedbackRunId.value) ??
    null,
);

/**
 * Context blurb for the top-level Feedback list — shows the tab
 * title, since runs in this view can span any tab. Per-exercise /
 * per-library detail pages scope their own lists to a single item
 * and hide this column via the optional `contextFor` prop.
 */
function contextForRun(run: FeedbackRunOverview): string {
  const item = libraryStore.items.find((i) => i.id === run.libraryItemId);
  return item?.title ?? run.libraryItemId;
}

function openFeedbackDetail(id: number): void {
  selectedFeedbackRunId.value = id;
}

function closeFeedbackDetail(): void {
  selectedFeedbackRunId.value = null;
}

function onFeedbackDeleted(id: number): void {
  // Refresh the store so the list drops the deleted row; then close
  // the detail view.
  void statsStore.refresh();
  if (selectedFeedbackRunId.value === id) {
    selectedFeedbackRunId.value = null;
  }
}

function togglePlan(planId: string): void {
  const next = new Set(expandedPlans.value);
  if (next.has(planId)) {
    next.delete(planId);
  } else {
    next.add(planId);
  }
  expandedPlans.value = next;
}

function refreshStats(): void {
  void statsStore.refresh();
}

onMounted(refreshStats);
onActivated(refreshStats);
watch(
  () => route.name,
  (name) => {
    if (name === 'Stats') {
      refreshStats();
    }
  },
);

/**
 * Close the feedback-run detail view whenever the user navigates
 * anywhere else in the Stats page — switches tab, picks a different
 * exercise / library item, opens a General section. Without this,
 * the detail view "sticks" over the Teleport target and hides the
 * view the user actually just asked for. Using a single watch over
 * a tuple of every nav state keeps the rule in one spot rather than
 * sprinkling `selectedFeedbackRunId.value = null` across every click
 * handler.
 */
watch(
  () =>
    [
      activeTab.value,
      selectedSection.value,
      selectedExerciseId.value,
      selectedLibraryItemId.value,
      inDepthSubTab.value,
    ] as const,
  () => {
    if (selectedFeedbackRunId.value !== null) {
      selectedFeedbackRunId.value = null;
    }
  },
);
</script>

<template>
  <!-- Left pane: stats navigation -->
  <section class="page stats-page">
    <header class="page-header">
      <div class="page-title">
        <h1>Stats</h1>
      </div>
    </header>

    <!-- Tab switcher -->
    <div
      class="type-filter-tabs"
      data-guide="stats.nav"
    >
      <button
        class="type-filter-tab"
        :class="{ 'type-filter-tab--active': activeTab === 'general' }"
        type="button"
        @click="activeTab = 'general'"
      >
        General
      </button>
      <button
        class="type-filter-tab"
        :class="{ 'type-filter-tab--active': activeTab === 'indepth' }"
        type="button"
        data-guide="stats.indepth-tab"
        @click="activeTab = 'indepth'"
      >
        In-Depth
      </button>
      <button
        class="type-filter-tab"
        :class="{ 'type-filter-tab--active': activeTab === 'feedback' }"
        type="button"
        data-guide="stats.feedback-tab"
        @click="activeTab = 'feedback'"
      >
        Feedback
      </button>
    </div>

    <!-- Loading / error states -->
    <section
      v-if="statsStore.error"
      class="stats-empty"
    >
      {{ statsStore.error }}
    </section>
    <section
      v-else-if="statsStore.loading || !stats"
      class="stats-empty"
    >
      Loading stats...
    </section>

    <!-- General nav -->
    <template v-else-if="activeTab === 'general'">
      <nav
        class="stats-nav"
        data-guide="stats.overview"
      >
        <button
          v-for="section in generalSections"
          :key="section.id"
          :class="{ active: selectedSection === section.id }"
          type="button"
          @click="selectedSection = section.id"
        >
          {{ section.label }}
        </button>
      </nav>
    </template>

    <!-- Feedback tab: full list of runs across every tab/exercise -->
    <template v-else-if="activeTab === 'feedback' && stats">
      <div class="feedback-nav-panel">
        <FeedbackRunsList
          :runs="allFeedbackRuns"
          :selected-id="selectedFeedbackRunId"
          :context-for="contextForRun"
          @select="openFeedbackDetail"
        />
      </div>
    </template>

    <!-- In-Depth with sub-tabs -->
    <template v-else-if="stats">
      <div class="sub-tabs">
        <button
          class="sub-tab"
          :class="{ 'sub-tab--active': inDepthSubTab === 'practice' }"
          type="button"
          @click="inDepthSubTab = 'practice'"
        >
          Practice
        </button>
        <button
          class="sub-tab"
          :class="{ 'sub-tab--active': inDepthSubTab === 'library' }"
          type="button"
          @click="inDepthSubTab = 'library'"
        >
          Library
        </button>
      </div>

      <!-- Practice sub-tab: exercise tree -->
      <template v-if="inDepthSubTab === 'practice'">
        <div
          v-if="stats.perExercise.length === 0"
          class="stats-empty"
        >
          No exercise data yet
        </div>
        <div
          v-else
          class="exercise-tree"
        >
          <div
            v-for="group in stats.perExercise"
            :key="group.planId"
            class="plan-group"
          >
            <button
              class="plan-header"
              type="button"
              @click="togglePlan(group.planId)"
            >
              <ChevronDown
                class="chevron"
                :class="{ rotated: !expandedPlans.has(group.planId) }"
              />
              <span class="plan-title">{{ group.planTitle }}</span>
            </button>
            <div
              v-if="expandedPlans.has(group.planId)"
              class="plan-exercises"
            >
              <button
                v-for="ex in group.exercises"
                :key="ex.exerciseId"
                class="exercise-item"
                :class="{ active: selectedExerciseId === ex.exerciseId }"
                type="button"
                @click="selectedExerciseId = ex.exerciseId"
              >
                <span class="exercise-name">{{ ex.exerciseTitle }}</span>
                <span class="exercise-time">{{
                  formatMinutes(ex.totalTimeMinutes)
                }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Library sub-tab -->
      <template v-else>
        <div
          v-if="libraryStats.length === 0"
          class="stats-empty"
        >
          No library data yet
        </div>
        <div
          v-else
          class="library-list"
        >
          <button
            v-for="item in libraryStats"
            :key="item.itemId"
            class="library-item"
            :class="{ active: selectedLibraryItemId === item.itemId }"
            type="button"
            @click="selectedLibraryItemId = item.itemId"
          >
            <span class="library-kind-badge">{{ kindLabel(item.kind) }}</span>
            <span class="library-name">{{ item.itemTitle }}</span>
            <span class="library-time">{{
              formatMinutes(item.totalTimeMinutes)
            }}</span>
          </button>
        </div>
      </template>
    </template>
  </section>

  <!-- Right pane: stats detail content (replaces player panel) -->
  <Teleport to="#stats-detail-target">
    <div
      v-if="stats && !statsStore.loading && !statsStore.error"
      class="stats-detail"
    >
      <!-- Feedback run detail takes priority regardless of which
           tab the user came from. Closed via its own Back button
           (clears selectedFeedbackRunId). -->
      <StatsFeedbackRunDetail
        v-if="selectedFeedbackRunId !== null"
        :run-id="selectedFeedbackRunId"
        :overview="selectedFeedbackRun"
        @back="closeFeedbackDetail"
        @deleted="onFeedbackDeleted"
      />
      <!-- General sections -->
      <template v-else-if="activeTab === 'general'">
        <StatsHome
          v-if="selectedSection === null"
          :stats="stats"
        />
        <StatsSessionToday
          v-else-if="selectedSection === 'session'"
          :stats="stats"
        />
        <StatsTrends
          v-else-if="selectedSection === 'trends'"
          :stats="stats"
        />
        <SessionJournalSection v-else-if="selectedSection === 'journal'" />
        <StatsOverview
          v-else
          :stats="stats"
        />
      </template>
      <!-- Feedback tab: empty-state when no run is selected -->
      <template v-else-if="activeTab === 'feedback'">
        <div
          v-if="allFeedbackRuns.length === 0"
          class="stats-empty"
        >
          No feedback runs yet. Turn on Feedback during playback to record one.
        </div>
        <div
          v-else
          class="stats-empty"
        >
          Select a run to view its details.
        </div>
      </template>
      <!-- In-Depth detail -->
      <template v-else>
        <StatsExerciseDetail
          v-if="inDepthSubTab === 'practice' && selectedExercise"
          :exercise="selectedExercise"
          :feedback-runs="allFeedbackRuns"
          @open-feedback="openFeedbackDetail"
        />
        <StatsLibraryDetail
          v-else-if="inDepthSubTab === 'library' && selectedLibraryItem"
          :item="selectedLibraryItem"
          :feedback-runs="allFeedbackRuns"
          @open-feedback="openFeedbackDetail"
        />
        <div
          v-else
          class="stats-empty"
        >
          Select an item to view detailed stats
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.page-title {
  width: 100%;
  text-align: center;
}

.type-filter-tabs {
  display: grid;
  /* Three equal columns — General / In-Depth / Feedback. The earlier
     `1fr 1fr` left the third tab wrapping onto its own row. */
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
  margin-bottom: 16px;
}

.type-filter-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  padding: 10px 0;
  cursor: pointer;
  text-align: center;
  outline: none;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.type-filter-tab:hover {
  color: var(--text);
}

.type-filter-tab--active {
  border-bottom-color: var(--accent);
  color: var(--accent);
}

.stats-empty {
  border: 1px solid var(--accent);
  border-radius: 16px;
  padding: 16px;
  text-align: center;
  color: var(--muted);
}

.stats-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  overflow: auto;
  min-width: 0;
}

/* General nav items */
.stats-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stats-nav button {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 10px 16px;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: inherit;
  transition:
    background 0.15s,
    color 0.15s;
}

.stats-nav button:hover {
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  color: var(--text);
}

.stats-nav button.active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-weight: 600;
}

/* Exercise tree */
.exercise-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.plan-group {
  display: flex;
  flex-direction: column;
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--text);
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;
  transition: background 0.15s;
}

.plan-header:hover {
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
}

.plan-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.chevron.rotated {
  transform: rotate(-90deg);
}

.plan-exercises {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-left: 16px;
}

.exercise-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 8px;
  font-size: 0.83rem;
  font-family: inherit;
  transition:
    background 0.15s,
    color 0.15s;
}

.exercise-item:hover {
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  color: var(--text);
}

.exercise-item.active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-weight: 600;
}

.exercise-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exercise-time {
  flex-shrink: 0;
  font-size: 0.78rem;
  opacity: 0.7;
}

/* Sub-tabs (smaller version of main tabs) */
.sub-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  margin-bottom: 12px;
}

.sub-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  padding: 6px 0;
  cursor: pointer;
  text-align: center;
  outline: none;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.sub-tab:hover {
  color: var(--text);
}

.sub-tab--active {
  border-bottom-color: var(--accent);
  color: var(--accent);
}

/* Library list */
.library-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.library-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 8px;
  font-size: 0.83rem;
  font-family: inherit;
  transition:
    background 0.15s,
    color 0.15s;
}

.library-item:hover {
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
  color: var(--text);
}

.library-item.active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-weight: 600;
}

.library-kind-badge {
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Feedback tab left-pane wrapper — the list itself handles its own
   row spacing and hover states. */
.feedback-nav-panel {
  padding: 8px;
}

.library-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-time {
  flex-shrink: 0;
  font-size: 0.78rem;
  opacity: 0.7;
  margin-left: auto;
}
</style>
