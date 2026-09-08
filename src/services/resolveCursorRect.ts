import { isValidCursorRect, type RectLike } from '../domain/playhead';

export interface ResolveCursorRectOptions {
  getRect: () => RectLike | null;
  refreshLayout: () => void;
  waitFrame: () => Promise<void>;
  maxAttempts?: number;
}

export async function resolveCursorRect(
  options: ResolveCursorRectOptions,
): Promise<RectLike | null> {
  const attempts = options.maxAttempts ?? 5;
  for (let i = 0; i < attempts; i += 1) {
    await options.waitFrame();
    await options.waitFrame();
    options.refreshLayout();
    const rect = options.getRect();
    if (isValidCursorRect(rect)) {
      return rect;
    }
  }
  return null;
}

export interface ResolveCursorRectAfterSeekOptions {
  waitForCursor: () => Promise<RectLike | null>;
  getRect: () => RectLike | null;
  waitFrame: () => Promise<void>;
  maxAttempts?: number;
}

export async function resolveCursorRectAfterSeek(
  options: ResolveCursorRectAfterSeekOptions,
): Promise<RectLike | null> {
  const awaited = await options.waitForCursor();
  if (isValidCursorRect(awaited)) {
    return awaited;
  }
  const attempts = options.maxAttempts ?? 3;
  for (let i = 0; i < attempts; i += 1) {
    await options.waitFrame();
    const rect = options.getRect();
    if (isValidCursorRect(rect)) {
      return rect;
    }
  }
  return null;
}
