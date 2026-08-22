// testing-strategy-structure.js — Depth Gate D7 §7.1b structural validation
//
// Extracted from run-depth-gate.js runD7() so the logic carries a regression
// test, following the same pattern markdown-normalize.js established when it
// was lifted out of upsert-story.js. run-depth-gate.js is a CLI that calls
// main() at load time, so nothing inside it can be imported by a test.
//
// Validates stories.testing_strategy against the named-test-case-table contract
// produced by create-story step-06 §7.5 (SDD Spec bwu-2 §3.4 / BR-002..BR-005,
// BR-022..BR-024). Severity is decided by the caller; this module only reports.

// Line endings are normalized before any line-anchored regex runs. Story text
// can reach the DB with CRLF (upsert-story.js's normalizeMarkdownBreaks only
// rewrites \n, and phycool.db already holds at least one such row), and a CRLF
// table would otherwise be reported as "no table at all" — a false WARN, which
// depth-gate-warn-mandatory-resolution.md escalates to exit 2.
// See .claude/rules/crlf-normalize-discipline.md §3.1.
const normalizeEol = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n');

// Case-name shape: BR id segment + ≥2 underscore-separated segments.
// `[A-Z]*` and `\d+` are deliberately disjoint — no character can satisfy both,
// so the engine has nothing to backtrack over. The earlier `[A-Z0-9]*\d+` was
// quadratic on a long BR-prefixed alphanumeric run (~10s at 200k chars, 234ms at
// 30k) while matching exactly the same set of real case names, BRWH01_ included.
const CASE_NAME = /\bBR[A-Z]*\d+_[A-Za-z0-9]+_[A-Za-z0-9]+/;
const CASE_NAME_G = new RegExp(CASE_NAME.source, 'g');

// Markdown table = header row followed by a |---| separator row.
const TABLE = /^\|[^\n]*\|[ \t]*\n\|[ \t:-]+\|/m;

// Two changes from the original `\[Verifies:\s*([^\]]+)\]`, both about the cost
// of a marker that is never closed. The `\s*` is gone because it overlapped
// `[^\]]+` (each token is trimmed below anyway), and the run now excludes \n so
// a failed attempt backtracks within one line instead of the rest of the field —
// ~9s at 200k chars before, sub-millisecond now. A real marker is single-line.
const VERIFIES = /\[Verifies:([^\]\n]+)\]/g;

// bwu-8-gate-regex-and-audit-heuristics AC1 — coverage targets are identifier-
// shaped BR ids ("BR" + one or more -/_ separated alnum segments, final segment
// carrying a digit), not just the all-numeric `BR-\d+` the original predicate
// required. Full-repo measurement (2026-08-01) against 477 testing_strategy
// tables: the all-numeric shape leaves 313 cards resolving 0 cited BRs even
// though every one of them cites real ids — the dominant real-world shape is a
// multi-segment hyphenated prefix (`BR-PREVIEW-01`, `BR-CCG-L5-01`), not a
// single letter before the digits. This shape recovers 241 of those 313 while
// keeping every previously-accepted token accepted (0 regressions, verified
// against all 477 cards) and continuing to reject the `BR-00N`/`BR-XXX` worked-
// example placeholders those cards also contain — see PLACEHOLDER_FINAL_SEGMENT
// below. `[A-Za-z0-9]+` never touches the `-`/`_` it's split on, so there is
// nothing ambiguous for the engine to backtrack over.
// The `BR` prefix must be followed either by digits directly (`BR001`) or by a
// separator (`BR-G01`). An optional separator in front of a free alnum segment
// — which is what `BR[-_]?[A-Za-z0-9]+` allowed — also accepts any identifier
// that merely starts with those two letters: `BRANCH-01`, `BROWSER-02`,
// `BRIDGE_V3` all passed (code-review 2026-08-01). Those would be counted as
// cited coverage targets, silently, which is the same class of defect this
// predicate was widened to fix. Measured against all 3,863 distinct
// `[Verifies:]` tokens in phycool.db: this narrowing changes the verdict for
// exactly 0 of them (no token in the DB has the `BR` + letter, no-separator
// shape), so it is a pure removal of a false-accept path.
const BR_SEGMENT = '[A-Za-z0-9]+';
const IDENTIFIER_SHAPE = new RegExp(`^BR(?:\\d+|[-_]${BR_SEGMENT}(?:[-_]${BR_SEGMENT})*)$`, 'i');

