<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Draggable from 'vuedraggable';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import {
  ChevronDown,
  GripVertical,
  Download,
  Save,
  Pencil,
  RotateCcw,
  Share2,
  Search,
  Trash2,
  Repeat,
} from 'lucide-vue-next';
import { usePracticeStore } from '../stores/practice';
import { useLibraryStore } from '../stores/library';
import { useMetronomeStore } from '../stores/metronome';
import { formatDurationMmss } from '../domain/time';
import { stripFileExtension } from '../domain/library';
import AppTooltip from '../components/ui/AppTooltip.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import AppSelect from '../components/ui/AppSelect.vue';
import { useDraftForms } from './practice/useDraftForms';
import { useIntervalEditing } from './practice/useIntervalEditing';
import { useConfirmPopovers } from './practice/useConfirmPopovers';
import { useExerciseEditing } from './practice/useExerciseEditing';
import { usePlanManagement } from './practice/usePlanManagement';
import { useDragAndDrop } from './practice/useDragAndDrop';
import { useShareImportExport } from './practice/useShareImportExport';
import { useExerciseLinking } from './practice/useExerciseLinking';
import {
  useTabPlaybackRequest,
  type PlaybackCallbacks,
} from './practice/useTabPlaybackRequest';
import {
  useIntervalRunner,
  type IntervalRunnerStateValue,
  type IntervalRunnerCallbacks,
} from './practice/useIntervalRunner';
import { useExercisePlayback } from './practice/useExercisePlayback';
import {
  usePlaybackWatchers,
  type PlaybackWatcherCallbacks,
} from './practice/usePlaybackWatchers';

// --- Stores needed directly in template ---
const practiceStore = usePracticeStore();
const libraryStore = useLibraryStore();
const metronomeStore = useMetronomeStore();

// --- Shared refs (needed by multiple composables) ---
const pendingExerciseId = ref<string | null>(null);
const intervalRunnerState = ref<IntervalRunnerStateValue>({
  exerciseId: null,
  intervalIndex: 0,
  intervalId: null,
  remainingSeconds: 0,
  totalSeconds: 0,
  running: false,
});

// --- Zero-dep composables ---
const {
  getDraft,
  openDraft,
  getIntervalDraft,
  openIntervalDraft,
  closeIntervalDraft,
  submitIntervalDraft,
  submitDraft,
} = useDraftForms();

const {
  intervalNameEditId,
  intervalNameDraft,
  intervalBpmEditId,
  intervalBpmDraft,
  intervalDurationEditId,
  intervalDurationDraft,
  startIntervalNameEdit,
  commitIntervalNameEdit,
  cancelIntervalNameEdit,
  startIntervalBpmEdit,
  commitIntervalBpmEdit,
  cancelIntervalBpmEdit,
  startIntervalDurationEdit,
  commitIntervalDurationEdit,
  cancelIntervalDurationEdit,
  toggleIntervalAuto,
  isIntervalAutoEnabled,
  toggleIntervalRepeat,
  isIntervalRepeatEnabled,
  markIntervalDone,
} = useIntervalEditing();

// --- Exercise editing (needs isEditMode from planMgmt — uses lazy wrapper) ---
let isEditModeFn: (planId: string) => boolean = () => false;
const exerciseEdit = useExerciseEditing({
  isEditMode: (planId: string) => isEditModeFn(planId),
});

const {
  exerciseTitleEditId,
  exerciseTitleDraft,
  bpmDraftByExercise,
  exerciseBpmEditId,
  exerciseMinutesEditId,
  minutesDraftByExercise,
  notesDraftByExercise,
  notesEditId,
  startExerciseTitleEdit,
  commitExerciseTitleEdit,
  cancelExerciseTitleEdit,
  updateBpmDraft,
  startExerciseBpmEdit,
  commitExerciseBpmEdit,
  cancelExerciseBpmEdit,
  updateMinutesDraft,
  startExerciseMinutesEdit,
  commitExerciseMinutesEdit,
  cancelExerciseMinutesEdit,
  startExerciseNotesEdit,
  updateExerciseNotesDraft,
  commitExerciseNotesEdit,
} = exerciseEdit;

// --- Plan management ---
const planMgmt = usePlanManagement({
  intervalRunnerState,
  cancelExerciseTitleEdit: () => exerciseEdit.cancelExerciseTitleEdit(),
});

const {
  newPlanName,
  newPlanTimed,
  editModeByPlan,
  planList,
  planTitleEditId,
  planTitleDraft,
  exerciseTimerTick,
  isAnyEditMode,
  handleCreatePlan,
  handleDeletePlan,
  togglePlan,
  handlePlanHeaderClick,
  isPlanExpanded,
  hasExercises,
  toggleEditMode,
  isEditMode,
  startPlanTitleEdit,
  commitPlanTitleEdit,
  cancelPlanTitleEdit,
  togglePlanTimed,
  planTotalMinutes,
  itemsForPlan,
  toggleExercise,
  isExerciseExpanded,
  getExpandedExercise,
  displayPlannedMinutes,
  intervalLabel,
  intervalBpmLabel,
  sessionElapsed,
} = planMgmt;

// Wire up lazy callback now that planMgmt is available
isEditModeFn = isEditMode;

// --- Drag and drop ---
const {
  planDropIndex,
  exerciseDropIndex,
  intervalDropIndex,
  intervalsForExercise,
  getExerciseList,
  getIntervalList,
  handlePlanMove,
  handlePlanDragStart,
  handlePlanDragEnd,
  handleExerciseDragStart,
  handleExerciseDragEnd,
  handleIntervalDragStart,
  handleIntervalDragEnd,
  exerciseMoveHandler,
  exerciseChangeHandler,
  intervalMoveHandler,
  intervalChangeHandler,
} = useDragAndDrop({
  isEditMode,
  planList,
  itemsForPlan,
});

// --- Shared refs for circular dependency between linking <-> sharing ---
const missingShareResolveExerciseIdRef = ref<string | null>(null);
const missingShareSuppressedRef = ref(false);

// --- Lazy callback holders for cross-composable references ---
let resolveMissingShareTabFn: () => void = () => {};
let clearPendingPlaybackFn: () => void = () => {};

// --- Exercise linking ---
const linking = useExerciseLinking({
  isEditMode,
  pendingExerciseId,
  missingShareResolveExerciseId: missingShareResolveExerciseIdRef,
  missingShareSuppressed: missingShareSuppressedRef,
  resolveMissingShareTab: () => resolveMissingShareTabFn(),
  clearPendingPlayback: () => clearPendingPlaybackFn(),
});

const {
  linkDialogOpen,
  linkDialogKind,
  linkSearch,
  linkCandidates,
  linkedTab,
  linkedAudio,
  linkedLibraryItem,
  hasAnySources,
  hasBothSources,
  resolvedSourceLabel,
  exercisePlaybackMode,
  exerciseLinkedItems,
  applyLinkedBpm,
  exerciseLinkedItemId,
  linkActions,
  handleOpenLinked,
  handleAddNewTabFromDialog,
  handleAddNewAudioFromDialog,
  openLinkDialog,
  handleSelectLink,
  handleUnlink,
  isLinkedMissing,
  linkedFileName,
  handleLocateLinked,
  ensureTabMetronomeEnabled,
  unlinkExerciseAndUnloadPlayer,
} = linking;

// --- Share import/export ---
const sharing = useShareImportExport({
  openLinkDialog: (item, kind) => linking.openLinkDialog(item, kind),
  handleAddNewTab: (item) => linking.handleAddNewTab(item),
  linkDialogOpen: linking.linkDialogOpen,
  missingShareResolveExerciseId: missingShareResolveExerciseIdRef,
  missingShareSuppressed: missingShareSuppressedRef,
});

const {
  shareDialogOpen,
  shareIncludeTab,
  shareIncludeAudio,
  shareBusy,
  sharePlanDialogOpen,
  sharePlanSelection,
  sharePlanTouched,
  missingShareDialogOpen,
  sharePlanOptions,
  sharePlanDisplay,
  openShareDialogForPlan,
  openShareDialogForExercise,
  closeShareDialog,
  closeSharePlanDialog,
  confirmSharePlanSelection,
  handleShareImportToNewPlan,
  handleShareExport,
  handleShareImport,
  handleMissingChooseFromLibrary,
  handleMissingLocateOnDisk,
  handleMissingShareDialogOpen,
} = sharing;

// --- Confirm popovers ---
const {
  confirmDeletePlanId,
  confirmDeleteExerciseId,
  confirmDeleteIntervalId,
  confirmRemoveTabId,
  confirmDirection,
  closeAllConfirms,
  toggleDeletePlanConfirm,
  toggleDeleteExerciseConfirm,
  toggleDeleteIntervalConfirm,
  toggleRemoveTabConfirm,
  confirmDeletePlan,
  confirmDeleteExercise,
  confirmDeleteInterval,
  confirmRemoveTab,
  intervalConfirmKey,
  handleWindowClick,
} = useConfirmPopovers({
  onDeletePlan: handleDeletePlan,
  onUnlink: handleUnlink,
});

