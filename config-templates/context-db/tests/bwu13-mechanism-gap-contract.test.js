// bwu13-mechanism-gap-contract.test.js — bwu-13-bmad-mechanism-gap-closure
// (BR-008..BR-019)
//
// Contract tests over workflow/rule/skill markdown — asserts specific wording
// EXISTS at specific relative positions. Per WORKFLOW-CONTRACT-ASSERTION
// pattern FORBIDDEN clauses (testing_strategy header): fs.readFileSync only,
// never git grep (KB-workflow-007 — a git-grep-based check would be blind to
// this story's own new/modified files before they are ever `git add`ed).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const REPO_ROOT = path.join(process.cwd(), '..');
const read = (relPath) => fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');

const DEV_STEP09 = '_bmad/bmm/workflows/4-implementation/dev-story/steps/step-09-completion.md';
const LONGFIELD_RULE = '.claude/rules/db-longfield-revision-safety.md';
const ENRICHMENT_RULE = '.claude/rules/create-story-enrichment.md';
const RULE_MAPPING = '.claude/skills/hooks-mechanization/references/phycool-rule-mapping.md';
const TBV_SKILL = '.claude/skills/tasks-backfill-verify/SKILL.md';
const TASKS_BACKFILL_RULE = '.claude/rules/tasks-backfill.md';
const MIGRATE_SCRIPT = '.context-db/scripts/migrate-stories-v2.js';
const DB_PATH = path.join(process.cwd(), 'phycool.db');

describe('dev-story step-09 §1.5 — advisory runs before status review (BR-008)', () => {
  it('BR008_DevStoryStep09_RunsAdvisoryBeforeStatusReview', () => {
    const content = read(DEV_STEP09);
    const advisoryIdx = content.indexOf('--dev-advisory');
    const statusIdx = content.indexOf('### 2. Update Story Status to "review"');
    expect(advisoryIdx).toBeGreaterThanOrEqual(0);
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(advisoryIdx).toBeLessThan(statusIdx);
    expect(content).toMatch(/二擇一/);
    expect(content).toMatch(/dev_notes/);
  });
});

describe('db-longfield-revision-safety.md — paths cover three workflows + upsert-story.js (BR-009)', () => {
  it('BR009_LongfieldRulePaths_CoverThreeWorkflowsAndUpsertScript', () => {
    const content = read(LONGFIELD_RULE);
    const frontmatterEnd = content.indexOf('\n---', 3);
    const frontmatter = content.slice(0, frontmatterEnd);
    expect(frontmatter.length).toBeGreaterThan(0);
    const globs = ['create-story/**', 'dev-story/**', 'code-review/**', '.context-db/scripts/upsert-story.js'];
    const hits = globs.filter((g) => frontmatter.includes(g));
    expect(hits.length).toBe(4);
  });
});

describe('create-story-enrichment.md — under line cap with pointer after extraction (BR-010)', () => {
  it('BR010_EnrichmentRuleAfterExtraction_UnderLineCapWithPointer', () => {
    const content = read(ENRICHMENT_RULE);
    expect(content.split('\n').length).toBeLessThanOrEqual(250);
    expect(content).toContain('db-longfield-revision-safety.md');
  });
});

describe('phycool-rule-mapping.md — new rule registered (BR-011)', () => {
  it('BR011_NewRuleRegistered_InPhycoolRuleMapping', () => {
    const content = read(RULE_MAPPING);
    expect((content.match(/db-longfield-revision-safety\.md/g) || []).length).toBeGreaterThanOrEqual(1);
  });
});

describe('section-anchored assertion — fails when section deleted (BR-012)', () => {
  const HEADING = '## 長欄位局部修訂安全路徑';

  // Reusable extraction: heading through the next level-2 heading. In-memory
  // string operations only (no disk writes) — this is the fix for AC3/AC4's
  // original weak `grep -c "keyword"` full-text scan, which stays PASS even
  // when the whole section is deleted as long as the keyword survives
  // elsewhere in the file.
  function extractSection(content, heading) {
    const lines = content.split('\n');
    const startIdx = lines.findIndex((l) => l.startsWith(heading));
    if (startIdx === -1) return '';
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        endIdx = i;
        break;
      }
    }
    return lines.slice(startIdx, endIdx).join('\n');
  }

  function hasLongfieldSafetySection(content) {
    const section = extractSection(content, HEADING);
    return section.length > 0 && section.includes('json-file');
  }

  it('BR012_SectionAnchoredAssertion_FailsWhenSectionDeleted', () => {
    const real = read(LONGFIELD_RULE);
    const realSection = extractSection(real, HEADING);
    // Non-empty precondition first (WORKFLOW-CONTRACT-ASSERTION FORBIDDEN
    // clause b) — guards against a future heading rename making extractSection
    // silently return '' and the negative assertion below passing vacuously.
    expect(realSection.length).toBeGreaterThan(0);
    expect(hasLongfieldSafetySection(real)).toBe(true);

    // (b) delete the section from a copy, but leave a decoy "json-file" mention
    // elsewhere in the file — proves the check is section-anchored, not a bare
    // full-text .includes() that the original grep-based AC3/AC4 wording was.
    const withoutSection = real.replace(realSection, '') + '\n\n<!-- decoy retains json-file literal -->\n';
    expect(hasLongfieldSafetySection(withoutSection)).toBe(false);
  });
});

