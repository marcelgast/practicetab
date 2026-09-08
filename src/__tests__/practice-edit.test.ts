// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import PracticePage from '../pages/Practice.vue';
import { usePracticeStore } from '../stores/practice';
import { useLibraryStore } from '../stores/library';
import { useMetronomeStore } from '../stores/metronome';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { useAppStore } from '../stores/app';
import { metronomeBeep, metronomeStop } from '../services/metronomeCommands';
import * as intervalRunner from '../services/intervalRunner';
import type { PracticeExercise } from '../domain/practice';

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    listPracticePlans: vi.fn(),
    createPracticePlan: vi.fn(),
    updatePracticePlan: vi.fn(),
    renamePracticePlan: vi.fn(),
    reorderPracticePlans: vi.fn(),
    deletePracticePlan: vi.fn(),
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
    deleteExercise: vi.fn(),
    reorderExercises: vi.fn(),
    linkExerciseToLibraryItem: vi.fn(),
    linkExerciseToAudio: vi.fn(),
    unlinkExerciseFromLibraryItem: vi.fn(),
    listIntervals: vi.fn(),
    createInterval: vi.fn(),
    updateInterval: vi.fn(),
    deleteInterval: vi.fn(),
    reorderIntervals: vi.fn(),
    clearIntervalDoneFlags: vi.fn(),
    startSessionIfNeeded: vi.fn(),
    endActiveSession: vi.fn(),
    addExerciseTime: vi.fn(),
    addSessionTime: vi.fn(),
    addPlaybackTime: vi.fn(),
    confirmClose: vi.fn(),
    getActiveSession: vi.fn(),
    listSessions: vi.fn(),
    getSessionDetail: vi.fn(),
    getIntervalsCompletedTotal: vi.fn(),
    incrementIntervalsCompletedTotal: vi.fn(),
    recordExerciseBpm: vi.fn().mockResolvedValue({
      id: 'bpm-1',
      exerciseId: '',
      sessionDate: '',
      bpm: 0,
      recordedAt: '',
    }),
    listExerciseBpmHistory: vi.fn().mockResolvedValue([]),
    recordLibraryItemTime: vi.fn(),
    incrementLibraryItemPlayCount: vi.fn(),
    incrementLibraryItemLoopCount: vi.fn(),
    listLibraryItemStats: vi.fn().mockResolvedValue([]),
    resetPracticeDb: vi.fn(),
  },
}));

vi.mock('../components/ui/AppTooltip.vue', () => ({
  default: defineComponent({
    name: 'AppTooltip',
    inheritAttrs: false,
    props: {
      text: { type: String, default: '' },
      side: { type: String, default: 'bottom' },
      align: { type: String, default: 'center' },
      open: { type: Boolean, default: undefined },
    },
    setup(_, { slots }) {
      return () => slots.default?.();
    },
  }),
}));

vi.mock('../services/metronomeCommands', () => ({
  metronomeStart: vi.fn().mockResolvedValue(undefined),
  metronomeStop: vi.fn().mockResolvedValue(undefined),
  metronomeSetConfig: vi.fn().mockResolvedValue(undefined),
  metronomeBeep: vi.fn().mockResolvedValue(undefined),
  metronomeTickFromAlphaTab: vi.fn().mockResolvedValue(undefined),
  metronomeCancelScheduled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/openPlayer', () => ({
  openLibraryItemInPlayer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    stat: vi.fn(),
  },
}));

import { practicePersistence } from '../services/practicePersistence';
import { libraryFileOps } from '../services/libraryFileOps';
import { openLibraryItemInPlayer } from '../services/openPlayer';

const persistence = practicePersistence as unknown as {
  createExercise: ReturnType<typeof vi.fn>;
  deletePracticePlan: ReturnType<typeof vi.fn>;
  deleteExercise: ReturnType<typeof vi.fn>;
  deleteInterval: ReturnType<typeof vi.fn>;
  unlinkExerciseFromLibraryItem: ReturnType<typeof vi.fn>;
  updatePracticePlan: ReturnType<typeof vi.fn>;
  updateExercise: ReturnType<typeof vi.fn>;
  startSessionIfNeeded: ReturnType<typeof vi.fn>;
  listIntervals: ReturnType<typeof vi.fn>;
  clearIntervalDoneFlags: ReturnType<typeof vi.fn>;
  updateInterval: ReturnType<typeof vi.fn>;
};

const fileOps = libraryFileOps as unknown as {
  stat: ReturnType<typeof vi.fn>;
};

function mountPracticePage(): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const pinia = createPinia();
  setActivePinia(pinia);
  useLibraryStore();
  useMetronomeStore();
  usePlayerStore();
  useUiStore();
  createApp(PracticePage).use(pinia).mount(host);
  return host;
}

function clickByText(container: HTMLElement, text: string): void {
  const target = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!target) {
    throw new Error(`Button "${text}" not found`);
  }
  target.click();
}

/**
 * Historically `clickByText(host, 'Start')` drove the full load-media-and-play
 * flow. After the exercise-button refactor the UI exposes only `Open` (for
 * linked media) or `Start Metronome` (otherwise); the legacy integration
 * behaviour now lives on `setupState.handleStartExercise`, which the page
 * still exposes via `void handleStartExercise`. Tests that exercised the
 * old end-to-end flow call through here so they keep validating the full
 * composable — the UI button itself is covered by separate tests.
 */
async function invokeLegacyStart(
  host: HTMLElement,
  exerciseId?: string,
): Promise<void> {
  const app = (
    host as unknown as {
      __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
    }
  ).__vue_app__;
  const setupState = app?._instance?.setupState;
  const handler = setupState?.handleStartExercise as
    | ((exercise: PracticeExercise) => Promise<void>)
    | undefined;
  if (!handler) {
    throw new Error('handleStartExercise not exposed on setupState');
  }
  const practiceStore = usePracticeStore();
  const exercise = exerciseId
    ? practiceStore.exercises.find((entry) => entry.id === exerciseId)
    : (practiceStore.exercises.find(
        (entry) => entry.id === practiceStore.activeExerciseId,
      ) ?? practiceStore.exercises[0]);
  if (!exercise) {
    throw new Error('No exercise available for legacy start');
  }
  await handler(exercise);
}

