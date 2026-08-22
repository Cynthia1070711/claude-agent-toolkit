// bwu3-workflow-contract.test.js — bwu-3-dev-consume-review-audit T2.4
// (BR-003..009, BR-017..025, BR-029, BR-030)
//
// Honest scope (per this card's own dev_notes / testing_strategy): every
// "_InstructionPresent" case below asserts that specific instruction wording
// EXISTS in a workflow/skill markdown file. It does NOT and cannot assert that
// an agent actually follows that instruction at runtime — that behavioural
// layer is out of scope for this file and is carried by the DoD's final item
// (the first real story to run all three upgraded phases end-to-end).
//
// This file is authored and run RED before Phase 3 touches its three targets
// (step-05-implement-task.md / step-03c-acceptance-auditor.md / SKILL.md).
// Phase 3's edits are what turn these green — if any of them is green before
// Phase 3, that specific assertion was written too loosely and must be
// tightened (implementation_approach Phase 2 verification note).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.join(process.cwd(), '..');
const read = (relPath) => fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');

const DEV_STEP05 = '_bmad/bmm/workflows/4-implementation/dev-story/steps/step-05-implement-task.md';
const CR_STEP03C = '_bmad/bmm/workflows/4-implementation/code-review/steps/step-03c-acceptance-auditor.md';
const TBV_SKILL = '.claude/skills/tasks-backfill-verify/SKILL.md';
const STOP_REPORT = '.claude/skills/party-to-pipeline/scripts/stop-report.ps1';
const ENFORCER = '.claude/hooks/tasks-backfill-review-audit-enforcer.js';
const AUTHOR_TESTS = '_bmad/bmm/workflows/4-implementation/dev-story/steps/step-06-author-tests.md';

const CREATE_SIDE_FILES = [
  '.claude/skills/phycool-create-story-depth-gate/scripts/run-depth-gate.js',
  '_bmad/bmm/workflows/4-implementation/create-story/steps/step-06-create-story-file.md',
  '_bmad/bmm/workflows/4-implementation/create-story/template.md',
  '_bmad/bmm/workflows/4-implementation/create-story/checklist.md',
];

describe('dev-story step-05 §0.4 — consume mode contract (BR-003..009)', () => {
  const t = () => read(DEV_STEP05);

  it('BR003_ConsumeModeVerbatimCaseName_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/byte-identical/i);
    expect(content).toMatch(/自創|not.*invent/i);
    expect((content.match(/test-spec-audit/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('BR004_LevelFixtureInputExpectedSourcedFromRow_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/Level/);
    expect(content).toMatch(/Fixture/);
    expect(content).toMatch(/Input/);
    expect(content).toMatch(/Expected/);
    expect(content).toMatch(/IClassFixture|fixture 選擇|層級.*Fixture.*Input.*Expected|四項.*來源/s);
  });

  it('BR005_RedConfirmedAgainstRedGreenColumn_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/RED→GREEN|RED->GREEN|RED-GREEN/);
    expect(content).toMatch(/測試寫錯|test.*bug|編譯錯誤|NullReferenceException|NRE/);
  });

  it('BR006_FallbackBranchPreservesLegacyBehaviourAndWarns_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/\[ATDD Fallback WARN @/);
    expect(content).toMatch(/fallback/i);
  });

  it('BR007_ReentrySkipsRowsWithTestHit_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/testHit/);
    expect(content).toMatch(/跳過不重寫|skip.*rewrit|不得重寫/);
    expect(content).toMatch(/consume:.*new.*existing/i);
  });

  it('BR008_DevNeverWritesTestingStrategy_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/不寫\s*`?stories\.testing_strategy`?|唯讀|read-only/i);
  });

  it('BR009_AtddChecklistTreatedAsSupplementary_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/atdd-checklist-\{?story_key\}?/);
    expect(content).toMatch(/表為權威|補充|supplementary|補未覆蓋/);
  });
});

describe('code-review step-03c §6 — reconciliation contract (BR-017..021)', () => {
  const t = () => read(CR_STEP03C);

  it('BR017_ThreeAxisReconciliation_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/存在/);
    expect(content).toMatch(/斷言真實|assertion.*real/i);
    expect(content).toMatch(/紅綠可證|RED.*GREEN.*provable|red-green/i);
    expect((content.match(/test-spec-audit/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('BR018_SeverityLadderMediumPerRowHighWhenAllMissing_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/MEDIUM/);
    expect(content).toMatch(/單一[^\n]{0,6}HIGH|single HIGH|一個[^\n]{0,6}HIGH/);
    expect(content).toMatch(/不產\s*N\s*個\s*MEDIUM|not.*N.*MEDIUM/i);
  });

  it('BR019_ColumnDefectFindingsWithSystemicRollup_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/LOW/);
    expect(content).toMatch(/≥\s*3|>=\s*3|三列|3\s*列/);
    expect(content).toMatch(/TD-BWU2-D7-COLUMN-CONTRACT-UNVERIFIED/);
  });

  it('BR020_FallbackAndSkipEmitNoTableFindings_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/fallback/i);
    expect(content).toMatch(/skip/i);
    expect(content).toMatch(/不產.*finding|no.*new.*finding|零新\s*finding/i);
  });

  it('BR021_ReconciliationMarkerFormat_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/\[Test Spec Reconciliation @/);
    expect(content).toMatch(/cases\]/);
  });
});

