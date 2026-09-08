<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { RouterView } from 'vue-router';
import AppLayout from './layout/AppLayout.vue';
import { useAppStore } from './stores/app';
import { usePracticeStore } from './stores/practice';
import { useGuideStore } from './stores/guides';
import { useGuideRunner } from './composables/useGuideRunner';
import { useGlobalHotkeys } from './services/useGlobalHotkeys';
import { usePracticeTimerWatchers } from './services/usePracticeTimerWatchers';
import { usePracticeTimerStore } from './stores/practiceTimer';
import { practicePersistence } from './services/practicePersistence';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import AppToast from './components/ui/AppToast.vue';
import OnboardingWelcomeDialog from './components/OnboardingWelcomeDialog.vue';
import MicPermissionBanner from './components/MicPermissionBanner.vue';
import { useLibraryStore } from './stores/library';

const appStore = useAppStore();
const libraryStore = useLibraryStore();
const practiceStore = usePracticeStore();
const guideStore = useGuideStore();
const guideRunner = useGuideRunner();
useGlobalHotkeys();
usePracticeTimerWatchers();
const practiceTimerStore = usePracticeTimerStore();

/**
 * Session Journal goal dialog — fires once the practice store has
 * finished initialising and no guided flow is currently claiming the
 * viewport. `immediate: true` handles the case where init is already
 * done by the time App.vue mounts (fast launches).
 *
 * `practiceStore.isInitialized` gates the trigger so the dialog never
 * opens against a transient session row. `init()` is fired
 * fire-and-forget from `main.ts` and ends-then-recreates the active
 * session; without this gate the watcher could call
 * `ensureActiveSession` mid-init and race with the reset. Cheap sync
 * race — only matters on slow disks — but the gate is free.
 */
watch(
  () => ({
    showingWelcome: guideStore.shouldShowWelcome,
    guideActive: guideRunner.isActive.value,
    guideIntended: guideStore.guideIntendedThisSession,
    practiceReady: practiceStore.isInitialized,
  }),
  ({ showingWelcome, guideActive, guideIntended, practiceReady }) => {
    // Block the goal dialog whenever the user is on the guided path:
    // the Welcome is open, a guide is actively running, or the user
    // has already chosen the guide flow this session. `guideIntended`
    // sticks for the whole session so clicking "Start guide" doesn't
    // just shift the confusion from Welcome → Journal the moment the
    // Welcome closes. Journal dialog resumes on next launch when the
    // session ref resets.
    if (showingWelcome || guideActive || guideIntended) return;
    if (!practiceReady) return;
    void practiceStore.openGoalDialogIfAppropriate();
  },
  { immediate: true },
);

function handleError(message: string): void {
  if (!import.meta.env.DEV) {
    return;
  }
  appStore.setLastError(message);
}

onMounted(() => {
  // Lift the startup splash the moment Vue is ready to paint. `main.ts`
  // sets `data-locked=true` before the app mounts so the pre-hydration
  // splash overlay in `index.html` covers any FOUC; from here on Vue
  // owns what's on screen.
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-locked');
  }

  const onError = (event: ErrorEvent) => {
    handleError(event.message || 'Unhandled error');
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    handleError(reason || 'Unhandled rejection');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  // Surface the OS microphone permission state into the store so the
  // banner can react. On macOS, if TCC has no prior decision recorded
  // for this bundle, this also auto-triggers the system prompt — the
  // failure mode we're fixing is that on some Macs the prompt never
  // fires through cpal's enumeration path, leaving the user with no
  // signal and no actionable next step. On Windows / Linux the call
  // resolves to `authorized` immediately (no per-app prompt model).
  window.setTimeout(() => {
    void appStore.ensureMicPromptIfNeeded();
  }, 2000);

  // Graceful shutdown: Rust emits `app-closing` on CloseRequested, waits up
  // to 2s for us to flush. We flush the global practice timer, then call
  // `confirm_close` which closes the window. If we crash or are slow, the
  // safety-net timer in Rust calls exit(0) anyway — per-second DB flushes
  // mean at most 1s of timer data is lost.
  let unlistenAppClosing: UnlistenFn | null = null;
  void listen('app-closing', async () => {
    try {
      await practiceTimerStore.flushAndStop();
    } finally {
      await practicePersistence.confirmClose();
    }
  }).then((unlisten) => {
    unlistenAppClosing = unlisten;
  });

  onBeforeUnmount(() => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    unlistenAppClosing?.();
  });
});
</script>

<template>
  <AppLayout>
    <OnboardingWelcomeDialog />
    <AppToast />
    <MicPermissionBanner />
    <div
      v-if="appStore.lastError"
      class="error-banner"
    >
      {{ appStore.lastError }}
    </div>
    <RouterView />
  </AppLayout>

  <div
    v-if="libraryStore.importProgress"
    class="import-overlay"
  >
    <div class="import-overlay-content">
      <span class="import-spinner" />
      <p class="import-status">
        {{ libraryStore.importProgress }}
      </p>
    </div>
  </div>
</template>

<style>
:root {
  font-family: 'Space Grotesk', 'SF Pro Text', 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  font-weight: 400;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
  --bg: #0c0f14;
  --panel: #131720;
  --text: #e6ebf5;
  --text-active: #f0f2f7;
  --text-muted: #a8a8b3;
  --muted: #9aa3b2;
  --border: #1f2533;
  --accent: #5dd6a2;
  --modal-surface: #0d0f14;
  --overlay-backdrop: rgba(6, 9, 14, 0.82);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  opacity: 0.85;
}

button {
  font-family: inherit;
  background: var(--accent);
  color: #081018;
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
}

button:hover {
  opacity: 0.9;
}

select {
  background-color: var(--panel);
  color: var(--text);
  font-family: inherit;
  appearance: none;
  -webkit-appearance: none;
  color-scheme: dark;
}

select option {
  background-color: var(--panel);
  color: var(--text);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.page {
  max-width: 720px;
  display: grid;
  gap: 10px;
}

.page h1 {
  font-size: clamp(1.6rem, 2vw, 2.2rem);
  margin: 0;
}

.page p {
  margin: 0;
  color: var(--muted);
}

.error-banner {
  background: rgba(255, 110, 110, 0.12);
  border: 1px solid rgba(255, 110, 110, 0.4);
  color: #ffb7b7;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.85rem;
}

.import-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.import-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 48px;
  background: #0d0f14;
  border: 1px solid var(--border, #333);
  border-radius: 12px;
}

.import-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: import-spin 0.8s linear infinite;
}

.import-status {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #aaa);
}

@keyframes import-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
