import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { practiceGuide } from '../domain/guides/practice';

/**
 * Source-grep check: every Practice guide selector must appear as
 * a `data-guide="<slug>"` attribute somewhere in the Practice-page
 * source tree.
 *
 * Runtime selector checks live in the guide-runner — those catch
 * elements that fail to mount on a given page state. This test
 * catches typos at build time: if a guide step points at
 * `practice.add-plan` but the template uses `practice.addPlan`,
 * we want to see a red CI, not a broken guide at runtime.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const PRACTICE_SOURCE = readFileSync(
  resolve(__dirname, '../pages/Practice.vue'),
  'utf8',
);

describe('practice guide selectors', () => {
  it('every step references a data-guide attribute present in Practice.vue', () => {
    const missing: string[] = [];
    practiceGuide.steps.forEach((step) => {
      const match = step.selector.match(/^\[data-guide="(.+)"\]$/);
      expect(
        match,
        `step selector not shaped correctly: ${step.selector}`,
      ).not.toBeNull();
      const slug = match![1];
      const attrRegex = new RegExp(`data-guide="${slug}"`);
      if (!attrRegex.test(PRACTICE_SOURCE)) {
        missing.push(slug);
      }
    });
    expect(missing, `missing data-guide attributes in Practice.vue`).toEqual(
      [],
    );
  });

  it('includes the focused-exercises warning in the Connect-a-tab step', () => {
    // Step ordering is plan → exercise → interval → tab → audio.
    // The tab step is step index 3 (0-based) and its title starts
    // with "Connect a tab". Look it up by title so the assertion
    // survives selector refactors.
    const tabStep = practiceGuide.steps.find((s) =>
      s.title.toLowerCase().startsWith('connect a tab'),
    );
    expect(tabStep).toBeDefined();
    expect(tabStep!.body.toLowerCase()).toContain('focused exercises');
    expect(tabStep!.body.toLowerCase()).toContain('split');
  });
});
