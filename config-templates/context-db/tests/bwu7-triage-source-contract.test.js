// bwu7-triage-source-contract.test.js — bwu-7-triage-consume-all-layer-findings T4.1
// (BR-001..014)
//
// Honest scope (per this card's own dev_notes / testing_strategy): every case
// below asserts that specific instruction wording / mapping-table rows EXIST
// in a workflow markdown file (or, for BR-014, that a producer-side file is
// byte-unchanged). It does NOT and cannot assert that a code-review worker
// actually applies these rules at runtime — that behavioural layer is out of
// scope for this file and is carried by the DoD's final item (the first real
// CR run after this card lands, whose Source Breakdown must show 7 rows with
// Security/Perf/DB non-zero).
//
// This file is authored and run RED before Phase 1-3 touch step-03d-triage-merge.md
// / step-02-review-plan.md / step-04-present-autofix.md / step-06-report-archive.md
// / checklist.md. Those edits are what turn these cases green — if any case is
// green before the edits, that assertion was written too loosely and must be
// tightened.
//
// git-grep-untracked-blind-spot (KB-workflow-007): this file deliberately never
// shells out to `git grep` to detect its own existence or content — only
// fs.readFileSync (source-of-truth reads) and `git diff --stat` (BR-014's
// byte-unchanged guard, which diffs OTHER files, not this one).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.join(process.cwd(), '..');
const read = (relPath) => fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');

const CR_DIR = '_bmad/bmm/workflows/4-implementation/code-review';
const STEP03D = `${CR_DIR}/steps/step-03d-triage-merge.md`;
const STEP03 = `${CR_DIR}/steps/step-03-triple-layer-dispatch.md`;
const STEP03B = `${CR_DIR}/steps/step-03b-edge-case-hunter.md`;
const STEP04 = `${CR_DIR}/steps/step-04-present-autofix.md`;
const STEP06 = `${CR_DIR}/steps/step-06-report-archive.md`;
const STEP02 = `${CR_DIR}/steps/step-02-review-plan.md`;
const CHECKLIST = `${CR_DIR}/checklist.md`;
const EDGE_SKILL = '.claude/skills/edge-case-hunter/SKILL.md';

function sectionBetween(content, startMarker, endMarker) {
  const s = content.indexOf(startMarker);
  if (s === -1) return '';
  const e = content.indexOf(endMarker, s + startMarker.length);
  return e === -1 ? content.slice(s) : content.slice(s, e);
}

// sectionBetween returns '' when the start marker is absent (e.g. a heading gets
// renamed). A NEGATIVE assertion on '' passes vacuously, so the guard would die
// silently — exactly the fail-silent class this whole card exists to close.
// Every caller that feeds a section into `.not.toMatch` MUST anchor it first.
function requireSection(section, label) {
  expect(section, `section "${label}" not found — marker renamed? guard would pass vacuously`).not.toBe('');
  return section;
}

function walkMdFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkMdFiles(full));
    else if (entry.name.endsWith('.md')) results.push(full);
  }
  return results;
}

describe('step-03d §Available State / §2 — all seven sources consumed (BR-001, BR-003)', () => {
  it('BR001_ThreeOrphanVarsInAvailableState_EachAppearsOutsideProseNote', () => {
    const content = read(STEP03D);
    const availSection = sectionBetween(content, '## AVAILABLE STATE', '## STATE VARIABLES');
    for (const varName of ['security_findings', 'perf_findings', 'db_findings']) {
      const totalHits = (content.match(new RegExp(varName, 'g')) || []).length;
      expect(totalHits).toBeGreaterThanOrEqual(2);
      expect(availSection).toContain(varName);
    }
  });

  it('BR001_AllFourFindingSourceLiteral_ZeroHitsAcrossCodeReviewDir', () => {
    const files = walkMdFiles(path.join(REPO_ROOT, CR_DIR));
    let hitsAllFour = 0;
    let hitsNormalizeFour = 0;
    for (const f of files) {
      const c = fs.readFileSync(f, 'utf8');
      hitsAllFour += (c.match(/All 4 finding source/g) || []).length;
      hitsNormalizeFour += (c.match(/正規化四組/g) || []).length;
    }
    expect(hitsAllFour).toBe(0);
    expect(hitsNormalizeFour).toBe(0);
  });

  it('BR003_SourceEnum_ContainsExactlySevenLiteralsMatchingProducer', () => {
    const stepD = read(STEP03D);
    const enumLine = stepD.split('\n').find((l) => l.includes('source: string;'));
    expect(enumLine).toBeTruthy();
    for (const v of ['blind', 'edge', 'auditor', 'saas', 'security-expert', 'perf-expert', 'db-reviewer']) {
      expect(enumLine).toMatch(new RegExp(`"${v}"`));
    }
    const step03 = read(STEP03);
    expect(step03).toMatch(/source = "security-expert"/);
    expect(step03).toMatch(/source = "perf-expert"/);
    expect(step03).toMatch(/source = "db-reviewer"/);
  });
});

