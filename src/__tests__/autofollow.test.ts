import { describe, expect, it } from 'vitest';
import {
  computeAutoFollowScrollLeft,
  computeAutoFollowScrollTop,
  interpolateBeatCursorX,
} from '../domain/autofollow';

describe('computeAutoFollowScrollLeft', () => {
  it('returns null when cursor is inside margin band', () => {
    const next = computeAutoFollowScrollLeft({
      cursorX: 200,
      scrollLeft: 100,
      viewportWidth: 400,
      marginPx: 100,
    });
    expect(next).toBeNull();
  });

  it('scrolls left when cursor is before margin', () => {
    const next = computeAutoFollowScrollLeft({
      cursorX: 120,
      scrollLeft: 200,
      viewportWidth: 400,
      marginPx: 100,
    });
    expect(next).toBe(20);
  });

  it('scrolls right when cursor exceeds margin', () => {
    const next = computeAutoFollowScrollLeft({
      cursorX: 620,
      scrollLeft: 100,
      viewportWidth: 400,
      marginPx: 100,
    });
    expect(next).toBe(320);
  });
});

describe('computeAutoFollowScrollTop', () => {
  it('returns null when playhead is within the visible band', () => {
    const next = computeAutoFollowScrollTop({
      playheadTop: 320,
      playheadBottom: 550,
      scrollTop: 200,
      viewportHeight: 500,
      scrollHeight: 2000,
      marginPx: 120,
    });
    expect(next).toBeNull();
  });

  it('scrolls up when playhead is above the visible band', () => {
    const next = computeAutoFollowScrollTop({
      playheadTop: 140,
      playheadBottom: 180,
      scrollTop: 200,
      viewportHeight: 500,
      scrollHeight: 1200,
      marginPx: 120,
    });
    expect(next).toBe(20);
  });

  it('returns a clamped scrollTop when playhead is below the band', () => {
    const next = computeAutoFollowScrollTop({
      playheadTop: 860,
      playheadBottom: 920,
      scrollTop: 400,
      viewportHeight: 500,
      scrollHeight: 1200,
      marginPx: 120,
    });
    expect(next).toBe(540);
  });

  it('clamps to max scrollTop', () => {
    const next = computeAutoFollowScrollTop({
      playheadTop: 1500,
      playheadBottom: 1600,
      scrollTop: 1000,
      viewportHeight: 500,
      scrollHeight: 1200,
      marginPx: 120,
    });
    expect(next).toBe(700);
  });
});

