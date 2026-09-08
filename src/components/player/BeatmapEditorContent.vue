<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useBeatmapStore } from '../../stores/beatmap';
import BaseButton from '../ui/BaseButton.vue';
import BarTimeline from '../shared/BarTimeline.vue';
import type { TimelineMarker, TimelineRange } from '../shared/BarTimeline.vue';
import BeatmapTimeTable from './BeatmapTimeTable.vue';
import BeatmapLoopTable from './BeatmapLoopTable.vue';
import BeatmapInitialForm from './BeatmapInitialForm.vue';
import { useBeatmapDrafts } from './useBeatmapDrafts';

const props = withDefaults(
  defineProps<{
    itemId: string | null;
    alwaysOpen?: boolean;
    audioDurationMs?: number;
  }>(),
  {
    alwaysOpen: false,
    audioDurationMs: 0,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const beatmapStore = useBeatmapStore();

const beatmapEntry = computed(() => {
  return props.itemId ? beatmapStore.getEntry(props.itemId) : null;
});

const isVisible = computed(() => {
  if (!props.itemId) return false;
  if (props.alwaysOpen) return true;
  return beatmapStore.editorItemId === props.itemId;
});

const {
  beatmapEndBarDraft,
  beatmapTimeDrafts,
  beatmapLoopDrafts,
  confirmDeleteKey,
  saveConfirmed,
  confirmDeleteBeatmap,
  initialBpm,
  initialTimeSigTop,
  initialTimeSigBottom,
  initialEndBar,
  hasBeatmap,
  syncDraftsFromEntry,
  saveDrafts,
  createInitialBeatmap,
  deleteBeatmap,
  addTimeDraft,
  confirmDeleteTime,
  saveNewTime,
  addLoopDraft,
  confirmDeleteLoop,
  saveNewLoop,
  closeDeleteConfirm,
  toggleDelete,
} = useBeatmapDrafts(() => props.itemId, beatmapEntry);

const timelineMarkers = computed<TimelineMarker[]>(() =>
  beatmapTimeDrafts.value.map((e) => ({ bar: e.barIndex })),
);

const timelineRanges = computed<TimelineRange[]>(() =>
  beatmapLoopDrafts.value.map((e) => ({
    startBar: e.startBar,
    endBar: e.endBar,
  })),
);

const highlightedBar = ref<number | null>(null);

function handleBarClick(bar: number): void {
  highlightedBar.value = highlightedBar.value === bar ? null : bar;
}

function close(): void {
  if (!props.alwaysOpen) {
    beatmapStore.closeEditor();
  }
  closeDeleteConfirm();
  emit('close');
}

watch(
  () => [isVisible.value, beatmapEntry.value?.updatedAt, props.itemId],
  () => {
    if (!isVisible.value) return;
    closeDeleteConfirm();
    syncDraftsFromEntry();
  },
  { immediate: true },
);

defineExpose({
  saveDrafts,
  createInitialBeatmap: () => createInitialBeatmap(props.audioDurationMs),
  deleteBeatmap,
  hasBeatmap,
  saveConfirmed,
});
</script>

<template>
  <div
    v-if="isVisible"
    class="beatmap-editor-content"
  >
    <div
      v-if="!alwaysOpen"
      class="beatmap-editor-header"
    >
      <h3>Beatmap Editor</h3>
      <div class="beatmap-editor-actions">
        <BaseButton
          size="sm"
          variant="filled-accent"
          type="button"
          data-guide="beatmap-editor.save"
          @click="saveDrafts"
        >
          {{ saveConfirmed ? 'Saved ✓' : 'Save' }}
        </BaseButton>
        <BaseButton
          size="sm"
          type="button"
          @click="close"
        >
          Close
        </BaseButton>
      </div>
    </div>

    <!-- Initial beatmap creation -->
    <BeatmapInitialForm
      v-if="!hasBeatmap"
      :bpm="initialBpm"
      :time-sig-top="initialTimeSigTop"
      :time-sig-bottom="initialTimeSigBottom"
      :end-bar="initialEndBar"
      :audio-duration-ms="audioDurationMs"
      :save-confirmed="saveConfirmed"
      @update:bpm="initialBpm = $event"
      @update:time-sig-top="initialTimeSigTop = $event"
      @update:time-sig-bottom="initialTimeSigBottom = $event"
      @update:end-bar="initialEndBar = $event"
      @create="createInitialBeatmap(audioDurationMs)"
    />

    <!-- Full editor (beatmap exists) -->
    <template v-else>
      <!-- End Bar -->
      <div
        class="beatmap-endbar-row"
        data-guide="beatmap-editor.end-bar"
      >
        <label>End Bar</label>
        <input
          v-model.number="beatmapEndBarDraft"
          type="number"
          min="1"
          step="1"
        >
      </div>

      <!-- Bar Timeline -->
      <div data-guide="beatmap-editor.timeline">
        <BarTimeline
          :end-bar="beatmapEndBarDraft"
          :markers="timelineMarkers"
          :ranges="timelineRanges"
          :highlighted-bar="highlightedBar"
          @bar-click="handleBarClick"
        />
      </div>

      <!-- Time Events -->
      <div data-guide="beatmap-editor.time-events">
        <BeatmapTimeTable
          :events="beatmapTimeDrafts"
          :confirm-delete-key="confirmDeleteKey"
          @add="addTimeDraft"
          @save-new="saveNewTime"
          @confirm-delete="confirmDeleteTime"
          @toggle-delete="toggleDelete('time', $event)"
          @close-delete="closeDeleteConfirm"
        />
      </div>

      <!-- Loop Events -->
      <div data-guide="beatmap-editor.loop-events">
        <BeatmapLoopTable
          :events="beatmapLoopDrafts"
          :confirm-delete-key="confirmDeleteKey"
          @add="addLoopDraft"
          @save-new="saveNewLoop"
          @confirm-delete="confirmDeleteLoop"
          @toggle-delete="toggleDelete('loop', $event)"
          @close-delete="closeDeleteConfirm"
        />
      </div>

      <!-- Danger zone -->
      <hr class="beatmap-divider">
      <div class="beatmap-danger-zone">
        <BaseButton
          v-if="!confirmDeleteBeatmap"
          size="sm"
          variant="outline-danger"
          type="button"
          @click="confirmDeleteBeatmap = true"
        >
          Delete Beatmap
        </BaseButton>
        <template v-else>
          <span class="beatmap-confirm-text">Delete beatmap?</span>
          <BaseButton
            size="sm"
            variant="outline-danger"
            type="button"
            @click="
              deleteBeatmap();
              confirmDeleteBeatmap = false;
            "
          >
            Yes, delete
          </BaseButton>
          <BaseButton
            size="sm"
            type="button"
            @click="confirmDeleteBeatmap = false"
          >
            Cancel
          </BaseButton>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.beatmap-editor-content {
  display: grid;
  /* Lock the grid column to the container width so wide children
   * (bar timeline, event tables) don't widen the editor and force
   * the outer panel to scroll sideways. Wide children handle their
   * own horizontal overflow locally. */
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.beatmap-editor-content > * {
  min-width: 0;
  max-width: 100%;
}

/* Local scroll on the wrappers that actually hold wide content
 * (bar timeline strip, event tables). Narrower rows don't need
 * it and an overflow container on them disturbs their layout. */
[data-guide='beatmap-editor.timeline'],
[data-guide='beatmap-editor.time-events'],
[data-guide='beatmap-editor.loop-events'] {
  overflow-x: auto;
}

.beatmap-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.beatmap-editor-header h3 {
  margin: 0;
}

.beatmap-editor-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.beatmap-endbar-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.beatmap-endbar-row input {
  width: 90px;
  background: #0f1218;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 0.86rem;
}

.beatmap-divider {
  border: none;
  border-top: 1px solid var(--border, #333);
  margin: 4px 0;
}

.beatmap-danger-zone {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.beatmap-confirm-text {
  font-size: 0.85rem;
  color: var(--text-muted);
}

input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  opacity: 1;
  filter: invert(1);
}
</style>
