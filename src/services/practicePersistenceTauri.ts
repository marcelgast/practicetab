import { invoke } from '@tauri-apps/api/core';
import type {
  PracticeExercise,
  PracticeInterval,
  PracticePlan,
  PracticeSession,
} from '../domain/practice';
import type {
  ActiveSessionPayload,
  ExerciseBpmHistoryPayload,
  IntervalModeSessionPayload,
  LibraryItemStatsPayload,
  PracticePersistence,
  PracticePlanPayload,
  SessionDetailPayload,
} from './practicePersistenceTypes';

export const tauriAdapter: PracticePersistence = {
  async listPracticePlans() {
    return invoke<PracticePlanPayload[]>('list_practice_plans');
  },
  async createPracticePlan(title, timed) {
    return invoke<PracticePlan>('create_practice_plan', { title, timed });
  },
  async updatePracticePlan(planId, input) {
    await invoke('update_practice_plan', { planId, input });
  },
  async renamePracticePlan(planId, title) {
    await invoke('rename_practice_plan', { planId, title });
  },
  async reorderPracticePlans(orderedIds) {
    await invoke('reorder_practice_plans', { orderedPlanIds: orderedIds });
  },
  async deletePracticePlan(planId) {
    await invoke('delete_practice_plan', { planId });
  },
  async createExercise(planId, input) {
    return invoke<PracticeExercise>('create_exercise', { planId, input });
  },
  async updateExercise(exerciseId, input) {
    await invoke('update_exercise', { exerciseId, input });
  },
  async deleteExercise(exerciseId) {
    await invoke('delete_exercise', { exerciseId });
  },
  async reorderExercises(planId, orderedIds) {
    await invoke('reorder_exercises', {
      planId,
      orderedExerciseIds: orderedIds,
    });
  },
  async linkExerciseToLibraryItem(exerciseId, libraryItemId) {
    await invoke('link_exercise_to_library_item', {
      exerciseId,
      libraryItemId,
    });
  },
  async linkExerciseToAudio(exerciseId, audioId) {
    await invoke('link_exercise_to_audio', {
      exerciseId,
      audioId,
    });
  },
  async unlinkExerciseFromLibraryItem(exerciseId, kind) {
    await invoke('unlink_exercise_from_library_item', { exerciseId, kind });
  },
  async listIntervals(exerciseId) {
    return invoke<PracticeInterval[]>('list_intervals', { exerciseId });
  },
  async createInterval(exerciseId, input) {
    return invoke<PracticeInterval>('create_interval', { exerciseId, input });
  },
  async updateInterval(intervalId, input) {
    return invoke<PracticeInterval>('update_interval', { intervalId, input });
  },
  async deleteInterval(intervalId) {
    await invoke('delete_interval', { intervalId });
  },
  async reorderIntervals(exerciseId, orderedIds) {
    await invoke('reorder_intervals', { exerciseId, orderedIds });
  },
  async clearIntervalDoneFlags(exerciseId) {
    await invoke('clear_interval_done_flags', { exerciseId });
  },
  async startSessionIfNeeded() {
    return invoke<PracticeSession>('start_session_if_needed');
  },
  async endActiveSession() {
    await invoke('end_active_session');
  },
  async addExerciseTime(exerciseId, deltaSeconds, playbackMode) {
    await invoke('add_exercise_time', {
      exerciseId,
      deltaSeconds,
      playbackMode: playbackMode ?? null,
    });
  },
  async addSessionTime(deltaSeconds) {
    await invoke('add_session_time', { deltaSeconds });
  },
  async addPlaybackTime(exerciseId, deltaSeconds) {
    await invoke('add_playback_time', {
      exerciseId: exerciseId ?? null,
      deltaSeconds,
    });
  },
  async confirmClose() {
    await invoke('confirm_close');
  },
  async getActiveSession() {
    return invoke<ActiveSessionPayload | null>('get_active_session');
  },
  async listSessions(options = {}) {
    return invoke<PracticeSession[]>('list_sessions', {
      from: options.from ?? null,
      to: options.to ?? null,
    });
  },
  async getSessionDetail(sessionId) {
    return invoke<SessionDetailPayload>('get_session_detail', { sessionId });
  },
  async updateSessionGoal(sessionId, goalText) {
    await invoke('update_session_goal', { sessionId, goalText });
  },
  async updateSessionReview(sessionId, input) {
    await invoke('update_session_review', {
      sessionId,
      reviewText: input.reviewText ?? null,
      goalPercent: input.goalPercent ?? null,
      goalReached: input.goalReached ?? null,
    });
  },
  async clearSessionJournal(sessionId) {
    await invoke('clear_session_journal', { sessionId });
  },
  async listSessionsWithJournal() {
    return invoke<PracticeSession[]>('list_sessions_with_journal');
  },
  async getIntervalsCompletedTotal() {
    return invoke<number>('get_intervals_completed_total');
  },
  async incrementIntervalsCompletedTotal(delta) {
    return invoke<number>('increment_intervals_completed_total', { delta });
  },
  async listIntervalModeSessions(options = {}) {
    return invoke<IntervalModeSessionPayload[]>('list_interval_mode_sessions', {
      from: options.from ?? null,
      to: options.to ?? null,
    });
  },
  async recordIntervalModeSession(input) {
    return invoke<IntervalModeSessionPayload>('record_interval_mode_session', {
      input,
    });
  },
  async recordExerciseBpm(exerciseId, bpm) {
    return invoke<ExerciseBpmHistoryPayload>('record_exercise_bpm', {
      exerciseId,
      bpm,
    });
  },
  async listExerciseBpmHistory() {
    return invoke<ExerciseBpmHistoryPayload[]>('list_exercise_bpm_history');
  },
  async recordLibraryItemTime(libraryItemId, deltaSeconds) {
    await invoke('record_library_item_time', { libraryItemId, deltaSeconds });
  },
  async incrementLibraryItemPlayCount(libraryItemId) {
    await invoke('increment_library_item_play_count', { libraryItemId });
  },
  async incrementLibraryItemLoopCount(libraryItemId) {
    await invoke('increment_library_item_loop_count', { libraryItemId });
  },
  async listLibraryItemStats() {
    return invoke<LibraryItemStatsPayload[]>('list_library_item_stats');
  },
  async restorePracticeStats(input) {
    await invoke('restore_practice_stats', { input });
  },
  async resetPracticeDb() {
    await invoke('reset_practice_db');
  },
};
