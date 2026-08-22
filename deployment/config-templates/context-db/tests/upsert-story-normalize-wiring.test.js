// upsert-story-normalize-wiring.test.js
//
// [CR F2 · td-devenv-guard-gate-false-signal-repair] AC22 regression lock.
//
// AC22 demands that extracting normalizeMarkdownBreaks into the shared
// markdown-normalize.js leaves `upsert-story.js` — the SINGLE enforcement point for
// every Story write (_doUpsert -> applyMarkdownNormalization, added after the
// 2026-06-12 m0-11 incident) — behaviourally unchanged. The extraction's own
// behaviour is covered by markdown-normalize.test.js (16 tests); what had NO
// automated lock was the WIRING: drop the import or the call site and normalization
// silently stops for all Story writes, with nothing failing.
//
// Why source-level assertions rather than importing upsert-story.js:
//   - upsert-story.js ends in a top-level `(async () => { ... })()` IIFE, so any
//     `import` of it immediately executes the CLI against vitest's argv.
//   - Its DB_PATH is hardcoded to `<repo>/.context-db/phycool.db` with no override,
//     so a subprocess behavioural test would write the real memory DB.
// Making it importable/injectable would change the execution semantics of the most
// critical write path in the repo — out of scope for this CR. These assertions fail
// on exactly the regression AC22 guards against; the upgrade path (isMain guard +
// injectable DB_PATH -> true behavioural test) is recorded in the CR report.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMarkdownBreaks } from '../scripts/markdown-normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPSERT_STORY_PATH = path.join(__dirname, '..', 'scripts', 'upsert-story.js');

// per .claude/rules/crlf-normalize-discipline.md — strip BOM + CRLF before any
// strict line/substring comparison
const src = fs
  .readFileSync(UPSERT_STORY_PATH, 'utf8')
  .replace(/^﻿/, '')
  .replace(/\r\n/g, '\n');

describe('AC22 wiring lock — upsert-story.js single-point markdown normalization', () => {
  it('imports normalizeMarkdownBreaks from the shared module (not a local copy)', () => {
    expect(src).toMatch(
      /import\s*\{\s*normalizeMarkdownBreaks\s*\}\s*from\s*'\.\/markdown-normalize\.js'/,
    );
    // the inline pre-extraction definition must be gone — two divergent copies is
    // the drift AC22 exists to prevent
    expect(src).not.toMatch(/function\s+normalizeMarkdownBreaks\s*\(/);
  });

  it('applyMarkdownNormalization applies the shared function over MARKDOWN_BREAK_FIELDS', () => {
    const fn = src.match(/function applyMarkdownNormalization\(data\)\s*\{[\s\S]*?\n\}/);
    expect(fn, 'applyMarkdownNormalization must still exist').not.toBeNull();
    expect(fn[0]).toContain('MARKDOWN_BREAK_FIELDS');
    expect(fn[0]).toContain('normalizeMarkdownBreaks(');
  });

  it('_doUpsert still calls applyMarkdownNormalization before writing', () => {
    const doUpsert = src.match(/function _doUpsert\([\s\S]*?\n\}/);
    expect(doUpsert, '_doUpsert must still exist').not.toBeNull();
    expect(doUpsert[0]).toContain('applyMarkdownNormalization(data)');
  });

  it('MARKDOWN_BREAK_FIELDS still covers every markdown-rendered Story field', () => {
    const block = src.match(/const MARKDOWN_BREAK_FIELDS = \[([\s\S]*?)\]/);
    expect(block).not.toBeNull();
    for (const field of [
      'tasks', 'acceptance_criteria', 'dev_notes', 'implementation_approach',
      'testing_strategy', 'definition_of_done', 'risk_assessment', 'rollback_plan',
      'background',
    ]) {
      expect(block[1], `MARKDOWN_BREAK_FIELDS must contain ${field}`).toContain(`'${field}'`);
    }
  });

  it('the shared function is importable from this scope and still idempotent', () => {
    const glued = '### D1 Skill Read (WARN)\n- ✅ verified\n1. first\n⬜ pending';
    const once = normalizeMarkdownBreaks(glued);
    expect(once).toBe(normalizeMarkdownBreaks(once));
    // the exact defect the depth gate self-reported on: heading immediately followed
    // by a list item must end up paragraph-separated
    expect(once).toContain('(WARN)\n\n- ✅ verified');
  });
});
