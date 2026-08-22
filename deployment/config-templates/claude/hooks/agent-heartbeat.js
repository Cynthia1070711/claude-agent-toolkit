#!/usr/bin/env node
/**
 * agent-heartbeat.js — PostToolUse Hook (aat-fnd-02, AC-1 / AC-2)
 *
 * 採樣策略 N=10: 每累計 10 次 PostToolUse 觸發時，
 * UPDATE agent_runs SET last_heartbeat = TaiwanTime.Now, current_token = N
 * WHERE run_id = $CLAUDE_RUN_ID
 *
 * ENV Guards:
 *   PHYCOOL_AIOS_HEARTBEAT_ENABLED=true   (預設 false — 觀察期 30 天)
 *   CLAUDE_RUN_ID                          (pipeline 子視窗由 claude-launcher 填入)
 *
 * Budget: < 200ms (採用非同步寫入 + 靜默失敗)
 */
'use strict';

const os   = require('os');
const fs   = require('fs');
const path = require('path');

// ── ENV Guards ──────────────────────────────────────────────────────────────
if (process.env.PHYCOOL_AIOS_HEARTBEAT_ENABLED !== 'true') process.exit(0);

const runId = process.env.CLAUDE_RUN_ID;
if (!runId) process.exit(0);

// ── Counter (temp file per run_id) ──────────────────────────────────────────
const SAMPLE_N = 10;
const counterFile = path.join(os.tmpdir(), `phycool-hb-${runId.replace(/[^a-z0-9-]/gi, '_')}.txt`);

let count = 0;
try {
  if (fs.existsSync(counterFile)) {
    count = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
  }
} catch { /* ignore */ }
count++;

try {
  fs.writeFileSync(counterFile, String(count), 'utf8');
} catch { /* ignore */ }

// 未達採樣閾值 → 直接退出
if (count % SAMPLE_N !== 0) process.exit(0);

// ── SQL Update ──────────────────────────────────────────────────────────────
const projectRoot = process.env.CLAUDE_PROJECT_DIR
  || path.resolve(__dirname, '..', '..');

const { sql, getPool, nowTaiwan, readCurrentToken } = require(path.join(__dirname, '_aios-sql.js'));

(async () => {
  let pool = null;
  try {
    pool = await getPool();
    if (!pool) process.exit(0);

    const ts = nowTaiwan();
    const token = readCurrentToken(projectRoot);

    await pool.request()
      .input('ts',    sql.TYPES.DateTimeOffset, ts)
      .input('token', sql.TYPES.Int,            token)
      .input('runId', sql.TYPES.NVarChar(64),   runId)
      .query(`UPDATE agent_runs
              SET    last_heartbeat = @ts,
                     current_token  = COALESCE(@token, current_token)
              WHERE  run_id = @runId`);
  } catch (err) {
    process.stderr.write(`[agent-heartbeat] ${err.message}\n`);
  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* ignore */ }
    }
    process.exit(0);
  }
})();
