// testing-strategy-structure.test.js — bwu-2-create-testspec-production code-review
//
// Locks Depth Gate D7 §7.1b after its extraction from run-depth-gate.js runD7().
// Four of these describe blocks are regression locks for defects this review
// found in the original inline implementation:
//   1. a CRLF table was reported as "no table" (false WARN → exit 2 → HALT)
//   2. BR-01 counted as covered by a table that only mentions BR-012
//   3. a BR id named only in prose counted as covered (BR-004 wants a case row)
//   4. the case count reported occurrences, not distinct cases (44 vs 40)
// plus the super-linear scan the earlier `[A-Z0-9]*\d+` / `\s*[^\]]+` regexes had.

import { describe, it, expect } from 'vitest';
import {
  checkTestingStrategyStructure,
  SKIP_COMPLEXITIES,
  parseTestCaseTable,
} from '../scripts/testing-strategy-structure.js';

const TABLE = [
  '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
  '|------|----|-------|---------|-------|----------|-----------|',
  '| `BR001_DiscountAbove50_ReturnsValidationError` | BR-001 | unit | `N/A — pure function` | 51 | error | RED: 200 / GREEN: 422 |',
  '| `BR002_UpdateScript_WhenConflict_Returns409` | BR-002 | integration | `CustomWebApplicationFactory` | stale RowVersion | HTTP 409 | RED: 200 / GREEN: 409 |',
].join('\n');

const AC = '**Then** ... `[Verifies: BR-001, BR-002]`';

describe('complexity gate (BR-001 / BR-023)', () => {
  it('skips S and XS, reporting the complexity verbatim', () => {
    for (const c of ['S', 'XS', 's', 'xs']) {
      const r = checkTestingStrategyStructure({ complexity: c, testing_strategy: 'prose only' });
      expect(r.skipped).toBe(true);
      expect(r.skipReason).toBe(`${c} complexity`);
      expect(r.issues).toEqual([]);
    }
  });

  it('reports "S complexity" when complexity is absent — AC8 asserts that exact string', () => {
    expect(SKIP_COMPLEXITIES.has('S')).toBe(true);
    // An unknown complexity is NOT skipped; only S/XS are.
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: '' }).skipped).toBe(false);
  });

  it.each(['M', 'L', 'XL'])('runs the structural check for %s', (complexity) => {
    const r = checkTestingStrategyStructure({ complexity, testing_strategy: TABLE, acceptance_criteria: AC });
    expect(r.skipped).toBe(false);
    expect(r.issues).toEqual([]);
  });
});

describe('(a) markdown table detection', () => {
  it('accepts a qualifying table', () => {
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE }).issues).toEqual([]);
  });

  it('flags prose with no table', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: 'x'.repeat(600) });
    expect(r.issues.some((i) => i.includes('無具名測試案例表'))).toBe(true);
  });

  // Regression: CRLF story text reached the gate and (a) failed, because the
  // original `[ \t]*\n` could not step over the \r. phycool.db holds such rows
  // and upsert-story.js does not strip CR.
  it('accepts the same table with CRLF line endings', () => {
    const crlf = TABLE.replace(/\n/g, '\r\n');
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: crlf, acceptance_criteria: AC });
    expect(r.issues).toEqual([]);
    expect(r.caseCount).toBe(2);
  });

  it('accepts a lone CR as a line separator too', () => {
    const cr = TABLE.replace(/\n/g, '\r');
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: cr }).issues).toEqual([]);
  });
});

