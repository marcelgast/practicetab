import { usePracticeStore } from '../../stores/practice';
import { usePracticeUiStore } from '../../stores/practiceUi';
import type { Guide } from './types';

/**
 * Practice-page guide — plans, exercises, intervals, and linking a
 * tab or audio to an exercise.
 *
 * Steps 2–5 anchor on controls that only mount once the user has
 * an expanded plan in edit mode with an expanded exercise. The
 * `prepare` callbacks programmatically seed the needed state (via
 * the practice store and practice-UI store) before each step
 * shows, so the whole five-step walkthrough runs even on a
 * freshly-installed DB.
 *
 * Seeding is **only** performed when the user has zero plans.
 * If real plans exist — even one matching our demo title — we
 * never seed and never touch them; the prepared steps are
 * filtered out at startGuide (via `requires`) so the runner's
 * partial-run logic shows the "Showing 1 of 5 steps" toast and
 * the user sees only the always-anchorable "Add a plan" step.
 *
 * On guide end (finish OR abort) `onCleanup` deletes the demo
 * plan we created in THIS session, identified by the in-memory
 * id we captured at create time — never by title alone. A user
 * who happens to have a real plan named `Guide demo` is safe.
 * Pristine check still applies: same title (defence-in-depth)
 * and at most the one exercise we seeded. If the user adopted
 * the demo (renamed, added stuff) the cleanup leaves it alone.
 *
 * The connect-tab step carries the required warning: PracticeTab
 * is designed for short, focused exercises; users should split
 * full-song tab files into practice-sized sections before linking.
 */

const DEMO_PLAN_TITLE = 'Guide demo';
const DEMO_EXERCISE_TITLE = 'Demo exercise';

/**
 * Module-level tracking of what THIS run of the guide created.
 * Reset by `cleanupPracticeDemo` at guide end and by
 * `ensurePlan` when it adopts an orphan from a previous run.
 */
let demoPlanId: string | null = null;
let demoExerciseId: string | null = null;

/**
 * Resolve the plan we should drive the guide against.
 *
 * Decision tree (deliberately conservative — we only ever own
 * plans we created in the current session, identified by id):
 *   1. We seeded one earlier in this session and it's still
 *      around → reuse (handles step-to-step continuity).
 *   2. The user has zero plans → seed a fresh `Guide demo`.
 *   3. Anything else (real plans exist, even one named
 *      `Guide demo`) → return `null`. Title-based adoption is
 *      not safe because we cannot distinguish a previous-run
 *      orphan from real user data with the same title.
 *
 * Orphan plans from app crashes before we shipped cleanup are a
 * one-time concern; they show up as a regular plan and the user
 * can delete them by hand.
 */
async function ensurePlan(): Promise<string | null> {
  const practiceStore = usePracticeStore();

  // Case 1: we already seeded this session.
  if (demoPlanId) {
    const stillExists = practiceStore.plans.some((p) => p.id === demoPlanId);
    if (stillExists) return demoPlanId;
    // The plan got deleted out from under us; fall through to
    // re-seed if it makes sense.
    demoPlanId = null;
    demoExerciseId = null;
  }

  // Case 2: empty install — seed.
  if (practiceStore.plans.length === 0) {
    await practiceStore.createPlan(DEMO_PLAN_TITLE, false);
    demoPlanId = practiceStore.plans[0]?.id ?? null;
    return demoPlanId;
  }

  // Case 3: real user data (or unrecognised orphan) — leave alone.
  return null;
}

/**
 * True iff seeding can produce a valid demo plan id without
 * touching real user data. Used as the `requires` predicate on
 * every prepare-needing step so the runner can filter them out
 * up front when the user has real plans, surface the
 * partial-run toast, and avoid a silent walk through dead
 * anchors.
 */
function canSeedPracticeDemo(): boolean {
  const practiceStore = usePracticeStore();
  // Already-seeded session: as long as the demo plan still
  // exists, prepare can reuse it.
  if (demoPlanId && practiceStore.plans.some((p) => p.id === demoPlanId)) {
    return true;
  }
  // First-time-this-session: only safe when the user has zero
  // plans.
  return practiceStore.plans.length === 0;
}

/**
 * Make sure the demo plan has its demo exercise. Only ever
 * called with a planId that came back from `ensurePlan` — i.e.
 * a plan we created in this session. We never adopt a stray
 * exercise that happens to live on the demo plan; if our
 * tracked id is gone we re-create.
 */
