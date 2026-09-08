import { describe, expect, it } from 'vitest';
import { hydrateGuideState } from '../stores/app';

describe('hydrateGuideState', () => {
  it('defaults fresh installs to showAtStartup=true', () => {
    const result = hydrateGuideState({});
    expect(result.showAtStartup).toBe(true);
    expect(result.completed).toEqual({});
  });

  it('also defaults existing installs (with prior settings) to showAtStartup=true', () => {
    const result = hydrateGuideState({
      accentColor: '#abcdef',
    });
    expect(result.showAtStartup).toBe(true);
    expect(result.completed).toEqual({});
  });

  it('trusts an existing stored guideState verbatim', () => {
    const result = hydrateGuideState({
      guideState: {
        showAtStartup: false,
        completed: { practice: '2026-04-24T10:00:00Z' },
      },
    });
    expect(result).toEqual({
      showAtStartup: false,
      completed: { practice: '2026-04-24T10:00:00Z' },
    });
  });

  it('supplies defaults when guideState exists but is partially empty', () => {
    const result = hydrateGuideState({
      guideState: {},
    });
    expect(result.showAtStartup).toBe(true);
    expect(result.completed).toEqual({});
  });
});
