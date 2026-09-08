import { describe, expect, it, vi } from 'vitest';
import {
  resolveCursorRect,
  resolveCursorRectAfterSeek,
} from '../services/resolveCursorRect';

describe('resolveCursorRect', () => {
  it('retries until a valid rect is returned', async () => {
    const getRect = vi
      .fn()
      .mockReturnValueOnce({ left: 0, top: 0, height: 10 })
      .mockReturnValueOnce({ left: 10, top: 10, height: 60 });
    const refreshLayout = vi.fn();
    const waitFrame = vi.fn().mockResolvedValue(undefined);

    const rect = await resolveCursorRect({
      getRect,
      refreshLayout,
      waitFrame,
      maxAttempts: 3,
    });

    expect(rect).toEqual({ left: 10, top: 10, height: 60 });
    expect(refreshLayout).toHaveBeenCalledTimes(2);
    expect(waitFrame).toHaveBeenCalledTimes(4);
  });
});

describe('resolveCursorRectAfterSeek', () => {
  it('prefers the next cursor rect and falls back to polling', async () => {
    const waitForCursor = vi
      .fn()
      .mockResolvedValueOnce({ left: 0, top: 0, height: 0 });
    const getRect = vi
      .fn()
      .mockReturnValueOnce({ left: 0, top: 0, height: 0 })
      .mockReturnValueOnce({ left: 18, top: 20, height: 60 });
    const waitFrame = vi.fn().mockResolvedValue(undefined);

    const rect = await resolveCursorRectAfterSeek({
      waitForCursor,
      getRect,
      waitFrame,
      maxAttempts: 2,
    });

    expect(rect).toEqual({ left: 18, top: 20, height: 60 });
    expect(waitForCursor).toHaveBeenCalledTimes(1);
    expect(waitFrame).toHaveBeenCalledTimes(2);
  });
});