// A final segment built purely from digits and the letters X/N, with at least
// one X/N present, is a worked-example placeholder (`BR-00N`, `BR-XXX`,
// `BR-MNAV-XX`, `BR-FP-0X` — all real tokens rejected by the pre-image
// implementation's ad-hoc regex, this is the closed-form replacement). A
// segment with only digits (`01`) or a non-X/N letter (`G01`, `D2`) is a real
// id and must not match.
const PLACEHOLDER_FINAL_SEGMENT = /^[0-9]*[xn]+[0-9]*$/i;

function isBrIdShaped(token) {
  if (!IDENTIFIER_SHAPE.test(token)) return false;
  const afterPrefix = token.slice(2).replace(/^[-_]/, '');
  const segments = afterPrefix.split(/[-_]/);
  const finalSegment = segments[segments.length - 1];
  if (!/\d/.test(finalSegment)) return false;
  if (PLACEHOLDER_FINAL_SEGMENT.test(finalSegment)) return false;
  return true;
}

const stripSeparators = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Complexities for which §7.5 does not produce a table (BR-001 / BR-023). */
export const SKIP_COMPLEXITIES = new Set(['S', 'XS']);

/**
 * @param {{complexity?: string, testing_strategy?: string, acceptance_criteria?: string}} story
 * @returns {{skipped: boolean, skipReason: string|null, issues: string[],
 *            caseCount: number, citedBrCount: number, uncoveredBrIds: string[]}}
 */
export function checkTestingStrategyStructure(story = {}) {
  const rawComplexity = story.complexity || '';
  if (SKIP_COMPLEXITIES.has(rawComplexity.toUpperCase())) {
    return {
      skipped: true,
      skipReason: `${rawComplexity || 'S'} complexity`,
      issues: [],
      caseCount: 0,
      citedBrCount: 0,
      uncoveredBrIds: [],
    };
  }

  const ts = normalizeEol(story.testing_strategy);
  const ac = normalizeEol(story.acceptance_criteria);
  const issues = [];

  // (a) a markdown table exists at all
  if (!TABLE.test(ts)) issues.push('無具名測試案例表(找不到 markdown 表格)');

  // Coverage and case names are both read from table rows only. BR-004 asks for
  // "≥1 case row mapping to it", so a BR id that appears solely in surrounding
  // prose ("本表覆蓋 BR-001 ~ BR-005") must not count as covered.
  const tableText = ts.split('\n').filter((line) => line.startsWith('|')).join('\n');

  // (b) ≥1 table cell carries a {BR_ID}_{Scenario}_{Expected} case name
  const caseNames = new Set(tableText.match(CASE_NAME_G) || []);
  if (caseNames.size === 0) {
    issues.push('有表但無 `{BR_ID}_{Scenario}_{Expected}` 案例名(或無表)');
  }

  // (c) every BR id cited by an AC [Verifies:] marker appears in a table row
  const citedBrIds = new Set();
  for (const match of ac.matchAll(VERIFIES)) {
    for (const raw of match[1].split(',')) {
      const token = raw.trim();
      if (!isBrIdShaped(token)) continue;
      const id = stripSeparators(token);
      if (id) citedBrIds.add(id);
    }
  }
  const normalizedTable = stripSeparators(tableText);
  // The trailing digit boundary stops BR-01 from being reported as covered by a
  // table that only mentions BR-012 (separators are already stripped by then).
  const uncoveredBrIds = [...citedBrIds].filter(
    (id) => !new RegExp(`${id}(?![0-9])`).test(normalizedTable),
  );
  if (uncoveredBrIds.length > 0) {
    issues.push(`AC 引用 BR 未覆蓋: ${uncoveredBrIds.join(', ')}`);
  }

  // bwu-8-gate-regex-and-audit-heuristics AC2 — resolving 0 cited BRs used to
  // pass silently (0 uncovered because there was nothing to be uncovered), so a
  // card whose AC carries no [Verifies:] marker at all, or whose markers hold no
  // BR-id-shaped token, produced a PASS report that looked identical to a card
  // with real, fully-covered coverage. Gated on ts being non-empty so this never
  // fires alongside the "no table at all" issue above (that case has its own,
  // separate, non-actionable-BR-id explanation already). Also gated on
  // acceptance_criteria actually being present: a wholly missing AC field is
  // already a harder failure (D7 §7.1's own min-length check BLOCKs on it), so
  // this check's job is the narrower one — an AC that exists but doesn't cite
  // anything BR-id-shaped — not a second, weaker echo of the missing-field case.
  if (ts.length > 0 && story.acceptance_criteria != null && citedBrIds.size === 0) {
    issues.push('AC 引用 0 個有效 BR id(缺 [Verifies:] 標記,或標記內容皆非 BR id 形狀,測試表可能與 AC 脫鉤)');
  }

  return {
    skipped: false,
    skipReason: null,
    issues,
    caseCount: caseNames.size,
    citedBrCount: citedBrIds.size,
    uncoveredBrIds,
  };
}

