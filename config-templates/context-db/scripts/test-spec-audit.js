// test-spec-audit.js — bwu-3-dev-consume-review-audit T1.4 (BR-001/002/013/014)
//
// Read-only classifier CLI shared by dev-story §0.4, code-review §6, and
// tasks-backfill-verify Step 3/7 — the single point that turns a story's
// testing_strategy into a verdict, so "qualifying table" cannot mean one
// thing at create time (Depth Gate D7) and another at consumption time.
//
// Usage:
//   node .context-db/scripts/test-spec-audit.js <story_id> [--json] [--db <path>]
//   exit 0 — audit completed (any verdict, including fallback; this is a
//            classifier, not a gate)
//   exit 1 — story_id missing from the DB, or no story_id argument
//   exit 3 — internal error (module load / DB open failure)

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { checkTestingStrategyStructure, parseTestCaseTable } from './testing-strategy-structure.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'phycool.db');
const REPO_ROOT = path.join(__dirname, '..', '..');

function openReadonlyDb(dbPath) {
  const db = new Database(dbPath || DEFAULT_DB_PATH, { readonly: true });
  db.pragma('busy_timeout = 5000');
  return db;
}

// bwu-8-gate-regex-and-audit-heuristics AC5 — test-file shape (SDD Spec §4.3.3
// verification command, reused verbatim so the check and its own acceptance
// test can never drift apart). Four conventions this repo actually uses: a
// JS/TS test-file extension, a tests/__tests__ directory segment, a C#
// `*.Tests` project-folder segment, and a C# `*Tests.cs` filename. A doc file
// that merely mentions "testing" in its own path (e.g. a skill reference under
// `phycool-testing-patterns/`) matches none of these — the segment boundaries
// are anchored on `/`, not on substring containment.
const TEST_PATH_SHAPE = /(\.(test|spec)\.[cm]?[jt]sx?$)|((^|\/)(tests?|__tests__)\/)|(\.Tests?\/)|(Tests?\.cs$)/i;

export function looksLikeTestPath(filePath) {
  return TEST_PATH_SHAPE.test(filePath);
}

// Picks the first test-shaped `file:line` out of raw `git grep -n` output,
// falling back to the first line at all when nothing test-shaped is present —
// a case with no test written yet must keep reporting *some* location (its
// spec/doc mention), not regress to null and lose coverage visibility.
export function pickTestHitLine(gitGrepOutput) {
  const parseLine = (line) => {
    const m = line.match(/^([^:]+):(\d+):/);
    return m ? { path: m[1], line: m[2] } : null;
  };
  const lines = gitGrepOutput.split('\n').filter(Boolean).map(parseLine).filter(Boolean);
  if (lines.length === 0) return null;
  const hit = lines.find((l) => looksLikeTestPath(l.path)) || lines[0];
  return `${hit.path}:${hit.line}`;
}