describe('(b) case-name pattern', () => {
  it('flags a table with no {BR_ID}_{Scenario}_{Expected} cell', () => {
    const noNames = '| Metric | Value |\n|--------|-------|\n| coverage | 82% |';
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: noNames });
    expect(r.issues.some((i) => i.includes('案例名'))).toBe(true);
  });

  it('accepts the BRWH01_ prefix form used by the webhook seed pattern', () => {
    const t = '| Case | BR |\n|---|---|\n| `BRWH01_ForgedCheckMacValue_ReturnsBadRequest` | BR-1 |';
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: t }).caseCount).toBe(1);
  });

  it('rejects names with fewer than two trailing segments (BR-003)', () => {
    const t = '| Case | BR |\n|---|---|\n| `BR001_Works` | BR-001 |';
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: t });
    expect(r.issues.some((i) => i.includes('案例名'))).toBe(true);
  });

  // Regression: the report used to count occurrences, so a case name restated in
  // a second table (a per-phase table plus a summary table, which is exactly how
  // this story's own field is laid out) inflated it — 44 reported for 40 cases.
  it('counts distinct case names, not occurrences', () => {
    const summaryTable = [
      '',
      '| Case | 驗收清單對映 |',
      '|------|-------------|',
      '| `BR001_DiscountAbove50_ReturnsValidationError` | 第 2 項 |',
    ].join('\n');
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE + summaryTable });
    expect(r.caseCount).toBe(2);
  });
});

describe('(c) BR coverage (BR-004 / BR-024)', () => {
  it('normalises separators so AC BR-001 matches case BR001_', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: AC });
    expect(r.citedBrCount).toBe(2);
    expect(r.uncoveredBrIds).toEqual([]);
  });

  it('names every uncovered BR id', () => {
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: TABLE,
      acceptance_criteria: '`[Verifies: BR-001, BR-002, BR-003, BR-005]`',
    });
    expect(r.uncoveredBrIds).toEqual(['BR003', 'BR005']);
    expect(r.issues.some((i) => i.includes('BR003, BR005'))).toBe(true);
  });

  it('ignores non-numeric placeholder tokens such as BR-00N', () => {
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: TABLE,
      acceptance_criteria: '例句 `[Verifies: BR-00N]` 與真實 `[Verifies: BR-001, BR-002]`',
    });
    expect(r.citedBrCount).toBe(2);
    expect(r.issues).toEqual([]);
  });

  it('tolerates [Verifies:] with no surrounding whitespace', () => {
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: TABLE,
      acceptance_criteria: '`[Verifies:BR-001]` `[Verifies:  BR-002 ]`',
    });
    expect(r.citedBrCount).toBe(2);
    expect(r.uncoveredBrIds).toEqual([]);
  });

  // Regression: substring matching let a longer id satisfy a shorter one.
  it('does not treat BR-01 as covered by a table that only has BR-012', () => {
    const t = '| Case | BR |\n|---|---|\n| `BR012_Something_Returns200` | BR-012 |';
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: t,
      acceptance_criteria: '`[Verifies: BR-01]`',
    });
    expect(r.uncoveredBrIds).toEqual(['BR01']);
  });

  // Regression: coverage was matched against the whole field, so an intro
  // sentence listing the BR ids satisfied it with no matching case row.
  it('does not accept a BR id that appears only in prose', () => {
    const t = `本表覆蓋 BR-001 ~ BR-005 全部。\n\n${TABLE}`;
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: t,
      acceptance_criteria: '`[Verifies: BR-001, BR-005]`',
    });
    expect(r.uncoveredBrIds).toEqual(['BR005']);
  });

  // Contract revised by bwu-8-gate-regex-and-audit-heuristics BR-005: a card
  // whose AC cites no BR id at all used to report this as a clean PASS
  // (0 cited => 0 uncovered => no issue), indistinguishable from a card with
  // real, fully-covered coverage. AC2 makes that state fail-loud instead — this
  // is a deliberate contract revision, not a loosened test to fit the impl.
  it('BR006_AcCitesNothing_NowReportsVacuousIssue', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: 'no markers' });
    expect(r.citedBrCount).toBe(0);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain('AC 引用 0 個有效 BR id');
  });

  // Added by bwu-8 code-review. The widened predicate shipped as
  // `BR[-_]?[A-Za-z0-9]+...`, whose optional separator also accepted any
  // identifier merely starting with those two letters — BRANCH-01 / BROWSER-02 /
  // BRIDGE_V3 were all counted as cited BR ids, silently. Guards the narrowing
  // (`BR` + digits directly, or `BR` + a separator) so reverting it turns this red.
  it('BR001_IdentifiersMerelyStartingWithBr_NotTreatedAsBrIds', () => {
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: TABLE,
      acceptance_criteria: '`[Verifies: BRANCH-01, BROWSER-02, BRIDGE_V3, BREAKING-1]`',
    });
    expect(r.citedBrCount).toBe(0);
    expect(r.uncoveredBrIds).toEqual([]); // none of them became a coverage target
  });

  // Companion to the case above: the narrowing must not cost any real shape.
  it('BR004_RealBrIdShapes_SurviveTheNarrowing', () => {
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: TABLE,
      acceptance_criteria: '`[Verifies: BR-001, BR002, BR-G01, BR-PREVIEW-01, BR-CCG-L5-01, BR-CC-E-D2, br-25]`',
    });
    expect(r.citedBrCount).toBe(7);
  });
});