// --- Playback engine (3 composables with mutable callbacks for circular deps) ---
const tabPlaybackCallbacks: PlaybackCallbacks = {
  stopIntervalRunner: () => {},
};
const intervalRunnerCallbacks: IntervalRunnerCallbacks = {
  requestTabPlayback: () => {},
  stopMetronomeAndPlayback: async () => {},
};
const playbackWatcherCallbacks: PlaybackWatcherCallbacks = {
  startIntervalRunnerForExercise: async () => {},
  stopExerciseTimersFromPlayback: async () => {},
  stopIntervalRunner: () => {},
};

const tabPlayback = useTabPlaybackRequest({
  pendingExerciseId,
  intervalsForExercise,
  callbacks: tabPlaybackCallbacks,
  unlinkExerciseAndUnloadPlayer,
});

const intervalRunner = useIntervalRunner({
  intervalRunnerState,
  pendingExerciseId,
  pendingIntervalRestart: tabPlayback.pendingIntervalRestart,
  pendingMetronomeBpm: tabPlayback.pendingMetronomeBpm,
  suppressPlaybackStopOnce: tabPlayback.suppressPlaybackStopOnce,
  completedExerciseTimers: ref<Record<string, boolean>>({}),
  linking: {
    exercisePlaybackMode,
    exerciseLinkedItems,
    ensureTabMetronomeEnabled,
  },
  intervalsForExercise,
  isIntervalAutoEnabled,
  isIntervalRepeatEnabled,
  callbacks: intervalRunnerCallbacks,
});

const exercisePlayback = useExercisePlayback({
  pendingExerciseId,
  intervalRunnerState,
  linking: {
    exercisePlaybackMode,
    exerciseLinkedItems,
    linkedLibraryItem,
    isLinkedMissing,
    applyLinkedBpm,
    exerciseLinkedItemId,
    ensureTabMetronomeEnabled,
    linkedTab,
    linkedAudio,
  },
  intervalsForExercise,
  isIntervalAutoEnabled,
  isIntervalRepeatEnabled,
  editModeByPlan,
  getExpandedExercise,
  tabPlayback,
  intervalRunner,
});

usePlaybackWatchers({
  pendingExerciseId,
  intervalRunnerState,
  pendingIntervalRestart: tabPlayback.pendingIntervalRestart,
  suppressPlaybackStopOnce: tabPlayback.suppressPlaybackStopOnce,
  completedExerciseTimers: exercisePlayback.completedExerciseTimers,
  exerciseTimerTick,
  intervalsForExercise,
  getExpandedExercise,
  linking: { linkedLibraryItem, exerciseLinkedItemId },
  callbacks: playbackWatcherCallbacks,
});

// Wire mutable callbacks now that all composables are initialized
tabPlaybackCallbacks.stopIntervalRunner = intervalRunner.stopIntervalRunner;
intervalRunnerCallbacks.requestTabPlayback = tabPlayback.requestTabPlayback;
intervalRunnerCallbacks.stopMetronomeAndPlayback =
  exercisePlayback.stopMetronomeAndPlayback;
playbackWatcherCallbacks.startIntervalRunnerForExercise =
  intervalRunner.startIntervalRunnerForExercise;
playbackWatcherCallbacks.stopExerciseTimersFromPlayback =
  exercisePlayback.stopExerciseTimersFromPlayback;
playbackWatcherCallbacks.stopIntervalRunner = intervalRunner.stopIntervalRunner;

const { tempoUnsupportedDialogOpen } = tabPlayback;

const { intervalTimerText, isActiveInterval, noBpmDialogOpen } = intervalRunner;

const {
  handleStartExercise,
  handleStopExercise,
  handleOpenExercise,
  handleToggleMetronomeForExercise,
  handlePracticeSpace,
} = exercisePlayback;
// Retained for test harnesses that drive the old start/stop flow end-to-end
// (src/__tests__/practice-edit.test.ts). The Practice template uses
// handleOpenExercise / handleToggleMetronomeForExercise exclusively.
void handleStartExercise;
void handleStopExercise;

// --- Wire up lazy callbacks now that all composables are initialized ---
resolveMissingShareTabFn = () => sharing.resolveMissingShareTab();
clearPendingPlaybackFn = () => tabPlayback.clearPendingPlayback();

// --- Lifecycle hooks ---
onMounted(() => {
  window.addEventListener(
    'practice-space',
    handlePracticeSpace as EventListener,
  );
  window.addEventListener('click', handleWindowClick);
});

onBeforeUnmount(() => {
  window.removeEventListener(
    'practice-space',
    handlePracticeSpace as EventListener,
  );
  window.removeEventListener('click', handleWindowClick);
});
</script>

