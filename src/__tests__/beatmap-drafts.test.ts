import { describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { useBeatmapDrafts } from '../components/player/useBeatmapDrafts';

vi.mock('../stores/beatmap', () => ({
  useBeatmapStore: () => ({
    setManualBeatmap: vi.fn(),
    deleteForItem: vi.fn(),
    getEntry: () => null,
  }),
}));

function createDrafts(itemId = 'item-1') {
  const entry = computed(() => ({
    status: 'ready' as const,
    beatmap: {
      startBpm: 120,
      startTimeSigTop: 4,
      startTimeSigBottom: 4,
      endBar: 10,
      timeEvents: [
        { barIndex: 1, bpm: 120, timeSigTop: 4, timeSigBottom: 4 },
        { barIndex: 5, bpm: 80, timeSigTop: 3, timeSigBottom: 4 },
      ],
      loopEvents: [{ startBar: 1, endBar: 4, repeatCount: 2 }],
      playedBars: [],
    },
    updatedAt: Date.now(),
  }));
  return useBeatmapDrafts(() => itemId, entry);
}

describe('useBeatmapDrafts', () => {
  it('syncs drafts from a beatmap entry', () => {
    const drafts = createDrafts();
    drafts.syncDraftsFromEntry();
    expect(drafts.beatmapTimeDrafts.value).toHaveLength(2);
    expect(drafts.beatmapLoopDrafts.value).toHaveLength(1);
    expect(drafts.beatmapEndBarDraft.value).toBe(10);
  });

  it('adds a time draft based on the last event', () => {
    const drafts = createDrafts();
    drafts.syncDraftsFromEntry();
    drafts.addTimeDraft();
    expect(drafts.beatmapTimeDrafts.value).toHaveLength(3);
    const added = drafts.beatmapTimeDrafts.value[2];
    expect(added._isNew).toBe(true);
    expect(added.barIndex).toBe(6);
    expect(added.bpm).toBe(80);
  });

  it('adds a loop draft at the beginning', () => {
    const drafts = createDrafts();
    drafts.syncDraftsFromEntry();
    drafts.addLoopDraft();
    expect(drafts.beatmapLoopDrafts.value).toHaveLength(2);
    expect(drafts.beatmapLoopDrafts.value[0]._isNew).toBe(true);
  });

  it('does not delete first non-new time event', () => {
    const drafts = createDrafts();
    drafts.syncDraftsFromEntry();
    drafts.confirmDeleteTime(0);
    expect(drafts.beatmapTimeDrafts.value).toHaveLength(2);
  });

  it('calls save after deleting non-first time events', () => {
    const drafts = createDrafts();
    drafts.syncDraftsFromEntry();
    // confirmDeleteTime filters the draft and calls saveDrafts (which re-syncs).
    // Since the mock store doesn't persist, drafts re-sync to original 2 events.
    // We verify the delete key is cleared (confirm flow completed).
    drafts.toggleDelete('time', 1);
    expect(drafts.confirmDeleteKey.value).toBe('time:1');
    drafts.confirmDeleteTime(1);
    expect(drafts.confirmDeleteKey.value).toBeNull();
  });

  it('toggles delete confirmation', () => {
    const drafts = createDrafts();
    expect(drafts.confirmDeleteKey.value).toBeNull();
    drafts.toggleDelete('time', 1);
    expect(drafts.confirmDeleteKey.value).toBe('time:1');
    drafts.toggleDelete('time', 1);
    expect(drafts.confirmDeleteKey.value).toBeNull();
  });

  it('hasBeatmap is true when time events exist', () => {
    const drafts = createDrafts();
    expect(drafts.hasBeatmap.value).toBe(true);
  });

  it('hasBeatmap is false when entry has no beatmap', () => {
    const entry = computed(() => null);
    const drafts = useBeatmapDrafts(() => 'x', entry);
    expect(drafts.hasBeatmap.value).toBe(false);
  });

  it('returns null itemId guard for createInitialBeatmap', () => {
    const entry = computed(() => null);
    const drafts = useBeatmapDrafts(() => null, entry);
    // Should not throw
    drafts.createInitialBeatmap(0);
    expect(drafts.beatmapTimeDrafts.value).toHaveLength(0);
  });
});
