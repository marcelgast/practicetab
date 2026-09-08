// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  ALPHATAB_TEXT_FONT_FAMILY,
  applyAlphaTabTempoShift,
  applyAlphaTabTextLineSpacing,
  EXTRA_LINE_SPACING_PX,
  TEMPO_EXTRA_UP_PX,
} from '../services/alphatabPlayer';

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildSvgRoot(
  lines: Array<{ x: number; y: number; style: string }>,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  for (const line of lines) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(line.x));
    text.setAttribute('y', String(line.y));
    text.setAttribute('style', line.style);
    text.textContent = 'test';
    svg.appendChild(text);
  }
  document.body.appendChild(svg);
  return svg;
}

// AlphaTab re-quotes font families with double quotes via
// FontParser.quoteFont, regardless of how the caller supplied them. Mirror
// that here so the tests exercise the actual runtime SVG output, not just
// the shape of our own TS constant.
const ALPHATAB_EMITTED_FONT_STACK =
  '"Space Grotesk", "SF Pro Text", "Segoe UI", sans-serif';
const appFontStyle = `stroke: none; font:15px ${ALPHATAB_EMITTED_FONT_STACK}; `;

describe('applyAlphaTabTextLineSpacing', () => {
  it('expands stacked multi-line text from its centre', () => {
    // Center-anchor: earlier lines move up, later lines move down, the
    // middle stays put. Splits the block's growth evenly between the
    // tempo band above and the staff below.
    const svg = buildSvgRoot([
      { x: 100, y: 50, style: appFontStyle },
      { x: 100, y: 65, style: appFontStyle }, // 15px gap — tight line-box
      { x: 100, y: 80, style: appFontStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    expect(ys[0]).toBe(50 - EXTRA_LINE_SPACING_PX);
    expect(ys[1]).toBe(65);
    expect(ys[2]).toBe(80 + EXTRA_LINE_SPACING_PX);
    svg.remove();
  });

  it('expands even-count blocks symmetrically around the midpoint', () => {
    const svg = buildSvgRoot([
      { x: 100, y: 50, style: appFontStyle },
      { x: 100, y: 65, style: appFontStyle },
      { x: 100, y: 80, style: appFontStyle },
      { x: 100, y: 95, style: appFontStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    // With 4 lines, centre is between indices 1 and 2 → shifts are
    // -1.5, -0.5, +0.5, +1.5 × extraSpacing.
    expect(ys[0]).toBe(50 - 1.5 * EXTRA_LINE_SPACING_PX);
    expect(ys[1]).toBe(65 - 0.5 * EXTRA_LINE_SPACING_PX);
    expect(ys[2]).toBe(80 + 0.5 * EXTRA_LINE_SPACING_PX);
    expect(ys[3]).toBe(95 + 1.5 * EXTRA_LINE_SPACING_PX);
    svg.remove();
  });

  it('leaves single-line texts untouched', () => {
    const svg = buildSvgRoot([{ x: 100, y: 50, style: appFontStyle }]);
    applyAlphaTabTextLineSpacing(svg);
    expect(svg.querySelector('text')?.getAttribute('y')).toBe('50');
    svg.remove();
  });

  it('ignores texts that do not use the app font (music glyphs, tab numbers)', () => {
    const tablatureStyle = `stroke: none; font:13px Arial, sans-serif; `;
    const svg = buildSvgRoot([
      { x: 50, y: 100, style: tablatureStyle },
      { x: 50, y: 115, style: tablatureStyle },
      { x: 50, y: 130, style: tablatureStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    expect(ys).toEqual([100, 115, 130]);
    svg.remove();
  });

  it('does not group unrelated same-x same-font texts across the score', () => {
    // Two annotations on distant bars happen to share x — y gap much
    // larger than a line box, so they must not be treated as stacked.
    const svg = buildSvgRoot([
      { x: 200, y: 40, style: appFontStyle },
      { x: 200, y: 600, style: appFontStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    expect(ys).toEqual([40, 600]);
    svg.remove();
  });

  it('spaces two separate multiline blocks sharing the same x independently', () => {
    // Two 2-line annotations at the same x on different systems must
    // each receive line-spacing — the far gap between the blocks must
    // not short-circuit spacing for either one.
    const svg = buildSvgRoot([
      { x: 200, y: 40, style: appFontStyle },
      { x: 200, y: 55, style: appFontStyle }, // tight gap → block 1
      { x: 200, y: 400, style: appFontStyle },
      { x: 200, y: 415, style: appFontStyle }, // tight gap → block 2
    ]);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    const half = 0.5 * EXTRA_LINE_SPACING_PX;
    expect(ys[0]).toBe(40 - half);
    expect(ys[1]).toBe(55 + half);
    expect(ys[2]).toBe(400 - half);
    expect(ys[3]).toBe(415 + half);
    svg.remove();
  });

  it('tolerates fractional x rounding from AlphaTab scale', () => {
    const svg = buildSvgRoot([
      { x: 100.05, y: 50, style: appFontStyle },
      { x: 100.1, y: 65, style: appFontStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    // 2 lines → centre is between them → shifts are ±0.5 × extraSpacing.
    expect(ys[0]).toBe(50 - 0.5 * EXTRA_LINE_SPACING_PX);
    expect(ys[1]).toBe(65 + 0.5 * EXTRA_LINE_SPACING_PX);
    svg.remove();
  });

  it('is a no-op for null/undefined roots', () => {
    expect(() => applyAlphaTabTextLineSpacing(null)).not.toThrow();
    expect(() => applyAlphaTabTextLineSpacing(undefined)).not.toThrow();
  });

  it('matches stacked text regardless of AlphaTab font quote style', () => {
    // Regression: AlphaTab re-quotes family names with double quotes, but
    // our constant uses single quotes. The marker must match both.
    const singleQuotedStyle = `stroke: none; font:15px ${ALPHATAB_TEXT_FONT_FAMILY}; `;
    const svg = buildSvgRoot([
      { x: 100, y: 50, style: singleQuotedStyle },
      { x: 100, y: 65, style: singleQuotedStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    expect(ys[0]).toBe(50 - 0.5 * EXTRA_LINE_SPACING_PX);
    expect(ys[1]).toBe(65 + 0.5 * EXTRA_LINE_SPACING_PX);
    svg.remove();
  });

  it('is idempotent across repeated passes on the same DOM', () => {
    // partialRenderFinished can fire several times as lazy partials come
    // into view; repeated spacing passes on already-shifted elements must
    // not keep adding spacing every time.
    const svg = buildSvgRoot([
      { x: 100, y: 50, style: appFontStyle },
      { x: 100, y: 65, style: appFontStyle },
      { x: 100, y: 80, style: appFontStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg);
    applyAlphaTabTextLineSpacing(svg);
    applyAlphaTabTextLineSpacing(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    expect(ys[0]).toBe(50 - EXTRA_LINE_SPACING_PX);
    expect(ys[1]).toBe(65);
    expect(ys[2]).toBe(80 + EXTRA_LINE_SPACING_PX);
    svg.remove();
  });

  it('is a no-op when extraSpacing is 0', () => {
    const svg = buildSvgRoot([
      { x: 100, y: 50, style: appFontStyle },
      { x: 100, y: 65, style: appFontStyle },
    ]);
    applyAlphaTabTextLineSpacing(svg, 0);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    expect(ys).toEqual([50, 65]);
    svg.remove();
  });
});

function buildAtGroup(tx: number, ty: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('transform', `translate(${tx} ${ty})`);
  g.setAttribute('class', 'at');
  const inner = document.createElementNS(SVG_NS, 'text');
  inner.setAttribute('style', 'stroke:none');
  inner.textContent = '♩';
  g.appendChild(inner);
  return g;
}

describe('applyAlphaTabTempoShift', () => {
  const tempoLabelStyle = `stroke: none; font:bold 14px ${ALPHATAB_EMITTED_FONT_STACK}; `;
  // Section markers use bold app-font at a similar size but — unlike
  // the tempo band — never render alongside a Bravura music glyph.
  const markerStyle = `stroke: none; font:bold 15px ${ALPHATAB_EMITTED_FONT_STACK}; `;

  function buildTempoSvg(labelY: number): {
    svg: SVGSVGElement;
    label: SVGTextElement;
    glyph: SVGGElement;
  } {
    const svg = buildSvgRoot([{ x: 80, y: labelY, style: tempoLabelStyle }]);
    const glyph = buildAtGroup(60, labelY);
    svg.appendChild(glyph);
    const label = svg.querySelector('text') as SVGTextElement;
    return { svg, label, glyph };
  }

  it('shifts tempo label and its Bravura <g class="at"> glyph upward', () => {
    // AlphaTab's default CssFontSvgCanvas wraps music glyphs in a
    // translated group; the inner <text> has no y attribute.
    const { svg, label, glyph } = buildTempoSvg(40);
    applyAlphaTabTempoShift(svg);
    expect(label.getAttribute('y')).toBe(String(40 - TEMPO_EXTRA_UP_PX));
    expect(glyph.getAttribute('transform')).toBe(
      `translate(60 ${40 - TEMPO_EXTRA_UP_PX})`,
    );
    svg.remove();
  });

  it('does not touch a bold app-font section marker without a nearby glyph (regression)', () => {
    // Section markers share the tempo label's style signature (bold +
    // app-font + small size) but have no accompanying Bravura glyph.
    // Without the glyph-proximity check we would shift every marker
    // out of its effect band.
    const svg = buildSvgRoot([{ x: 80, y: 40, style: markerStyle }]);
    applyAlphaTabTempoShift(svg);
    expect(svg.querySelector('text')?.getAttribute('y')).toBe('40');
    svg.remove();
  });

  it('distinguishes tempo (has glyph) from marker (no glyph) in the same DOM', () => {
    // Tempo label at y=40 with glyph → shifts. Marker at y=120 without
    // glyph → stays.
    const svg = buildSvgRoot([
      { x: 80, y: 40, style: tempoLabelStyle },
      { x: 300, y: 120, style: markerStyle },
    ]);
    svg.appendChild(buildAtGroup(60, 40));
    applyAlphaTabTempoShift(svg);
    const ys = Array.from(svg.querySelectorAll('text')).map((el) =>
      Number(el.getAttribute('y')),
    );
    expect(ys[0]).toBe(40 - TEMPO_EXTRA_UP_PX); // tempo label moved
    expect(ys[1]).toBe(120); // marker stayed
    svg.remove();
  });

  it('leaves <g class="at"> groups far from the tempo label alone', () => {
    const { svg, glyph } = buildTempoSvg(40);
    const distantGlyph = buildAtGroup(60, 500);
    svg.appendChild(distantGlyph);
    applyAlphaTabTempoShift(svg);
    expect(glyph.getAttribute('transform')).toBe(
      `translate(60 ${40 - TEMPO_EXTRA_UP_PX})`,
    );
    expect(distantGlyph.getAttribute('transform')).toBe('translate(60 500)');
    svg.remove();
  });

  it('leaves score-text at the same y untouched (regression)', () => {
    // AlphaTab can place the tempo label and the first score-text line
    // on the same baseline (tempo on left, text block on right). The
    // tempo shift must not drag the score text along.
    const { svg } = buildTempoSvg(40);
    const scoreText = document.createElementNS(SVG_NS, 'text');
    scoreText.setAttribute('x', '400');
    scoreText.setAttribute('y', '40');
    scoreText.setAttribute(
      'style',
      `stroke: none; font:15px ${ALPHATAB_EMITTED_FONT_STACK}; `,
    );
    scoreText.textContent = 'Das hier ist text';
    svg.appendChild(scoreText);
    applyAlphaTabTempoShift(svg);
    expect(scoreText.getAttribute('y')).toBe('40'); // score text stayed
    svg.remove();
  });

  it('leaves unrelated text far from the tempo label untouched', () => {
    const { svg } = buildTempoSvg(40);
    const distant = document.createElementNS(SVG_NS, 'text');
    distant.setAttribute('x', '100');
    distant.setAttribute('y', '90');
    distant.setAttribute(
      'style',
      `stroke: none; font:15px ${ALPHATAB_EMITTED_FONT_STACK}; `,
    );
    svg.appendChild(distant);
    applyAlphaTabTempoShift(svg);
    expect(distant.getAttribute('y')).toBe('90');
    svg.remove();
  });

  it('ignores non-app-font bold text (e.g. bar numbers)', () => {
    const svg = buildSvgRoot([
      {
        x: 80,
        y: 40,
        style: 'stroke: none; font:bold 11px Arial, sans-serif; ',
      },
    ]);
    svg.appendChild(buildAtGroup(60, 40));
    applyAlphaTabTempoShift(svg);
    expect(svg.querySelector('text')?.getAttribute('y')).toBe('40');
    svg.remove();
  });

  it('is idempotent across repeated passes on the same DOM', () => {
    const { svg, label, glyph } = buildTempoSvg(40);
    applyAlphaTabTempoShift(svg);
    applyAlphaTabTempoShift(svg);
    applyAlphaTabTempoShift(svg);
    expect(label.getAttribute('y')).toBe(String(40 - TEMPO_EXTRA_UP_PX));
    expect(glyph.getAttribute('transform')).toBe(
      `translate(60 ${40 - TEMPO_EXTRA_UP_PX})`,
    );
    svg.remove();
  });

  it('is a no-op for null/undefined roots or zero shift', () => {
    expect(() => applyAlphaTabTempoShift(null)).not.toThrow();
    const { svg, label } = buildTempoSvg(40);
    applyAlphaTabTempoShift(svg, 0);
    expect(label.getAttribute('y')).toBe('40');
    svg.remove();
  });
});
