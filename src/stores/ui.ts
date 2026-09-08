import { defineStore } from 'pinia';
import { ref } from 'vue';
import { isSmallScreen } from '../services/responsive';

export const useUiStore = defineStore('ui', () => {
  const isPlayerPanelCollapsed = ref(false);
  const userHasToggledPlayerPanel = ref(false);
  const showVibratoDebug = ref(false);

  function initPlayerPanel(width?: number): void {
    if (userHasToggledPlayerPanel.value) {
      return;
    }
    isPlayerPanelCollapsed.value = isSmallScreen(width);
  }

  function openPlayerPanel(): void {
    isPlayerPanelCollapsed.value = false;
    userHasToggledPlayerPanel.value = true;
  }

  function closePlayerPanel(): void {
    isPlayerPanelCollapsed.value = true;
    userHasToggledPlayerPanel.value = true;
  }

  function togglePlayerPanel(): void {
    isPlayerPanelCollapsed.value = !isPlayerPanelCollapsed.value;
    userHasToggledPlayerPanel.value = true;
  }

  function toggleVibratoDebug(): void {
    showVibratoDebug.value = !showVibratoDebug.value;
  }

  return {
    isPlayerPanelCollapsed,
    userHasToggledPlayerPanel,
    showVibratoDebug,
    initPlayerPanel,
    openPlayerPanel,
    closePlayerPanel,
    togglePlayerPanel,
    toggleVibratoDebug,
  };
});
