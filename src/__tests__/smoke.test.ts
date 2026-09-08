import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('smoke', () => {
  it('sets the document title to PracticeTab', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<title>PracticeTab</title>');
  });
});
