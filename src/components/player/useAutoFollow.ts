import { type ComputedRef, type Ref, ref, watch } from 'vue';
import { alphatabPlayer } from '../../services/alphatabPlayer';
import {
  type BeatAnchor,
  computeAutoFollowScrollLeft,
  computeAutoFollowScrollTop,
  computePageFlipScrollLeft,
  interpolateBeatCursorX,
} from '../../domain/autofollow';
import type { usePlayerStore } from '../../stores/player';

interface AutoFollowDeps {
  containerRef: Ref<HTMLDivElement | null>;
  alphaAreaRef: Ref<HTMLDivElement | null>;
  playerStore: ReturnType<typeof usePlayerStore>;
  autoFollowEnabled: ComputedRef<boolean>;
  playback: ComputedRef<string>;
}

/**
 * Page-flip stride for one-liner mode, as a fraction of viewport
 * width. `0.5` means: cursor walks through half a viewport before
 * `scrollLeft` snaps forward by the same amount. Bigger values →
 * fewer/larger jumps; smaller → more frequent/smaller jumps.
 *
 * The previous "teleprompter glide" model (cursor pinned at a fixed
 * anchor, content sliding under it) was visually smooth but meant
 * the user's eyes had to track moving notation — fast passages were
 * hard to read. Static-then-snap is more readable AND cheaper at
 * runtime: most frames are no-ops because cursorX hasn't crossed
 * a page boundary yet.
 */
const PAGE_FLIP_FRACTION = 0.5;

/**
 * Where the cursor lands after a flip, as a fraction of viewport
 * width from the left edge. `0.1` (default) leaves a 10% strip of
 * just-played notation visible to the cursor's left as a "rear-view"
 * — useful orientation right after the snap. Set to `0` for the
 * cursor-at-far-left behaviour. Capped against `PAGE_FLIP_FRACTION`
 * inside the domain function so the cursor's walk fits the viewport.
 */
const PAGE_FLIP_LEFT_MARGIN = 0.1;

