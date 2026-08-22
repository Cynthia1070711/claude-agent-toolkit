#!/usr/bin/env node
'use strict';

/**
 * pre-tool-bash-better-sqlite3-guard
 *
 * PreToolUse hook (matcher: Bash) — 偵測 inline `node -e "...require('better-sqlite3'|'sqlite3'|'./.context-db/...')..."`
 * 從專案根 cwd 跑導致 MODULE_NOT_FOUND。
 *
 * Stage 1 (current): advisory — stderr 警告 + 建議 MCP / cd .context-db / 既有 CLI,但 exit 0 不 BLOCK
 * Stage 2 (future): 觀察 30d false positive 率後可升 exit 2 BLOCK
 *
 * Bypass intent (legitimate):
 *   - command 已含 `cd .context-db &&` 前綴 → skip(cwd 已切到 .context-db,Node.js 解析正確)
 *   - command 不含 `node -e` 而是跑 .context-db/scripts/*.js → skip(script 內部處理路徑)
 *
 * Memory: feedback_main_window_db_query_must_use_mcp.md(2026-05-09 aat-fnd-01 CR final verify 事故觸發)
 *
 * Fail-open: any error / parse failure → exit 0(PreToolUse hook NEVER break workflow on internal error)
 *
 * @author CC-OPUS
 * @created 2026-05-09
 */

const STDIN_TIMEOUT_MS = 1000;
const MAX_STDIN_BYTES = 256 * 1024;

// ── Pattern: 偵測 inline node -e 含 require better-sqlite3 / sqlite3 ─────
//    範例 hit: node -e "const db=require('better-sqlite3')(...)"
//    範例 hit: node -e 'require("sqlite3")...'
//    範例 miss: cd .context-db && node -e "..." (有 cd 前綴)
//    範例 miss: node .context-db/scripts/upsert-story.js (不是 -e)
const TRIGGER_PATTERN = /\bnode\s+-e\s+["'][^"']*\brequire\s*\(\s*['"](?:better-sqlite3|sqlite3)['"]/i;
const SAFE_PREFIX_PATTERN = /\bcd\s+\.?\.?\/?\.context-db\b/i;

// ── Stdin reader (timeout + max bytes) ──────────────────────────────────

function readStdin() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    let bytes = 0;
    const timer = setTimeout(() => {
      try { process.stdin.removeAllListeners(); process.stdin.pause(); } catch { /* ignore */ }
      resolve(data);
    }, STDIN_TIMEOUT_MS);
    try { process.stdin.setEncoding('utf8'); } catch { /* ignore */ }
    process.stdin.on('data', chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes < MAX_STDIN_BYTES) data += chunk;
    });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
  });
}

// ── BOM-safe JSON parse ─────────────────────────────────────────────────

function parseJsonStripBom(raw) {
  if (!raw) return null;
  const trimmed = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  try { return JSON.parse(trimmed); } catch { return null; }
}

// ── Detection logic (exported for tests) ───────────────────────────────

function detectViolation(command) {
  if (!command || typeof command !== 'string') return false;
  // Skip if command already has `cd .context-db &&` prefix (legitimate bypass)
  if (SAFE_PREFIX_PATTERN.test(command)) return false;
  return TRIGGER_PATTERN.test(command);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  let raw;
  try { raw = await readStdin(); } catch { process.exit(0); }
  const input = parseJsonStripBom(raw) || {};

  const toolName = input.tool_name;
  // Only check Bash; other tools already filtered by settings.json matcher
  if (toolName !== 'Bash') process.exit(0);

  const command = (input.tool_input && input.tool_input.command) || '';

  if (!detectViolation(command)) process.exit(0);

  // Hit — emit advisory warning to stderr (advisory, not BLOCK)
  const lines = [
    '',
    '⚠ Bash 警告: 偵測到 inline `node -e "require(\'better-sqlite3\'|sqlite3)"` 從專案根 cwd 跑。',
    '',
    'Root cause: better-sqlite3 裝在 `.context-db/node_modules/` 非專案根,Node.js require 從 cwd 沿鏈找',
    '            到專案根 `node_modules/` 失敗 → MODULE_NOT_FOUND。',
    '',
    '建議改用(三選一):',
    '  1. MCP tool: mcp__phycool-context__search_stories / search_debt / add_context / add_tech / etc.',
    '     (23 phycool-context tools 第一選擇,結構化查詢完整覆蓋)',
    '  2. cd .context-db && node -e "..."',
    '     (切 cwd 讓 Node.js 從 .context-db/node_modules/ 解析)',
    '  3. node .context-db/scripts/{query-stories,upsert-story,upsert-debt}.js',
    '     (既有 CLI 處理路徑解析)',
    '',
    'Memory: feedback_main_window_db_query_must_use_mcp.md',
    'Stage 1 advisory — 不 BLOCK,僅提示。觀察 30d 後可升 BLOCK。',
    '',
  ].join('\n');

  try { process.stderr.write(lines); } catch { /* ignore */ }

  // Exit 0 = advisory (Stage 1); future Stage 2 may use exit 2 to BLOCK
  process.exit(0);
}

// Export detection logic for tests (Node.js CommonJS pattern)
if (require.main === module) {
  main().catch(() => process.exit(0));  // fail-open
} else {
  module.exports = { detectViolation, TRIGGER_PATTERN, SAFE_PREFIX_PATTERN };
}
