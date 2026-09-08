/**
 * Guide-runner composable. Wraps driver.js so the rest of the app
 * can start a guide by id without touching the library directly.
 *
 * Completion vs. abort:
 * - Clicking Next on the last step → `finish()` → flag set,
 *   `driver.destroy()` called, `onDestroyed` then marks the guide
 *   completed and fires the "Guide completed ✓" toast.
 * - Anything else that closes the overlay (X button, Esc,
 *   clicking outside) → `onDestroyed` runs with the flag still
 *   false → nothing persists, the user can retake later.
 *
 * Per-step `prepare` hooks:
 * - Some steps (e.g. Practice's Add-Exercise) need state changes
 *   before their anchor is visible (expand the plan, enter edit
 *   mode, …). The runner awaits the target step's `prepare` BEFORE
 *   calling `driver.moveNext()`. driver.js re-queries every step's
 *   CSS selector at advance time, so by the time it looks up the
 *   target element the DOM is in the right shape and the popover
 *   animates cleanly from the previous target to the new one —
 *   no duplicate bubble, no wrong-position flicker.
 *
 * We keep a single driver instance for the app's lifetime — driver
 * tolerates `destroy()` + `drive()` cycles fine.
 */
import { ref } from 'vue';
import { driver, type Config, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/guides.css';
import { router } from '../router';
import { useGuideStore } from '../stores/guides';
import { useToastStore } from '../stores/toast';
import { getGuide } from '../domain/guides/registry';
import type { GuideId, GuideStep } from '../domain/guides/types';

const isActive = ref(false);
const activeGuideId = ref<GuideId | null>(null);
let instance: Driver | null = null;
let finishedByUser = false;
let activeSteps: GuideStep[] = [];

/**
 * Shared driver.js configuration applied to every guide. driver's
 * `setConfig` REPLACES the active config rather than merging it,
 * so we have to re-include these options each time we install the
 * per-run `steps` + `onDestroyed`. Spread this object on every
 * `setConfig` call to keep our chrome (button labels, animation,
 * spotlight stage, smooth scroll, etc.) intact.
 */
const BASE_DRIVER_CONFIG: Config = {
  animate: true,
  allowClose: true,
  overlayOpacity: 0.55,
  stagePadding: 6,
  stageRadius: 10,
  smoothScroll: true,
  showProgress: true,
  progressText: '{{current}} / {{total}}',
  nextBtnText: 'Next',
  prevBtnText: 'Back',
  doneBtnText: 'Done',
  // Clicking the overlay aborts instead of advancing — matches
  // the behaviour the close button would trigger, so the user
  // always has a non-commit way out.
  overlayClickBehavior: 'close',
};

function getDriver(): Driver {
  if (instance) return instance;
  instance = driver(BASE_DRIVER_CONFIG);
  return instance;
}

/** Wait one animation frame so Vue has flushed DOM updates after
 *  a `prepare` callback changed store state. Without this, driver
 *  measures the anchor against stale layout and the popover lands
 *  in the wrong place. */
function waitFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/** Poll for a selector up to `maxFrames` requestAnimationFrame
 *  ticks. Needed for steps whose `prepare` mounts a brand-new
 *  component (e.g. the songmap editor panel) — a single frame of
 *  wait isn't always enough for Vue's mount + initial render to
 *  flush, so we keep checking until the anchor shows up or the
 *  budget runs out. */
async function waitForSelector(
  selector: string,
  maxFrames = 10,
): Promise<Element | null> {
  for (let i = 0; i < maxFrames; i += 1) {
    const el = document.querySelector(selector);
    if (el) return el;
    await waitFrame();
  }
  return document.querySelector(selector);
}

export function useGuideRunner(): {
  isActive: typeof isActive;
  activeGuideId: typeof activeGuideId;
  startGuide: (id: GuideId) => Promise<boolean>;
  abort: () => void;
} {
  const guideStore = useGuideStore();
  const toastStore = useToastStore();

  async function startGuide(id: GuideId): Promise<boolean> {
    const guide = getGuide(id);
    if (guide.steps.length === 0) {
      return false;
    }

    // If the user is on a different page, navigate first. The
    // first step's selector only exists once that page's
    // components mount, so we need the route change to settle
    // before running prepare / highlight.
    if (router.currentRoute.value.path !== guide.route) {
      await router.push(guide.route);
      // Two frames: one for the route commit, one for the
      // newly-mounted page to render its initial DOM.
      await waitFrame();
      await waitFrame();
    }

    // Run step 0's prepare first — some guides can't even show their
    // first step without seeding state (fresh install).
    try {
      await guide.steps[0]!.prepare?.();
    } catch {
      /* non-fatal: prepare is best-effort */
    }
    // Wait for step 0's anchor to actually mount. Prepare may open
    // a modal panel (songmap / beatmap editor) whose child template
    // — including our data-guide anchors — doesn't render until
    // Vue finishes mounting the panel component.
    await waitForSelector(guide.steps[0]!.selector);

    // Build the set of steps to actually run. Three layers:
    //   - `step.requires?.()` is a hard up-front gate. Returning
    //     false drops the step now, before prepare ever runs, so
    //     the partial-run toast below counts skipped steps
    //     correctly. Used by guides whose prepare is conditional
    //     on user state it cannot change (e.g. Practice declines
    //     to seed demo data when real plans exist).
    //   - `step.prepare` is the optimistic case: assume the
    //     prepare will eventually produce the anchor; the
    //     mid-flow `step0ToN` skip-forward handles late misses.
    //   - Otherwise: the anchor must already be in the DOM.
    const candidateSteps = guide.steps.filter((step) => {
      if (step.requires && !step.requires()) return false;
      return (
        step.prepare !== undefined ||
        document.querySelector(step.selector) !== null
      );
    });
    if (candidateSteps.length === 0) {
      toastStore.show(
        'No guide anchors are on screen yet — set up the page first, then retake.',
        { variant: 'info' },
      );
      return false;
    }

    const skipped = guide.steps.length - candidateSteps.length;
    if (skipped > 0) {
      toastStore.show(
        `Showing ${candidateSteps.length} of ${guide.steps.length} steps — the rest appear once you create the needed state.`,
        { variant: 'info', durationMs: 4000 },
      );
    }

    activeSteps = candidateSteps;
    finishedByUser = false;
    activeGuideId.value = id;
    const driverInstance = getDriver();
    driverInstance.setConfig({
      ...BASE_DRIVER_CONFIG,
      steps: buildDriveSteps(candidateSteps, driverInstance),
      onDestroyed: () => {
        const endedId = activeGuideId.value;
        isActive.value = false;
        activeGuideId.value = null;
        activeSteps = [];
        if (finishedByUser && endedId) {
          guideStore.markCompleted(endedId);
          toastStore.show('Guide completed ✓');
        }
        finishedByUser = false;
        // Fire cleanup last so it sees the final completion state
        // and can't accidentally block the user from starting
        // another guide if it throws — best-effort fire-and-forget.
        if (guide.onCleanup) {
          try {
            const result = guide.onCleanup();
            if (result instanceof Promise) {
              result.catch(() => {
                /* swallow — cleanup is best-effort */
              });
            }
          } catch {
            /* swallow — cleanup is best-effort */
          }
        }
      },
    });
    isActive.value = true;
    driverInstance.drive();
    return true;
  }

  function buildDriveSteps(
    steps: GuideStep[],
    driverInstance: Driver,
  ): DriveStep[] {
    return steps.map((step, index, all) => ({
      element: step.selector,
      popover: {
        title: step.title,
        description: step.body,
        side: 'bottom',
        align: 'start',
        onNextClick: (): void => {
          if (index === all.length - 1) {
            finishedByUser = true;
            driverInstance.destroy();
            return;
          }
          void step0ToN(index + 1, 1);
        },
        onPrevClick: (): void => {
          if (index === 0) return;
          void step0ToN(index - 1, -1);
        },
      },
    }));
  }

  /**
   * Prepare the target step and then jump driver's internal pointer
   * directly to it via `moveTo(targetIndex)`. Skipping `setSteps` is
   * deliberate — replacing the step list at runtime caused driver to
   * re-render the current popover before the transition started,
   * briefly showing both bubbles at once. Since selectors are
   * re-resolved per step (they are strings, not cached Element refs),
   * preparing state + jumping driver to the index is sufficient;
   * driver finds the freshly-visible anchor and animates straight
   * to it.
   *
   * Using `moveTo` rather than `moveNext` / `movePrevious` matters
   * when this function recurses on a skipped step: the runner's
   * `targetIndex` advances by 2+, but `moveNext`/`movePrevious` only
   * shift driver's internal pointer by 1, so driver would render the
   * popover for the missing step (no anchor → top-left of the
   * viewport). `moveTo` keeps the runner's pointer and driver's
   * pointer in lockstep regardless of how many steps were skipped.
   *
   * If the target's anchor still can't resolve after prepare, we
   * skip forward (or back, depending on `direction`) and try the
   * next step instead of leaving the user staring at nothing.
   */
  async function step0ToN(
    targetIndex: number,
    direction: 1 | -1,
  ): Promise<void> {
    const driverInstance = getDriver();
    const target = activeSteps[targetIndex];
    if (!target) {
      driverInstance.destroy();
      return;
    }
    try {
      await target.prepare?.();
    } catch {
      /* non-fatal: prepare is best-effort */
    }
    // Poll for the anchor — prepare may have mounted a new panel
    // whose DOM takes more than a frame to materialise.
    const resolved = await waitForSelector(target.selector);
    if (resolved === null) {
      const next = targetIndex + direction;
      if (next >= 0 && next < activeSteps.length) {
        void step0ToN(next, direction);
      } else {
        driverInstance.destroy();
      }
      return;
    }
    driverInstance.moveTo(targetIndex);
  }

  function abort(): void {
    if (instance && instance.isActive()) {
      instance.destroy();
    }
  }

  return { isActive, activeGuideId, startGuide, abort };
}
