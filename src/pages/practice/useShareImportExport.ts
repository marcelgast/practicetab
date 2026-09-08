import { ref, computed, watch, type Ref } from 'vue';
import { usePracticeStore } from '../../stores/practice';
import { useLibraryStore } from '../../stores/library';
import { useBeatmapStore } from '../../stores/beatmap';
import { shareFileOps } from '../../services/shareFileOps';
import {
  readPtShareFile,
  writePtShareFile,
} from '../../services/ptdata/shareFile';
import { exportShareDTO } from '../../services/ptdata/serializer';
import {
  importShareEnvelope,
  type ShareMissingTab,
} from '../../services/ptdata/shareImport';
import { practicePersistence } from '../../services/practicePersistence';
import type { PracticeExercise } from '../../domain/practice';
import type { PtDataEnvelopeV1, PtShareDataV1 } from '../../domain/ptdata';

export type ShareImportExportOptions = {
  openLinkDialog: (item: PracticeExercise, kind: 'tab' | 'audio') => void;
  handleAddNewTab: (item: PracticeExercise) => Promise<boolean>;
  linkDialogOpen: Ref<boolean>;
  missingShareResolveExerciseId?: Ref<string | null>;
  missingShareSuppressed?: Ref<boolean>;
};

export function useShareImportExport(options: ShareImportExportOptions) {
  const practiceStore = usePracticeStore();
  const libraryStore = useLibraryStore();
  const beatmapStore = useBeatmapStore();

  const shareDialogOpen = ref(false);
  const shareTarget = ref<{
    planId?: string;
    exerciseId?: string;
    title: string;
  } | null>(null);
  const shareIncludeTab = ref(false);
  const shareIncludeAudio = ref(false);
  const shareBusy = ref(false);
  const shareImportEnvelope = ref<PtDataEnvelopeV1 | null>(null);
  const sharePlanDialogOpen = ref(false);
  const sharePlanSelection = ref('new');
  const sharePlanTouched = ref(false);
  const missingShareTabs = ref<ShareMissingTab[]>([]);
  const missingShareSuppressed = options.missingShareSuppressed ?? ref(false);
  const missingShareResolveExerciseId =
    options.missingShareResolveExerciseId ?? ref<string | null>(null);

  const activeMissingShare = computed(() => missingShareTabs.value[0] ?? null);
  const missingShareDialogOpen = computed(
    () => Boolean(activeMissingShare.value) && !missingShareSuppressed.value,
  );

  watch(options.linkDialogOpen, (open) => {
    if (!open && missingShareResolveExerciseId.value) {
      missingShareResolveExerciseId.value = null;
      missingShareSuppressed.value = false;
    }
  });

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

  function isExerciseShare(
    envelope: PtDataEnvelopeV1,
  ): envelope is PtDataEnvelopeV1 & { data: PtShareDataV1 } {
    if (envelope.kind !== 'share') {
      return false;
    }
    const data = envelope.data as PtShareDataV1;
    return data.shareKind === 'exercise';
  }

  function openShareDialogForPlan(plan: { id: string; title: string }): void {
    shareTarget.value = { planId: plan.id, title: plan.title };
    shareIncludeTab.value = false;
    shareIncludeAudio.value = false;
    shareDialogOpen.value = true;
  }

  function openShareDialogForExercise(exercise: PracticeExercise): void {
    shareTarget.value = { exerciseId: exercise.id, title: exercise.title };
    shareIncludeTab.value = false;
    shareIncludeAudio.value = false;
    shareDialogOpen.value = true;
  }

  function closeShareDialog(): void {
    shareDialogOpen.value = false;
    shareTarget.value = null;
    shareIncludeTab.value = false;
    shareIncludeAudio.value = false;
  }

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
    missingShareTabs.value = result.missingTabs ?? [];
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

  async function handleShareExport(): Promise<void> {
    if (!shareTarget.value || shareBusy.value) {
      return;
    }
    shareBusy.value = true;
    try {
      const path = await shareFileOps.pickShareSavePath();
      if (!path) {
        return;
      }
      const envelope = await exportShareDTO({
        planId: shareTarget.value.planId,
        exerciseId: shareTarget.value.exerciseId,
        includeTabFile: shareIncludeTab.value,
        includeAudioFile: shareIncludeAudio.value,
      });
      await writePtShareFile(envelope, path);
      closeShareDialog();
    } finally {
      shareBusy.value = false;
    }
  }

  async function handleShareImport(): Promise<void> {
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
    missingShareTabs.value = result.missingTabs ?? [];
  }

  function resolveMissingShareTab(): void {
    missingShareTabs.value = missingShareTabs.value.slice(1);
    missingShareResolveExerciseId.value = null;
    missingShareSuppressed.value = false;
  }

  function handleMissingChooseFromLibrary(): void {
    const missing = activeMissingShare.value;
    if (!missing) {
      return;
    }
    const exercise = practiceStore.exercises.find(
      (entry) => entry.id === missing.exerciseId,
    );
    if (!exercise) {
      resolveMissingShareTab();
      return;
    }
    missingShareResolveExerciseId.value = missing.exerciseId;
    missingShareSuppressed.value = true;
    options.openLinkDialog(exercise, 'tab');
  }

  async function handleMissingLocateOnDisk(): Promise<void> {
    const missing = activeMissingShare.value;
    if (!missing) {
      return;
    }
    const exercise = practiceStore.exercises.find(
      (entry) => entry.id === missing.exerciseId,
    );
    if (!exercise) {
      resolveMissingShareTab();
      return;
    }
    const linked = await options.handleAddNewTab(exercise);
    if (linked) {
      resolveMissingShareTab();
    }
  }

  function handleMissingShareDialogOpen(next: boolean): void {
    if (!next) {
      missingShareSuppressed.value = true;
    }
  }

  return {
    // Refs
    shareDialogOpen,
    shareTarget,
    shareIncludeTab,
    shareIncludeAudio,
    shareBusy,
    shareImportEnvelope,
    sharePlanDialogOpen,
    sharePlanSelection,
    sharePlanTouched,
    missingShareTabs,
    missingShareSuppressed,
    missingShareResolveExerciseId,

    // Computeds
    activeMissingShare,
    missingShareDialogOpen,
    sharePlanOptions,
    sharePlanDisplay,

    // Functions
    isExerciseShare,
    openShareDialogForPlan,
    openShareDialogForExercise,
    closeShareDialog,
    openSharePlanDialog,
    closeSharePlanDialog,
    importShareToPlan,
    confirmSharePlanSelection,
    handleShareImportToNewPlan,
    handleShareExport,
    handleShareImport,
    resolveMissingShareTab,
    handleMissingChooseFromLibrary,
    handleMissingLocateOnDisk,
    handleMissingShareDialogOpen,
  };
}
