import type { Guide } from './types';

/**
 * Metronome-page guide — tempo, feel, volume, sound, plus the
 * interval-mode entry point. Every anchor is always mounted when
 * the page renders, so this guide doesn't need any setup state.
 */
export const metronomeGuide: Guide = {
  id: 'metronome',
  title: 'Metronome',
  description:
    'Tempo, tap-tempo, subdivisions, accents, volume, sound, time signature, and transport.',
  route: '/metronome',
  steps: [
    {
      selector: '[data-guide="metronome.tempo"]',
      title: 'Set the tempo',
      body: 'Type a BPM or scroll over the input to nudge it. Enter commits immediately.',
    },
    {
      selector: '[data-guide="metronome.tap-tempo"]',
      title: 'Tap tempo',
      body: 'Tap this button in time with the music you want to match — after a few taps the BPM updates to the average.',
    },
    {
      selector: '[data-guide="metronome.time-signature"]',
      title: 'Time signature',
      body: 'Pick the meter. Common signatures live in the top section; odd meters are in the scrollable list below.',
    },
    {
      selector: '[data-guide="metronome.subdivision"]',
      title: 'Subdivisions',
      body: 'Adds extra clicks per beat — 2 for eighths, 3 for triplets, and so on. OFF plays only the downbeat clicks.',
    },
    {
      selector: '[data-guide="metronome.accents"]',
      title: 'Accent pattern',
      body: 'Click each beat to cycle through silent / quiet / normal / accent. This is how you tell the metronome where the 1 goes in odd meters or displaced feels.',
    },
    {
      selector: '[data-guide="metronome.volume"]',
      title: 'Volume',
      body: 'Per-metronome volume. The global output-device volume is in Settings; this slider controls the metronome mix on top.',
    },
    {
      selector: '[data-guide="metronome.sound-mode"]',
      title: 'Sound',
      body: 'Switch the click between synth (Tock / Blip / Hype) and real drum-kit samples (Drum Kit, Metal Kit, Mighty Kit). Useful when the default click blends into the tab you are practicing over.',
    },
    {
      selector: '[data-guide="metronome.interval-mode"]',
      title: 'Interval mode',
      body: 'Turn Interval Mode on to chain BPM steps with timers — practise 80 bpm for 60 s, then 90 bpm for 60 s, and so on. The controls below set the durations, increments, and whether to mute clicks during rest.',
    },
    {
      selector: '[data-guide="metronome.play-stop"]',
      title: 'Start and stop',
      body: 'Kick the metronome off and stop it here. Spacebar works too.',
    },
  ],
};
