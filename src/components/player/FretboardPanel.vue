<script setup lang="ts">
/**
 * Read-only fretboard diagram that mirrors the current playhead
 * position on the active track (PR 4.2).
 *
 * Geometry is FIXED in viewBox units (constant string + fret
 * spacing) and the SVG scales to its container via the default
 * `preserveAspectRatio="xMidYMid meet"`. Dots stay perfectly
 * circular at every width and the overall panel grows taller as
 * string count increases — a 6-string looks compact, a 10-string
 * bass gets proportionally more vertical room without crushing
 * the strings together.
 *
 * Reactivity: playhead is polled via a short ticker (the model
 * doesn't carry ms directly). `beatNotesByStartMs` and the user
 * tuning are reactive refs, so the `frettings` computed reruns
 * on every tick without any rAF plumbing.
 */
import { computed, ref } from 'vue';
import { usePlayerStore } from '../../stores/player';
import { useLibraryStore } from '../../stores/library';
import { alphatabPlayer } from '../../services/alphatabPlayer';
import { useTicker } from '../../services/useTicker';
import {
  findFrettingsAtStartMs,
  resolveFretCount,
  resolveStringLabels,
  type FretPosition,
} from '../../domain/fretboard';

const playerStore = usePlayerStore();
const libraryStore = useLibraryStore();

// `PlayerModel` does not track the playhead (ms lives inside the
// alphatab-player singleton), so we pull it via a short-interval
// ticker while the panel is mounted. 60 ms ≈ 16 fps — perceptibly
// smooth without burning cycles. The ticker self-cleans on
// `onScopeDispose`; since the panel unmounts when
// `playerStore.fretboardOpen` flips off, the interval stops
// automatically.
const tickerActive = ref(true);
const tick = useTicker(tickerActive, 60);
const playheadMs = computed(() => {
  void tick.value; // depend on the ticker ref
  const getter = alphatabPlayer.getCurrentPositionMs;
  if (typeof getter !== 'function') return 0;
  const value = getter();
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
});

// --- Geometry (viewBox units, not pixels) --------------------------------
// Fixed spacings keep every string row and every fret column the
// same visual size relative to each other, regardless of how many
// strings / frets the current tab uses. The SVG then scales
// uniformly to fill the container width (CSS `height: auto`
// derives from the viewBox aspect ratio).
const STRING_SPACING = 26;
const FRET_SPACING = 42;
const PAD_LEFT = 56;
const PAD_RIGHT = 20;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const DOT_RADIUS = 11;
/**
 * X-distance from the nut to the shared centre of the string
 * label and the open-string ring. Both anchor here (ring via
 * `cx`, label via `text-anchor="middle"` + `x`) so the ring
 * perfectly encircles the letter instead of sitting beside it.
 */
const LABEL_CENTER_OFFSET = 22;
const STRING_STROKE = 1.5;
const FRET_STROKE = 1;
const NUT_STROKE = 3;
const INLAY_SINGLE_FRETS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const INLAY_DOUBLE_FRETS = new Set([12, 24]);
const INLAY_RADIUS = 4;
const INLAY_DOUBLE_OFFSET = STRING_SPACING * 1.2;

// --- Reactive state ------------------------------------------------------

const activeTrack = computed(
  () =>
    playerStore.tracks.find((t) => t.id === playerStore.activeTrackId) ?? null,
);

const currentItem = computed(() => {
  const id = playerStore.model.currentLibraryItemId;
  return id
    ? (libraryStore.items.find((item) => item.id === id) ?? null)
    : null;
});

const tuning = computed<readonly number[]>(
  () => activeTrack.value?.tuning ?? [],
);

const stringCount = computed(() => tuning.value.length);

const fretCount = computed(() =>
  resolveFretCount(currentItem.value?.metadata.maxFret ?? null),
);

const stringLabels = computed(() =>
  resolveStringLabels(tuning.value, playerStore.tuning),
);

const frettings = computed<readonly FretPosition[]>(() =>
  findFrettingsAtStartMs(playerStore.beatNotesByStartMs, playheadMs.value),
);

// --- Derived geometry ---------------------------------------------------
// Height grows with string count — one row per string with fixed
// spacing. Width grows with fret count. The SVG itself scales
// uniformly, so dots drawn at `r = DOT_RADIUS` stay circular.

const neckWidth = computed(() => fretCount.value * FRET_SPACING);
const neckHeight = computed(
  () => Math.max(0, stringCount.value - 1) * STRING_SPACING,
);
const viewBoxWidth = computed(() => neckWidth.value + PAD_LEFT + PAD_RIGHT);
const viewBoxHeight = computed(() => neckHeight.value + PAD_TOP + PAD_BOTTOM);
const neckLeft = computed(() => PAD_LEFT);
const neckRight = computed(() => PAD_LEFT + neckWidth.value);
const neckTop = computed(() => PAD_TOP);
const neckBottom = computed(() => PAD_TOP + neckHeight.value);

// --- Geometry helpers ---------------------------------------------------
// `stringIndex` 0 = thickest / lowest-pitched. Visually the lowest
// string lives at the BOTTOM of the neck (how a guitarist actually
// reads it — bass on bottom, treble on top), so we flip when
// mapping to Y.
function stringY(stringIndex: number): number {
  if (stringCount.value <= 1) return neckTop.value;
  const fromTop = stringCount.value - 1 - stringIndex;
  return neckTop.value + fromTop * STRING_SPACING;
}

