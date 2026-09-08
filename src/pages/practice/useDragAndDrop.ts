import { ref, watch, type Ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import type {
  PracticeExercise,
  PracticeInterval,
  PracticePlan,
} from '../../domain/practice';

export type DragAndDropOptions = {
  isEditMode: (planId: string) => boolean;
  planList: Ref<PracticePlan[]>;
  itemsForPlan: (planId: string) => PracticeExercise[];
};

type DragMoveEvent = {
  draggedContext: { element: { id: string } };
  relatedContext: { index: number };
  willInsertAfter: boolean;
};
type DragChangeEvent = { moved?: { oldIndex: number; newIndex: number } };

export function useDragAndDrop(options: DragAndDropOptions) {
  const practiceStore = usePracticeStore();

  const isPlanDragging = ref(false);
  const exerciseLists = ref<Record<string, PracticeExercise[]>>({});
  const draggingExercisePlanId = ref<string | null>(null);
  const intervalLists = ref<Record<string, PracticeInterval[]>>({});
  const draggingIntervalExerciseId = ref<string | null>(null);

  const planDropIndex = ref<number | null>(null);
  const exerciseDropIndex = ref<Record<string, number | null>>({});
  const intervalDropIndex = ref<Record<string, number | null>>({});

  function intervalsForExercise(exerciseId: string): PracticeInterval[] {
    return practiceStore.intervalsForExercise(exerciseId);
  }

  function syncExerciseLists(): void {
    const next: Record<string, PracticeExercise[]> = {};
    for (const plan of practiceStore.plans) {
      if (draggingExercisePlanId.value === plan.id) {
        next[plan.id] =
          exerciseLists.value[plan.id] ?? options.itemsForPlan(plan.id);
      } else {
        next[plan.id] = options.itemsForPlan(plan.id);
      }
    }
    exerciseLists.value = next;
  }

  function syncIntervalLists(): void {
    const next: Record<string, PracticeInterval[]> = {};
    for (const exercise of practiceStore.exercises) {
      if (draggingIntervalExerciseId.value === exercise.id) {
        next[exercise.id] =
          intervalLists.value[exercise.id] ?? intervalsForExercise(exercise.id);
      } else {
        next[exercise.id] = intervalsForExercise(exercise.id);
      }
    }
    intervalLists.value = next;
  }

  watch(
    () => [practiceStore.plans, practiceStore.exercises],
    () => {
      syncExerciseLists();
      syncIntervalLists();
      if (!isPlanDragging.value) {
        options.planList.value = [...practiceStore.plans];
      }
    },
    { deep: true, immediate: true },
  );

  function getExerciseList(planId: string): PracticeExercise[] {
    if (!exerciseLists.value[planId]) {
      exerciseLists.value = {
        ...exerciseLists.value,
        [planId]: options.itemsForPlan(planId),
      };
    }
    return exerciseLists.value[planId];
  }

  function getIntervalList(exerciseId: string): PracticeInterval[] {
    if (!intervalLists.value[exerciseId]) {
      intervalLists.value = {
        ...intervalLists.value,
        [exerciseId]: intervalsForExercise(exerciseId),
      };
    }
    return intervalLists.value[exerciseId];
  }

  function handlePlanMove(evt: {
    draggedContext: { element: { id: string } };
    relatedContext: { index: number };
    willInsertAfter: boolean;
  }): boolean {
    const index = evt.relatedContext.index + (evt.willInsertAfter ? 1 : 0);
    planDropIndex.value = index;
    return true;
  }

  function handlePlanDragStart(): void {
    planDropIndex.value = null;
    isPlanDragging.value = true;
  }

  function handlePlanDragEnd(): void {
    if (isPlanDragging.value) {
      const ids = options.planList.value.map((plan) => plan.id);
      void practiceStore.reorderPlans(ids);
    }
    planDropIndex.value = null;
    isPlanDragging.value = false;
  }

  function setExerciseDropIndex(planId: string, index: number | null): void {
    exerciseDropIndex.value = { ...exerciseDropIndex.value, [planId]: index };
  }

  function setIntervalDropIndex(
    exerciseId: string,
    index: number | null,
  ): void {
    intervalDropIndex.value = {
      ...intervalDropIndex.value,
      [exerciseId]: index,
    };
  }

  function handleExerciseMove(planId: string, evt: DragMoveEvent): boolean {
    if (!options.isEditMode(planId)) {
      return false;
    }
    const index = evt.relatedContext.index + (evt.willInsertAfter ? 1 : 0);
    setExerciseDropIndex(planId, index);
    return true;
  }

  function handleExerciseDragStart(planId: string): void {
    if (!options.isEditMode(planId)) {
      return;
    }
    draggingExercisePlanId.value = planId;
    setExerciseDropIndex(planId, null);
  }

  function handleExerciseDragEnd(planId: string): void {
    if (!options.isEditMode(planId)) {
      return;
    }
    const ids = getExerciseList(planId).map((item) => item.id);
    void practiceStore.reorderExercises(planId, ids);
    draggingExercisePlanId.value = null;
    setExerciseDropIndex(planId, null);
  }

  function handleExerciseChange(planId: string, event: DragChangeEvent): void {
    if (!options.isEditMode(planId)) {
      return;
    }
    if (!event.moved) {
      return;
    }
    exerciseLists.value = {
      ...exerciseLists.value,
      [planId]: getExerciseList(planId),
    };
  }

  function handleIntervalMove(exerciseId: string, evt: DragMoveEvent): boolean {
    const index = evt.relatedContext.index + (evt.willInsertAfter ? 1 : 0);
    setIntervalDropIndex(exerciseId, index);
    return true;
  }

  function handleIntervalDragStart(exerciseId: string): void {
    draggingIntervalExerciseId.value = exerciseId;
    setIntervalDropIndex(exerciseId, null);
  }

  function handleIntervalDragEnd(exerciseId: string): void {
    const ids = getIntervalList(exerciseId).map((item) => item.id);
    void practiceStore.reorderIntervals(exerciseId, ids);
    draggingIntervalExerciseId.value = null;
    setIntervalDropIndex(exerciseId, null);
  }

  function handleIntervalChange(
    exerciseId: string,
    event: DragChangeEvent,
  ): void {
    if (!event.moved) {
      return;
    }
    intervalLists.value = {
      ...intervalLists.value,
      [exerciseId]: getIntervalList(exerciseId),
    };
  }

  const exerciseMoveHandler = (planId: string) => (evt: DragMoveEvent) =>
    handleExerciseMove(planId, evt);
  const exerciseChangeHandler = (planId: string) => (evt: DragChangeEvent) =>
    handleExerciseChange(planId, evt);
  const intervalMoveHandler = (exerciseId: string) => (evt: DragMoveEvent) =>
    handleIntervalMove(exerciseId, evt);
  const intervalChangeHandler =
    (exerciseId: string) => (evt: DragChangeEvent) =>
      handleIntervalChange(exerciseId, evt);

  return {
    // Refs
    isPlanDragging,
    exerciseLists,
    draggingExercisePlanId,
    intervalLists,
    draggingIntervalExerciseId,
    planDropIndex,
    exerciseDropIndex,
    intervalDropIndex,

    // Functions
    intervalsForExercise,
    syncExerciseLists,
    syncIntervalLists,
    getExerciseList,
    getIntervalList,
    handlePlanMove,
    handlePlanDragStart,
    handlePlanDragEnd,
    setExerciseDropIndex,
    setIntervalDropIndex,
    handleExerciseMove,
    handleExerciseDragStart,
    handleExerciseDragEnd,
    handleExerciseChange,
    handleIntervalMove,
    handleIntervalDragStart,
    handleIntervalDragEnd,
    handleIntervalChange,
    exerciseMoveHandler,
    exerciseChangeHandler,
    intervalMoveHandler,
    intervalChangeHandler,
  };
}