describe('input handling', () => {
  it('treats NULL/undefined fields as empty rather than throwing', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M' });
    expect(r.issues).toHaveLength(2);
    expect(r.caseCount).toBe(0);
  });

  it('accepts an empty argument list', () => {
    expect(() => checkTestingStrategyStructure()).not.toThrow();
  });
});

describe('scan cost stays linear', () => {
  // The pre-extraction regexes were quadratic on the shapes below: ~234ms at 30k
  // chars and ~10s at 200k. All now finish in well under a millisecond, so a
  // generous bound still fails loudly if the disjoint classes are ever undone.
  //
  // The case-name payload MUST sit inside a table row — case names are only
  // scanned there, so a bare payload would exercise nothing and pass vacuously.
  const inTableRow = (cell) => `| Case | BR |\n|---|---|\n| ${cell} | BR-001 |`;

  it.each([
    ['BR-prefixed digit run, no underscore', () => 'BR'.concat('0'.repeat(200000))],
    ['BR-prefixed digit run, one underscore', () => 'BR1_'.concat('0'.repeat(200000))],
  ])('case-name scan: %s completes fast', (_label, build) => {
    const started = Date.now();
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: inTableRow(build()) });
    expect(Date.now() - started).toBeLessThan(500);
    expect(r.caseCount).toBe(0); // payload must really have been scanned, and rejected
  });

  it.each([
    ['unclosed [Verifies: with a long blank run', () => '[Verifies:'.concat(' '.repeat(200000))],
    ['many unclosed [Verifies: markers across lines', () => '[Verifies: BR-001\n'.repeat(20000)],
  ])('AC marker scan: %s completes fast', (_label, build) => {
    const started = Date.now();
    const r = checkTestingStrategyStructure({
      complexity: 'M',
      testing_strategy: TABLE,
      acceptance_criteria: build(),
    });
    expect(Date.now() - started).toBeLessThan(500);
    expect(r.citedBrCount).toBe(0); // nothing closed, so nothing cited
  });
});

// bwu-3-dev-consume-review-audit T1.1/T1.2/T1.3 — parseTestCaseTable() + per-row defects.
// New export only; checkTestingStrategyStructure()/SKIP_COMPLEXITIES untouched (BR-016),
// hence the 26 assertions above this line are not edited by this addition.
describe('parseTestCaseTable — header-name resolution (BR-010)', () => {
  it('BR010_HeaderOutOfOrderWithExtraColumn_ResolvesByName', () => {
    const t = [
      '| BR | Case | Level | Fixture | Input | Expected | RED->GREEN | Notes |',
      '|----|------|-------|---------|-------|----------|------------|-------|',
      '| BR-005 | `BR005_Conflict_Returns409` | integration | `CustomWebApplicationFactory` | stale RowVersion | HTTP 409 | RED: 200 / GREEN: 409 | n/a |',
    ].join('\n');
    const { rows } = parseTestCaseTable(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].case).toBe('BR005_Conflict_Returns409');
    expect(rows[0].redGreen).toBe('RED: 200 / GREEN: 409');
    expect(rows[0].defects).toEqual([]);
    expect('notes' in rows[0]).toBe(false);
  });

  it('BR010_DuplicateCaseAcrossTwoTables_DedupedOnce', () => {
    const phaseTable = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      '| `BR001_DiscountAbove50_ReturnsValidationError` | BR-001 | unit | `N/A — pure function` | 51 | error | RED: 200 / GREEN: 422 |',
    ].join('\n');
    const summaryTable = [
      '| Case | 驗收清單對映 |',
      '|------|-------------|',
      '| `BR001_DiscountAbove50_ReturnsValidationError` | 第 2 項 |',
    ].join('\n');
    const { rows, tableCount } = parseTestCaseTable(`${phaseTable}\n\n${summaryTable}`);
    expect(rows).toHaveLength(1);
    expect(tableCount).toBe(2);
  });
});