// [code-review F7 2026-08-04] BR-013 and BR-014 below are LIFETIME LOCKS on the
// PRODUCTION DB: they pin one specific story's acceptance_criteria content (nine
// debt_id literals; a triple-backtick count of exactly 1). Same shape as
// TD-BWU3-LIFETIME-LOCK-STALE-AFTER-BWU4-COVERAGE-CHANGE, where bwu-3's locks
// went stale the moment bwu-4 legitimately changed the guarded artifact and no
// re-baselining guidance existed — so the pattern catalog's byte-unchanged-guard
// clause requires that guidance be written down at creation time.
//
// RE-BASELINE / RETIRE when a LEGITIMATE later edit to
// `bwu-9-ac-authoring-safe-revision`.acceptance_criteria turns either red:
//   - BR-013: the nine debt_ids are a 2026-08-01 point-in-time snapshot. If AC6
//     is legitimately rewritten, update the array to the new enumeration — do
//     NOT weaken `.toBe(9)` to a >= comparison (the count IS the guard).
//   - BR-014: BASELINE_FENCE_COUNT is the pre-merge measurement, not a target.
//     A legitimate edit that adds/removes a fence must update the constant in
//     the same commit, with the new measurement recorded in that story's
//     dev_notes — never silently.
// If bwu-9 is ever archived or its AC ceases to be a governed artifact, DELETE
// both cases rather than pinning them to a stale copy.
describe('bwu-9 AC6 — nine debt_ids enumerated with measured-at timestamp (BR-013)', () => {
  it('BR013_Bwu9Ac6_EnumeratesNineDebtIdsWithMeasuredAt', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT acceptance_criteria FROM stories WHERE story_id = 'bwu-9-ac-authoring-safe-revision'").get();
    db.close();
    const ac = row.acceptance_criteria;
    const debtIds = [
      'TD-BWU3-BEHAVIORAL-VERIFICATION-PENDING',
      'TD-BWU3-TESTHIT-FIRST-MATCH-MAY-BE-NON-TEST',
      'TD-BWU3-FIXTURE-UNNAMED-NARROWER-THAN-TASK',
      'TD-CCB-CTRL-CHANNEL-OPS-ENV-DEPENDENT',
      'TD-DESENSITIZATION-GATE-META-DOC-SELF-REFERENCE-FALSE-POSITIVE',
      'TD-HOOKS-DEBT-DISCOVERY-UPSERTDEBTS-ZERO-COVERAGE',
      'TD-TIANJI-ASSETS-LIB-MIRROR-UNDOCUMENTED-DIVERGENCE',
      'TD-PIPELINE-SUBWINDOW-SKILL-MERGE-ARITY-CONTRADICTION',
      'TD-DEVSTORY-STEP09-DOCDRIFT-PATH-COLLIDES-F8-GUARD',
    ];
    const hits = debtIds.filter((id) => ac.includes(id));
    expect(hits.length).toBe(9);
    expect(ac).toContain('2026-08-01');
  });
});

