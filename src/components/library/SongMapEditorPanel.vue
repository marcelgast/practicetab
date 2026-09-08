<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useSongMapStore } from '../../stores/songMap';
import { useLibraryStore } from '../../stores/library';
import { getLibrarySourcePath } from '../../domain/library';
import { sortSections } from '../../domain/songMap';
import type { SongSection } from '../../domain/songMap';
import type { SongSectionInput } from '../../services/songMapPersistence';
import {
  getStoredWaveform,
  computeAndStoreWaveform,
} from '../../services/audioDecodeService';
import {
  songLoad,
  songUnload,
  songPlay,
  songPause,
  songStop,
  songSeek,
  songSetVolume,
  songGetPositionMs,
} from '../../services/songPlaybackService';
import BaseButton from '../ui/BaseButton.vue';
import WaveformCanvas from './WaveformCanvas.vue';
import SectionListEditor from './SectionListEditor.vue';
import BeatmapEditorContent from '../player/BeatmapEditorContent.vue';

const props = defineProps<{
  itemId: string | null;
}>();

const songMapStore = useSongMapStore();
const libraryStore = useLibraryStore();

type EditorTab = 'songmap' | 'beatmap';

const activeTab = ref<EditorTab>('songmap');
const peaks = ref<number[]>([]);
const durationMs = ref(0);
const decodingWaveform = ref(false);
const decodeError = ref<string | null>(null);
const saving = ref(false);
const saveConfirmed = ref(false);
const beatmapEditorRef = ref<{
  saveDrafts: () => void;
  hasBeatmap: boolean;
} | null>(null);

const editSections = ref<SongSection[]>([]);
const editStartOffsetMs = ref(0);
const beatmapTabVisited = ref(false);

// Song playback state
let openGeneration = 0;
const songLoading = ref(false);
const songLoaded = ref(false);
const songPlaying = ref(false);
const previewVolume = ref(0.8);
const autoFollow = ref(true);
const cursorMs = ref<number | undefined>(undefined);
let positionPollTimer: ReturnType<typeof setInterval> | null = null;

const isOpen = computed(
  () => Boolean(props.itemId) && songMapStore.editorItemId === props.itemId,
);

const libraryItem = computed(() => {
  if (!props.itemId) {
    return null;
  }
  return libraryStore.items.find((i) => i.id === props.itemId) ?? null;
});

const sourcePath = computed(() => {
  const item = libraryItem.value;
  if (!item) {
    return null;
  }
  return getLibrarySourcePath(item.source);
});

function syncFromStore(): void {
  const existing = props.itemId ? songMapStore.getSongMap(props.itemId) : null;
  if (existing) {
    editSections.value = [...existing.sections];
    editStartOffsetMs.value = existing.startOffsetMs;
  } else {
    editSections.value = [];
    editStartOffsetMs.value = 0;
  }
}

async function loadWaveform(): Promise<void> {
  const itemId = props.itemId;
  const path = sourcePath.value;
  if (!itemId || !path) {
    peaks.value = [];
    durationMs.value = 0;
    return;
  }

  decodingWaveform.value = true;
  decodeError.value = null;
  try {
    const stored = await getStoredWaveform(itemId);
    if (stored) {
      peaks.value = stored.peaks;
      durationMs.value = stored.durationMs;
      return;
    }

    const result = await computeAndStoreWaveform(itemId, path, 8000);
    peaks.value = result.peaks;
    durationMs.value = result.durationMs;
  } catch (err) {
    decodeError.value = String(err);
    peaks.value = [];
    durationMs.value = 0;
  } finally {
    decodingWaveform.value = false;
  }
}

async function refreshWaveform(): Promise<void> {
  const itemId = props.itemId;
  const path = sourcePath.value;
  if (!itemId || !path || decodingWaveform.value) {
    return;
  }
  decodingWaveform.value = true;
  decodeError.value = null;
  try {
    const result = await computeAndStoreWaveform(itemId, path, 8000);
    peaks.value = result.peaks;
    durationMs.value = result.durationMs;
  } catch (err) {
    decodeError.value = String(err);
  } finally {
    decodingWaveform.value = false;
  }
}

