#!/usr/bin/env node
/**
 * event-bus-publisher.js — PostToolUse Hook (matcher: Bash) (aat-fnd-02, AC-5 / AC-6)
 *
 * 偵測 git commit/push 完成，INSERT agent_events:
 *   event_type: 'DevDone'
 *   payload: JSON { story_id, commit_sha, command }
 *   status: 'pending'  (Outbox Pattern per ADR-AIOS-003)
 *
 * ENV Guards:
 *   PHYCOOL_AIOS_EVENT_BUS_ENABLED=true
 *   CLAUDE_RUN_ID
 *
 * Budget: < 100ms
 */
'use strict';

const path = require('path');
const { execSync } = require('child_process');

// ── ENV Guards ──────────────────────────────────────────────────────────────
if (process.env.PHYCOOL_AIOS_EVENT_BUS_ENABLED !== 'true') process.exit(0);

const runId = process.env.CLAUDE_RUN_ID;
if (!runId) process.exit(0);

// ── Read Hook Input (stdin) ─────────────────────────────────────────────────
let hookInput = '';
try {
  hookInput = require('fs').readFileSync('/dev/stdin', 'utf8');
} catch {
  try {
    // Windows fallback: read from process.stdin synchronously
    const buf = Buffer.alloc(65536);
    const n = require('fs').readSync(0, buf, 0, buf.length, null);
    hookInput = buf.slice(0, n).toString('utf8');
  } catch { /* stdin not available */ }
}

// ── Parse Tool Input ────────────────────────────────────────────────────────
let toolCommand = '';
try {
  if (hookInput) {
    const parsed = JSON.parse(hookInput);
    toolCommand = parsed?.tool_input?.command || '';
  }
} catch { /* ignore parse errors */ }

// ── Git Commit/Push Detection ────────────────────────────────────────────────
// CR F4: tighten regex to avoid false positives like `git log --grep="commit"`
// only match commands that START with `git` followed directly by `commit` or `push` subcommand
const GIT_PATTERN = /^\s*git\s+(commit|push)(\s|$)/i;
if (!GIT_PATTERN.test(toolCommand)) process.exit(0);

// ── Resolve commit SHA ───────────────────────────────────────────────────────
const projectRoot = process.env.CLAUDE_PROJECT_DIR
  || path.resolve(__dirname, '..', '..');

let commitSha = '';
try {
  commitSha = execSync('git rev-parse HEAD', { cwd: projectRoot, timeout: 3000 })
    .toString()
    .trim()
    .slice(0, 40);
} catch { /* not a git repo or no commits */ }

// ── Build Payload ────────────────────────────────────────────────────────────
const storyId = process.env.CLAUDE_STORY_ID || null;
const payload = JSON.stringify({
  story_id:   storyId,
  commit_sha: commitSha,
  command:    toolCommand.slice(0, 200),
});

// ── SQL Insert ───────────────────────────────────────────────────────────────
const { sql, getPool, nowTaiwan } = require(path.join(__dirname, '_aios-sql.js'));

(async () => {
  let pool = null;
  try {
    pool = await getPool();
    if (!pool) process.exit(0);

    const ts = nowTaiwan();

    await pool.request()
      .input('runId',     sql.TYPES.NVarChar(64),       runId)
      .input('eventType', sql.TYPES.NVarChar(64),       'DevDone')
      .input('payload',   sql.TYPES.NVarChar(sql.MAX),  payload)
      .input('status',    sql.TYPES.NVarChar(20),       'pending')
      .input('ts',        sql.TYPES.DateTimeOffset,     ts)
      .query(`INSERT INTO agent_events
                (run_id, event_type, payload, status, created_at)
              VALUES
                (@runId, @eventType, @payload, @status, @ts)`);
  } catch (err) {
    process.stderr.write(`[event-bus-publisher] ${err.message}\n`);
  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* ignore */ }
    }
    process.exit(0);
  }
})();
