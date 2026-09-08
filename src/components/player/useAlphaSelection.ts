import { type ComputedRef, type Ref, ref } from 'vue';
import { alphatabPlayer } from '../../services/alphatabPlayer';
import {
  isValidCursorRect,
  mapContainerRectToAlphaArea,
} from '../../domain/playhead';
import { toAlphaContentPosition } from '../../domain/alphaPosition';
import {
  normalizeSeekTarget,
  resolveSeekTarget,
  selectFallbackTick,
  selectSeekTick,
} from '../../domain/seekTarget';
import { findBarIndexAtPoint } from '../../domain/barIndex';
import { resolveTickFromBeatAndBar } from '../../domain/seekTick';
import type { usePlayerStore } from '../../stores/player';
import type { useMetronomeStore } from '../../stores/metronome';

type SelectionBlock = {
  left: number;
  top: number;
  width: number;
  height: number;
};

interface AlphaSelectionDeps {
  containerRef: Ref<HTMLDivElement | null>;
  alphaAreaRef: Ref<HTMLDivElement | null>;
  playerStore: ReturnType<typeof usePlayerStore>;
  metronomeStore: ReturnType<typeof useMetronomeStore>;
  hasSelection: ComputedRef<boolean>;
  isPlaying: ComputedRef<boolean>;
  status: ComputedRef<string>;
  isLoopEnabled: ComputedRef<boolean>;
  overlayLocked: ComputedRef<boolean>;
}