describe('bwu-9 AC revision — preserves code fence count (BR-014)', () => {
  it('BR014_Bwu9AcRevision_PreservesCodeFenceCount', () => {
    // Baseline captured before this story's Task 3 merge (dev_notes/tracking):
    // the pre-merge acceptance_criteria contained exactly 1 triple-backtick.
    const BASELINE_FENCE_COUNT = 1;
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT acceptance_criteria FROM stories WHERE story_id = 'bwu-9-ac-authoring-safe-revision'").get();
    db.close();
    const fenceCount = (row.acceptance_criteria.match(/```/g) || []).length;
    expect(fenceCount).toBe(BASELINE_FENCE_COUNT);
  });
});

describe('test_count semantics — defined in three sites (BR-015)', () => {
  it('BR015_TestCountSemantics_DefinedInThreeSites', () => {
    const DEFINITION = '本卡新增或修改的測試案例數';
    const files = [TBV_SKILL, TASKS_BACKFILL_RULE, MIGRATE_SCRIPT];
    const hits = files.filter((f) => read(f).includes(DEFINITION));
    expect(hits.length).toBe(3);
  });
});

describe('test_count definition — carries effective date and no-backfill declaration (BR-016)', () => {
  it('BR016_TestCountDefinition_CarriesEffectiveDateAndNoBackfill', () => {
    const content = read(TBV_SKILL);
    expect(content).toContain('2026-08-04');
    expect(content).toMatch(/不回填/);
  });
});

describe('tasks-backfill-verify Step 5 — has semantic check item (BR-017)', () => {
  it('BR017_TasksBackfillVerifyStep5_HasSemanticCheckItem', () => {
    const content = read(TBV_SKILL);
    const startIdx = content.indexOf('### Step 5');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    const afterStart = content.slice(startIdx + '### Step 5'.length);
    const nextHeadingIdx = afterStart.indexOf('### ');
    const section = nextHeadingIdx >= 0 ? afterStart.slice(0, nextHeadingIdx) : afterStart;
    expect(section.length).toBeGreaterThan(0);
    expect(section).toMatch(/test_count 是整數/);
    expect(section).toMatch(/新增或修改/);
  });
});

// [dev-story 實查校正 2026-08-04] AC5's testing_strategy Expected column says
// "12 份文字檔" for the zero-occurrence check; the concrete enumeration in the
// same AC's Then clause (6 README + 3 architecture descriptions + 1
// files-manifest.csv) totals 10 distinct files, not 12. Implemented against
// the enumerable 10 — see AC5's own numbered list, items 3-5 — rather than
// force-fitting an unreconciled count.
describe('instructions.xml removal — covers all twelve sites (BR-018)', () => {
  it('BR018_InstructionsXmlRemoval_CoversAllTwelveSites', () => {
    const deletedXmlPaths = [
      '_bmad/bmm/workflows/4-implementation/create-story/instructions.xml',
      '_bmad/bmm/workflows/4-implementation/dev-story/instructions.xml',
      '_bmad/bmm/workflows/4-implementation/code-review/instructions.xml',
      'dist/portable-skills/bmad-overlay/4-implementation/create-story/instructions.xml',
      'dist/portable-skills/bmad-overlay/4-implementation/dev-story/instructions.xml',
      'dist/portable-skills/bmad-overlay/4-implementation/code-review/instructions.xml',
    ];
    for (const p of deletedXmlPaths) {
      expect(fs.existsSync(path.join(REPO_ROOT, p))).toBe(false);
    }

    const textFilesToCheck = [
      '_bmad/bmm/workflows/4-implementation/create-story/README.md',
      '_bmad/bmm/workflows/4-implementation/dev-story/README.md',
      '_bmad/bmm/workflows/4-implementation/code-review/README.md',
      'dist/portable-skills/bmad-overlay/4-implementation/create-story/README.md',
      'dist/portable-skills/bmad-overlay/4-implementation/dev-story/README.md',
      'dist/portable-skills/bmad-overlay/4-implementation/code-review/README.md',
      'dist/portable-skills/architecture/bmad-create-story.md',
      'dist/portable-skills/architecture/bmad-dev-story.md',
      'dist/portable-skills/architecture/bmad-code-review.md',
      '_bmad/_config/files-manifest.csv',
    ];
    const totalHits = textFilesToCheck.reduce((sum, f) => sum + (read(f).match(/instructions\.xml/g) || []).length, 0);
    expect(totalHits).toBe(0);

    expect(fs.existsSync(path.join(REPO_ROOT, 'dist/portable-skills.zip'))).toBe(true);
  });
});

describe('global scan — leaves only two active consumers (BR-019)', () => {
  // Recursive fs.readdirSync/readFileSync only — never git grep (KB-workflow-007
  // + this story's own contract-test header FORBIDDEN clause: a git-grep-based
  // check would be blind to this story's own not-yet-`git add`ed changes).
  function scanDirForLiteral(dir, literal) {
    const hits = [];
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return hits;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        hits.push(...scanDirForLiteral(fullPath, literal));
      } else if (entry.isFile() && !entry.name.endsWith('.zip')) {
        let content;
        try {
          content = fs.readFileSync(fullPath, 'utf8');
        } catch {
          continue;
        }
        content.split('\n').forEach((line, idx) => {
          if (line.includes(literal)) hits.push({ path: fullPath, line: idx + 1 });
        });
      }
    }
    return hits;
  }

  it('BR019_GlobalScan_LeavesOnlyTwoActiveConsumers', () => {
    const bmadHits = scanDirForLiteral(path.join(REPO_ROOT, '_bmad'), 'instructions.xml');
    const distHits = scanDirForLiteral(path.join(REPO_ROOT, 'dist'), 'instructions.xml');
    const allHits = [...bmadHits, ...distHits];
    expect(allHits.length).toBe(2);
    const normalized = allHits.map((h) => h.path.split(path.sep).join('/'));
    expect(normalized.some((p) => p.endsWith('epic-closing-audit/workflow.yaml'))).toBe(true);
    expect(normalized.some((p) => p.endsWith('auto-pilot/workflow.yaml'))).toBe(true);
  });
});
