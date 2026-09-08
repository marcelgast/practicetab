import { useLibraryStore } from '../../stores/library';
import { useBeatmapStore } from '../../stores/beatmap';
import type { Guide } from './types';

/**
 * Beatmap-editor guide — walks through the standalone beatmap
 * editor (opened via the Edit action / the Library → Practice
 * flow). It teaches how to set the end bar, read/edit the bar
 * timeline, add tempo/time events, and add loop regions.
 *
 * Prereqs: at least one audio item in the library AND that audio
 * already has a saved beatmap. Without a beatmap, the editor
 * renders `<BeatmapInitialForm>` instead of the timeline / events /
 * loop sections — only the Save anchor exists in that state, so
 * the guide would skip 4 of 5 steps and show "Showing 1 of 5
 * steps" toast. The Help-panel row stays locked with a
 * discoverable tooltip until both prereqs are satisfied.
 */

const REQUIRES_AUDIO_AND_BEATMAP_TOOLTIP =
  'Open an audio file from the Library and save its initial beatmap first.';

function firstAudioWithBeatmap(): string | null {
  const libraryStore = useLibraryStore();
  const beatmapStore = useBeatmapStore();
  const audioItem = libraryStore.items.find(
    (item) =>
      item.kind === 'audio' && beatmapStore.statusForItem(item.id) === 'ready',
  );
  return audioItem?.id ?? null;
}

/** Open the beatmap editor against the first audio item the user
 *  has with a ready beatmap. We're guaranteed to find one because
 *  the Help-panel row was locked otherwise. */
async function openBeatmapEditor(): Promise<void> {
  const audioId = firstAudioWithBeatmap();
  if (!audioId) return;
  useBeatmapStore().openEditor(audioId);
}

export const beatmapEditorGuide: Guide = {
  id: 'beatmap-editor',
  title: 'Beatmap editor',
  description:
    'Set the end bar, edit the tempo map, and add loop regions. Requires an audio item with an existing beatmap.',
  route: '/library',
  isAvailable: () => firstAudioWithBeatmap() !== null,
  unavailableReason: REQUIRES_AUDIO_AND_BEATMAP_TOOLTIP,
  steps: [
    {
      selector: '[data-guide="beatmap-editor.end-bar"]',
      title: 'End bar',
      body: 'First decision: how many bars the song lasts. Setting the right end bar is what lets the rest of the timing math line up; tweak it here any time.',
      prepare: openBeatmapEditor,
    },
    {
      selector: '[data-guide="beatmap-editor.timeline"]',
      title: 'Bar timeline',
      body: 'Visual bar strip. Click a bar to highlight it — useful when cross-referencing with the song or dropping a marker/loop at that position.',
      prepare: openBeatmapEditor,
    },
    {
      selector: '[data-guide="beatmap-editor.time-events"]',
      title: 'Time events',
      body: 'BPM and time-signature changes through the song. Add an event at bar X to say "from here the tempo changes to Y" — the player and metronome follow it automatically.',
      prepare: openBeatmapEditor,
    },
    {
      selector: '[data-guide="beatmap-editor.loop-events"]',
      title: 'Loop events',
      body: 'Pre-defined playback loops. Useful for marking a pre-chorus you want to drill without selecting the range by hand every run.',
      prepare: openBeatmapEditor,
    },
    {
      selector: '[data-guide="beatmap-editor.save"]',
      title: 'Save',
      body: 'Commits your changes. Without saving, everything above lives only in the draft and is lost when you close the editor.',
      prepare: openBeatmapEditor,
    },
  ],
  // Close the editor when the guide ends so the user lands back on
  // the Library page in the same state they started in. The first
  // step's `prepare` opens the editor on their behalf — without
  // this cleanup they'd be left in an editor they didn't manually
  // open, which doesn't match their mental model.
  onCleanup: () => {
    useBeatmapStore().closeEditor();
  },
};
