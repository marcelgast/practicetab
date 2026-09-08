import { describe, it, expect } from 'vitest';
import {
  OVERLAY_COLORS,
  SEGMENT_GAP_HORIZONTAL_PX,
  SEGMENT_GAP_PX,
  SEGMENT_HEIGHT_PX,
  colorForResult,
  groupBeatsIntoLines,
  paintBendGlyph,
  paintHorizontalArrow,
  paintNoteFeedback,
  paintSegment,
  paintVerticalArrow,
  type FeedbackBarCell,
  type FeedbackBarEntry,
  type OverlayPaintContext,
} from '../components/player/overlayPainter';
import {
  STRICTNESS_PRESETS,
  type BendResult,
  type NoteResult,
} from '../domain/noteComparison';
import type { ExpectedNote } from '../domain/expectedNoteTimeline';
import type { BeatRectangle } from '../services/player/beatRectIndex';

// ---------------------------------------------------------------------------
// Recording mock
// ---------------------------------------------------------------------------

type Call =
  | { op: 'beginPath' }
  | { op: 'closePath' }
  | { op: 'moveTo'; x: number; y: number }
  | { op: 'lineTo'; x: number; y: number }
  | {
      op: 'arc';
      x: number;
      y: number;
      radius: number;
      startAngle: number;
      endAngle: number;
    }
  | { op: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
  | { op: 'stroke' }
  | { op: 'fill' }
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'set'; prop: string; value: unknown };

interface Recorder extends OverlayPaintContext {
  calls: Call[];
}