async function invokeLegacyStop(host: HTMLElement): Promise<void> {
  const app = (
    host as unknown as {
      __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
    }
  ).__vue_app__;
  const setupState = app?._instance?.setupState;
  const handler = setupState?.handleStopExercise as
    | ((exercise: PracticeExercise) => Promise<void>)
    | undefined;
  if (!handler) {
    throw new Error('handleStopExercise not exposed on setupState');
  }
  const practiceStore = usePracticeStore();
  const activeId = practiceStore.activeExerciseId;
  const exercise = activeId
    ? practiceStore.exercises.find((entry) => entry.id === activeId)
    : practiceStore.exercises[0];
  if (!exercise) {
    return;
  }
  await handler(exercise);
}

function clickDraftAdd(container: HTMLElement): void {
  const draft = container.querySelector('.add-fields');
  if (!draft) {
    throw new Error('Draft container not found');
  }
  const addButton = Array.from(draft.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === 'Save Exercise',
  );
  if (!addButton) {
    throw new Error('Draft Add button not found');
  }
  addButton.click();
}

async function waitForIntervalTimer(host: HTMLElement): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await nextTick();
    await Promise.resolve();
    if (host.querySelector('.interval-timer')) {
      return;
    }
  }
  throw new Error('Interval timer did not start');
}

async function waitForMetronomeRunning(
  metronomeStore: ReturnType<typeof useMetronomeStore>,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await nextTick();
    await Promise.resolve();
    if (metronomeStore.isRunning) {
      return;
    }
  }
  throw new Error('Metronome did not start');
}

async function flushMicrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

async function waitForSpyCall(
  spy: ReturnType<typeof vi.fn>,
  expectedCalls = 1,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await nextTick();
    await Promise.resolve();
    if (spy.mock.calls.length >= expectedCalls) {
      return;
    }
  }
  throw new Error('Expected spy to be called');
}