describe('computePageFlipScrollLeft', () => {
  // Page-flip model: cursor walks left→right through the first
  // `pageFraction * viewport` of the viewport, then scrollLeft snaps
  // forward by exactly that much so the cursor jumps back to the
  // left. Most frames return null (cursor hasn't crossed the next
  // page boundary yet); only the actual flip frames write.

  it('keeps scrollLeft at 0 while cursor walks through the first page', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // Viewport 400, pageFraction 0.5 → pageSize 200. Cursor at x=120
    // is still in page 0; target stays at 0; we're already there.
    const next = computePageFlipScrollLeft({
      cursorX: 120,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    expect(next).toBeNull();
  });

  it('snaps to the second page when cursor crosses pageSize', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // pageSize 200, cursor at x=210 → page 1 → target = 200.
    const next = computePageFlipScrollLeft({
      cursorX: 210,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    expect(next).toBe(200);
  });

  it('snaps to the fifth page when deep into the song', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // pageSize 200, cursor at x=850 → page 4 → target = 800.
    const next = computePageFlipScrollLeft({
      cursorX: 850,
      scrollLeft: 600,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    expect(next).toBe(800);
  });

  it('returns null when scrollLeft is already on the cursor’s page', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // Cursor at x=900 → page 4 → target 800. scrollLeft already 800.
    const next = computePageFlipScrollLeft({
      cursorX: 900,
      scrollLeft: 800,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    expect(next).toBeNull();
  });

  it('clamps to maxScrollLeft at the end of the tab', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // pageSize 200, cursor at x=2050 → page 10 → target 2000, but
    // maxScrollLeft is only 1500, so we stop there. Cursor then
    // drifts past the half-viewport mark as the song finishes —
    // expected, the song's about to end anyway.
    const next = computePageFlipScrollLeft({
      cursorX: 2050,
      scrollLeft: 1200,
      viewportWidth: 400,
      maxScrollLeft: 1500,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    expect(next).toBe(1500);
  });

  it('handles a custom pageFraction (e.g. 0.66 — bigger reading window)', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // pageFraction 0.5 with viewport 400 → pageSize 200; here we
    // pick 0.5 explicitly to lock the test.
    // With 0.66: pageSize ≈ 264. Cursor at x=300 → page 1 → target ≈ 264.
    const next = computePageFlipScrollLeft({
      cursorX: 300,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.66,
      leftMarginFraction: 0,
    });
    expect(next).toBeCloseTo(264, 0);
  });

  it('keeps a left-margin rear-view of past notes after a flip', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // viewport=400, pageFraction=0.5 → pageSize=200; leftMargin=0.1 → 40px.
    // First page covers content-x [0, 240) — cursor enters at viewport-x=0
    // and walks naturally through. Flip happens when cursorX crosses 240
    // (NOT 200 like with leftMargin=0). After the flip, scrollLeft becomes
    // 200, so the cursor at content-x=240 displays at viewport-x = 40 —
    // exactly the left-margin anchor with 40px of past notes visible
    // to its left.
    const beforeFlip = computePageFlipScrollLeft({
      cursorX: 239,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0.1,
    });
    expect(beforeFlip).toBeNull();

    const atFlip = computePageFlipScrollLeft({
      cursorX: 240,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0.1,
    });
    expect(atFlip).toBe(200);
    // Verify the visible cursor position post-flip:
    // viewport-x = cursorX - scrollLeft = 240 - 200 = 40 = leftMargin ✓
  });

  it('clamps leftMargin so the walk region stays inside the viewport', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // pageFraction=0.5 leaves 0.5 of viewport for margin+lookahead;
    // a leftMarginFraction of 0.8 would push the walk off the right
    // edge. Domain clamps margin to (1 - pageFraction) = 0.5 →
    // leftMargin = 200px. First flip happens at cursorX = 200 + 200
    // = 400.
    const next = computePageFlipScrollLeft({
      cursorX: 400,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0.8,
    });
    expect(next).toBe(200);
  });

  it('clamps pageFraction outside (0, 1] to keep arithmetic sane', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    // pageFraction = 5 → clamped to 1.0 → pageSize = viewport.
    // Cursor at x=500 → page 1 → target = 400.
    const above = computePageFlipScrollLeft({
      cursorX: 500,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 5,
      leftMarginFraction: 0,
    });
    expect(above).toBe(400);
    // pageFraction = -1 → clamped to 0.05 (a 5% page is the smallest
    // sane reading window — lower would mean snapping every few px).
    // pageSize = 20; cursor at x=50 → page 2 → target = 40.
    const below = computePageFlipScrollLeft({
      cursorX: 50,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: -1,
      leftMarginFraction: 0,
    });
    expect(below).toBe(40);
  });

  it('handles zero-width viewport gracefully', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    const next = computePageFlipScrollLeft({
      cursorX: 100,
      scrollLeft: 50,
      viewportWidth: 0,
      maxScrollLeft: 500,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    expect(next).toBeNull();
  });

  it('handles non-finite cursor gracefully', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    const next = computePageFlipScrollLeft({
      cursorX: Number.NaN,
      scrollLeft: 100,
      viewportWidth: 400,
      maxScrollLeft: 1000,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    expect(next).toBeNull();
  });

  it('treats negative cursor X as page 0 (clamp instead of producing negative pageIndex)', async () => {
    const { computePageFlipScrollLeft } = await import('../domain/autofollow');
    const next = computePageFlipScrollLeft({
      cursorX: -50,
      scrollLeft: 0,
      viewportWidth: 400,
      maxScrollLeft: 2000,
      pageFraction: 0.5,
      leftMarginFraction: 0,
    });
    // Already at 0; pageIndex clamps to 0; no scroll needed.
    expect(next).toBeNull();
  });
});

describe('interpolateBeatCursorX', () => {
  const anchors = [
    { rawStartMs: 0, x: 100 },
    { rawStartMs: 500, x: 200 },
    { rawStartMs: 1000, x: 300 },
  ];

  it('returns the exact anchor x when rawMs matches a beat', () => {
    expect(interpolateBeatCursorX(0, anchors)).toBe(100);
    expect(interpolateBeatCursorX(500, anchors)).toBe(200);
    expect(interpolateBeatCursorX(1000, anchors)).toBe(300);
  });

  it('linearly interpolates between two beats', () => {
    // Halfway between beat 0ms (x=100) and 500ms (x=200) → x=150.
    expect(interpolateBeatCursorX(250, anchors)).toBe(150);
    // 1/4 of the way between 500ms (x=200) and 1000ms (x=300) → x=225.
    expect(interpolateBeatCursorX(625, anchors)).toBe(225);
  });

  it('clamps to the first beat when rawMs is before the start', () => {
    expect(interpolateBeatCursorX(-500, anchors)).toBe(100);
  });

  it('clamps to the last beat when rawMs is past the end', () => {
    expect(interpolateBeatCursorX(5000, anchors)).toBe(300);
  });

  it('returns null for empty anchor list', () => {
    expect(interpolateBeatCursorX(100, [])).toBeNull();
  });

  it('returns null for non-finite rawMs', () => {
    expect(interpolateBeatCursorX(Number.NaN, anchors)).toBeNull();
  });

  it('handles zero-duration span between equal-timestamp anchors', () => {
    const degenerate = [
      { rawStartMs: 100, x: 50 },
      { rawStartMs: 100, x: 60 },
      { rawStartMs: 200, x: 80 },
    ];
    // rawMs = 100 — matches first anchor exactly (early return), x=50.
    expect(interpolateBeatCursorX(100, degenerate)).toBe(50);
  });
});
