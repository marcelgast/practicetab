import { describe, expect, it } from 'vitest';
import {
  normalizeSeekTarget,
  resolveSeekCommand,
  resolveSeekCommandWithFallback,
  resolveSeekTarget,
  selectFallbackTick,
  selectSeekTick,
} from '../domain/seekTarget';

describe('resolveSeekTarget', () => {
  it('prefers cursor tick from the hit test even when awaited rect exists', () => {
    const awaited = { left: 1, top: 2, height: 3 };
    const hit = { left: 4, top: 5, height: 6, cursorTick: 960 };
    const result = resolveSeekTarget(awaited, hit);
    expect(result.rect).toBe(awaited);
    expect(result.cursorTick).toBe(960);
  });

  it('falls back to ms when tick is missing', () => {
    const target = { cursorMs: 1200 };
    const command = resolveSeekCommand(target);
    expect(command).toEqual({ mode: 'ms', value: 1200 });
  });

  it('uses fallback tick when no cursor tick or ms is available', () => {
    const command = resolveSeekCommandWithFallback({}, 1920);
    expect(command).toEqual({ mode: 'tick', value: 1920 });
  });

  it('ignores a zero fallback tick', () => {
    const command = resolveSeekCommandWithFallback({}, 0);
    expect(command).toBeNull();
  });

  it('ignores zero tick when configured', () => {
    const target = normalizeSeekTarget(
      { cursorTick: 0, cursorMs: 500 },
      {
        ignoreZeroTick: true,
      },
    );
    expect(target).toEqual({ cursorTick: undefined, cursorMs: 500 });
  });

  it('prefers current tick when beat tick is zero for later bars', () => {
    const fallback = selectFallbackTick({
      beatTick: 0,
      barIndex: 7,
      currentTick: 26881,
    });
    expect(fallback).toBe(26881);
  });

  it('ignores low beat tick for later bars in favor of current tick', () => {
    const fallback = selectFallbackTick({
      beatTick: 480,
      barIndex: 5,
      currentTick: 7681,
    });
    expect(fallback).toBe(7681);
  });

  it('uses beat tick when bar index is zero', () => {
    const fallback = selectFallbackTick({
      beatTick: 480,
      barIndex: 0,
      currentTick: 7681,
    });
    expect(fallback).toBe(480);
  });

  it('prefers beat tick over bar tick when present', () => {
    const fallback = selectFallbackTick({
      beatTick: 24000,
      barTick: 23040,
      barIndex: 6,
    });
    expect(fallback).toBe(24000);
  });

  it('prefers recent pointer tick over other sources', () => {
    const fallback = selectFallbackTick({
      beatTick: 480,
      barTick: 960,
      currentTick: 7681,
      recentPointerTick: 1440,
    });
    expect(fallback).toBe(480);
  });

  it('prefers cursor tick over resolved and fallback ticks', () => {
    const tick = selectSeekTick({
      cursorTick: 1440,
      resolvedTick: 960,
      fallbackTick: 480,
    });
    expect(tick).toBe(1440);
  });
});