<template>
  <section
    class="page practice-page"
    :class="{ 'practice-page--edit': isAnyEditMode }"
  >
    <header class="page-header">
      <div class="page-title">
        <h1>Practice</h1>
      </div>
    </header>

    <section class="plan-input-row">
      <AppTooltip text="Import Practice Plans &amp; Exercises">
        <BaseButton
          class="plan-import-button"
          variant="ghost"
          type="button"
          aria-label="Import Practice Plans &amp; Exercises"
          @click="handleShareImport"
        >
          <Download
            :size="18"
            aria-hidden="true"
          />
        </BaseButton>
      </AppTooltip>
      <BaseButton
        class="timed-toggle"
        :variant="newPlanTimed ? 'outline-accent' : 'ghost'"
        type="button"
        @click="newPlanTimed = !newPlanTimed"
      >
        Timed
      </BaseButton>
      <input
        v-model="newPlanName"
        class="plan-input"
        placeholder="Plan Title"
        @keydown.enter.prevent="handleCreatePlan"
      >
      <BaseButton
        variant="outline-accent"
        type="button"
        data-guide="practice.add-plan"
        @click="handleCreatePlan"
      >
        <strong class="plus-icon">+</strong>
      </BaseButton>
    </section>

    <section>
      <Draggable
        v-model="planList"
        item-key="id"
        handle=".plan-drag-handle"
        tag="div"
        class="plan-list"
        ghost-class="drag-ghost"
        chosen-class="drag-chosen"
        drag-class="drag-dragging"
        :force-fallback="true"
        :fallback-on-body="true"
        :move="handlePlanMove"
        @start="handlePlanDragStart"
        @end="handlePlanDragEnd"
      >
        <template #item="{ element: plan, index: planIndex }">
          <div class="plan-drop-wrapper">
            <div
              v-if="planDropIndex === planIndex"
              class="drop-indicator"
            />
            <article class="plan-row">
              <div
                class="plan-header"
                :class="{ 'drag-disabled': isPlanExpanded(plan.id) }"
                @click="handlePlanHeaderClick(plan.id)"
              >
                <span
                  class="drag-handle plan-drag-handle"
                  :class="{ 'handle-disabled': isPlanExpanded(plan.id) }"
                  @click.stop
                >
                  <GripVertical
                    :size="18"
                    aria-hidden="true"
                  />
                </span>
                <div class="plan-title">
                  <input
                    v-if="isEditMode(plan.id) && planTitleEditId === plan.id"
                    v-model="planTitleDraft"
                    class="plan-title-input"
                    @keyup.enter="commitPlanTitleEdit(plan)"
                    @keyup.esc="cancelPlanTitleEdit()"
                    @blur="commitPlanTitleEdit(plan)"
                    @focusout="commitPlanTitleEdit(plan)"
                  >
                  <button
                    v-else
                    class="plan-title-button"
                    type="button"
                    @click.stop="
                      isEditMode(plan.id)
                        ? startPlanTitleEdit(plan)
                        : togglePlan(plan.id)
                    "
                  >
                    {{ plan.title }}
                  </button>
                </div>
                <div class="plan-summary">
                  {{ planTotalMinutes(plan.id) }}m
                </div>
                <button
                  class="plan-timed-indicator"
                  :class="{ active: plan.timed, editable: isEditMode(plan.id) }"
                  type="button"
                  @click.stop="togglePlanTimed(plan)"
                >
                  T
                </button>
                <button
                  class="plan-toggle"
                  type="button"
                  @click.stop="togglePlan(plan.id)"
                >
                  <ChevronDown
                    :class="{ open: isPlanExpanded(plan.id) }"
                    :size="18"
                    aria-hidden="true"
                  />
                </button>
                <AppTooltip text="Edit Plan">
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    :class="{
                      'plan-edit-button': true,
                      'plan-edit-button--enabled': !(
                        !isPlanExpanded(plan.id) && hasExercises(plan.id)
                      ),
                    }"
                    :disabled="
                      !isPlanExpanded(plan.id) && hasExercises(plan.id)
                    "
                    @click.stop="toggleEditMode(plan.id)"
                  >
                    <Pencil
                      :size="18"
                      aria-hidden="true"
                    />
                    Edit
                  </BaseButton>
                </AppTooltip>
                <AppTooltip
                  v-if="!isEditMode(plan.id)"
                  text="Share Plan"
                >
                  <BaseButton
                    class="plan-share-button"
                    variant="ghost"
                    size="sm"
                    type="button"
                    @click.stop="openShareDialogForPlan(plan)"
                  >
                    <Share2
                      :size="18"
                      aria-hidden="true"
                    />
                  </BaseButton>
                </AppTooltip>
              </div>

              <div
                v-if="isPlanExpanded(plan.id)"
                class="plan-body"
              >
                <div
                  v-if="isEditMode(plan.id)"
                  class="add-row"
                >
                  <AppTooltip text="Add Exercise">
                    <BaseButton
                      variant="filled-accent"
                      size="sm"
                      type="button"
                      aria-label="Add Exercise"
                      data-guide="practice.add-exercise"
                      @click="openDraft(plan.id)"
                    >
                      <strong class="plus-icon">+</strong>
                    </BaseButton>
                  </AppTooltip>
                  <div
                    v-if="getDraft(plan.id).open"
                    class="add-fields"
                  >
                    <input
                      v-model="getDraft(plan.id).name"
                      class="add-name-input"
                      placeholder="Name"
                      @keyup.enter="submitDraft(plan.id)"
                    >
                    <AppTooltip text="Minutes to practice (integer)">
                      <input
                        v-model="getDraft(plan.id).minutes"
                        class="add-time-input"
                        placeholder="Time"
                        inputmode="numeric"
                        @keyup.enter="submitDraft(plan.id)"
                      >
                    </AppTooltip>
                    <AppTooltip text="Save Exercise">
                      <BaseButton
                        variant="filled-accent"
                        type="button"
                        class="add-submit"
                        aria-label="Save Exercise"
                        @click="submitDraft(plan.id)"
                      >
                        <Save
                          :size="18"
                          aria-hidden="true"
                        />
                      </BaseButton>
                    </AppTooltip>
                  </div>
                  <div
                    class="confirm-actions confirm-actions--align-right confirm-actions--destructive"
                    :class="{
                      'confirm-actions--open': confirmDeletePlanId === plan.id,
                    }"
                  >
                    <AppTooltip
                      v-if="!getDraft(plan.id).open"
                      text="Delete Plan"
                      :z-index="10080"
                    >
                      <BaseButton
                        class="delete-plan-button danger-hover confirm-trigger"
                        variant="outline-danger"
                        size="sm"
                        type="button"
                        @click.stop="toggleDeletePlanConfirm(plan.id, $event)"
                      >
                        Delete Plan
                      </BaseButton>
                    </AppTooltip>
                    <div
                      v-if="confirmDeletePlanId === plan.id"
                      class="confirm-popover"
                      :class="{
                        'confirm-popover--up': confirmDirection === 'up',
                      }"
                    >
                      <span>Are you sure?</span>
                      <div class="confirm-actions-row">
                        <BaseButton
                          class="confirm-danger"
                          variant="outline-danger"
                          size="sm"
                          type="button"
                          @click.stop="confirmDeletePlan(plan)"
                        >
                          Yes
                        </BaseButton>
                        <BaseButton
                          variant="filled-accent"
                          size="sm"
                          type="button"
                          @click.stop="closeAllConfirms()"
                        >
                          No
                        </BaseButton>
                      </div>
                    </div>
                  </div>
                </div>

                <Draggable
                  :list="getExerciseList(plan.id)"
                  item-key="id"
                  handle=".exercise-drag-handle"
                  tag="div"
                  class="exercise-list"
                  ghost-class="drag-ghost"
                  chosen-class="drag-chosen"
                  drag-class="drag-dragging"
                  :force-fallback="true"
                  :fallback-on-body="true"
                  :disabled="!isEditMode(plan.id)"
                  :move="exerciseMoveHandler(plan.id)"
                  @start="handleExerciseDragStart(plan.id)"
                  @end="handleExerciseDragEnd(plan.id)"
                  @change="exerciseChangeHandler(plan.id)"
                >
                  <template #item="{ element: item, index: itemIndex }">
                    <div class="exercise-drop-wrapper">
                      <div
                        v-if="exerciseDropIndex[plan.id] === itemIndex"
                        class="drop-indicator"
                      />
                      <div class="exercise-row">
                        <div
                          class="exercise-header"
                          @click="
                            !isEditMode(plan.id) &&
                              toggleExercise(plan.id, item.id)
                          "
                        >
                          <span
                            v-if="isEditMode(plan.id)"
                            class="drag-handle exercise-drag-handle"
                            :class="{ 'handle-disabled': !isEditMode(plan.id) }"
                            @click.stop
                          >
                            <GripVertical
                              :size="16"
                              aria-hidden="true"
                            />
                          </span>
                          <div class="exercise-title">
                            <input
                              v-if="
                                isEditMode(plan.id) &&
                                  exerciseTitleEditId === item.id
                              "
                              v-model="exerciseTitleDraft"
                              class="exercise-title-input"
                              @keyup.enter="commitExerciseTitleEdit(item)"
                              @keyup.esc="cancelExerciseTitleEdit()"
                              @blur="commitExerciseTitleEdit(item)"
                              @focusout="commitExerciseTitleEdit(item)"
                            >
                            <button
                              v-else
                              class="exercise-title-button"
                              type="button"
                              @click.stop="
                                isEditMode(plan.id)
                                  ? startExerciseTitleEdit(plan.id, item)
                                  : toggleExercise(plan.id, item.id)
                              "
                            >
                              {{ item.title }}
                            </button>
                          </div>
                          <div class="exercise-bpm">
                            <template v-if="isEditMode(plan.id)">
                              <input
                                v-if="exerciseBpmEditId === item.id"
                                :value="
                                  bpmDraftByExercise[item.id] ??
                                    (item.bpm ? String(item.bpm) : '')
                                "
                                inputmode="numeric"
                                placeholder="BPM"
                                @input="
                                  updateBpmDraft(
                                    item.id,
                                    ($event.target as HTMLInputElement).value,
                                  )
                                "
                                @blur="commitExerciseBpmEdit(item)"
                                @focusout="commitExerciseBpmEdit(item)"
                                @keyup.enter="commitExerciseBpmEdit(item)"
                                @keyup.esc="cancelExerciseBpmEdit(item)"
                              >
                              <button
                                v-else
                                class="exercise-bpm-button"
                                type="button"
                                @click.stop="startExerciseBpmEdit(item)"
                              >
                                <span class="exercise-bpm-value">
                                  {{ item.bpm === null ? '—' : item.bpm }}
                                </span>
                                <span class="exercise-bpm-label">BPM</span>
                              </button>
                            </template>
                            <div
                              v-else
                              class="exercise-bpm-readonly"
                              aria-label="Exercise BPM"
                            >
                              <span class="exercise-bpm-value">
                                {{ item.bpm === null ? '—' : item.bpm }}
                              </span>
                              <span class="exercise-bpm-label">BPM</span>
                            </div>
                          </div>
                          <div class="exercise-minutes">
                            <template
                              v-if="
                                isEditMode(plan.id) &&
                                  intervalsForExercise(item.id).length === 0
                              "
                            >
                              <input
                                v-if="exerciseMinutesEditId === item.id"
                                :value="
                                  minutesDraftByExercise[item.id] ??
                                    (item.timePlannedMinutes === null
                                      ? ''
                                      : String(item.timePlannedMinutes))
                                "
                                class="exercise-minutes-input"
                                inputmode="decimal"
                                @input="
                                  updateMinutesDraft(
                                    item.id,
                                    ($event.target as HTMLInputElement).value,
                                  )
                                "
                                @blur="commitExerciseMinutesEdit(item)"
                                @focusout="commitExerciseMinutesEdit(item)"
                                @keyup.enter="commitExerciseMinutesEdit(item)"
                                @keyup.esc="cancelExerciseMinutesEdit(item)"
                              >
                              <button
                                v-else
                                class="exercise-minutes-button"
                                type="button"
                                @click.stop="startExerciseMinutesEdit(item)"
                              >
                                {{ displayPlannedMinutes(item) }}
                              </button>
                            </template>
                            <span
                              v-else
                              class="exercise-minutes-readonly"
                            >
                              {{ displayPlannedMinutes(item) }}
                            </span>
                          </div>
                          <button
                            class="exercise-toggle"
                            type="button"
                            @click.stop="toggleExercise(plan.id, item.id)"
                          >
                            <ChevronDown
                              :class="{
                                open: isExerciseExpanded(plan.id, item.id),
                              }"
                              :size="16"
                              aria-hidden="true"
                            />
                          </button>
                          <AppTooltip
                            v-if="!isEditMode(plan.id)"
                            text="Share Exercise"
                          >
                            <BaseButton
                              class="exercise-share-button"
                              variant="ghost"
                              size="sm"
                              type="button"
                              @click.stop="openShareDialogForExercise(item)"
                            >
                              <Share2
                                :size="16"
                                aria-hidden="true"
                              />
                            </BaseButton>
                          </AppTooltip>
                          <AppTooltip
                            v-if="isEditMode(plan.id)"
                            text="Delete Exercise"
                            :z-index="10080"
                          >
                            <div
                              class="confirm-actions confirm-actions--destructive"
                              :class="{
                                'confirm-actions--open':
                                  confirmDeleteExerciseId === item.id,
                              }"
                            >
                              <BaseButton
                                class="danger-hover confirm-trigger"
                                variant="filled-danger"
                                size="sm"
                                type="button"
                                aria-label="Delete Exercise"
                                @click.stop="
                                  toggleDeleteExerciseConfirm(item.id, $event)
                                "
                              >
                                <Trash2
                                  :size="14"
                                  aria-hidden="true"
                                />
                              </BaseButton>
                              <div
                                v-if="confirmDeleteExerciseId === item.id"
                                class="confirm-popover"
                                :class="{
                                  'confirm-popover--up':
                                    confirmDirection === 'up',
                                }"
                              >
                                <span>Are you sure?</span>
                                <div class="confirm-actions-row">
                                  <BaseButton
                                    class="confirm-danger"
                                    variant="outline-danger"
                                    size="sm"
                                    type="button"
                                    @click.stop="confirmDeleteExercise(item)"
                                  >
                                    Yes
                                  </BaseButton>
                                  <BaseButton
                                    variant="filled-accent"
                                    size="sm"
                                    type="button"
                                    @click.stop="closeAllConfirms()"
                                  >
                                    No
                                  </BaseButton>
                                </div>
                              </div>
                            </div>
                          </AppTooltip>
                        </div>

                        <div
                          v-if="isExerciseExpanded(plan.id, item.id)"
                          class="exercise-body"
                        >
                          <div class="exercise-detail">
                            <span>Time Practiced</span>
                            <strong class="timer-value">{{
                              sessionElapsed(item.id)
                            }}</strong>
                          </div>

                          <div
                            class="exercise-detail tab-detail"
                            data-guide="practice.connect-tab"
                          >
                            <span>Tab</span>
                            <div class="tab-inline-actions">
                              <template v-if="linkedTab(item)">
                                <template v-if="isLinkedMissing(item)">
                                  <span class="tab-file-name tab-value">
                                    {{ linkedFileName(item) }}
                                  </span>
                                  <BaseButton
                                    v-if="!isEditMode(plan.id)"
                                    class="tab-locate-button"
                                    type="button"
                                    @click="handleLocateLinked(item)"
                                  >
                                    Locate
                                  </BaseButton>
                                  <div
                                    v-if="
                                      linkActions(item, plan.id, 'tab')
                                        .showRemove
                                    "
                                    class="confirm-actions"
                                  >
                                    <AppTooltip text="Remove Tab">
                                      <BaseButton
                                        class="danger-hover confirm-trigger"
                                        variant="filled-danger"
                                        size="sm"
                                        type="button"
                                        aria-label="Remove Tab"
                                        @click.stop="
                                          toggleRemoveTabConfirm(
                                            item.id,
                                            $event,
                                          )
                                        "
                                      >
                                        <Trash2
                                          :size="14"
                                          aria-hidden="true"
                                        />
                                      </BaseButton>
                                    </AppTooltip>
                                    <div
                                      v-if="confirmRemoveTabId === item.id"
                                      class="confirm-popover"
                                      :class="{
                                        'confirm-popover--up':
                                          confirmDirection === 'up',
                                      }"
                                    >
                                      <span>Are you sure?</span>
                                      <div class="confirm-actions-row">
                                        <BaseButton
                                          class="confirm-danger"
                                          variant="outline-danger"
                                          size="sm"
                                          type="button"
                                          @click.stop="
                                            confirmRemoveTab(item, 'tab')
                                          "
                                        >
                                          Yes
                                        </BaseButton>
                                        <BaseButton
                                          variant="filled-accent"
                                          size="sm"
                                          type="button"
                                          @click.stop="closeAllConfirms()"
                                        >
                                          No
                                        </BaseButton>
                                      </div>
                                    </div>
                                  </div>
                                </template>
                                <template v-else>
                                  <button
                                    class="link-text tab-link tab-value"
                                    type="button"
                                    @click="handleOpenLinked(item)"
                                  >
                                    {{
                                      stripFileExtension(
                                        linkedTab(item)?.title ||
                                          linkedTab(item)?.metadata.fileName ||
                                          '',
                                      )
                                    }}
                                  </button>
                                  <div
                                    v-if="
                                      linkActions(item, plan.id, 'tab')
                                        .showRemove
                                    "
                                    class="confirm-actions"
                                  >
                                    <AppTooltip text="Remove Tab">
                                      <BaseButton
                                        class="danger-hover confirm-trigger"
                                        variant="filled-danger"
                                        size="sm"
                                        type="button"
                                        aria-label="Remove Tab"
                                        @click.stop="
                                          toggleRemoveTabConfirm(
                                            item.id,
                                            $event,
                                          )
                                        "
                                      >
                                        <Trash2
                                          :size="14"
                                          aria-hidden="true"
                                        />
                                      </BaseButton>
                                    </AppTooltip>
                                    <div
                                      v-if="confirmRemoveTabId === item.id"
                                      class="confirm-popover"
                                      :class="{
                                        'confirm-popover--up':
                                          confirmDirection === 'up',
                                      }"
                                    >
                                      <span>Are you sure?</span>
                                      <div class="confirm-actions-row">
                                        <BaseButton
                                          class="confirm-danger"
                                          variant="outline-danger"
                                          size="sm"
                                          type="button"
                                          @click.stop="
                                            confirmRemoveTab(item, 'tab')
                                          "
                                        >
                                          Yes
                                        </BaseButton>
                                        <BaseButton
                                          variant="filled-accent"
                                          size="sm"
                                          type="button"
                                          @click.stop="closeAllConfirms()"
                                        >
                                          No
                                        </BaseButton>
                                      </div>
                                    </div>
                                  </div>
                                </template>
                              </template>
                              <template v-else>
                                <AppTooltip
                                  v-if="
                                    linkActions(item, plan.id, 'tab')
                                      .showLinkExisting
                                  "
                                  text="Add Tab"
                                >
                                  <BaseButton
                                    variant="outline-accent"
                                    class="tab-action-btn"
                                    size="sm"
                                    type="button"
                                    @click="openLinkDialog(item, 'tab')"
                                  >
                                    <strong class="plus-icon">+</strong>
                                  </BaseButton>
                                </AppTooltip>
                              </template>
                            </div>
                          </div>

                          <div
                            class="exercise-detail tab-detail"
                            data-guide="practice.connect-audio"
                          >
                            <span>Audio</span>
                            <div class="tab-inline-actions">
                              <template v-if="linkedAudio(item)">
                                <button
                                  class="link-text tab-link tab-value"
                                  type="button"
                                  @click="handleOpenLinked(item)"
                                >
                                  {{
                                    stripFileExtension(
                                      linkedAudio(item)?.title ||
                                        linkedAudio(item)?.metadata.fileName ||
                                        '',
                                    )
                                  }}
                                </button>
                                <div
                                  v-if="
                                    linkActions(item, plan.id, 'audio')
                                      .showRemove
                                  "
                                  class="confirm-actions"
                                >
                                  <AppTooltip text="Remove Audio">
                                    <BaseButton
                                      class="danger-hover confirm-trigger"
                                      variant="filled-danger"
                                      size="sm"
                                      type="button"
                                      aria-label="Remove Audio"
                                      @click.stop="
                                        toggleRemoveTabConfirm(item.id, $event)
                                      "
                                    >
                                      <Trash2
                                        :size="14"
                                        aria-hidden="true"
                                      />
                                    </BaseButton>
                                  </AppTooltip>
                                </div>
                              </template>
                              <template v-else>
                                <AppTooltip
                                  v-if="
                                    linkActions(item, plan.id, 'audio')
                                      .showLinkExisting
                                  "
                                  text="Add Audio"
                                >
                                  <BaseButton
                                    variant="outline-accent"
                                    class="tab-action-btn"
                                    size="sm"
                                    type="button"
                                    @click="openLinkDialog(item, 'audio')"
                                  >
                                    <strong class="plus-icon">+</strong>
                                  </BaseButton>
                                </AppTooltip>
                              </template>
                            </div>
                          </div>

                          <div
                            v-if="
                              isEditMode(plan.id) ||
                                intervalsForExercise(item.id).length > 0
                            "
                            class="exercise-detail interval-detail"
                            :class="{
                              'interval-detail--edit': isEditMode(plan.id),
                            }"
                          >
                            <div class="interval-header">
                              <span>Intervals</span>
                              <div class="interval-header-actions">
                                <AppTooltip
                                  v-if="!isEditMode(plan.id)"
                                  :text="
                                    isIntervalAutoEnabled(item)
                                      ? 'Repeat Intervals'
                                      : 'Repeat requires Auto mode'
                                  "
                                >
                                  <BaseButton
                                    class="interval-repeat-toggle"
                                    :variant="
                                      isIntervalRepeatEnabled(item)
                                        ? 'outline-accent'
                                        : 'ghost'
                                    "
                                    size="sm"
                                    type="button"
                                    :disabled="!isIntervalAutoEnabled(item)"
                                    @click="toggleIntervalRepeat(item)"
                                  >
                                    <Repeat
                                      :size="14"
                                      aria-hidden="true"
                                    />
                                  </BaseButton>
                                </AppTooltip>
                                <AppTooltip
                                  v-if="!isEditMode(plan.id)"
                                  :text="
                                    isIntervalAutoEnabled(item)
                                      ? 'Auto: play next interval'
                                      : 'Auto: manual advance'
                                  "
                                >
                                  <BaseButton
                                    class="interval-auto-toggle"
                                    :variant="
                                      isIntervalAutoEnabled(item)
                                        ? 'outline-accent'
                                        : 'ghost'
                                    "
                                    size="sm"
                                    type="button"
                                    @click="toggleIntervalAuto(item)"
                                  >
                                    Auto
                                  </BaseButton>
                                </AppTooltip>
                                <AppTooltip
                                  v-if="isEditMode(plan.id)"
                                  text="Add Interval"
                                >
                                  <BaseButton
                                    class="interval-add-button"
                                    variant="outline-accent"
                                    size="sm"
                                    type="button"
                                    aria-label="Add Interval"
                                    data-guide="practice.add-interval"
                                    @click="openIntervalDraft(item.id)"
                                  >
                                    <strong class="plus-icon">+</strong>
                                  </BaseButton>
                                </AppTooltip>
                              </div>
                            </div>

                            <div
                              v-if="
                                isEditMode(plan.id) &&
                                  getIntervalDraft(item.id).open
                              "
                              class="interval-editor"
                            >
                              <input
                                v-model="getIntervalDraft(item.id).name"
                                placeholder="Name"
                                @keyup.enter="submitIntervalDraft(item.id)"
                                @keyup.esc="closeIntervalDraft(item.id)"
                              >
                              <input
                                v-model="getIntervalDraft(item.id).bpm"
                                placeholder="BPM"
                                inputmode="numeric"
                                @keyup.enter="submitIntervalDraft(item.id)"
                                @keyup.esc="closeIntervalDraft(item.id)"
                              >
                              <input
                                v-model="getIntervalDraft(item.id).minutes"
                                placeholder="Time"
                                inputmode="decimal"
                                @keyup.enter="submitIntervalDraft(item.id)"
                                @keyup.esc="closeIntervalDraft(item.id)"
                              >
                              <AppTooltip text="Save Interval">
                                <BaseButton
                                  class="interval-save"
                                  variant="filled-accent"
                                  type="button"
                                  @click="submitIntervalDraft(item.id)"
                                >
                                  <Save
                                    :size="18"
                                    aria-hidden="true"
                                  />
                                </BaseButton>
                              </AppTooltip>
                            </div>

                            <Draggable
                              v-if="
                                isEditMode(plan.id) ||
                                  intervalsForExercise(item.id).length > 0
                              "
                              :list="getIntervalList(item.id)"
                              item-key="id"
                              handle=".interval-drag-handle"
                              tag="div"
                              class="interval-list"
                              ghost-class="drag-ghost"
                              chosen-class="drag-chosen"
                              drag-class="drag-dragging"
                              :force-fallback="true"
                              :fallback-on-body="true"
                              :disabled="!isEditMode(plan.id)"
                              :move="intervalMoveHandler(item.id)"
                              @start="handleIntervalDragStart(item.id)"
                              @end="handleIntervalDragEnd(item.id)"
                              @change="intervalChangeHandler(item.id)"
                            >
                              <template
                                #item="{
                                  element: interval,
                                  index: intervalIndex,
                                }"
                              >
                                <div class="interval-drop-wrapper">
                                  <div
                                    v-if="
                                      intervalDropIndex[item.id] ===
                                        intervalIndex
                                    "
                                    class="drop-indicator"
                                  />
                                  <div
                                    class="interval-row-wrap"
                                    :class="{
                                      'interval-row-wrap--edit': isEditMode(
                                        plan.id,
                                      ),
                                    }"
                                  >
                                    <span
                                      v-if="isEditMode(plan.id)"
                                      class="drag-handle interval-drag-handle"
                                    >
                                      <GripVertical
                                        :size="16"
                                        aria-hidden="true"
                                      />
                                    </span>
                                    <div
                                      class="interval-row"
                                      :class="{
                                        'interval-active': isActiveInterval(
                                          item.id,
                                          interval.id,
                                        ),
                                        'interval-row--edit': isEditMode(
                                          plan.id,
                                        ),
                                      }"
                                    >
                                      <div class="interval-name">
                                        <AppTooltip
                                          v-if="interval.done"
                                          text="Redo Interval"
                                        >
                                          <button
                                            class="interval-redo-button"
                                            type="button"
                                            @click.stop="
                                              markIntervalDone(
                                                item.id,
                                                interval.id,
                                                false,
                                              )
                                            "
                                          >
                                            <RotateCcw
                                              :size="14"
                                              aria-hidden="true"
                                            />
                                          </button>
                                        </AppTooltip>
                                        <span
                                          v-else
                                          class="interval-redo-placeholder"
                                          aria-hidden="true"
                                        />
                                        <input
                                          v-if="
                                            isEditMode(plan.id) &&
                                              intervalNameEditId === interval.id
                                          "
                                          v-model="intervalNameDraft"
                                          class="interval-name-input"
                                          @keyup.enter="
                                            commitIntervalNameEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                          @keyup.esc="cancelIntervalNameEdit()"
                                          @blur="
                                            commitIntervalNameEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                          @focusout="
                                            commitIntervalNameEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                        >
                                        <button
                                          v-else
                                          class="interval-name-button"
                                          type="button"
                                          :disabled="!isEditMode(plan.id)"
                                          @click.stop="
                                            isEditMode(plan.id) &&
                                              startIntervalNameEdit(interval)
                                          "
                                        >
                                          {{ intervalLabel(interval) }}
                                        </button>
                                      </div>
                                      <div class="interval-bpm">
                                        <input
                                          v-if="
                                            isEditMode(plan.id) &&
                                              intervalBpmEditId === interval.id
                                          "
                                          v-model="intervalBpmDraft"
                                          class="interval-bpm-input"
                                          inputmode="numeric"
                                          @keyup.enter="
                                            commitIntervalBpmEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                          @keyup.esc="cancelIntervalBpmEdit()"
                                          @blur="
                                            commitIntervalBpmEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                          @focusout="
                                            commitIntervalBpmEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                        >
                                        <button
                                          v-else
                                          class="interval-bpm-button"
                                          type="button"
                                          :disabled="!isEditMode(plan.id)"
                                          @click.stop="
                                            isEditMode(plan.id) &&
                                              startIntervalBpmEdit(interval)
                                          "
                                        >
                                          {{ intervalBpmLabel(interval) }}
                                        </button>
                                      </div>
                                      <div class="interval-duration">
                                        <input
                                          v-if="
                                            isEditMode(plan.id) &&
                                              intervalDurationEditId ===
                                              interval.id
                                          "
                                          v-model="intervalDurationDraft"
                                          class="interval-duration-input"
                                          inputmode="decimal"
                                          @keyup.enter="
                                            commitIntervalDurationEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                          @keyup.esc="
                                            cancelIntervalDurationEdit()
                                          "
                                          @blur="
                                            commitIntervalDurationEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                          @focusout="
                                            commitIntervalDurationEdit(
                                              item.id,
                                              interval,
                                            )
                                          "
                                        >
                                        <button
                                          v-else
                                          class="interval-duration-button"
                                          type="button"
                                          :disabled="!isEditMode(plan.id)"
                                          @click.stop="
                                            isEditMode(plan.id) &&
                                              startIntervalDurationEdit(interval)
                                          "
                                        >
                                          {{
                                            formatDurationMmss(
                                              interval.durationSeconds,
                                            )
                                          }}
                                        </button>
                                      </div>
                                      <AppTooltip
                                        v-if="isEditMode(plan.id)"
                                        text="Delete Interval"
                                        :z-index="10080"
                                      >
                                        <div
                                          class="confirm-actions confirm-actions--destructive"
                                          :class="{
                                            'confirm-actions--open':
                                              confirmDeleteIntervalId ===
                                              intervalConfirmKey(
                                                item.id,
                                                interval.id,
                                              ),
                                          }"
                                        >
                                          <BaseButton
                                            class="interval-delete-button danger-hover confirm-trigger"
                                            variant="filled-danger"
                                            size="sm"
                                            type="button"
                                            aria-label="Delete Interval"
                                            @click.stop="
                                              toggleDeleteIntervalConfirm(
                                                item.id,
                                                interval.id,
                                                $event,
                                              )
                                            "
                                          >
                                            <Trash2
                                              :size="24"
                                              :stroke-width="1.5"
                                              aria-hidden="true"
                                            />
                                          </BaseButton>
                                          <div
                                            v-if="
                                              confirmDeleteIntervalId ===
                                                intervalConfirmKey(
                                                  item.id,
                                                  interval.id,
                                                )
                                            "
                                            class="confirm-popover"
                                            :class="{
                                              'confirm-popover--up':
                                                confirmDirection === 'up',
                                            }"
                                          >
                                            <span>Are you sure?</span>
                                            <div class="confirm-actions-row">
                                              <BaseButton
                                                class="confirm-danger"
                                                variant="outline-danger"
                                                size="sm"
                                                type="button"
                                                @click.stop="
                                                  confirmDeleteInterval(
                                                    item.id,
                                                    interval.id,
                                                  )
                                                "
                                              >
                                                Yes
                                              </BaseButton>
                                              <BaseButton
                                                variant="filled-accent"
                                                size="sm"
                                                type="button"
                                                @click.stop="closeAllConfirms()"
                                              >
                                                No
                                              </BaseButton>
                                            </div>
                                          </div>
                                        </div>
                                      </AppTooltip>
                                    </div>
                                  </div>
                                </div>
                              </template>
                              <template #footer>
                                <div
                                  v-if="
                                    intervalDropIndex[item.id] ===
                                      getIntervalList(item.id).length
                                  "
                                  class="drop-indicator"
                                />
                              </template>
                            </Draggable>
                          </div>

                          <div class="exercise-detail">
                            <div class="timer-actions">
                              <!-- With linked media: load tab/audio for manual transport play -->
                              <AppTooltip
                                v-if="hasAnySources(item)"
                                text="Open tab/audio in player"
                                side="bottom"
                                :side-offset="4"
                              >
                                <BaseButton
                                  variant="primary"
                                  type="button"
                                  class="timer-button timer-start"
                                  @click="handleOpenExercise(item)"
                                >
                                  Open
                                </BaseButton>
                              </AppTooltip>
                              <!-- Metronome-only exercises: toggle the metronome from the exercise BPM -->
                              <AppTooltip
                                v-else-if="!metronomeStore.isRunning"
                                text="Start Metronome"
                                side="bottom"
                                :side-offset="4"
                              >
                                <BaseButton
                                  variant="primary"
                                  type="button"
                                  class="timer-button timer-start"
                                  @click="
                                    handleToggleMetronomeForExercise(item)
                                  "
                                >
                                  Start Metronome
                                </BaseButton>
                              </AppTooltip>
                              <AppTooltip
                                v-else
                                text="Stop Metronome"
                                side="bottom"
                                :side-offset="4"
                              >
                                <BaseButton
                                  variant="ghost"
                                  type="button"
                                  class="timer-button timer-stop"
                                  @click="
                                    handleToggleMetronomeForExercise(item)
                                  "
                                >
                                  Stop Metronome
                                </BaseButton>
                              </AppTooltip>
                              <div
                                v-if="hasAnySources(item)"
                                class="source-toggle-segmented"
                              >
                                <button
                                  v-if="linkedTab(item)"
                                  type="button"
                                  class="source-segment"
                                  :class="{
                                    active: resolvedSourceLabel(item) === 'tab',
                                  }"
                                  :disabled="!hasBothSources(item)"
                                  @click="
                                    hasBothSources(item) &&
                                      practiceStore.updateExercise(item.id, {
                                        preferredSource: 'tab',
                                      })
                                  "
                                >
                                  Tab
                                </button>
                                <button
                                  v-if="hasBothSources(item)"
                                  type="button"
                                  class="source-segment"
                                  :class="{
                                    active:
                                      resolvedSourceLabel(item) === 'both',
                                  }"
                                  @click="
                                    practiceStore.updateExercise(item.id, {
                                      preferredSource: 'both',
                                    })
                                  "
                                >
                                  Both
                                </button>
                                <button
                                  v-if="linkedAudio(item)"
                                  type="button"
                                  class="source-segment"
                                  :class="{
                                    active:
                                      resolvedSourceLabel(item) === 'audio',
                                  }"
                                  :disabled="!hasBothSources(item)"
                                  @click="
                                    hasBothSources(item) &&
                                      practiceStore.updateExercise(item.id, {
                                        preferredSource: 'audio',
                                      })
                                  "
                                >
                                  Audio
                                </button>
                              </div>
                              <span
                                v-if="intervalTimerText(item.id)"
                                class="interval-timer"
                              >
                                {{ intervalTimerText(item.id) }}
                              </span>
                              <span
                                v-else
                                class="timer-elapsed"
                              >
                                {{ sessionElapsed(item.id) }}
                              </span>
                            </div>
                          </div>

                          <div class="exercise-detail exercise-notes">
                            <textarea
                              class="exercise-notes-textarea"
                              :readonly="notesEditId !== item.id"
                              :value="
                                notesDraftByExercise[item.id] ??
                                  item.notes ??
                                  ''
                              "
                              placeholder="Notes"
                              rows="3"
                              @focus="startExerciseNotesEdit(item)"
                              @input="
                                updateExerciseNotesDraft(
                                  item.id,
                                  ($event.target as HTMLTextAreaElement).value,
                                )
                              "
                              @blur="commitExerciseNotesEdit(item)"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                  <template #footer>
                    <div
                      v-if="
                        exerciseDropIndex[plan.id] ===
                          getExerciseList(plan.id).length
                      "
                      class="drop-indicator"
                    />
                  </template>
                </Draggable>
              </div>
            </article>
          </div>
        </template>
        <template #footer>
          <div
            v-if="planDropIndex === practiceStore.plans.length"
            class="drop-indicator"
          />
        </template>
      </Draggable>
    </section>

    <DialogRoot v-model:open="shareDialogOpen">
      <DialogPortal>
        <DialogOverlay class="share-dialog-overlay">
          <DialogContent class="share-dialog">
            <DialogTitle class="share-dialog-title">
              Share
            </DialogTitle>
            <p class="share-dialog-text">
              Choose if you want to also share the files.
            </p>
            <label class="share-dialog-row">
              <span>Include Tab</span>
              <input
                v-model="shareIncludeTab"
                type="checkbox"
                class="share-dialog-checkbox"
              >
            </label>
            <label class="share-dialog-row">
              <span>Include Audio</span>
              <input
                v-model="shareIncludeAudio"
                type="checkbox"
                class="share-dialog-checkbox"
              >
            </label>
            <div class="share-dialog-actions">
              <BaseButton
                variant="ghost"
                size="sm"
                type="button"
                :disabled="shareBusy"
                @click="closeShareDialog"
              >
                Cancel
              </BaseButton>
              <BaseButton
                variant="filled-accent"
                size="sm"
                type="button"
                :disabled="shareBusy"
                @click="handleShareExport"
              >
                Share
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="sharePlanDialogOpen">
      <DialogPortal>
        <DialogOverlay class="share-dialog-overlay">
          <DialogContent class="share-dialog">
            <DialogTitle class="share-dialog-title">
              Choose Plan
            </DialogTitle>
            <p class="share-dialog-text">
              Where should this exercise be added?
            </p>
            <label class="share-dialog-row share-dialog-row--stacked">
              <AppSelect
                trigger-class="share-dialog-select"
                content-class="share-dialog-select-content"
                aria-label="Choose plan"
                :options="sharePlanOptions"
                :model-value="sharePlanSelection"
                :display-value="sharePlanDisplay"
                :modal="false"
                :disable-outside-pointer-events="false"
                :portalled="false"
                @update:model-value="
                  (value) => {
                    sharePlanSelection = String(value);
                    sharePlanTouched = true;
                  }
                "
              />
            </label>
            <p class="share-dialog-note">
              Create new plan will add this exercise to a not timed plan named
              “Import”.
            </p>
            <div class="share-dialog-actions">
              <BaseButton
                variant="ghost"
                size="sm"
                type="button"
                @click="closeSharePlanDialog"
              >
                Cancel
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                type="button"
                @click="handleShareImportToNewPlan"
              >
                Create new plan
              </BaseButton>
              <BaseButton
                variant="filled-accent"
                size="sm"
                type="button"
                @click="confirmSharePlanSelection"
              >
                Import
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot
      :open="missingShareDialogOpen"
      @update:open="handleMissingShareDialogOpen"
    >
      <DialogPortal>
        <DialogOverlay class="share-dialog-overlay">
          <DialogContent class="share-dialog">
            <DialogTitle class="share-dialog-title">
              Tab file missing
            </DialogTitle>
            <p class="share-dialog-text">
              Choose an option:
            </p>
            <div class="share-dialog-actions share-dialog-actions--stacked">
              <BaseButton
                variant="filled-accent"
                size="sm"
                type="button"
                @click="handleMissingChooseFromLibrary"
              >
                Choose from Library
              </BaseButton>
              <BaseButton
                variant="ghost"
                size="sm"
                type="button"
                @click="handleMissingLocateOnDisk"
              >
                Locate on Disk
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="linkDialogOpen">
      <DialogPortal>
        <DialogOverlay class="link-dialog-overlay">
          <DialogContent class="link-dialog">
            <DialogTitle class="link-title">
              Choose {{ linkDialogKind === 'audio' ? 'Audio' : 'Tab' }}
            </DialogTitle>
            <div class="link-search-field">
              <Search
                class="link-search-icon"
                :size="16"
                aria-hidden="true"
              />
              <input
                v-model="linkSearch"
                class="link-search"
                placeholder="Search library"
                @keydown.enter.prevent="
                  ($event.target as HTMLInputElement).blur()
                "
              >
              <BaseButton
                class="link-add"
                variant="outline-accent"
                size="sm"
                type="button"
                @click="
                  linkDialogKind === 'audio'
                    ? handleAddNewAudioFromDialog()
                    : handleAddNewTabFromDialog()
                "
              >
                <strong class="plus-icon">+</strong>
              </BaseButton>
            </div>
            <div class="link-list">
              <div class="link-list-content">
                <button
                  v-for="tab in linkCandidates"
                  :key="tab.id"
                  class="link-row"
                  type="button"
                  @click="handleSelectLink(tab.id)"
                >
                  {{ tab.title }}
                </button>
              </div>
            </div>
            <div class="link-actions">
              <BaseButton
                class="link-close"
                variant="outline-accent"
                size="sm"
                type="button"
                @click="linkDialogOpen = false"
              >
                Close
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="libraryStore.duplicateDialogOpen">
      <DialogPortal>
        <DialogOverlay class="duplicate-overlay">
          <DialogContent
            class="duplicate-modal"
            aria-label="Tab already added"
          >
            <p class="duplicate-text">
              This tab has already been added to your Library
            </p>
            <BaseButton
              variant="filled-accent"
              type="button"
              @click="libraryStore.closeDuplicateDialog()"
            >
              Ok
            </BaseButton>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>
    <div
      v-if="tempoUnsupportedDialogOpen"
      class="tempo-warning-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tempo-warning-title"
    >
      <div class="tempo-warning-modal">
        <h2 id="tempo-warning-title">
          Tempo Change Not Supported
        </h2>
        <p>
          Changing the tempo of a Tab File that contains tempo changes is not
          supported. It is advised to split the File and practice each section
          seperately.
        </p>
        <BaseButton
          variant="filled-accent"
          size="sm"
          type="button"
          @click="tempoUnsupportedDialogOpen = false"
        >
          I Understand
        </BaseButton>
      </div>
    </div>
    <div
      v-if="noBpmDialogOpen"
      class="tempo-warning-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="no-bpm-title"
    >
      <div class="tempo-warning-modal">
        <h2 id="no-bpm-title">
          BPM Not Available
        </h2>
        <p>
          The linked audio file has no BPM information. Please edit the beatmap
          and set the BPM before starting this exercise.
        </p>
        <BaseButton
          variant="filled-accent"
          size="sm"
          type="button"
          @click="noBpmDialogOpen = false"
        >
          I Understand
        </BaseButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: center;
}

