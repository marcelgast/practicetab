<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useLibraryStore } from '../stores/library';
import { ExternalLink, Trash2 } from 'lucide-vue-next';
import AppTooltip from '../components/ui/AppTooltip.vue';
import BaseButton from '../components/ui/BaseButton.vue';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { useBeatmapStore } from '../stores/beatmap';
import { useSongMapStore } from '../stores/songMap';
import { useSongStore } from '../stores/song';
import { openLibraryItemInPlayer } from '../services/openPlayer';
import { libraryFileOps } from '../services/libraryFileOps';
import { filterLibraryItems } from '../domain/libraryViewFilter';
import { Search } from 'lucide-vue-next';
import type { LibraryItem } from '../domain/library';
import type { LibraryTypeFilter } from '../domain/libraryViewFilter';
import { getLibrarySourcePath, stripFileExtension } from '../domain/library';

const libraryStore = useLibraryStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();
const beatmapStore = useBeatmapStore();
const songMapStore = useSongMapStore();
const songStore = useSongStore();
const route = useRoute();

const searchQuery = ref('');
const typeFilter = ref<LibraryTypeFilter>('tab');
const addMenuOpen = ref(false);
const confirmDeleteId = ref<string | null>(null);
const confirmDirection = ref<'up' | 'down'>('down');
const confirmPosition = ref<{ left: number; top: number }>({ left: 0, top: 0 });
const ADD_MENU_SELECTOR = '.add-menu, .add-menu-trigger';
const CONFIRM_POPOVER_SELECTOR = '.confirm-popover, .confirm-trigger';

const audioLinkDialogOpen = ref(false);
const audioLinkTargetId = ref<string | null>(null);
const audioLinkSearch = ref('');

const audioLinkCandidates = computed(() =>
  filterLibraryItems(libraryStore.items, {
    query: audioLinkSearch.value,
    alphaFilter: null,
    typeFilter: 'audio',
  }).sort((a, b) => a.title.localeCompare(b.title)),
);

function openAudioLinkDialog(tabItemId: string): void {
  audioLinkTargetId.value = tabItemId;
  audioLinkSearch.value = '';
  audioLinkDialogOpen.value = true;
}

function handleSelectAudioLink(audioItemId: string): void {
  if (!audioLinkTargetId.value) return;
  libraryStore.linkAudio(audioLinkTargetId.value, audioItemId);
  audioLinkDialogOpen.value = false;
  audioLinkTargetId.value = null;
}

async function handleAddNewAudioForLink(): Promise<void> {
  await libraryStore.addAudioFromFilePicker();
  void libraryStore.refresh();
}

function getLinkedAudioTitle(item: LibraryItem): string | null {
  const linked = libraryStore.getLinkedAudio(item.id);
  return linked ? stripFileExtension(linked.title) : null;
}

const sortedItems = computed(() => {
  const base = [...libraryStore.items].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
  return filterLibraryItems(base, {
    query: searchQuery.value,
    alphaFilter: null,
    typeFilter: typeFilter.value,
  });
});

type LibraryDisplayItem =
  | { type: 'letter'; letter: string; key: string }
  | { type: 'item'; item: LibraryItem; key: string };

const displayItems = computed<LibraryDisplayItem[]>(() => {
  const items: LibraryDisplayItem[] = [];
  let lastLetter: string | null = null;
  for (const item of sortedItems.value) {
    const raw = item.title.trim().charAt(0).toUpperCase();
    const letter = raw >= 'A' && raw <= 'Z' ? raw : '#';
    if (letter !== lastLetter) {
      items.push({ type: 'letter', letter, key: `letter-${letter}` });
      lastLetter = letter;
    }
    items.push({ type: 'item', item, key: item.id });
  }
  return items;
});

function toMissingReason(error: unknown): LibraryItem['missingReason'] {
  const message = String(error ?? '');
  if (message.includes('no_permission')) {
    return 'no_permission';
  }
  return 'not_found';
}

async function openInPlayer(item: LibraryItem): Promise<void> {
  if (isMissing(item)) {
    return;
  }
  if (libraryStore.fileOpsAvailable) {
    try {
      await libraryFileOps.stat(getLibrarySourcePath(item.source));
    } catch (error) {
      libraryStore.markMissing(item.id, toMissingReason(error));
      return;
    }
  }
  openLibraryItemInPlayer(
    item,
    playerStore,
    uiStore,
    'library',
    songStore,
    libraryStore,
  );
}

