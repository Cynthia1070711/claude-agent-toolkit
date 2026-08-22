// test-spec-audit.test.js — bwu-3-dev-consume-review-audit T2.2 (BR-001/002/013/014)
//
// Isolated temp DB only (createTestDb) — never connects phycool.db, per the same
// pattern as upsert-worker-run.test.js / testing-strategy-structure tests.

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execFileSync } from 'child_process';
import { createTestDb, seedStories } from './helpers/test-db.js';
import {
  runAudit,
  pickTestHitLine,
  looksLikeTestPath,
  hasExactCaseName,
  formatDevAdvisory,
} from '../scripts/test-spec-audit.js';

// bwu-13-bmad-mechanism-gap-closure BR-006 — wraps (not replaces) the real
// execFileSync so every pre-existing git-grep-based test below keeps its real
// behaviour; only the BR-006 case below inspects the call count.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

const QUALIFYING_TABLE = [
  '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
  '|------|----|-------|---------|-------|----------|-----------|',
  '| `BR001_DiscountAbove50_ReturnsValidationError` | BR-001 | unit | `N/A — pure function` | 51 | error | RED: 200 / GREEN: 422 |',
].join('\n');

const PROSE_2959 = '純散文無表。'.repeat(300); // > 500 chars, no markdown table

let ctx;
afterEach(() => {
  ctx?.cleanup();
  ctx = undefined;
});

describe('verdict classification (BR-001)', () => {
  it('BR001_MComplexityWithQualifyingTable_VerdictConsume', () => {
    ctx = createTestDb();
    seedStories(ctx.db, [{ story_id: 's1', complexity: 'M', testing_strategy: QUALIFYING_TABLE }]);
    const { result } = runAudit('s1', { dbPath: ctx.dbPath, skipGitGrep: true });
    expect(result.verdict).toBe('consume');
  });

  it('BR001_SComplexityAnyStrategy_VerdictSkip', () => {
    ctx = createTestDb();
    seedStories(ctx.db, [{ story_id: 's2', complexity: 'S', testing_strategy: '純散文'.repeat(50) }]);
    const { result } = runAudit('s2', { dbPath: ctx.dbPath, skipGitGrep: true });
    expect(result.verdict).toBe('skip');
    expect(result.skipReason).toBe('S complexity');
  });

  it('BR001_MComplexityProseOnly_VerdictFallback', () => {
    ctx = createTestDb();
    seedStories(ctx.db, [{ story_id: 's3', complexity: 'M', testing_strategy: PROSE_2959 }]);
    const { result } = runAudit('s3', { dbPath: ctx.dbPath, skipGitGrep: true });
    expect(result.verdict).toBe('fallback');
  });
});

describe('verdict derivation source (BR-002)', () => {
  it('BR002_VerdictDerivedFromD7Function_NotReimplemented', () => {
    ctx = createTestDb();
    // structural issues present (no table) but complexity M — must NOT be consume
    seedStories(ctx.db, [{ story_id: 's4', complexity: 'M', testing_strategy: 'x'.repeat(600) }]);
    const { result } = runAudit('s4', { dbPath: ctx.dbPath, skipGitGrep: true });
    expect(result.structuralIssues.length).toBeGreaterThan(0);
    expect(result.verdict).not.toBe('consume');
  });
});