// argv-array execFile, never a concatenated shell string — Case cells are
// story-authored text (SDD Spec §6 Security Considerations). --untracked is
// required: dev authors the test file in the same run this CLI classifies,
// before it is ever `git add`ed, and plain `git grep` only searches tracked
// paths — omitting it would report every freshly-written test as not found.
// bwu-13-bmad-mechanism-gap-closure BR-005/BR-020 — whole-word boundary via two
// fixed-width lookaround assertions, no quantifiers beyond the escaped literal
// itself (same no-backtracking discipline as testing-strategy-structure.js's
// CASE_NAME). Case cells are free-form story-authored text (case-name-shape is
// only a defect *marker*, never a parse gate — testing-strategy-structure.js
// deriveDefects()), so any regex metacharacter must be escaped before it is
// wrapped in a RegExp, or a `.` silently becomes a wildcard and an unbalanced
// `(` throws.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function hasExactCaseName(gitGrepOutput, caseName) {
  if (!gitGrepOutput || !caseName) return false;
  const pattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(caseName)}(?![A-Za-z0-9_])`);
  return gitGrepOutput.split('\n').some((line) => pattern.test(line));
}

// bwu-13-bmad-mechanism-gap-closure BR-006 — single execFileSync call feeds both
// the existing testHit (substring, unchanged behaviour — BR-007) and the new
// exactNameHit (whole-word, advisory-only) axis; no second subprocess.
function resolveTestHit(caseName) {
  if (!caseName) return { hit: null, exactNameHit: null };
  try {
    const out = execFileSync('git', ['grep', '--untracked', '-n', '-F', '--', caseName], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return { hit: pickTestHitLine(out), exactNameHit: hasExactCaseName(out, caseName) };
  } catch {
    // git grep exits 1 on "no matches" — a miss, not an error the CLI should surface.
    return { hit: null, exactNameHit: false };
  }
}

function deriveVerdict(structural, parsedRowCount) {
  if (structural.skipped) return 'skip';
  if (structural.issues.length === 0 && parsedRowCount >= 1) return 'consume';
  return 'fallback';
}

/**
 * @param {string} [storyId]
 * @param {{dbPath?: string, skipGitGrep?: boolean}} [opts] — skipGitGrep is test-only
 *   (avoids spawning a real git process per assertion when testHit isn't under test).
 * @returns {{exitCode: number, result?: object, error?: string}}
 */
export function runAudit(storyId, opts = {}) {
  if (!storyId) {
    return { exitCode: 1, error: 'story_id is required' };
  }
  let db;
  try {
    db = openReadonlyDb(opts.dbPath);
    const story = db
      .prepare('SELECT complexity, testing_strategy, acceptance_criteria FROM stories WHERE story_id = ?')
      .get(storyId);
    if (!story) {
      return { exitCode: 1, error: `story not found in DB: ${storyId}` };
    }

    const structural = checkTestingStrategyStructure(story);
    const { rows: parsedRows } = parseTestCaseTable(story.testing_strategy);
    const verdict = deriveVerdict(structural, parsedRows.length);

    // No half-consumption (SDD Spec §5 boundary table): dev/CR only ever read
    // `rows` when verdict === 'consume', so fallback/skip never expose partial rows.
    // skipGitGrep leaves both fields `null` ("not measured"), distinct from the
    // real-grep miss case below which measures and finds nothing (`false`).
    const rows =
      verdict === 'consume'
        ? parsedRows.map((r) => {
            if (opts.skipGitGrep) return { ...r, testHit: null, exactNameHit: null };
            const { hit, exactNameHit } = resolveTestHit(r.case);
            return { ...r, testHit: hit, exactNameHit };
          })
        : [];

    return {
      exitCode: 0,
      result: {
        storyId,
        complexity: story.complexity || null,
        verdict,
        skipReason: structural.skipReason,
        structuralIssues: structural.issues,
        rows,
      },
    };
  } catch (err) {
    return { exitCode: 3, error: err.message };
  } finally {
    db?.close();
  }
}

function printHumanTable(result) {
  console.log(`storyId:    ${result.storyId}`);
  console.log(`complexity: ${result.complexity ?? '(none)'}`);
  console.log(`verdict:    ${result.verdict}${result.skipReason ? ` (${result.skipReason})` : ''}`);
  if (result.structuralIssues.length > 0) {
    console.log('structuralIssues:');
    for (const issue of result.structuralIssues) console.log(`  - ${issue}`);
  }
  if (result.rows.length === 0) {
    console.log('rows: (none)');
    return;
  }
  console.log(`rows (${result.rows.length}):`);
  for (const row of result.rows) {
    const defects = row.defects.length ? row.defects.join(',') : '-';
    console.log(`  [${row.rowIndex}] ${row.case} (${row.br}, ${row.level}) defects=${defects} testHit=${row.testHit ?? 'null'}`);
  }
}

// bwu-13-bmad-mechanism-gap-closure BR-001..BR-004 — dev-side mechanical
// counterpart to code-review step-03c §6.2 axis (a) (same whole-word judgement,
// via hasExactCaseName). Advisory-only: never BLOCKs (stderr, exit code
// untouched — BR-002/003), and only fires for a fully-qualifying table
// (verdict === 'consume'); fallback/skip stories get zero output (BR-004), not
// 44 pre-existing prose-only cards and every S/XS card flooded with noise.
// [CR F6] `exactNameHit` is three-valued (see the skipGitGrep comment in runAudit):
// `true` = measured and matched, `false` = measured and missed, `null` = NOT
// measured. Only `false` is a drift signal — a bare `!r.exactNameHit` would fold
// `null` into the drift bucket and report every row of a skipGitGrep run as
// drifted, contradicting the "not measured" semantics this module states two
// functions above.
export function formatDevAdvisory(result) {
  if (!result || result.verdict !== 'consume') return '';
  const rows = result.rows || [];
  const unmatched = rows.filter((r) => r.exactNameHit === false);
  if (unmatched.length === 0) return '';
  const lines = [
    `⚠ 測試案例名漂移 advisory — ${unmatched.length}/${rows.length} 列查無 byte-identical 測試方法名`,
    ...unmatched.map((r) => `  [${r.rowIndex}] ${r.br}  ${r.case}`),
    '處置(擇一,禁靜默忽略):改測試方法名以與上表逐字相同,或於 dev_notes 具名記錄刻意分歧的理由',
  ];
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const wantsJson = args.includes('--json');
  const wantsDevAdvisory = args.includes('--dev-advisory');
  const dbIdx = args.indexOf('--db');
  if (dbIdx >= 0 && !args[dbIdx + 1]) {
    console.error('❌ --db 缺少路徑參數');
    process.exit(1);
  }
  const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : undefined;
  const storyId = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--db');

  const { exitCode, result, error } = runAudit(storyId, { dbPath });
  if (error) {
    console.error(`❌ ${error}`);
    process.exit(exitCode);
  }
  if (wantsDevAdvisory) {
    const advisory = formatDevAdvisory(result);
    if (advisory) console.error(advisory);
  }
  if (wantsJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanTable(result);
  }
  process.exit(exitCode);
}