async function openBeatmapEditor(item: LibraryItem): Promise<void> {
  await openInPlayer(item);
  beatmapStore.openEditor(item.id);
}

function openSongMapEditor(item: LibraryItem): void {
  songMapStore.openEditor(item.id);
  void songMapStore.load(item.id);
}

function beatmapStatusText(item: LibraryItem): string {
  const status = beatmapStore.statusForItem(item.id);
  if (status === 'generating') {
    return 'Generating beatmap...';
  }
  if (status === 'error') {
    return 'Beatmap error (edit required)';
  }
  if (status === 'ready') {
    return 'Beatmap ready';
  }
  return 'Beatmap pending';
}

function isMissing(item: LibraryItem): boolean {
  return !item.lastKnownOk;
}

function refreshLibrary(): void {
  void libraryStore.refresh();
}

function closeConfirm(): void {
  confirmDeleteId.value = null;
}

function setConfirmDirection(event: MouseEvent): void {
  const rect = (
    event.currentTarget as HTMLElement | null
  )?.getBoundingClientRect();
  if (!rect) {
    confirmDirection.value = 'down';
    return;
  }
  const spaceBelow = window.innerHeight - rect.bottom;
  confirmDirection.value = spaceBelow < 170 ? 'up' : 'down';
  confirmPosition.value = {
    left: rect.left + rect.width / 2,
    top: confirmDirection.value === 'up' ? rect.top - 6 : rect.bottom + 6,
  };
}

function toggleDeleteConfirm(id: string, event: MouseEvent): void {
  if (confirmDeleteId.value === id) {
    confirmDeleteId.value = null;
    return;
  }
  confirmDeleteId.value = id;
  setConfirmDirection(event);
}

function handleWindowClick(event: MouseEvent): void {
  const target = event.target;
  if (addMenuOpen.value) {
    if (target instanceof Element && target.closest(ADD_MENU_SELECTOR)) {
      /* keep open */
    } else {
      addMenuOpen.value = false;
    }
  }
  if (!confirmDeleteId.value) {
    return;
  }
  if (!(target instanceof Element)) {
    closeConfirm();
    return;
  }
  if (target.closest(CONFIRM_POPOVER_SELECTOR)) {
    return;
  }
  closeConfirm();
}

onMounted(() => {
  refreshLibrary();
  window.addEventListener('click', handleWindowClick);
});
onActivated(refreshLibrary);
onUnmounted(() => {
  window.removeEventListener('click', handleWindowClick);
});

watch(
  () => route.name,
  (name) => {
    if (name === 'Library') {
      refreshLibrary();
    }
  },
);
</script>

