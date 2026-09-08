// @vitest-environment happy-dom
/**
 * Domain test for the Practice guide's prepare + cleanup hooks.
 *
 * Three scenarios matter:
 * 1. Empty install — guide seeds a `Guide demo` plan + exercise,
 *    cleanup deletes them.
 * 2. Orphan demo from a previous run — guide adopts it (no
 *    second seed), cleanup still owns it.
 * 3. Real user data — guide does NOT touch it (no expand, no
 *    edit-mode, no demo exercise injected), cleanup is a no-op.
 *
 * The test goes through the actual practiceGuide step `prepare`
 * functions and the exported `onCleanup` so we exercise the
 * real wiring, not mirror logic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  practiceGuide,
  __resetPracticeGuideStateForTests,
} from '../domain/guides/practice';
import { usePracticeStore } from '../stores/practice';
import { usePracticeUiStore } from '../stores/practiceUi';

// Stub the persistence layer the practice store talks to. The
// store itself maintains the in-memory `plans` / `exercises`
// refs after the persistence call returns, so the mocks just
// need to return the right shape — we don't have to push state
// manually in tests.
const persistenceMocks = vi.hoisted(() => ({
  createPracticePlan: vi.fn(),
  createExercise: vi.fn(),
  deletePracticePlan: vi.fn(),
  listPracticePlans: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    listPracticePlans: persistenceMocks.listPracticePlans,
    createPracticePlan: persistenceMocks.createPracticePlan,
    createExercise: persistenceMocks.createExercise,
    deletePracticePlan: persistenceMocks.deletePracticePlan,
    updatePracticePlan: vi.fn(),
    renamePracticePlan: vi.fn(),
    reorderPracticePlans: vi.fn(),
    deleteExercise: vi.fn(),
    reorderExercises: vi.fn(),
    linkExerciseToAudio: vi.fn(),
    linkExerciseToLibraryItem: vi.fn(),
    unlinkExerciseFromLibraryItem: vi.fn(),
    listExerciseIntervals: vi.fn(() => Promise.resolve([])),
    clearIntervalDoneFlags: vi.fn(),
    addExerciseTime: vi.fn(),
    recordExerciseBpm: vi.fn(),
    setSessionGoal: vi.fn(),
    setSessionReview: vi.fn(),
    listSessions: vi.fn(() => Promise.resolve([])),
    startSessionIfNeeded: vi.fn(),
    endActiveSession: vi.fn(),
    clearSessionJournal: vi.fn(),
    listSessionsWithJournal: vi.fn(() => Promise.resolve([])),
  },
}));

function makePlan(
  id: string,
  title: string,
): {
  id: string;
  title: string;
  timed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id,
    title,
    timed: false,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function findStep(selector: string) {
  const step = practiceGuide.steps.find((s) => s.selector === selector);
  if (!step) throw new Error(`step not found: ${selector}`);
  return step;
}

describe('practiceGuide — prepare + cleanup', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    __resetPracticeGuideStateForTests();
    persistenceMocks.createPracticePlan.mockReset();
    persistenceMocks.createExercise.mockReset();
    persistenceMocks.deletePracticePlan.mockReset();
  });

  afterEach(() => {
    __resetPracticeGuideStateForTests();
  });

  describe('empty install', () => {
    it('seeds a demo plan + exercise on prepare and deletes both on cleanup', async () => {
      const practiceStore = usePracticeStore();
      // Persistence returns the new plan; the store appends it to
      // its own `plans` ref. Same shape for createExercise. We
      // don't need to update store refs by hand.
      persistenceMocks.createPracticePlan.mockImplementation(
        async (title: string) => makePlan('plan-demo', title),
      );
      persistenceMocks.createExercise.mockImplementation(
        async (planId: string, input: { title: string }) => ({
          id: 'ex-demo',
          planId,
          title: input.title,
          timePlannedMinutes: null,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      persistenceMocks.deletePracticePlan.mockResolvedValue(undefined);

      // Step 2's prepare seeds the plan.
      await findStep('[data-guide="practice.add-exercise"]').prepare?.();
      expect(persistenceMocks.createPracticePlan).toHaveBeenCalledWith(
        'Guide demo',
        false,
      );
      expect(practiceStore.plans).toHaveLength(1);

      // Step 3's prepare seeds the exercise too.
      await findStep('[data-guide="practice.add-interval"]').prepare?.();
      expect(persistenceMocks.createExercise).toHaveBeenCalledTimes(1);
      expect(practiceStore.exercises).toHaveLength(1);

      // Cleanup deletes the pristine demo plan (the store itself
      // cascades to exercises in deletePlan).
      await practiceGuide.onCleanup?.();
      expect(persistenceMocks.deletePracticePlan).toHaveBeenCalledWith(
        'plan-demo',
      );
      expect(practiceStore.plans).toHaveLength(0);
    });
  });

  describe('user has real plans', () => {
    it('does NOT seed, does NOT expand, and cleanup is a no-op', async () => {
      const practiceStore = usePracticeStore();
      const uiStore = usePracticeUiStore();
      const realPlan = makePlan('real-plan-1', 'My real plan');
      practiceStore.plans = [realPlan];

      await findStep('[data-guide="practice.add-exercise"]').prepare?.();

      // No createPracticePlan call (key bug fix).
      expect(persistenceMocks.createPracticePlan).not.toHaveBeenCalled();
      // No createExercise call — we never seeded anything to add to.
      expect(persistenceMocks.createExercise).not.toHaveBeenCalled();
      // The real plan stayed collapsed and out of edit mode.
      expect(uiStore.expandedPlanId).toBeNull();
      expect(uiStore.editModeByPlan[realPlan.id]).toBeFalsy();

      // Cleanup is a no-op — we never tracked a demo plan.
      await practiceGuide.onCleanup?.();
      expect(persistenceMocks.deletePracticePlan).not.toHaveBeenCalled();
      expect(practiceStore.plans).toEqual([realPlan]);
    });
  });

  describe('plan named "Guide demo" already exists', () => {
    it('treats it as real user data — no seed, no delete (the safe choice)', async () => {
      // We deliberately do NOT adopt by title. A user could
      // legitimately have a plan called "Guide demo" with their
      // own data on it; auto-deleting it on cleanup would be
      // catastrophic. Orphans from older builds become regular
      // plans the user can remove by hand.
      const practiceStore = usePracticeStore();
      const namedPlan = makePlan('look-alike', 'Guide demo');
      const namedExercise = {
        id: 'look-alike-ex',
        planId: namedPlan.id,
        title: 'Demo exercise',
        timePlannedMinutes: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      practiceStore.plans = [namedPlan];
      practiceStore.exercises = [namedExercise];

      // Practice steps that would seed have requires() === false
      // so their prepare doesn't run. Even if we call it
      // directly, ensurePlan should bail.
      await findStep('[data-guide="practice.add-interval"]').prepare?.();

      expect(persistenceMocks.createPracticePlan).not.toHaveBeenCalled();
      expect(persistenceMocks.createExercise).not.toHaveBeenCalled();

      await practiceGuide.onCleanup?.();
      expect(persistenceMocks.deletePracticePlan).not.toHaveBeenCalled();
      expect(practiceStore.plans).toEqual([namedPlan]);
    });

    it('canSeedPracticeDemo (via requires) returns false in this state', () => {
      const practiceStore = usePracticeStore();
      practiceStore.plans = [makePlan('look-alike', 'Guide demo')];
      const step = findStep('[data-guide="practice.add-exercise"]');
      expect(step.requires).toBeDefined();
      expect(step.requires!()).toBe(false);
    });
  });

  describe('requires gate', () => {
    it('returns true on an empty install (steps will run)', () => {
      const step = findStep('[data-guide="practice.add-exercise"]');
      expect(step.requires!()).toBe(true);
    });

    it('returns false when the user has any real plan', () => {
      const practiceStore = usePracticeStore();
      practiceStore.plans = [makePlan('real', 'My real plan')];
      const step = findStep('[data-guide="practice.add-exercise"]');
      expect(step.requires!()).toBe(false);
    });
  });

  describe('user adopted the demo mid-flow', () => {
    it('leaves the plan alone if its title was changed', async () => {
      const practiceStore = usePracticeStore();
      persistenceMocks.createPracticePlan.mockImplementation(
        async (title: string) => makePlan('plan-adopted', title),
      );

      await findStep('[data-guide="practice.add-exercise"]').prepare?.();
      // User renames the demo to make it their own.
      practiceStore.plans = practiceStore.plans.map((p) =>
        p.id === 'plan-adopted' ? { ...p, title: 'My new plan' } : p,
      );

      await practiceGuide.onCleanup?.();
      expect(persistenceMocks.deletePracticePlan).not.toHaveBeenCalled();
      expect(practiceStore.plans).toHaveLength(1);
      expect(practiceStore.plans[0]!.title).toBe('My new plan');
    });

    it('leaves the plan alone if a second exercise was added', async () => {
      const practiceStore = usePracticeStore();
      persistenceMocks.createPracticePlan.mockImplementation(
        async (title: string) => makePlan('plan-adopted-2', title),
      );
      persistenceMocks.createExercise.mockImplementation(
        async (planId: string, input: { title: string }) => ({
          id: 'ex-demo-2',
          planId,
          title: input.title,
          timePlannedMinutes: null,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );

      await findStep('[data-guide="practice.add-interval"]').prepare?.();
      // User adds a second exercise themselves.
      practiceStore.exercises = [
        ...practiceStore.exercises,
        {
          id: 'ex-user',
          planId: 'plan-adopted-2',
          title: 'Real exercise',
          timePlannedMinutes: null,
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      await practiceGuide.onCleanup?.();
      expect(persistenceMocks.deletePracticePlan).not.toHaveBeenCalled();
    });
  });
});
