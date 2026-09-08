<script setup lang="ts">
import { Trash2, Plus, Save } from 'lucide-vue-next';
import BaseButton from '../ui/BaseButton.vue';
import {
  canSaveNewTimeDraft,
  type BeatmapTimeEventDraft,
} from './beatmapDraftUtils';
import { useBeatmapTableEditing } from './useBeatmapTableEditing';

defineProps<{
  events: BeatmapTimeEventDraft[];
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
  return `time:${index}`;
}
</script>

<template>
  <section class="bm-table-section">
    <div class="bm-table-header">
      <span class="bm-table-title"> Time Events ({{ events.length }}) </span>
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
            Bar
          </th>
          <th class="bm-th bm-th--bpm">
            BPM
          </th>
          <th class="bm-th bm-th--timesig">
            Time Sig
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
          <!-- Bar -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing('time', index, 'bar') }"
            @click="handleCellClick('time', index, 'bar', $event)"
          >
            <input
              v-if="isEditing('time', index, 'bar')"
              v-model.number="event.barIndex"
              type="number"
              min="1"
              step="1"
              class="bm-cell-input"
              @blur="handleCellBlur"
              @keydown="handleCellKeydown"
            >
            <span v-else>{{ event.barIndex }}</span>
          </td>
          <!-- BPM -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing('time', index, 'bpm') }"
            @click="handleCellClick('time', index, 'bpm', $event)"
          >
            <input
              v-if="isEditing('time', index, 'bpm')"
              v-model.number="event.bpm"
              type="number"
              min="20"
              max="400"
              step="1"
              class="bm-cell-input"
              @blur="handleCellBlur"
              @keydown="handleCellKeydown"
            >
            <span v-else>{{ event.bpm }}</span>
          </td>
          <!-- Time Signature -->
          <td
            class="bm-cell"
            :class="{ 'bm-cell--editing': isEditing('time', index, 'timesig') }"
            @click="handleCellClick('time', index, 'timesig', $event)"
          >
            <span
              v-if="isEditing('time', index, 'timesig')"
              class="bm-timesig-edit"
            >
              <input
                v-model.number="event.timeSigTop"
                type="number"
                min="1"
                max="32"
                step="1"
                class="bm-cell-input bm-cell-input--narrow"
                @blur="handleCellBlur"
                @keydown="handleCellKeydown"
              >
              <span class="bm-timesig-sep">/</span>
              <input
                v-model.number="event.timeSigBottom"
                type="number"
                min="1"
                max="32"
                step="1"
                class="bm-cell-input bm-cell-input--narrow"
                @blur="handleCellBlur"
                @keydown="handleCellKeydown"
              >
            </span>
            <span v-else>{{ event.timeSigTop }}/{{ event.timeSigBottom }}</span>
          </td>
          <!-- Actions -->
          <td class="bm-cell bm-cell--actions">
            <button
              v-if="event._isNew"
              class="bm-icon-btn bm-icon-btn--save"
              :disabled="!canSaveNewTimeDraft(event)"
              type="button"
              aria-label="Save event"
              @click.stop="emit('save-new', index)"
            >
              <Save :size="13" />
            </button>
            <template v-if="!(index === 0 && !event._isNew)">
              <button
                v-if="confirmDeleteKey !== deleteKey(index)"
                class="bm-icon-btn bm-icon-btn--delete"
                type="button"
                aria-label="Delete event"
                @click.stop="emit('toggle-delete', index)"
              >
                <Trash2 :size="13" />
              </button>
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
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style>
@import './beatmap-table.css';
</style>