describe('audit CLI output shape (BR-013)', () => {
  it('BR013_JsonOutput_ContainsAllSixTopLevelKeys', () => {
    ctx = createTestDb();
    seedStories(ctx.db, [{ story_id: 's5', complexity: 'M', testing_strategy: QUALIFYING_TABLE }]);
    const { result } = runAudit('s5', { dbPath: ctx.dbPath, skipGitGrep: true });
    expect(Object.keys(result).sort()).toEqual(
      ['storyId', 'complexity', 'verdict', 'skipReason', 'structuralIssues', 'rows'].sort(),
    );
    expect(result.rows[0]).toHaveProperty('defects');
    expect(result.rows[0]).toHaveProperty('testHit');
  });

  it('BR013_CaseNameNotInRepo_TestHitNullNotError', () => {
    ctx = createTestDb();
    // Built at runtime, not written as a literal — git grep --untracked (added below
    // for the newly-authored-test scenario) would otherwise find this very fixture
    // string inside this very file and report a false hit on itself.
    const neverWritten = ['BR999', 'DoesNotExist', 'Anywhere' + Date.now()].join('_');
    const t = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      `| \`${neverWritten}\` | BR-999 | unit | \`N/A — pure function\` | x | y | RED: 1 / GREEN: 2 |`,
    ].join('\n');
    seedStories(ctx.db, [{ story_id: 's6', complexity: 'M', testing_strategy: t }]);
    const { result, exitCode } = runAudit('s6', { dbPath: ctx.dbPath }); // real git grep, no skip
    expect(exitCode).toBe(0);
    expect(result.rows[0].testHit).toBeNull();
  });

  it('BR013_MissingStoryId_ExitsOne', () => {
    ctx = createTestDb();
    expect(runAudit(undefined, { dbPath: ctx.dbPath }).exitCode).toBe(1);
    expect(runAudit('does-not-exist', { dbPath: ctx.dbPath }).exitCode).toBe(1);
  });
});

describe('read-only guarantee (BR-014)', () => {
  it('BR014_AuditRun_LeavesStoryRowUntouched', () => {
    ctx = createTestDb();
    seedStories(ctx.db, [{ story_id: 's7', complexity: 'M', testing_strategy: QUALIFYING_TABLE, updated_at: '2026-01-01T00:00:00+08:00' }]);
    runAudit('s7', { dbPath: ctx.dbPath, skipGitGrep: true });
    const after = ctx.db.prepare('SELECT updated_at FROM stories WHERE story_id = ?').get('s7');
    expect(after.updated_at).toBe('2026-01-01T00:00:00+08:00');
  });
});

// bwu-8-gate-regex-and-audit-heuristics AC5 (BR-014/BR-015) — resolveTestHit now
// prefers a test-shaped git-grep hit over an incidental doc hit sharing the same
// case-name substring, instead of blindly taking the first line.
describe('resolveTestHit — prefers a test-shaped hit over a doc hit (BR-014)', () => {
  it('BR014_DocHitBeforeTestHit_ReturnsTestPath', () => {
    ctx = createTestDb();
    // Natural negative control (no fixture had to be fabricated): this exact
    // case name is already cited, undecorated, by naming-organization-sdd.md —
    // a real repo file git grep hits alphabetically before this test file.
    const t = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      '| `BR001_DiscountAbove50_ReturnsValidationError` | BR-001 | unit | `N/A — pure function` | 51 | error | RED: 200 / GREEN: 422 |',
    ].join('\n');
    seedStories(ctx.db, [{ story_id: 's8', complexity: 'M', testing_strategy: t }]);
    const { result } = runAudit('s8', { dbPath: ctx.dbPath }); // real git grep, no skip
    // The line number is resolved from this file, not hard-coded. AC5 quotes
    // `:13` — that was true when written, but it is this file's own layout, so
    // hard-coding it turns any edit above QUALIFYING_TABLE into a failure of an
    // assertion that is really about the PATH (a test file, not the .md that git
    // grep returns first). findIndex takes the first occurrence, which is exactly
    // what git grep returns first within this file, so the two stay in lockstep.
    // The needle is concatenated so this very line cannot be the first match.
    const selfLines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    const expectedLine = selfLines.findIndex((l) => l.includes('BR001_DiscountAbove50' + '_ReturnsValidationError')) + 1;
    expect(expectedLine).toBeGreaterThan(0); // fixture must still exist in this file
    expect(result.rows[0].testHit).toBe(`.context-db/tests/test-spec-audit.test.js:${expectedLine}`);
  });

  it('BR014_NoMatches_ReturnsNull', () => {
    ctx = createTestDb();
    const neverWritten = ['BR999', 'AlsoDoesNotExist', 'Nowhere' + Date.now()].join('_');
    const t = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      `| \`${neverWritten}\` | BR-999 | unit | \`N/A — pure function\` | x | y | RED: 1 / GREEN: 2 |`,
    ].join('\n');
    seedStories(ctx.db, [{ story_id: 's9', complexity: 'M', testing_strategy: t }]);
    const { result, exitCode } = runAudit('s9', { dbPath: ctx.dbPath });
    expect(exitCode).toBe(0);
    expect(result.rows[0].testHit).toBeNull();
  });
});

