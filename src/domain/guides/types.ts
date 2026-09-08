/**
 * Type contract for the guided-onboarding feature ("Guides").
 *
 * The runner layer (`useGuideRunner`) walks a `Guide.steps[]` list
 * and points the driver.js overlay at each step's `selector`. The
 * UI layer (`GuidesColumn`, `OnboardingWelcomeDialog`) renders the
 * list of guides by id and tracks completion via the guide store.
 *
 * Keeping types in a dedicated file (rather than inside the
 * registry) means consumers can import just the types without
 * pulling in the per-guide step arrays.
 */

/** Stable identifier for each guide. Order here is the order the
 *  GuidesColumn renders them in — Practice first because that's the
 *  page most users land on, then Library and its two editors
 *  (beatmap + song-map), then the remaining pages. */
export const GUIDE_IDS = [
  'practice',
  'library',
  'beatmap-editor',
  'song-map-editor',
  'metronome',
  'stats',
  'player',
] as const;

export type GuideId = (typeof GUIDE_IDS)[number];

export type GuideStep = {
  /** CSS selector the overlay highlights. Convention is
   *  `[data-guide="<guide>.<slug>"]` so step anchors don't depend
   *  on class names or DOM structure that might change under a
   *  refactor. */
  selector: string;
  /** Short headline (shown as the popover title). 1–4 words. */
  title: string;
  /** One or two sentences. First sentence: what the control does.
   *  Second (optional): when to use it. No fluff, no emojis. */
  body: string;
  /**
   * Optional callback that runs BEFORE the runner highlights this
   * step. Used for steps whose anchor only mounts once the page is
   * in a particular state — the Practice guide, for example, needs
   * a plan to exist + be expanded + edit-mode + first exercise
   * expanded before the per-exercise controls are visible.
   *
   * The runner awaits the returned promise, then waits one frame
   * for DOM to settle, then checks the selector again.
   */
  prepare?: () => void | Promise<void>;
  /**
   * Optional pre-flight predicate evaluated at startGuide time.
   * Returning `false` filters the step out before the run starts,
   * so the runner can surface its "Showing N of M steps" partial
   * toast and avoid silently bouncing through a prepare that
   * cannot produce its anchor.
   *
   * Use this when a step's `prepare` is conditional on user state
   * the prepare itself can't change (e.g. "skip when the user has
   * real practice plans because we won't seed demo data on top").
   * For steps that always work given enough time, omit it — the
   * runner still polls for the anchor after prepare runs.
   */
  requires?: () => boolean;
};

export type Guide = {
  id: GuideId;
  /** Human-readable name rendered in the Help dropdown row. */
  title: string;
  /** One-line summary under the title. Never shown during a run. */
  description: string;
  /** Route path the guide targets (e.g. `/practice`). The runner
   *  navigates here before starting the guide if the user is on a
   *  different page, and waits for the page to mount so the first
   *  step's anchor can resolve. */
  route: string;
  steps: GuideStep[];
  /**
   * Optional pre-flight check. When this returns `false` the
   * Help dropdown renders the row as locked (disabled Take button
   * + tooltip explaining why). Defaults to "always available".
   * Used by guides that need real user content the runner can't
   * synthesize — e.g. the editor guides that require an audio
   * file in the library.
   */
  isAvailable?: () => boolean;
  /**
   * Tooltip text shown next to the disabled Take button when
   * `isAvailable()` returns false. Ignored when the guide is
   * available.
   */
  unavailableReason?: string;
  /**
   * Optional cleanup hook fired on guide end (whether the user
   * finished or aborted). Used by guides that seed demo content
   * during prepare so they can remove it once the run is over.
   *
   * Best-effort — exceptions are caught and swallowed by the
   * runner so a flaky cleanup never blocks the user from
   * starting another guide.
   */
  onCleanup?: () => void | Promise<void>;
};