function fretCenterX(fret: number): number {
  if (fret <= 0) {
    // Open-string indicator: ring sits around the label letter
    // (shared centre — see `LABEL_CENTER_OFFSET`).
    return neckLeft.value - LABEL_CENTER_OFFSET;
  }
  return neckLeft.value + (fret - 0.5) * FRET_SPACING;
}

function fretLineX(fret: number): number {
  return neckLeft.value + fret * FRET_SPACING;
}

const inlaySingle = computed(() =>
  Array.from(INLAY_SINGLE_FRETS)
    .filter((f) => f <= fretCount.value)
    .map((fret) => ({
      cx: fretCenterX(fret),
      cy: (neckTop.value + neckBottom.value) / 2,
      fret,
    })),
);

const inlayDouble = computed(() =>
  Array.from(INLAY_DOUBLE_FRETS)
    .filter((f) => f <= fretCount.value)
    .flatMap((fret) => {
      const cy = (neckTop.value + neckBottom.value) / 2;
      return [
        { cx: fretCenterX(fret), cy: cy - INLAY_DOUBLE_OFFSET, fret },
        { cx: fretCenterX(fret), cy: cy + INLAY_DOUBLE_OFFSET, fret },
      ];
    }),
);

const stringLines = computed(() =>
  Array.from({ length: stringCount.value }, (_, stringIndex) => ({
    stringIndex,
    y: stringY(stringIndex),
  })),
);

const fretLines = computed(() =>
  Array.from({ length: fretCount.value + 1 }, (_, fret) => ({
    fret,
    x: fretLineX(fret),
    isNut: fret === 0,
  })),
);

const dots = computed(() =>
  frettings.value
    .filter(
      (pos) =>
        pos.stringIndex >= 0 &&
        pos.stringIndex < stringCount.value &&
        pos.fret <= fretCount.value,
    )
    .map((pos) => ({
      key: `${pos.stringIndex}:${pos.fret}`,
      cx: fretCenterX(pos.fret),
      cy: stringY(pos.stringIndex),
      isOpen: pos.fret === 0,
    })),
);
</script>

<template>
  <div class="fretboard-panel">
    <svg
      class="fretboard-svg"
      :viewBox="`0 0 ${viewBoxWidth} ${viewBoxHeight}`"
      role="img"
      aria-label="Fretboard view of current position"
    >
      <!-- Inlays: painted first so strings / frets / dots cover them. -->
      <circle
        v-for="inlay in inlaySingle"
        :key="`inlay-s-${inlay.fret}`"
        class="fretboard-inlay"
        :cx="inlay.cx"
        :cy="inlay.cy"
        :r="INLAY_RADIUS"
      />
      <circle
        v-for="(inlay, i) in inlayDouble"
        :key="`inlay-d-${inlay.fret}-${i}`"
        class="fretboard-inlay"
        :cx="inlay.cx"
        :cy="inlay.cy"
        :r="INLAY_RADIUS"
      />

      <!-- Fret lines (nut = fret 0, thicker stroke). -->
      <line
        v-for="line in fretLines"
        :key="`fret-${line.fret}`"
        class="fretboard-fret"
        :class="{ 'fretboard-fret--nut': line.isNut }"
        :x1="line.x"
        :x2="line.x"
        :y1="neckTop"
        :y2="neckBottom"
        :stroke-width="line.isNut ? NUT_STROKE : FRET_STROKE"
      />

      <!-- Strings + left labels. -->
      <g
        v-for="string in stringLines"
        :key="`string-${string.stringIndex}`"
      >
        <line
          class="fretboard-string"
          :x1="neckLeft"
          :x2="neckRight"
          :y1="string.y"
          :y2="string.y"
          :stroke-width="STRING_STROKE"
        />
        <text
          class="fretboard-label"
          :x="neckLeft - LABEL_CENTER_OFFSET"
          :y="string.y + 4"
          text-anchor="middle"
        >
          {{ stringLabels[string.stringIndex] ?? '' }}
        </text>
      </g>

      <!-- Active-beat dots. -->
      <circle
        v-for="dot in dots"
        :key="dot.key"
        class="fretboard-dot"
        :class="{ 'fretboard-dot--open': dot.isOpen }"
        :cx="dot.cx"
        :cy="dot.cy"
        :r="DOT_RADIUS"
      />
    </svg>
  </div>
</template>

<style scoped>
.fretboard-panel {
  /* Absolute within the zero-height `.fretboard-anchor` wrapper
     — placed flush with the top-bar's bottom edge so horizontal
     score scrolling never moves it. Full container width; height
     self-derives from the SVG's viewBox aspect ratio (see below). */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 60;
  padding: 10px 12px 12px;
  background: rgba(19, 23, 32, 0.94);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(4px);
}

.fretboard-svg {
  /* `width: 100%` + `height: auto` on an SVG with a viewBox lets
     the browser compute the height from the aspect ratio. Combined
     with the default `preserveAspectRatio="xMidYMid meet"` that
     keeps every dot a perfect circle regardless of container width. */
  display: block;
  width: 100%;
  height: auto;
}

.fretboard-string {
  stroke: rgba(230, 230, 234, 0.7);
  stroke-linecap: round;
}

.fretboard-fret {
  stroke: rgba(183, 188, 199, 0.55);
}

.fretboard-fret--nut {
  stroke: rgba(230, 230, 234, 0.9);
}

.fretboard-inlay {
  fill: rgba(255, 255, 255, 0.14);
}

.fretboard-label {
  fill: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.02em;
}

.fretboard-dot {
  fill: var(--accent);
  stroke: rgba(0, 0, 0, 0.35);
  stroke-width: 1;
}

.fretboard-dot--open {
  fill: transparent;
  stroke: var(--accent);
  stroke-width: 2;
}
</style>
