import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useBeatmapStore } from '../../stores/beatmap';
import type { GpBeatmap } from '../../services/gpBeatmapBuilder';
import {
  type BeatmapTimeEventDraft,
  type BeatmapLoopEventDraft,
  clampInt,
  normalizeBeatUnit,
  canSaveNewTimeDraft,
  canSaveNewLoopDraft,
} from './beatmapDraftUtils';

type UseBeatmapDrafts = {
  beatmapEndBarDraft: Ref<number>;
  beatmapTimeDrafts: Ref<BeatmapTimeEventDraft[]>;
  beatmapLoopDrafts: Ref<BeatmapLoopEventDraft[]>;
  confirmDeleteKey: Ref<string | null>;
  saveConfirmed: Ref<boolean>;
  confirmDeleteBeatmap: Ref<boolean>;
  initialBpm: Ref<number>;
  initialTimeSigTop: Ref<number>;
  initialTimeSigBottom: Ref<number>;
  initialEndBar: Ref<number>;
  hasBeatmap: ComputedRef<boolean>;
  syncDraftsFromEntry: () => void;
  saveDrafts: () => void;
  createInitialBeatmap: (audioDurationMs: number) => void;
  deleteBeatmap: () => void;
  addTimeDraft: () => void;
  confirmDeleteTime: (index: number) => void;
  saveNewTime: (index: number) => void;
  addLoopDraft: () => void;
  confirmDeleteLoop: (index: number) => void;
  saveNewLoop: (index: number) => void;
  deleteKey: (kind: 'time' | 'loop', index: number) => string;
  closeDeleteConfirm: () => void;
  toggleDelete: (kind: 'time' | 'loop', index: number) => void;
};