function createRecorder(): Recorder {
  const calls: Call[] = [];
  const rec: Recorder = {
    calls,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    beginPath: () => calls.push({ op: 'beginPath' }),
    closePath: () => calls.push({ op: 'closePath' }),
    moveTo: (x, y) => calls.push({ op: 'moveTo', x, y }),
    lineTo: (x, y) => calls.push({ op: 'lineTo', x, y }),
    arc: (x, y, radius, startAngle, endAngle) =>
      calls.push({ op: 'arc', x, y, radius, startAngle, endAngle }),
    quadraticCurveTo: (cpx, cpy, x, y) =>
      calls.push({ op: 'quadraticCurveTo', cpx, cpy, x, y }),
    stroke: () => calls.push({ op: 'stroke' }),
    fill: () => calls.push({ op: 'fill' }),
    save: () => calls.push({ op: 'save' }),
    restore: () => calls.push({ op: 'restore' }),
  };
  // Wrap property setters to record assignments too.
  return new Proxy(rec, {
    set(target, prop, value) {
      if (
        prop === 'fillStyle' ||
        prop === 'strokeStyle' ||
        prop === 'lineWidth' ||
        prop === 'lineCap' ||
        prop === 'globalAlpha' ||
        prop === 'shadowColor' ||
        prop === 'shadowBlur'
      ) {
        calls.push({ op: 'set', prop: String(prop), value });
      }
      (target as Record<string, unknown>)[prop as string] = value;
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeExpectedNote(overrides: Partial<ExpectedNote> = {}): ExpectedNote {
  return {
    startMs: 0,
    endMs: 500,
    midiNote: 64,
    frequency: 329.63,
    noteName: 'E4',
    trackId: 'track-0',
    barIndex: 0,
    beatIndex: 0,
    stringIndex: null,
    fretNumber: null,
    bend: null,
    vibrato: null,
    tempoFactor: 1,
    ...overrides,
  } as ExpectedNote;
}

function makeHit(overrides: Partial<NoteResult> = {}): NoteResult {
  return {
    expectedNote: makeExpectedNote(),
    outcome: 'hit',
    pitchAccuracy: 'perfect',
    centsOff: 0,
    timingAccuracy: 'perfect',
    timingOffsetMs: 0,
    bendResult: null,
    ...overrides,
  };
}

function makeRect(overrides: Partial<BeatRectangle> = {}): BeatRectangle {
  const base: BeatRectangle = {
    x: 100,
    y: 200,
    w: 20,
    h: 40,
    onNotesX: 110,
    // Default `realTopY` mirrors `y` — tests that care about the
    // realBounds vs visualBounds split pass it explicitly.
    realTopY: 200,
    ...overrides,
  };
  // If only `y` is overridden, keep realTopY in sync so the legacy
  // tests (written before realTopY existed) still match. Tests that
  // need a different realTopY pass it explicitly after `y`.
  if (overrides.y !== undefined && overrides.realTopY === undefined) {
    base.realTopY = overrides.y;
  }
  return base;
}

function makeCell(overrides: Partial<FeedbackBarCell> = {}): FeedbackBarCell {
  const rect = overrides.rect ?? makeRect();
  return {
    // Default cell mirrors the common case — centred on the note, height
    // matches the bar constant.
    x: rect.onNotesX - 10,
    y: 180,
    w: 20,
    h: SEGMENT_HEIGHT_PX,
    rect,
    result: overrides.result ?? makeHit(),
    ...overrides,
  };
}

const RECT: BeatRectangle = makeRect();

// ---------------------------------------------------------------------------
// colorForResult
// ---------------------------------------------------------------------------

describe('colorForResult', () => {
  it('returns grey for missed notes', () => {
    const result: NoteResult = {
      expectedNote: makeExpectedNote(),
      outcome: 'missed',
      pitchAccuracy: null,
      centsOff: null,
      timingAccuracy: null,
      timingOffsetMs: null,
      bendResult: null,
    };
    expect(colorForResult(result)).toBe(OVERLAY_COLORS.missed);
  });

  it('returns yellow for extra notes', () => {
    const result: NoteResult = {
      expectedNote: makeExpectedNote(),
      outcome: 'extra',
      pitchAccuracy: 'wrong',
      centsOff: null,
      timingAccuracy: null,
      timingOffsetMs: null,
      bendResult: null,
    };
    expect(colorForResult(result)).toBe(OVERLAY_COLORS.extra);
  });

  it('returns green only when every rating is perfect', () => {
    expect(colorForResult(makeHit())).toBe(OVERLAY_COLORS.perfect);
  });

  it('returns yellow when any rating is below perfect but none is wrong (good/acceptable)', () => {
    expect(
      colorForResult(
        makeHit({ pitchAccuracy: 'good', timingAccuracy: 'good' }),
      ),
    ).toBe(OVERLAY_COLORS.good);

    expect(
      colorForResult(
        makeHit({ pitchAccuracy: 'perfect', timingAccuracy: 'good' }),
      ),
    ).toBe(OVERLAY_COLORS.good);

    expect(
      colorForResult(
        makeHit({ pitchAccuracy: 'perfect', timingAccuracy: 'acceptable' }),
      ),
    ).toBe(OVERLAY_COLORS.good);
  });

  it('returns red whenever any rating is wrong', () => {
    expect(
      colorForResult(
        makeHit({ pitchAccuracy: 'acceptable', timingAccuracy: 'wrong' }),
      ),
    ).toBe(OVERLAY_COLORS.wrong);
    expect(
      colorForResult(
        makeHit({ pitchAccuracy: 'wrong', timingAccuracy: 'perfect' }),
      ),
    ).toBe(OVERLAY_COLORS.wrong);
  });

  it('factors bendResult into the three-band rule — wrong bend → red', () => {
    const bend: BendResult = {
      expectedBend: { type: 'bend', startPitchOffset: 0, endPitchOffset: 2 },
      maxPitchOffsetSt: 2,
      targetCentsOff: 200,
      bendAccuracy: 'wrong',
    };
    expect(colorForResult(makeHit({ bendResult: bend }))).toBe(
      OVERLAY_COLORS.wrong,
    );
  });

  it('a perfect bend next to perfect pitch + timing stays green', () => {
    const bend: BendResult = {
      expectedBend: { type: 'bend', startPitchOffset: 0, endPitchOffset: 2 },
      maxPitchOffsetSt: 2,
      targetCentsOff: 5,
      bendAccuracy: 'perfect',
    };
    expect(colorForResult(makeHit({ bendResult: bend }))).toBe(
      OVERLAY_COLORS.perfect,
    );
  });

  it('a non-perfect bend (mapped to good) downgrades a perfect dot to yellow', () => {
    // Bend only has three bands; anything non-wrong non-perfect lands as
    // "good" in the overlay mapping — that must prevent the green dot.
    const bend: BendResult = {
      expectedBend: { type: 'bend', startPitchOffset: 0, endPitchOffset: 2 },
      maxPitchOffsetSt: 2,
      targetCentsOff: 40,
      bendAccuracy: 'good',
    };
    expect(colorForResult(makeHit({ bendResult: bend }))).toBe(
      OVERLAY_COLORS.good,
    );
  });
});

// ---------------------------------------------------------------------------
// paintSegment
// ---------------------------------------------------------------------------

describe('paintSegment', () => {
  it('fills a square rectangle at the given coordinates', () => {
    // Square corners are intentional — adjacent cells of the feedback
    // bar butt up against each other, and rounded corners would leave
    // visible notches at every cell boundary.
    const ctx = createRecorder();
    paintSegment(ctx, {
      x: 50,
      y: 60,
      w: 40,
      h: 10,
      color: '#abcdef',
    });
    expect(ctx.calls.filter((c) => c.op === 'arc')).toHaveLength(0);
    expect(ctx.calls.filter((c) => c.op === 'moveTo')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'lineTo')).toHaveLength(3);
    expect(ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(1);
    const fillSet = ctx.calls.find(
      (c) => c.op === 'set' && c.prop === 'fillStyle',
    ) as { value: string };
    expect(fillSet.value).toBe('#abcdef');
  });

  it('is a no-op when width or height is zero', () => {
    const ctx = createRecorder();
    paintSegment(ctx, { x: 0, y: 0, w: 0, h: 10, color: '#abc' });
    paintSegment(ctx, { x: 0, y: 0, w: 10, h: 0, color: '#abc' });
    expect(ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(0);
  });

  it('restores previous fillStyle after drawing', () => {
    const ctx = createRecorder();
    ctx.fillStyle = '#originalFill';
    ctx.calls.length = 0;
    paintSegment(ctx, { x: 0, y: 0, w: 10, h: 10, color: '#new' });
    expect(ctx.fillStyle).toBe('#originalFill');
  });
});

// ---------------------------------------------------------------------------
// paintHorizontalArrow
// ---------------------------------------------------------------------------

describe('paintHorizontalArrow', () => {
  it('draws a shaft pointing right with its head triangle at the tip', () => {
    const ctx = createRecorder();
    paintHorizontalArrow(ctx, {
      anchorX: 100,
      anchorY: 50,
      direction: 'right',
      length: 20,
      color: '#ff0000',
    });

    const moves = ctx.calls.filter(
      (c) => c.op === 'moveTo' || c.op === 'lineTo',
    );
    // anchorX is the BASE of the shaft (no implicit gap); tip at
    // anchorX + length = 120. Head size = 4 → triangle back 4px to
    // the left → 116, with ±4 spread vertically.
    expect(moves[0]).toMatchObject({ op: 'moveTo', x: 100, y: 50 });
    expect(moves[1]).toMatchObject({ op: 'lineTo', x: 120, y: 50 });
    expect(moves[2]).toMatchObject({ op: 'moveTo', x: 120, y: 50 });
    expect(moves[3]).toMatchObject({ op: 'lineTo', x: 116, y: 46 });
    expect(moves[4]).toMatchObject({ op: 'lineTo', x: 116, y: 54 });
  });

  it('mirrors geometry for left-direction arrows', () => {
    const ctx = createRecorder();
    paintHorizontalArrow(ctx, {
      anchorX: 100,
      anchorY: 50,
      direction: 'left',
      length: 20,
      color: '#ff0000',
    });

    const moves = ctx.calls.filter(
      (c) => c.op === 'moveTo' || c.op === 'lineTo',
    );
    // Shaft start at anchor (100), tip at 100 - 20 = 80.
    expect(moves[0]).toMatchObject({ op: 'moveTo', x: 100, y: 50 });
    expect(moves[1]).toMatchObject({ op: 'lineTo', x: 80, y: 50 });
    expect(moves[2]).toMatchObject({ op: 'moveTo', x: 80, y: 50 });
    expect(moves[3]).toMatchObject({ op: 'lineTo', x: 84, y: 46 });
    expect(moves[4]).toMatchObject({ op: 'lineTo', x: 84, y: 54 });
  });
});

// ---------------------------------------------------------------------------
// paintVerticalArrow
// ---------------------------------------------------------------------------

describe('paintVerticalArrow', () => {
  it('draws an up-pointing shaft with head triangle at the tip', () => {
    const ctx = createRecorder();
    paintVerticalArrow(ctx, {
      anchorX: 100,
      anchorY: 50,
      direction: 'up',
      length: 20,
      color: '#00ff00',
    });

    const moves = ctx.calls.filter(
      (c) => c.op === 'moveTo' || c.op === 'lineTo',
    );
    // anchorY is the BASE of the shaft; tip at 50 - 20 = 30.
    expect(moves[0]).toMatchObject({ op: 'moveTo', x: 100, y: 50 });
    expect(moves[1]).toMatchObject({ op: 'lineTo', x: 100, y: 30 });
    // Head triangle: base 4 below the tip, ±4 wide.
    expect(moves[2]).toMatchObject({ op: 'moveTo', x: 100, y: 30 });
    expect(moves[3]).toMatchObject({ op: 'lineTo', x: 96, y: 34 });
    expect(moves[4]).toMatchObject({ op: 'lineTo', x: 104, y: 34 });
  });

  it('mirrors geometry for down-direction arrows', () => {
    const ctx = createRecorder();
    paintVerticalArrow(ctx, {
      anchorX: 100,
      anchorY: 50,
      direction: 'down',
      length: 20,
      color: '#00ff00',
    });

    const moves = ctx.calls.filter(
      (c) => c.op === 'moveTo' || c.op === 'lineTo',
    );
    expect(moves[0]).toMatchObject({ op: 'moveTo', x: 100, y: 50 });
    expect(moves[1]).toMatchObject({ op: 'lineTo', x: 100, y: 70 });
    expect(moves[2]).toMatchObject({ op: 'moveTo', x: 100, y: 70 });
    expect(moves[3]).toMatchObject({ op: 'lineTo', x: 96, y: 66 });
    expect(moves[4]).toMatchObject({ op: 'lineTo', x: 104, y: 66 });
  });
});

// ---------------------------------------------------------------------------
// paintBendGlyph
// ---------------------------------------------------------------------------

describe('paintBendGlyph', () => {
  it('draws a quadratic curve with colour matching the bend accuracy', () => {
    const ctx = createRecorder();
    paintBendGlyph(ctx, {
      centerX: 100,
      topY: 240,
      bendResult: {
        expectedBend: { type: 'bend', startPitchOffset: 0, endPitchOffset: 1 },
        maxPitchOffsetSt: 1,
        targetCentsOff: 5,
        bendAccuracy: 'perfect',
      },
    });
    const curve = ctx.calls.find((c) => c.op === 'quadraticCurveTo');
    expect(curve).toMatchObject({
      op: 'quadraticCurveTo',
      cpx: 100,
      cpy: 240,
      x: 110,
      y: 248,
    });
    const strokeSet = ctx.calls.find(
      (c) => c.op === 'set' && c.prop === 'strokeStyle',
    );
    // Perfect bend → green.
    expect(strokeSet).toMatchObject({ value: OVERLAY_COLORS.perfect });
  });

  it('uses the wrong colour when bendAccuracy is wrong', () => {
    const ctx = createRecorder();
    paintBendGlyph(ctx, {
      centerX: 0,
      topY: 0,
      bendResult: {
        expectedBend: { type: 'bend', startPitchOffset: 0, endPitchOffset: 2 },
        maxPitchOffsetSt: 2,
        targetCentsOff: 200,
        bendAccuracy: 'wrong',
      },
    });
    const strokeSet = ctx.calls.find(
      (c) => c.op === 'set' && c.prop === 'strokeStyle',
    );
    expect(strokeSet).toMatchObject({ value: OVERLAY_COLORS.wrong });
  });
});

// ---------------------------------------------------------------------------
// paintNoteFeedback
// ---------------------------------------------------------------------------

describe('paintNoteFeedback', () => {
  const strictness = STRICTNESS_PRESETS.intermediate;
  const NOTE_X = RECT.onNotesX; // 110
  const BAR_TOP = 180;
  const CELL_BOTTOM = BAR_TOP + SEGMENT_HEIGHT_PX;

  it('draws the cell as a filled rect and no arrows for a perfect hit', () => {
    const ctx = createRecorder();
    paintNoteFeedback(ctx, makeCell({ y: BAR_TOP }), strictness);
    // Cell = 1 moveTo + 3 lineTos + 1 fill.
    expect(ctx.calls.filter((c) => c.op === 'arc')).toHaveLength(0);
    expect(ctx.calls.filter((c) => c.op === 'moveTo')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'lineTo')).toHaveLength(3);
    expect(ctx.calls.filter((c) => c.op === 'fill')).toHaveLength(1);
  });

  it('draws the cell at exactly the coordinates supplied by the caller', () => {
    const ctx = createRecorder();
    const cell = makeCell({ x: 250, y: 100, w: 40, h: 5 });
    paintNoteFeedback(ctx, cell, strictness);
    const firstMove = ctx.calls.find((c) => c.op === 'moveTo') as {
      x: number;
      y: number;
    };
    expect(firstMove).toMatchObject({ x: 250, y: 100 });
    const lineTos = ctx.calls.filter((c) => c.op === 'lineTo') as Array<{
      x: number;
      y: number;
    }>;
    // Right edge of the cell.
    expect(lineTos[0]).toMatchObject({ x: 290, y: 100 });
    // Bottom-right corner.
    expect(lineTos[1]).toMatchObject({ x: 290, y: 105 });
  });

  it('colours the cell green for a perfect hit', () => {
    const ctx = createRecorder();
    paintNoteFeedback(ctx, makeCell({ result: makeHit() }), strictness);
    const fill = ctx.calls.find(
      (c) => c.op === 'set' && c.prop === 'fillStyle',
    ) as { value: string };
    expect(fill.value).toBe(OVERLAY_COLORS.perfect);
  });

  it('colours the cell red when any rating is wrong', () => {
    const ctx = createRecorder();
    paintNoteFeedback(
      ctx,
      makeCell({
        result: makeHit({ pitchAccuracy: 'wrong', centsOff: 200 }),
      }),
      strictness,
    );
    const fill = ctx.calls.find(
      (c) => c.op === 'set' && c.prop === 'fillStyle',
    ) as { value: string };
    expect(fill.value).toBe(OVERLAY_COLORS.wrong);
  });

  it('paints a neutral cell and no arrows when result is null (unplayed beat)', () => {
    const ctx = createRecorder();
    paintNoteFeedback(ctx, makeCell({ result: null }), strictness);
    // Only the cell's paint ops — 1 moveTo, 3 lineTos, 0 arcs.
    expect(ctx.calls.filter((c) => c.op === 'moveTo')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'lineTo')).toHaveLength(3);
    // Colour comes from OVERLAY_COLORS.pending.
    const fill = ctx.calls.find(
      (c) => c.op === 'set' && c.prop === 'fillStyle',
    ) as { value: string };
    expect(fill.value).toBe(OVERLAY_COLORS.pending);
  });

  it('centres the timing arrow on the note head, not on the cell centre', () => {
    // Cell centre differs from note centre — caller gave us a cell
    // that spans wider on one side. The arrow must still sit above
    // the note head.
    //
    // Under intermediate strictness, timing bands are perfect ≤ 60ms,
    // good ≤ 110ms, acceptable ≤ 180ms. 150ms puts us in
    // `acceptable` which renders the short (10px) arrow.
    const ctx = createRecorder();
    paintNoteFeedback(
      ctx,
      makeCell({
        x: 100, // cell far-left side is offset-heavy
        y: BAR_TOP,
        w: 50, // cell centre = 125, but note is at onNotesX = 110
        rect: makeRect({ onNotesX: 110 }),
        result: makeHit({
          timingAccuracy: 'acceptable',
          timingOffsetMs: 150, // late → right arrow, acceptable band
        }),
      }),
      strictness,
    );
    const shafts = ctx.calls.filter((c) => c.op === 'moveTo');
    // shafts[0] = cell's top-left; shafts[1] = arrow shaft base.
    const arrowBase = shafts[1] as { x: number; y: number };
    // Right arrow: length 10 (acceptable), base at note - length/2 = 105.
    expect(arrowBase.x).toBe(NOTE_X - 10 / 2);
    // Arrow sits ABOVE the cell.
    expect(arrowBase.y).toBeLessThan(BAR_TOP);
  });

  it('paints a timing arrow pointing left when early', () => {
    const ctx = createRecorder();
    paintNoteFeedback(
      ctx,
      makeCell({
        y: BAR_TOP,
        result: makeHit({
          timingAccuracy: 'acceptable',
          timingOffsetMs: -150,
        }),
      }),
      strictness,
    );
    const shafts = ctx.calls.filter((c) => c.op === 'moveTo');
    const arrowBase = shafts[1] as { x: number; y: number };
    expect(arrowBase.y).toBeLessThan(BAR_TOP);
    // Left arrow's base is to the RIGHT of the note head.
    expect(arrowBase.x).toBeGreaterThan(NOTE_X);
  });

  it('paints a pitch arrow below the cell pointing up when sharp', () => {
    const ctx = createRecorder();
    paintNoteFeedback(
      ctx,
      makeCell({
        y: BAR_TOP,
        result: makeHit({
          pitchAccuracy: 'acceptable',
          centsOff: 45,
        }),
      }),
      strictness,
    );
    const shafts = ctx.calls.filter((c) => c.op === 'moveTo');
    const arrowBase = shafts[1] as { x: number; y: number };
    // Arrow sits BELOW the cell.
    expect(arrowBase.y).toBeGreaterThan(CELL_BOTTOM);
    // Centred on the note head.
    expect(arrowBase.x).toBe(NOTE_X);
  });

  it('paints a pitch arrow below the cell pointing down when flat', () => {
    const ctx = createRecorder();
    paintNoteFeedback(
      ctx,
      makeCell({
        y: BAR_TOP,
        result: makeHit({
          pitchAccuracy: 'acceptable',
          centsOff: -45,
        }),
      }),
      strictness,
    );
    const shafts = ctx.calls.filter((c) => c.op === 'moveTo');
    const arrowBase = shafts[1] as { x: number; y: number };
    expect(arrowBase.y).toBeGreaterThan(CELL_BOTTOM);
    expect(arrowBase.x).toBe(NOTE_X);
  });

  it('paints a tiny indicator arrow for the good band (direction on yellow cells)', () => {
    // Previously good → no arrow, which left yellow cells with no hint
    // of which axis drifted. The tiny-arrow tier gives the user a
    // direction cue without overpowering the cell colour.
    //
    // Under intermediate strictness `timing.perfect = 60`, so 80ms
    // offset lands in the `good` band (good=110). The painter
    // re-classifies from timingOffsetMs directly, so the result's
    // `timingAccuracy` label is incidental.
    const ctx = createRecorder();
    paintNoteFeedback(
      ctx,
      makeCell({
        result: makeHit({ timingAccuracy: 'good', timingOffsetMs: 80 }),
      }),
      strictness,
    );
    // Cell (1 moveTo + 3 lineTos) + arrow (2 moveTos + 3 lineTos).
    expect(ctx.calls.filter((c) => c.op === 'moveTo')).toHaveLength(3);
    expect(ctx.calls.filter((c) => c.op === 'lineTo')).toHaveLength(6);
  });

  it('omits the arrow only when the rating is perfect', () => {
    const ctx = createRecorder();
    paintNoteFeedback(
      ctx,
      makeCell({ result: makeHit() }), // all perfect
      strictness,
    );
    // Only the cell's paint ops — perfect never needs direction hints.
    expect(ctx.calls.filter((c) => c.op === 'moveTo')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'lineTo')).toHaveLength(3);
  });

  it('paints a bend glyph below the rect when bendResult is present', () => {
    const ctx = createRecorder();
    const bend: BendResult = {
      expectedBend: { type: 'bend', startPitchOffset: 0, endPitchOffset: 1 },
      maxPitchOffsetSt: 1,
      targetCentsOff: 5,
      bendAccuracy: 'perfect',
    };
    paintNoteFeedback(
      ctx,
      makeCell({
        rect: makeRect({ onNotesX: 110 }),
        result: makeHit({ bendResult: bend }),
      }),
      strictness,
    );
    const curve = ctx.calls.find((c) => c.op === 'quadraticCurveTo') as
      | {
          op: 'quadraticCurveTo';
          cpx: number;
          cpy: number;
          x: number;
          y: number;
        }
      | undefined;
    expect(curve).toBeDefined();
    // Glyph centre = onNotesX = 110. Peak y = rect.y + rect.h (= 240)
    // + BEND_GLYPH_GAP (= 4) = 244.
    expect(curve!.cpx).toBe(110);
    expect(curve!.cpy).toBe(244);
  });

  it('paints a grey cell with no arrows for a missed note', () => {
    const ctx = createRecorder();
    const missed: NoteResult = {
      expectedNote: makeExpectedNote(),
      outcome: 'missed',
      pitchAccuracy: null,
      centsOff: null,
      timingAccuracy: null,
      timingOffsetMs: null,
      bendResult: null,
    };
    paintNoteFeedback(ctx, makeCell({ result: missed }), strictness);
    // Cell only: 1 moveTo + 3 lineTos.
    expect(ctx.calls.filter((c) => c.op === 'moveTo')).toHaveLength(1);
    expect(ctx.calls.filter((c) => c.op === 'lineTo')).toHaveLength(3);
    const fill = ctx.calls.find(
      (c) => c.op === 'set' && c.prop === 'fillStyle',
    ) as { value: string };
    expect(fill.value).toBe(OVERLAY_COLORS.missed);
  });
});

// ---------------------------------------------------------------------------
// groupBeatsIntoLines
// ---------------------------------------------------------------------------

describe('groupBeatsIntoLines', () => {
  const makeEntry = (
    overrides: Partial<BeatRectangle> & { result?: NoteResult | null } = {},
  ): FeedbackBarEntry => {
    const { result, ...rectOverrides } = overrides;
    return {
      rect: makeRect(rectOverrides),
      result: result ?? null,
    };
  };

  it('groups beats sharing the same baseline into one line', () => {
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 10 }),
      makeEntry({ x: 20, y: 100, w: 20, h: 40, onNotesX: 30 }),
      makeEntry({ x: 40, y: 100, w: 20, h: 40, onNotesX: 50 }),
    ];
    const lines = groupBeatsIntoLines(entries);
    expect(lines).toHaveLength(1);
    expect(lines[0].cells).toHaveLength(3);
  });

  it('splits beats with different baselines into separate lines', () => {
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 10 }),
      makeEntry({ x: 20, y: 100, w: 20, h: 40, onNotesX: 30 }),
      makeEntry({ x: 0, y: 300, w: 20, h: 40, onNotesX: 10 }),
      makeEntry({ x: 20, y: 300, w: 20, h: 40, onNotesX: 30 }),
    ];
    const lines = groupBeatsIntoLines(entries);
    expect(lines).toHaveLength(2);
    expect(lines[0].barTop).toBeLessThan(lines[1].barTop);
    expect(lines[0].cells).toHaveLength(2);
    expect(lines[1].cells).toHaveLength(2);
  });

  it('anchors the bar above the staff line regardless of per-beat annotations', () => {
    // Second beat carries an annotation block above — its visualBounds.y
    // (rect.y) is higher (smaller) and rect.h larger. All three beats
    // sit on the same staff so they share the same lineAlignedBounds.y
    // (realTopY) — the annotation doesn't drag the bar up and the bar
    // stays pinned to the staff line top, not the annotation top.
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 10, realTopY: 100 }),
      makeEntry({ x: 20, y: 60, w: 20, h: 80, onNotesX: 30, realTopY: 100 }),
      makeEntry({ x: 40, y: 100, w: 20, h: 40, onNotesX: 50, realTopY: 100 }),
    ];
    const lines = groupBeatsIntoLines(entries);
    expect(lines).toHaveLength(1);
    const expectedBarTop = 100 - SEGMENT_GAP_PX - SEGMENT_HEIGHT_PX;
    expect(lines[0].barTop).toBe(expectedBarTop);
  });

  it('tiles cells at midpoints between onNotesX values so neighbours share a boundary', () => {
    // Three equally-spaced notes at onNotesX = 100, 200, 300.
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 100 }),
      makeEntry({ x: 20, y: 100, w: 20, h: 40, onNotesX: 200 }),
      makeEntry({ x: 40, y: 100, w: 20, h: 40, onNotesX: 300 }),
    ];
    const { cells } = groupBeatsIntoLines(entries)[0];
    // Middle cell spans midpoints: [150, 250].
    expect(cells[1].x).toBe(150);
    expect(cells[1].x + cells[1].w).toBe(250);
    // First cell extends leftward symmetrically by halfGap → [50, 150].
    expect(cells[0].x).toBe(50);
    expect(cells[0].x + cells[0].w).toBe(150);
    // Last cell extends rightward symmetrically → [250, 350].
    expect(cells[2].x).toBe(250);
    expect(cells[2].x + cells[2].w).toBe(350);
    // Cell boundaries match exactly — the bar is continuous.
    expect(cells[0].x + cells[0].w).toBe(cells[1].x);
    expect(cells[1].x + cells[1].w).toBe(cells[2].x);
  });

  it('handles uneven note spacing — each cell gets its own half-gap pair', () => {
    // onNotesX values: 100, 120 (close), 300 (far). Midpoints: 110, 210.
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 100 }),
      makeEntry({ x: 20, y: 100, w: 20, h: 40, onNotesX: 120 }),
      makeEntry({ x: 40, y: 100, w: 20, h: 40, onNotesX: 300 }),
    ];
    const { cells } = groupBeatsIntoLines(entries)[0];
    expect(cells[0].x).toBe(90); // 100 - (120-100)/2
    expect(cells[0].x + cells[0].w).toBe(110);
    expect(cells[1].x).toBe(110);
    expect(cells[1].x + cells[1].w).toBe(210);
    expect(cells[2].x).toBe(210);
    expect(cells[2].x + cells[2].w).toBe(390); // 300 + (300-120)/2
  });

  it('falls back to visualBounds for a single-beat line', () => {
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 50, y: 100, w: 40, h: 40, onNotesX: 70 }),
    ];
    const { cells } = groupBeatsIntoLines(entries)[0];
    expect(cells).toHaveLength(1);
    expect(cells[0].x).toBe(50);
    expect(cells[0].w).toBe(40);
  });

  it('sorts beats by onNotesX within a line so out-of-order input still tiles', () => {
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 40, y: 100, w: 20, h: 40, onNotesX: 300 }),
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 100 }),
      makeEntry({ x: 20, y: 100, w: 20, h: 40, onNotesX: 200 }),
    ];
    const { cells } = groupBeatsIntoLines(entries)[0];
    // After sort: cells[0] at onNotesX=100, cells[1] at 200, cells[2] at 300.
    expect(cells[0].rect.onNotesX).toBe(100);
    expect(cells[1].rect.onNotesX).toBe(200);
    expect(cells[2].rect.onNotesX).toBe(300);
  });

  it('every cell has y == line barTop and h == SEGMENT_HEIGHT_PX', () => {
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 10 }),
      makeEntry({ x: 20, y: 100, w: 20, h: 40, onNotesX: 30 }),
    ];
    const line = groupBeatsIntoLines(entries)[0];
    for (const cell of line.cells) {
      expect(cell.y).toBe(line.barTop);
      expect(cell.h).toBe(SEGMENT_HEIGHT_PX);
    }
  });

  it('rounds sub-pixel baseline jitter so slight float differences still group', () => {
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 100, w: 20, h: 40, onNotesX: 10 }),
      makeEntry({ x: 20, y: 100.2, w: 20, h: 39.8, onNotesX: 30 }),
      makeEntry({ x: 40, y: 99.6, w: 20, h: 40.4, onNotesX: 50 }),
    ];
    const lines = groupBeatsIntoLines(entries);
    expect(lines).toHaveLength(1);
  });

  it('returns an empty list for an empty input', () => {
    expect(groupBeatsIntoLines([])).toEqual([]);
  });

  it('anchorAtTop collapses multiple baselines into one bar above the topmost staff', () => {
    // Multi-staff rendering (e.g. staff + tab, 7-string tab): beats
    // across two different baselines. Default mode would produce
    // two lines; anchorAtTop produces ONE line whose top is just
    // above min(realTopY) across everything. realTopY is the top of
    // the full staff column from AlphaTab's realBounds — that's
    // what makes the bar land above the staff line, not inside the
    // tab.
    const entries: FeedbackBarEntry[] = [
      // Two beats on the top staff (visualBounds mid-staff, realTopY above).
      makeEntry({ x: 0, y: 80, w: 20, h: 40, onNotesX: 10, realTopY: 60 }),
      makeEntry({ x: 20, y: 80, w: 20, h: 40, onNotesX: 30, realTopY: 60 }),
      // Two beats on a lower staff.
      makeEntry({
        x: 0,
        y: 280,
        w: 20,
        h: 40,
        onNotesX: 10,
        realTopY: 260,
      }),
      makeEntry({
        x: 20,
        y: 280,
        w: 20,
        h: 40,
        onNotesX: 30,
        realTopY: 260,
      }),
    ];
    const lines = groupBeatsIntoLines(entries, { anchorAtTop: true });
    expect(lines).toHaveLength(1);
    // min(realTopY) = 60 → barTop = 60 - horizontalGap - height.
    const expectedBarTop = 60 - SEGMENT_GAP_HORIZONTAL_PX - SEGMENT_HEIGHT_PX;
    expect(lines[0].barTop).toBe(expectedBarTop);
    expect(lines[0].cells).toHaveLength(4);
  });

  it('anchorAtTop uses realTopY even when visualBounds.y is lower (mid-tab)', () => {
    // Simulates a 6-string tab where visualBounds.y sits mid-staff
    // (say y=150) but realBounds.y is at the top of the staff
    // (y=100). The bar must land above the staff top (100), not
    // just above the note head (150).
    const entries: FeedbackBarEntry[] = [
      makeEntry({ x: 0, y: 150, w: 20, h: 40, onNotesX: 10, realTopY: 100 }),
      makeEntry({ x: 20, y: 150, w: 20, h: 40, onNotesX: 30, realTopY: 100 }),
    ];
    const [line] = groupBeatsIntoLines(entries, { anchorAtTop: true });
    // Horizontal mode → uses the larger horizontal gap.
    const expectedBarTop = 100 - SEGMENT_GAP_HORIZONTAL_PX - SEGMENT_HEIGHT_PX;
    expect(line.barTop).toBe(expectedBarTop);
  });

  it('anchorAtTop on an empty entries list still returns an empty list', () => {
    expect(groupBeatsIntoLines([], { anchorAtTop: true })).toEqual([]);
  });
});