describe('step-03d §2 — category/subcategory → dimension mapping tables (BR-004, BR-005, BR-006)', () => {
  it('BR004_SecurityMappingTable_OwaspToSecurityAndBackOfficeToSkillForbidden', () => {
    const content = read(STEP03D);
    expect(content).toMatch(/`A01`[\s\S]{0,10}`A10`[\s\S]{0,25}`Security`/);
    expect(content).toMatch(/`phycool-specific\/BackOffice`[\s\S]{0,25}`SkillFORBIDDEN`/);
    expect(content).toMatch(/`phycool-specific\/CanvasData`[\s\S]{0,25}`SkillFORBIDDEN`/);
    expect(content).toMatch(/未識別 subcategory[\s\S]{0,25}`Security`/);
  });

  it('BR005_PerfMappingTable_AllTenSubcategoriesMappedExactlyOnce', () => {
    const content = read(STEP03D);
    const pairs = {
      query: 'Scalability',
      algo: 'Scalability',
      async: 'DataConsistency',
      memory: 'ErrorHandling',
      cache: 'Scalability',
      http: 'ErrorHandling',
      pool: 'Scalability',
      hotpath: 'Observability',
      gc: 'Scalability',
      frontend: 'UIBehavioral',
    };
    // "ExactlyOnce" in the case name must be backed by an exactly-once assertion,
    // and scoped to §2 — a file-wide `toMatch` is at-least-once and would let a
    // duplicate/contradictory row elsewhere pass unnoticed.
    const sec2 = requireSection(
      sectionBetween(content, '### 2. Normalize All Findings', '### 3. Deduplicate'),
      '§2 Normalize'
    );
    for (const [sub, dim] of Object.entries(pairs)) {
      const hits = sec2.match(new RegExp('`' + sub + '`[\\s\\S]{0,25}`' + dim + '`', 'g')) || [];
      expect(hits.length, `perf mapping ${sub} → ${dim}`).toBe(1);
    }
    expect(sec2).toMatch(/未識別[\s\S]{0,25}`Scalability`/);
  });

  it('BR006_DbMappingTable_AllSixSubcategoriesMappedExactlyOnce', () => {
    const content = read(STEP03D);
    const pairs = {
      migration: 'MigrationIntegrity',
      pk: 'MigrationIntegrity',
      index: 'Scalability',
      null: 'DataConsistency',
      spec: 'MigrationIntegrity',
      retention: 'Compliance',
    };
    const sec2 = requireSection(
      sectionBetween(content, '### 2. Normalize All Findings', '### 3. Deduplicate'),
      '§2 Normalize'
    );
    for (const [sub, dim] of Object.entries(pairs)) {
      const hits = sec2.match(new RegExp('`' + sub + '`[\\s\\S]{0,25}`' + dim + '`', 'g')) || [];
      expect(hits.length, `db mapping ${sub} → ${dim}`).toBe(1);
    }
    expect(sec2).toMatch(/未識別[\s\S]{0,25}`MigrationIntegrity`/);
  });

  it('BR004_AllMappedDimensions_StayInsideClosedSaasDimensionSet', () => {
    const content = read(STEP03D);
    const closedSet = [
      'Security', 'Scalability', 'Observability', 'DataConsistency', 'MigrationIntegrity',
      'ErrorHandling', 'Compliance', 'TestCoverage', 'SkillFORBIDDEN', 'UIBehavioral',
    ];
    const section = sectionBetween(content, '### 2. Normalize All Findings', '### 3. Deduplicate');
    // Precondition: the three mapping tables must actually exist (>= 20 dimension-cell rows
    // across all three). An empty section would vacuously pass the loop below, so this
    // count assertion is what makes RED fail for the right reason (table absent), not by
    // accident (table present but wrong).
    // Row-anchored (^...$ per line via /m) and newline-excluded ([^|\n]) — a non-anchored
    // [^|]*? would let an empty cell-1 "hop" across the \n from one row's trailing `|` to
    // the next row's leading `|`, capturing that next row's subcategory instead of its
    // dimension (caught empirically: bare single-word cell-1 rows like `query`/`algo` were
    // mis-captured as the "dimension" until this fix).
    const rowRe = /^\|[ \t]*[^|\n]*?\|[ \t]*`([A-Za-z]+)`[ \t]*\|/gm;
    // Collect EVERY captured dimension cell — do NOT pre-filter by closedSet.
    // Pre-filtering made the membership loop below tautological: a brand-new
    // out-of-set dimension (e.g. `Reliability`) was skipped instead of failing,
    // so the only value this case could ever catch was the literal 'Performance'.
    const found = [];
    let m;
    while ((m = rowRe.exec(section)) !== null) found.push(m[1]);
    expect(found.length).toBeGreaterThanOrEqual(20);
    for (const dim of found) {
      expect(closedSet).toContain(dim);
    }
    expect(found).not.toContain('Performance');
  });
});