describe('pickTestHitLine — falls back to the first line when nothing test-shaped (BR-014)', () => {
  it('BR014_OnlyNonTestPaths_FallsBackToFirstLine', () => {
    const output = ['docs/a.md:10:some text', 'docs/b.md:20:more text', 'docs/c.md:30:even more'].join('\n');
    expect(pickTestHitLine(output)).toBe('docs/a.md:10');
  });
});

describe('looksLikeTestPath — recognises four test-file conventions (BR-015)', () => {
  it('BR015_TestPathShapes_AllRecognised', () => {
    const paths = [
      '.context-db/tests/x.test.js',
      'scripts/__tests__/x.js',
      'src/YourApp/Web.Tests/FooTests.cs',
      'e2e/x.spec.ts',
    ];
    for (const p of paths) expect(looksLikeTestPath(p)).toBe(true);
  });

  it('BR015_DockerComposeTestYml_NotRecognised', () => {
    const paths = [
      'docker-compose.test.yml',
      '.claude/skills/phycool-testing-patterns/references/naming-organization-sdd.md',
    ];
    for (const p of paths) expect(looksLikeTestPath(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bwu-13-bmad-mechanism-gap-closure — Task 1 (AC1 · BR-001..BR-007, BR-020)
//
// dev端機械回饋: --dev-advisory mode. hasExactCaseName() upgrades the axis-(a)
// judgement from git-grep -F substring matching (testHit, unchanged — BR-007)
// to whole-word matching, feeding a NEW stderr-only advisory channel that
// never alters stdout/exit code (BR-002/003) or the covered/pending trace
// classification (BR-007).
// ---------------------------------------------------------------------------

describe('dev advisory — CLI integration (BR-001/002/003/007)', () => {
  const CLI = path.join(process.cwd(), 'scripts', 'test-spec-audit.js');
  const TRACE_CLI = path.join(process.cwd(), 'scripts', 'upsert-test-trace.js');
  const TARGET_STORY = 'ccb-4-ctrl-notify-knock';

  // git grep --untracked over this repo's full untracked-file enumeration costs
  // ~30-40s PER invocation (41 rows × one execFileSync each). BR-001/002/003/007
  // used to each spawn their own 1-2 CLI subprocesses independently (7 calls
  // total, ~258s), routinely exceeding a per-test timeout. Sharing exactly the
  // 4 distinct invocations this block actually needs — plain / --json /
  // --dev-advisory / upsert-test-trace --dry-run — across one beforeAll cuts
  // that to 4 and lets every `it` below assert against the same oracle.
  let jsonOut, advisoryRes, plainRes, traceOut;

  beforeAll(() => {
    const jsonRes = spawnSync('node', [CLI, TARGET_STORY, '--json'], { encoding: 'utf8' });
    jsonOut = JSON.parse(jsonRes.stdout);
    advisoryRes = spawnSync('node', [CLI, TARGET_STORY, '--dev-advisory'], { encoding: 'utf8' });
    plainRes = spawnSync('node', [CLI, TARGET_STORY], { encoding: 'utf8' });
    const traceRes = spawnSync('node', [TRACE_CLI, '--story', TARGET_STORY, '--dry-run'], { encoding: 'utf8' });
    traceOut = JSON.parse(traceRes.stdout);
  }, 300000);

  // [dev-story 實查校正 2026-08-04] AC1 predicted this live target would show
  // exactly 18/41 unmatched. Empirically it now shows 0/41: ccb-4's own CR
  // report (docs/implementation-artifacts/reviews/epic-ccb/ccb-4-...-report.md
  // §3.8) AND this story's own SDD spec both quote every canonical case name
  // verbatim as illustration — including the drifted ones, as their "expected"
  // column — so whole-repo git grep now finds a literal, whole-word match for
  // every row regardless of whether the real test method was ever renamed to
  // match. This is a *broader* instance of the already-known, already-out-of-
  // scope TD-TESTSPEC-TESTHIT-DOC-MENTION-SATISFIES-AXIS-A (that debt covers
  // rows with no test at all; this also swallows rows that DO have a test,
  // just under the drifted name) — self-referential by nature: documenting
  // which names drifted necessarily cites the correct names, which then
  // satisfies the very git-grep check this feature performs. Not a defect in
  // hasExactCaseName (dev_notes' own known-limitations section already forbids
  // narrowing its search scope to "fix" this — that would silently loosen the
  // orthogonal, explicitly out-of-scope debt). The --json output's own
  // exactNameHit field is therefore used as the live oracle below instead of
  // the stale hardcoded count, keeping this a real CLI-subprocess/real-git-grep
  // test (per the fixture) that stays meaningful as repo content keeps
  // changing. Flagged for CR per dev_notes "已知限制" §'s own instruction
  // (must be named in the CR report, never silently absorbed).
  //
  // [code-review F2 2026-08-04] The live-oracle rewrite above is honest about
  // the count, but it derives that count with the SAME predicate the CLI itself
  // filters on (`!r.exactNameHit` → now `=== false`), so the count assertion is
  // tautological — exactly the WORKFLOW-CONTRACT-ASSERTION FORBIDDEN clause
  // "收集迴圈先用斷言的同一個述詞過濾,再對過濾結果下該斷言" (bwu-7 F14, same
  // pattern). It is retained as a CHANNEL/FORMAT smoke over the live target
  // (stdout↔stderr separation and per-row rendering shape are still genuinely
  // exercised), NOT as the guarantee that the advisory can ever list anything.
  // That guarantee now lives in the two deterministic cases at the bottom of
  // this file, whose inputs are fully controlled by the test and therefore know
  // the expected answer a priori.
  it('BR001_DevAdvisoryOnConsumeStory_ListsEighteenRowsToStderr', () => {
    const expectedUnmatched = jsonOut.rows.filter((r) => !r.exactNameHit);
    const caseLines = advisoryRes.stderr.match(/^ {2}\[\d+\]/gm) || [];
    expect(caseLines.length).toBe(expectedUnmatched.length);
    if (expectedUnmatched.length === 0) {
      expect(advisoryRes.stderr).toBe('');
    } else {
      expect(advisoryRes.stderr).toContain(
        `⚠ 測試案例名漂移 advisory — ${expectedUnmatched.length}/${jsonOut.rows.length} 列查無 byte-identical 測試方法名`,
      );
      for (const r of expectedUnmatched) {
        expect(advisoryRes.stderr).toContain(`  [${r.rowIndex}] ${r.br}  ${r.case}`);
      }
    }
  });

  it('BR002_DevAdvisoryFlag_LeavesStdoutByteIdentical', () => {
    expect(advisoryRes.stdout).toBe(plainRes.stdout);
  });

  // [code-review F5 2026-08-04] With the live target now at 0/41 unmatched, the
  // advisory never prints here, so "the advisory fired AND the process still
  // exited 0" — the actual thing BR-003 exists to guard (never BLOCK) — is not
  // exercised by this case: a hypothetical `process.exit(1) on drift`
  // implementation would also exit 0 on a zero-drift target, i.e. the RED side
  // is unreachable. Kept as the zero-drift half of the pair; the non-empty half
  // is BR003_AdvisoryOnSeededDriftStory_PrintsToStderrAndStillExitsZero below.
  it('BR003_DevAdvisoryWithEighteenUnmatchedRows_ExitsZero', () => {
    expect(advisoryRes.status).toBe(0);
  });

  // [dev-story 實查校正 2026-08-04] Same live-target caveat as BR-001 above —
  // ccb-4's covered/pending split is no longer 24/17 in the current repo (see
  // that comment for the root cause). What BR-007 actually guards — testHit's
  // OWN semantics staying untouched by the new exactNameHit field, i.e.
  // toTraceRow() reading only row.testHit — is verified here against the audit
  // JSON's own testHit field (never exactNameHit) as the live oracle, so the
  // assertion still fails if exactNameHit ever leaks into the covered/pending
  // classification, independent of which absolute numbers today's repo state
  // produces.
  // [code-review F4 2026-08-04] The three count assertions below share the
  // `r.testHit` predicate with toTraceRow() itself, so on their own they are as
  // tautological as BR-001's. The `test_file` assertion added at the end is what
  // makes this case actually load-bearing: toTraceRow derives `test_file` by
  // slicing the path out of `testHit` (upsert-test-trace.js:24-33), a projection
  // that `exactNameHit` — a boolean — structurally cannot produce. Swap the
  // writer over to exactNameHit and every `test_file` collapses to the
  // NOT_FOUND placeholder, turning this red. (The strongest evidence for BR-007
  // remains external to any test: upsert-test-trace.js is byte-unchanged in this
  // story's commit.)
  it('BR007_TraceStatusCounts_UnchangedAfterUpgrade', () => {
    const expectedCovered = jsonOut.rows.filter((r) => r.testHit).length;
    const expectedPending = jsonOut.rows.filter((r) => !r.testHit).length;
    expect(traceOut.filter((r) => r.status === 'covered').length).toBe(expectedCovered);
    expect(traceOut.filter((r) => r.status === 'pending').length).toBe(expectedPending);
    expect(traceOut.length).toBe(jsonOut.rows.length);

    const covered = jsonOut.rows.filter((r) => r.testHit);
    expect(covered.length).toBeGreaterThan(0); // non-empty precondition
    for (const row of covered) {
      const trace = traceOut.find((t) => t.test_name === row.case);
      expect(trace.test_file).toBe(row.testHit.slice(0, row.testHit.lastIndexOf(':')));
    }
  });
});

describe('formatDevAdvisory — fallback verdict emits nothing (BR-004)', () => {
  it('BR004_FallbackVerdict_EmitsZeroAdvisoryLines', () => {
    expect(formatDevAdvisory({ verdict: 'fallback', rows: [] })).toBe('');
  });
});

describe('hasExactCaseName — whole-word boundary (BR-005)', () => {
  it('BR005_CaseNameIsProperPrefixOfLongerMethod_JudgedUnmatched', () => {
    const line = "a.test.js:139:  it('BR032_LivenessFail_SkipsWithExactlyOneAuditLineAndZeroInjection', () => {";
    expect(hasExactCaseName(line, 'BR032_LivenessFail_SkipsWithExactlyOneAuditLine')).toBe(false);
  });

  it('BR005_CaseNamePrecededByIdentifierChar_JudgedUnmatched', () => {
    const line = "a.test.js:12:  it('Pre_BR005_NullConsolePid_KnockRefusesWithCode', () => {";
    expect(hasExactCaseName(line, 'BR005_NullConsolePid_KnockRefusesWithCode')).toBe(false);
  });
});

describe('hasExactCaseName — regex metacharacters matched literally (BR-020)', () => {
  it('BR020_CaseNameWithRegexMetachar_MatchedLiterallyWithoutThrow', () => {
    const caseName = 'BR001_A.B_C(x)';
    const literalLine = "a.test.js:1:  it('BR001_A.B_C(x)', () => {";
    const decoyLine = "a.test.js:2:  it('BR001_AxB_Cyx', () => {";
    expect(() => hasExactCaseName(literalLine, caseName)).not.toThrow();
    expect(hasExactCaseName(literalLine, caseName)).toBe(true);
    expect(hasExactCaseName(decoyLine, caseName)).toBe(false);
  });
});

describe('single grep call reuse (BR-006)', () => {
  it('BR006_AdvisoryReusesSingleGrepCall_NoExtraSubprocess', () => {
    execFileSync.mockClear();
    ctx = createTestDb();
    const names = [1, 2, 3].map((n) => ['BR006', `NeverWritten${n}`, `Case${Date.now()}${n}`].join('_'));
    const t = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      ...names.map((n) => `| \`${n}\` | BR-006 | unit | \`N/A — pure function\` | x | y | RED: 1 / GREEN: 2 |`),
    ].join('\n');
    seedStories(ctx.db, [{ story_id: 's10', complexity: 'M', testing_strategy: t }]);
    runAudit('s10', { dbPath: ctx.dbPath }); // real git grep, no skipGitGrep
    expect(execFileSync).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// [code-review 2026-08-04] Deterministic advisory coverage (F1 / F5 / F6)
//
// Every pre-existing assertion about the advisory runs against ccb-4, whose
// unmatched count has degenerated to 0/41 (self-referential doc pollution — see
// the BR-001 block above). The consequence was that formatDevAdvisory's ONLY
// meaningful path — actually rendering drifted rows — had zero coverage: BR-004
// asserts the empty path, BR-001/BR-003 take their zero-branch. These cases fix
// that with inputs the test fully controls, so the expected output is known a
// priori rather than re-derived from the implementation's own predicate.
//
// Case names are composed at runtime (same technique as BR-006 above) so the
// literal never appears whole in any file — otherwise writing this test would
// itself create the git-grep hit that makes the drift disappear, reproducing the
// very trap that degenerated the ccb-4 target.
// ---------------------------------------------------------------------------

describe('formatDevAdvisory — non-empty rendering (BR-001/BR-004)', () => {
  const row = (rowIndex, br, caseName, exactNameHit) => ({ rowIndex, br, case: caseName, exactNameHit });

  it('BR001_UnmatchedRowsPresent_RendersSummaryRowLinesAndDisposition', () => {
    const out = formatDevAdvisory({
      verdict: 'consume',
      rows: [
        row(1, 'BR-001', 'CaseAlpha', true),
        row(2, 'BR-002', 'CaseBeta', false),
        row(3, 'BR-003', 'CaseGamma', false),
      ],
    });
    expect(out.split('\n')).toEqual([
      '⚠ 測試案例名漂移 advisory — 2/3 列查無 byte-identical 測試方法名',
      '  [2] BR-002  CaseBeta',
      '  [3] BR-003  CaseGamma',
      '處置(擇一,禁靜默忽略):改測試方法名以與上表逐字相同,或於 dev_notes 具名記錄刻意分歧的理由',
    ]);
  });

  // Guards the three-valued contract stated in runAudit: null = NOT measured
  // (skipGitGrep), which must not be reported as drift. A bare `!exactNameHit`
  // renders both rows here and turns this red.
  it('BR004_ExactNameHitNull_TreatedAsNotMeasuredAndOmitted', () => {
    const out = formatDevAdvisory({
      verdict: 'consume',
      rows: [row(1, 'BR-001', 'CaseAlpha', null), row(2, 'BR-002', 'CaseBeta', null)],
    });
    expect(out).toBe('');
  });
});

describe('dev advisory — non-empty CLI path still exits zero (BR-003)', () => {
  it('BR003_AdvisoryOnSeededDriftStory_PrintsToStderrAndStillExitsZero', () => {
    const CLI = path.join(process.cwd(), 'scripts', 'test-spec-audit.js');
    ctx = createTestDb();
    // BR-prefixed shape is mandatory: checkTestingStrategyStructure rejects a
    // table whose Case cells do not match {BR_ID}_{Scenario}_{Expected} and the
    // verdict degrades to `fallback`, which would make this case vacuous.
    const names = [1, 2].map((n) => ['BR003', 'DriftProbe' + n, 'NeverWrittenAnywhere' + n].join('_'));
    const table = [
      '| Case | BR | Level | Fixture | Input | Expected | RED→GREEN |',
      '|------|----|-------|---------|-------|----------|-----------|',
      ...names.map((n) => `| \`${n}\` | BR-003 | unit | \`N/A — pure function\` | x | y | RED: 1 / GREEN: 2 |`),
    ].join('\n');
    seedStories(ctx.db, [{ story_id: 'drift1', complexity: 'M', testing_strategy: table }]);

    const withFlag = spawnSync('node', [CLI, 'drift1', '--dev-advisory', '--db', ctx.dbPath], { encoding: 'utf8' });
    const withoutFlag = spawnSync('node', [CLI, 'drift1', '--db', ctx.dbPath], { encoding: 'utf8' });

    // The advisory fired ...
    expect(withFlag.stderr).toContain('⚠ 測試案例名漂移 advisory — 2/2 列查無 byte-identical 測試方法名');
    names.forEach((n, i) => expect(withFlag.stderr).toContain(`  [${i + 1}] BR-003  ${n}`));
    expect(withFlag.stderr).toContain('禁靜默忽略');
    // ... and the process still exited 0 (BR-003's actual guarantee: never BLOCK).
    expect(withFlag.status).toBe(0);
    // ... on stderr only (BR-002 on a target where the advisory is non-empty).
    expect(withFlag.stdout).toBe(withoutFlag.stdout);
    expect(withoutFlag.stderr).toBe('');
  }, 120000);
});