<template>
  <section class="page library-page">
    <header class="page-header">
      <div class="header-title">
        <h1>Library</h1>
        <p
          v-if="!libraryStore.fileOpsAvailable"
          class="muted"
        >
          File picking is available in Tauri dev only.
        </p>
      </div>
    </header>

    <div class="library-body">
      <div class="library-main">
        <div class="search-row">
          <div class="search-field">
            <Search
              class="search-icon"
              :size="18"
              aria-hidden="true"
            />
            <input
              v-model="searchQuery"
              class="search-input"
              type="text"
              aria-label="Search library"
            >
          </div>
          <div class="add-menu-wrapper">
            <AppTooltip text="Add to Library">
              <BaseButton
                variant="filled-accent"
                class="import-button add-menu-trigger"
                type="button"
                data-guide="library.add-menu"
                :disabled="!libraryStore.fileOpsAvailable"
                @click.stop="addMenuOpen = !addMenuOpen"
              >
                <strong class="plus-icon">+</strong>
              </BaseButton>
            </AppTooltip>
            <div
              v-if="addMenuOpen"
              class="add-menu"
            >
              <button
                class="add-menu-item"
                type="button"
                @click="
                  addMenuOpen = false;
                  libraryStore.addFromFilePicker();
                "
              >
                Add Tab
              </button>
              <button
                class="add-menu-item"
                type="button"
                @click="
                  addMenuOpen = false;
                  libraryStore.addAudioFromFilePicker();
                "
              >
                Add Audio
              </button>
            </div>
          </div>
        </div>

        <div class="type-filter-tabs">
          <button
            class="type-filter-tab"
            :class="{ 'type-filter-tab--active': typeFilter === 'tab' }"
            type="button"
            @click="typeFilter = 'tab'"
          >
            Tabs
          </button>
          <button
            class="type-filter-tab"
            :class="{ 'type-filter-tab--active': typeFilter === 'audio' }"
            type="button"
            @click="typeFilter = 'audio'"
          >
            Audio
          </button>
        </div>

        <section>
          <div
            v-if="sortedItems.length"
            class="list library-list"
          >
            <template
              v-for="entry in displayItems"
              :key="entry.key"
            >
              <div
                v-if="entry.type === 'letter'"
                class="library-letter"
              >
                {{ entry.letter }}
              </div>
              <div
                v-else
                class="list-row"
                :class="{
                  'list-row--confirm': confirmDeleteId === entry.item.id,
                }"
              >
                <div class="row-head">
                  <button
                    class="item-title-button"
                    type="button"
                    @click="openInPlayer(entry.item)"
                  >
                    {{ stripFileExtension(entry.item.title) }}
                  </button>
                  <div
                    class="row-actions"
                    style="max-width: 0"
                  >
                    <div class="open-action">
                      <AppTooltip
                        v-if="!isMissing(entry.item)"
                        text="Open in Player"
                      >
                        <BaseButton
                          variant="primary"
                          class="action-button primary-accent"
                          type="button"
                          @click="openInPlayer(entry.item)"
                        >
                          <ExternalLink
                            :size="16"
                            aria-hidden="true"
                          />
                        </BaseButton>
                      </AppTooltip>
                      <BaseButton
                        v-else
                        class="action-button locate-button"
                        type="button"
                        :disabled="!libraryStore.fileOpsAvailable"
                        @click="libraryStore.relinkViaPicker(entry.item.id)"
                      >
                        Locate
                      </BaseButton>
                    </div>
                    <div class="confirm-actions">
                      <AppTooltip text="Remove from Library">
                        <BaseButton
                          variant="ghost"
                          class="action-button delete confirm-trigger"
                          type="button"
                          @click.stop="
                            toggleDeleteConfirm(entry.item.id, $event)
                          "
                        >
                          <Trash2
                            :size="16"
                            aria-hidden="true"
                          />
                        </BaseButton>
                      </AppTooltip>
                      <div
                        v-if="confirmDeleteId === entry.item.id"
                        class="confirm-popover"
                        :class="{
                          'confirm-popover--up': confirmDirection === 'up',
                        }"
                        :style="{
                          left: `${confirmPosition.left}px`,
                          top: `${confirmPosition.top}px`,
                        }"
                      >
                        <span>Are you sure?</span>
                        <div class="confirm-actions-row">
                          <BaseButton
                            class="confirm-danger"
                            variant="outline-danger"
                            size="sm"
                            type="button"
                            @click.stop="libraryStore.deleteItem(entry.item.id)"
                          >
                            Yes
                          </BaseButton>
                          <BaseButton
                            variant="filled-accent"
                            size="sm"
                            type="button"
                            @click.stop="closeConfirm()"
                          >
                            No
                          </BaseButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="row-meta">
                  <BaseButton
                    v-if="entry.item.kind === 'tab'"
                    class="beatmap-edit-button"
                    variant="outline-accent"
                    size="sm"
                    type="button"
                    @click="openBeatmapEditor(entry.item)"
                  >
                    Edit beatmap
                  </BaseButton>
                  <template v-if="entry.item.kind === 'tab'">
                    <!-- data-guide on the wrapper so the guide
                         highlight resolves whether the row shows the
                         "Song linked" tag OR the "Link Song" CTA. -->
                    <span
                      class="link-song-slot"
                      data-guide="library.link-song"
                    >
                      <span
                        v-if="getLinkedAudioTitle(entry.item)"
                        class="linked-audio-tag"
                      >
                        Song linked
                        <button
                          class="linked-audio-unlink"
                          type="button"
                          aria-label="Unlink Song"
                          @click.stop="libraryStore.unlinkAudio(entry.item.id)"
                        >
                          &times;
                        </button>
                      </span>
                      <BaseButton
                        v-else
                        class="link-song-button"
                        variant="ghost"
                        size="sm"
                        type="button"
                        @click.stop="openAudioLinkDialog(entry.item.id)"
                      >
                        Link Song
                      </BaseButton>
                    </span>
                  </template>
                  <BaseButton
                    v-if="entry.item.kind === 'audio'"
                    class="beatmap-edit-button"
                    variant="outline-accent"
                    size="sm"
                    type="button"
                    data-guide="library.open-beatmap-editor"
                    @click="openSongMapEditor(entry.item)"
                  >
                    Edit
                  </BaseButton>
                  <span
                    v-if="entry.item.kind === 'tab'"
                    class="beatmap-status"
                    :class="{
                      'is-generating':
                        beatmapStore.statusForItem(entry.item.id) ===
                        'generating',
                      'is-error':
                        beatmapStore.statusForItem(entry.item.id) === 'error',
                      'is-ready':
                        beatmapStore.statusForItem(entry.item.id) === 'ready',
                    }"
                  >
                    {{ beatmapStatusText(entry.item) }}
                  </span>
                </div>
              </div>
            </template>
          </div>
          <p
            v-else
            class="muted"
          >
            No library items yet.
          </p>
        </section>
      </div>
    </div>

    <DialogRoot v-model:open="audioLinkDialogOpen">
      <DialogPortal>
        <DialogOverlay class="link-dialog-overlay">
          <DialogContent class="link-dialog">
            <DialogTitle class="link-title">
              Choose Audio
            </DialogTitle>
            <div class="link-search-field">
              <Search
                class="link-search-icon"
                :size="16"
                aria-hidden="true"
              />
              <input
                v-model="audioLinkSearch"
                class="link-search"
                placeholder="Search library"
                @keydown.enter.prevent="
                  ($event.target as HTMLInputElement).blur()
                "
              >
              <BaseButton
                class="link-add"
                variant="outline-accent"
                size="sm"
                type="button"
                @click="handleAddNewAudioForLink()"
              >
                <strong class="plus-icon">+</strong>
              </BaseButton>
            </div>
            <div class="link-list">
              <div class="link-list-content">
                <button
                  v-for="audio in audioLinkCandidates"
                  :key="audio.id"
                  class="link-row"
                  type="button"
                  @click="handleSelectAudioLink(audio.id)"
                >
                  {{ audio.title }}
                </button>
              </div>
            </div>
            <div class="link-actions">
              <BaseButton
                class="link-close"
                variant="outline-accent"
                size="sm"
                type="button"
                @click="audioLinkDialogOpen = false"
              >
                Close
              </BaseButton>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-model:open="libraryStore.duplicateDialogOpen">
      <DialogPortal>
        <DialogOverlay class="duplicate-overlay">
          <DialogContent
            class="duplicate-modal"
            aria-label="Tab already added"
          >
            <p class="duplicate-text">
              This file has already been added to your Library
            </p>
            <BaseButton
              variant="filled-accent"
              type="button"
              @click="libraryStore.closeDuplicateDialog()"
            >
              Ok
            </BaseButton>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<style scoped>
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  display: grid;
  gap: 16px;
}