.practice-page {
  margin-inline: auto;
  width: 100%;
  box-sizing: border-box;
}

/* Per-page padding-right override removed — `.main-content` is now
   symmetrically padded in AppLayout so the override is no-op. */

.plan-input-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.timed-toggle {
  min-width: 78px;
  justify-content: center;
}

.plan-input {
  flex: 1;
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  height: 34px;
  padding: 0 12px;
  font-family: inherit;
  font-size: 0.95rem;
  min-width: 0;
}

.practice-page--edit
  :is(
    .plan-title-input,
    .exercise-title-input,
    .exercise-bpm input,
    .exercise-minutes-input,
    .interval-name-input,
    .interval-bpm-input,
    .interval-duration-input,
    .interval-editor input,
    .exercise-notes-textarea
  ) {
  outline: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  outline-offset: 1px;
}

.practice-page--edit
  :is(
    .plan-title-button,
    .exercise-title-button,
    .exercise-bpm-button,
    .exercise-minutes-button,
    .interval-name-button,
    .interval-bpm-button,
    .interval-duration-button
  ):not(:disabled) {
  box-shadow: inset 0 0 0 1px var(--border);
  border-radius: 6px;
  padding-inline: 4px;
}

.plus-icon {
  font-size: 1.2rem;
  line-height: 1;
  display: inline-block;
  transform: translateY(-1px);
}

