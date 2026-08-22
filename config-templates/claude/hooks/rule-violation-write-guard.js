#!/usr/bin/env node
/**
 * rule-violation-write-guard.js — PreToolUse Hook (G19 root-cause Part 2b)
 * ------------------------------------------------------------------------
 * Blocks manual `add_context` writes to category='rule_violation' whose
 * content is NOT canonical JSON (i.e. hand-written markdown). Such rows
 * break pre-prompt-rag Layer 11 getRecentHotViolations(): json_extract
 * throws on malformed JSON → the whole query catch-returns [] → the
 * violation hot-zone is silently empty (G19 repeat-violation root cause).
 * All rule_violation records MUST go through
 *   node .context-db/scripts/log-rule-violation.js
 * which emits the canonical JSON schema + ledger + embedding sync.
 *
 * Trigger : PreToolUse, tool_name === 'mcp__phycool-context__add_context'
 * Block if: tool_input.category === 'rule_violation' AND content is not
 *           valid JSON carrying a violated_rule_path.
 * Action  : exit 2 + stderr → Claude reroutes to the CLI.
 *
 * Safety  : fail-open (any internal error → exit 0); ENV bypass
 *   PHYCOOL_RULE_VIOLATION_GUARD_BYPASS=1; precise condition (no FP for
 *   legitimate ops — the correct path is always the CLI / canonical JSON).
 *
 * Rule : .claude/rules/mcp-payload-discipline.md §4 FORBIDDEN #9
 * Spec : 改善計畫-專家深度分析.md §6.6 (G19) / 交接文檔.md §3
 */

'use strict';

const SELF = 'rule-violation-write-guard';
const TARGET_TOOL = 'mcp__phycool-context__add_context';

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(buf); } };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { buf += c; });
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      const t = setTimeout(finish, 1500);
      if (t.unref) t.unref();  // don't keep event loop alive just for the timeout
    } catch {
      finish();
    }
  });
}

function stripBom(s) {
  return s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function isCanonicalViolation(content) {
  // canonical = valid JSON object carrying violated_rule_path
  if (content && typeof content === 'object') {
    return !!content.violated_rule_path;
  }
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return !!(parsed && typeof parsed === 'object' && parsed.violated_rule_path);
    } catch {
      return false;  // markdown / non-JSON
    }
  }
  return false;
}

async function main() {
  // Emergency bypass
  if (process.env.PHYCOOL_RULE_VIOLATION_GUARD_BYPASS === '1') process.exit(0);

  let raw = '';
  try { raw = stripBom(await readStdin()).trim(); } catch { process.exit(0); }
  if (!raw) process.exit(0);

  let data;
  try { data = JSON.parse(raw); } catch { process.exit(0); }  // fail-open

  // Only inspect the add_context tool
  if (!data || data.tool_name !== TARGET_TOOL) process.exit(0);

  const input = data.tool_input || {};
  // Only rule_violation category is in scope
  if (input.category !== 'rule_violation') process.exit(0);

  // Canonical JSON → allow
  if (isCanonicalViolation(input.content)) process.exit(0);

  // BLOCK: manual markdown / non-canonical rule_violation write
  const msg = [
    `[${SELF}] BLOCKED: add_context category='rule_violation' 的 content 非 canonical JSON。`,
    `rule_violation 記錄一律走 CLI(自帶 JSON schema + ledger + embedding sync):`,
    ``,
    `  node .context-db/scripts/log-rule-violation.js \\`,
    `    --rule "<violated_rule_path>" --loaded <true|false> --cli-enforced <true|false> \\`,
    `    --phase <create-story|dev-story|code-review|party-mode|other> \\`,
    `    --severity <critical|high|medium|low> --summary "<one-line>"`,
    ``,
    `原因:手動 add_context markdown 會讓 pre-prompt-rag Layer 11 json_extract throw → 違規熱區靜默斷鏈(G19)。`,
    `詳見 .claude/rules/mcp-payload-discipline.md §4 FORBIDDEN #9。`,
    `緊急豁免:設環境變數 PHYCOOL_RULE_VIOLATION_GUARD_BYPASS=1。`,
  ].join('\n');
  process.stderr.write(msg + '\n');
  process.exit(2);
}

main().catch(() => process.exit(0));  // fail-open
