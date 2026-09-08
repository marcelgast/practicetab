<script setup lang="ts">
/**
 * Minimal pitch-input diagnostic for the Settings page.
 *
 * Purpose: let the user verify that the selected input device is
 * actually producing a pitch-detectable signal. One circle:
 * - grey  → idle / no samples arriving (mic permission, wrong device, silence)
 * - amber → audio coming in but below the RMS gate or without clear pitch
 * - green → pitch detected
 *
 * The amber level is a fallback diagnostic — when we can see audio but
 * can't lock onto a note we still want to tell the user the mic is
 * working, otherwise "red" would lie about the cause.
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import BaseButton from '../ui/BaseButton.vue';
import { usePitchDetectionStore } from '../../stores/pitchDetection';

type Status = 'idle' | 'no-signal' | 'audio-only' | 'pitched';

const pitchStore = usePitchDetectionStore();

const isRunning = ref(false);
const error = ref<string | null>(null);
const lastRms = ref(0);
const lastPitchAt = ref(0);
const lastAudioAt = ref(0);
const now = ref(Date.now());

// Consider pitch "live" for 400 ms after the last pitched frame so a
// single gap between hops doesn't flicker the indicator back to amber.
const PITCH_STALE_MS = 400;
const AUDIO_STALE_MS = 600;

let tickHandle: number | null = null;

function startTicker(): void {
  if (tickHandle !== null) return;
  const tick = (): void => {
    now.value = Date.now();
    tickHandle = window.requestAnimationFrame(tick);
  };
  tickHandle = window.requestAnimationFrame(tick);
}

function stopTicker(): void {
  if (tickHandle !== null) {
    window.cancelAnimationFrame(tickHandle);
    tickHandle = null;
  }
}

watch(
  () => pitchStore.currentPitch,
  (result) => {
    if (!isRunning.value || !result) return;
    lastRms.value = result.rms;
    if (result.rms > 0) {
      lastAudioAt.value = Date.now();
    }
    if (result.frequency > 0) {
      lastPitchAt.value = Date.now();
    }
  },
);

const status = computed<Status>(() => {
  if (!isRunning.value) return 'idle';
  if (now.value - lastPitchAt.value < PITCH_STALE_MS) return 'pitched';
  if (now.value - lastAudioAt.value < AUDIO_STALE_MS) return 'audio-only';
  return 'no-signal';
});

const statusLabel = computed(() => {
  switch (status.value) {
    case 'pitched':
      return 'Pitch detected';
    case 'audio-only':
      return 'Audio detected, no pitch';
    case 'no-signal':
      return 'No signal';
    case 'idle':
    default:
      return 'Idle';
  }
});

const rmsLabel = computed(() => {
  if (!isRunning.value) return '';
  if (lastRms.value <= 0) return 'RMS —';
  const db = 20 * Math.log10(lastRms.value);
  return `RMS ${db.toFixed(1)} dBFS`;
});

async function handleStart(): Promise<void> {
  if (isRunning.value) return;
  error.value = null;
  lastRms.value = 0;
  lastPitchAt.value = 0;
  lastAudioAt.value = 0;
  try {
    await pitchStore.start();
    isRunning.value = true;
    startTicker();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : String(err ?? 'pitch_failed');
  }
}

async function handleStop(): Promise<void> {
  if (!isRunning.value) return;
  isRunning.value = false;
  stopTicker();
  try {
    await pitchStore.stop();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : String(err ?? 'pitch_failed');
  }
}

onUnmounted(() => {
  stopTicker();
  if (isRunning.value) {
    void handleStop();
  }
});
</script>

<template>
  <div class="pitch-test">
    <div class="pitch-test-header">
      <div>
        <h3 class="pitch-test-title">
          Pitch Test
        </h3>
        <p class="pitch-test-hint">
          Play a note to verify that your input is detected.
        </p>
      </div>
      <BaseButton
        v-if="!isRunning"
        variant="filled-accent"
        size="sm"
        type="button"
        @click="handleStart"
      >
        Start
      </BaseButton>
      <BaseButton
        v-else
        variant="ghost"
        size="sm"
        type="button"
        @click="handleStop"
      >
        Stop
      </BaseButton>
    </div>
    <div class="pitch-test-body">
      <div
        class="pitch-test-indicator"
        :class="`is-${status}`"
        :aria-label="statusLabel"
        role="status"
      />
      <div class="pitch-test-meta">
        <span class="pitch-test-status">{{ statusLabel }}</span>
        <span
          v-if="rmsLabel"
          class="pitch-test-rms"
        >{{ rmsLabel }}</span>
      </div>
    </div>
    <div
      v-if="error"
      class="pitch-test-error"
      role="alert"
    >
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.pitch-test {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.pitch-test-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.pitch-test-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.pitch-test-hint {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.pitch-test-body {
  display: flex;
  align-items: center;
  gap: 14px;
}

.pitch-test-indicator {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.pitch-test-indicator.is-pitched {
  background: #4ade80;
  border-color: #4ade80;
  box-shadow: 0 0 16px color-mix(in srgb, #4ade80 55%, transparent);
}

.pitch-test-indicator.is-audio-only {
  background: #facc15;
  border-color: #facc15;
  box-shadow: 0 0 12px color-mix(in srgb, #facc15 45%, transparent);
}

.pitch-test-indicator.is-no-signal {
  background: #3b3f4a;
  border-color: rgba(255, 255, 255, 0.18);
}

.pitch-test-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.82rem;
}

.pitch-test-status {
  color: var(--text);
  font-weight: 600;
}

.pitch-test-rms {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

.pitch-test-error {
  padding: 8px 10px;
  border-radius: 8px;
  color: #ffb7b7;
  border: 1px solid rgba(255, 183, 183, 0.4);
  font-size: 0.8rem;
}
</style>
