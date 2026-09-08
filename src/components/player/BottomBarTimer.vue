<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePracticeTimerStore } from '../../stores/practiceTimer';
import { usePracticeUiStore } from '../../stores/practiceUi';
import { usePracticeStore } from '../../stores/practice';
import { usePlayerStore } from '../../stores/player';
import { useSongStore } from '../../stores/song';
import { useMetronomeStore } from '../../stores/metronome';
import { useLibraryStore } from '../../stores/library';
import { useAppStore } from '../../stores/app';
import { useTicker } from '../../services/useTicker';
import { formatDurationHms } from '../../domain/time';
import { hasJournalContent } from '../../domain/sessionJournal';
import { NotebookPen } from 'lucide-vue-next';
import IconButton from '../ui/IconButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import SessionGoalDialog from '../practice/SessionGoalDialog.vue';
import SessionReviewOverlay from '../practice/SessionReviewOverlay.vue';

const timerStore = usePracticeTimerStore();
const uiStore = usePracticeUiStore();
const practiceStore = usePracticeStore();
const playerStore = usePlayerStore();
const songStore = useSongStore();
const metronomeStore = useMetronomeStore();
const libraryStore = useLibraryStore();
const appStore = useAppStore();

// Tick so elapsedSec animates in the UI without burning a global setInterval.
useTicker(computed(() => timerStore.isRunning));

const isPlaybackActive = computed(
  () =>
    playerStore.model.playback === 'playing' ||
    songStore.isPlaying ||
    metronomeStore.isRunning,
);

const expandedExercise = computed(() => {
  const id = uiStore.expandedExerciseId;
  if (!id) return null;
  return practiceStore.exercises.find((exercise) => exercise.id === id) ?? null;
});

/** Currently-loaded library item (tab or song) opened via the Library
 * page — this takes precedence over the exercise badge so the timer
 * reflects what the user is actually working on right now. */
const loadedLibraryItem = computed(() => {
  if (playerStore.playbackSource !== 'library') return null;
  const tabId = playerStore.model.currentLibraryItemId;
  if (tabId) {
    return libraryStore.items.find((entry) => entry.id === tabId) ?? null;
  }
  const songId = songStore.loadedItemId;
  if (songId) {
    return libraryStore.items.find((entry) => entry.id === songId) ?? null;
  }
  return null;
});

const badgeLabel = computed(() => {
  if (loadedLibraryItem.value) return loadedLibraryItem.value.title;
  if (expandedExercise.value) return expandedExercise.value.title;
  return 'General';
});

const elapsedLabel = computed(() => formatDurationHms(timerStore.elapsedSec));

const tooltipText = computed(() =>
  timerStore.isRunning ? 'Pause Timer' : 'Start Timer (T)',
);

// ---- Session Journal (PR 4.3) ------------------------------------------
// The journal icon is both a visual reminder that journaling is on and the
// click target for the review overlay. Visible whenever the setting is on —
// we used to gate on "has active session" as well, but the session gets
// lazily created on first timer start and that made the icon disappear for
// fresh installs until the first click, which was confusing.
const journalingEnabled = computed(() => appStore.journalingEnabled);
const showJournalIndicator = computed(() => journalingEnabled.value);
const timerTextInteractive = computed(
  () => showJournalIndicator.value && !isPlaybackActive.value,
);
const timerTextTooltip = computed(() =>
  timerTextInteractive.value ? 'Open session review' : 'Session timer',
);

const reviewOverlayOpen = ref(false);
/**
 * Goal dialog open-state lives on `practiceStore.goalDialogOpen`
 * so App.vue can open it once the startup checks (updates +
 * licensing) finish, and this click handler can reopen it if the
 * user dismissed it via Escape / backdrop. Single source of
 * truth keeps the two entry points from racing.
 */
const goalDialogOpen = computed({
  get: () => practiceStore.goalDialogOpen,
  set: (value) => practiceStore.setGoalDialogOpen(value),
});

/**
 * Primary play-button click. Splits into three paths depending on
 * current state — timer running, goal-prompt due, or plain start.
 * The goal-prompt branch goes through the shared practice-store
 * helper so its guards (journaling setting, session existence,
 * not-already-dismissed) stay in one place.
 */
async function handleTimerClick(): Promise<void> {
  if (timerStore.isRunning) {
    await timerStore.toggle();
    return;
  }
  await practiceStore.openGoalDialogIfAppropriate();
  if (practiceStore.goalDialogOpen) return;
  await timerStore.toggle();
}

async function handleGoalSave(payload: {
  goalText: string;
  dontShowAgain: boolean;
}): Promise<void> {
  // The dontShowAgain toggle is a separate persistent setting from
  // the goal save itself — apply it eagerly so the user's explicit
  // opt-out persists even if the goal write fails.
  if (payload.dontShowAgain) {
    appStore.setJournalingEnabled(false);
  }
  try {
    await practiceStore.setSessionGoal(payload.goalText);
    // Only mark dismissed AFTER a successful save. If the DB write
    // fails the dialog stays open and the user can retry; if we
    // had set this earlier the next session-start click would have
    // suppressed the prompt without ever recording the goal.
    practiceStore.markGoalPromptDismissed();
    goalDialogOpen.value = false;
    if (!timerStore.isRunning) {
      await timerStore.toggle();
    }
  } catch (error) {
    appStore.setLastError(`Saving goal failed: ${String(error)}`);
    // Keep dialog open so the user can fix the issue and retry.
  }
}

