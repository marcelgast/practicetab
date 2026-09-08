import { describe, expect, it } from 'vitest';
import { GUIDE_LIST, GUIDES, getGuide } from '../domain/guides/registry';
import { GUIDE_IDS } from '../domain/guides/types';

describe('guides registry', () => {
  it('exposes exactly one guide per GUIDE_IDS entry', () => {
    expect(GUIDE_LIST.length).toBe(GUIDE_IDS.length);
    GUIDE_IDS.forEach((id) => {
      expect(GUIDES[id]).toBeDefined();
      expect(GUIDES[id].id).toBe(id);
    });
  });

  it('has unique ids', () => {
    const ids = GUIDE_LIST.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('iterates in the order declared by GUIDE_IDS', () => {
    expect(GUIDE_LIST.map((g) => g.id)).toEqual([...GUIDE_IDS]);
  });

  it('requires every guide to have a non-empty title, description, and route', () => {
    GUIDE_LIST.forEach((guide) => {
      expect(guide.title.trim().length).toBeGreaterThan(0);
      expect(guide.description.trim().length).toBeGreaterThan(0);
      expect(guide.route.startsWith('/'), `${guide.id} route`).toBe(true);
    });
  });

  it('requires every step that exists to have a selector + title + body', () => {
    // Steps arrive in later commits — this check is a forward guard:
    // once a guide starts defining steps, they must all be complete.
    GUIDE_LIST.forEach((guide) => {
      guide.steps.forEach((step, index) => {
        expect(
          step.selector.trim().length,
          `${guide.id}[${index}].selector`,
        ).toBeGreaterThan(0);
        expect(
          step.title.trim().length,
          `${guide.id}[${index}].title`,
        ).toBeGreaterThan(0);
        expect(
          step.body.trim().length,
          `${guide.id}[${index}].body`,
        ).toBeGreaterThan(0);
      });
    });
  });

  it('uses the `<guide>.<slug>` convention on every selector', () => {
    // Guide id segment can contain hyphens (e.g. beatmap-editor).
    const selectorPattern = /^\[data-guide="[a-z][a-z0-9-]*\.[a-z0-9-]+"\]$/;
    GUIDE_LIST.forEach((guide) => {
      guide.steps.forEach((step, index) => {
        expect(
          selectorPattern.test(step.selector),
          `${guide.id}[${index}].selector does not match the convention`,
        ).toBe(true);
        // The slug must start with the guide id so data-guide grep
        // scopes cleanly to a single page.
        expect(
          step.selector.startsWith(`[data-guide="${guide.id}.`),
          `${guide.id}[${index}].selector not scoped to guide id`,
        ).toBe(true);
      });
    });
  });

  it('returns the right guide via getGuide', () => {
    expect(getGuide('practice').id).toBe('practice');
    expect(getGuide('player').id).toBe('player');
  });
});
