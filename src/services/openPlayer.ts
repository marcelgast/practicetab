import type { LibraryItem } from '../domain/library';
import type { usePlayerStore } from '../stores/player';
import type { useUiStore } from '../stores/ui';
import type { useSongStore } from '../stores/song';
import type { useLibraryStore } from '../stores/library';
import { usePracticeUiStore } from '../stores/practiceUi';
import { usePracticeStore } from '../stores/practice';
import { setTabVolume } from './audioCommands';

type PlayerStore = ReturnType<typeof usePlayerStore>;
type UiStore = ReturnType<typeof useUiStore>;
type SongStore = ReturnType<typeof useSongStore>;
type LibraryStore = ReturnType<typeof useLibraryStore>;

export async function openLibraryItemInPlayer(
  item: LibraryItem,
  playerStore: PlayerStore,
  uiStore: UiStore,
  source: 'library' | 'practice' = 'library',
  songStore?: SongStore,
  libraryStore?: LibraryStore,
): Promise<void> {
  uiStore.openPlayerPanel();
  // A library-path load is an explicit context switch: the user is
  // practising this tab/audio, not whatever exercise was still expanded
  // from before. Drop the exercise expansion so the bottom-bar timer
  // badge reflects what's actually loaded and playback-time routing
  // accrues to the session rather than the stale exercise bucket.
  if (source === 'library') {
    const practiceUi = usePracticeUiStore();
    const practice = usePracticeStore();
    if (practice.activeExerciseId) {
      await practice.stopExercise();
    }
    practiceUi.setExpandedExerciseId(null);
    practiceUi.expandedItemByPlan = {};
  }
  if (item.kind === 'audio' && songStore) {
    // Loading audio from library: close any open tab first
    if (playerStore.model.currentLibraryItemId) {
      playerStore.clearSelection();
    }
    // Song-only loads don't otherwise touch the player source, but the
    // bottom-bar timer badge + playback routing use it to distinguish
    // library-path loads from practice-path ones.
    playerStore.setPlaybackSource(source);
    await songStore.load(item.id);
    return;
  }
  // Close any open song that's not linked to this tab
  if (songStore?.isLoaded) {
    await songStore.unload();
  }
  await playerStore.openLibraryItem(item, source);
  // Auto-load linked song when opening tab from Library (not Exercise).
  // Dual mode is only available for linked library entries.
  if (source === 'library' && item.linkedAudioId && songStore && libraryStore) {
    const audioItem = libraryStore.getLinkedAudio(item.id);
    if (audioItem) {
      await songStore.load(audioItem.id);
      // Mute tab audio in dual mode — tab provides visuals + beatmap only
      void setTabVolume(0);
    }
  }
}
