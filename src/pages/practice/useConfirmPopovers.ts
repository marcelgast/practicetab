import { ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import type { PracticeExercise, PracticePlan } from '../../domain/practice';

export type ConfirmPopoversCallbacks = {
  onDeletePlan: (plan: PracticePlan) => Promise<void>;
  onUnlink: (item: PracticeExercise, kind?: 'tab' | 'audio') => Promise<void>;
};

export function useConfirmPopovers(callbacks: ConfirmPopoversCallbacks) {
  const practiceStore = usePracticeStore();
  const confirmDeletePlanId = ref<string | null>(null);
  const confirmDeleteExerciseId = ref<string | null>(null);
  const confirmDeleteIntervalId = ref<string | null>(null);
  const confirmRemoveTabId = ref<string | null>(null);
  const confirmDirection = ref<'up' | 'down'>('down');
  const CONFIRM_POPOVER_SELECTOR = '.confirm-popover, .confirm-trigger';

  function closeAllConfirms(): void {
    confirmDeletePlanId.value = null;
    confirmDeleteExerciseId.value = null;
    confirmDeleteIntervalId.value = null;
    confirmRemoveTabId.value = null;
  }

  function setConfirmDirection(event: MouseEvent): void {
    const rect = (
      event.currentTarget as HTMLElement | null
    )?.getBoundingClientRect();
    if (!rect) {
      confirmDirection.value = 'down';
      return;
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    confirmDirection.value = spaceBelow < 170 ? 'up' : 'down';
  }

  function toggleConfirm(
    target: { value: string | null },
    id: string,
    event: MouseEvent,
  ): void {
    if (target.value === id) {
      closeAllConfirms();
      return;
    }
    closeAllConfirms();
    target.value = id;
    setConfirmDirection(event);
  }

  function toggleDeletePlanConfirm(planId: string, event: MouseEvent): void {
    toggleConfirm(confirmDeletePlanId, planId, event);
  }

  function toggleDeleteExerciseConfirm(
    exerciseId: string,
    event: MouseEvent,
  ): void {
    toggleConfirm(confirmDeleteExerciseId, exerciseId, event);
  }

  function toggleDeleteIntervalConfirm(
    exerciseId: string,
    intervalId: string,
    event: MouseEvent,
  ): void {
    toggleConfirm(
      confirmDeleteIntervalId,
      intervalConfirmKey(exerciseId, intervalId),
      event,
    );
  }

  function toggleRemoveTabConfirm(exerciseId: string, event: MouseEvent): void {
    toggleConfirm(confirmRemoveTabId, exerciseId, event);
  }

  async function confirmDeletePlan(plan: PracticePlan): Promise<void> {
    closeAllConfirms();
    await callbacks.onDeletePlan(plan);
  }

  async function confirmDeleteExercise(item: PracticeExercise): Promise<void> {
    closeAllConfirms();
    await practiceStore.deleteExercise(item.id);
  }

  async function confirmDeleteInterval(
    exerciseId: string,
    intervalId: string,
  ): Promise<void> {
    closeAllConfirms();
    await practiceStore.deleteInterval(exerciseId, intervalId);
  }

  async function confirmRemoveTab(
    item: PracticeExercise,
    kind?: 'tab' | 'audio',
  ): Promise<void> {
    closeAllConfirms();
    await callbacks.onUnlink(item, kind);
  }

  function intervalConfirmKey(exerciseId: string, intervalId: string): string {
    return `${exerciseId}:${intervalId}`;
  }

  function handleWindowClick(event: MouseEvent): void {
    const target = event.target;
    if (
      !confirmDeletePlanId.value &&
      !confirmDeleteExerciseId.value &&
      !confirmDeleteIntervalId.value &&
      !confirmRemoveTabId.value
    ) {
      return;
    }
    if (!(target instanceof Element)) {
      closeAllConfirms();
      return;
    }
    if (target.closest(CONFIRM_POPOVER_SELECTOR)) {
      return;
    }
    closeAllConfirms();
  }

  return {
    confirmDeletePlanId,
    confirmDeleteExerciseId,
    confirmDeleteIntervalId,
    confirmRemoveTabId,
    confirmDirection,
    CONFIRM_POPOVER_SELECTOR,
    closeAllConfirms,
    setConfirmDirection,
    toggleConfirm,
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
  };
}
