import { computed, ref, watch } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { useLibraryStore } from '../../stores/library';
import { useBeatmapStore } from '../../stores/beatmap';
import { shareFileOps } from '../../services/shareFileOps';
import { readPtShareFile } from '../../services/ptdata/shareFile';
import {
  importShareEnvelope,
  type ShareMissingTab,
} from '../../services/ptdata/shareImport';
import type { PtDataEnvelopeV1, PtShareDataV1 } from '../../domain/ptdata';
import { filterLibraryItems } from '../../domain/libraryViewFilter';
import { practicePersistence } from '../../services/practicePersistence';

export function useShareImport() {
  const practiceStore = usePracticeStore();
  const libraryStore = useLibraryStore();
  const beatmapStore = useBeatmapStore();

  const shareImportState = ref<'idle' | 'importing'>('idle');
  const shareImportEnvelope = ref<PtDataEnvelopeV1 | null>(null);
  const sharePlanDialogOpen = ref(false);
  const sharePlanSelection = ref('new');
  const sharePlanTouched = ref(false);
  const shareMissingTabs = ref<ShareMissingTab[]>([]);
  const shareMissingSuppressed = ref(false);
  const shareLinkDialogOpen = ref(false);
  const shareLinkSearch = ref('');
  const shareLinkResolveExerciseId = ref<string | null>(null);

  function isExerciseShare(
    envelope: PtDataEnvelopeV1,
  ): envelope is PtDataEnvelopeV1 & { data: PtShareDataV1 } {
    if (envelope.kind !== 'share') {
      return false;
    }
    const data = envelope.data as PtShareDataV1;
    return data.shareKind === 'exercise';
  }

  const sharePlanOptions = computed(() =>
    practiceStore.plans.map((plan) => ({
      value: plan.id,
      label: plan.title,
    })),
  );
  const sharePlanDisplay = computed(() => {
    if (!sharePlanTouched.value) {
      return 'Choose Plan';
    }
    const selected = sharePlanOptions.value.find(
      (option) => option.value === sharePlanSelection.value,
    );
    return selected?.label ?? 'Choose Plan';
  });
  const shareLinkCandidates = computed(() =>
    filterLibraryItems(libraryStore.items, {
      query: shareLinkSearch.value,
      alphaFilter: null,
    }).sort((a, b) => a.title.localeCompare(b.title)),
  );
  const activeShareMissing = computed(() => shareMissingTabs.value[0] ?? null);
  const shareMissingDialogOpen = computed(
    () => Boolean(activeShareMissing.value) && !shareMissingSuppressed.value,
  );

  watch(shareLinkDialogOpen, (open) => {
    if (!open && shareLinkResolveExerciseId.value) {
      shareLinkResolveExerciseId.value = null;
      shareMissingSuppressed.value = false;
    }
  });

  function openSharePlanDialog(envelope: PtDataEnvelopeV1): void {
    shareImportEnvelope.value = envelope;
    sharePlanSelection.value = practiceStore.plans[0]?.id ?? '';
    sharePlanTouched.value = false;
    sharePlanDialogOpen.value = true;
  }

  function closeSharePlanDialog(): void {
    sharePlanDialogOpen.value = false;
    shareImportEnvelope.value = null;
  }

  function handleShareMissingDialogOpen(next: boolean): void {
    if (!next) {
      shareMissingSuppressed.value = true;
    }
  }

  function resolveShareMissingTab(): void {
    shareMissingTabs.value = shareMissingTabs.value.slice(1);
    shareLinkResolveExerciseId.value = null;
    shareMissingSuppressed.value = false;
  }

  function openShareLinkDialog(exerciseId: string): void {
    shareLinkResolveExerciseId.value = exerciseId;
    shareLinkSearch.value = '';
    shareLinkDialogOpen.value = true;
  }

  async function handleShareSelectLink(libraryItemId: string): Promise<void> {
    const exerciseId = shareLinkResolveExerciseId.value;
    if (!exerciseId) {
      return;
    }
    await practiceStore.linkLibraryItem(exerciseId, libraryItemId);
    shareLinkDialogOpen.value = false;
    resolveShareMissingTab();
  }

  async function handleShareLocateOnDisk(): Promise<void> {
    const missing = activeShareMissing.value;
    if (!missing) {
      return;
    }
    const created = await libraryStore.addReferenceFromPicker();
    if (!created) {
      return;
    }
    await practiceStore.linkLibraryItem(missing.exerciseId, created.id);
    resolveShareMissingTab();
  }

  function handleShareChooseFromLibrary(): void {
    const missing = activeShareMissing.value;
    if (!missing) {
      return;
    }
    shareMissingSuppressed.value = true;
    openShareLinkDialog(missing.exerciseId);
  }

  async function importShareToPlan(planId: string): Promise<void> {
    if (!shareImportEnvelope.value) {
      return;
    }
    const envelope = shareImportEnvelope.value;
    const data = envelope.data as PtShareDataV1;
    const sourcePlanId = data.plans[0]?.id;
    if (!sourcePlanId) {
      closeSharePlanDialog();
      return;
    }
    closeSharePlanDialog();
    const result = await importShareEnvelope(envelope, {
      planOverrides: { [sourcePlanId]: planId },
    });
    if (result.status === 'cancelled') {
      return;
    }
    beatmapStore.refresh();
    await libraryStore.refresh();
    await practiceStore.init();
    shareMissingTabs.value = result.missingTabs ?? [];
  }

  async function confirmSharePlanSelection(): Promise<void> {
    if (!sharePlanTouched.value) {
      await handleShareImportToNewPlan();
      return;
    }
    const targetPlanId = sharePlanSelection.value;
    if (!targetPlanId) {
      await handleShareImportToNewPlan();
      return;
    }
    await importShareToPlan(targetPlanId);
  }

  async function handleShareImportToNewPlan(): Promise<void> {
    const created = await practicePersistence.createPracticePlan(
      'Import',
      false,
    );
    await importShareToPlan(created.id);
  }

  async function handleShareImport(): Promise<void> {
    if (shareImportState.value === 'importing') {
      return;
    }
    shareImportState.value = 'importing';
    try {
      const path = await shareFileOps.pickShareFile();
      if (!path) {
        return;
      }
      const envelope = await readPtShareFile(path);
      if (isExerciseShare(envelope)) {
        openSharePlanDialog(envelope);
        return;
      }
      const result = await importShareEnvelope(envelope);
      if (result.status === 'cancelled') {
        return;
      }
      beatmapStore.refresh();
      await libraryStore.refresh();
      await practiceStore.init();
      shareMissingTabs.value = result.missingTabs ?? [];
    } finally {
      shareImportState.value = 'idle';
    }
  }

  return {
    shareImportState,
    shareImportEnvelope,
    sharePlanDialogOpen,
    sharePlanSelection,
    sharePlanTouched,
    shareMissingTabs,
    shareMissingSuppressed,
    shareLinkDialogOpen,
    shareLinkSearch,
    shareLinkResolveExerciseId,
    isExerciseShare,
    sharePlanOptions,
    sharePlanDisplay,
    shareLinkCandidates,
    activeShareMissing,
    shareMissingDialogOpen,
    openSharePlanDialog,
    closeSharePlanDialog,
    handleShareMissingDialogOpen,
    resolveShareMissingTab,
    openShareLinkDialog,
    handleShareSelectLink,
    handleShareLocateOnDisk,
    handleShareChooseFromLibrary,
    importShareToPlan,
    confirmSharePlanSelection,
    handleShareImportToNewPlan,
    handleShareImport,
  };
}