// ---------------------------------------------------------------------------
// parseTestCaseTable() — bwu-3-dev-consume-review-audit T1.1/T1.2 (BR-010..016)
//
// New export only. checkTestingStrategyStructure()/SKIP_COMPLEXITIES above this
// line are untouched (BR-016) — this reuses normalizeEol/CASE_NAME/stripSeparators
// but adds no new module-level state that could shift their behaviour.
// ---------------------------------------------------------------------------

// Leading BOM only matters here: checkTestingStrategyStructure()'s TABLE regex
// scans for '|' anywhere via the 'm' flag, so a BOM before the first line never
// affected it. parseTestCaseTable() anchors its own header/separator scan at each
// line, same exposure — strip it once so a BOM-prefixed field parses like its
// BOM-free twin (BR-015).
const stripBom = (s) => s.replace(/^﻿/, '');

// Header name -> parsed-row key (BR-010). Matched against stripSeparators() output,
// so "RED→GREEN", "RED->GREEN", and "red green" all normalise to "REDGREEN".
const HEADER_KEY_MAP = {
  CASE: 'case',
  BR: 'br',
  LEVEL: 'level',
  FIXTURE: 'fixture',
  INPUT: 'input',
  EXPECTED: 'expected',
  REDGREEN: 'redGreen',
  PATTERN: 'pattern',
};

// The seven required columns from create-story step-06 §7.5.1 (Pattern is optional,
// deliberately excluded — a missing Pattern column is not a defect).
const REQUIRED_COLUMNS = ['Case', 'BR', 'Level', 'Fixture', 'Input', 'Expected', 'RED→GREEN'];

const LEVEL_ENUM = new Set(['unit', 'integration', 'E2E']);
const REDGREEN_VAGUE_WORDS = /(會通過|應該正常|正常|正確)/;

