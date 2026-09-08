// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file -- test harness defines a throwaway host component alongside the imported .vue module */
/**
 * SessionJournalAggregates (PR 4.3 follow-up) — renders the three
 * headline blocks above the journal list. The chart internals rely
 * on Chart.js which wants a real canvas — we smoke-test the markup
 * structure and the headline numbers here; the pure aggregation
 * logic is already covered by `journal-aggregates.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';

import type { PracticeSession } from '../domain/practice';

// Stub vue-chartjs / chart.js — happy-dom doesn't implement the
// canvas APIs Chart.js needs, and we don't need to assert on the
// chart pixels here, only on the surrounding markup.
vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'LineStub',
    props: ['data', 'options'],
    template: '<div class="chart-stub" />',
  },
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  LineElement: {},
  PointElement: {},
  Tooltip: {},
}));

import SessionJournalAggregates from '../components/stats/SessionJournalAggregates.vue';

function baseSession(
  overrides: Partial<PracticeSession> = {},
): PracticeSession {
  return {
    id: 's',
    sessionDate: '2026-04-20',
    startedAt: '2026-04-20T10:00:00Z',
    endedAt: null,
    totalTimeSpentSeconds: 0,
    totalPlaybackSeconds: 0,
    createdAt: '2026-04-20T10:00:00Z',
    ...overrides,
  };
}

function mount(sessions: PracticeSession[]): HTMLElement {
  const Host = defineComponent({
    components: { SessionJournalAggregates },
    props: {
      sessions: {
        type: Array,
        required: true,
      },
    },
    template: '<SessionJournalAggregates :sessions="sessions" />',
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Host, { sessions }).mount(host);
  return host;
}

describe('SessionJournalAggregates', () => {
  it('renders the three headline cards with the computed numbers', async () => {
    const sessions = [
      baseSession({
        id: 'a',
        sessionDate: '2026-04-20',
        goalReached: true,
        goalPercent: 100,
      }),
      baseSession({
        id: 'b',
        sessionDate: '2026-04-21',
        goalReached: false,
        goalPercent: 60,
      }),
      baseSession({
        id: 'c',
        sessionDate: '2026-04-22',
        goalText: 'warm up',
      }),
    ];
    const host = mount(sessions);
    await nextTick();

    const text = host.textContent ?? '';
    // goal-reached 1/2 = 50%, avgPercent = 80, totalWithJournal = 3.
    expect(text).toContain('50 %');
    expect(text).toContain('80 %');
    expect(text).toContain('Total journaled');
    // The three session counts should show up; 3 comes from
    // totalWithJournal, 2 from totalWithGoalAnswered.
    expect(text).toContain('3');
  });

  it('hides the weekday breakdown until enough data points exist', async () => {
    const sessions = [
      baseSession({
        id: 'a',
        sessionDate: '2026-04-20',
        goalReached: true,
      }),
      baseSession({
        id: 'b',
        sessionDate: '2026-04-21',
        goalReached: false,
      }),
    ];
    const host = mount(sessions);
    await nextTick();

    const text = host.textContent ?? '';
    expect(text).toContain('More sessions with a reviewed goal needed');
    expect(host.querySelector('.journal-weekday-grid')).toBeNull();
  });

  it('renders the weekday grid once enough data has accumulated', async () => {
    // Seven answered sessions on distinct weekdays — above threshold.
    const sessions = [
      baseSession({ id: '1', sessionDate: '2026-04-19', goalReached: true }),
      baseSession({ id: '2', sessionDate: '2026-04-20', goalReached: true }),
      baseSession({ id: '3', sessionDate: '2026-04-21', goalReached: false }),
      baseSession({ id: '4', sessionDate: '2026-04-22', goalReached: true }),
      baseSession({ id: '5', sessionDate: '2026-04-23', goalReached: true }),
      baseSession({ id: '6', sessionDate: '2026-04-24', goalReached: true }),
      baseSession({ id: '7', sessionDate: '2026-04-25', goalReached: true }),
    ];
    const host = mount(sessions);
    await nextTick();

    const grid = host.querySelector('.journal-weekday-grid');
    expect(grid).not.toBeNull();
    // Seven cells — one per weekday.
    expect(host.querySelectorAll('.journal-weekday-cell').length).toBe(7);
  });

  it('shows an empty-state for the trend chart when no session has a percent', async () => {
    const sessions = [
      baseSession({
        id: 'a',
        sessionDate: '2026-04-20',
        goalText: 'warm up',
      }),
    ];
    const host = mount(sessions);
    await nextTick();

    const text = host.textContent ?? '';
    expect(text).toContain('No sessions have recorded a completion percent');
    // Chart stub should not render in the empty branch.
    expect(host.querySelector('.chart-stub')).toBeNull();
  });
});
