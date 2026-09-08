// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUiStore } from '../stores/ui';

describe('ui store', () => {
  it('opens, closes, and toggles the player panel', () => {
    setActivePinia(createPinia());
    const store = useUiStore();

    expect(store.isPlayerPanelCollapsed).toBe(false);
    store.closePlayerPanel();
    expect(store.isPlayerPanelCollapsed).toBe(true);
    store.openPlayerPanel();
    expect(store.isPlayerPanelCollapsed).toBe(false);
    store.togglePlayerPanel();
    expect(store.isPlayerPanelCollapsed).toBe(true);
    expect(store.userHasToggledPlayerPanel).toBe(true);
  });

  it('initializes collapsed state based on screen width', () => {
    setActivePinia(createPinia());
    const store = useUiStore();

    store.initPlayerPanel(400);
    expect(store.isPlayerPanelCollapsed).toBe(true);

    store.togglePlayerPanel();
    store.initPlayerPanel(1200);
    expect(store.isPlayerPanelCollapsed).toBe(false);
    expect(store.userHasToggledPlayerPanel).toBe(true);

    setActivePinia(createPinia());
    const freshStore = useUiStore();
    freshStore.initPlayerPanel(1200);
    expect(freshStore.isPlayerPanelCollapsed).toBe(false);
  });
});