.plan-list {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.plan-row {
  display: grid;
  gap: 8px;
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 12px;
  min-width: 0;
}

.plan-drop-wrapper {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.plan-header {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto auto auto;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
}

.drag-disabled {
  cursor: default;
}

.drag-disabled .plan-drag-handle,
.drag-disabled .plan-title,
.drag-disabled .plan-summary,
.drag-disabled .plan-timed-indicator,
.drag-disabled .plan-toggle {
  opacity: 0.6;
}

.plan-title {
  font-weight: 600;
  min-width: 0;
}

.plan-title-button {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
  width: 100%;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-title-input {
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 4px 8px;
  font: inherit;
  width: 100%;
  min-width: 0;
}

.plan-summary {
  color: var(--muted);
  font-weight: 600;
}

.plan-timed-indicator {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: default;
}

.plan-timed-indicator.active {
  border-color: var(--accent);
  color: var(--accent);
}

.plan-timed-indicator.editable {
  cursor: pointer;
}

.plan-toggle,
.exercise-toggle {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.plan-toggle :deep(svg),
.exercise-toggle :deep(svg) {
  transition: transform 0.2s ease;
}

.plan-toggle :deep(svg.open),
.exercise-toggle :deep(svg.open) {
  transform: rotate(180deg);
}

.plan-edit-button--enabled:not(:disabled) {
  color: var(--text);
  border-color: rgba(255, 255, 255, 0.2);
}

.plan-share-button.base-button {
  gap: 6px;
  padding-inline: 8px;
}

.exercise-share-button.base-button {
  width: 30px;
  height: 30px;
  padding: 0;
  min-width: 0;
}

.icon-button {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.plan-body {
  display: grid;
  gap: 12px;
}

.add-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  min-width: 0;
}

.delete-plan-button {
  margin-left: auto;
}

.danger-hover.base-button:hover,
.danger-hover.base-button:focus-visible,
.danger-hover.base-button:active {
  filter: none;
  transform: translateY(-1px);
  box-shadow:
    0 0 0 2px rgba(255, 123, 123, 0.35),
    0 6px 16px rgba(0, 0, 0, 0.35);
}

.danger-hover.base-button.outline-danger:hover,
.danger-hover.base-button.outline-danger:focus-visible,
.danger-hover.base-button.outline-danger:active {
  border-color: #ff7b7b;
  color: #ff7b7b;
  background: rgba(255, 123, 123, 0.18);
}

.danger-hover.base-button.filled-danger:hover,
.danger-hover.base-button.filled-danger:focus-visible,
.danger-hover.base-button.filled-danger:active {
  border-color: transparent;
  color: #2a0b0b;
  background: #ff6f6f;
}

.confirm-actions {
  position: relative;
  display: inline-grid;
  justify-items: center;
  z-index: 10030;
}

.confirm-actions--destructive {
  z-index: 10060;
}

.confirm-actions--destructive.confirm-actions--open {
  z-index: 10090;
}

.confirm-actions--align-right {
  margin-left: auto;
}

.confirm-popover {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 6px);
  display: grid;
  gap: 6px;
  justify-items: center;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 140px;
  z-index: 10031;
}

.confirm-popover span {
  text-align: center;
}

.confirm-actions-row {
  display: inline-flex;
  gap: 8px;
  justify-content: center;
}

.confirm-popover--up {
  top: auto;
  bottom: calc(100% + 6px);
}

.confirm-danger.base-button {
  border: 1px solid rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.confirm-danger.base-button:hover,
.confirm-danger.base-button:focus-visible,
.confirm-danger.base-button:active {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.add-fields {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: nowrap;
  max-width: 100%;
}

.add-fields input {
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 14px;
  height: 32px;
  min-width: 0;
  max-width: 100%;
  padding: 0 10px;
  font-family: inherit;
}

.add-name-input {
  flex: 3 1 0;
}

.add-time-input {
  flex: 1 1 0;
}

.add-submit {
  margin-left: auto;
}

.add-row .base-button.filled-accent:hover:not(:disabled),
.add-row .base-button.filled-accent:focus-visible,
.add-row .base-button.filled-accent:active {
  transform: translateY(-1px);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent),
    0 6px 16px rgba(0, 0, 0, 0.3);
  filter: brightness(1.05);
}

.exercise-list {
  display: grid;
  gap: 8px;
  padding-inline: 14px;
}

.exercise-drop-wrapper {
  display: grid;
  gap: 6px;
}

.exercise-row {
  display: grid;
  gap: 6px;
}

.exercise-header {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto auto auto;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.exercise-title {
  font-weight: 600;
  min-width: 0;
}

.exercise-title-button {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
  width: 100%;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exercise-title-input {
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 4px 8px;
  font: inherit;
  width: 100%;
  min-width: 0;
}

.exercise-bpm input {
  width: 64px;
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 4px 6px;
  font: inherit;
  text-align: center;
}

.exercise-bpm-button {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}

.exercise-bpm {
  display: flex;
  justify-content: flex-end;
}

.exercise-bpm-readonly {
  min-width: 64px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text);
  font-weight: 600;
}

.exercise-bpm-value {
  min-width: 3ch;
  text-align: right;
}

.exercise-bpm-label {
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.exercise-minutes {
  color: var(--muted);
  font-weight: 600;
  width: 32px;
  text-align: right;
}

.exercise-minutes-button,
.exercise-minutes-readonly {
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  text-align: right;
}

.exercise-minutes-button {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}

.exercise-minutes-input {
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  padding: 2px 6px;
  text-align: right;
  width: 100%;
}

.exercise-body {
  display: grid;
  gap: 10px;
  padding-inline: 14px;
}

.exercise-detail {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.exercise-notes {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.exercise-notes-textarea {
  width: 100%;
  min-height: 84px;
  margin-top: 18px;
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  padding: 10px 12px;
  font: inherit;
  line-height: 1.4;
  resize: vertical;
}

.interval-detail {
  align-items: stretch;
  flex-direction: column;
  gap: 10px;
  margin-left: -12px;
  margin-right: -16px;
}

.interval-detail:not(.interval-detail--edit) {
  margin-right: -28px;
}

.interval-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
  padding-inline: 15px;
  transform: translateX(-2px);
}

.interval-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateX(5px);
}

.interval-auto-toggle.ghost {
  color: var(--text-muted);
}

.interval-auto-toggle {
  margin-right: 14px;
  transform: translateX(-2px);
}

.interval-add-button {
  transform: translateX(-4px);
}

.interval-editor {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
  max-width: 100%;
  width: 100%;
}

.interval-editor input {
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  flex: 1 1 0;
  font-size: 14px;
  height: 32px;
  min-width: 0;
  max-width: 100%;
  width: 0;
  padding: 0 10px;
  font-family: inherit;
}

.interval-editor .base-button {
  flex: 0 0 auto;
}

.interval-save {
  margin-left: auto;
}

.interval-list {
  display: grid;
  gap: 6px;
  padding-inline: 0;
  width: 100%;
}

.interval-drop-wrapper {
  display: grid;
  gap: 4px;
}

.interval-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px 48px 28px;
  align-items: center;
  column-gap: 8px;
  row-gap: 4px;
  padding: 4px 0;
  width: 100%;
  justify-self: stretch;
}

.interval-row--edit {
  column-gap: 12px;
}

.interval-row-wrap {
  display: grid;
  grid-template-columns: 1fr;
  align-items: center;
  column-gap: 6px;
  width: 100%;
  justify-self: stretch;
}

.interval-row-wrap--edit {
  grid-template-columns: auto 1fr;
  margin-left: -14px;
  padding-left: 14px;
}

.interval-row.interval-active {
  box-shadow: inset 2px 0 0 var(--accent);
  border-radius: 0;
}

.interval-name {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  width: 100%;
}

.interval-redo-button {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  margin-left: 12px;
  cursor: pointer;
}

.interval-redo-placeholder {
  display: none;
}

.interval-redo-button:hover {
  color: var(--text);
  border-color: var(--accent);
}

.interval-name-button,
.interval-bpm-button,
.interval-duration-button {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.interval-name-button {
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
  word-break: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  margin-left: 12px;
}

.interval-name-button:disabled,
.interval-bpm-button:disabled,
.interval-duration-button:disabled {
  cursor: default;
}

.interval-name-input,
.interval-bpm-input,
.interval-duration-input {
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 4px 8px;
  font: inherit;
  width: 100%;
  box-sizing: border-box;
}

.interval-bpm {
  min-width: 0;
  text-align: right;
  justify-self: end;
  white-space: nowrap;
  width: 56px;
}

.interval-duration {
  justify-self: end;
  text-align: right;
  white-space: nowrap;
  width: 48px;
  padding-left: 4px;
}

.interval-row .confirm-actions {
  justify-self: end;
}

.tab-inline-actions .confirm-actions {
  transform: translateX(3px);
}

.interval-bpm-button,
.interval-bpm-input {
  text-align: right;
  width: 100%;
}

.interval-duration-button,
.interval-duration-input {
  text-align: right;
  width: 100%;
}

.interval-delete-button {
  width: 28px;
  height: 28px;
  padding: 0;
  overflow: visible;
}

.interval-delete-button.base-button {
  line-height: 0;
  padding: 6px;
}

.interval-delete-button :deep(svg) {
  width: 24px !important;
  height: 24px !important;
  transform: none;
}

.interval-timer {
  color: var(--accent);
  font-weight: 600;
  margin-left: auto;
  font-size: 16px;
  text-align: right;
  transform: translateX(-6px);
}

.tab-detail {
  min-width: 0;
  justify-content: flex-start;
}

.tab-inline-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tab-link {
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-file-name {
  flex: 1 1 auto;
  min-width: 0;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-muted);
}

.tab-locate-button.base-button {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  font-weight: 700;
  background: transparent;
}

.tab-locate-button.base-button:hover:not(:disabled),
.tab-locate-button.base-button:focus-visible,
.tab-locate-button.base-button:active {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.source-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 auto;
}

.source-toggle-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  transition: color 0.15s ease;
}

.source-toggle-label.active {
  color: var(--accent);
  font-weight: 600;
}

.source-toggle--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.source-toggle-switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  cursor: pointer;
}

.source-toggle-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  overflow: hidden;
  white-space: nowrap;
}

.source-toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-2) 84%, #ffffff 16%);
  border: 1px solid color-mix(in srgb, var(--text-muted) 36%, transparent);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.source-toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 84%, #ffffff 16%);
  transition:
    transform 0.15s ease,
    background-color 0.15s ease;
}

.source-toggle-input:checked + .source-toggle-slider {
  background: var(--accent);
  border-color: var(--accent);
}

.source-toggle-input:checked + .source-toggle-slider::after {
  transform: translateX(14px);
  background: #0c0f14;
}

.source-toggle-segmented {
  display: inline-flex;
  align-items: center;
  gap: 0;
  margin: 0 auto;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
  overflow: hidden;
}

.source-segment {
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.source-segment:not(:last-child) {
  border-right: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent);
}

.source-segment.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 600;
}