export function useAutoFollow(deps: AutoFollowDeps) {
  const {
    containerRef,
    alphaAreaRef,
    playerStore,
    autoFollowEnabled,
    playback,
  } = deps;

  const lastUserScrollAt = ref(0);
  const isAutoScrolling = ref(false);
  const lastAutoFollowAt = ref(0);
  const lastAutoFollowYAt = ref(0);
  const layoutWarning = ref(false);
  const layoutWarningTimer = ref<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = ref<HTMLElement | null>(null);

  // Teleprompter-mode rAF loop. We drive scrolling from playback time
  // (not AlphaTab's cursor emits) so the tab glides smoothly under a
  // fixed anchor instead of stepping ~33 ms per emit. `teleprompterRaf`
  // holds the current requestAnimationFrame handle; `cachedAnchors`
  // is the sorted beat-x index used for time→x interpolation.
  let teleprompterRaf: number | null = null;
  let cachedAnchors: BeatAnchor[] = [];
  // Track the exact source map reference we last built anchors from.
  // AlphaTab swaps this whole map when it rebuilds the beat cache
  // (score load / re-render), so identity comparison is the cheapest
  // way to know we need to resort.
  let cachedAnchorsSource: ReadonlyMap<number, unknown> | null = null;

  // Layout-read cache for the teleprompter loop.
  //
  // `scrollWidth` triggers a synchronous reflow every read; doing it
  // 60× per second on a horizontal-mode score (a single very wide
  // SVG/canvas) shows up clearly in the Performance profile and is
  // the main cause of the "ein bisschen laggy" perception. The
  // values only change on:
  //   - viewport resize         → ResizeObserver below
  //   - new score / re-render   → cache invalidated when the
  //                               beat-rect map identity changes
  //                               (see `ensureAnchorCache`)
  //   - layout-mode swap        → also covered by source-map flip
  // so caching lets the hot path do zero forced layouts per frame.
  let layoutCacheValid = false;
  let cachedClientWidth = 0;
  let cachedScrollWidth = 0;
  let resizeObserver: ResizeObserver | null = null;
  let resizeObserverTarget: HTMLElement | null = null;

  // Set true the moment we issue a scroll mutation; checked by
  // `handleScroll` to ignore the resulting scroll event so it
  // doesn't register as a user-interrupt. Cleared at the *start*
  // of the next teleprompter frame (or in stopTeleprompterFrame),
  // replacing the previous extra-rAF schedule that was burning a
  // frame just to clear a flag.
  let autoScrollMarkPending = false;

  // Time-based suppression window. Some browsers (and especially
  // the Tauri webview on Windows) batch scroll events so the
  // 'scroll' event for our own `scrollLeft = X` write may fire a
  // few ms AFTER we've already cleared `autoScrollMarkPending` at
  // the next rAF. Without this guard the late event reaches
  // `handleScroll`, gets misclassified as a real user scroll, and
  // freezes auto-follow for two seconds — Marcel's "scroll, then
  // auto-follow never comes back" report. 100 ms is far longer
  // than any realistic browser dispatch delay yet far shorter
  // than human-perceptible scroll inertia, so it cleanly separates
  // our own writes from the user's.
  let suppressScrollEventsUntil = 0;
  // 400 ms covers both auto-scroll write modes:
  //   - one-liner page-flip: instant `scrollLeft = X`, scroll
  //     event fires within ~5–20 ms but Tauri webview can lag
  //     by a few ms (we've seen ~50 ms in profiles).
  //   - multi-line page-mode: `scrollTo({ behavior: 'smooth' })`
  //     animates over ~300 ms with continuous scroll events. The
  //     existing `requestAnimationFrame` flag-clear was way too
  //     short for this — scroll events arrived AFTER the flag
  //     went false and were misclassified as user scrolls,
  //     freezing auto-follow.
  const SUPPRESS_AFTER_AUTO_SCROLL_MS = 400;

  function invalidateLayoutCache(): void {
    layoutCacheValid = false;
  }

  function ensureLayoutCache(scroller: HTMLElement): void {
    if (layoutCacheValid && resizeObserverTarget === scroller) return;
    cachedClientWidth = scroller.clientWidth;
    cachedScrollWidth = scroller.scrollWidth;
    layoutCacheValid = true;
    if (resizeObserverTarget !== scroller) {
      // Wire the observer once per scroller. Browser will fire the
      // callback initially with the current size — we ignore that
      // by re-validating immediately below; later resizes correctly
      // invalidate.
      if (resizeObserver) resizeObserver.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          invalidateLayoutCache();
        });
        resizeObserver.observe(scroller);
      }
      resizeObserverTarget = scroller;
    }
  }

  function teardownResizeObserver(): void {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    resizeObserverTarget = null;
    layoutCacheValid = false;
  }

  function handleScroll(): void {
    const scroller = scrollRef.value ?? alphaAreaRef.value;
    if (!scroller) {
      return;
    }
    const now = Date.now();
    // Belt-and-suspenders ignore for our own auto-scroll writes.
    // The reactive flag handles the in-frame case; the time window
    // covers the case where the browser dispatches the scroll event
    // a few ms late (after we've already cleared the flag at the
    // next rAF). Either match → no user-scroll record.
    if (isAutoScrolling.value) return;
    if (now < suppressScrollEventsUntil) return;
    lastUserScrollAt.value = now;
  }

  function handleCursorRect(rect: {
    left: number;
    top: number;
    height: number;
  }): void {
    if (!containerRef.value || !alphaAreaRef.value) {
      return;
    }
    const scroller = alphaAreaRef.value;
    const containerRect = containerRef.value.getBoundingClientRect();
    const alphaRect = scroller.getBoundingClientRect();

    if (!autoFollowEnabled.value || playback.value !== 'playing' || !scroller) {
      return;
    }
    const now = Date.now();
    if (now - lastUserScrollAt.value < 2000) {
      return;
    }
    const horizontal = playerStore.horizontalLayout;
    // Horizontal mode is driven by the rAF loop below — this
    // cursor-emit callback is only used for page layout. Skipping
    // here means the horizontal path isn't double-driven (emit
    // jumps + rAF glides fighting each other).
    if (horizontal) return;
    if (now - lastAutoFollowAt.value < 80) {
      return;
    }
    lastAutoFollowAt.value = now;
    const viewportWidth = scroller.clientWidth;
    const cursorX =
      rect.left + containerRect.left - alphaRect.left + scroller.scrollLeft;
    const nextLeft = computeAutoFollowScrollLeft({
      cursorX,
      scrollLeft: scroller.scrollLeft,
      viewportWidth,
      marginPx: Math.round(viewportWidth * 0.3),
    });
    if (nextLeft !== null) {
      isAutoScrolling.value = true;
      suppressScrollEventsUntil = Date.now() + SUPPRESS_AFTER_AUTO_SCROLL_MS;
      // Page layout uses smooth scroll because its cursor chase
      // happens once per margin-cross, not every rAF, and a 300ms
      // ease there is imperceptible.
      scroller.scrollTo({ left: nextLeft, behavior: 'smooth' });
      requestAnimationFrame(() => {
        isAutoScrolling.value = false;
      });
    }

    const playheadTop =
      rect.top + containerRect.top - alphaRect.top + scroller.scrollTop;
    const playheadBottom = playheadTop + rect.height;
    if (
      Number.isFinite(playheadTop) &&
      Number.isFinite(playheadBottom) &&
      now - lastAutoFollowYAt.value >= 120
    ) {
      const viewportHeight = scroller.clientHeight;
      const yMarginPx = Math.round(viewportHeight * 0.35);
      const nextTop = computeAutoFollowScrollTop({
        playheadTop,
        playheadBottom,
        scrollTop: scroller.scrollTop,
        viewportHeight,
        scrollHeight: scroller.scrollHeight,
        marginPx: yMarginPx,
      });
      if (nextTop !== null) {
        lastAutoFollowYAt.value = now;
        isAutoScrolling.value = true;
        suppressScrollEventsUntil = Date.now() + SUPPRESS_AFTER_AUTO_SCROLL_MS;
        scroller.scrollTo({ top: nextTop, behavior: 'smooth' });
        requestAnimationFrame(() => {
          isAutoScrolling.value = false;
        });
      }
    }
  }

  /**
   * Build / refresh the sorted `[rawStartMs, onNotesX]` anchor list used
   * by `interpolateBeatCursorX`. Rebuilds when the source-map's size
   * changes (new score, re-render) — same-size refreshes reuse the
   * cached array to avoid per-frame allocations.
   */
  function ensureAnchorCache(
    source: ReadonlyMap<
      number,
      { onNotesX: number; x: number; w: number }
    > | null,
  ): BeatAnchor[] {
    if (!source || source.size === 0) {
      cachedAnchors = [];
      cachedAnchorsSource = source ?? null;
      return cachedAnchors;
    }
    if (source === cachedAnchorsSource && cachedAnchors.length > 0) {
      return cachedAnchors;
    }
    // Source-map identity flips on every AlphaTab re-render — same
    // event that can shift the score's total width, so the layout
    // cache must drop too. This single hook covers tempo-mode
    // changes, layout-mode swaps, and tab loads without needing a
    // separate signal from the player events module.
    invalidateLayoutCache();
    const next: BeatAnchor[] = [];
    source.forEach((rect, rawStartMs) => {
      const x = Number.isFinite(rect.onNotesX)
        ? rect.onNotesX
        : rect.x + rect.w / 2;
      if (Number.isFinite(rawStartMs) && Number.isFinite(x)) {
        next.push({ rawStartMs, x });
      }
    });
    next.sort((a, b) => a.rawStartMs - b.rawStartMs);
    cachedAnchors = next;
    cachedAnchorsSource = source;
    return cachedAnchors;
  }

  /**
   * Per-frame scroll update for the teleprompter (one-liner) layout.
   * Reads current playhead ms, interpolates the expected cursor x
   * between surrounding beats, and pins it to the anchor fraction
   * by adjusting `scrollLeft`. Runs entirely off playback time so
   * visual motion is continuous regardless of AlphaTab's cursor-
   * emit cadence.
   */
  function teleprompterFrame(): void {
    teleprompterRaf = null;
    // Clear the auto-scroll mark from the previous frame's mutation.
    // The browser fires its scroll event sync-ish after `scrollLeft =`
    // so by the time the next rAF runs, the event has already been
    // dispatched and `handleScroll` has decided whether to register
    // it. Dropping the flag here saves the dedicated rAF the old
    // code paid per scroll write.
    if (autoScrollMarkPending) {
      isAutoScrolling.value = false;
      autoScrollMarkPending = false;
    }
    if (!playerStore.horizontalLayout) return;
    if (!autoFollowEnabled.value || playback.value !== 'playing') return;
    const scroller = alphaAreaRef.value;
    if (!scroller) return;
    const now = Date.now();
    if (now - lastUserScrollAt.value < 2000) {
      scheduleTeleprompterFrame();
      return;
    }
    const playheadMs =
      typeof alphatabPlayer.getCurrentPositionMs === 'function'
        ? alphatabPlayer.getCurrentPositionMs()
        : null;
    if (typeof playheadMs !== 'number' || !Number.isFinite(playheadMs)) {
      scheduleTeleprompterFrame();
      return;
    }
    const tempoPercent = playerStore.model.tempoPercent;
    const tempoFactor =
      typeof tempoPercent === 'number' && tempoPercent > 0
        ? tempoPercent / 100
        : 1;
    // Beat-rect map is keyed by raw 1× startMs; playhead is wall-
    // clock (scaled). Convention: `wallClock = raw / tempoFactor`
    // (see expectedNoteTimeline.ts) — so to go the other way we
    // multiply: `raw = wallClock * tempoFactor`. At 1× they're
    // equal; at 0.5× (half speed) wall-clock 2000 ms corresponds
    // to raw 1000 ms.
    const rawMs = playheadMs * tempoFactor;
    const source = alphatabPlayer.getBeatRectsByStartMs();
    const anchors = ensureAnchorCache(source);
    const cursorX = interpolateBeatCursorX(rawMs, anchors);
    if (cursorX === null) {
      scheduleTeleprompterFrame();
      return;
    }
    // Layout reads from the cache (validated above by ensureAnchor
    // Cache's identity check; a fresh source map invalidates both).
    // `scrollLeft` is kept fresh because user scrolls during the
    // 2-second grace window can change it underneath us.
    ensureLayoutCache(scroller);
    const viewportWidth = cachedClientWidth;
    const maxScrollLeft = Math.max(0, cachedScrollWidth - viewportWidth);
    const currentScrollLeft = scroller.scrollLeft;
    const nextLeft = computePageFlipScrollLeft({
      cursorX,
      scrollLeft: currentScrollLeft,
      viewportWidth,
      maxScrollLeft,
      pageFraction: PAGE_FLIP_FRACTION,
      leftMarginFraction: PAGE_FLIP_LEFT_MARGIN,
    });
    // `computePageFlipScrollLeft` returns `null` for the vast
    // majority of frames (any frame where the cursor hasn't yet
    // crossed the next page boundary). The single source of truth
    // for the sub-pixel threshold lives in the domain function;
    // any non-null value here is a real flip event worth a write.
    if (nextLeft !== null) {
      isAutoScrolling.value = true;
      autoScrollMarkPending = true;
      suppressScrollEventsUntil = now + SUPPRESS_AFTER_AUTO_SCROLL_MS;
      // Direct assignment (not scrollTo with `behavior: 'smooth'`)
      // is intentional: page-flip wants the snap to be INSTANT so
      // the static-then-jump rhythm reads correctly. A 300ms
      // smooth-scroll easing here would smear the flip across half
      // a second, which is the smooth-glide behaviour we just
      // moved away from.
      scroller.scrollLeft = nextLeft;
    }
    scheduleTeleprompterFrame();
  }

  function scheduleTeleprompterFrame(): void {
    if (teleprompterRaf !== null) return;
    teleprompterRaf = requestAnimationFrame(teleprompterFrame);
  }

  function stopTeleprompterFrame(): void {
    if (teleprompterRaf !== null) {
      cancelAnimationFrame(teleprompterRaf);
      teleprompterRaf = null;
    }
    // The next frame would normally clear this — but if we're
    // stopping outright (pause, layout switch, unmount) there is
    // no next frame, so flush the flag here.
    if (autoScrollMarkPending) {
      isAutoScrolling.value = false;
      autoScrollMarkPending = false;
    }
  }

  // Start/stop the rAF loop based on playback + horizontal layout.
  watch(
    () => ({
      horizontal: playerStore.horizontalLayout,
      playing: playback.value === 'playing',
      follow: autoFollowEnabled.value,
    }),
    ({ horizontal, playing, follow }) => {
      if (horizontal && playing && follow) {
        scheduleTeleprompterFrame();
      } else {
        stopTeleprompterFrame();
      }
    },
    { immediate: true },
  );

  function updateLayoutWarning(): void {
    if (layoutWarningTimer.value) {
      clearTimeout(layoutWarningTimer.value);
      layoutWarningTimer.value = null;
    }
    const hasItem = Boolean(playerStore.model.currentLibraryItemId);
    if (!hasItem) {
      layoutWarning.value = false;
      return;
    }
    const size = alphatabPlayer.getContainerSize();
    if (!size) {
      layoutWarning.value = false;
      return;
    }
    if (size.width > 0 && size.height > 0) {
      layoutWarning.value = false;
      return;
    }
    layoutWarningTimer.value = setTimeout(() => {
      const stillHasItem = Boolean(playerStore.model.currentLibraryItemId);
      if (!stillHasItem) {
        layoutWarning.value = false;
        return;
      }
      const nextSize = alphatabPlayer.getContainerSize();
      if (!nextSize) {
        layoutWarning.value = false;
        return;
      }
      layoutWarning.value = nextSize.width === 0 || nextSize.height === 0;
    }, 200);
  }

  function resolveScrollContainer(): void {
    const root = alphaAreaRef.value;
    if (!root) {
      scrollRef.value = null;
      return;
    }
    const hasScrollableOverflow = (element: HTMLElement) => {
      const styles = getComputedStyle(element);
      const overflowY = styles.overflowY;
      const overflowX = styles.overflowX;
      const canScroll =
        element.scrollHeight > element.clientHeight ||
        element.scrollWidth > element.clientWidth;
      return (
        canScroll &&
        (overflowY === 'auto' ||
          overflowY === 'scroll' ||
          overflowX === 'auto' ||
          overflowX === 'scroll')
      );
    };
    if (hasScrollableOverflow(root)) {
      scrollRef.value = root;
      return;
    }
    const descendant = Array.from(root.querySelectorAll<HTMLElement>('*')).find(
      hasScrollableOverflow,
    );
    scrollRef.value = descendant ?? root;
  }

  function resetScoreScroll(): boolean {
    const doc =
      containerRef.value?.ownerDocument ??
      alphaAreaRef.value?.ownerDocument ??
      document;
    const alphaFromContainer =
      (containerRef.value?.closest('.alpha-area') as HTMLDivElement | null) ??
      null;
    const scroller =
      scrollRef.value ??
      alphaAreaRef.value ??
      alphaFromContainer ??
      (doc.querySelector('.alpha-area') as HTMLDivElement | null);
    const alphaArea = alphaAreaRef.value ?? alphaFromContainer;
    if (!scroller && !alphaArea) {
      return false;
    }
    if (scroller) {
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    }
    if (alphaArea && alphaArea !== scroller) {
      alphaArea.scrollTop = 0;
      alphaArea.scrollLeft = 0;
    }
    doc.querySelectorAll('.alpha-area').forEach((element) => {
      const node = element as HTMLDivElement;
      node.scrollTop = 0;
      node.scrollLeft = 0;
    });
    return true;
  }

  function cleanupTimer(): void {
    if (layoutWarningTimer.value) {
      clearTimeout(layoutWarningTimer.value);
      layoutWarningTimer.value = null;
    }
    stopTeleprompterFrame();
    teardownResizeObserver();
  }

  return {
    scrollRef,
    layoutWarning,
    handleScroll,
    handleCursorRect,
    updateLayoutWarning,
    resolveScrollContainer,
    resetScoreScroll,
    cleanupTimer,
  };
}
