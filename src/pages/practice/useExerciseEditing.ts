import { ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import type { PracticeExercise } from '../../domain/practice';

export type ExerciseEditingParams = {
  isEditMode: (planId: string) => boolean;
};

export function useExerciseEditing(params: ExerciseEditingParams) {
  const practiceStore = usePracticeStore();

  const exerciseTitleEditId = ref<string | null>(null);
  const exerciseTitleDraft = ref('');
  const bpmDraftByExercise = ref<Record<string, string>>({});
  const exerciseBpmEditId = ref<string | null>(null);
  const exerciseMinutesEditId = ref<string | null>(null);
  const minutesDraftByExercise = ref<Record<string, string>>({});
  const notesDraftByExercise = ref<Record<string, string>>({});
  const notesEditId = ref<string | null>(null);

  function startExerciseTitleEdit(
    planId: string,
    exercise: PracticeExercise,
  ): void {
    if (!params.isEditMode(planId)) {
      return;
    }
    exerciseTitleEditId.value = exercise.id;
    exerciseTitleDraft.value = exercise.title;
  }

  function commitExerciseTitleEdit(exercise: PracticeExercise): void {
    const next = exerciseTitleDraft.value.trim();
    if (!next) {
      cancelExerciseTitleEdit();
      return;
    }
    void practiceStore.updateExercise(exercise.id, { title: next });
    exerciseTitleEditId.value = null;
  }

  function cancelExerciseTitleEdit(): void {
    exerciseTitleEditId.value = null;
    exerciseTitleDraft.value = '';
  }

  function updateBpmDraft(exerciseId: string, value: string): void {
    const digits = value.replace(/\D/g, '');
    bpmDraftByExercise.value = {
      ...bpmDraftByExercise.value,
      [exerciseId]: digits,
    };
  }

  function startExerciseBpmEdit(exercise: PracticeExercise): void {
    exerciseBpmEditId.value = exercise.id;
    bpmDraftByExercise.value = {
      ...bpmDraftByExercise.value,
      [exercise.id]: exercise.bpm ? String(exercise.bpm) : '',
    };
  }

  function commitExerciseBpmEdit(exercise: PracticeExercise): void {
    if (exerciseBpmEditId.value !== exercise.id) {
      return;
    }
    commitExerciseBpm(exercise);
    exerciseBpmEditId.value = null;
  }

  function cancelExerciseBpmEdit(exercise: PracticeExercise): void {
    if (exerciseBpmEditId.value !== exercise.id) {
      return;
    }
    cancelExerciseBpm(exercise);
    exerciseBpmEditId.value = null;
  }

  function commitExerciseBpm(exercise: PracticeExercise): void {
    const raw = bpmDraftByExercise.value[exercise.id] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) {
      void practiceStore.updateExercise(exercise.id, { bpm: null });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.max(20, Math.min(300, parsed));
    bpmDraftByExercise.value = {
      ...bpmDraftByExercise.value,
      [exercise.id]: String(clamped),
    };
    void practiceStore.updateExercise(exercise.id, { bpm: clamped });
  }

  function cancelExerciseBpm(exercise: PracticeExercise): void {
    const fallback = exercise.bpm ? String(exercise.bpm) : '';
    bpmDraftByExercise.value = {
      ...bpmDraftByExercise.value,
      [exercise.id]: fallback,
    };
  }

  function updateMinutesDraft(exerciseId: string, value: string): void {
    const sanitized = value.replace(/[^0-9.,]/g, '');
    minutesDraftByExercise.value = {
      ...minutesDraftByExercise.value,
      [exerciseId]: sanitized,
    };
  }

  function startExerciseMinutesEdit(exercise: PracticeExercise): void {
    exerciseMinutesEditId.value = exercise.id;
    minutesDraftByExercise.value = {
      ...minutesDraftByExercise.value,
      [exercise.id]:
        exercise.timePlannedMinutes === null
          ? ''
          : String(exercise.timePlannedMinutes),
    };
  }

  function commitExerciseMinutesEdit(exercise: PracticeExercise): void {
    if (exerciseMinutesEditId.value !== exercise.id) {
      return;
    }
    commitExerciseMinutes(exercise);
    exerciseMinutesEditId.value = null;
  }

  function cancelExerciseMinutesEdit(exercise: PracticeExercise): void {
    if (exerciseMinutesEditId.value !== exercise.id) {
      return;
    }
    const fallback =
      exercise.timePlannedMinutes === null
        ? ''
        : String(exercise.timePlannedMinutes);
    minutesDraftByExercise.value = {
      ...minutesDraftByExercise.value,
      [exercise.id]: fallback,
    };
    exerciseMinutesEditId.value = null;
  }

  function commitExerciseMinutes(exercise: PracticeExercise): void {
    const raw = minutesDraftByExercise.value[exercise.id] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) {
      void practiceStore.updateExercise(exercise.id, {
        timePlannedMinutes: null,
      });
      return;
    }
    const normalized = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    const clamped = Math.round(parsed * 100) / 100;
    minutesDraftByExercise.value = {
      ...minutesDraftByExercise.value,
      [exercise.id]: String(clamped),
    };
    void practiceStore.updateExercise(exercise.id, {
      timePlannedMinutes: clamped,
    });
  }

  function startExerciseNotesEdit(exercise: PracticeExercise): void {
    notesEditId.value = exercise.id;
    notesDraftByExercise.value = {
      ...notesDraftByExercise.value,
      [exercise.id]: exercise.notes ?? '',
    };
  }

  function updateExerciseNotesDraft(exerciseId: string, value: string): void {
    notesDraftByExercise.value = {
      ...notesDraftByExercise.value,
      [exerciseId]: value,
    };
  }

  function commitExerciseNotesEdit(exercise: PracticeExercise): void {
    if (notesEditId.value !== exercise.id) {
      return;
    }
    notesEditId.value = null;
    const draft = notesDraftByExercise.value[exercise.id] ?? '';
    const normalized = draft.trim().length === 0 ? null : draft;
    if (normalized === (exercise.notes ?? null)) {
      return;
    }
    void practiceStore.updateExercise(exercise.id, { notes: normalized });
  }

  return {
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
    commitExerciseBpm,
    cancelExerciseBpm,
    updateMinutesDraft,
    startExerciseMinutesEdit,
    commitExerciseMinutesEdit,
    cancelExerciseMinutesEdit,
    commitExerciseMinutes,
    startExerciseNotesEdit,
    updateExerciseNotesDraft,
    commitExerciseNotesEdit,
  };
}