// bwu-3 code-review — two cell-level parsing defects found by running the new §6
// reconciliation against this very card's own table (row 1 came back with
// input/expected/redGreen = "表頭 `\" / "BR \" / "Case \", row 42's Expected as
// ":59` 仍為 `Coverage ≥ 70%"). Both corrupt the four columns §0.4.2 tells dev to
// copy verbatim, so both are locked here.
describe('parseTestCaseTable — cell integrity (bwu-3 CR)', () => {
  it('BR010_EscapedPipeInCell_DoesNotShiftColumns', () => {
    const t = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      '| `BR010_A_B` | BR-010 | unit | `N/A — pure function` | 表頭 `\\| BR \\| Case \\|` + 1 資料列 | rows[0].case 正確 | RED: 位置式解析 / GREEN: 依表頭名 |',
    ].join('\n');
    const [row] = parseTestCaseTable(t).rows;
    expect(row.input).toBe('表頭 `| BR | Case |` + 1 資料列');
    expect(row.expected).toBe('rows[0].case 正確');
    expect(row.redGreen).toBe('RED: 位置式解析 / GREEN: 依表頭名');
    expect(row.defects).toEqual([]); // the shift previously faked a redgreen-vague defect
  });

  it('BR010_CellWithTwoCodeSpans_KeepsInnerBackticksIntact', () => {
    const t = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      '| `BR010_C_D` | BR-010 | unit | `createTestDb` + `seedStories` | x | `step-06.md:59` 仍為 `70%` | RED: 改 80% / GREEN: 70% 保留 |',
    ].join('\n');
    const [row] = parseTestCaseTable(t).rows;
    expect(row.expected).toBe('`step-06.md:59` 仍為 `70%`');
    expect(row.fixture).toBe('`createTestDb` + `seedStories`');
    // Single-span cells still unwrap, so BR-003's byte-identical case name holds.
    expect(row.case).toBe('BR010_C_D');
  });
});

describe('parseTestCaseTable — never throws (BR-011)', () => {
  it('BR011_NullEmptyAndProseInput_ReturnsEmptyRowsNoThrow', () => {
    for (const input of [null, undefined, '', '純散文'.repeat(200)]) {
      expect(() => parseTestCaseTable(input)).not.toThrow();
      expect(parseTestCaseTable(input).rows).toEqual([]);
    }
  });
});

