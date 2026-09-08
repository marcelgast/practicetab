<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { openUrl } from '@tauri-apps/plugin-opener';
import IconButton from '../ui/IconButton.vue';
import BaseButton from '../ui/BaseButton.vue';
import IconHelp from '../icons/IconHelp.vue';
import { getImplementedShortcuts } from '../../domain/shortcuts';
import AppTooltip from '../ui/AppTooltip.vue';
import GuidesColumn from '../help/GuidesColumn.vue';

const props = withDefaults(defineProps<{ disabled?: boolean }>(), {
  disabled: false,
});

const HELP_CENTRE_URL = 'https://getPracticetab.com/help';
const shortcuts = computed(() => getImplementedShortcuts());
const isOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const guidesColumnRef = ref<HTMLElement | null>(null);
const logoSrc = computed(() => {
  if (typeof window === 'undefined') {
    return '/PracticeTab_Logo_wide.png';
  }
  const protocol = window.location?.protocol ?? '';
  if (protocol === 'file:') {
    return './PracticeTab_Logo_wide.png';
  }
  return '/PracticeTab_Logo_wide.png';
});

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

function closeMenu(): void {
  isOpen.value = false;
}

function toggleMenu(): void {
  if (props.disabled) {
    return;
  }
  isOpen.value = !isOpen.value;
}

async function openHelpCentre(): Promise<void> {
  try {
    if (isTauriRuntime()) {
      await openUrl(HELP_CENTRE_URL);
    } else {
      window.open(HELP_CENTRE_URL, '_blank', 'noopener,noreferrer');
    }
  } catch {
    window.open(HELP_CENTRE_URL, '_blank', 'noopener,noreferrer');
  } finally {
    closeMenu();
  }
}

function handleOpenHelp(event?: Event): void {
  if (props.disabled) {
    return;
  }
  isOpen.value = true;
  // The onboarding welcome fires `open-help` with
  // `detail.focus === 'guides'` so the dropdown should scroll the
  // Guides column into view when it opens.
  const detail = (event as CustomEvent | undefined)?.detail;
  if (detail && typeof detail === 'object' && detail.focus === 'guides') {
    void nextTick(() => {
      guidesColumnRef.value?.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
      });
    });
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (!isOpen.value) {
    return;
  }
  const key = event.key;
  const code = event.code;
  const keyCode = event.keyCode;
  if (
    key === 'Escape' ||
    key === 'Esc' ||
    code === 'Escape' ||
    keyCode === 27
  ) {
    closeMenu();
  }
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) {
    return;
  }
  const target = event.target as Node | null;
  if (rootRef.value?.contains(target ?? null)) {
    return;
  }
  closeMenu();
}

