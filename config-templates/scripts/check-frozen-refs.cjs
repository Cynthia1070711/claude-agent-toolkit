#!/usr/bin/env node
/**
 * scripts/check-frozen-refs.cjs — sprint-status.yaml active-reference guard
 *
 * 觸發背景: tdb-2-sprint-status-freeze-refs — docs/implementation-artifacts/sprint-status.yaml
 * 已於 2026-07-28 全面凍結為唯讀歷史快照(FREEZE-MARKER:tdb-2-sprint-status-freeze-refs)。
 * 本守護腳本機械化 SDD Spec(tdb-2-sprint-status-freeze-refs-spec.md)§1.4 S1 Success Signal —
 * 掃描 BMAD 三階段 workflow + 規範層 + pipeline 機制層 + DevConsole 的「active scope」,
 * 確保未來任何 Edit/Write 不會在這些路徑重新長出「讀 yaml 取狀態」或「寫 yaml」的指令。
 *
 * Scope 與 pattern 逐字對齊 SDD Spec §1.4 S1 grep 指令,不得脫鉤漂移。
 *
 * 命中只允許落在三類(SDD Spec §1.4 S1):
 *   (a) 指向凍結標頭的說明 / 描述禁止回退讀 yaml 的安全語句(行內自動偵測關鍵詞)
 *   (b) 標註 [frozen 2026-07-28 tdb-2] 或 [tdb-2 BR-0NN] 的歷史敘述 / Version History(行內自動偵測)
 *   (c) 豁免造冊(EXEMPT_FILES 整檔 / EXEMPT_LINES 逐行,皆需具名 reason)
 * 另有 STORY_SELF_ID 自我參照豁免(本 Story kebab-case ID 本身含 "sprint-status" 子字串,
 * 在範例文字 / 測試 fixture 中列出不算違規)。
 *
 * Usage:
 *   node scripts/check-frozen-refs.cjs            # 掃描,列違規 file:line
 *   node scripts/check-frozen-refs.cjs --verbose   # 額外列出 EXEMPT 命中(透明,不計違規)
 *
 * Exit codes:
 *   0 = 零違規(全數落在豁免範圍)
 *   1 = 發現 active 指令違規,stdout 列 file:line
 */

const fs = require('fs');
const path = require('path');

// [Verified 2026-07-28: docs/implementation-artifacts/specs/epic-tdb/tdb-2-sprint-status-freeze-refs-spec.md §1.4 S1]
// 逐字對齊 SDD Spec 的 grep scope — 變更本清單前先同步該 spec。
const ACTIVE_SCOPE = [
  '_bmad/bmm/workflows/4-implementation/create-story',
  '_bmad/bmm/workflows/4-implementation/dev-story',
  '_bmad/bmm/workflows/4-implementation/code-review',
  '.claude/rules',
  '.claude/hooks',
  '.claude/skills/party-to-pipeline',
  '.claude/skills/tasks-backfill-verify',
  '.claude/skills/story-status-emoji',
  '.claude/skills/epic-config-sync',
  '.claude/skills/pipeline-subwindow',
  '.claude/skills/multi-track-orchestration',
  // [tdb-2 code-review 2026-07-28] SDD Spec §1.4 S1 原 scope 未涵蓋以下 4 個目錄,
  // 導致 3 支 *story-pipeline*.ps1 的 live WriteAllLines 寫入凍結檔在守護下完全隱形
  // (CR 實查:srf-story-pipeline.ps1 G1 分支 + 三支 Update-SprintStatusSafe)。
  // 補入後守護才能宣稱「凍結」為真;spec §1.4 S1 已同步補列。
  '.claude/skills/smart-review-fix',
  '.claude/skills/claude-launcher',
  '.claude/skills/claude-launcher-interactive',
  '.claude/skills/claude-launcher-memory',
  'scripts',
  'tools/dev-console/server',
  'tools/dev-console/src',
  'CLAUDE.md',
];

// SDD Spec §1.4 S1 pattern: `sprint.status\|sprint_status`(grep -E 語意,`.` 為任一字元)
const PATTERN = /sprint.status|sprint_status/i;

