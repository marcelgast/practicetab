<script setup lang="ts">
import { Trash2, Plus, Save } from 'lucide-vue-next';
import BaseButton from '../ui/BaseButton.vue';
import {
  canSaveNewLoopDraft,
  type BeatmapLoopEventDraft,
} from './beatmapDraftUtils';
import { useBeatmapTableEditing } from './useBeatmapTableEditing';

defineProps<{
  events: BeatmapLoopEventDraft[];
  confirmDeleteKey: string | null;
}>();

const emit = defineEmits<{
  add: [];
  'save-new': [index: number];
  'confirm-delete': [index: number];
  'toggle-delete': [index: number];
  'close-delete': [];
}>();

const { isEditing, handleCellClick, handleCellBlur, handleCellKeydown } =
  useBeatmapTableEditing();

function deleteKey(index: number): string {
  return `loop:${index}`;
}
</script>

<template>
  <section class="bm-table-section">
    <div class="bm-table-header">
      <span class="bm-table-title"> Loop Events ({{ events.length }}) </span>
      <BaseButton
        size="sm"
        type="button"
        @click="emit('add')"
      >
        <Plus :size="13" />
        Add
      </BaseButton>
    </div>
    <table
      v-if="events.length > 0"
      class="bm-table"
    >
      <thead>
        <tr>
          <th class="bm-th bm-th--bar">
            Start
          </th>
          <th class="bm-th bm-th--bar">
            End
          </th>
          <th class="bm-th bm-th--bpm">
            Repeats
          </th>
          <th class="bm-th bm-th--actions" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(event, index) in events"
          :key="event._draftId"
          class="bm-row"
          :class="{ 'bm-row--new': event._isNew }"
        >
          <!-- Start Bar -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing('loop', index, 'start') }"
            @click="handleCellClick('loop', index, 'start', $event)"
          >
            <input
              v-if="isEditing('loop', index, 'start')"
              v-model.number="event.startBar"
              type="number"
              min="1"
              step="1"
              class="bm-cell-input"
              @blur="handleCellBlur"
              @keydown="handleCellKeydown"
            >
            <span v-else>{{ event.startBar }}</span>
          </td>
          <!-- End Bar -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing('loop', index, 'end') }"
            @click="handleCellClick('loop', index, 'end', $event)"
          >
            <input
              v-if="isEditing('loop', index, 'end')"
              v-model.number="event.endBar"
              type="number"
              min="1"
              step="1"
              class="bm-cell-input"
              @blur="handleCellBlur"
              @keydown="handleCellKeydown"
            >
            <span v-else>{{ event.endBar }}</span>
          </td>
          <!-- Repeats -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing('loop', index, 'repeats') }"
            @click="handleCellClick('loop', index, 'repeats', $event)"
          >
            <input
              v-if="isEditing('loop', index, 'repeats')"
              v-model.number="event.repeatCount"
              type="number"
              min="1"
              step="1"
              class="bm-cell-input"
              @blur="handleCellBlur"
              @keydown="handleCellKeydown"
            >
            <span v-else>{{ event.repeatCount }}×</span>
          </td>
          <!-- Actions -->
          <td class="bm-cell bm-cell--actions">
            <button
              v-if="event._isNew"
              class="bm-icon-btn bm-icon-btn--save"
              :disabled="!canSaveNewLoopDraft(event)"
              type="button"
              aria-label="Save event"
              @click.stop="emit('save-new', index)"
            >
              <Save :size="13" />
            </button>
            <template v-if="confirmDeleteKey !== deleteKey(index)">
              <button
                class="bm-icon-btn bm-icon-btn--delete"
                type="button"
                aria-label="Delete event"
                @click.stop="emit('toggle-delete', index)"
              >
                <Trash2 :size="13" />
              </button>
            </template>
            <span
              v-else
              class="bm-confirm-inline"
            >
              <button
                class="bm-icon-btn bm-icon-btn--delete"
                type="button"
                @click.stop="emit('confirm-delete', index)"
              >
                Yes
              </button>
              <button
                class="bm-icon-btn"
                type="button"
                @click.stop="emit('close-delete')"
              >
                No
              </button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style>
@import './beatmap-table.css';
</style>
