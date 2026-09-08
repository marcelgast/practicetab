import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAppStore } from './app';
import { GUIDE_LIST, getGuide } from '../domain/guides/registry';
import type { Guide, GuideId } from '../domain/guides/types';

/**
 * Thin orchestration layer over the guide-related fields in
 * `useAppStore`. Components should read / mutate guide state
 * through here rather than touching `appStore.guideState` directly
 * so the persistence details stay in one place.
 *
 * Welcome-visibility policy:
 *   - `showAtStartup` is persisted. When on, the Welcome re-appears
 *     on every app launch.
 *   - `dismissedThisSession` is a ref (not persisted). Flipping it
 *     to true hides the Welcome for the current run only, so
 *     "Start guide" / "No thanks" / the confirm flow all dismiss
 *     the current dialog without permanently locking it out. The
 *     permanent off-switch is setting `showAtStartup = false`.
 *
 * Heavy lifting (driver.js, toast firing) lives in `useGuideRunner`.
 */
export const useGuideStore = defineStore('guides', () => {
  const appStore = useAppStore();

  const showAtStartup = computed(() => appStore.guideState.showAtStartup);
  const completedMap = computed(() => appStore.guideState.completed);
  const dismissedThisSession = ref(false);
  /**
   * True once the user has opted in to the guided path this
   * session (clicked "Start guide" on the Welcome dialog OR
   * started a guide directly from the Help panel). Suppresses
   * the Session Journal goal dialog for the remainder of the
   * session — two modal surfaces fighting over the focus is a
   * confusing first-run experience, and the user has made their
   * choice already.
   */
  const guideIntendedThisSession = ref(false);

  /** Render-order list of every guide (registry order). */
  const guides = computed<readonly Guide[]>(() => GUIDE_LIST);

  function isCompleted(id: GuideId): boolean {
    return Boolean(appStore.guideState.completed[id]);
  }

  function completedAt(id: GuideId): string | null {
    return appStore.guideState.completed[id] ?? null;
  }

  /** True if every guide in the registry has a completed timestamp.
   *  Used by the Welcome gate — a returning user who has finished
   *  every tour shouldn't see the Welcome again even if the toggle
   *  is on. */
  const allCompleted = computed(() =>
    GUIDE_LIST.every((g) => isCompleted(g.id)),
  );

  /** Should the Welcome dialog appear?
   *  True iff the toggle is on, the user hasn't dismissed it in
   *  this session, and there's at least one unfinished guide. */
  const shouldShowWelcome = computed(
    () =>
      showAtStartup.value && !dismissedThisSession.value && !allCompleted.value,
  );

  function setShowAtStartup(value: boolean): void {
    appStore.setGuideShowAtStartup(value);
  }

  /** Hide the Welcome for the current session only. Does NOT flip
   *  the persistent `showAtStartup` — callers that want permanent
   *  dismissal should follow up with `setShowAtStartup(false)`. */
  function dismissWelcomeForSession(): void {
    dismissedThisSession.value = true;
  }

  /** Record that the user has committed to the guide path this
   *  session so the journal dialog stays out of the way. */
  function markGuideIntendedThisSession(): void {
    guideIntendedThisSession.value = true;
  }

  function markCompleted(id: GuideId): void {
    appStore.markGuideCompleted(id);
  }

  function resetCompleted(id: GuideId): void {
    appStore.resetGuideCompleted(id);
  }

  return {
    guides,
    showAtStartup,
    completedMap,
    allCompleted,
    shouldShowWelcome,
    dismissedThisSession,
    guideIntendedThisSession,
    isCompleted,
    completedAt,
    setShowAtStartup,
    dismissWelcomeForSession,
    markGuideIntendedThisSession,
    markCompleted,
    resetCompleted,
    getGuide,
  };
});