// 本 Story 自身 kebab-case ID —— 含 "sprint-status" 子字串,在範例文字 / test fixture
// story-id 清單中列出屬自我參照,非對 yaml 檔案的讀寫指令。
const STORY_SELF_ID = 'tdb-2-sprint-status-freeze-refs';

// (a)+(b) 合併關鍵詞 — 行內出現任一即視為「談論凍結本身」而非「讀寫指令」。
// 只在已命中 PATTERN 的行上二次檢查,共現風險低。
const EXEMPT_KEYWORDS = [
  'FREEZE-MARKER',
  '已凍結',
  '凍結',                    // bare(與 PATTERN 同行共現視為安全上下文,如 "2026-07-28 tdb-2 凍結")
  'frozen read-only',
  'frozen 2026-07-28',
  '[frozen 2026-07-28 tdb-2]',
  'do NOT fall back',
  'must HALT',
  '禁回退',
  'NOT from sprint-status',   // e.g. "Count from X, NOT from sprint-status comments"
];

// [tdb-2 BR-0NN] 系列 annotation(本 Story Phase 4 使用的簡短標註慣例)
const TDB2_BR_ANNOTATION = /\[tdb-2[\s,]/i;

// (c) 豁免造冊 — 整檔豁免。每筆必具名理由(見各條註解),供 AC9 逐類具名 + 附命中數需求。
const EXEMPT_FILES = [
  // 2026-07-28 Phase 2 — legacy 未載入 instructions.xml,檔首(:2)已有 [frozen] 整檔宣告
  // 「本檔內所有 sprint-status.yaml 讀寫敘述屬歷史備份內容」,不逐行加註。
  { path: '_bmad/bmm/workflows/4-implementation/create-story/instructions.xml', reason: 'legacy unloaded instructions.xml — 檔級 [frozen] 宣告(line 2),不逐行加註' },
  { path: '_bmad/bmm/workflows/4-implementation/dev-story/instructions.xml', reason: 'legacy unloaded instructions.xml — 檔級 [frozen] 宣告(line 2),不逐行加註' },
  { path: '_bmad/bmm/workflows/4-implementation/code-review/instructions.xml', reason: 'legacy unloaded instructions.xml — 檔級 [frozen] 宣告(line 2),不逐行加註' },
  // 2026-07-28 Task 3.4 / 5.1 / 5.3 — 已標 retired,標頭已加註,內文歷史描述保留不逐行改寫
  { path: 'scripts/sync-epic-readme.ps1', reason: 'RETIRED 2026-07-28(Task 3.4/5.1),PostToolUse hook 已移除,標頭已加註' },
  // [tdb-4 2026-08-03] 原列於此的 3 支 *story-pipeline*.ps1 造冊已移除 —— 使用者在場核可後,
  // 三支的 live WriteAllLines / yaml 讀取 fallback / CR Score regex / 注入 prompt 全數拆除
  // (Update-SprintStatusSafe 改 WARN no-op 保留簽章;Get-StoryStatus 改讀 stories 表),
  // 三檔各自 `grep sprint-status` 已歸零,守護自此為正向驗證而非豁免通過。
  // 追蹤債務 TD-TDB2-FROZEN-YAML-WRITERS-CONFIG-PROTECTED 同批標 fixed。
  // retired launcher 三胞胎 SKILL.md / references — frontmatter 已標 status:retired + retired_date,
  // 內文為歷史操作說明(描述 retired 前的 yaml 行為),不逐行改寫。
  { path: '.claude/skills/claude-launcher/SKILL.md', reason: 'RETIRED 2026-07-28(Task 5.3),status:retired frontmatter 已加,內文歷史操作說明保留' },
  { path: '.claude/skills/claude-launcher-interactive/SKILL.md', reason: 'RETIRED 2026-07-28(Task 5.3),status:retired frontmatter 已加,內文歷史操作說明保留' },
  { path: '.claude/skills/claude-launcher-memory/SKILL.md', reason: 'RETIRED 2026-07-28(Task 5.3),status:retired frontmatter 已加,內文歷史操作說明保留' },
  { path: '.claude/skills/claude-launcher-memory/references/log-workflow-integration.md', reason: 'RETIRED 2026-07-28(Task 5.3)隨 claude-launcher-memory 退場,歷史說明保留' },
  { path: 'scripts/epic-auto-pilot.ps1', reason: 'RETIRED 2026-07-28(Task 5.3),標頭已加註' },
  { path: 'scripts/batch-runner.ps1', reason: 'RETIRED 2026-07-28(Task 5.3),標頭已加註' },
  { path: 'scripts/batch-audit.ps1', reason: 'RETIRED 2026-07-28(Task 5.3),標頭已加註' },
  { path: 'scripts/batch-update-story-emoji.sh', reason: 'RETIRED 2026-07-28(Task 5.3),標頭已加註' },
  { path: '.claude/skills/epic-config-sync/SKILL.md', reason: 'RETIRED 2026-07-28(Task 3.4),status:retired frontmatter 已加,內文歷史描述保留' },
  // 本檔自身
  { path: 'scripts/check-frozen-refs.cjs', reason: '本守護腳本自身(pattern/scope 定義必然含關鍵字字面)' },
  { path: 'scripts/check-frozen-refs.test.cjs', reason: '本守護腳本的測試檔(fixture 內容必然含關鍵字字面)' },
  // 2026-07-28 Task 5.4 — check-hygiene.ps1 內本守護腳本的掛載區塊(Write-Host 說明文字 /
  // 錯誤訊息字串)自然會提及 "sprint-status.yaml",屬描述本守護腳本用途而非讀寫指令。
  { path: 'scripts/check-hygiene.ps1', reason: '本守護腳本掛載區塊的 Write-Host 說明文字/錯誤訊息,描述用途非讀寫指令' },
];

// (c) 豁免造冊 — 逐行豁免。每筆必具名理由。
const EXEMPT_LINES = [
  { path: '.claude/rules/constitutional-standard.md', line: 9, reason: 'Code Verification Mandate 泛例句,列 sprint-status.yaml 為「線索非證據」來源之一,非讀寫指令;凍結後此原則更成立' },
  { path: '.claude/hooks/cross-ref-precheck.js', line: 62, reason: 'IMMUTABLE_PATTERNS 分類陣列的 regex 字面量,非讀寫指令' },
  { path: '.claude/skills/party-to-pipeline/scripts/smoke-test.ps1', line: 74, reason: 'T4.5-1 負向斷言 — 驗證 sprint-status.yaml 已「不在」HardBlock 清單(Task 3.3),字面字串為斷言必要內容。行號 63→74 於 whp-12 CR(2026-08-02)更新:該檔頂端新增宿主警示 banner 使其下移,豁免對象(T4.5-1 斷言本身)未變。⚠ 本造冊綁死行號,任何在被豁免行之上的插入都會使閘門紅燈 —— 失敗訊息會明確指出新行號,照著改即可' },
];

// scratch / gitignored 目錄 — 不掃描(非 active 版控內容,見 tracking Task 5.4 說明)
const EXCLUDE_DIR_PATTERNS = [/[\\/]scripts[\\/]temp[\\/]/];
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'bin', 'obj', '.git', 'coverage', 'temp']);

