/**
 * Central registry for every guide in the onboarding flow.
 *
 * `GUIDES` is the single source of truth the UI renders from and
 * the runner dispatches against. Adding a new guide is a two-file
 * change: drop a new definition file alongside this one, then
 * import + list it below.
 *
 * Guide ordering in `GUIDE_IDS` (see `types.ts`) drives the order
 * of rows in `GuidesColumn` — kept in one place so the UI can't
 * drift from the registry.
 */

import type { Guide, GuideId } from './types';
import { GUIDE_IDS } from './types';
import { practiceGuide } from './practice';
import { libraryGuide } from './library';
import { beatmapEditorGuide } from './beatmapEditor';
import { songMapEditorGuide } from './songMapEditor';
import { metronomeGuide } from './metronome';
import { statsGuide } from './stats';
import { playerGuide } from './player';

export const GUIDES: Record<GuideId, Guide> = {
  practice: practiceGuide,
  library: libraryGuide,
  'beatmap-editor': beatmapEditorGuide,
  'song-map-editor': songMapEditorGuide,
  metronome: metronomeGuide,
  stats: statsGuide,
  player: playerGuide,
};

/** Iteration order matches `GUIDE_IDS` — prefer this over
 *  `Object.values(GUIDES)` in rendering paths so row order is
 *  deterministic. */
export const GUIDE_LIST: readonly Guide[] = GUIDE_IDS.map((id) => GUIDES[id]);

export function getGuide(id: GuideId): Guide {
  return GUIDES[id];
}
