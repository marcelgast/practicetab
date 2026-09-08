import { describe, expect, it } from 'vitest';
import { createId } from '../utils/id';

describe('createId', () => {
  it('returns a non-empty string', () => {
    const id = createId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('returns unique ids on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
  });

  it('uses custom generator when provided', () => {
    const id = createId(() => 'custom-id');
    expect(id).toBe('custom-id');
  });

  it('falls back to random id when crypto.randomUUID is unavailable', () => {
    const original = globalThis.crypto.randomUUID;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis.crypto as any).randomUUID = undefined;
      const id = createId();
      expect(id).toMatch(/^id_[0-9a-f]+_\d+$/);
    } finally {
      globalThis.crypto.randomUUID = original;
    }
  });
});
