// depth-gate-heuristics.test.js — bwu-8-gate-regex-and-audit-heuristics T2.5 (BR-007..013)
//
// [Pattern: DEVENV-TEXT-PROCESSOR] — this file's harvestSpecRefs cases cover the
// pattern's two mandatory dimensions (null/empty-no-throw, CRLF/lone-CR/BOM
// equivalence) via BR009_NullEmptyAndProseInput_ReturnsEmptyNoThrow and
// BR009_CrlfLoneCrAndBomBackground_HarvestsIdenticalToLf, per testing_strategy's
// own header note for this Story.

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { harvestSpecRefs, classifySkillRefs, buildSkillReadReport } from '../scripts/depth-gate-heuristics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function makeFixtureProjectRoot(skillFrontmatters) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'depth-gate-fixture-'));
  for (const [skill, frontmatter] of Object.entries(skillFrontmatters)) {
    const dir = path.join(root, '.claude', 'skills', skill);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), frontmatter, 'utf-8');
  }
  return root;
}

function cleanupProjectRoot(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

describe('harvestSpecRefs — backtick-wrapped existing/non-existent paths (BR-007)', () => {
  it('BR007_BacktickWrappedExistingPath_CountedAsSpecRef', () => {
    const bg = '參考 `.context-db/scripts/test-spec-audit.js` 的實作。';
    expect(harvestSpecRefs(bg, PROJECT_ROOT)).toContain('.context-db/scripts/test-spec-audit.js');
  });

  it('BR007_NonExistentPath_NotCounted', () => {
    const bg = '參考 `docs/does-not-exist-xyz/spec.md` 與 `完全不存在的中文目錄/規格/`。';
    expect(harvestSpecRefs(bg, PROJECT_ROOT)).toEqual([]);
  });
});

describe('harvestSpecRefs — Chinese/space paths, non-docs prefix (BR-008)', () => {
  it('BR008_ChinesePathWithSpaceAndTrailingSlash_Counted', () => {
    const bg = '規格 SSoT:`claude token減量策略研究分析/ATDD-SDD-TDD-BDD/規格驅動開發範式/`';
    expect(harvestSpecRefs(bg, PROJECT_ROOT)).toEqual([
      'claude token減量策略研究分析/ATDD-SDD-TDD-BDD/規格驅動開發範式/',
    ]);
  });

  it('BR008_NonDocsPrefixPath_Counted', () => {
    const bg = '見 `_bmad/bmm/workflows/4-implementation/` 目錄。';
    expect(harvestSpecRefs(bg, PROJECT_ROOT)).toContain('_bmad/bmm/workflows/4-implementation/');
  });
});

describe('harvestSpecRefs — guards, cost, and input handling (BR-009)', () => {
  it('BR009_ProseWithSlashes_ZeroRefs', () => {
    const bg = '這是散文,提到 A/B 測試與 UI/UX,以及 docs/ 目錄。';
    expect(harvestSpecRefs(bg, PROJECT_ROOT)).toEqual([]);
  });

  it('BR009_RegexFragmentAndAbsolutePath_NotCounted', () => {
    const bg = '正則片段 `/docs\\/` 與絕對路徑 `/Projects` 皆不應計入。';
    expect(harvestSpecRefs(bg, PROJECT_ROOT)).toEqual([]);
  });

  // There are TWO cost models here and they need separate guards — the original
  // form of this test only covered the first, and covering only the second (as
  // code-review first attempted) is flaky by construction. See each block.
  it('BR009_ScanCost_StaysLinear', () => {
    // (1) Regex scan — wall-clock, per AC3's 500ms/200k bound. That bound was
    // written against the pre-image risk (regex backtracking), and a REPEATED
    // token exercises exactly that: ~180k chars collapse to a single Set entry,
    // so what is being timed is matchAll alone. Measured ~2ms.
    const repeated = 'a/b/c '.repeat(30000);
    const startedScan = Date.now();
    expect(harvestSpecRefs(repeated, PROJECT_ROOT)).toEqual([]);
    expect(Date.now() - startedScan).toBeLessThan(500);

    // (2) Filesystem calls — asserted by CALL COUNT, deliberately not by time.
    // This Story moved D3's precision from "guess the character class" to "ask
    // the filesystem", so the number of existsSync calls is the new cost model,
    // and block (1) cannot see it at all (one entry after dedup ⇒ one call).
    //
    // Wall-clock is the wrong instrument for this half: on Windows the elapsed
    // time is dominated by filesystem cache state and machine load rather than
    // by candidate count — code-review measured medians of 369ms at n=30000 but
    // 681ms at n=20000, i.e. NOT monotonic in n, and a 30k-distinct wall-clock
    // form failed in-suite at 574ms roughly one run in five. A count assertion
    // pins the linearity that actually matters (exactly one stat per surviving
    // candidate, so a second per-candidate I/O or an accidental O(n²) rescan
    // fails it immediately) and is immune to load.
    const distinct = Array.from({ length: 5000 }, (_, i) => `a/b/${i}`).join(' ');
    const spy = vi.spyOn(fs, 'existsSync');
    try {
      expect(harvestSpecRefs(distinct, PROJECT_ROOT)).toEqual([]);
      expect(spy).toHaveBeenCalledTimes(5000);
    } finally {
      spy.mockRestore();
    }
  });

  it('BR009_NullEmptyAndProseInput_ReturnsEmptyNoThrow', () => {
    for (const input of [null, undefined, '', '純散文'.repeat(200)]) {
      expect(() => harvestSpecRefs(input, PROJECT_ROOT)).not.toThrow();
      expect(harvestSpecRefs(input, PROJECT_ROOT)).toEqual([]);
    }
  });

  it('BR009_CrlfLoneCrAndBomBackground_HarvestsIdenticalToLf', () => {
    const lf = '第一行文字\n第二行提到 `.context-db/scripts/test-spec-audit.js`\n第三行文字';
    const crlf = lf.replace(/\n/g, '\r\n');
    const cr = lf.replace(/\n/g, '\r');
    const bom = '﻿' + lf;
    const base = harvestSpecRefs(lf, PROJECT_ROOT);
    expect(base).toEqual(['.context-db/scripts/test-spec-audit.js']);
    expect(harvestSpecRefs(crlf, PROJECT_ROOT)).toEqual(base);
    expect(harvestSpecRefs(cr, PROJECT_ROOT)).toEqual(base);
    expect(harvestSpecRefs(bom, PROJECT_ROOT)).toEqual(base);
  });
});

describe('classifySkillRefs — modify/consume classification (BR-011)', () => {
  it('BR011_SkillMdInFileList_ClassifiedModify', () => {
    const fileList = '| MODIFY | `.claude/skills/phycool-a/SKILL.md` | ... |';
    expect(classifySkillRefs('phycool-a, phycool-b', fileList)).toEqual({
      'phycool-a': 'modify',
      'phycool-b': 'consume',
    });
  });

  it('BR011_EmptyFileList_AllSkillsClassifiedConsume', () => {
    expect(classifySkillRefs('phycool-a, phycool-b', null)).toEqual({
      'phycool-a': 'consume',
      'phycool-b': 'consume',
    });
  });

  it('BR011_ClassificationVocabulary_StaysWithinClosedSet', () => {
    const jsonForm = classifySkillRefs('["phycool-a","phycool-b"]', '`.claude/skills/phycool-a/SKILL.md`');
    const commaForm = classifySkillRefs('phycool-c, phycool-d', null);
    expect(jsonForm).toEqual({ 'phycool-a': 'modify', 'phycool-b': 'consume' });
    expect(commaForm).toEqual({ 'phycool-c': 'consume', 'phycool-d': 'consume' });
    const allValues = [...Object.values(jsonForm), ...Object.values(commaForm)];
    expect(allValues.every((v) => v === 'modify' || v === 'consume')).toBe(true);
  });
});

describe('buildSkillReadReport — classification-gated epic-drift warning (BR-012/BR-013)', () => {
  it('BR012_ConsumeTypeEpicMismatch_NoWarning', () => {
    const root = makeFixtureProjectRoot({
      'phycool-a': '---\nversion: 1.0.0\nupdated: 2026-01-01\nlast-synced-epic: epic-eft\n---\n',
    });
    try {
      const story = { epic_id: 'epic-bwu', required_skills: 'phycool-a', file_list: null };
      expect(buildSkillReadReport(story, root).warnings).toHaveLength(0);
    } finally {
      cleanupProjectRoot(root);
    }
  });

  it('BR012_ModifyTypeEpicMismatch_WarnsNamingSkill', () => {
    const root = makeFixtureProjectRoot({
      'phycool-a': '---\nversion: 1.0.0\nupdated: 2026-01-01\nlast-synced-epic: epic-eft\n---\n',
    });
    try {
      const story = {
        epic_id: 'epic-bwu',
        required_skills: 'phycool-a',
        file_list: '`.claude/skills/phycool-a/SKILL.md`',
      };
      const report = buildSkillReadReport(story, root);
      expect(report.warnings).toHaveLength(1);
      expect(report.warnings[0]).toContain('phycool-a');
    } finally {
      cleanupProjectRoot(root);
    }
  });

  it('BR013_MissingSkillMd_StillBlocks', () => {
    const root = makeFixtureProjectRoot({});
    try {
      const story = { epic_id: 'epic-bwu', required_skills: 'phycool-nonexistent-xyz', file_list: null };
      expect(buildSkillReadReport(story, root).status).toBe('BLOCK');
    } finally {
      cleanupProjectRoot(root);
    }
  });

  it('BR013_ConsumeTypeSkill_StillEmitsVerifiedLine', () => {
    const root = makeFixtureProjectRoot({
      'phycool-a': '---\nversion: 1.0.0\nupdated: 2026-01-01\nlast-synced-epic: epic-bwu\n---\n',
    });
    try {
      const story = { epic_id: 'epic-bwu', required_skills: 'phycool-a', file_list: null };
      const report = buildSkillReadReport(story, root);
      expect(report.lines.some((l) => l.includes('✅') && l.includes('phycool-a') && l.includes('verified'))).toBe(true);
    } finally {
      cleanupProjectRoot(root);
    }
  });
});
