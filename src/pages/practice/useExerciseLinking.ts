import { ref, computed, watch, type Ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { useLibraryStore } from '../../stores/library';
import { usePlayerStore } from '../../stores/player';
import { useAppStore } from '../../stores/app';
import { useUiStore } from '../../stores/ui';
import { useSongStore } from '../../stores/song';
import { resolvePlaybackMode } from '../../services/exerciseIntervalAdvance';
import type { ExercisePlaybackMode } from '../../services/exerciseIntervalAdvance';
import { getExerciseLinkActions } from '../../domain/practiceUi';
import { filterLibraryItems } from '../../domain/libraryViewFilter';
import { libraryFileOps } from '../../services/libraryFileOps';
import { getLibrarySourcePath, stripFileExtension } from '../../domain/library';
import { openLibraryItemInPlayer } from '../../services/openPlayer';
import type { PracticeExercise } from '../../domain/practice';
import type { LibraryItem } from '../../domain/library';

export interface ExerciseLinkingOptions {
  isEditMode: (planId: string) => boolean;
  pendingExerciseId: Ref<string | null>;
  missingShareResolveExerciseId: Ref<string | null>;
  missingShareSuppressed: Ref<boolean>;
  resolveMissingShareTab: () => void;
  clearPendingPlayback: () => void;
}

export function useExerciseLinking(options: ExerciseLinkingOptions) {
  const practiceStore = usePracticeStore();
  const libraryStore = useLibraryStore();
  const playerStore = usePlayerStore();
  const appStore = useAppStore();
  const uiStore = useUiStore();
  const songStore = useSongStore();

  const linkDialogOpen = ref(false);
  const linkDialogItemId = ref<string | null>(null);
  const linkDialogKind = ref<'tab' | 'audio'>('tab');
  const linkSearch = ref('');

  const linkCandidates = computed(() =>
    filterLibraryItems(libraryStore.items, {
      query: linkSearch.value,
      alphaFilter: null,
      typeFilter: linkDialogKind.value,
    }).sort((a, b) => a.title.localeCompare(b.title)),
  );

  watch(linkDialogOpen, (open) => {
    if (!open && options.missingShareResolveExerciseId.value) {
      options.missingShareResolveExerciseId.value = null;
      options.missingShareSuppressed.value = false;
    }
  });

  function linkedTab(item: PracticeExercise): LibraryItem | null {
    const id = item.linkedTabId;
    if (!id) {
      return null;
    }
    return libraryStore.items.find((entry) => entry.id === id) ?? null;
  }

  function linkedAudio(item: PracticeExercise): LibraryItem | null {
    const id = item.linkedAudioId;
    if (!id) {
      return null;
    }
    return libraryStore.items.find((entry) => entry.id === id) ?? null;
  }

  function linkedLibraryItem(item: PracticeExercise): LibraryItem | null {
    if (item.preferredSource === 'audio' && linkedAudio(item)) {
      return linkedAudio(item);
    }
    return linkedTab(item) ?? linkedAudio(item);
  }

  function hasAnySources(item: PracticeExercise): boolean {
    return linkedTab(item) !== null || linkedAudio(item) !== null;
  }

  function hasBothSources(item: PracticeExercise): boolean {
    return linkedTab(item) !== null && linkedAudio(item) !== null;
  }

  function resolvedSourceLabel(
    item: PracticeExercise,
  ): 'tab' | 'audio' | 'both' {
    if (hasBothSources(item)) {
      if (item.preferredSource === 'audio') return 'audio';
      if (item.preferredSource === 'both') return 'both';
      return 'tab';
    }
    return linkedTab(item) ? 'tab' : 'audio';
  }

  function exercisePlaybackMode(item: PracticeExercise): ExercisePlaybackMode {
    return resolvePlaybackMode(
      item,
      linkedTab(item) !== null,
      linkedAudio(item) !== null,
    );
  }

  function exerciseLinkedItems(item: PracticeExercise): {
    tab: LibraryItem | null;
    audio: LibraryItem | null;
  } {
    return { tab: linkedTab(item), audio: linkedAudio(item) };
  }

  function applyLinkedBpm(exerciseId: string, libraryItemId: string): void {
    const exercise = practiceStore.exercises.find((ex) => ex.id === exerciseId);
    if (!exercise || exercise.bpm !== null) {
      return;
    }
    const tryApply = (): boolean => {
      if (playerStore.model.currentLibraryItemId !== libraryItemId) {
        return false;
      }
      const bpm = playerStore.model.baseBpm;
      if (!Number.isFinite(bpm ?? NaN)) {
        return false;
      }
      void practiceStore.updateExercise(exerciseId, {
        bpm: Math.round(bpm as number),
      });
      return true;
    };
    if (tryApply()) {
      return;
    }
    const stop = watch(
      () => [playerStore.model.currentLibraryItemId, playerStore.model.baseBpm],
      () => {
        if (tryApply()) {
          stop();
        }
      },
      { immediate: true },
    );
  }

  function exerciseLinkedItemId(exerciseId: string): string | null {
    const exercise = practiceStore.exercises.find((ex) => ex.id === exerciseId);
    if (!exercise) {
      return null;
    }
    return exercise.linkedTabId ?? exercise.linkedAudioId;
  }

  function linkActions(
    item: PracticeExercise,
    planId: string,
    kind: 'tab' | 'audio' = 'tab',
  ): {
    showAddNew: boolean;
    showLinkExisting: boolean;
    showRemove: boolean;
  } {
    const hasLink =
      kind === 'audio' ? Boolean(linkedAudio(item)) : Boolean(linkedTab(item));
    return getExerciseLinkActions(hasLink, options.isEditMode(planId));
  }

  async function handleOpenLinked(item: PracticeExercise): Promise<void> {
    const linked = linkedLibraryItem(item);
    if (!linked) {
      return;
    }
    if (isLinkedMissing(item)) {
      return;
    }
    if (libraryStore.fileOpsAvailable) {
      try {
        await libraryFileOps.stat(getLibrarySourcePath(linked.source));
      } catch (error) {
        const message = String(error ?? '');
        const reason = message.includes('no_permission')
          ? 'no_permission'
          : 'not_found';
        libraryStore.markMissing(linked.id, reason);
        return;
      }
    }
    options.pendingExerciseId.value = item.id;
    openLibraryItemInPlayer(
      linked,
      playerStore,
      uiStore,
      'practice',
      songStore,
      libraryStore,
    );
    applyLinkedBpm(item.id, linked.id);
  }

  async function handleAddNewTab(item: PracticeExercise): Promise<boolean> {
    const created = await libraryStore.addReferenceFromPicker();
    if (!created) {
      return false;
    }
    await practiceStore.linkLibraryItem(item.id, created.id);
    void libraryStore.refresh();
    return true;
  }

  async function handleAddNewTabFromDialog(): Promise<void> {
    const itemId = linkDialogItemId.value;
    if (!itemId) {
      return;
    }
    const item = practiceStore.exercises.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    const linked = await handleAddNewTab(item);
    if (!libraryStore.duplicateDialogOpen) {
      linkDialogOpen.value = false;
      linkDialogItemId.value = null;
    }
    if (linked && options.missingShareResolveExerciseId.value === item.id) {
      options.resolveMissingShareTab();
    }
  }

  async function handleAddNewAudioFromDialog(): Promise<void> {
    await libraryStore.addAudioFromFilePicker();
    void libraryStore.refresh();
  }

  function openLinkDialog(
    item: PracticeExercise,
    kind: 'tab' | 'audio' = 'tab',
  ): void {
    linkDialogItemId.value = item.id;
    linkDialogKind.value = kind;
    linkSearch.value = '';
    linkDialogOpen.value = true;
  }

  async function handleSelectLink(libraryItemId: string): Promise<void> {
    const itemId = linkDialogItemId.value;
    if (!itemId) {
      return;
    }
    await practiceStore.linkLibraryItem(
      itemId,
      libraryItemId,
      linkDialogKind.value,
    );
    linkDialogOpen.value = false;
    linkDialogItemId.value = null;
    if (linkDialogKind.value === 'tab') {
      applyLinkedBpm(itemId, libraryItemId);
    }
    if (options.missingShareResolveExerciseId.value === itemId) {
      options.resolveMissingShareTab();
    }
  }

  async function handleUnlink(
    item: PracticeExercise,
    kind?: 'tab' | 'audio',
  ): Promise<void> {
    await unlinkExerciseAndUnloadPlayer(item.id, kind);
  }

  function isLinkedMissing(item: PracticeExercise): boolean {
    const linked = linkedLibraryItem(item);
    return Boolean(linked && !linked.lastKnownOk);
  }

  function linkedFileName(item: PracticeExercise): string {
    const linked = linkedLibraryItem(item);
    return stripFileExtension(linked?.metadata.fileName ?? 'Unknown file');
  }

  function handleLocateLinked(item: PracticeExercise): void {
    const linked = linkedLibraryItem(item);
    if (!linked) {
      return;
    }
    void libraryStore.relinkViaPicker(linked.id);
  }

  function ensureTabMetronomeEnabled(): void {
    if (!playerStore.metronomeEnabled) {
      playerStore.toggleMetronome();
      return;
    }
    if (!appStore.metronomeEnabled) {
      appStore.setMetronomeEnabled(true);
    }
  }

  async function unlinkExerciseAndUnloadPlayer(
    exerciseId: string,
    kind?: 'tab' | 'audio',
  ): Promise<void> {
    const exercise = practiceStore.exercises.find((ex) => ex.id === exerciseId);
    const unlinkTabId = kind !== 'audio' ? exercise?.linkedTabId : undefined;
    const unlinkAudioId = kind !== 'tab' ? exercise?.linkedAudioId : undefined;

    await practiceStore.unlinkLibraryItem(exerciseId, kind);

    // Unload tab player if the unlinked tab is currently loaded
    if (unlinkTabId && playerStore.model.currentLibraryItemId === unlinkTabId) {
      playerStore.clearSelection();
      options.pendingExerciseId.value = null;
      options.clearPendingPlayback();
    }

    // Unload song if the unlinked audio is currently loaded
    if (unlinkAudioId && songStore.isLoaded) {
      await songStore.unload();
    }
  }

  return {
    // Refs
    linkDialogOpen,
    linkDialogItemId,
    linkDialogKind,
    linkSearch,

    // Computeds
    linkCandidates,

    // Functions
    linkedTab,
    linkedAudio,
    linkedLibraryItem,
    hasAnySources,
    hasBothSources,
    resolvedSourceLabel,
    exercisePlaybackMode,
    exerciseLinkedItems,
    applyLinkedBpm,
    exerciseLinkedItemId,
    linkActions,
    handleOpenLinked,
    handleAddNewTab,
    handleAddNewTabFromDialog,
    handleAddNewAudioFromDialog,
    openLinkDialog,
    handleSelectLink,
    handleUnlink,
    isLinkedMissing,
    linkedFileName,
    handleLocateLinked,
    ensureTabMetronomeEnabled,
    unlinkExerciseAndUnloadPlayer,
  };
}
