// markdown-normalize.test.js — AC22 (td-devenv-guard-gate-false-signal-repair)
//
// Locks the behavior of normalizeMarkdownBreaks() after extraction from
// upsert-story.js:59-68 into its own shared ESM module. The transformations
// below are the same three regexes that shipped inline pre-extraction —
// this file exists so a future edit to the shared module can't silently
// change behavior for the write path that protects ALL Story writes
// (upsert-story.js _doUpsert -> applyMarkdownNormalization).

import { describe, it, expect } from 'vitest';
import { normalizeMarkdownBreaks } from '../scripts/markdown-normalize.js';

describe('normalizeMarkdownBreaks — non-string / empty input', () => {
  it('returns non-string input unchanged', () => {
    expect(normalizeMarkdownBreaks(null)).toBe(null);
    expect(normalizeMarkdownBreaks(undefined)).toBe(undefined);
    expect(normalizeMarkdownBreaks(42)).toBe(42);
  });

  it('returns empty string unchanged', () => {
    expect(normalizeMarkdownBreaks('')).toBe('');
  });
});

describe('normalizeMarkdownBreaks — list marker / heading / ordered-list paragraph breaks', () => {
  it('inserts a blank line before a checkbox-style list marker glued to the prior line', () => {
    expect(normalizeMarkdownBreaks('some text\n- item')).toBe('some text\n\n- item');
    expect(normalizeMarkdownBreaks('some text\n⬜ item')).toBe('some text\n\n⬜ item');
    expect(normalizeMarkdownBreaks('some text\n✅ item')).toBe('some text\n\n✅ item');
    expect(normalizeMarkdownBreaks('some text\n☑ item')).toBe('some text\n\n☑ item');
    expect(normalizeMarkdownBreaks('some text\n* item')).toBe('some text\n\n* item');
  });

  it('inserts a blank line before a heading glued to the prior line (# through ######)', () => {
    expect(normalizeMarkdownBreaks('intro\n# Heading 1')).toBe('intro\n\n# Heading 1');
    expect(normalizeMarkdownBreaks('intro\n### Heading 3')).toBe('intro\n\n### Heading 3');
    expect(normalizeMarkdownBreaks('intro\n###### Heading 6')).toBe('intro\n\n###### Heading 6');
  });

  it('inserts a blank line before an ordered-list marker glued to the prior line', () => {
    expect(normalizeMarkdownBreaks('intro\n1. first')).toBe('intro\n\n1. first');
    expect(normalizeMarkdownBreaks('intro\n42. later')).toBe('intro\n\n42. later');
  });

  it('does not touch an already-correct \\n\\n paragraph break', () => {
    const text = 'some text\n\n- item';
    expect(normalizeMarkdownBreaks(text)).toBe(text);
  });

  it('fixes every glued marker across multiple lines in one pass', () => {
    const input = '### D1 Skill Read (WARN)\n- skill-a@1.0.0 — ✅ verified\n- skill-b@2.0.0 — ✅ verified';
    const output = normalizeMarkdownBreaks(input);
    expect(output).toBe('### D1 Skill Read (WARN)\n\n- skill-a@1.0.0 — ✅ verified\n\n- skill-b@2.0.0 — ✅ verified');
  });

  it('does not insert a break before a marker at the very start of the string (no prior char to glue to)', () => {
    expect(normalizeMarkdownBreaks('- item')).toBe('- item');
  });
});

describe('normalizeMarkdownBreaks — excess blank line collapsing', () => {
  it('collapses 3+ consecutive newlines down to exactly 2', () => {
    expect(normalizeMarkdownBreaks('a\n\n\nb')).toBe('a\n\nb');
    expect(normalizeMarkdownBreaks('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('leaves exactly 2 newlines untouched', () => {
    expect(normalizeMarkdownBreaks('a\n\nb')).toBe('a\n\nb');
  });
});

describe('normalizeMarkdownBreaks — idempotency (AC22)', () => {
  const fixtures = [
    'plain text with no markers at all',
    'some text\n- item\n1. ordered\n### heading',
    '### D1 Skill Read (WARN)\n- skill-a@1.0.0 — ✅ verified\n- skill-b@2.0.0 — ✅ verified',
    'a\n\n\n\nb\n- c',
    '',
    '- item at start\n- another item\n\n\n# heading after excess blank lines',
  ];

  for (const fixture of fixtures) {
    it(`re-running on already-normalized output of "${fixture.slice(0, 30)}..." is a no-op`, () => {
      const once = normalizeMarkdownBreaks(fixture);
      const twice = normalizeMarkdownBreaks(once);
      expect(twice).toBe(once);
    });
  }
});
