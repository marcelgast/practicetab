import { ALPHATAB_TEXT_FONT_FAMILY } from './types';

// AlphaTab's TextGlyph stacks multi-line text (e.g. GP "Text" annotations
// above a bar) using the tight glyph bounding box of each line as the
// line-height — so descenders from one line can touch ascenders of the
// next. There is no public AlphaTab setting for inter-line padding on
// these blocks (unlike `lyricLinesPaddingBetween`). After the SVG is
// emitted we walk the rendered `<text>` elements and spread stacked
// lines apart.
//
// Shift direction: we expand the block from its center — earlier lines
// move up, later lines move down, the middle stays put. Neither end of
// the original layout slot has much slack (tempo band above, staff
// below), so splitting the growth evenly minimises overlap with either
// neighbour.
export const EXTRA_LINE_SPACING_PX = 3;

// Shift applied to the tempo marker ("♩ = 120") so it sits clearly
// above the score-text block. AlphaTab places the tempo label on the
// same baseline as the text block's first line (tempo on the left of
// the system, text on the right). Combined with the line-spacing pass
// pulling the top text line upward by ~6px, we need at least ~14px of
// additional lift before a visible gap opens up. There's plenty of
// slack above the tempo band (tuning / author credits live further up)
// so we can be generous here.
export const TEMPO_EXTRA_UP_PX = 20;