async function ensureExerciseInPlan(planId: string): Promise<string | null> {
  const practiceStore = usePracticeStore();

  if (demoExerciseId) {
    const stillExists = practiceStore.exercises.some(
      (e) => e.id === demoExerciseId,
    );
    if (stillExists) return demoExerciseId;
    demoExerciseId = null;
  }

  await practiceStore.createExercise(planId, DEMO_EXERCISE_TITLE, null);
  const created = practiceStore.exercises.find(
    (e) => e.planId === planId && e.title === DEMO_EXERCISE_TITLE,
  );
  demoExerciseId = created?.id ?? null;
  return demoExerciseId;
}

/** Expand the demo plan and turn edit mode on. No-op when we
 *  bailed (real user plans). */
async function prepareFirstPlanInEditMode(): Promise<void> {
  const planId = await ensurePlan();
  if (!planId) return;
  const uiStore = usePracticeUiStore();
  uiStore.expandedPlanId = planId;
  uiStore.setEditMode(planId, true);
}

/** Full prep for steps that anchor on per-exercise controls:
 *  demo plan + expanded + edit mode + demo exercise + expanded
 *  exercise. No-op when we bailed (real user plans). */
async function prepareExpandedExercise(): Promise<void> {
  const planId = await ensurePlan();
  if (!planId) return;
  const exerciseId = await ensureExerciseInPlan(planId);
  if (!exerciseId) return;
  const uiStore = usePracticeUiStore();
  uiStore.expandedPlanId = planId;
  uiStore.setEditMode(planId, true);
  uiStore.expandedItemByPlan = {
    ...uiStore.expandedItemByPlan,
    [planId]: exerciseId,
  };
}

/**
 * Cleanup hook fired by the runner when the guide ends, however
 * it ended (Done / Esc / X / overlay click).
 *
 * Pristine check: only delete if the plan still has our title and
 * at most one exercise (our seeded one). If the user renamed,
 * added something, or otherwise made it their own, leave it
 * alone — the demo just becomes part of their library.
 */
async function cleanupPracticeDemo(): Promise<void> {
  if (!demoPlanId) return;
  const practiceStore = usePracticeStore();
  const plan = practiceStore.plans.find((p) => p.id === demoPlanId);
  if (!plan) {
    demoPlanId = null;
    demoExerciseId = null;
    return;
  }
  const childExercises = practiceStore.exercises.filter(
    (e) => e.planId === plan.id,
  );
  const isPristine =
    plan.title === DEMO_PLAN_TITLE &&
    childExercises.length <= 1 &&
    (childExercises.length === 0 || childExercises[0]!.id === demoExerciseId);
  if (isPristine) {
    // deletePlan cascades to exercises.
    await practiceStore.deletePlan(plan.id);
  }
  demoPlanId = null;
  demoExerciseId = null;
}

export const practiceGuide: Guide = {
  id: 'practice',
  title: 'Practice page',
  description:
    'Plans, exercises, intervals, and linking tabs/audio — the full Practice workflow in five steps.',
  route: '/practice',
  onCleanup: cleanupPracticeDemo,
  steps: [
    {
      selector: '[data-guide="practice.add-plan"]',
      title: 'Create a plan',
      body: 'Plans are your top-level folders. Type a title in the input to the left, then click + to create one.',
    },
    {
      selector: '[data-guide="practice.add-exercise"]',
      title: 'Add an exercise',
      body: 'The guide expanded the first plan and turned on edit mode so this button is visible. Click + to add an exercise — this is what you practice against the timer.',
      prepare: prepareFirstPlanInEditMode,
      requires: canSeedPracticeDemo,
    },
    {
      selector: '[data-guide="practice.add-interval"]',
      title: 'Add an interval',
      body: 'Intervals chain BPM steps inside one exercise — e.g. 80 → 90 → 100 bpm over set durations. Optional; only use when you want interval-mode practice.',
      prepare: prepareExpandedExercise,
      requires: canSeedPracticeDemo,
    },
    {
      selector: '[data-guide="practice.connect-tab"]',
      title: 'Connect a tab',
      body: 'Link a Library tab to this exercise. PracticeTab is designed for focused exercises — not large full-song tab files. Split long pieces into short sections for the best performance.',
      prepare: prepareExpandedExercise,
      requires: canSeedPracticeDemo,
    },
    {
      selector: '[data-guide="practice.connect-audio"]',
      title: 'Connect audio',
      body: 'Connect an audio track alongside or instead of a tab — handy for backing tracks and reference recordings. You can combine tab + audio on the same exercise.',
      prepare: prepareExpandedExercise,
      requires: canSeedPracticeDemo,
    },
  ],
};

/**
 * Test-only escape hatch: reset the module-level seed tracking so
 * unit tests can simulate fresh / orphan / real-data scenarios in
 * isolation. Production code paths never call this.
 */
export function __resetPracticeGuideStateForTests(): void {
  demoPlanId = null;
  demoExerciseId = null;
}
