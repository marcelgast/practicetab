<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { SongSection } from '../../domain/songMap';
import { createSection, sortSections } from '../../domain/songMap';
import { useAppStore } from '../../stores/app';
import BaseButton from '../ui/BaseButton.vue';
import ColorPickerCircle from './ColorPickerCircle.vue';
import { Trash2, Plus } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    sections: SongSection[];
    libraryItemId: string;
    cursorMs?: number;
  }>(),
  {
    cursorMs: 0,
  },
);

const emit = defineEmits<{
  'update:sections': [sections: SongSection[]];
}>();

const appStore = useAppStore();
const confirmDeleteId = ref<string | null>(null);

type EditingField = 'label' | 'time';
const editingCell = ref<{ id: string; field: EditingField } | null>(null);

const sortedSections = computed(() => sortSections(props.sections));

function isEditing(id: string, field: EditingField): boolean {
  const c = editingCell.value;
  return c !== null && c.id === id && c.field === field;
}

function handleCellClick(
  id: string,
  field: EditingField,
  event: MouseEvent,
): void {
  editingCell.value = { id, field };
  const cell = event.currentTarget as HTMLElement | null;
  void nextTick(() => {
    const input = cell?.querySelector('input') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  });
}

function handleCellBlur(event: FocusEvent): void {
  const related = event.relatedTarget as HTMLElement | null;
  const cell = (event.target as HTMLElement)?.closest('.bm-cell');
  if (cell && related && cell.contains(related)) {
    return;
  }
  editingCell.value = null;
}

function handleCellKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === 'Escape') {
    editingCell.value = null;
  }
}

function addSection(): void {
  confirmDeleteId.value = null;
  const nextIndex = props.sections.length + 1;
  const section = createSection(
    props.libraryItemId,
    `Section ${nextIndex}`,
    props.cursorMs ?? 0,
    nextIndex,
    appStore.accentColor,
  );
  emit('update:sections', [...props.sections, section]);
}

function updateLabel(id: string, label: string): void {
  emit(
    'update:sections',
    props.sections.map((s) => (s.id === id ? { ...s, label } : s)),
  );
}

function updateColor(id: string, color: string): void {
  emit(
    'update:sections',
    props.sections.map((s) => (s.id === id ? { ...s, color } : s)),
  );
}

function updateTimestamp(id: string, seconds: number): void {
  const ms = Math.max(0, Math.round(seconds * 1000));
  emit(
    'update:sections',
    props.sections.map((s) => (s.id === id ? { ...s, timestampMs: ms } : s)),
  );
}

function toggleDeleteConfirm(id: string): void {
  confirmDeleteId.value = confirmDeleteId.value === id ? null : id;
}

function confirmDelete(id: string): void {
  confirmDeleteId.value = null;
  emit(
    'update:sections',
    props.sections.filter((s) => s.id !== id),
  );
}

function cancelDelete(): void {
  confirmDeleteId.value = null;
}

function timestampSeconds(ms: number): number {
  return Math.round((ms / 1000) * 100) / 100;
}
</script>

<template>
  <section class="bm-table-section">
    <div class="bm-table-header">
      <span class="bm-table-title">
        Sections ({{ sortedSections.length }})
      </span>
      <BaseButton
        size="sm"
        type="button"
        @click="addSection"
      >
        <Plus :size="13" />
        Add
      </BaseButton>
    </div>
    <table
      v-if="sortedSections.length > 0"
      class="bm-table"
    >
      <thead>
        <tr>
          <th class="bm-th bm-th--color">
            Color
          </th>
          <th class="bm-th bm-th--label">
            Label
          </th>
          <th class="bm-th bm-th--time">
            Time (s)
          </th>
          <th class="bm-th bm-th--actions" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="section in sortedSections"
          :key="section.id"
          class="bm-row"
        >
          <!-- Color -->
          <td class="bm-cell bm-cell--color">
            <ColorPickerCircle
              :model-value="section.color"
              @update:model-value="(c) => updateColor(section.id, c)"
            />
          </td>
          <!-- Label -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing(section.id, 'label') }"
            @click="handleCellClick(section.id, 'label', $event)"
          >
            <input
              v-if="isEditing(section.id, 'label')"
              type="text"
              class="bm-cell-input"
              :value="section.label"
              @blur="handleCellBlur"
              @keydown="handleCellKeydown"
              @input="
                updateLabel(
                  section.id,
                  ($event.target as HTMLInputElement).value,
                )
              "
            >
            <span v-else>{{ section.label }}</span>
          </td>
          <!-- Time -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing(section.id, 'time') }"
            @click="handleCellClick(section.id, 'time', $event)"
          >
            <input
              v-if="isEditing(section.id, 'time')"
              type="number"
              min="0"
              step="0.1"
              class="bm-cell-input"
              :value="timestampSeconds(section.timestampMs)"
              @blur="handleCellBlur"
              @keydown="handleCellKeydown"
              @change="
                updateTimestamp(
                  section.id,
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            >
            <span v-else>{{
              timestampSeconds(section.timestampMs).toFixed(2)
            }}</span>
          </td>
          <!-- Actions -->
          <td class="bm-cell bm-cell--actions">
            <button
              v-if="confirmDeleteId !== section.id"
              class="bm-icon-btn bm-icon-btn--delete"
              type="button"
              aria-label="Delete section"
              @click.stop="toggleDeleteConfirm(section.id)"
            >
              <Trash2 :size="13" />
            </button>
            <span
              v-else
              class="bm-confirm-inline"
            >
              <BaseButton
                variant="outline-danger"
                size="sm"
                type="button"
                @click.stop="confirmDelete(section.id)"
              >
                Yes
              </BaseButton>
              <BaseButton
                variant="filled-accent"
                size="sm"
                type="button"
                @click.stop="cancelDelete"
              >
                No
              </BaseButton>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
@import '../player/beatmap-table.css';

.bm-th--color {
  width: 56px;
}

.bm-th--label {
  width: auto;
}

.bm-th--time {
  width: 90px;
}

.bm-th--actions {
  width: 90px;
}

.bm-cell--color {
  text-align: center;
  cursor: default;
}
</style>