onMounted(() => {
  window.addEventListener('open-help', handleOpenHelp);
  window.addEventListener('keydown', handleEscape);
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('open-help', handleOpenHelp);
  window.removeEventListener('keydown', handleEscape);
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
</script>

<template>
  <div
    ref="rootRef"
    class="help-menu"
  >
    <AppTooltip
      :text="props.disabled ? 'Help (disabled while playing)' : 'Help'"
      side="bottom"
      align="center"
      :side-offset="0"
    >
      <span class="help-tooltip-trigger">
        <IconButton
          aria-label="Help"
          class="help-button"
          :disabled="props.disabled"
          @click="toggleMenu"
        >
          <span class="help-label">Help</span>
          <IconHelp :size="24" />
        </IconButton>
      </span>
    </AppTooltip>

    <div
      v-if="isOpen && !props.disabled"
      class="help-dropdown"
      role="dialog"
      aria-label="Help menu"
    >
      <div class="help-left">
        <div class="help-brand">
          <img
            class="help-logo"
            :src="logoSrc"
            alt="PracticeTab logo"
          >
          <p class="help-copyright">
            © MG-Studios. All rights reserved
          </p>
          <hr
            class="help-brand-rule"
            aria-hidden="true"
          >
        </div>

        <div class="help-shortcuts">
          <h3 class="help-shortcuts-title">
            Available Keyboard Shortcuts
          </h3>
          <div class="help-shortcuts-list">
            <div
              v-for="shortcut in shortcuts"
              :key="shortcut.keys"
              class="help-shortcut-row"
            >
              <span class="help-shortcut-keys">{{ shortcut.keys }}</span>
              <span class="help-shortcut-desc">{{ shortcut.description }}</span>
            </div>
          </div>
        </div>

        <div class="help-actions">
          <BaseButton
            class="help-link"
            variant="filled-accent"
            @click="openHelpCentre"
          >
            Help Center
          </BaseButton>
          <BaseButton
            class="help-close"
            variant="outline-danger"
            @click="closeMenu"
          >
            Close
          </BaseButton>
        </div>
      </div>

      <div
        ref="guidesColumnRef"
        class="help-right"
      >
        <!-- Inner wrapper is absolutely positioned so the guides
             content doesn't contribute to the grid row height. The
             dropdown's total height is set by the shortcuts side
             (left column), and the guides list scrolls inside if
             its content is taller. -->
        <div class="help-right-inner">
          <GuidesColumn @close-help="closeMenu" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-menu {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.help-button {
  width: auto;
  height: 44px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.help-tooltip-trigger {
  display: inline-flex;
  align-items: center;
  height: 44px;
}

.help-label {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.help-dropdown {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  width: min(760px, calc(100vw - 32px));
  /* Safety cap only — in practice the dropdown height is set by
   * the shortcuts (left) column's natural content. Right column's
   * guides list scrolls internally when it exceeds that height. */
  max-height: 85vh;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  background: var(--modal-surface);
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  z-index: 10050;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(300px, 1.1fr);
  gap: 16px;
  align-items: stretch;
}

.help-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.help-right {
  /* Positioning context for the absolutely-positioned inner
   * wrapper. The inner wrapper takes absolute+inset:0, so it
   * fills the grid cell without contributing to the cell's
   * intrinsic height — that's what keeps dropdown height driven
   * by the shortcuts column on the left. */
  position: relative;
  min-width: 0;
}

.help-right-inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding-left: 14px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 0;
}

.help-brand {
  display: grid;
  gap: 8px;
}

.help-logo {
  width: 156px;
  height: auto;
}

.help-copyright {
  margin: 0;
  font-size: 0.73rem;
  letter-spacing: 0.01em;
  color: var(--text-muted);
}

.help-brand-rule {
  margin: 0;
  height: 1px;
  width: 100%;
  border: 0;
}

.help-shortcuts {
  display: grid;
  gap: 8px;
}

.help-shortcuts-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}

.help-shortcuts-list {
  display: grid;
  gap: 6px;
}

.help-shortcut-row {
  display: grid;
  grid-template-columns: minmax(78px, auto) 1fr;
  gap: 10px;
  align-items: center;
  padding: 7px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.help-shortcut-keys {
  font-weight: 700;
  color: var(--text);
}

.help-shortcut-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.help-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.help-link,
.help-close {
  min-height: 34px;
}

@media (max-width: 820px) {
  .help-dropdown {
    grid-template-columns: 1fr;
    /* Both columns now stack and contribute to the dropdown's
     * intrinsic height. When that exceeds the max-height cap, let
     * the whole dropdown scroll vertically so nothing gets
     * clipped. The two-column branch above keeps overflow: hidden
     * because the guides list there scrolls internally. */
    overflow-y: auto;
  }

  /* When the dropdown stacks into one column the right side has
   * no sibling whose height to inherit, so the absolute-positioned
   * inner wrapper would render at zero height and the Guides
   * column would disappear (or overflow the menu). Drop both back
   * into normal flow at this breakpoint so the right column
   * contributes its own height again, with the divider switching
   * from a left border to a top border. */
  .help-right {
    position: static;
    padding-left: 0;
    padding-top: 12px;
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .help-right-inner {
    position: static;
    padding-left: 0;
    border-left: none;
  }
}

@media (max-width: 600px) {
  .help-dropdown {
    left: 0;
    width: min(360px, calc(100vw - 16px));
  }

  .help-actions {
    justify-content: stretch;
    flex-direction: column;
  }

  .help-link,
  .help-close {
    width: 100%;
  }
}
</style>