.source-segment:disabled {
  opacity: 0.5;
  cursor: default;
}

.source-segment:hover:not(:disabled):not(.active) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-muted) 10%, transparent);
}

.timer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.timer-button.base-button:hover:not(:disabled),
.timer-button.base-button:focus-visible,
.timer-button.base-button:active {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

.timer-button.base-button {
  transition:
    transform 120ms ease,
    filter 120ms ease;
}

.timer-elapsed {
  color: var(--muted);
  font-weight: 600;
  margin-left: auto;
  font-size: 16px;
  text-align: right;
  transform: translateX(-4px);
}

.timer-value,
.tab-value {
  transform: translateX(-4px);
}

.tab-actions {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-action-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
}

.tab-action-row :deep(button) {
  min-width: 0;
}

:deep(.tab-action-btn.base-button) {
  white-space: nowrap;
  line-height: 1;
  min-width: 0;
  width: 34px;
  height: 30px;
  padding: 4px;
  justify-content: center;
}

:deep(.interval-auto-toggle.base-button) {
  width: 56px;
  justify-content: center;
}

.link-text {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-weight: 600;
}

.drag-handle {
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  margin-left: 8px;
}

.handle-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.drop-indicator {
  height: 2px;
  background: var(--accent);
  border-radius: 999px;
  margin: 4px 0;
}

.drag-ghost {
  opacity: 0.35;
}

.drag-chosen {
  opacity: 0.6;
}

.drag-dragging {
  opacity: 0.85;
}

.circle-button {
  border-radius: 999px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
}

.circle-button.add {
  background: var(--accent);
  color: #0b0e13;
}

.circle-button.delete {
  background: #ff8b8b;
  color: #2a0b0b;
}

.share-dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.share-dialog {
  position: relative;
  width: min(440px, 92vw);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
  display: grid;
  gap: 12px;
  overflow: visible;
  min-height: 250px;
}

.share-dialog :deep(.app-select-content) {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 10020;
}

.share-dialog-title {
  text-align: center;
  font-size: 1.05rem;
}

.share-dialog-text {
  margin: 0;
  text-align: center;
  color: var(--text);
}

.share-dialog-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
}

