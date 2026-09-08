// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { getStoredJson, setStoredJson } from '../domain/storage';

describe('storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and retrieves JSON values', () => {
    setStoredJson('prefs', { accent: '#111111' });
    expect(getStoredJson('prefs', { accent: '#000000' })).toEqual({
      accent: '#111111',
    });
  });

  it('returns fallback on invalid JSON', () => {
    localStorage.setItem('prefs', '{');
    expect(getStoredJson('prefs', { accent: '#000000' })).toEqual({
      accent: '#000000',
    });
  });

  it('returns fallback when storage access throws', () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem() {
          throw new Error('denied');
        },
        setItem() {
          throw new Error('denied');
        },
      },
      configurable: true,
    });

    expect(getStoredJson('prefs', { accent: '#000000' })).toEqual({
      accent: '#000000',
    });
    expect(() => setStoredJson('prefs', { accent: '#111111' })).not.toThrow();

    Object.defineProperty(globalThis, 'localStorage', {
      value: original,
      configurable: true,
    });
  });
});