export function useBeatmapDrafts(
  itemId: () => string | null,
  beatmapEntry: ComputedRef<
    ReturnType<ReturnType<typeof useBeatmapStore>['getEntry']>
  >,
): UseBeatmapDrafts {
  const beatmapStore = useBeatmapStore();

  const beatmapEndBarDraft = ref(1);
  const beatmapTimeDrafts = ref<BeatmapTimeEventDraft[]>([]);
  const beatmapLoopDrafts = ref<BeatmapLoopEventDraft[]>([]);
  const confirmDeleteKey = ref<string | null>(null);
  const draftIdCounter = ref(0);
  const saveConfirmed = ref(false);
  const confirmDeleteBeatmap = ref(false);

  const initialBpm = ref(120);
  const initialTimeSigTop = ref(4);
  const initialTimeSigBottom = ref(4);
  const initialEndBar = ref(1);

  const hasBeatmap = computed(() => {
    const entry = beatmapEntry.value;
    if (!entry || entry.status !== 'ready' || !entry.beatmap) {
      return false;
    }
    return entry.beatmap.timeEvents.length > 0;
  });

  function nextDraftId(prefix: 'time' | 'loop'): string {
    draftIdCounter.value += 1;
    return `${prefix}-${draftIdCounter.value}`;
  }

  function syncDraftsFromEntry(): void {
    const beatmap = beatmapEntry.value?.beatmap;
    if (!beatmap) {
      beatmapEndBarDraft.value = 1;
      beatmapTimeDrafts.value = [];
      beatmapLoopDrafts.value = [];
      return;
    }
    beatmapEndBarDraft.value = Math.max(1, Math.round(beatmap.endBar));
    beatmapTimeDrafts.value = beatmap.timeEvents.map((event) => ({
      ...event,
      _draftId: nextDraftId('time'),
      _isNew: false,
    }));
    beatmapLoopDrafts.value = beatmap.loopEvents.map((event) => ({
      ...event,
      _draftId: nextDraftId('loop'),
      _isNew: false,
    }));
  }

  function showSaveConfirm(): void {
    saveConfirmed.value = true;
    setTimeout(() => {
      saveConfirmed.value = false;
    }, 2000);
  }

  function calcEndBarFromDuration(
    bpm: number,
    timeSigTop: number,
    durationMs: number,
  ): number {
    if (bpm <= 0 || timeSigTop <= 0 || durationMs <= 0) {
      return 1;
    }
    const msPerBar = (60_000 / bpm) * timeSigTop;
    return Math.max(1, Math.ceil(durationMs / msPerBar));
  }

  function createInitialBeatmap(audioDurationMs: number): void {
    const id = itemId();
    if (!id) return;
    const bpm = clampInt(initialBpm.value, 20, 400);
    const top = clampInt(initialTimeSigTop.value, 1, 32);
    const endBar =
      audioDurationMs > 0
        ? calcEndBarFromDuration(bpm, top, audioDurationMs)
        : clampInt(initialEndBar.value, 1, 100000);
    const beatmap: GpBeatmap = {
      startBpm: bpm,
      startTimeSigTop: top,
      startTimeSigBottom: normalizeBeatUnit(initialTimeSigBottom.value),
      endBar,
      timeEvents: [
        {
          barIndex: 1,
          bpm: clampInt(initialBpm.value, 20, 400),
          timeSigTop: clampInt(initialTimeSigTop.value, 1, 32),
          timeSigBottom: normalizeBeatUnit(initialTimeSigBottom.value),
        },
      ],
      loopEvents: [],
      playedBars: [],
    };
    beatmapStore.setManualBeatmap(id, beatmap);
    syncDraftsFromEntry();
    beatmapEndBarDraft.value = endBar;
    showSaveConfirm();
  }

  function saveDrafts(): void {
    const id = itemId();
    if (!id) return;
    const normalizedTime = beatmapTimeDrafts.value
      .map((e) => ({
        barIndex: clampInt(e.barIndex, 1, 100000),
        bpm: clampInt(e.bpm, 20, 400),
        timeSigTop: clampInt(e.timeSigTop, 1, 32),
        timeSigBottom: normalizeBeatUnit(e.timeSigBottom),
      }))
      .sort((a, b) => a.barIndex - b.barIndex);

    const normalizedLoop = beatmapLoopDrafts.value
      .map((e) => ({
        startBar: clampInt(e.startBar, 1, 100000),
        endBar: clampInt(e.endBar, 1, 100000),
        repeatCount: clampInt(e.repeatCount, 1, 100000),
      }))
      .filter((e) => e.startBar <= e.endBar)
      .sort((a, b) => a.startBar - b.startBar);

    const base = beatmapEntry.value?.beatmap;
    const beatmap: GpBeatmap = {
      startBpm: normalizedTime[0]?.bpm ?? base?.startBpm ?? 120,
      startTimeSigTop:
        normalizedTime[0]?.timeSigTop ?? base?.startTimeSigTop ?? 4,
      startTimeSigBottom:
        normalizedTime[0]?.timeSigBottom ?? base?.startTimeSigBottom ?? 4,
      endBar: clampInt(beatmapEndBarDraft.value, 1, 100000),
      timeEvents: normalizedTime,
      loopEvents: normalizedLoop,
      playedBars: [],
    };
    beatmapStore.setManualBeatmap(id, beatmap);
    syncDraftsFromEntry();
    showSaveConfirm();
  }

  function deleteKey(kind: 'time' | 'loop', index: number): string {
    return `${kind}:${index}`;
  }

  function closeDeleteConfirm(): void {
    confirmDeleteKey.value = null;
  }

  function toggleDelete(kind: 'time' | 'loop', index: number): void {
    const key = deleteKey(kind, index);
    confirmDeleteKey.value = confirmDeleteKey.value === key ? null : key;
  }

  function addTimeDraft(): void {
    closeDeleteConfirm();
    const last = beatmapTimeDrafts.value[beatmapTimeDrafts.value.length - 1];
    beatmapTimeDrafts.value = [
      ...beatmapTimeDrafts.value,
      {
        barIndex: last ? last.barIndex + 1 : 1,
        bpm: last?.bpm ?? 120,
        timeSigTop: last?.timeSigTop ?? 4,
        timeSigBottom: last?.timeSigBottom ?? 4,
        _draftId: nextDraftId('time'),
        _isNew: true,
      },
    ];
  }

  function confirmDeleteTime(index: number): void {
    const event = beatmapTimeDrafts.value[index];
    if (index === 0 && event && !event._isNew) return;
    closeDeleteConfirm();
    beatmapTimeDrafts.value = beatmapTimeDrafts.value.filter(
      (_, i) => i !== index,
    );
    saveDrafts();
  }

  function deleteBeatmap(): void {
    const id = itemId();
    if (!id) return;
    beatmapStore.deleteForItem(id);
    syncDraftsFromEntry();
  }

  function saveNewTime(index: number): void {
    const event = beatmapTimeDrafts.value[index];
    if (!event || !event._isNew || !canSaveNewTimeDraft(event)) return;
    beatmapTimeDrafts.value[index] = { ...event, _isNew: false };
    beatmapTimeDrafts.value = [...beatmapTimeDrafts.value].sort(
      (a, b) => a.barIndex - b.barIndex,
    );
    saveDrafts();
  }

  function addLoopDraft(): void {
    closeDeleteConfirm();
    beatmapLoopDrafts.value = [
      {
        startBar: 1,
        endBar: 1,
        repeatCount: 1,
        _draftId: nextDraftId('loop'),
        _isNew: true,
      },
      ...beatmapLoopDrafts.value,
    ];
  }

  function confirmDeleteLoop(index: number): void {
    closeDeleteConfirm();
    beatmapLoopDrafts.value = beatmapLoopDrafts.value.filter(
      (_, i) => i !== index,
    );
    saveDrafts();
  }

  function saveNewLoop(index: number): void {
    const event = beatmapLoopDrafts.value[index];
    if (!event || !event._isNew || !canSaveNewLoopDraft(event)) return;
    beatmapLoopDrafts.value[index] = { ...event, _isNew: false };
    beatmapLoopDrafts.value = [...beatmapLoopDrafts.value].sort(
      (a, b) => a.startBar - b.startBar,
    );
    saveDrafts();
  }

  return {
    beatmapEndBarDraft,
    beatmapTimeDrafts,
    beatmapLoopDrafts,
    confirmDeleteKey,
    saveConfirmed,
    confirmDeleteBeatmap,
    initialBpm,
    initialTimeSigTop,
    initialTimeSigBottom,
    initialEndBar,
    hasBeatmap,
    syncDraftsFromEntry,
    saveDrafts,
    createInitialBeatmap,
    deleteBeatmap,
    addTimeDraft,
    confirmDeleteTime,
    saveNewTime,
    addLoopDraft,
    confirmDeleteLoop,
    saveNewLoop,
    deleteKey,
    closeDeleteConfirm,
    toggleDelete,
  };
}