describe('parseTestCaseTable — defects closed set (BR-012)', () => {
  const row = (cells) => [
    '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
    '|------|----|-------|---------|-------|----------|-----------|',
    `| ${cells.join(' | ')} |`,
  ].join('\n');

  it('BR012_LevelNotInEnum_ReportsLevelEnumDefect', () => {
    const t = row(['`BR001_A_B`', 'BR-001', '後端測試', '`N/A — pure function`', 'x', 'y', 'RED: 1 / GREEN: 2']);
    expect(parseTestCaseTable(t).rows[0].defects).toEqual(['level-enum']);
  });

  it('BR012_EmptyFixtureCell_ReportsFixtureUnnamedDefect', () => {
    const t = row(['`BR001_A_B`', 'BR-001', 'unit', ' ', 'x', 'y', 'RED: 1 / GREEN: 2']);
    expect(parseTestCaseTable(t).rows[0].defects).toContain('fixture-unnamed');
  });

  it('BR012_VagueRedGreenCell_ReportsRedgreenVagueDefect', () => {
    const t = row(['`BR001_A_B`', 'BR-001', 'unit', '`N/A — pure function`', 'x', 'y', '會通過']);
    expect(parseTestCaseTable(t).rows[0].defects).toContain('redgreen-vague');
  });

  it('BR012_MissingFixtureHeader_ReportsMissingColumnDefectOnEveryRow', () => {
    const t = [
      '| Case | BR | Level | Input | Expected | RED→GREEN |',
      '|------|----|-------|-------|----------|-----------|',
      '| `BR001_A_B` | BR-001 | unit | x1 | y1 | RED: 1 / GREEN: 2 |',
      '| `BR002_A_B` | BR-002 | unit | x2 | y2 | RED: 1 / GREEN: 2 |',
      '| `BR003_A_B` | BR-003 | unit | x3 | y3 | RED: 1 / GREEN: 2 |',
    ].join('\n');
    const { rows } = parseTestCaseTable(t);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.defects).toContain('missing-column:Fixture');
  });

  it('BR012_DefectVocabulary_StaysWithinClosedSet', () => {
    const CLOSED_SET = /^(missing-column:.+|level-enum|fixture-unnamed|redgreen-vague|case-name-shape)$/;
    const t = [
      '| Case | BR | Level | Input | Expected | RED→GREEN |', // Fixture header missing
      '|------|----|-------|-------|----------|-----------|',
      '| notacasename | BR-001 | 後端測試 | x | y | 會通過 |',
    ].join('\n');
    const { rows } = parseTestCaseTable(t);
    expect(rows[0].defects.length).toBeGreaterThan(1);
    for (const d of rows[0].defects) expect(d).toMatch(CLOSED_SET);
  });
});

describe('parseTestCaseTable — CRLF/CR/BOM normalization (BR-015)', () => {
  it('BR015_CrlfLoneCrAndBomTable_ParsesIdenticalToLf', () => {
    const lf = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      '| `BR001_A_B` | BR-001 | unit | `N/A — pure function` | x | y | RED: 1 / GREEN: 2 |',
    ].join('\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    const cr = lf.replace(/\n/g, '\r');
    const bom = '﻿' + lf;
    const base = parseTestCaseTable(lf).rows;
    expect(base).toHaveLength(1);
    expect(parseTestCaseTable(crlf).rows).toEqual(base);
    expect(parseTestCaseTable(cr).rows).toEqual(base);
    expect(parseTestCaseTable(bom).rows).toEqual(base);
  });
});

describe('parseTestCaseTable — D7 contract isolation (BR-016)', () => {
  it('BR016_ExistingD7ContractUnchanged_SixKeysAndIssueStrings', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: AC });
    expect(Object.keys(r).sort()).toEqual(
      ['caseCount', 'citedBrCount', 'issues', 'skipReason', 'skipped', 'uncoveredBrIds'].sort(),
    );
    // The second half of this case's name ("AndIssueStrings"), unasserted until
    // bwu-3's own code-review: D7's report lines quote these verbatim, so a reworded
    // issue silently shifts 470 existing cards' gate output.
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: 'x'.repeat(600) }).issues)
      .toContain('無具名測試案例表(找不到 markdown 表格)');
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: '| a | b |\n|---|---|\n| 1 | 2 |' }).issues)
      .toContain('有表但無 `{BR_ID}_{Scenario}_{Expected}` 案例名(或無表)');
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: '`[Verifies: BR-999]`' }).issues)
      .toContain('AC 引用 BR 未覆蓋: BR999');
  });

  // Characterization lock: this file's pre-existing 26 assertions are not edited by this
  // addition (git diff on their bodies is the real proof, run at DoD time) — this test only
  // re-pins the one input/output pair every one of them ultimately depends on, D7's own fixture.
  it('BR016_Existing26Assertions_PassUnedited', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: AC });
    expect(r).toEqual({
      skipped: false,
      skipReason: null,
      issues: [],
      caseCount: 2,
      citedBrCount: 2,
      uncoveredBrIds: [],
    });
  });
});