// Cells that reference code identifiers (Case/Fixture) are conventionally written
// as markdown inline-code (`` `X` ``) so the table renders legibly, but BR-003's
// byte-identical requirement is against the bare identifier — dev cannot produce a
// C# method literally named `` `BR005_..._Returns409` `` with backticks in it. Strip
// one enclosing pair uniformly; cells without backticks pass through unchanged.
//
// `[^`]*` not `.*`: a cell holding TWO inline-code spans (`` `a.md:59` 仍為 `70%` ``)
// starts and ends with a backtick, so the greedy form stripped the outer pair and
// left the inner ones — turning the cell into ``a.md:59` 仍為 `70%``. That cell is
// exactly what dev copies into an assert (BR-004), so corrupting it corrupts the
// test. 18 stories / 92 cells in phycool.db hit this shape.
const unwrapBacktick = (cell) => cell.replace(/^`([^`]*)`$/, '$1');

// Markdown escapes a literal pipe inside a cell as `\|`; splitting on every `|`
// shifts every column after the first escaped one (measured: 8 stories / 16 table
// lines in phycool.db). Since dev takes Level/Fixture/Input/Expected verbatim from
// these cells (BR-004) and §6.3 turns their contents into findings, a shifted row
// both mis-arranges tests and manufactures false defects. Split on unescaped pipes
// only, then unescape so the cell carries the author's literal text.
const splitRow = (line) =>
  line
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => unwrapBacktick(cell.trim().replace(/\\\|/g, '|')));

function deriveDefects(row, presentKeys) {
  const defects = [];
  for (const col of REQUIRED_COLUMNS) {
    const key = HEADER_KEY_MAP[stripSeparators(col)];
    if (!presentKeys.has(key)) defects.push(`missing-column:${col}`);
  }
  if (presentKeys.has('level') && row.level && !LEVEL_ENUM.has(row.level)) {
    defects.push('level-enum');
  }
  // bwu-8-gate-regex-and-audit-heuristics AC6 — detection stays exactly this
  // narrow (blank cell only); only this comment is new.
  //
  // The ruling rests on ONE number: blank Fixture cells = 0. Everything a wider
  // "unnamed" heuristic could catch beyond a blank cell is a real, deliberately
  // terse value, so widening it would manufacture a defect on nearly every row
  // of every consume-mode card — the WARN flood bwu-2 already rejected for a
  // different heuristic.
  //
  // The supporting counts are a SNAPSHOT of a growing table, not a constant, and
  // they have already moved three times: AC6 was authored at 380 rows / 164
  // distinct, dev measured 354 / 141, code-review measured 488 / 202 (2026-08-01,
  // same day). Blank = 0 held in all three. Do not treat the figures below as
  // fixed — re-run this before reopening the question:
  //
  //   node -e "const D=require('better-sqlite3');const db=new D('.context-db/phycool.db',{readonly:true});\
  //   import('./.context-db/scripts/testing-strategy-structure.js').then(({checkTestingStrategyStructure:c,parseTestCaseTable:p})=>{\
  //   let rows=0,blank=0,d=new Set();for(const s of db.prepare(\"SELECT complexity,testing_strategy FROM stories WHERE complexity IN ('M','L','XL') AND TRIM(COALESCE(testing_strategy,''))!=''\").all()){\
  //   const st=c(s);if(st.skipped||st.issues.length)continue;for(const r of p(s.testing_strategy).rows){if(!('fixture' in r))continue;rows++;if(!r.fixture)blank++;d.add(r.fixture);}}\
  //   console.log({rows,blank,distinct:d.size});});"
  //
  // Latest reading (code-review 2026-08-01): 16 consume cards, 488 rows,
  // 0 blank, 202 distinct, 113 exact "N/A — pure function".
  if (presentKeys.has('fixture') && !row.fixture) {
    defects.push('fixture-unnamed');
  }
  if (presentKeys.has('redGreen')) {
    const rg = row.redGreen || '';
    const hasBothSides = /red/i.test(rg) && /green/i.test(rg);
    if (!hasBothSides || REDGREEN_VAGUE_WORDS.test(rg)) defects.push('redgreen-vague');
  }
  if (row.case && !CASE_NAME.test(row.case)) defects.push('case-name-shape');
  return defects;
}

/**
 * @param {string|null|undefined} testingStrategy
 * @returns {{rows: object[], tableCount: number, headerColumns: string[]}}
 */
export function parseTestCaseTable(testingStrategy) {
  const text = stripBom(normalizeEol(testingStrategy));
  const rows = [];
  const seenCases = new Set();
  let tableCount = 0;
  let headerColumns = [];

  if (!TABLE.test(text)) return { rows, tableCount, headerColumns };

  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const isHeader = lines[i].startsWith('|') && lines[i + 1] && /^\|[ \t:-]+\|/.test(lines[i + 1]);
    if (!isHeader) {
      i += 1;
      continue;
    }

    const headerCells = splitRow(lines[i]);
    const normHeaders = headerCells.map((h) => stripSeparators(h));
    const presentKeys = new Set(normHeaders.map((h) => HEADER_KEY_MAP[h]).filter(Boolean));
    if (tableCount === 0) headerColumns = headerCells;
    tableCount += 1;
    i += 2; // skip header + separator row

    while (i < lines.length && lines[i].startsWith('|')) {
      const cells = splitRow(lines[i]);
      const row = {};
      normHeaders.forEach((h, idx) => {
        const key = HEADER_KEY_MAP[h];
        if (key) row[key] = cells[idx] ?? '';
      });
      if (row.case && !seenCases.has(row.case)) {
        seenCases.add(row.case);
        row.pattern = row.pattern || null;
        row.defects = deriveDefects(row, presentKeys);
        row.rowIndex = rows.length + 1;
        rows.push(row);
      }
      i += 1;
    }
  }

  return { rows, tableCount, headerColumns };
}
