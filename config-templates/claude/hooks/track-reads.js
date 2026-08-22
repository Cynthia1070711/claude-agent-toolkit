#!/usr/bin/env node
/**
 * track-reads.js — PostToolUse hook (matcher: Read)
 *
 * 配套 read-before-edit-guard.js — 記錄每次 Read tool 觸發的 filepath
 * 至 .claude/audit/reads-{git-hash}.log,供 PreToolUse Edit 階段查詢。
 *
 * 設計:
 *   - Cache key = git rev-parse HEAD(取代 session_id,解 subagent 不繼承問題)
 *   - 同 commit cycle 內 parent + subagent + 跨 session 共用 log
 *   - git commit 後 hash 變更 → 自動 reset(新 cycle)
 *   - Append-only(不去重,空間成本 < 1KB / commit cycle)
 *
 * 對齊:
 *   - .claude/hooks/read-before-edit-guard.js (PreToolUse Edit)
 *   - .claude/rules/constitutional-standard.md §Code Verification Mandate
 *
 * settings.json 註冊:
 *   "PostToolUse": [{
 *     "matcher": "Read",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/track-reads.js",
 *       "timeout": 1000
 *     }]
 *   }]
 *
 * 2026-05-16 15:55 deployed for PhyCool env-optimization P1-7.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', timeout: 500, stdio: ['pipe', 'pipe', 'ignore'] }).trim().slice(0, 12);
  } catch {
    return 'no-git';
  }
}

(async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = (data.tool_input?.file_path || '').replace(/\\/g, '/');
  if (!filePath) process.exit(0);

  try {
    const gitHash = getGitCommitHash();
    const auditDir = path.resolve('.claude/audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const readLogPath = path.join(auditDir, `reads-${gitHash}.log`);
    fs.appendFileSync(readLogPath, filePath + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[track-reads] ${err.message}\n`);
  }

  process.exit(0);
})().catch(err => {
  process.stderr.write(`[track-reads] fatal: ${err.message}\n`);
  process.exit(0);
});
