import { ref, computed, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { usePracticeStore } from '../../stores/practice';
import { usePlayerStore } from '../../stores/player';
import { usePracticeUiStore } from '../../stores/practiceUi';
import { usePracticeTimerStore } from '../../stores/practiceTimer';
import { togglePlanExpansion } from '../../domain/practiceUi';
import { useTicker } from '../../services/useTicker';
import { formatDurationHms } from '../../domain/time';
import type {
  PracticeExercise,
  PracticeInterval,
  PracticePlan,
} from '../../domain/practice';
import type { IntervalRunnerStateValue } from './useIntervalRunner';

export type PlanManagementOptions = {
  intervalRunnerState: Ref<IntervalRunnerStateValue>;
  cancelExerciseTitleEdit: () => void;
};

export function usePlanManagement(options: PlanManagementOptions) {
  const practiceStore = usePracticeStore();
  const playerStore = usePlayerStore();
  const practiceUiStore = usePracticeUiStore();
  const practiceTimerStore = usePracticeTimerStore();

  const newPlanName = ref('');
  const newPlanTimed = ref(false);
  // Expand/collapse state lives on the Pinia store so navigating away to
  // Metronome / Stats / Library and back restores the same expanded plan
  // and exercise — the Practice page unmounts on navigation and would
  // otherwise reset these refs.
  const { expandedPlanId, expandedItemByPlan, editModeByPlan } =
    storeToRefs(practiceUiStore);
  const planList = ref<typeof practiceStore.plans>([]);
  const planTitleEditId = ref<string | null>(null);
  const planTitleDraft = ref('');

  const isPlayerPlaying = computed(
    () => playerStore.model.playback === 'playing',
  );
  // Expansion-driven exercise session means `activeExerciseId` is always set
  // whenever something is expanded — so we can no longer use it as a "lock"
  // signal. Lock only while the interval runner is actually running: at that
  // point switching exercises would cut off a timed run.
  const isTimerLocked = computed(() =>
    Boolean(
      options.intervalRunnerState.value.running &&
      options.intervalRunnerState.value.exerciseId,
    ),
  );
  const isExerciseSessionActive = computed(() =>
    Boolean(practiceStore.activeExerciseId),
  );
  const exerciseTimerTick = useTicker(isExerciseSessionActive);
  const isAnyEditMode = computed(() =>
    Object.values(editModeByPlan.value).some(Boolean),
  );

  /** The exercise currently expanded in the active plan, if any. Drives the
   * per-exercise timer and playback-time routing. */
  const expandedExerciseIdComputed = computed<string | null>(() => {
    const planId = expandedPlanId.value;
    if (!planId) return null;
    return expandedItemByPlan.value[planId] ?? null;
  });

  // Mirror expansion state into the shared UI store + run the per-exercise
  // timer against it. Expanding auto-starts the global session timer too —
  // it's idempotent if the user already pressed the timer button.
  watch(
    expandedExerciseIdComputed,
    async (next, prev) => {
      practiceUiStore.setExpandedExerciseId(next);
      if (prev) {
        await practiceStore.stopExercise();
      }
      if (next) {
        await practiceStore.startExercise(next);
        practiceTimerStore.start();
      }
    },
    { immediate: true },
  );

  async function handleCreatePlan(): Promise<void> {
    const name = newPlanName.value.trim();
    if (!name) {
      return;
    }
    await practiceStore.createPlan(name, newPlanTimed.value);
    newPlanName.value = '';
    newPlanTimed.value = false;
  }

  async function handleDeletePlan(plan: PracticePlan): Promise<void> {
    await practiceStore.deletePlan(plan.id);
    if (expandedPlanId.value === plan.id) {
      expandedPlanId.value = null;
    }
    if (editModeByPlan.value[plan.id]) {
      editModeByPlan.value = {
        ...editModeByPlan.value,
        [plan.id]: false,
      };
    }
    if (expandedItemByPlan.value[plan.id]) {
      const nextExpanded = { ...expandedItemByPlan.value };
      delete nextExpanded[plan.id];
      expandedItemByPlan.value = nextExpanded;
    }
    if (planTitleEditId.value === plan.id) {
      cancelPlanTitleEdit();
    }
    if (options.cancelExerciseTitleEdit) {
      options.cancelExerciseTitleEdit();
    }
  }

  function togglePlan(planId: string): void {
    if (isTimerLocked.value) {
      return;
    }
    const next = togglePlanExpansion(
      expandedPlanId.value,
      planId,
      editModeByPlan.value,
    );
    expandedPlanId.value = next.expandedPlanId;
    editModeByPlan.value = next.editModeByPlan;
  }

  function handlePlanHeaderClick(planId: string): void {
    if (isEditMode(planId)) {
      return;
    }
    togglePlan(planId);
  }

  function isPlanExpanded(planId: string): boolean {
    return expandedPlanId.value === planId;
  }

  function hasExercises(planId: string): boolean {
    return itemsForPlan(planId).length > 0;
  }

  function toggleEditMode(planId: string): void {
    const nextEnabled = !editModeByPlan.value[planId];
    editModeByPlan.value = {
      ...editModeByPlan.value,
      [planId]: nextEnabled,
    };
    if (planTitleEditId.value === planId) {
      cancelPlanTitleEdit();
    }
    if (options.cancelExerciseTitleEdit) {
      options.cancelExerciseTitleEdit();
    }
    if (nextEnabled) {
      if (!isPlanExpanded(planId) && !hasExercises(planId)) {
        expandedPlanId.value = planId;
      }
      const expandedExerciseId = expandedItemByPlan.value[planId];
      if (expandedExerciseId) {
        void practiceStore.ensureIntervalsLoaded(expandedExerciseId);
      }
    }
  }

  function isEditMode(planId: string): boolean {
    return Boolean(editModeByPlan.value[planId]);
  }

  function startPlanTitleEdit(plan: PracticePlan): void {
    if (!isEditMode(plan.id)) {
      return;
    }
    planTitleEditId.value = plan.id;
    planTitleDraft.value = plan.title;
  }

  function commitPlanTitleEdit(plan: PracticePlan): void {
    const next = planTitleDraft.value.trim();
    if (!next) {
      cancelPlanTitleEdit();
      return;
    }
    void practiceStore.updatePlan(plan.id, { title: next });
    planTitleEditId.value = null;
  }

  function cancelPlanTitleEdit(): void {
    planTitleEditId.value = null;
    planTitleDraft.value = '';
  }

  function togglePlanTimed(plan: PracticePlan): void {
    if (!isEditMode(plan.id)) {
      return;
    }
    void practiceStore.updatePlan(plan.id, { timed: !plan.timed });
  }

  function planTotalMinutes(planId: string): number {
    return practiceStore.exercises
      .filter((item) => item.planId === planId)
      .reduce((sum, item) => sum + (item.timePlannedMinutes ?? 0), 0);
  }

  function itemsForPlan(planId: string): PracticeExercise[] {
    return practiceStore.exercises
      .filter((item) => item.planId === planId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function toggleExercise(planId: string, itemId: string): void {
    if (isTimerLocked.value && practiceStore.activeExerciseId !== itemId) {
      return;
    }
    const current = expandedItemByPlan.value[planId] ?? null;
    if (isTimerLocked.value && current === itemId) {
      return;
    }
    const isOpening = current !== itemId;
    expandedItemByPlan.value = {
      ...expandedItemByPlan.value,
      [planId]: current === itemId ? null : itemId,
    };
    if (isOpening) {
      void practiceStore.ensureIntervalsLoaded(itemId);
    }
  }

  function isExerciseExpanded(planId: string, itemId: string): boolean {
    return expandedItemByPlan.value[planId] === itemId;
  }

  function getExpandedExercise(): PracticeExercise | null {
    const planId = expandedPlanId.value;
    if (!planId) {
      return null;
    }
    const exerciseId = expandedItemByPlan.value[planId];
    if (!exerciseId) {
      return null;
    }
    return (
      practiceStore.exercises.find((exercise) => exercise.id === exerciseId) ??
      null
    );
  }

  function displayPlannedMinutes(item: PracticeExercise): string {
    const intervalMinutes = totalIntervalMinutes(item.id);
    if (intervalMinutes !== null) {
      return formatMinutesValue(intervalMinutes);
    }
    return item.timePlannedMinutes === null
      ? '—'
      : formatMinutesValue(item.timePlannedMinutes);
  }

  function formatMinutesValue(minutes: number): string {
    const rounded = Math.round(minutes * 100) / 100;
    const label = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return `${label}m`;
  }

  function totalIntervalMinutes(exerciseId: string): number | null {
    const intervals = practiceStore.intervalsForExercise(exerciseId);
    if (intervals.length === 0) {
      return null;
    }
    const totalSeconds = intervals.reduce(
      (sum, interval) => sum + interval.durationSeconds,
      0,
    );
    return Math.round((totalSeconds / 60) * 100) / 100;
  }

  function intervalLabel(interval: PracticeInterval): string {
    const trimmed = interval.name?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'Interval';
  }

  function intervalBpmLabel(interval: PracticeInterval): string {
    return interval.bpm !== null && interval.bpm !== undefined
      ? `${interval.bpm} BPM`
      : '—';
  }

  function intervalMinutesDraft(seconds: number): string {
    const minutes = Math.round((seconds / 60) * 100) / 100;
    return String(minutes);
  }

  function isActive(itemId: string): boolean {
    if (practiceStore.activeExerciseId === itemId) {
      return true;
    }
    return (
      options.intervalRunnerState.value.running &&
      options.intervalRunnerState.value.exerciseId === itemId
    );
  }

  function canStart(itemId: string): boolean {
    const runningExerciseId = practiceStore.activeExerciseId
      ? practiceStore.activeExerciseId
      : options.intervalRunnerState.value.running
        ? options.intervalRunnerState.value.exerciseId
        : null;
    return !runningExerciseId || runningExerciseId === itemId;
  }

  function sessionElapsed(itemId: string): string {
    return formatDurationHms(practiceStore.exerciseSessionSeconds(itemId));
  }

  return {
    // Refs
    newPlanName,
    newPlanTimed,
    expandedPlanId,
    expandedItemByPlan,
    editModeByPlan,
    planList,
    planTitleEditId,
    planTitleDraft,

    // Computeds
    isPlayerPlaying,
    isTimerLocked,
    isExerciseSessionActive,
    exerciseTimerTick,
    isAnyEditMode,

    // Functions
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
    formatMinutesValue,
    totalIntervalMinutes,
    intervalLabel,
    intervalBpmLabel,
    intervalMinutesDraft,
    isActive,
    canStart,
    sessionElapsed,
  };
}
