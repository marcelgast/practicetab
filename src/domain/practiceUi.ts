export type EditModeByPlan = Record<string, boolean>;

type TogglePlanResult = {
  expandedPlanId: string | null;
  editModeByPlan: EditModeByPlan;
};

export type LinkActions = {
  showAddNew: boolean;
  showLinkExisting: boolean;
  showRemove: boolean;
};

export function togglePlanExpansion(
  currentExpandedId: string | null,
  planId: string,
  editModeByPlan: EditModeByPlan,
): TogglePlanResult {
  const nextEditMode: EditModeByPlan = { ...editModeByPlan };

  if (currentExpandedId === planId) {
    nextEditMode[planId] = false;
    return { expandedPlanId: null, editModeByPlan: nextEditMode };
  }

  if (currentExpandedId) {
    nextEditMode[currentExpandedId] = false;
  }
  nextEditMode[planId] = false;
  return { expandedPlanId: planId, editModeByPlan: nextEditMode };
}

export function getExerciseLinkActions(
  hasLinkedTab: boolean,
  isEditMode: boolean,
): LinkActions {
  if (hasLinkedTab) {
    return {
      showAddNew: false,
      showLinkExisting: false,
      showRemove: isEditMode,
    };
  }
  return { showAddNew: true, showLinkExisting: true, showRemove: false };
}