// bwu-8-gate-regex-and-audit-heuristics AC1/AC2/AC6 — identifier-shaped BR id
// predicate (replacing the all-numeric-only NUMERIC_BR), vacuous-coverage
// fail-loud, and a narrow-detection regression pin. See dev_notes for the
// full-repo measurement backing the shape choice (313 zero-coverage cards,
// 241 recovered, 0 regressions).
const mkAc = (tokens) => `\`[Verifies: ${tokens.join(', ')}]\``;

describe('BR-001/BR-004 — identifier-shaped BR id predicate', () => {
  it('BR001_IdentifierShapedTokens_AllAccepted', () => {
    // Checked one token per AC field rather than combined into one [Verifies:]
    // list: "BR-001" and "BR001" both normalize (stripSeparators) to the same
    // id, so a combined check would report 5 distinct ids, not "6 accepted" —
    // an artifact of the Set dedup this test isn't about. Per-token isolation
    // is what "六者全數計入 citedBrIds" actually asks: none of the six is
    // skipped by the predicate.
    const tokens = ['BR-001', 'BR001', 'BR-G01', 'BR-PREVIEW-01', 'BR-CCG-L5-01', 'BR-CC-E-D2'];
    const counts = tokens.map(
      (t) => checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: mkAc([t]) }).citedBrCount,
    );
    expect(counts).toEqual([1, 1, 1, 1, 1, 1]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('BR001_NonBrShapedTokens_AllRejected', () => {
    const tokens = ['SDD §4.3.3', 'F-NT-02', 'BR-A01~A12', 'BR-G18 / WHP7-E02'];
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: mkAc(tokens) });
    expect(r.citedBrCount).toBe(0);
  });

  it('BR004_PreCardAcceptedTokens_StillAccepted', () => {
    // Per-token, same reason as BR001 above (BR-001/BR001 collide under
    // stripSeparators) — "新舊述詞對每個 token 判定一致" is a per-token claim.
    const tokens = ['BR-001', 'BR001', 'BR-101', 'br-25'];
    for (const t of tokens) {
      const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: mkAc([t]) });
      expect(r.citedBrCount).toBe(1);
    }
  });
});

describe('BR-002 — placeholder final-segment guard', () => {
  it('BR002_PlaceholderFinalSegment_Rejected', () => {
    const placeholders = mkAc(['BR-00N', 'BR-XXX', 'BR-MNAV-XX', 'BR-FP-0X']);
    const rejected = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: placeholders });
    expect(rejected.citedBrCount).toBe(0);

    const control = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: mkAc(['BR-101']) });
    expect(control.citedBrCount).toBe(1);
  });
});

describe('BR-003 — whp-7 live fixture (30 tokens, 24 identifier-shaped)', () => {
  // Verbatim [Verifies:] markers from whp-7-guardian-daemon's live acceptance_criteria
  // field (mcp__phycool-context__search_stories, 2026-08-01) — 12 markers, 30 tokens
  // total. 24 are the pure BR-Gxx series; the other 6 are 2 compound "BR-Gxx / WHP7-Exx"
  // tokens (this describe block's second case) plus 4 non-BR tokens (E03/E04/SDD refs)
  // that were never in scope for this predicate.
  const WHP7_AC = [
    '`[Verifies: BR-G01, BR-G02]`',
    '`[Verifies: BR-G18 / WHP7-E02]`',
    '`[Verifies: BR-G03, BR-G04, BR-G05, BR-G06]`',
    '`[Verifies: BR-G07, BR-G08, BR-G13]`',
    '`[Verifies: BR-G09, BR-G10, BR-G11]`',
    '`[Verifies: BR-G14, BR-G15, BR-G16]`',
    '`[Verifies: BR-G12, BR-G22, BR-G23, BR-G24]`',
    '`[Verifies: BR-G17, BR-G20, BR-G25]`',
    '`[Verifies: BR-G19 / WHP7-E01, E03, E04]`',
    '`[Verifies: BR-G21]`',
    '`[Verifies: BR-G26, SDD §4.3.3]`',
    '`[Verifies: SDD §8 + 中控 pipeline_notes 護欄]`',
  ].join('\n\n');

  it('BR003_Whp7GuardianBrGSeries_CitedCountIs24', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: WHP7_AC });
    expect(r.citedBrCount).toBe(24);
  });

  it('BR003_CompoundTokenWithTrailingProse_StaysRejected', () => {
    // Isolated from the full 30-token fixture: with ONLY these two present,
    // citedBrCount must be 0 — proving whp-7's 24 (not 26) comes from rejecting
    // both compound tokens, not from some other token absorbing them.
    const compoundOnly = '`[Verifies: BR-G18 / WHP7-E02]`\n\n`[Verifies: BR-G19 / WHP7-E01]`';
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: compoundOnly });
    expect(r.citedBrCount).toBe(0);
  });
});