async function handleGoalSkip(payload: {
  dontShowAgain: boolean;
}): Promise<void> {
  goalDialogOpen.value = false;
  if (payload.dontShowAgain) {
    appStore.setJournalingEnabled(false);
  }
  practiceStore.markGoalPromptDismissed();
  if (!timerStore.isRunning) {
    await timerStore.toggle();
  }
}

function handleGoalDismiss(): void {
  // Escape / backdrop: close without starting the timer AND
  // without flipping the don't-show-again flag — the next
  // session-start click will re-prompt.
  goalDialogOpen.value = false;
}

async function handleTimerTextClick(): Promise<void> {
  if (!timerTextInteractive.value) return;
  // Needs a session to attach the review to. If the user hasn't
  // clicked play yet today, the lazy `ensureActiveSession` creates
  // one now so the overlay has something to work against.
  await practiceStore.ensureActiveSession();
  reviewOverlayOpen.value = true;
}

async function handleReviewSave(payload: {
  reviewText: string;
  goalPercent: number | null;
  goalReached: boolean | null;
}): Promise<void> {
  // First-open + Save without typing / sliding / checking would
  // otherwise persist (reviewText: '', goalPercent: 0, goalReached:
  // false). `hasJournalContent` then flags that as a real journal
  // entry and the session shows up in Stats with all dashes — pure
  // noise. Skip the write entirely on first-time empty-Save. Re-
  // saves on a session that ALREADY has journal content always go
  // through, so users can still clear text out of an existing entry.
  const session = practiceStore.activeSession;
  const isAllEmpty =
    payload.reviewText.length === 0 &&
    payload.goalPercent === null &&
    payload.goalReached === null;
  if (isAllEmpty && (!session || !hasJournalContent(session))) {
    reviewOverlayOpen.value = false;
    return;
  }
  try {
    await practiceStore.setSessionReview({
      reviewText: payload.reviewText,
      goalPercent: payload.goalPercent,
      goalReached: payload.goalReached,
    });
    reviewOverlayOpen.value = false;
  } catch (error) {
    appStore.setLastError(`Saving review failed: ${String(error)}`);
    // Keep overlay open. The user can retry or cancel.
  }
}

function handleReviewCancel(): void {
  reviewOverlayOpen.value = false;
}

const activeSessionForReview = computed(() => practiceStore.activeSession);
</script>

<template>
  <div
    class="bottom-bar-timer"
    :class="{ running: timerStore.isRunning }"
  >
    <AppTooltip
      :text="tooltipText"
      side="top"
      :side-offset="6"
    >
      <IconButton
        class="timer-button"
        data-guide="player.session-timer"
        :disabled="isPlaybackActive"
        :aria-label="tooltipText"
        @click="handleTimerClick"
      >
        <svg
          v-if="!timerStore.isRunning"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect
            x="5"
            y="4"
            width="5"
            height="16"
            rx="0.5"
          />
          <rect
            x="14"
            y="4"
            width="5"
            height="16"
            rx="0.5"
          />
        </svg>
      </IconButton>
    </AppTooltip>
    <AppTooltip
      :text="timerTextTooltip"
      side="top"
      :side-offset="6"
    >
      <button
        type="button"
        class="timer-text"
        :class="{ interactive: timerTextInteractive }"
        :disabled="!timerTextInteractive"
        :aria-label="timerTextTooltip"
        @click="handleTimerTextClick"
      >
        <span class="elapsed">{{ elapsedLabel }}</span>
        <span
          class="badge"
          :title="badgeLabel"
        >{{ badgeLabel }}</span>
        <NotebookPen
          v-if="showJournalIndicator"
          class="journal-indicator"
          :size="22"
          aria-hidden="true"
          focusable="false"
        />
      </button>
    </AppTooltip>
    <SessionGoalDialog
      :open="goalDialogOpen"
      @save="handleGoalSave"
      @skip="handleGoalSkip"
      @dismiss="handleGoalDismiss"
    />
    <SessionReviewOverlay
      :open="reviewOverlayOpen"
      :goal-text="activeSessionForReview?.goalText ?? null"
      :review-text="activeSessionForReview?.reviewText ?? null"
      :goal-percent="activeSessionForReview?.goalPercent ?? null"
      :goal-reached="activeSessionForReview?.goalReached ?? null"
      @save="handleReviewSave"
      @cancel="handleReviewCancel"
    />
  </div>
</template>

<style scoped>
.bottom-bar-timer {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
}

.bottom-bar-timer.running {
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.timer-button {
  width: 44px;
  height: 44px;
}

/* Override the IconButton default (20px) so the timer glyph matches the
   transport controls visually instead of reading as a tiny chevron. */
.timer-button :deep(svg) {
  width: 24px;
  height: 24px;
}

.timer-text {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  grid-template-areas:
    'elapsed book'
    'badge   book';
  column-gap: 8px;
  row-gap: 2px;
  align-items: center;
  line-height: 1.1;
  background: transparent;
  border: none;
  padding: 0 2px;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: default;
}

.timer-text.interactive {
  cursor: pointer;
}

.timer-text.interactive:hover .journal-indicator {
  color: var(--accent);
  transform: scale(1.08);
}

.timer-text:disabled {
  cursor: default;
}

.elapsed {
  grid-area: elapsed;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text);
}

.badge {
  grid-area: badge;
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journal-indicator {
  grid-area: book;
  align-self: center;
  justify-self: center;
  color: var(--text-muted);
  transition:
    color 140ms ease,
    transform 140ms ease;
}
</style>
