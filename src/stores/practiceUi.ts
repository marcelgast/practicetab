import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Shared store for practice-page UI state that needs to outlive the page
 * component. Expand/collapse state lived here originally only so the
 * global practice timer could observe it, but it also needs to survive
 * navigation away to the Metronome / Stats / Library pages and back —
 * the Practice page unmounts on navigation (no <keep-alive>), so
 * composable-local refs would reset. Holding the state in the Pinia
 * singleton restores it automatically when the user returns.
 */
export const usePracticeUiStore = defineStore('practiceUi', () => {
  /** Currently expanded plan in the practice page, or null if none. */
  const expandedPlanId = ref<string | null>(null);

  /** Per-plan: which exercise is expanded (null means none). */
  const expandedItemByPlan = ref<Record<string, string | null>>({});

  /**
   * Derived id of the currently expanded exercise — what the practice
   * timer and playback-time routing observe.
   */
  const expandedExerciseId = ref<string | null>(null);

  /**
   * Per-plan edit-mode flag. Promoted from a composable-local ref so
   * the guided-onboarding runner can flip it programmatically when a
   * step needs the Add Exercise / Add Interval / Connect controls on
   * screen. The Practice page still drives toggling through its
   * existing `toggleEditMode(planId)` helper — this store just holds
   * the state.
   */
  const editModeByPlan = ref<Record<string, boolean>>({});

  function setExpandedExerciseId(id: string | null): void {
    expandedExerciseId.value = id;
  }

  function setEditMode(planId: string, value: boolean): void {
    editModeByPlan.value = { ...editModeByPlan.value, [planId]: value };
  }

  return {
    expandedPlanId,
    expandedItemByPlan,
    expandedExerciseId,
    editModeByPlan,
    setExpandedExerciseId,
    setEditMode,
  };
});