describe('BR-005/BR-006 — vacuous coverage fail-loud (AC2)', () => {
  it('BR005_ValidTableZeroCitedBr_ReportsVacuousIssue', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: 'no markers' });
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain('AC 引用 0 個有效 BR id');
  });

  it('BR005_EmptyTestingStrategy_NoDuplicateVacuousIssue', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: '', acceptance_criteria: 'no markers' });
    expect(r.issues).toHaveLength(2);
    expect(r.issues.some((i) => i.includes('AC 引用 0 個有效 BR id'))).toBe(false);
  });

  it('BR005_SComplexity_SkippedBeforeVacuousCheck', () => {
    const r = checkTestingStrategyStructure({ complexity: 'S', testing_strategy: '散文', acceptance_criteria: 'no markers' });
    expect(r.skipped).toBe(true);
    expect(r.issues).toEqual([]);
  });
});

describe('parseTestCaseTable — fixture-unnamed stays narrow (BR-016, AC6)', () => {
  const row = (cells) =>
    [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      `| ${cells.join(' | ')} |`,
    ].join('\n');

  it('BR016_FixtureUnnamedSemantics_UnchangedForAllExistingCases', () => {
    const levelDefect = row(['`BR001_A_B`', 'BR-001', '後端測試', '`N/A — pure function`', 'x', 'y', 'RED: 1 / GREEN: 2']);
    const fixtureDefect = row(['`BR001_A_B`', 'BR-001', 'unit', ' ', 'x', 'y', 'RED: 1 / GREEN: 2']);
    const redgreenDefect = row(['`BR001_A_B`', 'BR-001', 'unit', '`N/A — pure function`', 'x', 'y', '會通過']);
    const clean = row(['`BR001_A_B`', 'BR-001', 'unit', '`N/A — pure function`', 'x', 'y', 'RED: 1 / GREEN: 2']);

    expect(parseTestCaseTable(levelDefect).rows[0].defects).toEqual(['level-enum']);
    expect(parseTestCaseTable(fixtureDefect).rows[0].defects).toContain('fixture-unnamed');
    expect(parseTestCaseTable(redgreenDefect).rows[0].defects).toContain('redgreen-vague');
    // The exact regression this AC guards against: widening fixture-unnamed
    // detection to catch merely-terse values would flag the pervasive
    // "N/A — pure function" fixture (79 occurrences, AC6 re-measurement) itself.
    expect(parseTestCaseTable(clean).rows[0].defects).toEqual([]);
  });
});

describe('BR-018 — six-key contract + issue strings unchanged post-AC1/AC2 (bwu-8)', () => {
  it('BR018_ExistingContractUnchanged_SixKeysAndIssueStrings', () => {
    const r = checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: AC });
    expect(Object.keys(r).sort()).toEqual(
      ['caseCount', 'citedBrCount', 'issues', 'skipReason', 'skipped', 'uncoveredBrIds'].sort(),
    );
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: 'x'.repeat(600) }).issues)
      .toContain('無具名測試案例表(找不到 markdown 表格)');
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: '| a | b |\n|---|---|\n| 1 | 2 |' }).issues)
      .toContain('有表但無 `{BR_ID}_{Scenario}_{Expected}` 案例名(或無表)');
    expect(checkTestingStrategyStructure({ complexity: 'M', testing_strategy: TABLE, acceptance_criteria: '`[Verifies: BR-999]`' }).issues)
      .toContain('AC 引用 BR 未覆蓋: BR999');
  });
});
