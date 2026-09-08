import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { libraryGuide } from '../domain/guides/library';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_SOURCE = readFileSync(
  resolve(__dirname, '../pages/Library.vue'),
  'utf8',
);

describe('library guide selectors', () => {
  it('every step references a data-guide attribute present in Library.vue', () => {
    const missing: string[] = [];
    libraryGuide.steps.forEach((step) => {
      const match = step.selector.match(/^\[data-guide="(.+)"\]$/);
      expect(match).not.toBeNull();
      const slug = match![1];
      const attrRegex = new RegExp(`data-guide="${slug}"`);
      if (!attrRegex.test(LIBRARY_SOURCE)) {
        missing.push(slug);
      }
    });
    expect(missing).toEqual([]);
  });
});
