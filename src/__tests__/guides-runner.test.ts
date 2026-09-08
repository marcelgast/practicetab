// @vitest-environment happy-dom
/**
 * useGuideRunner wiring — verifies completion vs abort branching
 * without driving a real driver.js instance. The driver is mocked
 * to expose the hooks the runner configures; the test then invokes
 * those hooks directly to simulate Next / Close / Esc.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Mock must come BEFORE the runner import — driver() is called
// lazily inside startGuide so we only need the module stubbed at
// import time.
const mocks = vi.hoisted(() => {
  const driveStepHandlers: Array<{ onNextClick?: () => void }> = [];
  let capturedConfig: { onDestroyed?: () => void } | null = null;
  // Driver is a module-level singleton in the runner — keep a
  // separate handle to the latest-created instance so tests can
  // assert against its method-level vi.fns regardless of how many
  // times `mocks.driverFn.mockClear()` has run between tests.
  let latestDriver: {
    drive: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    moveNext: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    setSteps: ReturnType<typeof vi.fn>;
    isActive: ReturnType<typeof vi.fn>;
    setConfig: ReturnType<typeof vi.fn>;
  } | null = null;

  const captureSteps = (
    steps: Array<{ popover?: { onNextClick?: () => void } }> | undefined,
  ): void => {
    driveStepHandlers.length = 0;
    steps?.forEach((step) => {
      driveStepHandlers.push({
        onNextClick: step.popover?.onNextClick,
      });
    });
  };

  const driverFn = vi.fn(() => {
    const created = {
      drive: vi.fn(),
      destroy: vi.fn(() => {
        capturedConfig?.onDestroyed?.();
      }),
      moveNext: vi.fn(),
      moveTo: vi.fn(),
      setSteps: vi.fn(captureSteps),
      isActive: vi.fn(() => false),
      setConfig: vi.fn(
        (config: {
          steps?: Array<{ popover?: { onNextClick?: () => void } }>;
          onDestroyed?: () => void;
        }) => {
          capturedConfig = { onDestroyed: config.onDestroyed };
          captureSteps(config.steps);
        },
      ),
    };
    latestDriver = created;
    return created;
  });

  return {
    driverFn,
    driveStepHandlers,
    capturedConfigRef: () => capturedConfig,
    latestDriverRef: () => latestDriver,
  };
});

vi.mock('driver.js', () => ({
  driver: mocks.driverFn,
}));
vi.mock('driver.js/dist/driver.css', () => ({}));
vi.mock('../styles/guides.css', () => ({}));

// Stub the router — tests pre-set currentRoute to `/practice` so
// `startGuide('practice')` doesn't actually navigate. The push
// spy lets us assert navigation happens when the routes differ.
// vi.mock is hoisted, so the mock state goes through vi.hoisted()
// to stay valid when the module is evaluated.
const routerMocks = vi.hoisted(() => {
  const currentRoute = { value: { path: '/practice' } };
  const push = vi.fn().mockResolvedValue(undefined);
  return { currentRoute, push };
});
vi.mock('../router', () => ({
  router: {
    currentRoute: routerMocks.currentRoute,
    push: routerMocks.push,
  },
}));

// Override the registry for this test so we aren't tied to the
// real (and still-being-filled-in) guide step arrays. Tests can
// stuff an `onCleanup` (or any other guide-level field) into
// `registryMocks.guideOverrides` before calling startGuide.
const registryMocks = vi.hoisted(() => ({
  guideOverrides: {} as Record<string, unknown>,
}));
vi.mock('../domain/guides/registry', async () => {
  const actual = await vi.importActual<
    typeof import('../domain/guides/registry')
  >('../domain/guides/registry');
  return {
    ...actual,
    getGuide: (id: string) => ({
      id,
      title: 'Test',
      description: 'Test',
      route: '/practice',
      steps: [
        { selector: '[data-guide="practice.step-a"]', title: 'A', body: 'aaa' },
        { selector: '[data-guide="practice.step-b"]', title: 'B', body: 'bbb' },
      ],
      ...registryMocks.guideOverrides,
    }),
  };
});

import { useGuideRunner } from '../composables/useGuideRunner';
import { useGuideStore } from '../stores/guides';
import { useToastStore } from '../stores/toast';

function mountTargets(): void {
  document.body.innerHTML = `
    <button data-guide="practice.step-a">A</button>
    <button data-guide="practice.step-b">B</button>
  `;
}

describe('useGuideRunner', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mocks.driverFn.mockClear();
    routerMocks.push.mockClear();
    // Default: pretend user is already on the guide's target
    // route. Tests that care about cross-page start explicitly
    // mutate this before calling startGuide.
    routerMocks.currentRoute.value.path = '/practice';
    // Reset registry overrides between tests so an onCleanup hook
    // installed by one case doesn't leak into another.
    Object.keys(registryMocks.guideOverrides).forEach((key) => {
      delete registryMocks.guideOverrides[key];
    });
    document.body.innerHTML = '';
  });

  it('refuses to start only when NO step selector resolves in the DOM', async () => {
    const toastStore = useToastStore();
    const spy = vi.spyOn(toastStore, 'show');
    // No targets mounted → both selectors miss → bail.
    const runner = useGuideRunner();
    const ok = await runner.startGuide('practice');
    expect(ok).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('No guide anchors are on screen'),
      expect.objectContaining({ variant: 'info' }),
    );
  });

  it('runs with a subset when some selectors miss + warns how many were skipped', async () => {
    // Mount only step-a; step-b will be absent.
    document.body.innerHTML = '<button data-guide="practice.step-a">A</button>';
    const toastStore = useToastStore();
    const spy = vi.spyOn(toastStore, 'show');
    const runner = useGuideRunner();
    const ok = await runner.startGuide('practice');
    expect(ok).toBe(true);
    expect(mocks.driveStepHandlers.length).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Showing 1 of 2 steps'),
      expect.objectContaining({ variant: 'info' }),
    );
  });

  it('filters out steps whose requires() returns false up front', async () => {
    document.body.innerHTML = `
      <button data-guide="practice.step-a">A</button>
      <button data-guide="practice.step-b">B</button>
    `;
    // Override the mocked guide with a step-b that explicitly
    // declines to run (e.g. real-plan path on Practice).
    registryMocks.guideOverrides.steps = [
      { selector: '[data-guide="practice.step-a"]', title: 'A', body: 'aaa' },
      {
        selector: '[data-guide="practice.step-b"]',
        title: 'B',
        body: 'bbb',
        prepare: vi.fn(),
        requires: () => false,
      },
    ];
    const toastStore = useToastStore();
    const spy = vi.spyOn(toastStore, 'show');
    const runner = useGuideRunner();
    const ok = await runner.startGuide('practice');
    expect(ok).toBe(true);
    // Only step-a survives the filter.
    expect(mocks.driveStepHandlers.length).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Showing 1 of 2 steps'),
      expect.objectContaining({ variant: 'info' }),
    );
  });

  it('marks the guide completed + shows a toast only when the last step is Next-clicked', async () => {
    mountTargets();
    const guideStore = useGuideStore();
    const toastStore = useToastStore();
    const toastSpy = vi.spyOn(toastStore, 'show');

    const runner = useGuideRunner();
    const ok = await runner.startGuide('practice');
    expect(ok).toBe(true);
    expect(runner.isActive.value).toBe(true);
    expect(guideStore.isCompleted('practice')).toBe(false);

    const lastStep = mocks.driveStepHandlers[1]!;
    lastStep.onNextClick?.();

    expect(guideStore.isCompleted('practice')).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith('Guide completed ✓');
    expect(runner.isActive.value).toBe(false);
  });

  it('navigates to the guide route first when the user is elsewhere', async () => {
    routerMocks.currentRoute.value.path = '/metronome';
    mountTargets();
    const runner = useGuideRunner();
    await runner.startGuide('practice');
    expect(routerMocks.push).toHaveBeenCalledWith('/practice');
  });

  it('skips navigation when already on the guide route', async () => {
    routerMocks.currentRoute.value.path = '/practice';
    mountTargets();
    const runner = useGuideRunner();
    await runner.startGuide('practice');
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it('runs guide.onCleanup once on finish', async () => {
    mountTargets();
    const cleanup = vi.fn();
    registryMocks.guideOverrides.onCleanup = cleanup;

    const runner = useGuideRunner();
    await runner.startGuide('practice');
    // Fire Next on the last step (finish path).
    mocks.driveStepHandlers[1]!.onNextClick?.();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('runs guide.onCleanup once on abort too', async () => {
    mountTargets();
    const cleanup = vi.fn();
    registryMocks.guideOverrides.onCleanup = cleanup;

    const runner = useGuideRunner();
    await runner.startGuide('practice');
    // Esc / X / overlay-click → onDestroyed without finish.
    mocks.capturedConfigRef()?.onDestroyed?.();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('swallows errors thrown by onCleanup so a flaky cleanup never blocks the runner', async () => {
    mountTargets();
    registryMocks.guideOverrides.onCleanup = (): never => {
      throw new Error('cleanup-boom');
    };
    const runner = useGuideRunner();
    await runner.startGuide('practice');
    // Should not throw.
    expect(() => mocks.capturedConfigRef()?.onDestroyed?.()).not.toThrow();
    // Runner state still reset cleanly.
    expect(runner.isActive.value).toBe(false);
  });

  it('handles a rejected onCleanup promise without surfacing it', async () => {
    mountTargets();
    registryMocks.guideOverrides.onCleanup = async (): Promise<void> => {
      throw new Error('async-cleanup-boom');
    };
    const runner = useGuideRunner();
    await runner.startGuide('practice');
    expect(() => mocks.capturedConfigRef()?.onDestroyed?.()).not.toThrow();
    // Wait a microtask for the unhandled-rejection path; it must
    // be caught before bubbling up.
    await Promise.resolve();
    expect(runner.isActive.value).toBe(false);
  });

  it('uses driver.moveTo(index) for Next so the pointer stays in sync after skipped steps', async () => {
    // Regression for review finding #10. The previous implementation
    // used moveNext()/movePrevious(), which advances driver's
    // internal pointer by exactly 1. When the runner skipped a
    // missing-anchor step, its `targetIndex` advanced by 2+ but
    // driver's pointer only moved 1 — so driver rendered the
    // popover for the missing step (no anchor → top-left of the
    // viewport). Switching to moveTo(targetIndex) keeps the runner
    // and driver in lockstep regardless of how many steps were
    // skipped.
    //
    // The driver instance is a module-level singleton, so we grab
    // whichever result driverFn produced (in this test or a prior
    // one). All tests share the same instance, and per-test
    // beforeEach clears the method-level call history when needed
    // — but here we explicitly clear the moveTo / moveNext mocks
    // immediately before triggering Next so the assertion only
    // sees this test's calls.
    mountTargets();
    const runner = useGuideRunner();
    await runner.startGuide('practice');

    const created = mocks.latestDriverRef();
    expect(created).not.toBeNull();
    created!.moveTo.mockClear();
    created!.moveNext.mockClear();

    // Fire Next on the first step (advance from 0 → 1).
    const firstStep = mocks.driveStepHandlers[0]!;
    firstStep.onNextClick?.();
    // Allow microtasks for the async step0ToN to run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(created!.moveTo).toHaveBeenCalledWith(1);
    expect(created!.moveNext).not.toHaveBeenCalled();
  });

  it('abort via onDestroyed without a finish does NOT mark completed or toast', async () => {
    mountTargets();
    const guideStore = useGuideStore();
    const toastStore = useToastStore();
    const toastSpy = vi.spyOn(toastStore, 'show');

    const runner = useGuideRunner();
    await runner.startGuide('practice');

    const cfg = mocks.capturedConfigRef();
    cfg?.onDestroyed?.();

    expect(guideStore.isCompleted('practice')).toBe(false);
    expect(toastSpy).not.toHaveBeenCalledWith('Guide completed ✓');
    expect(runner.isActive.value).toBe(false);
  });
});
