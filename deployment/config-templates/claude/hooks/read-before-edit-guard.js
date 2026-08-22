#!/usr/bin/env node
/**
 * read-before-edit-guard.js — PreToolUse hook (matcher: Edit)
 *
 * PhyCool Constitutional Code Verification Mandate 機械守護(advisory mode):
 * 偵測 Edit 工具對既有檔案的編輯,若該檔案於本 commit cycle 內未被 Read 過,
 * 注入 additionalContext 提醒走 read-before-modify 流程。
 *
 * Murat (TEA) 設計修補(對齊 PHASE2 Hook 10):
 *   - Cache key 改用 git commit hash + filepath(取代 session_id)
 *   - 解 subagent 不繼承 parent read history 問題:同 commit 內 parent + subagent 共用 cache
 *   - Advisory 模式(注入 context 提示,非 exit 2 block)— 觀察期 30 天
 *   - 觀察 30 天 false positive < 5% 後可升級為 block 模式(PHASE2 Hook 10 完整版)
 *
 * 配套 hook:
 *   .claude/hooks/track-reads.js (PostToolUse Read) — 寫入 read log
 *
 * 設計考量:
 *   - Cache 路徑: .claude/audit/reads-{git-hash}.log(per commit cycle)
 *   - git commit hash 變更 → 新 cycle 開始 → reset read log
 *   - 失敗 silent pass(exit 0)— 不擋 Claude 工作流
 *
 * 對齊規範:
 *   - .claude/rules/constitutional-standard.md §Code Verification Mandate
 *   - .claude/rules/code-quality.md §Read before modify
 *
 * settings.json 註冊:
 *   "PreToolUse": [{
 *     "matcher": "Edit",
 *     "hooks": [{
 *       "type": "command",
 *       "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .claude/hooks/read-before-edit-guard.js",
 *       "timeout": 1500
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

  // Only check Edit on existing files (Write to new file doesn't need pre-Read)
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (!fs.existsSync(absPath)) process.exit(0);

  // Compute cache key (git commit hash)
  const gitHash = getGitCommitHash();
  const readLogPath = path.resolve(`.claude/audit/reads-${gitHash}.log`);

  // Check if filepath was Read in current commit cycle
  let hasRead = false;
  try {
    if (fs.existsSync(readLogPath)) {
      const log = fs.readFileSync(readLogPath, 'utf8');
      // Match exact filepath (case-insensitive for Windows compat)
      const normalized = filePath.toLowerCase();
      hasRead = log.split('\n').some(line => line.trim().toLowerCase() === normalized);
    }
  } catch {
    hasRead = false;
  }

  if (hasRead) {
    process.exit(0);  // Already read, advisory skip
  }

  // Advisory injection (non-blocking)
  const note = `The file ${filePath} is about to be Edit'd but has not been Read in the current commit cycle (git ${gitHash}). ` +
    `Per .claude/rules/constitutional-standard.md §Code Verification Mandate, ` +
    `Edit-without-Read is forbidden — Claude may overwrite recent changes or misjudge context. ` +
    `Consider running Read tool first to confirm current file state, especially if this file may have been modified by other workflows (subagent / pipeline / previous session). ` +
    `[Advisory observation period — non-blocking; 30 days FP analysis pending].`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: note,
    }
  }));
  process.exit(0);
})().catch(err => {
  process.stderr.write(`[read-before-edit-guard] ${err.message}\n`);
  process.exit(0);
});