async function save(): Promise<void> {
  if (!props.itemId || saving.value) {
    return;
  }
  saving.value = true;
  try {
    // Always save song map
    const sectionInputs: SongSectionInput[] = editSections.value.map(
      (s, i) => ({
        id: s.id,
        label: s.label,
        color: s.color,
        timestampMs: s.timestampMs,
        sortOrder: i,
      }),
    );
    await songMapStore.save(props.itemId, {
      startOffsetMs: editStartOffsetMs.value,
      sections: sectionInputs,
    });
    syncFromStore();

    // Also save beatmap if one exists
    if (beatmapEditorRef.value?.hasBeatmap) {
      beatmapEditorRef.value.saveDrafts();
    }
    saveConfirmed.value = true;
    setTimeout(() => {
      saveConfirmed.value = false;
    }, 2000);
  } finally {
    saving.value = false;
  }
}

function close(): void {
  openGeneration++;
  unloadSongAudio();
  songMapStore.closeEditor();
  activeTab.value = 'songmap';
  beatmapTabVisited.value = false;
}

function onUpdateSections(sections: SongSection[]): void {
  editSections.value = sortSections(sections);
}

function onUpdateStartOffset(ms: number): void {
  editStartOffsetMs.value = Math.max(0, ms);
}

function onStartOffsetInput(event: Event): void {
  const val = Number((event.target as HTMLInputElement).value);
  editStartOffsetMs.value = Math.max(0, Math.round(val));
}

function onUpdateSectionTime(payload: {
  sectionId: string;
  timestampMs: number;
}): void {
  editSections.value = editSections.value.map((s) =>
    s.id === payload.sectionId
      ? { ...s, timestampMs: Math.max(0, payload.timestampMs) }
      : s,
  );
}

async function onClickTime(ms: number): Promise<void> {
  if (songLoaded.value) {
    await songSeek(ms);
    cursorMs.value = ms;
  }
}

async function loadSongAudio(): Promise<void> {
  const path = sourcePath.value;
  if (!path) return;
  songLoading.value = true;
  try {
    await songLoad(path);
    songLoaded.value = true;
    await songSetVolume(previewVolume.value);
  } catch {
    songLoaded.value = false;
  } finally {
    songLoading.value = false;
  }
}

async function unloadSongAudio(): Promise<void> {
  stopPositionPolling();
  songPlaying.value = false;
  cursorMs.value = undefined;
  if (songLoaded.value) {
    await songUnload();
    songLoaded.value = false;
  }
}

async function onSongPlay(): Promise<void> {
  if (!songLoaded.value) return;
  // If cursor is at the start (or undefined), apply start offset
  if (cursorMs.value === undefined || cursorMs.value === 0) {
    await songSeek(editStartOffsetMs.value);
    cursorMs.value = editStartOffsetMs.value;
  }
  await songPlay();
  songPlaying.value = true;
  startPositionPolling();
}

function onTogglePlayPause(): void {
  if (songPlaying.value) {
    void onSongPause();
  } else {
    void onSongPlay();
  }
}

function onPreviewVolumeChange(event: Event): void {
  const val = Number((event.target as HTMLInputElement).value);
  previewVolume.value = val;
  if (songLoaded.value) {
    void songSetVolume(val);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return;
  // Don't intercept spacebar when typing in an input/textarea
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }
  if (event.code === 'Space' && activeTab.value === 'songmap') {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    onTogglePlayPause();
  }
}

async function onSongPause(): Promise<void> {
  await songPause();
  songPlaying.value = false;
  stopPositionPolling();
}

async function onSongStop(): Promise<void> {
  await songStop();
  songPlaying.value = false;
  cursorMs.value = 0;
  stopPositionPolling();
}

function startPositionPolling(): void {
  stopPositionPolling();
  positionPollTimer = setInterval(async () => {
    if (!songPlaying.value) {
      stopPositionPolling();
      return;
    }
    const pos = await songGetPositionMs();
    cursorMs.value = pos;
    // Auto-stop when reaching end
    if (durationMs.value > 0 && pos >= durationMs.value) {
      songPlaying.value = false;
      stopPositionPolling();
    }
  }, 50);
}

