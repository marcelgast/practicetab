import { ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { parseMinutesToSeconds } from '../../domain/intervals';
import { parseIntervalBpm } from './useDraftForms';
import type { PracticeExercise, PracticeInterval } from '../../domain/practice';

export function useIntervalEditing() {
  const practiceStore = usePracticeStore();

  const intervalNameEditId = ref<string | null>(null);
  const intervalNameDraft = ref('');
  const intervalBpmEditId = ref<string | null>(null);
  const intervalBpmDraft = ref('');
  const intervalDurationEditId = ref<string | null>(null);
  const intervalDurationDraft = ref('');

  function intervalMinutesDraft(seconds: number): string {
    const minutes = Math.round((seconds / 60) * 100) / 100;
    return String(minutes);
  }

  function startIntervalNameEdit(interval: PracticeInterval): void {
    intervalNameEditId.value = interval.id;
    intervalNameDraft.value = interval.name ?? '';
    intervalBpmEditId.value = null;
    intervalBpmDraft.value = '';
    intervalDurationEditId.value = null;
    intervalDurationDraft.value = '';
  }

  function commitIntervalNameEdit(
    exerciseId: string,
    interval: PracticeInterval,
  ): void {
    if (intervalNameEditId.value !== interval.id) {
      return;
    }
    const next = intervalNameDraft.value.trim();
    void practiceStore.updateInterval(exerciseId, interval.id, {
      name: next.length > 0 ? next : null,
    });
    intervalNameEditId.value = null;
    intervalNameDraft.value = '';
  }

  function cancelIntervalNameEdit(): void {
    intervalNameEditId.value = null;
    intervalNameDraft.value = '';
  }

  function startIntervalBpmEdit(interval: PracticeInterval): void {
    intervalBpmEditId.value = interval.id;
    intervalBpmDraft.value =
      interval.bpm !== null && interval.bpm !== undefined
        ? String(interval.bpm)
        : '';
    intervalNameEditId.value = null;
    intervalNameDraft.value = '';
    intervalDurationEditId.value = null;
    intervalDurationDraft.value = '';
  }

  function commitIntervalBpmEdit(
    exerciseId: string,
    interval: PracticeInterval,
  ): void {
    if (intervalBpmEditId.value !== interval.id) {
      return;
    }
    const bpm = parseIntervalBpm(intervalBpmDraft.value);
    if (bpm === undefined) {
      return;
    }
    void practiceStore.updateInterval(exerciseId, interval.id, { bpm });
    intervalBpmEditId.value = null;
    intervalBpmDraft.value = '';
  }

  function cancelIntervalBpmEdit(): void {
    intervalBpmEditId.value = null;
    intervalBpmDraft.value = '';
  }

  function startIntervalDurationEdit(interval: PracticeInterval): void {
    intervalDurationEditId.value = interval.id;
    intervalDurationDraft.value = intervalMinutesDraft(
      interval.durationSeconds,
    );
    intervalNameEditId.value = null;
    intervalNameDraft.value = '';
    intervalBpmEditId.value = null;
    intervalBpmDraft.value = '';
  }

  function commitIntervalDurationEdit(
    exerciseId: string,
    interval: PracticeInterval,
  ): void {
    if (intervalDurationEditId.value !== interval.id) {
      return;
    }
    const durationSeconds = parseMinutesToSeconds(intervalDurationDraft.value);
    if (!durationSeconds) {
      cancelIntervalDurationEdit();
      return;
    }
    void practiceStore.updateInterval(exerciseId, interval.id, {
      durationSeconds,
    });
    intervalDurationEditId.value = null;
    intervalDurationDraft.value = '';
  }

  function cancelIntervalDurationEdit(): void {
    intervalDurationEditId.value = null;
    intervalDurationDraft.value = '';
  }

  function toggleIntervalAuto(exercise: PracticeExercise): void {
    const nextAuto = !isIntervalAutoEnabled(exercise);
    const updates: { intervalAuto: boolean; intervalRepeat?: boolean } = {
      intervalAuto: nextAuto,
    };
    // Disable repeat when auto is turned off
    if (!nextAuto && isIntervalRepeatEnabled(exercise)) {
      updates.intervalRepeat = false;
    }
    void practiceStore.updateExercise(exercise.id, updates);
  }

  function isIntervalAutoEnabled(exercise: PracticeExercise): boolean {
    return exercise.intervalAuto ?? true;
  }

  function toggleIntervalRepeat(exercise: PracticeExercise): void {
    void practiceStore.updateExercise(exercise.id, {
      intervalRepeat: !isIntervalRepeatEnabled(exercise),
    });
  }

  function isIntervalRepeatEnabled(exercise: PracticeExercise): boolean {
    return exercise.intervalRepeat ?? false;
  }

  function markIntervalDone(
    exerciseId: string,
    intervalId: string,
    done: boolean,
  ): void {
    void practiceStore.updateInterval(exerciseId, intervalId, { done });
  }

  return {
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
  };
}