describe('step-03d §2 — title/location derivation for the three new sources (BR-007)', () => {
  it('BR007_TitleAndLocationDerivation_RulesStatedForThreeNewSources', () => {
    const content = read(STEP03D);
    const titleRuleCount = (content.match(/`title`\s*=\s*`description`\s*截斷至\s*80\s*字元/g) || []).length;
    const locationRuleCount = (content.match(/`location`\s*=\s*`"\{file\}:\{line\}"`/g) || []).length;
    const lineEmptyRuleCount = (content.match(/`line`\s*缺漏時為\s*`""`/g) || []).length;
    expect(titleRuleCount).toBeGreaterThanOrEqual(3);
    expect(locationRuleCount).toBeGreaterThanOrEqual(3);
    expect(lineEmptyRuleCount).toBeGreaterThanOrEqual(3);
  });
});

describe('step-03d §1/§3.8 — guard + severity distrust list (BR-002, BR-008, BR-009)', () => {
  it('BR002_HasDbChangesFalse_DbFindingsTreatedEmptyNoMissingLayerWarning', () => {
    const content = read(STEP03D);
    const guardSection = sectionBetween(content, '### 1. Incomplete Review Guard', '### 2. Normalize All Findings');
    expect(guardSection).toMatch(/\{has_db_changes\}/);
    expect(guardSection).toMatch(/不視為.*必需|視為空集|不觸發.*警告/);
  });

  it('BR008_SeverityDistrustList_NamesAllSixSubagentSourcesAndExcludesSaas', () => {
    const content = read(STEP03D);
    const section = sectionBetween(content, '### 3.8.', '### 4. Classify Each Finding');
    for (const src of ['"blind"', '"edge"', '"auditor"', 'security-expert', 'perf-expert', 'db-reviewer']) {
      expect(section).toContain(src);
    }
    expect(section).toMatch(/\{saas_findings\}[\s\S]{0,20}\*{0,2}不在\*{0,2}[\s\S]{0,20}不採信範圍/);
  });

  it('BR009_ScopeNoteGapParagraph_RemovedFromStep03d', () => {
    const content = read(STEP03D);
    expect(content).not.toMatch(/目前未被 §2 正規化消費/);
    expect(content).not.toMatch(/TD-CR-TRIAGE-DROPS-LAYER-DEF-FINDINGS/);
  });
});

describe('step-03d §2 — INFO pre-filter, severity union unchanged (BR-010)', () => {
  it('BR010_InfoSeverity_DismissedBeforeFindingAndUnionStaysFourValued', () => {
    const content = read(STEP03D);
    expect(content).toMatch(/severity\s*==\s*"INFO"/);
    expect(content).toMatch(/INFO[\s\S]{0,160}(dismiss|建構.*Finding.*前)/);
    expect(content).toMatch(/severity:\s*"CRITICAL"\s*\|\s*"HIGH"\s*\|\s*"MEDIUM"\s*\|\s*"LOW"/);
    const sec4 = requireSection(
      sectionBetween(content, '### 4. Classify Each Finding', '### 5. Calculate SaaS Readiness Score'),
      '§4 Classify'
    );
    const sec5 = requireSection(
      sectionBetween(content, '### 5. Calculate SaaS Readiness Score', '### 6. Final Output Summary'),
      '§5 Score'
    );
    expect(sec4).not.toMatch(/INFO/);
    expect(sec5).not.toMatch(/INFO/);
  });
});