.share-dialog-row--stacked {
  flex-direction: column;
  align-items: stretch;
  position: relative;
}

.share-dialog-checkbox {
  width: 16px;
  height: 16px;
}

.share-dialog-select {
  width: 100%;
}

.share-dialog-select-content {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 10020;
}

.share-dialog-note {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
  text-align: center;
}

.share-dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.share-dialog-actions--stacked {
  flex-direction: column;
  align-items: stretch;
}

.link-dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
}

.link-dialog {
  position: relative;
  width: min(520px, 90vw);
  height: min(70vh, 520px);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
}

.link-title {
  text-align: center;
  font-size: 1.05rem;
}

.link-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0 12px 0 6px;
  box-sizing: border-box;
}

.link-search-icon {
  color: var(--text-muted);
  pointer-events: none;
}

.link-search {
  flex: 1;
  background: #0f141d;
  border: 1px solid var(--accent);
  border-radius: 10px;
  color: var(--text);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.95rem;
  height: 36px;
}

:deep(.link-add.base-button) {
  white-space: nowrap;
  height: 36px;
  padding: 0 12px;
  line-height: 1;
}

.duplicate-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--overlay-backdrop);
  z-index: 10030;
}

.duplicate-modal {
  width: min(360px, 92vw);
  padding: 20px 24px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--modal-surface);
  display: grid;
  gap: 16px;
  justify-items: center;
  text-align: center;
}

.duplicate-text {
  margin: 0;
  font-weight: 600;
}

.tempo-warning-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: grid;
  place-items: center;
  z-index: 10040;
}

.tempo-warning-modal {
  width: min(520px, calc(100% - 32px));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 18px;
  background: var(--modal-surface);
  display: grid;
  gap: 14px;
  text-align: center;
  justify-items: center;
}

.tempo-warning-modal h2 {
  margin: 0;
  font-size: 1rem;
}

.tempo-warning-modal p {
  margin: 10px 0 14px;
  color: var(--text-muted);
  line-height: 1.45;
  text-align: center;
}

.link-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px 0 6px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) rgba(255, 255, 255, 0.12);
}

.link-list-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-row {
  display: flex;
  align-items: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-row:hover {
  border-color: var(--accent);
}

.link-list::-webkit-scrollbar {
  width: 8px;
}

.link-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
}

.link-list::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 999px;
}

.link-actions {
  display: flex;
  justify-content: center;
}

.link-close {
  padding: 0 10px;
}
</style>
.confirm-actions .confirm-trigger.base-button { padding: 5px; } .confirm-actions
.confirm-trigger :deep(svg) { width: 16px; height: 16px; }
