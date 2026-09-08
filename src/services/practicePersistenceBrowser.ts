import type {
  PracticeExercise,
  PracticeInterval,
  PracticePlan,
  PracticeSession,
} from '../domain/practice';
import { hasJournalContent } from '../domain/sessionJournal';
import { setStoredJson } from '../domain/storage';
import { createId } from '../utils/id';
import { nowIso, todayKey } from '../utils/date';
import type {
  ExerciseBpmHistoryPayload,
  IntervalModeSessionPayload,
  PracticePersistence,
} from './practicePersistenceTypes';
import {
  type PracticeState,
  STORAGE_KEY,
  listPlansPayload,
  loadState,
  saveState,
} from './practicePersistenceBrowserState';

export const browserAdapter: PracticePersistence = {
  async listPracticePlans() {
    const state = loadState();
    return listPlansPayload(state);
  },
  async createPracticePlan(title, timed) {
    const state = loadState();
    const now = nowIso();
    const plan: PracticePlan = {
      id: createId(),
      title,
      timed,
      sortOrder: state.plans.length,
      createdAt: now,
      updatedAt: now,
    };
    state.plans = [...state.plans, plan];
    saveState(state);
    return plan;
  },
  async updatePracticePlan(planId, input) {
    const state = loadState();
    const now = nowIso();
    state.plans = state.plans.map((plan) => {
      if (plan.id !== planId) {
        return plan;
      }
      return {
        ...plan,
        title: input.title ?? plan.title,
        timed: input.timed ?? plan.timed ?? false,
        updatedAt: now,
      };
    });
    saveState(state);
  },
  async renamePracticePlan(planId, title) {
    const state = loadState();
    const now = nowIso();
    state.plans = state.plans.map((plan) =>
      plan.id === planId ? { ...plan, title, updatedAt: now } : plan,
    );
    saveState(state);
  },
  async reorderPracticePlans(orderedIds) {
    const state = loadState();
    state.plans = state.plans.map((plan) => {
      const nextIndex = orderedIds.indexOf(plan.id);
      return nextIndex === -1
        ? plan
        : { ...plan, sortOrder: nextIndex, updatedAt: nowIso() };
    });
    saveState(state);
  },
  async deletePracticePlan(planId) {
    const state = loadState();
    const exerciseIds = new Set(
      state.exercises.filter((ex) => ex.planId === planId).map((ex) => ex.id),
    );
    state.plans = state.plans.filter((plan) => plan.id !== planId);
    state.exercises = state.exercises.filter((ex) => ex.planId !== planId);
    state.intervals = state.intervals.filter(
      (interval) => !exerciseIds.has(interval.exerciseId),
    );
    state.sessionExercises = state.sessionExercises.filter(
      (entry) => !exerciseIds.has(entry.exerciseId),
    );
    saveState(state);
  },
  async createExercise(planId, input) {
    const state = loadState();
    const now = nowIso();
    const sortOrder = state.exercises.filter(
      (ex) => ex.planId === planId,
    ).length;
    const exercise: PracticeExercise = {
      id: createId(),
      planId,
      title: input.title,
      sortOrder,
      timePlannedMinutes: input.timePlannedMinutes,
      intervalAuto: true,
      intervalRepeat: false,
      linkedTabId: null,
      linkedAudioId: null,
      totalTimeSpentSeconds: 0,
      bpm: input.bpm ?? null,
      notes: input.notes ?? null,
      intervals: [],
      createdAt: now,
      updatedAt: now,
    };
    state.exercises = [...state.exercises, exercise];
    saveState(state);
    return exercise;
  },
  async updateExercise(exerciseId, input) {
    const state = loadState();
    const now = nowIso();
    state.exercises = state.exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }
      const nextTime =
        input.timePlannedMinutes !== undefined
          ? input.timePlannedMinutes
          : exercise.timePlannedMinutes;
      const nextBpm =
        input.bpm !== undefined ? input.bpm : (exercise.bpm ?? null);
      const nextIntervalAuto =
        input.intervalAuto !== undefined
          ? input.intervalAuto
          : (exercise.intervalAuto ?? true);
      const nextIntervalRepeat =
        input.intervalRepeat !== undefined
          ? input.intervalRepeat
          : (exercise.intervalRepeat ?? false);
      const nextNotes =
        input.notes !== undefined ? input.notes : (exercise.notes ?? null);
      const nextPreferredSource =
        input.preferredSource !== undefined
          ? input.preferredSource
          : exercise.preferredSource;
      return {
        ...exercise,
        title: input.title ?? exercise.title,
        timePlannedMinutes: nextTime,
        bpm: nextBpm,
        intervalAuto: nextIntervalAuto,
        intervalRepeat: nextIntervalRepeat,
        notes: nextNotes,
        preferredSource: nextPreferredSource,
        updatedAt: now,
      };
    });
    saveState(state);
  },
  async deleteExercise(exerciseId) {
    const state = loadState();
    state.exercises = state.exercises.filter((ex) => ex.id !== exerciseId);
    state.intervals = state.intervals.filter(
      (interval) => interval.exerciseId !== exerciseId,
    );
    state.sessionExercises = state.sessionExercises.filter(
      (entry) => entry.exerciseId !== exerciseId,
    );
    saveState(state);
  },
  async reorderExercises(planId, orderedIds) {
    const state = loadState();
    const now = nowIso();
    state.exercises = state.exercises.map((exercise) => {
      if (exercise.planId !== planId) {
        return exercise;
      }
      const nextIndex = orderedIds.indexOf(exercise.id);
      return nextIndex === -1
        ? exercise
        : { ...exercise, sortOrder: nextIndex, updatedAt: now };
    });
    saveState(state);
  },
  async linkExerciseToLibraryItem(exerciseId, libraryItemId) {
    const state = loadState();
    const now = nowIso();
    state.exercises = state.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? { ...exercise, linkedTabId: libraryItemId, updatedAt: now }
        : exercise,
    );
    saveState(state);
  },
  async linkExerciseToAudio(exerciseId, audioId) {
    const state = loadState();
    const now = nowIso();
    state.exercises = state.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? { ...exercise, linkedAudioId: audioId, updatedAt: now }
        : exercise,
    );
    saveState(state);
  },
  async unlinkExerciseFromLibraryItem(exerciseId, kind) {
    const state = loadState();
    const now = nowIso();
    state.exercises = state.exercises.map((exercise) => {
      if (exercise.id !== exerciseId) {
        return exercise;
      }
      if (kind === 'tab') {
        return { ...exercise, linkedTabId: null, updatedAt: now };
      }
      if (kind === 'audio') {
        return { ...exercise, linkedAudioId: null, updatedAt: now };
      }
      return {
        ...exercise,
        linkedTabId: null,
        linkedAudioId: null,
        updatedAt: now,
      };
    });
    saveState(state);
  },
  async listIntervals(exerciseId) {
    const state = loadState();
    return state.intervals
      .filter((interval) => interval.exerciseId === exerciseId)
      .map((interval) => ({
        ...interval,
        bpm: interval.bpm ?? null,
        done: interval.done ?? false,
      }))
      .sort((a, b) => {
        if (a.sortIndex !== b.sortIndex) {
          return a.sortIndex - b.sortIndex;
        }
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      });
  },
  async createInterval(exerciseId, input) {
    const state = loadState();
    const interval: PracticeInterval = {
      id: createId(),
      exerciseId,
      name: input.name ?? null,
      durationSeconds: input.durationSeconds,
      bpm: input.bpm ?? null,
      sortIndex: input.sortIndex,
      done: false,
      createdAt: Date.now(),
    };
    state.intervals = [...state.intervals, interval];
    saveState(state);
    return interval;
  },
  async updateInterval(intervalId, input) {
    const state = loadState();
    const existing = state.intervals.find((entry) => entry.id === intervalId);
    if (!existing) {
      throw new Error('interval_not_found');
    }
    const updated: PracticeInterval = {
      ...existing,
      name: input.name !== undefined ? input.name : existing.name,
      durationSeconds: input.durationSeconds ?? existing.durationSeconds,
      bpm: input.bpm !== undefined ? input.bpm : existing.bpm,
      done: input.done !== undefined ? input.done : (existing.done ?? false),
    };
    state.intervals = state.intervals.map((interval) =>
      interval.id === intervalId ? updated : interval,
    );
    saveState(state);
    return updated;
  },
  async deleteInterval(intervalId) {
    const state = loadState();
    state.intervals = state.intervals.filter(
      (interval) => interval.id !== intervalId,
    );
    saveState(state);
  },
  async reorderIntervals(exerciseId, orderedIds) {
    const state = loadState();
    state.intervals = state.intervals.map((interval) => {
      if (interval.exerciseId !== exerciseId) {
        return interval;
      }
      const nextIndex = orderedIds.indexOf(interval.id);
      return nextIndex === -1
        ? interval
        : { ...interval, sortIndex: nextIndex };
    });
    saveState(state);
  },
  async clearIntervalDoneFlags(exerciseId) {
    const state = loadState();
    state.intervals = state.intervals.map((interval) =>
      interval.exerciseId === exerciseId
        ? { ...interval, done: false }
        : interval,
    );
    saveState(state);
  },
  async startSessionIfNeeded() {
    const state = loadState();
    const today = todayKey();
    const now = nowIso();
    const active = state.sessions.find((session) => session.endedAt === null);
    if (active && active.sessionDate === today) {
      return active;
    }
    if (active && active.sessionDate !== today) {
      active.endedAt = now;
    }
    const session: PracticeSession = {
      id: createId(),
      sessionDate: today,
      startedAt: now,
      endedAt: null,
      totalTimeSpentSeconds: 0,
      totalPlaybackSeconds: 0,
      createdAt: now,
    };
    state.sessions = [
      ...state.sessions.filter((s) => s.id !== active?.id),
      session,
    ];
    saveState(state);
    return session;
  },
  async endActiveSession() {
    const state = loadState();
    const now = nowIso();
    state.sessions = state.sessions.map((session) =>
      session.endedAt === null ? { ...session, endedAt: now } : session,
    );
    saveState(state);
  },
  async addExerciseTime(exerciseId, deltaSeconds, playbackMode) {
    await browserAdapter.startSessionIfNeeded();
    const state = loadState();
    const session = state.sessions.find((entry) => entry.endedAt === null);
    if (!session) {
      return;
    }
    const now = nowIso();

    const existing = state.sessionExercises.find(
      (entry) =>
        entry.sessionId === session.id && entry.exerciseId === exerciseId,
    );
    if (existing) {
      existing.timeSpentSeconds += deltaSeconds;
      if (playbackMode) {
        existing.playbackMode = playbackMode;
      }
    } else {
      state.sessionExercises.push({
        id: createId(),
        sessionId: session.id,
        exerciseId,
        timeSpentSeconds: deltaSeconds,
        playbackTimeSeconds: 0,
        playbackMode,
        createdAt: now,
      });
    }

    state.exercises = state.exercises.map((exercise) =>
      exercise.id === exerciseId
        ? {
            ...exercise,
            totalTimeSpentSeconds:
              exercise.totalTimeSpentSeconds + deltaSeconds,
            updatedAt: now,
          }
        : exercise,
    );

    saveState(state);
  },
  async addSessionTime(deltaSeconds) {
    await browserAdapter.startSessionIfNeeded();
    const state = loadState();
    const session = state.sessions.find((entry) => entry.endedAt === null);
    if (!session) {
      return;
    }
    state.sessions = state.sessions.map((entry) =>
      entry.id === session.id
        ? {
            ...entry,
            totalTimeSpentSeconds: entry.totalTimeSpentSeconds + deltaSeconds,
          }
        : entry,
    );
    saveState(state);
  },
  async addPlaybackTime(exerciseId, deltaSeconds) {
    await browserAdapter.startSessionIfNeeded();
    const state = loadState();
    const session = state.sessions.find((entry) => entry.endedAt === null);
    if (!session) {
      return;
    }
    const now = nowIso();
    state.sessions = state.sessions.map((entry) =>
      entry.id === session.id
        ? {
            ...entry,
            totalPlaybackSeconds:
              (entry.totalPlaybackSeconds ?? 0) + deltaSeconds,
          }
        : entry,
    );
    if (exerciseId) {
      const existing = state.sessionExercises.find(
        (entry) =>
          entry.sessionId === session.id && entry.exerciseId === exerciseId,
      );
      if (existing) {
        existing.playbackTimeSeconds =
          (existing.playbackTimeSeconds ?? 0) + deltaSeconds;
      } else {
        state.sessionExercises.push({
          id: createId(),
          sessionId: session.id,
          exerciseId,
          timeSpentSeconds: 0,
          playbackTimeSeconds: deltaSeconds,
          createdAt: now,
        });
      }
    }
    saveState(state);
  },
  async confirmClose() {
    // No-op in browser context (no native window to close).
  },
  async getActiveSession() {
    const state = loadState();
    const session = state.sessions.find((entry) => entry.endedAt === null);
    if (!session) {
      return null;
    }
    const exercises = state.sessionExercises.filter(
      (entry) => entry.sessionId === session.id,
    );
    return { session, exercises };
  },
  async listSessions(options = {}) {
    const state = loadState();
    const from = options.from;
    const to = options.to;
    return state.sessions.filter((session) => {
      if (from && session.sessionDate < from) {
        return false;
      }
      if (to && session.sessionDate > to) {
        return false;
      }
      return true;
    });
  },
  async getSessionDetail(sessionId) {
    const state = loadState();
    const session = state.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
      throw new Error('session_not_found');
    }
    const exercises = state.sessionExercises.filter(
      (entry) => entry.sessionId === sessionId,
    );
    return { session, exercises };
  },
  async updateSessionGoal(sessionId, goalText) {
    const state = loadState();
    state.sessions = state.sessions.map((session) =>
      session.id === sessionId ? { ...session, goalText } : session,
    );
    saveState(state);
  },
  async updateSessionReview(sessionId, input) {
    const state = loadState();
    state.sessions = state.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            reviewText: input.reviewText ?? null,
            goalPercent: input.goalPercent ?? null,
            goalReached: input.goalReached ?? null,
          }
        : session,
    );
    saveState(state);
  },
  async clearSessionJournal(sessionId) {
    const state = loadState();
    state.sessions = state.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            goalText: null,
            reviewText: null,
            goalPercent: null,
            goalReached: null,
          }
        : session,
    );
    saveState(state);
  },
  async listSessionsWithJournal() {
    const state = loadState();
    // Reuse the same predicate the Stats UI uses so the two layers
    // can't drift. Browser sessions legitimately leave the four
    // journal fields `undefined` (not `null`) when no journaling
    // has happened yet — `undefined !== null` would otherwise
    // match every pre-journal session and fill the list with
    // empty rows.
    return [...state.sessions]
      .filter(hasJournalContent)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  },
  async getIntervalsCompletedTotal() {
    const state = loadState();
    return state.intervalsCompletedTotal ?? 0;
  },
  async incrementIntervalsCompletedTotal(delta) {
    const state = loadState();
    const next = Math.max(0, (state.intervalsCompletedTotal ?? 0) + delta);
    state.intervalsCompletedTotal = next;
    saveState(state);
    return next;
  },
  async listIntervalModeSessions(options = {}) {
    const state = loadState();
    const from = options.from;
    const to = options.to;
    return state.intervalModeSessions.filter((session) => {
      if (from && session.sessionDate < from) {
        return false;
      }
      if (to && session.sessionDate > to) {
        return false;
      }
      return true;
    });
  },
  async recordIntervalModeSession(input) {
    const state = loadState();
    const session: IntervalModeSessionPayload = {
      id: input.id ?? createId(),
      sessionDate: input.sessionDate,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      timedMode: input.timedMode,
      plannedTotalSeconds: input.plannedTotalSeconds ?? null,
      actualRunSeconds: Math.max(0, Math.round(input.actualRunSeconds)),
      intervalDurationSeconds: Math.max(
        1,
        Math.round(input.intervalDurationSeconds),
      ),
      intervalsCompleted: Math.max(0, Math.round(input.intervalsCompleted)),
      startBpm: Math.max(20, Math.round(input.startBpm)),
      endBpm: Math.max(20, Math.round(input.endBpm)),
    };
    state.intervalModeSessions = [...state.intervalModeSessions, session];
    saveState(state);
    return session;
  },
  async recordExerciseBpm(exerciseId, bpm) {
    const state = loadState();
    const now = nowIso();
    const today = todayKey();
    const entry: ExerciseBpmHistoryPayload = {
      id: createId(),
      exerciseId,
      sessionDate: today,
      bpm,
      recordedAt: now,
    };
    state.bpmHistory = [...state.bpmHistory, entry];
    saveState(state);
    return entry;
  },
  async listExerciseBpmHistory() {
    const state = loadState();
    return state.bpmHistory;
  },
  async recordLibraryItemTime(libraryItemId, deltaSeconds) {
    const state = loadState();
    const now = nowIso();
    const existing = state.libraryItemStats.find(
      (entry) => entry.libraryItemId === libraryItemId,
    );
    if (existing) {
      existing.totalTimeSeconds += deltaSeconds;
      existing.lastPlayedAt = now;
    } else {
      state.libraryItemStats.push({
        libraryItemId,
        playCount: 0,
        totalTimeSeconds: deltaSeconds,
        loopCount: 0,
        lastPlayedAt: now,
      });
    }
    saveState(state);
  },
  async incrementLibraryItemPlayCount(libraryItemId) {
    const state = loadState();
    const now = nowIso();
    const existing = state.libraryItemStats.find(
      (entry) => entry.libraryItemId === libraryItemId,
    );
    if (existing) {
      existing.playCount += 1;
      existing.lastPlayedAt = now;
    } else {
      state.libraryItemStats.push({
        libraryItemId,
        playCount: 1,
        totalTimeSeconds: 0,
        loopCount: 0,
        lastPlayedAt: now,
      });
    }
    saveState(state);
  },
  async incrementLibraryItemLoopCount(libraryItemId) {
    const state = loadState();
    const existing = state.libraryItemStats.find(
      (entry) => entry.libraryItemId === libraryItemId,
    );
    if (existing) {
      existing.loopCount += 1;
    } else {
      state.libraryItemStats.push({
        libraryItemId,
        playCount: 0,
        totalTimeSeconds: 0,
        loopCount: 1,
        lastPlayedAt: null,
      });
    }
    saveState(state);
  },
  async listLibraryItemStats() {
    const state = loadState();
    return state.libraryItemStats;
  },
  async restorePracticeStats(input) {
    const state = loadState();
    const totals = new Map(
      input.exerciseTotals.map((entry) => [
        entry.exerciseId,
        entry.totalTimeSpentSeconds,
      ]),
    );
    state.exercises = state.exercises.map((exercise) => ({
      ...exercise,
      totalTimeSpentSeconds:
        totals.get(exercise.id) ?? exercise.totalTimeSpentSeconds,
    }));
    state.sessions = [...input.sessions];
    state.sessionExercises = [...input.sessionExercises];
    state.intervalsCompletedTotal = Math.max(
      0,
      input.intervalsCompletedTotal ?? 0,
    );
    state.intervalModeSessions = [];
    if (input.bpmHistory) {
      state.bpmHistory = [...input.bpmHistory];
    }
    if (input.libraryItemStats) {
      state.libraryItemStats = [...input.libraryItemStats];
    }
    saveState(state);
  },
  async resetPracticeDb() {
    setStoredJson<PracticeState>(STORAGE_KEY, {
      plans: [],
      exercises: [],
      intervals: [],
      sessions: [],
      sessionExercises: [],
      intervalsCompletedTotal: 0,
      intervalModeSessions: [],
      bpmHistory: [],
      libraryItemStats: [],
    });
  },
};
