import type { Guide } from './types';

/**
 * Stats-page guide — orients users to the three top-level tabs
 * and the General overview layout. Anchors for In-Depth and
 * Feedback are on the tabs themselves (always mounted), so the
 * guide runs even if those tabs haven't been opened yet.
 */
export const statsGuide: Guide = {
  id: 'stats',
  title: 'Stats',
  description:
    'The three Stats tabs and the General overview. Run this from the General tab so the overview anchor resolves.',
  route: '/stats',
  steps: [
    {
      selector: '[data-guide="stats.nav"]',
      title: 'Navigation',
      body: 'Three top-level views. General covers everyday summary numbers; In-Depth drills into a specific plan / exercise / library item; Feedback lists every Live-Feedback run.',
    },
    {
      selector: '[data-guide="stats.overview"]',
      title: 'General sections',
      body: 'Sub-sections of the General tab. Session / Today is the day-by-day view; Trends shows long-term progress; Overview pulls lifetime and recent-window numbers together; Session Journal lists every saved goal/review entry. Anchor sits on the nav so the guide works in the default state (no section yet picked).',
    },
    {
      selector: '[data-guide="stats.indepth-tab"]',
      title: 'In-Depth',
      body: 'Drill into one thing at a time. Pick a plan to see its exercises, select an exercise for its BPM history and mode breakdown, or switch to the Library sub-tab to see per-tab / per-audio time.',
    },
    {
      selector: '[data-guide="stats.feedback-tab"]',
      title: 'Feedback',
      body: 'Every Live-Feedback run you have ever recorded — newest first. Click a run to see the pitch / timing histograms, the note timeline, and the pitch-vs-timing split.',
    },
  ],
};