describe('step-03/step-03d SUCCESS METRICS parity (BR-011)', () => {
  it('BR011_SourceCountParity_Step03SuccessMetricsEqualsStep03dSuccessMetrics', () => {
    const step03 = read(STEP03);
    const step03d = read(STEP03D);
    const metricsLine = step03.split('\n').find((l) => l.includes('all set'));
    expect(metricsLine).toBeTruthy();
    const varCount = (metricsLine.match(/\{[a-z_]+_findings\}/g) || []).length;
    expect(varCount).toBe(6); // 6 unconditionally-set vars; {db_findings} is the 7th, conditional (next line)
    // [\s\S]{0,5} (not \s*) between "}" and "set" — the source has a closing code-span
    // backtick there ("`{db_findings}` set"), which \s* does not match.
    expect(step03).toMatch(/\{db_findings\}[\s\S]{0,5}set[\s\S]{0,20}has_db_changes[\s\S]{0,10}true/);
    expect(step03d).toMatch(/All 7 finding sources/);
  });
});

describe('downstream 5 sites — seven-source enumeration (BR-012)', () => {
  it('BR012_FiveDownstreamSites_EachEnumeratesSevenSources', () => {
    const checklist = read(CHECKLIST);
    const step04 = read(STEP04);
    const step06 = read(STEP06);
    const step02 = read(STEP02);

    expect(checklist).toMatch(/All 7 finding sources/);

    const countHits = (c) => (c.match(/Security Expert|Perf Expert|DB Reviewer/g) || []).length;
    expect(countHits(step04)).toBeGreaterThanOrEqual(3);
    expect(countHits(step06)).toBeGreaterThanOrEqual(3);

    expect(step04).not.toMatch(/blind\/edge\/auditor\/saas\/merged/);

    expect(step02).toMatch(/Security Expert|Layer D/);
    expect(step02).toMatch(/Perf Expert|Layer E/);
    expect(step02).toMatch(/DB Reviewer|Layer F/);
    expect(step02).not.toMatch(/All 9 dimensions/);
  });
});

describe('step-03d §3 — dedup criterion unchanged, tie-break order extended (BR-013)', () => {
  it('BR013_DedupCriterionText_UnchangedWhileTieBreakOrderExtended', () => {
    const content = read(STEP03D);
    expect(content).toMatch(/same claim AND same required action/);
    expect(content).toMatch(
      /\{blind_findings\}[\s\S]{0,10}→[\s\S]{0,10}\{edge_findings\}[\s\S]{0,10}→[\s\S]{0,10}\{auditor_findings\}[\s\S]{0,10}→[\s\S]{0,10}\{security_findings\}[\s\S]{0,10}→[\s\S]{0,10}\{perf_findings\}[\s\S]{0,10}→[\s\S]{0,10}\{db_findings\}[\s\S]{0,10}→[\s\S]{0,10}\{saas_findings\}/
    );
  });
});

describe('producer + producer-side skill — untouched guards (BR-014)', () => {
  it('BR014_ProducerAndProducerSideSkill_ByteUnchangedVsHead', () => {
    // `git diff` (no rev) compares worktree vs INDEX — staging an edit with
    // `git add` would hide it from this guard. `git diff HEAD` compares against
    // the commit, so staged AND unstaged edits both surface.
    // Honest scope: this guard is live only while bwu-7's edits sit in the
    // working tree. Once bwu-7 is committed it necessarily reports empty. It is
    // an edit-time regression guard, not a permanent freeze on the producer —
    // step-03 must stay free to evolve in later cards.
    const diff = execFileSync('git', ['diff', 'HEAD', '--stat', '--', STEP03, EDGE_SKILL, STEP03B], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(diff.trim()).toBe('');
  });

  it('BR014_FourExistingNormalizationBlocks_TextPreserved', () => {
    const content = read(STEP03D);
    expect(content).toContain('**From `{blind_findings}` (Markdown list):**');
    expect(content).toContain('**From `{edge_findings}` (JSON array):**');
    expect(content).toContain('**From `{auditor_findings}` (Markdown list):**');
    expect(content).toContain('**From `{saas_findings}` (already structured):**');
    expect(content).toContain('source` = "blind"');
    expect(content).toContain('Pass through directly');
  });
});
