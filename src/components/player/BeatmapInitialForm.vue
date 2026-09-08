<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue';

defineProps<{
  bpm: number;
  timeSigTop: number;
  timeSigBottom: number;
  endBar: number;
  audioDurationMs: number;
  saveConfirmed: boolean;
}>();

const emit = defineEmits<{
  'update:bpm': [value: number];
  'update:timeSigTop': [value: number];
  'update:timeSigBottom': [value: number];
  'update:endBar': [value: number];
  create: [];
}>();
</script>

<template>
  <div class="beatmap-initial">
    <p class="beatmap-initial-hint">
      No beatmap exists for this song. Set the initial values to create one.
    </p>
    <div class="beatmap-initial-fields">
      <div class="beatmap-field-row">
        <label>BPM</label>
        <input
          :value="bpm"
          type="number"
          min="20"
          max="400"
          step="1"
          @input="
            emit(
              'update:bpm',
              Number(($event.target as HTMLInputElement).value),
            )
          "
        >
      </div>
      <div class="beatmap-field-row">
        <label>Time Signature</label>
        <div class="beatmap-timesig-inputs">
          <input
            :value="timeSigTop"
            type="number"
            min="1"
            max="32"
            step="1"
            class="beatmap-timesig-input"
            @input="
              emit(
                'update:timeSigTop',
                Number(($event.target as HTMLInputElement).value),
              )
            "
          >
          <span class="beatmap-timesig-sep">/</span>
          <input
            :value="timeSigBottom"
            type="number"
            min="1"
            max="32"
            step="1"
            class="beatmap-timesig-input"
            @input="
              emit(
                'update:timeSigBottom',
                Number(($event.target as HTMLInputElement).value),
              )
            "
          >
        </div>
      </div>
      <div
        v-if="!audioDurationMs"
        class="beatmap-field-row"
      >
        <label>End Bar</label>
        <input
          :value="endBar"
          type="number"
          min="1"
          step="1"
          @input="
            emit(
              'update:endBar',
              Number(($event.target as HTMLInputElement).value),
            )
          "
        >
      </div>
    </div>
    <BaseButton
      size="sm"
      variant="filled-accent"
      type="button"
      @click="emit('create')"
    >
      {{ saveConfirmed ? 'Created ✓' : 'Create Beatmap' }}
    </BaseButton>
  </div>
</template>

<style scoped>
.beatmap-initial {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.beatmap-initial-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.beatmap-initial-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.beatmap-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.beatmap-field-row label {
  min-width: 100px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.beatmap-field-row input {
  width: 70px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary, #0d0f14);
  color: var(--text);
  font-size: 0.85rem;
}

.beatmap-timesig-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.beatmap-timesig-input {
  width: 44px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary, #0d0f14);
  color: var(--text);
  font-size: 0.85rem;
  text-align: center;
}

.beatmap-timesig-sep {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
