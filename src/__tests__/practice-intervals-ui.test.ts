// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { usePracticeStore } from '../stores/practice';
import { useLibraryStore } from '../stores/library';
import { useMetronomeStore } from '../stores/metronome';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';

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

import { practicePersistence } from '../services/practicePersistence';

const persistence = practicePersistence as unknown as {
  listIntervals: ReturnType<typeof vi.fn>;
  startSessionIfNeeded: ReturnType<typeof vi.fn>;
};

async function mountPracticePage(): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const pinia = createPinia();
  setActivePinia(pinia);
  useLibraryStore();
  useMetronomeStore();
  usePlayerStore();
  useUiStore();
  const { default: PracticePage } = await import('../pages/Practice.vue');
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

describe('practice intervals UI', () => {
  beforeEach(() => {
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
  });

  it('shows edit controls only in edit mode', async () => {
    const host = await mountPracticePage();
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
    clickByText(host, 'Warmups');
    await nextTick();

    expect(host.querySelector('[aria-label="Add Interval"]')).toBeNull();
    expect(host.querySelector('[aria-label="Delete Interval"]')).toBeNull();

    clickByText(host, 'Edit');
    await nextTick();

    expect(host.querySelector('[aria-label="Add Interval"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Delete Interval"]')).not.toBeNull();
  }, 10000);

  it('toggles the interval draft when clicking add time interval', async () => {
    const host = await mountPracticePage();
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
    clickByText(host, 'Edit');
    await nextTick();

    host
      .querySelector('[aria-label="Add Interval"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(host.querySelector('.interval-editor')).not.toBeNull();

    host
      .querySelector('[aria-label="Add Interval"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(host.querySelector('.interval-editor')).toBeNull();
  });

  it('keeps the exercise expanded while the interval runner is running', async () => {
    // Switch-lock now hangs off `intervalRunnerState.running` rather
    // than `activeExerciseId`. Plain expansion alone doesn't block
    // collapse any more — only an active interval run does.
    const host = await mountPracticePage();
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
        title: 'Warmup',
        bpm: 100,
        timePlannedMinutes: null,
        intervalAuto: true,
        notes: null,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        linkedTabId: null,
        linkedAudioId: null,
      },
    ];
    await nextTick();

    clickByText(host, 'Session');
    await nextTick();
    clickByText(host, 'Warmup');
    await nextTick();

    // Flip the interval runner on via setupState so the lock applies.
    const app = (
      host as unknown as {
        __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
      }
    ).__vue_app__;
    const runnerState = app?._instance?.setupState?.intervalRunnerState as
      | { running: boolean; exerciseId: string | null }
      | undefined;
    if (runnerState) {
      runnerState.running = true;
      runnerState.exerciseId = 'ex-1';
    }
    await nextTick();

    const toggleButton = host.querySelector<HTMLButtonElement>(
      'button.exercise-toggle',
    );
    toggleButton?.click();
    await nextTick();

    const body = host.querySelector('.exercise-body');
    expect(body).toBeTruthy();
  });

  it('keeps the plan expanded while the interval runner is running', async () => {
    const host = await mountPracticePage();
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
        title: 'Warmup',
        bpm: 100,
        timePlannedMinutes: null,
        intervalAuto: true,
        notes: null,
        sortOrder: 0,
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
        linkedTabId: null,
        linkedAudioId: null,
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
    const runnerState = app?._instance?.setupState?.intervalRunnerState as
      | { running: boolean; exerciseId: string | null }
      | undefined;
    if (runnerState) {
      runnerState.running = true;
      runnerState.exerciseId = 'ex-1';
    }
    await nextTick();

    clickByText(host, 'Session');
    await nextTick();

    const exerciseRow = host.querySelector('.exercise-row');
    expect(exerciseRow).toBeTruthy();
  });

  it('keeps the active exercise bound while auto-advancing intervals', async () => {
    // Pre-v22 this test watched for a literal "Stop" button on the
    // exercise row. That button is gone — the bottom-bar timer is now
    // the user-facing control. Assert the practice session stays bound
    // to the same exercise while the interval runner is active instead.
    const host = await mountPracticePage();
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
    clickByText(host, 'Warmups');
    await nextTick();

    expect(store.activeExerciseId).toBe('ex-1');

    // Flip the interval runner on — this is the signal the bottom-bar
    // timer watches to know the user is mid-run.
    const app = (
      host as unknown as {
        __vue_app__?: { _instance?: { setupState?: Record<string, unknown> } };
      }
    ).__vue_app__;
    const runnerState = app?._instance?.setupState?.intervalRunnerState as
      | { running: boolean; exerciseId: string | null }
      | undefined;
    if (runnerState) {
      runnerState.running = true;
      runnerState.exerciseId = 'ex-1';
    }
    await nextTick();

    // After advancing intervals the exercise session must stay on ex-1
    // so time keeps accruing against the right exercise bucket.
    expect(store.activeExerciseId).toBe('ex-1');
    expect(runnerState?.running).toBe(true);
  });
});