describe('Practice edit behavior', () => {
  beforeEach(() => {
    persistence.createExercise.mockReset();
    persistence.updateExercise.mockReset();
    persistence.updateExercise.mockResolvedValue(undefined);
    persistence.updatePracticePlan.mockReset();
    persistence.unlinkExerciseFromLibraryItem.mockReset();
    persistence.startSessionIfNeeded.mockReset();
    persistence.startSessionIfNeeded.mockResolvedValue({
      id: 'session-default',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValue([]);
    persistence.updateInterval.mockReset();
    persistence.updateInterval.mockImplementation(
      async (intervalId, input) => ({
        id: intervalId,
        exerciseId: 'ex-1',
        name: 'Interval',
        durationSeconds: 1,
        bpm: null,
        sortIndex: 0,
        done: false,
        createdAt: 0,
        ...input,
      }),
    );
    persistence.clearIntervalDoneFlags.mockReset();
    (metronomeBeep as unknown as ReturnType<typeof vi.fn>).mockClear();
    (metronomeStop as unknown as ReturnType<typeof vi.fn>).mockClear();
    fileOps.stat.mockReset();
    (
      openLibraryItemInPlayer as unknown as ReturnType<typeof vi.fn>
    ).mockClear();
  });

  afterEach(async () => {
    const practiceStore = usePracticeStore();
    const metronomeStore = useMetronomeStore();
    const playerStore = usePlayerStore();
    await practiceStore.stopExercise();
    await metronomeStore.setRunning(false);
    playerStore.stop();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('requires minutes for new exercises when plan is timed', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Timed Plan',
        timed: true,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    persistence.createExercise.mockResolvedValueOnce({
      id: 'ex-1',
      planId: 'plan-1',
      title: 'Focus',
      sortOrder: 0,
      timePlannedMinutes: 5,
      intervalAuto: true,
      linkedTabId: null,
      linkedAudioId: null,
      totalTimeSpentSeconds: 0,
      bpm: null,
      intervals: [],
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
    });

    await nextTick();
    clickByText(host, 'Timed Plan');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    host
      .querySelector('[aria-label="Add Exercise"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const nameInput = host.querySelector<HTMLInputElement>(
      '.add-fields input[placeholder=\"Name\"]',
    );
    const timeInput = host.querySelector<HTMLInputElement>(
      '.add-fields input[placeholder=\"Time\"]',
    );
    if (!nameInput || !timeInput) {
      throw new Error('Draft inputs not found');
    }
    nameInput.value = 'Focus';
    nameInput.dispatchEvent(new Event('input'));
    clickDraftAdd(host);
    expect(persistence.createExercise).not.toHaveBeenCalled();

    timeInput.value = '5';
    timeInput.dispatchEvent(new Event('input'));
    clickDraftAdd(host);
    expect(persistence.createExercise).toHaveBeenCalledTimes(1);
    expect(persistence.createExercise).toHaveBeenCalledWith('plan-1', {
      title: 'Focus',
      timePlannedMinutes: 5,
    });
  });

  it('toggles the add exercise draft when clicking add exercise', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();

    host
      .querySelector('[aria-label="Add Exercise"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(host.querySelector('.add-fields')).not.toBeNull();

    host
      .querySelector('[aria-label="Add Exercise"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(host.querySelector('.add-fields')).toBeNull();
  });

  it('disables exercise dragging outside edit mode', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();

    const app = (
      host as unknown as {
        __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
      }
    ).__vue_app__;
    const setupState = app?._instance?.setupState;
    const exerciseMoveHandler = setupState?.exerciseMoveHandler as
      | ((
          planId: string,
        ) => (evt: {
          draggedContext: { element: { id: string } };
          relatedContext: { index: number };
          willInsertAfter: boolean;
        }) => boolean)
      | undefined;
    if (!exerciseMoveHandler) {
      throw new Error('exerciseMoveHandler not found');
    }
    expect(
      exerciseMoveHandler('plan-1')({
        draggedContext: { element: { id: 'ex-1' } },
        relatedContext: { index: 0 },
        willInsertAfter: false,
      }),
    ).toBe(false);

    expect(host.querySelector('.exercise-drag-handle')).toBeNull();

    clickByText(host, 'Edit');
    await nextTick();
    const handle = host.querySelector('.exercise-drag-handle');
    if (!handle) {
      throw new Error('Exercise drag handle not found');
    }
    expect(
      exerciseMoveHandler('plan-1')({
        draggedContext: { element: { id: 'ex-1' } },
        relatedContext: { index: 0 },
        willInsertAfter: false,
      }),
    ).toBe(true);
  });

  it('allows editing planned minutes when no intervals exist', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        notes: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();

    const minutesButton = host.querySelector<HTMLButtonElement>(
      '.exercise-minutes-button',
    );
    expect(minutesButton?.textContent?.trim()).toBe('5m');
    minutesButton?.click();
    await nextTick();

    const minutesInput = host.querySelector<HTMLInputElement>(
      '.exercise-minutes-input',
    );
    if (!minutesInput) {
      throw new Error('Minutes input not found');
    }
    minutesInput.value = '8';
    minutesInput.dispatchEvent(new Event('input'));
    minutesInput.dispatchEvent(new Event('blur'));
    expect(persistence.updateExercise).toHaveBeenCalledWith('ex-1', {
      timePlannedMinutes: 8,
    });
  });

  it('supports decimal planned minutes when no intervals exist', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        notes: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();

    const minutesButton = host.querySelector<HTMLButtonElement>(
      '.exercise-minutes-button',
    );
    minutesButton?.click();
    await nextTick();

    const minutesInput = host.querySelector<HTMLInputElement>(
      '.exercise-minutes-input',
    );
    if (!minutesInput) {
      throw new Error('Minutes input not found');
    }
    minutesInput.value = '2.5';
    minutesInput.dispatchEvent(new Event('input'));
    minutesInput.dispatchEvent(new Event('blur'));
    expect(persistence.updateExercise).toHaveBeenCalledWith('ex-1', {
      timePlannedMinutes: 2.5,
    });
  });

  it('shows interval sums as exercise time when intervals exist', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 10,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        notes: null,
        intervals: [
          {
            id: 'int-1',
            exerciseId: 'ex-1',
            name: null,
            durationSeconds: 60,
            bpm: null,
            sortIndex: 0,
            done: false,
            createdAt: null,
          },
          {
            id: 'int-2',
            exerciseId: 'ex-1',
            name: null,
            durationSeconds: 120,
            bpm: null,
            sortIndex: 1,
            done: false,
            createdAt: null,
          },
        ],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();

    const minutesReadout = host.querySelector(
      '.exercise-minutes-readonly',
    ) as HTMLElement | null;
    expect(minutesReadout?.textContent?.trim()).toBe('3m');
    expect(host.querySelector('.exercise-minutes-button')).toBeNull();
  });

  it('exits edit mode when the user clicks Open on a linked-tab exercise', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    const libraryStore = useLibraryStore();

    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'Etude',
        source: { kind: 'reference', path: '/tmp/etude.gp' },
        metadata: { fileName: 'etude.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    expect(host.querySelector('.add-row')).not.toBeNull();

    clickByText(host, 'Open');
    await nextTick();
    await flushMicrotasks();

    // handleOpenExercise must also drop the plan out of edit mode so the
    // add-draft UI doesn't linger over the loaded tab.
    expect(host.querySelector('.add-row')).toBeNull();
  });

  it('allows null minutes for new exercises when plan is not timed', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Flexible Plan',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    persistence.createExercise.mockResolvedValueOnce({
      id: 'ex-1',
      planId: 'plan-1',
      title: 'Focus',
      sortOrder: 0,
      timePlannedMinutes: null,
      intervalAuto: true,
      linkedTabId: null,
      linkedAudioId: null,
      totalTimeSpentSeconds: 0,
      bpm: null,
      intervals: [],
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
    });

    await nextTick();
    clickByText(host, 'Flexible Plan');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    host
      .querySelector('[aria-label="Add Exercise"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const nameInput = host.querySelector<HTMLInputElement>(
      '.add-fields input[placeholder=\"Name\"]',
    );
    if (!nameInput) {
      throw new Error('Draft name input not found');
    }
    nameInput.value = 'Focus';
    nameInput.dispatchEvent(new Event('input'));
    clickDraftAdd(host);
    expect(persistence.createExercise).toHaveBeenCalledTimes(1);
    expect(persistence.createExercise).toHaveBeenCalledWith('plan-1', {
      title: 'Focus',
      timePlannedMinutes: null,
    });
  });

  it('toggles timed only in edit mode', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Timed Plan',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    const indicator = host.querySelector<HTMLButtonElement>(
      '.plan-timed-indicator',
    );
    if (!indicator) {
      throw new Error('Timed indicator not found');
    }
    indicator.click();
    expect(persistence.updatePracticePlan).not.toHaveBeenCalled();

    clickByText(host, 'Timed Plan');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    indicator.click();
    expect(persistence.updatePracticePlan).toHaveBeenCalledTimes(1);
    expect(persistence.updatePracticePlan).toHaveBeenCalledWith('plan-1', {
      timed: true,
    });
  });

  it('commits and cancels plan title edits', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    clickByText(host, 'Session');
    await nextTick();

    let input = host.querySelector<HTMLInputElement>('.plan-title-input');
    if (!input) {
      throw new Error('Plan title input not found');
    }
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    expect(persistence.updatePracticePlan).not.toHaveBeenCalled();

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    input = host.querySelector<HTMLInputElement>('.plan-title-input');
    if (!input) {
      throw new Error('Plan title input not found');
    }
    input.value = 'New Session';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    expect(persistence.updatePracticePlan).toHaveBeenCalledTimes(1);
    expect(persistence.updatePracticePlan).toHaveBeenCalledWith('plan-1', {
      title: 'New Session',
    });
  });

  it('commits plan title edits on blur', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    clickByText(host, 'Session');
    await nextTick();

    const input = host.querySelector<HTMLInputElement>('.plan-title-input');
    if (!input) {
      throw new Error('Plan title input not found');
    }
    input.value = 'Blurred';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new FocusEvent('blur'));
    await nextTick();

    expect(persistence.updatePracticePlan).toHaveBeenCalledWith('plan-1', {
      title: 'Blurred',
    });
    expect(host.querySelector('.plan-title-input')).toBeNull();
  });

  it('sets metronome bpm from the first interval on start', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    const metronomeStore = useMetronomeStore();
    const bpmSpy = vi.spyOn(metronomeStore, 'setBpm');
    persistence.listIntervals.mockResolvedValue([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval 1',
        durationSeconds: 60,
        bpm: 132,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
    ]);
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();

    await invokeLegacyStart(host);
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bpmSpy).toHaveBeenCalledWith(132);

    await invokeLegacyStop(host);
    await nextTick();
  });

  it('applies interval bpm when starting a linked tab exercise', async () => {
    const createRunnerSpy = vi.spyOn(intervalRunner, 'createIntervalRunner');
    try {
      const host = mountPracticePage();
      const store = usePracticeStore();
      const libraryStore = useLibraryStore();
      const playerStore = usePlayerStore();
      const appStore = useAppStore();
      const setBpmSpy = vi.spyOn(playerStore, 'setBpm');

      appStore.setMetronomeEnabled(true);
      appStore.setCountInEnabled(false);
      appStore.setIntervalChangeCountInBars(4);

      createRunnerSpy.mockImplementation((intervals, onTick, onIntervalEnd) => {
        return {
          start: () => {
            if (!intervals.length) {
              return;
            }
            const first = intervals[0];
            onTick({
              intervalIndex: 0,
              intervalId: first.id,
              remainingSeconds: first.durationSeconds,
              totalSeconds: first.durationSeconds,
            });
            onIntervalEnd(0, first);
            if (intervals.length < 2) {
              return;
            }
            const second = intervals[1];
            onTick({
              intervalIndex: 1,
              intervalId: second.id,
              remainingSeconds: second.durationSeconds,
              totalSeconds: second.durationSeconds,
            });
          },
          stop: () => {},
          reset: () => {},
          jumpToIndex: () => {},
          isRunning: () => false,
          getIndex: () => 0,
        };
      });

      persistence.listIntervals.mockResolvedValue([
        {
          id: 'int-1',
          exerciseId: 'ex-1',
          name: 'Interval 1',
          durationSeconds: 1,
          bpm: 120,
          sortIndex: 0,
          done: false,
          createdAt: 1,
        },
        {
          id: 'int-2',
          exerciseId: 'ex-1',
          name: 'Interval 2',
          durationSeconds: 1,
          bpm: 140,
          sortIndex: 1,
          done: false,
          createdAt: 2,
        },
      ]);
      store.plans = [
        {
          id: 'plan-1',
          title: 'Session',
          timed: false,
          sortOrder: 0,
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
        },
      ];
      store.exercises = [
        {
          id: 'ex-1',
          planId: 'plan-1',
          title: 'Warmups',
          sortOrder: 0,
          timePlannedMinutes: 5,
          intervalAuto: true,
          linkedTabId: 'lib-1',
          linkedAudioId: null,
          totalTimeSpentSeconds: 0,
          bpm: null,
          intervals: [],
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
        },
      ];
      libraryStore.items = [
        {
          id: 'lib-1',
          kind: 'tab' as const,
          title: 'My Tab',
          source: { kind: 'reference', path: '/tmp/tab.gp' },
          metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ];
      fileOps.stat.mockResolvedValueOnce(undefined);
      playerStore.setReady();
      playerStore.model.currentLibraryItemId = 'lib-1';
      playerStore.model.playback = 'paused';
      playerStore.setBaseBpm(120);
      await store.ensureIntervalsLoaded('ex-1');

      await nextTick();
      clickByText(host, 'Session');
      await nextTick();
      clickByText(host, 'Warmups');
      await nextTick();
      await invokeLegacyStart(host);
      await nextTick();
      await flushMicrotasks();
      playerStore.model.playback = 'playing';
      await nextTick();
      await flushMicrotasks();

      expect(setBpmSpy).toHaveBeenCalledWith(120);

      await invokeLegacyStop(host);
      await nextTick();
    } finally {
      createRunnerSpy.mockRestore();
    }
  });

  it('avoids starting an unsynced metronome when starting a linked tab', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    const libraryStore = useLibraryStore();
    const metronomeStore = useMetronomeStore();
    const appStore = useAppStore();
    const runningSpy = vi.spyOn(metronomeStore, 'setRunning');

    appStore.setMetronomeEnabled(true);
    persistence.listIntervals.mockResolvedValue([]);
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];
    fileOps.stat.mockResolvedValueOnce(undefined);
    await store.ensureIntervalsLoaded('ex-1');

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await nextTick();
    await flushMicrotasks();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(runningSpy).not.toHaveBeenCalledWith(true);

    await invokeLegacyStop(host);
    await nextTick();
  });

  it('enables sync to tab when starting an interval exercise with a tab', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    const libraryStore = useLibraryStore();
    const appStore = useAppStore();
    const playerStore = usePlayerStore();
    const playWithCountInSpy = vi.spyOn(playerStore, 'playWithCountInBars');

    appStore.setMetronomeEnabled(false);
    persistence.startSessionIfNeeded.mockResolvedValue({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValue([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval 1',
        durationSeconds: 60,
        bpm: 120,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
    ]);
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];
    fileOps.stat.mockResolvedValueOnce(undefined);

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await nextTick();
    await flushMicrotasks();
    await nextTick();

    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'lib-1',
    };
    await nextTick();

    expect(appStore.metronomeEnabled).toBe(true);
    expect(playWithCountInSpy).toHaveBeenCalled();
    expect(playWithCountInSpy.mock.calls[0][0]).toBe(
      appStore.intervalChangeCountInBars,
    );

    await invokeLegacyStop(host);
    await nextTick();
  });

  it('does not force interval count-in when a linked exercise has no intervals', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    const libraryStore = useLibraryStore();
    const appStore = useAppStore();
    const playerStore = usePlayerStore();
    const playWithCountInSpy = vi.spyOn(playerStore, 'playWithCountInBars');

    appStore.setMetronomeEnabled(true);
    appStore.setCountInEnabled(false);
    persistence.startSessionIfNeeded.mockResolvedValue({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValue([]);
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];
    fileOps.stat.mockResolvedValueOnce(undefined);

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await nextTick();
    await flushMicrotasks();
    await nextTick();

    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'lib-1',
    };
    await nextTick();

    expect(playWithCountInSpy).not.toHaveBeenCalled();

    await invokeLegacyStop(host);
    await nextTick();
  });

  it('deletes a plan in edit mode', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    clickByText(host, 'Delete Plan');
    await nextTick();
    expect(
      host
        .querySelector('.confirm-actions--align-right')
        ?.classList.contains('confirm-actions--open'),
    ).toBe(true);
    expect(persistence.deletePracticePlan).not.toHaveBeenCalled();
    clickByText(host, 'Yes');

    expect(persistence.deletePracticePlan).toHaveBeenCalledTimes(1);
    expect(persistence.deletePracticePlan).toHaveBeenCalledWith('plan-1');
  });

  it('applies elevated stacking class to delete plan confirmation container', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();

    expect(host.querySelector('.confirm-actions--destructive')).toBeTruthy();
  });

  it('does not delete when plan confirmation is cancelled', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    (
      persistence.deletePracticePlan as unknown as ReturnType<typeof vi.fn>
    ).mockClear();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    clickByText(host, 'Delete Plan');
    await nextTick();
    clickByText(host, 'No');
    await nextTick();

    expect(persistence.deletePracticePlan).not.toHaveBeenCalled();
    expect(
      Array.from(host.querySelectorAll('span')).some(
        (node) => node.textContent?.trim() === 'Are you sure?',
      ),
    ).toBe(false);
  });

  it('confirms before deleting an exercise', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();

    const deleteButton = host.querySelector(
      '[aria-label="Delete Exercise"]',
    ) as HTMLButtonElement | null;
    expect(deleteButton).toBeTruthy();
    expect(
      deleteButton
        ?.closest('.confirm-actions')
        ?.classList.contains('confirm-actions--destructive'),
    ).toBe(true);
    deleteButton?.click();
    await nextTick();
    expect(
      deleteButton
        ?.closest('.confirm-actions')
        ?.classList.contains('confirm-actions--open'),
    ).toBe(true);

    expect(persistence.deleteExercise).not.toHaveBeenCalled();
    clickByText(host, 'Yes');
    expect(persistence.deleteExercise).toHaveBeenCalledWith('ex-1');
  });

  it('confirms before deleting an interval', async () => {
    const host = mountPracticePage();
    const store = usePracticeStore();
    store.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    store.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [
          {
            id: 'int-1',
            name: 'Interval 1',
            durationSeconds: 30,
            bpm: 80,
            sortIndex: 0,
            createdAt: 1,
            updatedAt: 1,
            done: false,
          },
        ],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    const listIntervalsSpy = persistence.listIntervals as unknown as ReturnType<
      typeof vi.fn
    >;
    listIntervalsSpy.mockResolvedValueOnce([
      {
        id: 'int-1',
        name: 'Interval 1',
        durationSeconds: 30,
        bpm: 80,
        sortIndex: 0,
        createdAt: 1,
        updatedAt: 1,
        done: false,
      },
    ]);

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();

    const deleteIntervalButton = host.querySelector(
      '[aria-label="Delete Interval"]',
    ) as HTMLButtonElement | null;
    expect(deleteIntervalButton).toBeTruthy();
    expect(
      deleteIntervalButton
        ?.closest('.confirm-actions')
        ?.classList.contains('confirm-actions--destructive'),
    ).toBe(true);
    deleteIntervalButton?.click();
    await nextTick();
    expect(
      deleteIntervalButton
        ?.closest('.confirm-actions')
        ?.classList.contains('confirm-actions--open'),
    ).toBe(true);

    expect(persistence.deleteInterval).not.toHaveBeenCalled();
    clickByText(host, 'Yes');
    expect(persistence.deleteInterval).toHaveBeenCalledWith('int-1');
  });

  it('confirms before removing a linked tab', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const clearSelectionSpy = vi
      .spyOn(playerStore, 'clearSelection')
      .mockImplementation(() => Promise.resolve());
    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];
    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    clickByText(host, 'Edit');
    await nextTick();
    playerStore.model = {
      ...playerStore.model,
      currentLibraryItemId: 'lib-1',
      status: 'ready',
    };

    host
      .querySelector('[aria-label="Remove Tab"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(persistence.unlinkExerciseFromLibraryItem).not.toHaveBeenCalled();
    clickByText(host, 'Yes');
    await flushMicrotasks();
    expect(persistence.unlinkExerciseFromLibraryItem).toHaveBeenCalledWith(
      'ex-1',
      'tab',
    );
    expect(clearSelectionSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults exercise bpm to tab bpm when opening a linked tab', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    clickByText(host, 'My Tab');

    playerStore.model.currentLibraryItemId = 'lib-1';
    playerStore.model.baseBpm = 140;
    await nextTick();

    expect(persistence.updateExercise).toHaveBeenCalledWith('ex-1', {
      bpm: 140,
    });
  });

  it('marks linked tabs missing and avoids opening when file is not found', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    fileOps.stat.mockRejectedValueOnce(new Error('not_found'));

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    clickByText(host, 'My Tab');
    await Promise.resolve();
    await nextTick();

    expect(openLibraryItemInPlayer).not.toHaveBeenCalled();
    const locateButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Locate',
    );
    expect(locateButton).toBeTruthy();
  });

  it('uses tab tempo when starting a linked exercise without a bpm', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const appStore = useAppStore();
    const updateSpy = persistence.updateExercise;

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    appStore.setMetronomeEnabled(true);

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();

    const app = (
      host as unknown as {
        __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
      }
    ).__vue_app__;
    const setupState = app?._instance?.setupState;
    const handleStartExercise = setupState?.handleStartExercise as
      | ((exercise: PracticeExercise) => Promise<void>)
      | undefined;
    if (!handleStartExercise) {
      throw new Error('handleStartExercise not found');
    }
    await handleStartExercise(practiceStore.exercises[0]);
    playerStore.model.currentLibraryItemId = 'lib-1';
    playerStore.model.baseBpm = 140;
    await flushMicrotasks();

    expect(updateSpy).toHaveBeenCalledWith('ex-1', { bpm: 140 });
  });

  it('does not open the Tempo Change dialog when exercise bpm equals the tab initial bpm', async () => {
    // The user-visible invariant for matching-BPM exercises: no "Tempo
    // Change Not Supported" dialog, no auto-unlink. The previous
    // assertion that `playerStore.setBpm` was never called was an
    // implementation detail of the pre-v22 start flow — the current
    // handleStartExercise calls setBpm unconditionally in the tab path
    // to seed the metronome, which is harmless when the value already
    // equals baseBpm.
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    vi.spyOn(playerStore, 'hasLoadedTabTempoChanges').mockReturnValue(true);

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'lib-1',
      baseBpm: 120,
      playback: 'stopped',
    };

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await flushMicrotasks();

    // No unlink, no dialog — the exercise stays bound to its tab and
    // the tempo-change warning only fires when exercise BPM actually
    // overrides the tab's base BPM.
    expect(persistence.unlinkExerciseFromLibraryItem).not.toHaveBeenCalled();
    expect(
      host.textContent?.includes('Tempo Change Not Supported'),
    ).not.toBeTruthy();
  });

  it('shows locate button and file name for missing linked tabs', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'Missing Tab',
        source: { kind: 'reference', path: '/tmp/missing.gp5' },
        metadata: { fileName: 'missing.gp5', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: false,
        missingReason: 'not_found',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();

    expect(host.textContent).toContain('missing');
    const locateButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Locate',
    );
    expect(locateButton).toBeTruthy();
  });

  it('updates exercise notes on blur outside edit mode', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();

    const textarea = host.querySelector(
      '.exercise-notes-textarea',
    ) as HTMLTextAreaElement | null;
    if (!textarea) {
      throw new Error('Notes textarea not found');
    }
    textarea.focus();
    textarea.value = 'Focus on bends';
    textarea.dispatchEvent(new Event('input'));
    textarea.blur();
    await nextTick();

    expect(persistence.updateExercise).toHaveBeenCalledWith('ex-1', {
      notes: 'Focus on bends',
    });
  });

  it('starts the exercise timer on expansion, not on playback', async () => {
    // Under the expansion-driven model the exercise session begins the
    // moment the user opens an exercise in the practice plan. Playback
    // (tab/audio/metronome) is independent. This consolidates two prior
    // tests that asserted the pre-v22 "start-on-playback" behaviour.
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    expect(practiceStore.activeExerciseId).toBeNull();

    clickByText(host, 'Warmups');
    await flushMicrotasks();

    // Expansion alone is enough — no playback needed.
    expect(practiceStore.activeExerciseId).toBe('ex-1');
    expect(persistence.startSessionIfNeeded).toHaveBeenCalled();

    // Starting playback afterwards must NOT restart the session — it's
    // already running and `startExercise` guards against resetting the
    // tick state.
    const startCallsBefore = persistence.startSessionIfNeeded.mock.calls.length;
    playerStore.model.currentLibraryItemId = 'lib-1';
    playerStore.model.playback = 'playing';
    await nextTick();
    expect(persistence.startSessionIfNeeded.mock.calls.length).toBe(
      startCallsBefore,
    );
  });

  it('space on an expanded metronome-only exercise toggles the metronome with the exercise BPM', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const metronomeStore = useMetronomeStore();

    persistence.listIntervals.mockResolvedValueOnce([]);

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await flushMicrotasks();

    const setBpmSpy = vi.spyOn(metronomeStore, 'setBpm');
    const setRunningSpy = vi.spyOn(metronomeStore, 'setRunning');

    const event = new CustomEvent('practice-space', { cancelable: true });
    window.dispatchEvent(event);
    await flushMicrotasks();

    expect(event.defaultPrevented).toBe(true);
    expect(setBpmSpy).toHaveBeenCalledWith(120);
    expect(setRunningSpy).toHaveBeenCalledWith(true);
  });

  it('space while the interval runner is running stops the runner', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await flushMicrotasks();

    // Simulate an interval runner in flight — the only remaining space-
    // handled case in the new model.
    const app = (
      host as unknown as {
        __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
      }
    ).__vue_app__;
    const setupState = app?._instance?.setupState;
    const runnerState = setupState?.intervalRunnerState as
      | { running: boolean; exerciseId: string | null }
      | undefined;
    if (runnerState) {
      runnerState.running = true;
      runnerState.exerciseId = 'ex-1';
    }
    await nextTick();

    const event = new CustomEvent('practice-space', { cancelable: true });
    window.dispatchEvent(event);
    await flushMicrotasks();

    // Space preventDefault so global handler does not also toggle transport.
    expect(event.defaultPrevented).toBe(true);
    // handleStopExercise clears activeExerciseId via stopExercise.
    expect(practiceStore.activeExerciseId).toBeNull();
  });

  it('stops timers and metronome when tab playback pauses', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const metronomeStore = useMetronomeStore();
    const playerStore = usePlayerStore();

    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await practiceStore.startExercise('ex-1');
    const stopSpy = vi.spyOn(metronomeStore, 'setRunning');

    playerStore.model.playback = 'playing';
    await nextTick();
    playerStore.model.playback = 'paused';
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Exercise timer is expansion-driven — pausing playback only tears
    // down the metronome/interval runner, the session itself keeps going.
    expect(practiceStore.activeExerciseId).toBe('ex-1');
    expect(stopSpy).toHaveBeenCalledWith(false);

    host.remove();
  });

  it('does not start timer playback when linked tab is missing', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: null,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    fileOps.stat.mockRejectedValueOnce(new Error('not_found'));

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await Promise.resolve();
    await nextTick();

    expect(openLibraryItemInPlayer).not.toHaveBeenCalled();
    const locateButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Locate',
    );
    expect(locateButton).toBeTruthy();
  });

  it('enables loop when starting a linked tab exercise', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 5,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'lib-1',
    };
    playerStore.isLoopEnabled = false;

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await nextTick();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(playerStore.isLoopEnabled).toBe(true);
  });

  it('plays beep when planned timer completes without intervals', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2025-01-01T10:00:00Z'));
      const host = mountPracticePage();
      const practiceStore = usePracticeStore();
      const beepSpy = metronomeBeep as unknown as ReturnType<typeof vi.fn>;
      persistence.startSessionIfNeeded.mockResolvedValueOnce({
        id: 'session-1',
        sessionDate: '2025-01-01',
        startedAt: '2025-01-01T10:00:00Z',
        endedAt: null,
        totalTimeSpentSeconds: 0,
        createdAt: '2025-01-01T10:00:00Z',
      });

      practiceStore.plans = [
        {
          id: 'plan-1',
          title: 'Session',
          timed: false,
          sortOrder: 0,
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
        },
      ];
      practiceStore.exercises = [
        {
          id: 'ex-1',
          planId: 'plan-1',
          title: 'Warmups',
          sortOrder: 0,
          timePlannedMinutes: 1,
          intervalAuto: true,
          linkedTabId: null,
          linkedAudioId: null,
          totalTimeSpentSeconds: 0,
          bpm: 120,
          intervals: [],
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
        },
      ];

      await nextTick();
      clickByText(host, 'Session');
      await nextTick();
      clickByText(host, 'Warmups');
      await nextTick();
      await practiceStore.startExercise('ex-1');
      await nextTick();
      await Promise.resolve();

      vi.advanceTimersByTime(61000);
      vi.runOnlyPendingTimers();
      await nextTick();

      expect(beepSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('plays beep when interval timer completes', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const metronomeStore = useMetronomeStore();
    const beepSpy = metronomeBeep as unknown as ReturnType<typeof vi.fn>;
    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValueOnce([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval',
        durationSeconds: 1,
        bpm: 120,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
    ]);

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await waitForIntervalTimer(host);
    await waitForMetronomeRunning(metronomeStore);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await nextTick();
    await flushMicrotasks();

    expect(beepSpy).toHaveBeenCalledTimes(1);
  });

  it('auto off stops after interval completion without advancing', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const playerStore = usePlayerStore();
    const metronomeStore = useMetronomeStore();
    const beepSpy = metronomeBeep as unknown as ReturnType<typeof vi.fn>;
    const stopSpy = metronomeStop as unknown as ReturnType<typeof vi.fn>;
    const completeIntervalSpy = vi.spyOn(practiceStore, 'completeInterval');
    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValueOnce([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval 1',
        durationSeconds: 1,
        bpm: 100,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
      {
        id: 'int-2',
        exerciseId: 'ex-1',
        name: 'Interval 2',
        durationSeconds: 1,
        bpm: 120,
        sortIndex: 1,
        done: false,
        createdAt: 2,
      },
    ]);
    persistence.updateInterval.mockImplementation(async (intervalId, input) => {
      const base =
        intervalId === 'int-1'
          ? {
              id: 'int-1',
              exerciseId: 'ex-1',
              name: 'Interval 1',
              durationSeconds: 1,
              bpm: 100,
              sortIndex: 0,
              done: false,
              createdAt: 1,
            }
          : {
              id: 'int-2',
              exerciseId: 'ex-1',
              name: 'Interval 2',
              durationSeconds: 1,
              bpm: 120,
              sortIndex: 1,
              done: false,
              createdAt: 2,
            };
      return { ...base, ...input };
    });

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: false,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    playerStore.model = {
      ...playerStore.model,
      playback: 'playing',
    };

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await waitForIntervalTimer(host);
    await waitForMetronomeRunning(metronomeStore);

    // Interval (1s) + beep delay (800ms) + buffer
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await nextTick();
    await flushMicrotasks();

    expect(beepSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(completeIntervalSpy).toHaveBeenCalledTimes(1);
    expect(practiceStore.activeExerciseId).toBeNull();
  });

  it('auto on advances to the next interval after completion', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const metronomeStore = useMetronomeStore();
    const beepSpy = metronomeBeep as unknown as ReturnType<typeof vi.fn>;
    const stopSpy = metronomeStop as unknown as ReturnType<typeof vi.fn>;
    const completeIntervalSpy = vi.spyOn(practiceStore, 'completeInterval');
    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValueOnce([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval 1',
        durationSeconds: 1,
        bpm: 100,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
      {
        id: 'int-2',
        exerciseId: 'ex-1',
        name: 'Interval 2',
        durationSeconds: 1,
        bpm: 120,
        sortIndex: 1,
        done: false,
        createdAt: 2,
      },
    ]);
    persistence.updateInterval.mockImplementation(async (intervalId, input) => {
      const base =
        intervalId === 'int-1'
          ? {
              id: 'int-1',
              exerciseId: 'ex-1',
              name: 'Interval 1',
              durationSeconds: 1,
              bpm: 100,
              sortIndex: 0,
              done: false,
              createdAt: 1,
            }
          : {
              id: 'int-2',
              exerciseId: 'ex-1',
              name: 'Interval 2',
              durationSeconds: 1,
              bpm: 120,
              sortIndex: 1,
              done: false,
              createdAt: 2,
            };
      return { ...base, ...input };
    });

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await waitForIntervalTimer(host);
    await waitForMetronomeRunning(metronomeStore);

    // Interval (1s) + beep delay (800ms) + buffer
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await nextTick();
    await flushMicrotasks();

    expect(beepSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(completeIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the active exercise during linked auto-advance transitions', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const libraryStore = useLibraryStore();
    const playerStore = usePlayerStore();
    const beepSpy = metronomeBeep as unknown as ReturnType<typeof vi.fn>;

    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValueOnce([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval 1',
        durationSeconds: 1,
        bpm: 100,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
      {
        id: 'int-2',
        exerciseId: 'ex-1',
        name: 'Interval 2',
        durationSeconds: 1,
        bpm: 120,
        sortIndex: 1,
        done: false,
        createdAt: 2,
      },
    ]);
    persistence.updateInterval.mockImplementation(async (intervalId, input) => {
      const base =
        intervalId === 'int-1'
          ? {
              id: 'int-1',
              exerciseId: 'ex-1',
              name: 'Interval 1',
              durationSeconds: 1,
              bpm: 100,
              sortIndex: 0,
              done: false,
              createdAt: 1,
            }
          : {
              id: 'int-2',
              exerciseId: 'ex-1',
              name: 'Interval 2',
              durationSeconds: 1,
              bpm: 120,
              sortIndex: 1,
              done: false,
              createdAt: 2,
            };
      return { ...base, ...input };
    });

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: true,
        linkedTabId: 'lib-1',
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    libraryStore.items = [
      {
        id: 'lib-1',
        kind: 'tab' as const,
        title: 'My Tab',
        source: { kind: 'reference', path: '/tmp/tab.gp' },
        metadata: { fileName: 'tab.gp', size: 10, modifiedMs: 1 },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        lastKnownOk: true,
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    clickByText(host, 'My Tab');
    await Promise.resolve();
    await nextTick();

    playerStore.model.currentLibraryItemId = 'lib-1';
    playerStore.model.playback = 'playing';
    await nextTick();

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await nextTick();
    await flushMicrotasks();

    expect(beepSpy).toHaveBeenCalled();
    expect(practiceStore.activeExerciseId).toBe('ex-1');
  });

  it('repeats intervals from the beginning when repeat mode is enabled', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const metronomeStore = useMetronomeStore();
    const completeIntervalSpy = vi.spyOn(practiceStore, 'completeInterval');
    const clearDoneSpy = vi.spyOn(practiceStore, 'clearIntervalDoneFlags');

    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValueOnce([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval 1',
        durationSeconds: 1,
        bpm: 100,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
      {
        id: 'int-2',
        exerciseId: 'ex-1',
        name: 'Interval 2',
        durationSeconds: 1,
        bpm: 120,
        sortIndex: 1,
        done: false,
        createdAt: 2,
      },
    ]);
    persistence.updateInterval.mockImplementation(async (intervalId, input) => {
      const base =
        intervalId === 'int-1'
          ? {
              id: 'int-1',
              exerciseId: 'ex-1',
              name: 'Interval 1',
              durationSeconds: 1,
              bpm: 100,
              sortIndex: 0,
              done: false,
              createdAt: 1,
            }
          : {
              id: 'int-2',
              exerciseId: 'ex-1',
              name: 'Interval 2',
              durationSeconds: 1,
              bpm: 120,
              sortIndex: 1,
              done: false,
              createdAt: 2,
            };
      return { ...base, ...input };
    });

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: true,
        intervalRepeat: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await waitForIntervalTimer(host);
    await waitForMetronomeRunning(metronomeStore);

    await new Promise((resolve) => setTimeout(resolve, 4200));
    await nextTick();
    await flushMicrotasks();

    expect(clearDoneSpy).toHaveBeenCalledTimes(1);
    expect(completeIntervalSpy.mock.calls.length).toBeGreaterThan(1);
  });

  it('clears done flags when all intervals complete', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const metronomeStore = useMetronomeStore();
    const stopSpy = metronomeStop as unknown as ReturnType<typeof vi.fn>;
    const clearDoneSpy = vi.spyOn(practiceStore, 'clearIntervalDoneFlags');
    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });
    persistence.listIntervals.mockResolvedValueOnce([
      {
        id: 'int-1',
        exerciseId: 'ex-1',
        name: 'Interval 1',
        durationSeconds: 1,
        bpm: 100,
        sortIndex: 0,
        done: false,
        createdAt: 1,
      },
    ]);
    persistence.updateInterval.mockResolvedValueOnce({
      id: 'int-1',
      exerciseId: 'ex-1',
      name: 'Interval 1',
      durationSeconds: 1,
      bpm: 100,
      sortIndex: 0,
      done: true,
      createdAt: 1,
    });
    persistence.clearIntervalDoneFlags.mockResolvedValueOnce(undefined);

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await waitForIntervalTimer(host);
    await waitForMetronomeRunning(metronomeStore);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    await nextTick();
    await flushMicrotasks();
    await waitForSpyCall(clearDoneSpy);

    expect(stopSpy).toHaveBeenCalled();
    expect(clearDoneSpy).toHaveBeenCalled();
  });

  it('unloads a loaded tab when starting an exercise without a tab', async () => {
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();
    const playerStore = usePlayerStore();
    persistence.startSessionIfNeeded.mockResolvedValueOnce({
      id: 'session-1',
      sessionDate: '2025-01-01',
      startedAt: '2025-01-01T10:00:00Z',
      endedAt: null,
      totalTimeSpentSeconds: 0,
      createdAt: '2025-01-01T10:00:00Z',
    });

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];

    playerStore.model = {
      ...playerStore.model,
      status: 'ready',
      currentLibraryItemId: 'lib-1',
    };

    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await nextTick();
    await invokeLegacyStart(host);
    await nextTick();

    expect(playerStore.model.currentLibraryItemId).toBeNull();
  });

  it('prevents switching to another exercise while the interval runner is running', async () => {
    // The switch-lock now hangs off intervalRunnerState.running (interval
    // runs are uninterruptible), not activeExerciseId — expansion alone
    // is no longer blocking.
    const host = mountPracticePage();
    const practiceStore = usePracticeStore();

    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Session',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    practiceStore.exercises = [
      {
        id: 'ex-1',
        planId: 'plan-1',
        title: 'Warmups',
        sortOrder: 0,
        timePlannedMinutes: 1,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 120,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
      {
        id: 'ex-2',
        planId: 'plan-1',
        title: 'Scales',
        sortOrder: 1,
        timePlannedMinutes: 1,
        intervalAuto: true,
        linkedTabId: null,
        linkedAudioId: null,
        totalTimeSpentSeconds: 0,
        bpm: 110,
        intervals: [],
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      },
    ];
    await nextTick();
    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmups');
    await flushMicrotasks();

    // Flip the interval runner on and assert the Scales row refuses to
    // expand while it's running.
    const app = (
      host as unknown as {
        __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
      }
    ).__vue_app__;
    const setupState = app?._instance?.setupState;
    const runnerState = setupState?.intervalRunnerState as
      | { running: boolean; exerciseId: string | null }
      | undefined;
    if (runnerState) {
      runnerState.running = true;
      runnerState.exerciseId = 'ex-1';
    }
    await nextTick();

    clickByText(host, 'Scales');
    await nextTick();

    // The active exercise (ex-1) stays expanded — toggleExercise bails
    // while isTimerLocked is true and the click target isn't the active
    // exercise.
    expect(practiceStore.activeExerciseId).toBe('ex-1');
  });
});