// Marker on the font's first family name — we only touch `<text>`
// elements that use the app text font stack we configured, so we never
// move music glyphs or tablature numbers. Quotes stripped so we match
// AlphaTab's re-quoted output (it uses double quotes) regardless of the
// quote style in our own constant.
const FONT_MARKER = ALPHATAB_TEXT_FONT_FAMILY.split(',')[0]
  .trim()
  .replace(/^['"]|['"]$/g, '');

type TextGroup = {
  fontKey: string;
  xKey: number;
  elements: SVGTextElement[];
};

function readNumberAttr(el: Element, name: string): number | null {
  const raw = el.getAttribute(name);
  if (raw === null) {
    return null;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function readFontSizePx(style: string): number | null {
  // AlphaTab inlines e.g. `font:17px 'Space Grotesk', ...`. Extract the
  // first `<N>px` token after `font:` so we don't pick up anything else.
  const match = style.match(/font:\s*(?:[^;]*?\s)?(\d+(?:\.\d+)?)px/);
  if (!match) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

// Marker attribute — set on each element after we shift it so a second
// pass over the same DOM doesn't double-shift. A fresh render recreates
// the elements (placeholder.innerHTML = body), so the marker correctly
// resets across re-renders.
const SPACED_MARKER_ATTR = 'data-at-text-spaced';

function groupStackedTextLines(root: Element): TextGroup[] {
  const textNodes = root.querySelectorAll<SVGTextElement>('text');
  const groups = new Map<string, TextGroup>();
  for (const el of textNodes) {
    if (el.hasAttribute(SPACED_MARKER_ATTR)) {
      continue;
    }
    const style = el.getAttribute('style');
    if (!style || !style.includes(FONT_MARKER)) {
      continue;
    }
    const x = readNumberAttr(el, 'x');
    if (x === null) {
      continue;
    }
    const xKey = Math.round(x * 10) / 10;
    const key = `${style}|${xKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.elements.push(el);
    } else {
      groups.set(key, { fontKey: style, xKey, elements: [el] });
    }
  }
  return [...groups.values()].filter((g) => g.elements.length > 1);
}

function shiftCluster(
  cluster: { el: SVGTextElement; y: number }[],
  extraSpacing: number,
): void {
  // Expand from the centre so the block grows equally upward (into the
  // top padding reserved above the system) and downward (into the effect
  // band padding above the staff). Both neighbours — the tempo marker
  // above and the staff below — sit close to the block, so splitting the
  // growth evenly keeps the least overlap on each side.
  const center = (cluster.length - 1) / 2;
  for (let i = 0; i < cluster.length; i += 1) {
    const shift = (i - center) * extraSpacing;
    if (shift !== 0) {
      cluster[i].el.setAttribute('y', String(cluster[i].y + shift));
    }
    cluster[i].el.setAttribute(SPACED_MARKER_ATTR, '1');
  }
}

function applyLineShift(group: TextGroup, extraSpacing: number): void {
  const fontSize = readFontSizePx(group.fontKey);
  if (fontSize === null || fontSize <= 0) {
    return;
  }
  const entries = group.elements
    .map((el) => ({ el, y: readNumberAttr(el, 'y') }))
    .filter(
      (entry): entry is { el: SVGTextElement; y: number } => entry.y !== null,
    )
    .sort((a, b) => a.y - b.y);
  if (entries.length < 2) {
    return;
  }
  // Split entries into consecutive tight clusters. Two separate
  // multiline text annotations can legitimately share the same font + x
  // (e.g. same-column blocks on different systems) but sit far apart;
  // their inter-block gap is much larger than any tight line-box, so we
  // break clusters whenever consecutive gaps leave the tight range.
  // Each resulting cluster of 2+ lines gets spaced independently.
  const minGap = fontSize * 0.4;
  const maxGap = fontSize * 1.8;
  let cluster: typeof entries = [entries[0]];
  for (let i = 1; i < entries.length; i += 1) {
    const gap = entries[i].y - entries[i - 1].y;
    if (gap >= minGap && gap <= maxGap) {
      cluster.push(entries[i]);
      continue;
    }
    if (cluster.length >= 2) {
      shiftCluster(cluster, extraSpacing);
    }
    cluster = [entries[i]];
  }
  if (cluster.length >= 2) {
    shiftCluster(cluster, extraSpacing);
  }
}

// Walk the rendered AlphaTab SVG and add vertical breathing room between
// stacked text lines that share font + x position. Safe to call after
// every `renderFinished` / `postRenderFinished` — idempotent only when
// called on a freshly emitted partial, so callers should only invoke it
// on AlphaTab's render events (not on arbitrary DOM updates).
export function applyAlphaTabTextLineSpacing(
  root: Element | null | undefined,
  extraSpacing: number = EXTRA_LINE_SPACING_PX,
): void {
  if (!root || extraSpacing <= 0) {
    return;
  }
  for (const group of groupStackedTextLines(root)) {
    applyLineShift(group, extraSpacing);
  }
}

// Marker for already-shifted tempo elements so repeated render passes
// over the same DOM don't stack the upward shift.
const TEMPO_MARKER_ATTR = 'data-at-tempo-shifted';

// EffectTempo label uses a unique `bold <size>px` + app-font signature.
// Title/Subtitle/Artist/... are regular weight, Marker is bold 15px, so
// anything bold from the app-font stack at tempo-marker size (≤16px) is
// a tempo label. The check stays conservative to avoid grabbing the
// marker band or headline.
function isTempoLabelStyle(style: string): boolean {
  if (!style.includes(FONT_MARKER)) {
    return false;
  }
  if (!/\bbold\b/.test(style)) {
    return false;
  }
  const size = readFontSizePx(style);
  if (size === null) {
    return false;
  }
  return size > 0 && size <= 16;
}

const TRANSLATE_RE = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/;

function readTranslateY(transform: string | null): number | null {
  if (!transform) {
    return null;
  }
  const match = transform.match(TRANSLATE_RE);
  if (!match) {
    return null;
  }
  const value = Number.parseFloat(match[2]);
  return Number.isFinite(value) ? value : null;
}

function shiftTranslateY(el: Element, deltaY: number): boolean {
  const transform = el.getAttribute('transform');
  if (!transform) {
    return false;
  }
  const match = transform.match(TRANSLATE_RE);
  if (!match) {
    return false;
  }
  const oldX = Number.parseFloat(match[1]);
  const oldY = Number.parseFloat(match[2]);
  if (!Number.isFinite(oldX) || !Number.isFinite(oldY)) {
    return false;
  }
  const next = transform.replace(
    TRANSLATE_RE,
    `translate(${oldX} ${oldY + deltaY})`,
  );
  el.setAttribute('transform', next);
  return true;
}

// Shift the tempo marker (label + adjacent music glyph) upward so it
// sits clear of the expanded score-text block that line-spacing grew
// toward it.
//
// AlphaTab's default CssFontSvgCanvas emits tempo content at the same y
// (`notePosY`) in three forms:
//   1. the "= 120" label → `<text x y style='...bold 15px app-font...'>`
//   2. the quarter-note music glyph → `<g class="at" transform="translate(x y)"><text>`
//      (no y on the inner `<text>` — the parent `<g>` carries the translate)
//   3. an optional prefix text (rit./accel./…) → same shape as (1)
//
// So we both lift `<text>` elements matching the tempo label signature
// AND shift `<g class="at">` groups whose translate-y sits in the same
// tight vertical band. Only non-app-font `<text>` elements can be pulled
// in as siblings — the first line of the score-text block often shares a
// y with the tempo marker and must be left alone.
export function applyAlphaTabTempoShift(
  root: Element | null | undefined,
  extraUp: number = TEMPO_EXTRA_UP_PX,
): void {
  if (!root || extraUp <= 0) {
    return;
  }
  const textNodes = root.querySelectorAll<SVGTextElement>('text');
  const verticalTolerance = 4;
  const atGroups = root.querySelectorAll<SVGGElement>('g.at[transform]');
  // Pre-compute translate-y for every Bravura glyph group so we can
  // quickly check whether a label candidate has a music glyph next to
  // it. The quarter-note glyph is the structural signature that
  // distinguishes tempo markers from section markers (both use
  // bold + app-font at similar sizes).
  const atGroupYs: number[] = [];
  for (const g of atGroups) {
    const y = readTranslateY(g.getAttribute('transform'));
    if (y !== null) {
      atGroupYs.push(y);
    }
  }
  const hasGlyphAtY = (y: number): boolean => {
    for (const gy of atGroupYs) {
      if (Math.abs(gy - y) <= verticalTolerance) {
        return true;
      }
    }
    return false;
  };

  const tempoLabels: { el: SVGTextElement; y: number }[] = [];
  for (const el of textNodes) {
    if (el.hasAttribute(TEMPO_MARKER_ATTR)) {
      continue;
    }
    const style = el.getAttribute('style');
    if (!style || !isTempoLabelStyle(style)) {
      continue;
    }
    const y = readNumberAttr(el, 'y');
    if (y === null) {
      continue;
    }
    // Tempo labels always render next to a Bravura quarter-note glyph
    // (see TempoEffectInfo.paint: `= value` is drawn at the same
    // notePosY as a MetNoteQuarterUp symbol). Section markers share the
    // bold + app-font signature but have no accompanying music glyph,
    // so missing a same-y <g class="at"> means this is a marker — skip.
    if (!hasGlyphAtY(y)) {
      continue;
    }
    tempoLabels.push({ el, y });
  }
  if (tempoLabels.length === 0) {
    return;
  }
  const shiftedText = new Set<SVGTextElement>();
  const shiftedGroups = new Set<Element>();

  for (const { el: label, y: labelY } of tempoLabels) {
    const textGroup: SVGTextElement[] = [label];
    for (const el of textNodes) {
      if (
        el === label ||
        shiftedText.has(el) ||
        el.hasAttribute(TEMPO_MARKER_ATTR)
      ) {
        continue;
      }
      const style = el.getAttribute('style') ?? '';
      if (style.includes(FONT_MARKER)) {
        continue;
      }
      const y = readNumberAttr(el, 'y');
      if (y === null) {
        continue;
      }
      if (Math.abs(y - labelY) <= verticalTolerance) {
        textGroup.push(el);
      }
    }
    for (const el of textGroup) {
      const y = readNumberAttr(el, 'y');
      if (y === null) {
        continue;
      }
      el.setAttribute('y', String(y - extraUp));
      el.setAttribute(TEMPO_MARKER_ATTR, '1');
      shiftedText.add(el);
    }
    for (const g of atGroups) {
      if (shiftedGroups.has(g) || g.hasAttribute(TEMPO_MARKER_ATTR)) {
        continue;
      }
      const gy = readTranslateY(g.getAttribute('transform'));
      if (gy === null) {
        continue;
      }
      if (Math.abs(gy - labelY) <= verticalTolerance) {
        if (shiftTranslateY(g, -extraUp)) {
          g.setAttribute(TEMPO_MARKER_ATTR, '1');
          shiftedGroups.add(g);
        }
      }
    }
  }
}