.page {
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: none;
  padding-left: 0;
  padding-right: 0;
  margin: 0;
}

.page-header {
  display: grid;
  grid-template-columns: 1fr;
  align-items: center;
  row-gap: 10px;
}

.header-title {
  text-align: center;
  width: 100%;
}

.header-title h1 {
  margin: 0;
}

.library-header-actions {
  justify-self: start;
}

.import-button {
  margin-left: 0;
}

.library-body {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  height: 100%;
  min-height: 0;
  width: 100%;
  margin-top: 10px;
  padding-left: 0;
  padding-right: 0;
  max-width: none;
}

.library-main {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 0;
  gap: 16px;
  overflow: visible;
  align-self: start;
  margin-top: 0;
  margin-right: 0;
  max-width: none;
}

.library-main > .search-row,
.library-main > section {
  width: 100%;
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
}

.search-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
  padding-left: 0;
  padding-right: 0;
  max-width: none;
  margin: 0;
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--panel);
}

.search-field {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
  opacity: 0.75;
}

.search-input {
  width: 100%;
  border-color: var(--accent);
  font-size: 1rem;
  height: 40px;
  padding-left: 38px;
}

.search-input:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 65%, transparent);
}

.import-button {
  height: 40px;
  min-height: 40px;
  padding: 0;
  width: 44px;
}