function normalize(p) {
  return p.replace(/\\/g, '/');
}

function findFileExemption(relPath) {
  const norm = normalize(relPath);
  return EXEMPT_FILES.find(e => norm.endsWith(e.path));
}

function findLineExemption(relPath, lineNo) {
  const norm = normalize(relPath);
  return EXEMPT_LINES.find(e => norm.endsWith(e.path) && e.line === lineNo);
}

function isSelfIdOnlyMatch(line) {
  if (!line.includes(STORY_SELF_ID)) return false;
  const stripped = line.split(STORY_SELF_ID).join('');
  return !PATTERN.test(stripped);
}

function matchedKeywordReason(line) {
  const kw = EXEMPT_KEYWORDS.find(k => line.includes(k));
  if (kw) return `keyword:${kw}`;
  if (TDB2_BR_ANNOTATION.test(line)) return 'tdb-2-br-annotation';
  return null;
}

/**
 * 對單一檔案內容做逐行分類,回傳 { violations, exempt }。
 * 純函式(不觸碰檔案系統),供 check-frozen-refs.test.cjs 直接單元測試。
 */
function classifyContent(relPath, content) {
  const violations = [];
  const exempt = [];

  const fileExemption = findFileExemption(relPath);
  if (fileExemption) {
    return { violations, exempt: [{ line: 0, reason: `file-exempt: ${fileExemption.reason}` }] };
  }

  const lines = content.split(/\r\n|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!PATTERN.test(line)) continue;
    const lineNo = i + 1;

    if (isSelfIdOnlyMatch(line)) {
      exempt.push({ line: lineNo, reason: 'self-id-reference' });
      continue;
    }

    const lineExemption = findLineExemption(relPath, lineNo);
    if (lineExemption) {
      exempt.push({ line: lineNo, reason: `line-exempt: ${lineExemption.reason}` });
      continue;
    }

    const kwReason = matchedKeywordReason(line);
    if (kwReason) {
      exempt.push({ line: lineNo, reason: kwReason });
      continue;
    }

    violations.push({ line: lineNo, text: line.trim().slice(0, 160) });
  }
  return { violations, exempt };
}

