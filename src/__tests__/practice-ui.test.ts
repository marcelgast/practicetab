import { describe, expect, it } from 'vitest';
import {
  getExerciseLinkActions,
  togglePlanExpansion,
} from '../domain/practiceUi';

describe('togglePlanExpansion', () => {
  it('expands plan and disables edit mode', () => {
    const result = togglePlanExpansion(null, 'plan-1', { 'plan-1': true });
    expect(result.expandedPlanId).toBe('plan-1');
    expect(result.editModeByPlan['plan-1']).toBe(false);
  });

  it('collapses plan and clears edit mode', () => {
    const result = togglePlanExpansion('plan-1', 'plan-1', { 'plan-1': true });
    expect(result.expandedPlanId).toBeNull();
    expect(result.editModeByPlan['plan-1']).toBe(false);
  });
});

describe('getExerciseLinkActions', () => {
  it('shows add and link when no tab is linked', () => {
    const actions = getExerciseLinkActions(false, false);
    expect(actions).toEqual({
      showAddNew: true,
      showLinkExisting: true,
      showRemove: false,
    });
  });

  it('shows remove only when linked and edit mode is on', () => {
    const actions = getExerciseLinkActions(true, true);
    expect(actions).toEqual({
      showAddNew: false,
      showLinkExisting: false,
      showRemove: true,
    });
  });

  it('hides remove when linked but edit mode is off', () => {
    const actions = getExerciseLinkActions(true, false);
    expect(actions).toEqual({
      showAddNew: false,
      showLinkExisting: false,
      showRemove: false,
    });
  });
});

describe('togglePlanExpansion cross-plan behavior', () => {
  it('clears edit mode on previously expanded plan', () => {
    const result = togglePlanExpansion('plan-1', 'plan-2', {
      'plan-1': true,
      'plan-2': true,
    });
    expect(result.expandedPlanId).toBe('plan-2');
    expect(result.editModeByPlan['plan-1']).toBe(false);
    expect(result.editModeByPlan['plan-2']).toBe(false);
  });
});
