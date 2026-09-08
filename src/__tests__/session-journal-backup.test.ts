// @vitest-environment happy-dom
/**
 * Backup round-trip for the Session Journal (PR 4.3) — both the
 * four session-level columns AND the `journalingEnabled` settings
 * flag need to survive export → re-import.
 */
import { describe, expect, it, vi } from 'vitest';
import { mapSession } from '../services/ptdata/serializerMappers';
import type { PracticeSession } from '../domain/practice';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

function baseSession(
  overrides: Partial<PracticeSession> = {},
): PracticeSession {
  return {
    id: 's-1',
    sessionDate: '2026-04-23',
    startedAt: '2026-04-23T10:00:00Z',
    endedAt: null,
    totalTimeSpentSeconds: 600,
    totalPlaybackSeconds: 0,
    createdAt: '2026-04-23T10:00:00Z',
    ...overrides,
  };
}

describe('session journal backup round-trip', () => {
  it('carries all four journal fields through the export mapper', () => {
    const dto = mapSession(
      baseSession({
        goalText: 'master the bridge',
        reviewText: 'nailed it',
        goalPercent: 120,
        goalReached: true,
      }),
    );
    expect(dto.goalText).toBe('master the bridge');
    expect(dto.reviewText).toBe('nailed it');
    expect(dto.goalPercent).toBe(120);
    expect(dto.goalReached).toBe(true);
  });

  it('omits all four journal keys when the source session has none', () => {
    const dto = mapSession(baseSession());
    expect('goalText' in dto).toBe(false);
    expect('reviewText' in dto).toBe(false);
    expect('goalPercent' in dto).toBe(false);
    expect('goalReached' in dto).toBe(false);
  });

  it('emits boolean false explicitly (distinct from NULL / absent)', () => {
    // Goal not reached is different from "not answered yet" — the
    // DTO has to carry `false` through rather than dropping the key.
    const dto = mapSession(baseSession({ goalReached: false }));
    expect(dto.goalReached).toBe(false);
  });

  it('preserves percent 0 (not just non-zero values)', () => {
    // Explicit 0 means "nothing landed" — must round-trip as 0.
    const dto = mapSession(baseSession({ goalPercent: 0 }));
    expect(dto.goalPercent).toBe(0);
  });

  it('exports journalingEnabled through loadSettings (both true and false survive)', async () => {
    const { loadSettings } =
      await import('../services/ptdata/serializerMappers');
    localStorage.clear();

    // Default-on for stored blobs that predate the key.
    localStorage.setItem('practicetab.settings', JSON.stringify({ tuning: 0 }));
    expect(loadSettings().journalingEnabled).toBe(true);

    // Explicit false must round-trip — a user who opted out
    // shouldn't get silently re-opted-in by backup export.
    localStorage.setItem(
      'practicetab.settings',
      JSON.stringify({ tuning: 0, journalingEnabled: false }),
    );
    expect(loadSettings().journalingEnabled).toBe(false);

    // Explicit true is identity.
    localStorage.setItem(
      'practicetab.settings',
      JSON.stringify({ tuning: 0, journalingEnabled: true }),
    );
    expect(loadSettings().journalingEnabled).toBe(true);
  });

  it('hydrates journalingEnabled to true on pre-PR backup import', async () => {
    // Users upgrading from a pre-PR-4.3 build have no persisted
    // setting; after reload the appStore should expose the feature
    // as ON rather than silently opting users out.
    const { createPinia, setActivePinia } = await import('pinia');
    setActivePinia(createPinia());
    localStorage.clear();
    localStorage.setItem(
      'practicetab.settings',
      JSON.stringify({ darkMode: true, tuning: 0 }),
    );
    const { useAppStore } = await import('../stores/app');
    const store = useAppStore();
    expect(store.journalingEnabled).toBe(true);
  });
});