function isExcludedDir(dirPath) {
  const norm = normalize(dirPath);
  return EXCLUDE_DIR_PATTERNS.some(re => re.test(norm + '/'));
}

function walk(entryPath, files) {
  if (!fs.existsSync(entryPath)) return;
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    files.push(entryPath);
    return;
  }
  if (stat.isDirectory()) {
    if (SKIP_DIR_NAMES.has(path.basename(entryPath))) return;
    if (isExcludedDir(entryPath)) return;
    for (const child of fs.readdirSync(entryPath)) {
      walk(path.join(entryPath, child), files);
    }
  }
}

function main() {
  const verbose = process.argv.includes('--verbose');
  const repoRoot = path.resolve(__dirname, '..');

  const allFiles = [];
  for (const scopeEntry of ACTIVE_SCOPE) {
    walk(path.join(repoRoot, scopeEntry), allFiles);
  }

  const allViolations = []; // { file, line, text }
  const exemptSummary = new Map(); // reason -> count

  for (const absFile of allFiles) {
    let content;
    try {
      content = fs.readFileSync(absFile, 'utf8');
    } catch {
      continue; // binary / unreadable — skip
    }
    if (!PATTERN.test(content)) continue;

    const relFile = normalize(path.relative(repoRoot, absFile));
    const { violations, exempt } = classifyContent(relFile, content);

    for (const v of violations) {
      allViolations.push({ file: relFile, line: v.line, text: v.text });
    }
    for (const e of exempt) {
      exemptSummary.set(e.reason, (exemptSummary.get(e.reason) || 0) + 1);
    }
  }

  if (verbose && exemptSummary.size > 0) {
    console.log('ℹ EXEMPT(豁免命中,透明列出,不計違規):');
    for (const [reason, count] of [...exemptSummary.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  [${reason}] × ${count} 處`);
    }
    console.log('');
  }

  if (allViolations.length === 0) {
    console.log('✅ No active sprint-status.yaml references found in scope (all hits fall under the exempt ledger).');
    return 0;
  }

  console.log(`⚠ Found ${allViolations.length} active sprint-status.yaml reference(s) outside the exempt ledger:\n`);
  for (const v of allViolations) {
    console.log(`  ${v.file}:${v.line}  ${v.text}`);
  }
  console.log(`\nEach hit must either become DB-first, gain a [frozen 2026-07-28 tdb-2] annotation if it's`);
  console.log(`historical narrative, or be added to EXEMPT_FILES/EXEMPT_LINES in scripts/check-frozen-refs.cjs`);
  console.log(`with a named reason (see AC9).`);

  return 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  classifyContent,
  isSelfIdOnlyMatch,
  matchedKeywordReason,
  findFileExemption,
  findLineExemption,
  PATTERN,
  ACTIVE_SCOPE,
  STORY_SELF_ID,
};