.plus-icon {
  font-size: 1.4rem;
  line-height: 1;
  display: inline-block;
  transform: translateY(-1px);
  color: #0b0e13;
}

.list {
  display: grid;
  gap: 6px;
}

.library-letter {
  color: var(--accent);
  font-weight: 600;
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  padding: 8px 0 2px;
}

.library-list {
  margin-top: 0;
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow: auto;
  overflow-x: hidden;
  width: 100%;
  max-width: none;
  padding-right: 0;
  padding-left: 0 !important;
  padding-bottom: 20px;
  margin-left: 0;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) transparent;
}

.library-list::-webkit-scrollbar {
  width: 8px;
}

.library-list::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 999px;
}

.library-list::-webkit-scrollbar-thumb {
  background: var(--accent);
  border-radius: 999px;
}

.library-list::-webkit-scrollbar-thumb:hover {
  background: rgba(93, 214, 162, 0.85);
}

/* Per-page padding-right override removed — `.main-content` is now
   symmetrically padded in AppLayout so the override is no-op. */

.library-page {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  align-content: flex-start;
  overflow-x: hidden;
}

.library-page .page-header {
  flex: 0 0 auto;
}

.library-page .library-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  align-content: flex-start;
  justify-content: flex-start;
}

.library-page .library-main {
  align-self: flex-start;
  justify-content: flex-start;
  align-content: flex-start;
  align-items: stretch;
}

:deep(.page) {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

:deep(.library-page) {
  padding-left: clamp(20px, 4vw, 40px) !important;
  padding-right: clamp(20px, 4vw, 40px) !important;
}

:deep(.library-body) {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
  justify-content: flex-start !important;
  align-items: flex-start !important;
  column-gap: 10px !important;
}

:deep(.library-main) {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  width: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  align-self: flex-start !important;
  overflow: visible !important;
}

:deep(.search-row),
:deep(.library-main > section),
:deep(.library-list) {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
}

:deep(.library-main > section) {
  padding-left: clamp(10px, 2vw, 20px) !important;
  padding-right: clamp(10px, 2vw, 20px) !important;
}

.list-row {
  display: grid;
  gap: 8px;
  padding: 2px 0;
  border-radius: 12px;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 28px;
}

.beatmap-edit-button.base-button {
  height: 28px;
  min-height: 28px;
  padding: 0 10px;
  font-size: 0.78rem;
}

.beatmap-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1;
}

.beatmap-status.is-generating {
  color: #f2c94c;
  border-color: rgba(242, 201, 76, 0.5);
  background: rgba(242, 201, 76, 0.12);
}

.beatmap-status.is-error {
  color: #ff8a8a;
  border-color: rgba(255, 138, 138, 0.5);
  background: rgba(255, 138, 138, 0.12);
}

.beatmap-status.is-ready {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
  background: color-mix(in srgb, var(--accent) 18%, rgba(255, 255, 255, 0.02));
}

.row-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.item-title-button {
  display: block;
  width: 100%;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  background: transparent;
  border: none;
  color: var(--text);
  font-weight: 600;
  font-size: 1rem;
  line-height: 1.2;
  text-align: left;
  padding: 0;
  cursor: pointer;
  transition: color 0.15s ease;
}

.list-row:hover .item-title-button,
.item-title-button:focus-visible {
  color: var(--accent);
}

.item-title-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow: visible;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    max-width 0.2s ease;
}

.list-row:hover .row-actions,
.list-row:focus-within .row-actions,
.list-row--confirm .row-actions {
  max-width: 260px !important;
  opacity: 1;
  pointer-events: auto;
}

.open-action {
  display: inline-flex;
}

.row-status {
  display: flex;
  justify-content: center;
  width: 24px;
}

.ref-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  display: inline-block;
}

.ref-dot.ok {
  background: var(--accent);
}

.ref-dot.missing {
  background: #f2c94c;
}

.action-button {
  font-weight: 600;
  height: 30px;
  padding: 0 10px;
}

.locate-button.base-button {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  font-weight: 700;
  background: transparent;
}

