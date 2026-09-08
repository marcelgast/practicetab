import { useLibraryStore } from '../../stores/library';
import { useSongMapStore } from '../../stores/songMap';
import type { Guide } from './types';

/**
 * Song-map-editor guide — walks through the waveform-driven
 * editor that shows up when you hit Edit on an audio row. It
 * covers the tab switcher (Song Map / Beat Map), waveform
 * playback, section editing, the start-offset alignment, and
 * saving.
 *
 * Like the beatmap guide, this needs at least one audio item in
 * the library. The Help-panel row is locked (disabled Take
 * button + tooltip) until the user adds one — see `isAvailable`.
 */

const REQUIRES_AUDIO_TOOLTIP = 'Add an audio file to your library first.';

function firstAudioId(): string | null {
  const libraryStore = useLibraryStore();
  const audio = libraryStore.items.find((item) => item.kind === 'audio');
  return audio?.id ?? null;
}

async function openSongMapEditor(): Promise<void> {
  const audioId = firstAudioId();
  if (!audioId) return;
  const songMapStore = useSongMapStore();
  songMapStore.openEditor(audioId);
  // Kick off the waveform decode so the Song Map tab has peaks to
  // draw when the first step highlights it.
  await songMapStore.load(audioId);
}

export const songMapEditorGuide: Guide = {
  id: 'song-map-editor',
  title: 'Song map editor',
  description:
    'Sync a tab to audio — waveform, sections, start offset, and the nested Beat Map tab. Requires at least one audio item in your library.',
  route: '/library',
  isAvailable: () =>
    useLibraryStore().items.some((item) => item.kind === 'audio'),
  unavailableReason: REQUIRES_AUDIO_TOOLTIP,
  steps: [
    {
      selector: '[data-guide="song-map-editor.tabs"]',
      title: 'Song Map vs Beat Map',
      body: 'Two sub-tools on the same audio: the Song Map tab (here) handles waveform, sections, and alignment. The Beat Map tab is the same editor you would get standalone — tempo events and loop regions.',
      prepare: openSongMapEditor,
    },
    {
      selector: '[data-guide="song-map-editor.playback"]',
      title: 'Preview playback',
      body: 'Play / pause / stop for the audio preview, plus Auto Follow (keeps the cursor in view) and a preview volume slider. Good for scrubbing to the moment you want to drop a section marker.',
      prepare: openSongMapEditor,
    },
    {
      selector: '[data-guide="song-map-editor.waveform"]',
      title: 'Waveform',
      body: 'Click to seek. Dragging section boundaries on the waveform updates their times directly — the section list underneath updates live.',
      prepare: openSongMapEditor,
    },
    {
      selector: '[data-guide="song-map-editor.start-offset"]',
      title: 'Start offset',
      body: 'Milliseconds of silence before beat 1. Nudge with ± 10 ms to align bar 1 with the first downbeat — this is what lets the tab and audio stay in sync when playback starts.',
      prepare: openSongMapEditor,
    },
    {
      selector: '[data-guide="song-map-editor.sections"]',
      title: 'Sections',
      body: 'Name the parts of the song (Intro, Verse, Chorus, …). Sections show up on the waveform above and make looping a specific part a one-click affair in the Player.',
      prepare: openSongMapEditor,
    },
    {
      selector: '[data-guide="song-map-editor.save"]',
      title: 'Save',
      body: 'Commits both the song-map changes and any edits made on the nested Beat Map tab. Close without saving and the draft is discarded.',
      prepare: openSongMapEditor,
    },
  ],
  // Close the editor when the guide ends so the user lands back on
  // the Library page in the same state they started in (same as
  // beatmap-editor — see that guide's onCleanup for the rationale).
  onCleanup: () => {
    useSongMapStore().closeEditor();
  },
};
