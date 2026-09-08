import { ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { parseMinutesToSeconds } from '../../domain/intervals';

export function parseIntervalBpm(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.min(400, Math.max(20, parsed));
}

export function useDraftForms() {
  const practiceStore = usePracticeStore();

  const draftByPlan = ref<
    Record<string, { open: boolean; name: string; minutes: string }>
  >({});
  const intervalDraftByExercise = ref<
    Record<
      string,
      { open: boolean; name: string; bpm: string; minutes: string }
    >
  >({});

  function getDraft(planId: string): {
    open: boolean;
    name: string;
    minutes: string;
  } {
    if (!draftByPlan.value[planId]) {
      draftByPlan.value[planId] = { open: false, name: '', minutes: '' };
    }
    return draftByPlan.value[planId];
  }

  function openDraft(planId: string): void {
    const draft = getDraft(planId);
    if (draft.open) {
      closeDraft(planId);
      return;
    }
    draft.open = true;
    draftByPlan.value = { ...draftByPlan.value, [planId]: { ...draft } };
  }

  function closeDraft(planId: string): void {
    const draft = getDraft(planId);
    draft.open = false;
    draft.name = '';
    draft.minutes = '';
    draftByPlan.value = { ...draftByPlan.value, [planId]: { ...draft } };
  }

  function getIntervalDraft(exerciseId: string): {
    open: boolean;
    name: string;
    bpm: string;
    minutes: string;
  } {
    if (!intervalDraftByExercise.value[exerciseId]) {
      intervalDraftByExercise.value[exerciseId] = {
        open: false,
        name: '',
        bpm: '',
        minutes: '',
      };
    }
    return intervalDraftByExercise.value[exerciseId];
  }

  function openIntervalDraft(exerciseId: string): void {
    const draft = getIntervalDraft(exerciseId);
    if (draft.open) {
      closeIntervalDraft(exerciseId);
      return;
    }
    draft.open = true;
    intervalDraftByExercise.value = {
      ...intervalDraftByExercise.value,
      [exerciseId]: { ...draft },
    };
  }

  function closeIntervalDraft(exerciseId: string): void {
    const draft = getIntervalDraft(exerciseId);
    draft.open = false;
    draft.name = '';
    draft.bpm = '';
    draft.minutes = '';
    intervalDraftByExercise.value = {
      ...intervalDraftByExercise.value,
      [exerciseId]: { ...draft },
    };
  }

  function intervalsForExercise(exerciseId: string) {
    return practiceStore.intervalsForExercise(exerciseId);
  }

  async function submitIntervalDraft(exerciseId: string): Promise<void> {
    const draft = getIntervalDraft(exerciseId);
    const durationSeconds = parseMinutesToSeconds(draft.minutes);
    if (!durationSeconds) {
      return;
    }
    const bpm = parseIntervalBpm(draft.bpm);
    if (bpm === undefined) {
      return;
    }
    const name = draft.name.trim();
    const sortIndex = intervalsForExercise(exerciseId).length;
    await practiceStore.createInterval(exerciseId, {
      name: name.length > 0 ? name : null,
      durationSeconds,
      sortIndex,
      bpm,
    });
    closeIntervalDraft(exerciseId);
  }

  async function submitDraft(planId: string): Promise<void> {
    const draft = getDraft(planId);
    const name = draft.name.trim();
    const plan = practiceStore.plans.find((entry) => entry.id === planId);
    const minutesRaw = draft.minutes.trim();
    const minutesValue =
      minutesRaw.length > 0 ? Number.parseInt(minutesRaw, 10) : null;
    if (!name) {
      return;
    }
    if (plan?.timed) {
      if (!Number.isFinite(minutesValue) || (minutesValue ?? 0) <= 0) {
        return;
      }
    }
    const minutes =
      minutesValue !== null && Number.isFinite(minutesValue)
        ? Math.max(0, minutesValue)
        : null;
    await practiceStore.createExercise(planId, name, minutes);
    closeDraft(planId);
  }

  return {
    draftByPlan,
    intervalDraftByExercise,
    getDraft,
    openDraft,
    closeDraft,
    getIntervalDraft,
    openIntervalDraft,
    closeIntervalDraft,
    submitIntervalDraft,
    submitDraft,
  };
}
