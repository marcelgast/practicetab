import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  aggregateDailyTotals,
  computeStreak,
  totalDurationSec,
  type PracticeExercise,
  type PracticeInterval,
  type PracticePlan,
  type PracticeSession,
} from '../domain/practice';
import { resolveExercisePlaybackMode } from '../domain/stats/exerciseStats';
import { practicePersistence } from '../services/practicePersistence';
import { todayKey } from '../utils/date';
import { createIntervalOps } from './practice/intervalOps';
import { useAppStore } from './app';

const DEFAULT_STREAK_TARGET_SEC = 10 * 60;
// Flush every tick so the DB is never more than 1s behind — if the app is
// killed hard, we can lose at most one second of exercise time.
const FLUSH_INTERVAL_SEC = 1;

export const usePracticeStore = defineStore('practice', () => {
  const plans = ref<PracticePlan[]>([]);
  const exercises = ref<PracticeExercise[]>([]);
  const sessions = ref<PracticeSession[]>([]);
  const activeSession = ref<PracticeSession | null>(null);
  /**
   * In-memory flag for the Session Journal goal prompt (PR 4.3).
   * Toggled to `true` once the user has either saved or skipped
   * the goal dialog for the CURRENT active session, so resuming
   * after a pause doesn't re-prompt. Reset whenever the active
   * session id changes — next session → new prompt.
   */
  const goalPromptDismissed = ref(false);
  const lastPromptedSessionId = ref<string | null>(null);
  /**
   * Single source of truth for the Session Goal Dialog open
   * state. App.vue opens it once the startup checks (updates +
   * licensing) pass, and the BottomBarTimer opens it when the
   * user clicks play with no goal yet set. Both paths route
   * through `openGoalDialogIfAppropriate()` so the guards stay
   * in one place.
   */
  const goalDialogOpen = ref(false);
  const exerciseElapsedSeconds = ref<Record<string, number>>({});
  const pendingSeconds = ref<Record<string, number>>({});
  const selectedPlanId = ref<string | null>(null);
  const activeExerciseId = ref<string | null>(null);
  const lastTickMs = ref<number | null>(null);
  const tickIntervalId = ref<number | null>(null);
  const intervalsLoaded = ref<Record<string, boolean>>({});
  const intervalsLoading = ref<
    Record<string, Promise<PracticeInterval[]> | null>
  >({});
  const isInitialized = ref(false);
  const flushedBpmKeys = ref(new Set<string>());

  const activePlan = computed(
    () => plans.value.find((plan) => plan.id === selectedPlanId.value) ?? null,
  );

  const exercisesForSelectedPlan = computed(() =>
    exercises.value
      .filter((item) => item.planId === selectedPlanId.value)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );

  const dailyTotalsForSelectedPlan = computed(() =>
    aggregateDailyTotals(sessions.value),
  );

  const todayTotalSec = computed(() => {
    const today = todayKey();
    return totalDurationSec(sessions.value, today, today);
  });

  const streak = computed(() =>
    computeStreak(dailyTotalsForSelectedPlan.value, DEFAULT_STREAK_TARGET_SEC),
  );

  async function updateExercise(
    exerciseId: string,
    updates: {
      title?: string;
      timePlannedMinutes?: number | null;
      bpm?: number | null;
      intervalAuto?: boolean;
      intervalRepeat?: boolean;
      notes?: string | null;
      preferredSource?: 'tab' | 'audio' | 'both';
    },
  ): Promise<void> {
    await practicePersistence.updateExercise(exerciseId, updates);
    exercises.value = exercises.value.map((ex) =>
      ex.id === exerciseId
        ? {
            ...ex,
            title: updates.title ?? ex.title,
            timePlannedMinutes:
              updates.timePlannedMinutes !== undefined
                ? updates.timePlannedMinutes
                : ex.timePlannedMinutes,
            bpm: updates.bpm !== undefined ? updates.bpm : ex.bpm,
            intervalAuto:
              updates.intervalAuto !== undefined
                ? updates.intervalAuto
                : (ex.intervalAuto ?? true),
            intervalRepeat:
              updates.intervalRepeat !== undefined
                ? updates.intervalRepeat
                : (ex.intervalRepeat ?? false),
            notes:
              updates.notes !== undefined ? updates.notes : (ex.notes ?? null),
            preferredSource: updates.preferredSource ?? ex.preferredSource,
          }
        : ex,
    );
  }

  const intervalOps = createIntervalOps({
    exercises,
    intervalsLoaded,
    intervalsLoading,
    persistence: practicePersistence,
    updateExercise,
  });

  function updatePlansPayload(payload: {
    plans: PracticePlan[];
    exercises: PracticeExercise[];
  }) {
    plans.value = payload.plans;
    exercises.value = payload.exercises.map((exercise) => ({
      ...exercise,
      intervalAuto: exercise.intervalAuto ?? true,
      intervalRepeat: exercise.intervalRepeat ?? false,
      intervals: [],
    }));
    if (!selectedPlanId.value && plans.value.length > 0) {
      selectedPlanId.value = plans.value[0].id;
    }
  }

  async function init(): Promise<void> {
    try {
      const payload = await practicePersistence.listPracticePlans();
      const exerciseIds = payload.flatMap((plan) =>
        plan.exercises.map((exercise) => exercise.id),
      );
      updatePlansPayload({
        plans: payload.map((entry) => ({
          id: entry.id,
          title: entry.title,
          timed: entry.timed,
          sortOrder: entry.sortOrder,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })),
        exercises: payload.flatMap((plan) => plan.exercises),
      });
      if (exerciseIds.length > 0) {
        await Promise.all(
          exerciseIds.map((exerciseId) =>
            practicePersistence.clearIntervalDoneFlags(exerciseId),
          ),
        );
      }
      intervalsLoaded.value = {};
      intervalsLoading.value = {};
      sessions.value = await practicePersistence.listSessions();
      await practicePersistence.endActiveSession();
      const session = await practicePersistence.startSessionIfNeeded();
      activeSession.value = session;
      // New session after every app open → fresh goal prompt.
      goalPromptDismissed.value = false;
      lastPromptedSessionId.value = null;
      exerciseElapsedSeconds.value = {};
      pendingSeconds.value = {};
      flushedBpmKeys.value = new Set<string>();
      if (!sessions.value.find((entry) => entry.id === session.id)) {
        sessions.value = [...sessions.value, session];
      }
    } catch (error) {
      void error;
      plans.value = [];
      exercises.value = [];
      sessions.value = [];
      selectedPlanId.value = null;
    } finally {
      isInitialized.value = true;
    }
  }

  async function createPlan(title: string, timed = false): Promise<void> {
    const plan = await practicePersistence.createPracticePlan(title, timed);
    plans.value = [...plans.value, plan];
    selectedPlanId.value = plan.id;
  }

  async function updatePlan(
    planId: string,
    updates: { title?: string; timed?: boolean },
  ): Promise<void> {
    await practicePersistence.updatePracticePlan(planId, updates);
    plans.value = plans.value.map((plan) =>
      plan.id === planId
        ? {
            ...plan,
            title: updates.title ?? plan.title,
            timed: updates.timed ?? plan.timed,
          }
        : plan,
    );
  }

  async function renamePlan(planId: string, title: string): Promise<void> {
    await practicePersistence.renamePracticePlan(planId, title);
    plans.value = plans.value.map((plan) =>
      plan.id === planId ? { ...plan, title } : plan,
    );
  }

  async function reorderPlans(orderedPlanIds: string[]): Promise<void> {
    await practicePersistence.reorderPracticePlans(orderedPlanIds);
    const next = orderedPlanIds
      .map((id, index) => {
        const plan = plans.value.find((entry) => entry.id === id);
        return plan ? { ...plan, sortOrder: index } : null;
      })
      .filter((plan): plan is PracticePlan => Boolean(plan));
    plans.value = next;
  }

  async function deletePlan(planId: string): Promise<void> {
    await practicePersistence.deletePracticePlan(planId);
    const removedExerciseIds = exercises.value
      .filter((ex) => ex.planId === planId)
      .map((ex) => ex.id);
    plans.value = plans.value.filter((plan) => plan.id !== planId);
    exercises.value = exercises.value.filter((ex) => ex.planId !== planId);
    if (removedExerciseIds.length > 0) {
      const next = { ...intervalsLoaded.value };
      for (const exerciseId of removedExerciseIds) {
        delete next[exerciseId];
      }
      intervalsLoaded.value = next;
    }
    if (selectedPlanId.value === planId) {
      selectedPlanId.value = plans.value[0]?.id ?? null;
    }
  }

  async function createExercise(
    planId: string,
    title: string,
    timePlannedMinutes: number | null,
  ): Promise<void> {
    const exercise = await practicePersistence.createExercise(planId, {
      title,
      timePlannedMinutes,
    });
    exercises.value = [...exercises.value, { ...exercise, intervals: [] }];
  }

  async function deleteExercise(exerciseId: string): Promise<void> {
    await practicePersistence.deleteExercise(exerciseId);
    exercises.value = exercises.value.filter((ex) => ex.id !== exerciseId);
    if (intervalsLoaded.value[exerciseId]) {
      const next = { ...intervalsLoaded.value };
      delete next[exerciseId];
      intervalsLoaded.value = next;
    }
    if (intervalsLoading.value[exerciseId]) {
      const nextLoading = { ...intervalsLoading.value };
      delete nextLoading[exerciseId];
      intervalsLoading.value = nextLoading;
    }
  }

  async function reorderExercises(
    planId: string,
    orderedExerciseIds: string[],
  ): Promise<void> {
    await practicePersistence.reorderExercises(planId, orderedExerciseIds);
    exercises.value = exercises.value.map((exercise) => {
      if (exercise.planId !== planId) {
        return exercise;
      }
      const index = orderedExerciseIds.indexOf(exercise.id);
      return index === -1 ? exercise : { ...exercise, sortOrder: index };
    });
  }

  async function linkLibraryItem(
    exerciseId: string,
    libraryItemId: string,
    kind: 'tab' | 'audio' = 'tab',
  ): Promise<void> {
    if (kind === 'audio') {
      await practicePersistence.linkExerciseToAudio(exerciseId, libraryItemId);
      exercises.value = exercises.value.map((ex) =>
        ex.id === exerciseId ? { ...ex, linkedAudioId: libraryItemId } : ex,
      );
    } else {
      await practicePersistence.linkExerciseToLibraryItem(
        exerciseId,
        libraryItemId,
      );
      exercises.value = exercises.value.map((ex) =>
        ex.id === exerciseId ? { ...ex, linkedTabId: libraryItemId } : ex,
      );
    }
  }

  async function unlinkLibraryItem(
    exerciseId: string,
    kind?: 'tab' | 'audio',
  ): Promise<void> {
    await practicePersistence.unlinkExerciseFromLibraryItem(exerciseId, kind);
    exercises.value = exercises.value.map((ex) => {
      if (ex.id !== exerciseId) {
        return ex;
      }
      if (kind === 'tab') {
        return { ...ex, linkedTabId: null };
      }
      if (kind === 'audio') {
        return { ...ex, linkedAudioId: null };
      }
      return { ...ex, linkedTabId: null, linkedAudioId: null };
    });
  }

  /**
   * Start counting "exercise time" for a given exercise. Triggered when the
   * user expands an exercise in the practice plan — NOT on playback. The
   * global/session timer and the playback tracker are separate concerns.
   */
  async function startExercise(exerciseId: string): Promise<void> {
    // Idempotent: the expansion watcher re-fires with `immediate: true` on
    // every Practice.vue remount (navigation back to the page). Re-running
    // the full start flow would reset lastTickMs and lose the fractional
    // second accumulated since the last tick.
    if (activeExerciseId.value === exerciseId && tickIntervalId.value) {
      return;
    }
    if (activeExerciseId.value && activeExerciseId.value !== exerciseId) {
      await stopExercise();
    }
    const session = await practicePersistence.startSessionIfNeeded();
    activeSession.value = session;
    if (!sessions.value.find((entry) => entry.id === session.id)) {
      sessions.value = [...sessions.value, session];
    }
    activeExerciseId.value = exerciseId;
    lastTickMs.value = Date.now();
    if (!tickIntervalId.value) {
      tickIntervalId.value = window.setInterval(() => {
        tickActiveExercise();
      }, 1000);
    }
  }

  /** Stop the exercise timer (on collapse or swap). Flushes pending seconds. */
  async function stopExercise(): Promise<void> {
    if (!activeExerciseId.value) {
      return;
    }
    tickActiveExercise();
    flushPending(activeExerciseId.value);
    activeExerciseId.value = null;
    lastTickMs.value = null;
    if (tickIntervalId.value) {
      window.clearInterval(tickIntervalId.value);
      tickIntervalId.value = null;
    }
  }

  function tickActiveExercise(): void {
    const exerciseId = activeExerciseId.value;
    const lastTick = lastTickMs.value;
    if (!exerciseId || !lastTick) {
      return;
    }
    const now = Date.now();
    const deltaSec = Math.floor((now - lastTick) / 1000);
    if (deltaSec <= 0) {
      return;
    }
    lastTickMs.value = lastTick + deltaSec * 1000;
    pendingSeconds.value = {
      ...pendingSeconds.value,
      [exerciseId]: (pendingSeconds.value[exerciseId] ?? 0) + deltaSec,
    };
    exerciseElapsedSeconds.value = {
      ...exerciseElapsedSeconds.value,
      [exerciseId]: (exerciseElapsedSeconds.value[exerciseId] ?? 0) + deltaSec,
    };
    if ((pendingSeconds.value[exerciseId] ?? 0) >= FLUSH_INTERVAL_SEC) {
      flushPending(exerciseId);
    }
  }

  function flushPending(exerciseId: string): void {
    const pending = pendingSeconds.value[exerciseId] ?? 0;
    if (pending <= 0) {
      return;
    }
    pendingSeconds.value = { ...pendingSeconds.value, [exerciseId]: 0 };

    const exercise = exercises.value.find((ex) => ex.id === exerciseId);
    const mode = exercise ? resolveExercisePlaybackMode(exercise) : undefined;
    void practicePersistence.addExerciseTime(exerciseId, pending, mode);

    // Library item time is tracked by the Player/Song stores via their
    // own play/pause/stop lifecycle — not duplicated here.
    if (exercise && exercise.bpm && exercise.bpm > 0) {
      const bpmKey = `${exerciseId}:${exercise.bpm}`;
      if (!flushedBpmKeys.value.has(bpmKey)) {
        flushedBpmKeys.value.add(bpmKey);
        void practicePersistence.recordExerciseBpm(exerciseId, exercise.bpm);
      }
    }
    exercises.value = exercises.value.map((exercise) =>
      exercise.id === exerciseId
        ? {
            ...exercise,
            totalTimeSpentSeconds: exercise.totalTimeSpentSeconds + pending,
          }
        : exercise,
    );
    // Session.total is owned by the global/session timer — we don't touch
    // it here. Exercise time and session time are two independent metrics.
  }

  function exerciseSessionSeconds(exerciseId: string): number {
    return exerciseElapsedSeconds.value[exerciseId] ?? 0;
  }

  function exerciseTotalSeconds(exerciseId: string): number {
    const exercise = exercises.value.find((ex) => ex.id === exerciseId);
    const pending = pendingSeconds.value[exerciseId] ?? 0;
    return (exercise?.totalTimeSpentSeconds ?? 0) + pending;
  }

  function selectPlan(planId: string | null): void {
    selectedPlanId.value = planId;
  }

  // -------------------------------------------------------------------------
  // Session Journal (PR 4.3) — goal / review writes targeted at the active
  // session. The active session is mirrored in `activeSession.value` so the
  // BottomBarTimer click-handlers can dispatch without re-reading from SQLite.
  // -------------------------------------------------------------------------

  async function setSessionGoal(goalText: string): Promise<void> {
    const session = activeSession.value;
    if (!session) return;
    await practicePersistence.updateSessionGoal(session.id, goalText);
    activeSession.value = { ...session, goalText };
    sessions.value = sessions.value.map((entry) =>
      entry.id === session.id ? { ...entry, goalText } : entry,
    );
  }

  async function setSessionReview(input: {
    reviewText?: string | null;
    goalPercent?: number | null;
    goalReached?: boolean | null;
  }): Promise<void> {
    const session = activeSession.value;
    if (!session) return;
    await practicePersistence.updateSessionReview(session.id, input);
    const patched: PracticeSession = {
      ...session,
      reviewText: input.reviewText ?? null,
      goalPercent: input.goalPercent ?? null,
      goalReached: input.goalReached ?? null,
    };
    activeSession.value = patched;
    sessions.value = sessions.value.map((entry) =>
      entry.id === session.id ? patched : entry,
    );
  }

  /**
   * Clear the journal on an arbitrary session id — used by the
   * Stats delete button, which may act on past (non-active)
   * sessions. Mirror the local mirror when the target happens to
   * be the active session so the UI stays consistent without a
   * reload.
   */
  /**
   * Make sure an active session row exists and the store's mirror
   * is up to date. Called from the BottomBarTimer right before the
   * goal-prompt check so a user who clicks play before the store's
   * own `init()` completed still has a session to attach the goal
   * to. Safe to call repeatedly — the backend's
   * `startSessionIfNeeded` reuses an open session for the current
   * day rather than creating a duplicate.
   */
  async function ensureActiveSession(): Promise<PracticeSession> {
    if (activeSession.value) return activeSession.value;
    const session = await practicePersistence.startSessionIfNeeded();
    activeSession.value = session;
    // New mirror → fresh prompt state.
    goalPromptDismissed.value = false;
    lastPromptedSessionId.value = null;
    if (!sessions.value.find((entry) => entry.id === session.id)) {
      sessions.value = [...sessions.value, session];
    }
    return session;
  }

  /**
   * Whether the goal dialog should fire on the next timer-start
   * click. True when:
   * - there is an active session whose goal is unset and the user
   *   hasn't already dismissed the dialog for it, OR
   * - no active session yet — the caller `ensureActiveSession()`
   *   first, then the prompt lands on the freshly-created row.
   *
   * The appStore-side `journalingEnabled` gate lives in the
   * component (so toggling the setting doesn't have to push a
   * reactive dep through this store).
   */
  function shouldPromptGoal(): boolean {
    const session = activeSession.value;
    if (!session) return true;
    if (session.goalText !== null && session.goalText !== undefined) {
      return false;
    }
    if (
      goalPromptDismissed.value &&
      lastPromptedSessionId.value === session.id
    ) {
      return false;
    }
    return true;
  }

  function markGoalPromptDismissed(): void {
    goalPromptDismissed.value = true;
    lastPromptedSessionId.value = activeSession.value?.id ?? null;
  }

  /**
   * Open the goal dialog if every precondition holds: journaling
   * setting on, an active session exists (or we can create one),
   * session has no goal yet, and the user hasn't already
   * dismissed the dialog for this session id. Safe to call from
   * multiple entry points (App.vue on startup-checks complete,
   * BottomBarTimer on play click) — duplicate invocations just
   * re-set an already-true flag.
   */
  async function openGoalDialogIfAppropriate(): Promise<void> {
    const appStore = useAppStore();
    if (!appStore.journalingEnabled) return;
    await ensureActiveSession();
    if (!shouldPromptGoal()) return;
    goalDialogOpen.value = true;
  }

  function setGoalDialogOpen(value: boolean): void {
    goalDialogOpen.value = value;
  }

  async function clearJournal(sessionId: string): Promise<void> {
    await practicePersistence.clearSessionJournal(sessionId);
    if (activeSession.value && activeSession.value.id === sessionId) {
      activeSession.value = {
        ...activeSession.value,
        goalText: null,
        reviewText: null,
        goalPercent: null,
        goalReached: null,
      };
    }
    sessions.value = sessions.value.map((entry) =>
      entry.id === sessionId
        ? {
            ...entry,
            goalText: null,
            reviewText: null,
            goalPercent: null,
            goalReached: null,
          }
        : entry,
    );
  }

  return {
    plans,
    exercises,
    sessions,
    activeSession,
    activeExerciseId,
    selectedPlanId,
    isInitialized,
    activePlan,
    exercisesForSelectedPlan,
    dailyTotalsForSelectedPlan,
    todayTotalSec,
    streak,
    init,
    createPlan,
    updatePlan,
    renamePlan,
    reorderPlans,
    deletePlan,
    createExercise,
    updateExercise,
    deleteExercise,
    reorderExercises,
    intervalsForExercise: intervalOps.intervalsForExercise,
    ensureIntervalsLoaded: intervalOps.ensureIntervalsLoaded,
    createInterval: intervalOps.createInterval,
    updateInterval: intervalOps.updateInterval,
    completeInterval: intervalOps.completeInterval,
    deleteInterval: intervalOps.deleteInterval,
    reorderIntervals: intervalOps.reorderIntervals,
    clearIntervalDoneFlags: intervalOps.clearIntervalDoneFlags,
    linkLibraryItem,
    unlinkLibraryItem,
    startExercise,
    stopExercise,
    exerciseSessionSeconds,
    exerciseTotalSeconds,
    selectPlan,
    setSessionGoal,
    setSessionReview,
    clearJournal,
    shouldPromptGoal,
    markGoalPromptDismissed,
    ensureActiveSession,
    goalDialogOpen,
    openGoalDialogIfAppropriate,
    setGoalDialogOpen,
  };
});
