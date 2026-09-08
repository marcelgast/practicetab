<script setup lang="ts">
/**
 * Onboarding welcome dialog. Appears on first-ever app use (see
 * `useGuideStore.shouldShowWelcome`) and is mounted once in
 * `App.vue`.
 *
 * Two-step flow:
 *  1. Primary dialog offers Start guide / No thanks.
 *  2. No thanks → confirm modal explaining the toggle in Help, then
 *     flips `showAtStartup` off + marks welcomeSeenAt.
 *  2'. Start guide → marks welcomeSeenAt + emits `open-help-guides`
 *      so the Help dropdown opens on the Guides column.
 *
 * The dialog does NOT start a guide itself; dispatching the "open
 * Help on Guides" event keeps the guide-choice UI in one place
 * (the Help dropdown). That avoids duplicating the list rendering.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import BaseButton from './ui/BaseButton.vue';
import { useGuideStore } from '../stores/guides';

const guideStore = useGuideStore();

const open = computed(() => guideStore.shouldShowWelcome);
const confirmingDismiss = ref(false);

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value) return;
  if (event.key !== 'Escape') return;
  // Escape always collapses the welcome: on the primary screen
  // treat it as "No thanks" (open the confirm step); on the
  // confirm step treat it as Back (keep the welcome available).
  event.preventDefault();
  event.stopPropagation();
  if (confirmingDismiss.value) {
    cancelDismiss();
  } else {
    requestDismiss();
  }
}

window.addEventListener('keydown', handleKeydown);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});

function startGuide(): void {
  // Hide Welcome for this session only — the user asked to see it
  // again on next launch via the "Show guides at startup" toggle.
  guideStore.dismissWelcomeForSession();
  // Remember the user picked the guide path so the Session Journal
  // goal dialog doesn't pop while they navigate the Help panel.
  guideStore.markGuideIntendedThisSession();
  // Fire the same event the Help button listens to, with a flag
  // in CustomEvent detail so ShortcutsHelpMenu can open focused on
  // the Guides column. A plain bool on the event keeps the
  // contract simple and avoids exposing a store to that component.
  window.dispatchEvent(
    new CustomEvent('open-help', { detail: { focus: 'guides' } }),
  );
  confirmingDismiss.value = false;
}

function requestDismiss(): void {
  confirmingDismiss.value = true;
}

function cancelDismiss(): void {
  confirmingDismiss.value = false;
}

function confirmDismiss(): void {
  // Permanent opt-out: flip the toggle off AND hide this session's
  // Welcome so the dialog collapses immediately.
  guideStore.setShowAtStartup(false);
  guideStore.dismissWelcomeForSession();
  confirmingDismiss.value = false;
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      class="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-welcome-title"
    >
      <div
        v-if="!confirmingDismiss"
        class="onboarding-modal"
      >
        <h2
          id="onboarding-welcome-title"
          class="onboarding-title"
        >
          Welcome to PracticeTab
        </h2>
        <p class="onboarding-text">
          PracticeTab has grown quite a few features. Would you like a short
          guided tour of each page, or would you rather explore on your own?
        </p>
        <p class="onboarding-text onboarding-text--muted">
          You can start a guide any time from the Help button in the
          bottom-left.
        </p>
        <div class="onboarding-actions">
          <BaseButton
            variant="ghost"
            size="sm"
            type="button"
            @click="requestDismiss"
          >
            No thanks
          </BaseButton>
          <BaseButton
            autofocus
            variant="filled-accent"
            size="sm"
            type="button"
            @click="startGuide"
          >
            Start guide
          </BaseButton>
        </div>
      </div>

      <div
        v-else
        class="onboarding-modal"
        aria-labelledby="onboarding-confirm-title"
      >
        <h2
          id="onboarding-confirm-title"
          class="onboarding-title"
        >
          Skip the guide?
        </h2>
        <p class="onboarding-text">
          No problem — guides stay available. You can start or restart any
          section any time from the Help menu (bottom-left), and re-enable the
          startup prompt there too.
        </p>
        <div class="onboarding-actions">
          <BaseButton
            autofocus
            variant="ghost"
            size="sm"
            type="button"
            @click="cancelDismiss"
          >
            Back
          </BaseButton>
          <BaseButton
            variant="filled-accent"
            size="sm"
            type="button"
            @click="confirmDismiss"
          >
            Got it, skip
          </BaseButton>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop, rgba(0, 0, 0, 0.55));
  display: grid;
  place-items: center;
  z-index: 100003;
  padding: 24px;
}

.onboarding-modal {
  width: min(520px, 92vw);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 24px;
  color: var(--text);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  text-align: left;
}

.onboarding-title {
  margin: 0 0 10px;
  font-size: 22px;
}

.onboarding-text {
  margin: 0 0 10px;
  color: var(--text);
  line-height: 1.5;
}

.onboarding-text--muted {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin-bottom: 18px;
}

.onboarding-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
