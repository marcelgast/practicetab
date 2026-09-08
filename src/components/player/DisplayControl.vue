<script setup lang="ts">
/**
 * "Display" dropdown in the Player top-bar. Houses per-tab view
 * preferences that aren't core transport controls — currently Staff
 * (standard notation toggle) and Scroll (horizontal one-liner
 * layout). Disabled when no tab is loaded so the menu doesn't open
 * on nothing.
 *
 * Pattern mirrors Volume: trigger button + absolute-positioned
 * overlay anchored below the button, with the overlay-mask click
 * behaviour handled in the parent (PlayerPanel.vue) via the shared
 * `overlay-lock` emit.
 */
import { computed, ref } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import { usePlayerStore } from '../../stores/player';

defineProps<{
  hasSelection: boolean;
  intervalModeActive: boolean;
}>();

const emit = defineEmits<{
  'update:overlay-lock': [];
}>();

const playerStore = usePlayerStore();

const isOpen = ref(false);

const showStandardNotation = computed(() => playerStore.showStandardNotation);
const horizontalLayout = computed(() => playerStore.horizontalLayout);

function toggle(): void {
  isOpen.value = !isOpen.value;
  emit('update:overlay-lock');
}

function close(): void {
  isOpen.value = false;
  emit('update:overlay-lock');
}

defineExpose({ isOpen, close });
</script>

<template>
  <div class="display-row">
    <AppTooltip
      :text="
        hasSelection
          ? 'Display settings — staff notation, scroll mode'
          : 'Load a tab to change display settings'
      "
    >
      <BaseButton
        class="display-trigger"
        variant="ghost"
        size="sm"
        type="button"
        data-guide="player.display"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
        :disabled="!hasSelection"
        @click="toggle"
      >
        Display
      </BaseButton>
    </AppTooltip>
    <div
      v-if="isOpen"
      class="track-overlay display-overlay"
    >
      <div class="display-menu-list">
        <AppTooltip
          text="Show the standard music notation staff alongside the tab"
        >
          <label class="display-toggle">
            <input
              class="display-toggle-input"
              type="checkbox"
              :checked="showStandardNotation"
              :disabled="intervalModeActive"
              @change="
                playerStore.setShowStandardNotation(
                  ($event.target as HTMLInputElement).checked,
                )
              "
            >
            <span
              class="display-toggle-slider"
              aria-hidden="true"
            />
            <span class="display-toggle-content">
              <span class="display-toggle-label">Staff</span>
              <span class="display-toggle-hint">Standard notation above the tab</span>
            </span>
          </label>
        </AppTooltip>
        <AppTooltip
          text="Tab flows horizontally past a fixed cursor. Disable for the classic multi-line page layout."
        >
          <label class="display-toggle">
            <input
              class="display-toggle-input"
              type="checkbox"
              :checked="horizontalLayout"
              @change="
                playerStore.setHorizontalLayout(
                  ($event.target as HTMLInputElement).checked,
                )
              "
            >
            <span
              class="display-toggle-slider"
              aria-hidden="true"
            />
            <span class="display-toggle-content">
              <span class="display-toggle-label">Scrolling Tab</span>
              <span class="display-toggle-hint">Horizontal flow, cursor stays at 40%</span>
            </span>
          </label>
        </AppTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.display-row {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.display-trigger {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
}

.track-overlay.display-overlay {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  left: auto;
  width: min(320px, calc(100vw - 24px));
  min-width: min(260px, calc(100vw - 24px));
  background: #131720;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  /* Above the NoteResultOverlay canvas (z-index 1001) so the
     feedback bar doesn't paint over the dropdown content. */
  z-index: 1100;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.display-menu-list {
  display: grid;
  gap: 6px;
}

.display-toggle {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.display-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

.display-toggle-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.display-toggle-slider {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  transition: background-color 120ms ease;
}

.display-toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e6e6ea;
  transition: transform 120ms ease;
}

.display-toggle-input:checked + .display-toggle-slider {
  background: var(--accent);
}

.display-toggle-input:checked + .display-toggle-slider::after {
  transform: translateX(16px);
}

.display-toggle-input:focus-visible + .display-toggle-slider {
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb, 34, 197, 94), 0.4);
}

.display-toggle-content {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.display-toggle-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}

.display-toggle-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.35;
}
</style>