function stopPositionPolling(): void {
  if (positionPollTimer !== null) {
    clearInterval(positionPollTimer);
    positionPollTimer = null;
  }
}

watch(
  () => [isOpen.value, props.itemId],
  ([open]) => {
    if (!open || !props.itemId) {
      if (!open) {
        unloadSongAudio();
      }
      return;
    }
    // Load song map + waveform first (fast DB reads), then audio (heavy decode)
    const itemId = props.itemId;
    const gen = ++openGeneration;
    void Promise.all([
      songMapStore.load(itemId).then(() => {
        if (gen === openGeneration) syncFromStore();
      }),
      loadWaveform(),
    ]).then(() => {
      if (gen === openGeneration && isOpen.value) {
        void loadSongAudio();
      }
    });
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  unloadSongAudio();
});
</script>

<template>
  <div
    v-if="isOpen"
    class="songmap-editor-panel"
  >
    <div class="songmap-editor-content">
      <div class="songmap-editor-header">
        <h3>Song Map Editor</h3>
        <div class="songmap-editor-actions">
          <BaseButton
            size="sm"
            type="button"
            :disabled="decodingWaveform"
            @click="refreshWaveform"
          >
            {{ decodingWaveform ? 'Refreshing...' : 'Refresh Waveform' }}
          </BaseButton>
          <BaseButton
            size="sm"
            variant="filled-accent"
            type="button"
            data-guide="song-map-editor.save"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? 'Saving...' : saveConfirmed ? 'Saved ✓' : 'Save' }}
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

      <div
        class="tab-switcher"
        data-guide="song-map-editor.tabs"
      >
        <button
          class="tab-button"
          :class="{ 'tab-button--active': activeTab === 'songmap' }"
          type="button"
          @click="activeTab = 'songmap'"
        >
          Song Map
        </button>
        <button
          class="tab-button"
          :class="{ 'tab-button--active': activeTab === 'beatmap' }"
          type="button"
          @click="
            activeTab = 'beatmap';
            beatmapTabVisited = true;
          "
        >
          Beat Map
        </button>
      </div>

      <div
        v-if="activeTab === 'songmap'"
        class="songmap-tab-content"
      >
        <div
          v-if="decodingWaveform"
          class="loading-state"
        >
          <span class="decode-spinner" />
          <span>Decoding waveform…</span>
        </div>
        <div
          v-else-if="decodeError"
          class="error-state"
        >
          Failed to decode waveform: {{ decodeError }}
        </div>
        <template v-else>
          <div
            class="playback-controls"
            data-guide="song-map-editor.playback"
          >
            <button
              class="playback-icon-btn"
              type="button"
              :disabled="!songLoaded"
              :title="songPlaying ? 'Pause (Space)' : 'Play (Space)'"
              @click="onTogglePlayPause"
            >
              <span v-if="songPlaying">⏸</span>
              <span v-else>▶</span>
            </button>
            <button
              class="playback-icon-btn"
              type="button"
              :disabled="!songLoaded"
              title="Stop"
              @click="onSongStop"
            >
              ⏹
            </button>
            <span
              v-if="songLoading"
              class="song-loading-hint"
            >
              Loading audio…
            </span>
            <button
              class="playback-toggle-btn"
              :class="{ 'is-active': autoFollow }"
              type="button"
              title="Auto Follow"
              @click="autoFollow = !autoFollow"
            >
              AF
            </button>
            <div class="preview-volume">
              <span class="preview-volume-label">Vol</span>
              <input
                type="range"
                class="preview-volume-slider"
                min="0"
                max="1"
                step="0.01"
                :value="previewVolume"
                @input="onPreviewVolumeChange"
              >
            </div>
          </div>

          <div data-guide="song-map-editor.waveform">
            <WaveformCanvas
              :peaks="peaks"
              :duration-ms="durationMs"
              :start-offset-ms="editStartOffsetMs"
              :sections="editSections"
              :cursor-ms="cursorMs"
              :auto-follow="autoFollow"
              @click-time="onClickTime"
              @update:start-offset="onUpdateStartOffset"
              @update:section-time="onUpdateSectionTime"
            />
          </div>
        </template>

        <div
          class="start-offset-row"
          data-guide="song-map-editor.start-offset"
        >
          <label class="start-offset-label">
            Start Offset (ms)
            <div class="offset-input-group">
              <button
                class="offset-step-button"
                type="button"
                @click="editStartOffsetMs = Math.max(0, editStartOffsetMs - 10)"
              >
                -
              </button>
              <input
                type="number"
                class="start-offset-input"
                :value="editStartOffsetMs"
                min="0"
                step="100"
                @change="onStartOffsetInput"
              >
              <button
                class="offset-step-button"
                type="button"
                @click="editStartOffsetMs = editStartOffsetMs + 10"
              >
                +
              </button>
            </div>
          </label>
        </div>

        <div data-guide="song-map-editor.sections">
          <SectionListEditor
            v-if="itemId"
            :sections="editSections"
            :library-item-id="itemId"
            :cursor-ms="cursorMs ?? 0"
            @update:sections="onUpdateSections"
          />
        </div>
      </div>

      <div
        v-show="activeTab === 'beatmap'"
        class="beatmap-tab-content"
      >
        <BeatmapEditorContent
          v-if="itemId && beatmapTabVisited"
          ref="beatmapEditorRef"
          :item-id="itemId"
          :always-open="true"
          :audio-duration-ms="durationMs"
          @close="activeTab = 'songmap'"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.songmap-editor-panel {
  position: absolute;
  inset: 0;
  z-index: 250;
  display: flex;
  flex-direction: column;
  /* Vertical scroll only — the editor must stay inside the aside
   * and not push it sideways. Wide children (waveform,
   * section-list, nested beatmap editor) scroll locally if
   * needed. */
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg, #0c0f14);
  padding: 28px clamp(20px, 4vw, 40px);
  min-width: 0;
}