describe('tasks-backfill-verify SKILL.md — per-case reconciliation (BR-022/023)', () => {
  const t = () => read(TBV_SKILL);

  it('BR022_Step3PerCaseCoverageWhenTableExists_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/逐列對映|per-row mapping|逐列對照/);
    // Original prose branch (no-table case) must still be present, not replaced.
    expect(content).toMatch(/確認測試覆蓋[\s\S]*檢查是否有對應的測試檔案/);
  });

  it('BR023_Step7FoldsReconciliationIntoMarkers_InstructionPresent', () => {
    const content = t();
    expect(content).toMatch(/對帳.*併入|fold.*reconciliation|併入.*review marker/i);
  });
});

describe('v2.0.0 non-idempotence guard rails — untouched (BR-024)', () => {
  it('BR024_V2NonIdempotenceRulesPreserved_MarkerRegexIntact', () => {
    const stopReport = read(STOP_REPORT);
    const enforcer = read(ENFORCER);
    const skill = read(TBV_SKILL);
    expect(stopReport).toMatch(/\[R-verified @ \\d\{4\}-\\d\{2\}-\\d\{2\}T\\d\{2\}:\\d\{2\}/);
    expect(enforcer).toMatch(/\[R-verified @ \\d\{4\}-\\d\{2\}-\\d\{2\}T\\d\{2\}:\\d\{2\}/);
    // stop-report.ps1 encodes the double-check via String.fromCodePoint(0x2705),
    // not literal emoji bytes (encoding-discipline.md) — check the mechanism.
    // enforcer.js uses the literal glyph directly.
    expect(stopReport).toMatch(/fromCodePoint\(0x2705\)/);
    expect(enforcer).toMatch(/✅✅/);
    expect(skill).toMatch(/SHA-256/);
    expect(skill).toMatch(/≠\s*dev|not.*equal.*dev|dev.*不同/i);
  });
});

describe('tasks-backfill-verify version bump (BR-025)', () => {
  it('BR025_SkillVersionBumped_SingleHistoryRow', () => {
    const content = read(TBV_SKILL);
    const versionMatch = content.match(/^version:\s*([\d.]+)/m);
    expect(versionMatch).not.toBeNull();
    const version = versionMatch[1];
    const [major, minor] = version.split('.').map(Number);
    // Must be strictly newer than the pre-Phase-3 baseline (2.0.0).
    expect(major > 2 || (major === 2 && minor > 0)).toBe(true);

    // The other half of this row's Expected cell ("`updated`/`last-synced-*` 同步;
    // Version History 表恰多一列"), unasserted until bwu-3's own code-review.
    // The known failure mode is bumping version+updated and leaving last-synced-*
    // stale, so the four frontmatter fields are pinned to each other, not to a date.
    const updated = content.match(/^updated:\s*(\S+)/m)?.[1];
    expect(updated).toBe(content.match(/^last-synced-date:\s*(\S+)/m)?.[1]);
    expect(content.match(/^last-synced-epic:\s*(\S+)/m)?.[1]).toBeTruthy();

    // "恰多一列" == the RED side of this row: replaying Mode B appends the same
    // version twice. Counting rows carrying the current version (not total rows)
    // keeps the lock true across future legitimate bumps.
    const historyRows = content
      .split('\n')
      .filter((l) => /^\|\s*\*{0,2}\s*\d+\.\d+\.\d+/.test(l));
    expect(historyRows.filter((l) => l.includes(version))).toHaveLength(1);
    expect(historyRows.length).toBeGreaterThanOrEqual(4); // 2.1.0 + the three it inherited
  });
});

describe('create-side scope guard (BR-029)', () => {
  // Anchored at this card's own baseline commit, NOT at the working tree.
  // `git diff --stat -- <paths>` (the original form) compares worktree↔HEAD, so it
  // goes empty the moment a change is committed — proven during bwu-3's code-review
  // with a file this card really did change: `git diff --stat -- .claude/rules/testing.md`
  // printed nothing while `git diff --stat 24fa170f3^ -- .claude/rules/testing.md`
  // printed the edit. The guard therefore could not fail for the one scenario it
  // exists to catch ("dev 順手改 create 端 then committed").
  // Scope note: this is a bwu-3-lifetime lock. When a later epic-bwu card legitimately
  // edits a create-side file, re-baseline the constant or delete this test — do not
  // weaken it back to the worktree form.
  // [bwu-12 reanchor] bwu-4's commit cf32b9ec0 legitimately touched a create-side file
  // (coverage threshold 70%→80% unification) and broke this lock (TD-BWU3-LIFETIME-LOCK-
  // STALE-AFTER-BWU4-COVERAGE-CHANGE). cf32b9ec0 itself is NOT a valid reanchor point —
  // run-depth-gate.js kept legitimately evolving after it (bwu-2/bwu-8 create-side work).
  // 48a2b710a (bwu-8 code-review) is the latest commit touching any of the 4 paths as of
  // this reanchor: `git diff --stat 48a2b710a -- <CREATE_SIDE_FILES>` is empty, and
  // `git merge-base --is-ancestor cf32b9ec0 48a2b710a` confirms it postdates bwu-4.
  const STORY_BASELINE = '48a2b710a'; // bwu-8-gate-regex-and-audit-heuristics CR (latest create-side touch)

  it('BR029_CreateSideFilesByteUnchanged_FourPaths', () => {
    const diff = execFileSync('git', ['diff', '--stat', STORY_BASELINE, '--', ...CREATE_SIDE_FILES], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(diff.trim()).toBe('');
  });
});

describe('coverage threshold guard (BR-030)', () => {
  it('BR030_CoverageThresholdUntouched_SeventyPercentRemains', () => {
    // [bwu-12 reanchor] threshold unified 70%→80% by bwu-4 (cf32b9ec0); guard now pins 80%.
    expect(read(AUTHOR_TESTS)).toMatch(/80%/);
  });
});