export function useAlphaSelection(deps: AlphaSelectionDeps) {
  const {
    containerRef,
    alphaAreaRef,
    playerStore,
    metronomeStore,
    hasSelection,
    isPlaying,
    status,
    isLoopEnabled,
    overlayLocked,
  } = deps;

  const selectionStartBeat = ref<unknown | null>(null);
  const selectionStartBarIndex = ref<number | null>(null);
  const isSelecting = ref(false);
  const suppressNextClick = ref(false);
  const suppressNextPointerDown = ref(false);
  const selectionBlocks = ref<SelectionBlock[]>([]);
  const lastSelectionBlocks = ref<SelectionBlock[]>([]);
  const suppressSelectionHighlights = ref(false);
  const lastBeatEventAt = ref(0);
  const selectionStartedFromPointer = ref(false);
  const lastBeatPointerTick = ref<number | null>(null);

  function waitForFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  function mapHighlightBlocks(
    blocks: Array<{ x: number; y: number; w: number; h: number }>,
  ): SelectionBlock[] {
    if (!alphaAreaRef.value || !containerRef.value) {
      return [];
    }
    const scroller = alphaAreaRef.value;
    const containerRect = containerRef.value.getBoundingClientRect();
    const alphaRect = scroller.getBoundingClientRect();
    return blocks
      .map((block) => {
        const mapped = mapContainerRectToAlphaArea(
          { left: block.x, top: block.y, height: block.h },
          containerRect,
          alphaRect,
          scroller.scrollLeft,
          scroller.scrollTop,
        );
        if (!mapped) {
          return null;
        }
        return {
          left: mapped.left,
          top: mapped.top,
          width: block.w,
          height: block.h,
        };
      })
      .filter((block): block is SelectionBlock => Boolean(block));
  }

  function buildBarSelectionBlocks(
    startIndex: number,
    endIndex: number,
  ): SelectionBlock[] {
    if (!alphaAreaRef.value || !containerRef.value) {
      return [];
    }
    const scroller = alphaAreaRef.value;
    const containerRect = containerRef.value.getBoundingClientRect();
    const alphaRect = scroller.getBoundingClientRect();
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    const blocks: SelectionBlock[] = [];
    for (let index = from; index <= to; index += 1) {
      const bounds = alphatabPlayer.getBarBoundsByIndex(index);
      if (!bounds) {
        continue;
      }
      const mapped = mapContainerRectToAlphaArea(
        { left: bounds.x, top: bounds.y, height: bounds.h },
        containerRect,
        alphaRect,
        scroller.scrollLeft,
        scroller.scrollTop,
      );
      if (!mapped) {
        continue;
      }
      blocks.push({
        left: mapped.left,
        top: mapped.top,
        width: bounds.w,
        height: mapped.height,
      });
    }
    return blocks;
  }

  async function handlePlayheadClick(event: MouseEvent): Promise<void> {
    if (overlayLocked.value) {
      return;
    }
    if (suppressNextClick.value || isSelecting.value) {
      suppressNextClick.value = false;
      return;
    }
    if (!hasSelection.value || status.value !== 'ready') {
      return;
    }
    if (selectionBlocks.value.length > 0) {
      alphatabPlayer.clearPlaybackRangeHighlight();
      alphatabPlayer.clearPlaybackRange();
      selectionBlocks.value = [];
      lastSelectionBlocks.value = [];
      selectionStartBeat.value = null;
      selectionStartBarIndex.value = null;
      playerStore.restoreLoopFromDrawnRange();
    }
    if (!alphaAreaRef.value || !containerRef.value) {
      return;
    }
    const scroller = alphaAreaRef.value;
    const alphaRect = scroller.getBoundingClientRect();
    const clickInContainer = {
      x: event.clientX - alphaRect.left,
      y: event.clientY - alphaRect.top,
    };
    const content = toAlphaContentPosition(clickInContainer, {
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
    });
    const contentX = content.x;
    const contentY = content.y;
    const hit = alphatabPlayer.snapToNearestBeat(contentX, contentY);
    const awaited = await alphatabPlayer.waitForNextCursorRect({
      timeoutMs: 200,
    });
    const resolved = resolveSeekTarget(
      awaited && isValidCursorRect(awaited) ? awaited : null,
      hit && isValidCursorRect(hit) ? hit : null,
    );
    const beat =
      alphatabPlayer.getBeatAtPosition(contentX, contentY) ??
      alphatabPlayer.getBeatAtPosition(clickInContainer.x, clickInContainer.y);
    const beatTick = beat ? alphatabPlayer.getBeatStartTick(beat) : null;
    const barCount = alphatabPlayer.getBarCount();
    const barIndex =
      alphatabPlayer.getBarIndexFromBeat(beat) ??
      findBarIndexAtPoint(
        barCount,
        (index) => alphatabPlayer.getBarBoundsByIndex(index),
        { x: clickInContainer.x, y: clickInContainer.y },
      ) ??
      alphatabPlayer.getBarIndexAtPosition(contentX, contentY) ??
      alphatabPlayer.getBarIndexAtPosition(
        clickInContainer.x,
        clickInContainer.y,
      );
    const barTick =
      typeof barIndex === 'number'
        ? alphatabPlayer.getBarStartTick(barIndex)
        : null;
    const resolvedTick = resolveTickFromBeatAndBar(beatTick, barTick);
    const currentTick = alphatabPlayer.getCurrentTickPosition();
    const safeResolved = normalizeSeekTarget(resolved, {
      ignoreZeroTick: typeof barIndex === 'number' && barIndex > 0,
    });
    const recentPointerTick =
      typeof lastBeatPointerTick.value === 'number' &&
      performance.now() - lastBeatEventAt.value < 500
        ? lastBeatPointerTick.value
        : null;
    const fallbackTick =
      typeof resolvedTick === 'number'
        ? resolvedTick
        : selectFallbackTick({
            beatTick:
              typeof resolvedTick === 'number' ? resolvedTick : beatTick,
            barTick,
            barIndex,
            currentTick: isPlaying.value ? null : currentTick,
            recentPointerTick,
          });
    const seekTick = selectSeekTick({
      cursorTick: safeResolved.cursorTick,
      resolvedTick,
      fallbackTick,
    });
    if (typeof seekTick === 'number') {
      playerStore.setMetronomeSyncAnchorTick(seekTick);
      if (isPlaying.value) {
        await alphatabPlayer.seekAndPlay(seekTick);
      } else {
        await alphatabPlayer.seekToTick(seekTick);
      }
    } else if (typeof safeResolved.cursorMs === 'number') {
      playerStore.setMetronomeSyncAnchorTick(null);
      await alphatabPlayer.seekToMs(safeResolved.cursorMs);
    }
    if (metronomeStore.isSyncedToTab) {
      void playerStore.refreshSyncedMetronomeAtCurrentPosition();
    }
  }

  function handleBeatMouseDown(beat: unknown): void {
    if (!hasSelection.value || status.value !== 'ready') {
      return;
    }
    lastBeatEventAt.value = performance.now();
    const barIndexFromBeat = alphatabPlayer.getBarIndexFromBeat(beat);
    const barTickFromBeat =
      typeof barIndexFromBeat === 'number'
        ? alphatabPlayer.getBarStartTick(barIndexFromBeat)
        : null;
    const rawBeatTick = alphatabPlayer.getBeatStartTick(beat);
    lastBeatPointerTick.value = resolveTickFromBeatAndBar(
      rawBeatTick,
      barTickFromBeat,
    );
    selectionStartBeat.value = beat;
    selectionStartBarIndex.value = barIndexFromBeat;
    isSelecting.value = false;
  }

  function handleBeatMouseMove(beat: unknown): void {
    if (!selectionStartBeat.value) {
      return;
    }
    lastBeatEventAt.value = performance.now();
    // Deadzone: only start a selection once the pointer has moved onto a
    // different beat. Prevents a single-beat drag from turning into a loop
    // — at least two distinct beats must be captured.
    if (!isSelecting.value) {
      const startTick = alphatabPlayer.getBeatStartTick(
        selectionStartBeat.value,
      );
      const currentTick = alphatabPlayer.getBeatStartTick(beat);
      if (
        startTick !== null &&
        currentTick !== null &&
        startTick === currentTick
      ) {
        return;
      }
      isSelecting.value = true;
    }
    alphatabPlayer.highlightPlaybackRange(selectionStartBeat.value, beat);
  }

  function handleBeatMouseUp(beat: unknown | null): void {
    if (!selectionStartBeat.value) {
      return;
    }
    lastBeatEventAt.value = performance.now();
    const startBarIndex =
      selectionStartBarIndex.value ??
      alphatabPlayer.getBarIndexFromBeat(selectionStartBeat.value);
    if (isSelecting.value) {
      const endBeat = beat ?? selectionStartBeat.value;
      // Reject single-beat selections — loops must span ≥2 beats to be
      // musically useful and to avoid accidental pinpoint loops.
      const startTick = alphatabPlayer.getBeatStartTick(
        selectionStartBeat.value,
      );
      const endTick = alphatabPlayer.getBeatStartTick(endBeat);
      if (startTick !== null && endTick !== null && startTick === endTick) {
        alphatabPlayer.clearPlaybackRangeHighlight();
        selectionStartBeat.value = null;
        selectionStartBarIndex.value = null;
        isSelecting.value = false;
        setTimeout(() => {
          suppressNextClick.value = false;
        }, 0);
        return;
      }
      suppressNextClick.value = true;
      alphatabPlayer.highlightPlaybackRange(selectionStartBeat.value, endBeat);
      const applied = alphatabPlayer.setPlaybackRangeFromBeats(
        selectionStartBeat.value,
        endBeat,
      );
      if (!applied && startBarIndex !== null) {
        const endBarIndex = beat
          ? alphatabPlayer.getBarIndexFromBeat(beat)
          : null;
        const barApplied = alphatabPlayer.setPlaybackRangeFromBarIndex(
          startBarIndex,
          endBarIndex ?? startBarIndex,
        );
        if (barApplied) {
          const blocks = buildBarSelectionBlocks(
            startBarIndex,
            endBarIndex ?? startBarIndex,
          );
          if (blocks.length > 0) {
            selectionBlocks.value = blocks;
            lastSelectionBlocks.value = blocks;
          }
        }
        if (!barApplied) {
          alphatabPlayer.applyPlaybackRangeFromHighlight();
        }
      } else if (!applied) {
        alphatabPlayer.applyPlaybackRangeFromHighlight();
      }
      if (selectionBlocks.value.length === 0) {
        selectionBlocks.value = lastSelectionBlocks.value;
      }
      if (selectionBlocks.value.length === 0) {
        selectionBlocks.value = lastSelectionBlocks.value;
      }
      playerStore.enableLoopForDrawnRange();
      const loopRange = alphatabPlayer.getPlaybackRangeTicks();
      if (loopRange && typeof loopRange.start === 'number') {
        playerStore.setMetronomeSyncAnchorTick(loopRange.start);
        void alphatabPlayer.seekToTick(loopRange.start);
      }
    }
    selectionStartBeat.value = null;
    selectionStartBarIndex.value = null;
    isSelecting.value = false;
    setTimeout(() => {
      suppressNextClick.value = false;
    }, 0);
  }

  function handleAlphaPointerDown(event: PointerEvent): void {
    if (suppressNextPointerDown.value) {
      suppressNextPointerDown.value = false;
      return;
    }
    if (overlayLocked.value) {
      return;
    }
    if (!hasSelection.value || status.value !== 'ready') {
      return;
    }
    if (performance.now() - lastBeatEventAt.value < 50) {
      return;
    }
    if (!containerRef.value) {
      return;
    }
    const containerRect = containerRef.value.getBoundingClientRect();
    const x = event.clientX - containerRect.left;
    const y = event.clientY - containerRect.top;
    const beat = alphatabPlayer.getBeatAtPosition(x, y);
    if (beat) {
      selectionStartedFromPointer.value = true;
      handleBeatMouseDown(beat);
      return;
    }
    const barIndex = alphatabPlayer.getBarIndexAtPosition(x, y);
    if (barIndex === null) {
      return;
    }
    selectionStartedFromPointer.value = true;
    selectionStartBeat.value = null;
    selectionStartBarIndex.value = barIndex;
    isSelecting.value = false;
    const blocks = buildBarSelectionBlocks(barIndex, barIndex);
    if (blocks.length > 0) {
      selectionBlocks.value = blocks;
      lastSelectionBlocks.value = blocks;
    }
  }

  function handleAlphaPointerMove(event: PointerEvent): void {
    if (overlayLocked.value) {
      return;
    }
    if (!selectionStartedFromPointer.value) {
      return;
    }
    if (performance.now() - lastBeatEventAt.value < 50) {
      return;
    }
    if (!containerRef.value) {
      return;
    }
    const containerRect = containerRef.value.getBoundingClientRect();
    const x = event.clientX - containerRect.left;
    const y = event.clientY - containerRect.top;
    if (selectionStartBeat.value) {
      const beat = alphatabPlayer.getBeatAtPosition(x, y);
      if (!beat) {
        return;
      }
      handleBeatMouseMove(beat);
      return;
    }
    if (selectionStartBarIndex.value === null) {
      return;
    }
    const barIndex = alphatabPlayer.getBarIndexAtPosition(x, y);
    if (barIndex === null) {
      return;
    }
    if (!isSelecting.value) {
      isSelecting.value = true;
    }
    const blocks = buildBarSelectionBlocks(
      selectionStartBarIndex.value,
      barIndex,
    );
    if (blocks.length > 0) {
      selectionBlocks.value = blocks;
      lastSelectionBlocks.value = blocks;
    }
  }

  function handleAlphaPointerUp(event: PointerEvent): void {
    if (overlayLocked.value) {
      selectionStartedFromPointer.value = false;
      return;
    }
    if (!selectionStartedFromPointer.value) {
      return;
    }
    if (performance.now() - lastBeatEventAt.value < 50) {
      selectionStartedFromPointer.value = false;
      return;
    }
    if (!containerRef.value) {
      selectionStartedFromPointer.value = false;
      return;
    }
    const containerRect = containerRef.value.getBoundingClientRect();
    const x = event.clientX - containerRect.left;
    const y = event.clientY - containerRect.top;
    if (selectionStartBeat.value) {
      const beat = alphatabPlayer.getBeatAtPosition(x, y);
      handleBeatMouseUp(beat);
      selectionStartedFromPointer.value = false;
      return;
    }
    if (selectionStartBarIndex.value === null) {
      selectionStartedFromPointer.value = false;
      return;
    }
    const barIndex = alphatabPlayer.getBarIndexAtPosition(x, y);
    if (barIndex === null) {
      selectionStartedFromPointer.value = false;
      selectionStartBarIndex.value = null;
      isSelecting.value = false;
      return;
    }
    suppressNextClick.value = true;
    const applied = alphatabPlayer.setPlaybackRangeFromBarIndex(
      selectionStartBarIndex.value,
      barIndex,
    );
    if (!selectionBlocks.value.length) {
      const blocks = buildBarSelectionBlocks(
        selectionStartBarIndex.value,
        barIndex,
      );
      if (blocks.length > 0) {
        selectionBlocks.value = blocks;
        lastSelectionBlocks.value = blocks;
      }
    }
    if (applied) {
      playerStore.enableLoopForDrawnRange();
    }
    selectionStartBarIndex.value = null;
    isSelecting.value = false;
    selectionStartedFromPointer.value = false;
  }

  function resetSelection(): void {
    selectionBlocks.value = [];
    lastSelectionBlocks.value = [];
    selectionStartBeat.value = null;
    selectionStartBarIndex.value = null;
    isSelecting.value = false;
    selectionStartedFromPointer.value = false;
    suppressSelectionHighlights.value = true;
    alphatabPlayer.clearPlaybackRangeHighlight();
    alphatabPlayer.clearPlaybackRange();
    // Tab-change / explicit reset also dismisses any drawn range — restore
    // the pre-draw loop state so the next file does not inherit a loop the
    // user never asked for.
    playerStore.restoreLoopFromDrawnRange();
  }

  function onPlaybackRangeHighlightChanged(
    blocks: Array<{ x: number; y: number; w: number; h: number }>,
  ): void {
    if (suppressSelectionHighlights.value) {
      selectionBlocks.value = [];
      lastSelectionBlocks.value = [];
      return;
    }
    const mapped = mapHighlightBlocks(blocks);
    if (mapped.length > 0) {
      lastSelectionBlocks.value = mapped;
      selectionBlocks.value = mapped;
      return;
    }
    if (isSelecting.value) {
      selectionBlocks.value = lastSelectionBlocks.value;
    } else if (isLoopEnabled.value) {
      selectionBlocks.value = lastSelectionBlocks.value;
    } else {
      selectionBlocks.value = [];
    }
  }

  function onBeatMouseDown(beat: unknown): void {
    suppressSelectionHighlights.value = false;
    handleBeatMouseDown(beat);
  }

  function onLoopDisabled(): void {
    selectionBlocks.value = [];
    lastSelectionBlocks.value = [];
    alphatabPlayer.clearPlaybackRangeHighlight();
    alphatabPlayer.clearPlaybackRange();
  }

  return {
    selectionBlocks,
    suppressNextClick,
    suppressNextPointerDown,
    suppressSelectionHighlights,
    isSelecting,
    waitForFrame,
    mapHighlightBlocks,
    handlePlayheadClick,
    handleAlphaPointerDown,
    handleAlphaPointerMove,
    handleAlphaPointerUp,
    handleBeatMouseDown: onBeatMouseDown,
    handleBeatMouseMove,
    handleBeatMouseUp,
    resetSelection,
    onPlaybackRangeHighlightChanged,
    onLoopDisabled,
  };
}
