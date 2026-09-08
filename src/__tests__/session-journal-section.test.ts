// @vitest-environment happy-dom
/**
 * SessionJournalSection (PR 4.3) — renders the master list,
 * selects on click, delete path asks for confirm before clearing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import type { PracticeSession } from '../domain/practice';

const mocks = vi.hoisted(() => ({
  listSessionsWithJournal: vi.fn(),
  clearSessionJournal: vi.fn(),
}));

vi.mock('../services/practicePersistence', () => ({
  practicePersistence: {
    listSessionsWithJournal: mocks.listSessionsWithJournal,
    clearSessionJournal: mocks.clearSessionJournal,
    updateSessionGoal: vi.fn(),
    updateSessionReview: vi.fn(),
    listSessions: vi.fn(() => Promise.resolve([])),
    endActiveSession: vi.fn(() => Promise.resolve()),
    startSessionIfNeeded: vi.fn(() =>
      Promise.resolve({
        id: 'active',
        sessionDate: '2026-04-23',
        startedAt: '2026-04-23T10:00:00Z',
        endedAt: null,
        totalTimeSpentSeconds: 0,
        totalPlaybackSeconds: 0,
        createdAt: '2026-04-23T10:00:00Z',
      }),
    ),
  },
}));

const listSessionsWithJournal = mocks.listSessionsWithJournal;
const clearSessionJournal = mocks.clearSessionJournal;

// The aggregates sub-component mounts a Chart.js canvas which
// happy-dom can't back. We exercise its own behaviour in
// `session-journal-aggregates.test.ts`; here we only care about the
// master-detail list, so swap it for a marker stub.
vi.mock('../components/stats/SessionJournalAggregates.vue', () => ({
  default: {
    name: 'SessionJournalAggregatesStub',
    template: '<div data-testid="journal-aggregates-stub" />',
  },
}));

import SessionJournalSection from '../components/stats/SessionJournalSection.vue';

function baseSession(overrides: Partial<PracticeSession>): PracticeSession {
  return {
    id: 's-1',
    sessionDate: '2026-04-23',
    startedAt: '2026-04-23T10:00:00Z',
    endedAt: null,
    totalTimeSpentSeconds: 0,
    totalPlaybackSeconds: 0,
    createdAt: '2026-04-23T10:00:00Z',
    ...overrides,
  };
}

function mountSection(): HTMLElement {
  const Host = defineComponent({
    components: { SessionJournalSection },
    template: '<SessionJournalSection />',
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Host).use(createPinia()).mount(host);
  return host;
}

describe('SessionJournalSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listSessionsWithJournal.mockReset();
    clearSessionJournal.mockReset();
    clearSessionJournal.mockResolvedValue();
    document.body.innerHTML = '';
  });

  it('shows the empty state when there are no journal entries', async () => {
    listSessionsWithJournal.mockResolvedValue([]);
    const host = mountSection();
    await nextTick();
    await nextTick();
    expect(host.textContent ?? '').toContain('No journal entries yet');
  });

  it('renders the list and opens the detail on row click', async () => {
    listSessionsWithJournal.mockResolvedValue([
      baseSession({
        id: 's-1',
        sessionDate: '2026-04-22',
        goalText: 'warm up cleanly',
        reviewText: 'good',
        goalPercent: 90,
        goalReached: false,
      }),
      baseSession({
        id: 's-2',
        sessionDate: '2026-04-23',
        goalText: 'solo licks',
        goalPercent: 0,
      }),
    ]);
    const host = mountSection();
    await nextTick();
    await nextTick();

    const rows = host.querySelectorAll<HTMLButtonElement>('.journal-list-row');
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent ?? '').toContain('warm up cleanly');

    rows[0]!.click();
    await nextTick();
    expect(host.textContent ?? '').toContain('good');
    expect(host.textContent ?? '').toContain('90 %');
    expect(host.textContent ?? '').toContain('Goal not reached');
  });

  it('guards delete behind a confirm step and clears the journal on confirm', async () => {
    listSessionsWithJournal.mockResolvedValueOnce([
      baseSession({ id: 's-1', goalText: 'warm up' }),
    ]);
    const host = mountSection();
    await nextTick();
    await nextTick();

    host.querySelector<HTMLButtonElement>('.journal-list-row')!.click();
    await nextTick();

    const deleteButton = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Delete journal',
    )!;
    deleteButton.click();
    await nextTick();
    // Confirm prompt appears; underlying API should not have been called yet.
    expect(clearSessionJournal).not.toHaveBeenCalled();
    expect(host.textContent ?? '').toContain('Remove this entry?');

    // Second list load after delete → empty (row should vanish).
    listSessionsWithJournal.mockResolvedValueOnce([]);
    const confirmButton = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Delete',
    )!;
    confirmButton.click();
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();

    expect(clearSessionJournal).toHaveBeenCalledWith('s-1');
    expect(host.textContent ?? '').toContain('No journal entries yet');
  });
});