.songmap-editor-content {
  width: 100%;
  display: grid;
  /* Lock the grid column to container width so wide children
   * don't widen the editor. */
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  max-width: 100%;
}

.songmap-editor-content > * {
  min-width: 0;
  max-width: 100%;
}

/* Local scroll ONLY on the sub-sections that genuinely render
 * wide content — waveform canvas + section list. The tab switcher
 * and playback-controls rows are small and should lay out
 * naturally; a blanket overflow-x: auto on them was collapsing
 * the tab-switcher grid to a couple of pixels tall (both buttons
 * disappearing behind the scroll container). */
[data-guide='song-map-editor.waveform'],
[data-guide='song-map-editor.sections'] {
  overflow-x: auto;
}

.songmap-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.songmap-editor-header h3 {
  margin: 0;
}

.songmap-editor-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tab-switcher {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--border);
}

.tab-button {
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

.tab-button:hover {
  color: var(--text);
}

.tab-button--active {
  border-bottom-color: var(--accent);
  color: var(--accent);
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.playback-icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--accent);
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    opacity 0.15s ease;
}

.playback-icon-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}

.playback-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.song-loading-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  animation: pulse-hint 1.5s ease-in-out infinite;
}

@keyframes pulse-hint {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.playback-toggle-btn {
  height: 24px;
  padding: 0 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.65rem;
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.playback-toggle-btn.is-active {
  color: var(--accent);
  border-color: var(--accent);
}

.preview-volume {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.preview-volume-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 600;
}

.preview-volume-slider {
  width: 80px;
  height: 4px;
  accent-color: var(--accent);
}

.songmap-tab-content {
  display: grid;
  gap: 12px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 20px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.decode-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: decode-spin 0.8s linear infinite;
}

@keyframes decode-spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  padding: 12px;
  text-align: center;
  color: #ff8a8a;
  font-size: 0.85rem;
  border: 1px solid rgba(255, 138, 138, 0.3);
  border-radius: 8px;
  background: rgba(255, 138, 138, 0.06);
}

.start-offset-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.start-offset-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.offset-input-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.offset-step-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease;
}

.offset-step-button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.start-offset-input {
  width: 80px;
  background: #0f1218;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  padding: 6px 8px;
  font-size: 0.86rem;
  font-family: inherit;
  text-align: center;
}

.beatmap-tab-content {
  display: grid;
  gap: 12px;
}
</style>
