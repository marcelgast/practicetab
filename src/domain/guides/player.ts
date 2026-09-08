import type { Guide } from './types';

/**
 * Player guide — top-bar (Track / Volume / Display) and bottom-bar
 * transport (Play / Pause / Stop / Loop / Metronome + BPM + Session
 * timer). Works best when a tab is loaded, because Display, loop,
 * metronome-sync, and pause/stop all disable without a selection.
 */
export const playerGuide: Guide = {
  id: 'player',
  title: 'Player',
  description:
    'Top-bar controls (Track, Volume, Display) and transport + BPM + session timer. Run this with a tab open so every control is active.',
  route: '/player',
  steps: [
    {
      selector: '[data-guide="player.track"]',
      title: 'Track selector',
      body: 'Pick which AlphaTab track plays and which is rendered. Opens the Track Manager with per-track volume, solo, and mute.',
    },
    {
      selector: '[data-guide="player.volume"]',
      title: 'Volume',
      body: 'Master volume for the Player. Device-level output volume lives in Settings; this is the per-song mix.',
    },
    {
      selector: '[data-guide="player.display"]',
      title: 'Display mode',
      body: 'Toggle staff-and-tab vs tab-only, and one-liner vs multi-line layout. One-liner reads like a teleprompter and is usually faster to follow.',
    },
    {
      selector: '[data-guide="player.play"]',
      title: 'Play',
      body: 'Start playback. Spacebar toggles play/pause from anywhere in the Player.',
    },
    {
      selector: '[data-guide="player.pause"]',
      title: 'Pause',
      body: 'Pause without resetting the playhead. Hit Play (or Space) to resume from the same position.',
    },
    {
      selector: '[data-guide="player.stop"]',
      title: 'Stop',
      body: 'Stop playback and return the playhead to the start (or the start of the selected loop region if one is set).',
    },
    {
      selector: '[data-guide="player.loop"]',
      title: 'Loop file',
      body: 'Loops the currently-loaded tab or song end-to-end. For a section loop, select a range on the tab first.',
    },
    {
      selector: '[data-guide="player.metronome"]',
      title: 'Metronome sync',
      body: 'Plays the metronome alongside the tab or song, locked to its tempo map. Turn off for silent-metronome practice or when a backing track already provides the pulse.',
    },
    {
      selector: '[data-guide="player.bpm"]',
      title: 'Tempo',
      body: 'Type a BPM or use ↑/↓ keys to nudge. Disabled while playing and whenever the source is locked (song playback with a beatmap drives its own tempo).',
    },
    {
      selector: '[data-guide="player.session-timer"]',
      title: 'Session timer',
      body: 'Start / pause the practice-session timer in the bottom-left. Everything you do across pages while this runs counts toward the session and feeds the Stats page.',
    },
  ],
};
