import type { Guide } from './types';

/**
 * Library-page guide — uploading tabs + audio, linking a song to
 * a tab, and opening the audio-beatmap editor.
 *
 * The upload path goes through a single + menu trigger (step 1);
 * linking and beatmap editing live on existing library rows so the
 * guide "works best" after the user has at least one tab and one
 * audio item. Description says so up front.
 */
export const libraryGuide: Guide = {
  id: 'library',
  title: 'Library',
  description:
    'Upload tabs and audio, link songs to tabs, create audio beatmaps. Works best after you have at least one tab and one audio in your library.',
  route: '/library',
  steps: [
    {
      selector: '[data-guide="library.add-menu"]',
      title: 'Add to Library',
      body: 'Click + to open the Add menu. Pick Add Tab for Guitar Pro files or Add Audio for MP3, WAV, FLAC, or OGG. Everything stays local on your machine.',
    },
    {
      selector: '[data-guide="library.link-song"]',
      title: 'Link a song to a tab',
      body: 'On a tab row without audio attached, Link Song attaches an existing library audio file. The Player then plays tab and song together — good for practicing against the real recording.',
    },
    {
      selector: '[data-guide="library.open-beatmap-editor"]',
      title: 'Open the audio beatmap editor',
      body: 'Edit opens the beatmap editor for this audio: tap out bar positions so the app can line the audio up with the metronome and seek cleanly. Required for synced playback when the song has tempo changes.',
    },
  ],
};
