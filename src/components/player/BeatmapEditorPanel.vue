<script setup lang="ts">
import { computed } from 'vue';
import { useBeatmapStore } from '../../stores/beatmap';
import BeatmapEditorContent from './BeatmapEditorContent.vue';

const props = defineProps<{
  itemId: string | null;
}>();

const beatmapStore = useBeatmapStore();

const isOpen = computed(
  () => Boolean(props.itemId) && beatmapStore.editorItemId === props.itemId,
);

function close(): void {
  beatmapStore.closeEditor();
}
</script>

<template>
  <div
    v-if="isOpen"
    class="beatmap-editor-panel"
  >
    <BeatmapEditorContent
      :item-id="itemId"
      @close="close"
    />
  </div>
</template>

<style scoped>
.beatmap-editor-panel {
  position: absolute;
  inset: 0;
  z-index: 250;
  display: flex;
  flex-direction: column;
  /* Vertical scroll inside the panel is fine when the editor is
   * taller than the right pane. Horizontal overflow is NOT — the
   * editor must live inside the aside, not shove it sideways. */
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg, #0c0f14);
  padding: 28px clamp(20px, 4vw, 40px);
  min-width: 0;
}
</style>
