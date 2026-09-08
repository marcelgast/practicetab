<script setup lang="ts">
/**
 * Top-of-app banner shown when macOS has denied microphone access.
 *
 * Apple's TCC model: once the user picks Allow / Don't Allow in the
 * system prompt, the verdict is sticky. `requestAccessForMediaType:`
 * is a no-op for any state other than `not_determined`, so we cannot
 * re-prompt programmatically. The only path back to "granted" is the
 * user toggling the switch in System Settings → Privacy & Security →
 * Microphone, which is what the deeplink button opens.
 *
 * The banner is hidden on `authorized` (everyone's happy path,
 * including Windows / Linux which always report authorized) and on
 * `not_determined` (the OS prompt itself is the UI — App.vue auto-
 * triggers it on mount via `ensureMicPromptIfNeeded`).
 *
 * Re-checking on focus + visibility-change covers the common flow:
 * user clicks "Open System Settings", flips the toggle, switches
 * back to PracticeTab — banner disappears without a manual reload.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { openMicrophoneSettings } from '../services/audioCommands';
import { useAppStore } from '../stores/app';

const appStore = useAppStore();
const openSettingsError = ref<string | null>(null);

const visible = computed(() => {
  const status = appStore.micPermissionStatus;
  return status === 'denied' || status === 'restricted';
});

const isRestricted = computed(
  () => appStore.micPermissionStatus === 'restricted',
);

async function handleOpenSettings(): Promise<void> {
  openSettingsError.value = null;
  try {
    await openMicrophoneSettings();
  } catch (err) {
    // Surface the failure inline rather than silently dropping it —
    // the previous version swallowed errors and Marcel saw a dead
    // button on Tahoe (macOS 26). At least give the user a hint that
    // something's wrong and the manual path: System Settings →
    // Privacy & Security → Microphone.
    const message = err instanceof Error ? err.message : String(err);
    openSettingsError.value = message;
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void appStore.refreshMicPermissionStatus();
  }
}

function handleFocus(): void {
  void appStore.refreshMicPermissionStatus();
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('focus', handleFocus);
});
</script>

<template>
  <div
    v-if="visible"
    class="mic-permission-banner"
    role="status"
  >
    <div class="mic-permission-banner__text">
      <strong>Microphone access is blocked.</strong>
      <span v-if="isRestricted">
        Access is restricted by parental controls or device management.
        PracticeTab can&rsquo;t analyse your playing or tune your guitar until
        restrictions are lifted.
      </span>
      <span v-else>
        PracticeTab needs your microphone to tune your guitar and analyse your
        playing. Open System Settings to grant access.
      </span>
    </div>
    <button
      v-if="!isRestricted"
      class="mic-permission-banner__button"
      type="button"
      @click="handleOpenSettings"
    >
      Open System Settings
    </button>
    <div
      v-if="openSettingsError"
      class="mic-permission-banner__error"
      role="alert"
    >
      Couldn&rsquo;t open System Settings automatically. Open it manually:
      Privacy &amp; Security → Microphone.
    </div>
  </div>
</template>

<style scoped>
.mic-permission-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  background: rgba(255, 178, 90, 0.12);
  border: 1px solid rgba(255, 178, 90, 0.4);
  color: #ffd9a8;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.85rem;
}

.mic-permission-banner__text {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
}

.mic-permission-banner__text strong {
  color: #ffe7c8;
  font-weight: 600;
}

.mic-permission-banner__button {
  background: rgba(255, 178, 90, 0.2);
  color: #ffe7c8;
  border: 1px solid rgba(255, 178, 90, 0.5);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  flex: 0 0 auto;
}

.mic-permission-banner__button:hover {
  background: rgba(255, 178, 90, 0.28);
}

.mic-permission-banner__error {
  flex: 1 0 100%;
  font-size: 0.78rem;
  color: #ffd9a8;
  opacity: 0.85;
}
</style>