.locate-button.base-button:hover:not(:disabled),
.locate-button.base-button:focus-visible,
.locate-button.base-button:active {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.primary-accent {
  background: var(--accent);
  color: #0b0e13;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.primary-accent:hover:not(:disabled) {
  filter: brightness(1.05);
}

.primary-accent:active:not(:disabled) {
  filter: brightness(0.95);
}

.action-button.delete {
  color: #ff8b8b;
  border-color: rgba(255, 139, 139, 0.35);
}

.action-button.delete:hover:not(:disabled) {
  background: rgba(255, 139, 139, 0.2);
  color: #1b0f0f;
}

.confirm-actions {
  position: relative;
  display: inline-grid;
  justify-items: center;
}

.confirm-popover {
  position: fixed;
  transform: translateX(-50%);
  display: grid;
  gap: 6px;
  justify-items: center;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  min-width: 140px;
  z-index: 30;
}

.confirm-popover span {
  text-align: center;
}

.confirm-actions-row {
  display: inline-flex;
  gap: 8px;
  justify-content: center;
}

.confirm-popover--up {
  transform: translate(-50%, -100%);
}

.confirm-danger.base-button {
  border: 1px solid rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.confirm-danger.base-button:hover,
.confirm-danger.base-button:focus-visible,
.confirm-danger.base-button:active {
  border-color: rgba(255, 107, 107, 0.9);
  color: #ff8a8a;
  background: transparent;
}

.item-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.pill.ok {
  color: var(--accent);
  border-color: rgba(93, 214, 162, 0.4);
}

.pill.missing {
  color: #ff9b9b;
  border-color: rgba(255, 155, 155, 0.4);
}

input {
  background: #0f141d;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  padding: 8px 12px;
  font-family: inherit;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.muted {
  color: var(--muted);
  font-size: 0.85rem;
}

.duplicate-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--overlay-backdrop);
  z-index: 10030;
}

.duplicate-modal {
  width: min(360px, 92vw);
  padding: 20px 24px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--modal-surface);
  display: grid;
  gap: 16px;
  justify-items: center;
  text-align: center;
}

.duplicate-text {
  margin: 0;
  font-weight: 600;
}

.add-menu-wrapper {
  position: relative;
}

.add-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px 0;
  min-width: 140px;
  z-index: 20;
  display: grid;
  gap: 0;
}

.add-menu-item {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 0.88rem;
  font-family: inherit;
  padding: 8px 14px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.add-menu-item:hover {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

.type-filter-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
}

.type-filter-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  padding: 10px 0;
  cursor: pointer;
  text-align: center;
  outline: none;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.type-filter-tab:hover {
  color: var(--text);
}

.type-filter-tab--active {
  border-bottom-color: var(--accent);
  color: var(--accent);
}

@media (max-width: 800px) {
  .page-header {
    align-items: stretch;
  }

  .import-button {
    align-self: flex-start;
  }
}

.linked-audio-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 6px;
  padding: 2px 6px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.linked-audio-unlink {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 2px;
}

.linked-audio-unlink:hover {
  color: var(--text);
}

.link-song-button.base-button {
  font-size: 0.78rem;
  color: var(--text-muted);
  padding: 2px 8px;
}

.link-song-button.base-button:hover {
  color: var(--accent);
}

.link-dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
}

.link-dialog {
  position: relative;
  width: min(520px, 90vw);
  height: min(70vh, 520px);
  background: var(--modal-surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
}

.link-title {
  text-align: center;
  font-size: 1.05rem;
}

.link-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0 12px 0 6px;
  box-sizing: border-box;
}

.link-search-icon {
  color: var(--text-muted);
  pointer-events: none;
}

.link-search {
  flex: 1;
  background: #0f141d;
  border: 1px solid var(--accent);
  border-radius: 10px;
  color: var(--text);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.95rem;
  height: 36px;
}

:deep(.link-add.base-button) {
  white-space: nowrap;
  height: 36px;
  padding: 0 12px;
  line-height: 1;
}

.link-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px 0 6px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--accent) rgba(255, 255, 255, 0.12);
}

.link-list-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-row {
  display: flex;
  align-items: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.92rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-row:hover {
  border-color: var(--accent);
}

.link-actions {
  display: flex;
  justify-content: center;
}

.link-close {
  padding: 0 10px;
}
</style>
