#!/usr/bin/env node
/**
 * pipeline-quota-check.js — wfq-04 BR-006, BR-007, BR-008
 * Pipeline 啟動前配額預測：讀取 benchmarks 基線 + 今日 OTel 累計，輸出 GO/WARN/BLOCK。
 *
 * Usage:
 *   node scripts/pipeline-quota-check.js \
 *     --phases "create-story,dev-story,code-review" \
 *     --complexity M \
 *     --model opus \
 *     [--verbose]
 *
 * Exit codes:
 *   0 = GO
 *   1 = WARN
 *   2 = BLOCK
 */
'use strict';

const path = require('path');
const fs   = require('fs');

// ── Paths ──
const projectRoot = path.resolve(__dirname, '..');
const dbPath      = path.join(projectRoot, '.context-db', 'phycool.db');
const nodeModDir  = path.join(projectRoot, '.context-db', 'node_modules');
const configPath  = path.join(projectRoot, 'scripts', 'pipeline-config.json');
const claudeJsonPath = path.join(require('os').homedir(), '.claude.json');

// ── CLI Args ──
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
const hasFlag = (flag) => args.includes(flag);

const phasesArg   = getArg('--phases')     || 'dev-story,code-review';
const complexity  = getArg('--complexity') || 'M';
const modelArg    = getArg('--model')      || 'opus';
const verbose     = hasFlag('--verbose');
const phases      = phasesArg.split(',').map(p => p.trim()).filter(Boolean);

// ── Constants ──
// Conservative daily token estimate for Max plan (BR-006)
const MAX_PLAN_DAILY_LIMIT = 5_000_000;

// ── Taiwan Timestamp ──
function nowTs() {
  const d = new Date();
  const offset = 8 * 60;
  const local = new Date(d.getTime() + (offset - d.getTimezoneOffset()) * 60000);
  return local.toISOString().replace('Z', '+08:00');
}

// ── Model key normalization ──
function normalizeModel(raw) {
  if (!raw) return 'opus';
  const m = raw.toLowerCase();
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  if (m.includes('fable'))  return 'fable';
  return raw;
}

// ── Open DB (readonly) ──
function openDb() {
  const Database = require(path.join(nodeModDir, 'better-sqlite3'));
  return new Database(dbPath, { readonly: true });
}

// ── Taiwan today start (00:00:00+08:00) ──
function todayStart() {
  const d = new Date();
  const offset = 8 * 60;
  const local = new Date(d.getTime() + (offset - d.getTimezoneOffset()) * 60000);
  const dateStr = local.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${dateStr}T00:00:00+08:00`;
}

// ── Read Extra Usage from .claude.json (BR-008) ──
function getExtraUsageStatus() {
  try {
    const raw = fs.readFileSync(claudeJsonPath, 'utf8');
    const data = JSON.parse(raw);
    const disabled = data.cachedExtraUsageDisabledReason;
    if (!disabled) return { enabled: true, reason: null };
    return { enabled: false, reason: disabled };
  } catch (_) {
    return { enabled: null, reason: 'cannot read .claude.json' };
  }
}

// ── Main ──
function main() {
  const modelKey = normalizeModel(modelArg);
  const warnings = [];

  let db;
  try { db = openDb(); }
  catch (err) {
    process.stderr.write(`[pipeline-quota-check] FATAL: Cannot open DB: ${err.message}\n`);
    process.exit(2);
  }

  // 1. Read benchmark baselines for each phase (BR-006)
  const phaseEstimates = [];
  let totalEstimatedTokens = 0;
  let hasBaseline = false;

  for (const phase of phases) {
    const metricName = `pipeline_tokens_${phase}_${complexity}`;
    let row;
    try {
      row = db.prepare(`
        SELECT baseline_value, current_value FROM benchmarks
        WHERE metric_name = ? AND context = ?
      `).get(metricName, modelKey);
    } catch (_) { row = null; }

    const baselineVal = row?.baseline_value ?? row?.current_value ?? null;
    if (baselineVal != null && baselineVal > 0) {
      hasBaseline = true;
      totalEstimatedTokens += baselineVal;
      phaseEstimates.push({ phase, estimated_tokens: Math.round(baselineVal), has_baseline: true });
    } else {
      phaseEstimates.push({ phase, estimated_tokens: 0, has_baseline: false });
    }
  }

  if (!hasBaseline) {
    warnings.push('基線不足 (<5 筆歷史紀錄)，無法精確預測。建議手動監控。');
  }

  // 2. Read today's accumulated consumption from workflow_executions (BR-008 All Models)
  const today = todayStart();
  let todayTokens = 0;
  let todayCost = 0;
  try {
    const row = db.prepare(`
      SELECT
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) AS total_tokens,
        SUM(cost_usd) AS total_cost
      FROM workflow_executions
      WHERE started_at >= ?
    `).get(today);
    todayTokens = Math.round(row?.total_tokens || 0);
    todayCost   = Math.round((row?.total_cost   || 0) * 1_000_000) / 1_000_000;
  } catch (err) {
    warnings.push(`今日消耗查詢失敗: ${err.message}`);
  }

  // 3. Current Session tokens (BR-008) — from today's rows ordered by time
  let sessionTokens = 0;
  try {
    const latestRow = db.prepare(`
      SELECT input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens AS total
      FROM workflow_executions
      WHERE started_at >= ?
      ORDER BY id DESC
      LIMIT 1
    `).get(today);
    sessionTokens = latestRow?.total || 0;
  } catch (_) { }

  // 4. Extra Usage status (BR-008)
  const extraUsage = getExtraUsageStatus();

  // 5. Today's 429 count (used as quota saturation signal)
  const logsDir = path.join(projectRoot, 'logs');
  let today429Count = 0;
  try {
    if (fs.existsSync(logsDir)) {
      const todayDate = todayStart().slice(0, 10);
      const logFiles = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log') && f.includes(todayDate));
      for (const lf of logFiles) {
        try {
          const content = fs.readFileSync(path.join(logsDir, lf), 'utf8');
          const matches = content.match(/rate_limit_error|You.ve hit your limit|quota exceeded|ResourceExhausted/g);
          today429Count += (matches?.length || 0);
        } catch (_) { }
      }
    }
  } catch (_) { }

  // 6. Quota estimation: use 429 signal or plan limit
  // If 429 today, estimated limit = todayTokens at time of 429 (approximate = current todayTokens)
  // If no 429, use MAX_PLAN_DAILY_LIMIT
  const estimatedDailyLimit = today429Count > 0 ? todayTokens : MAX_PLAN_DAILY_LIMIT;
  const remainingTokens = Math.max(0, estimatedDailyLimit - todayTokens);

  // 7. Decision logic (BR-006)
  let decision;
  let reason;
  let exitCode;

  if (!hasBaseline) {
    decision = 'GO';
    reason = '無基線資料，無法預測。建議手動監控配額使用量。';
    exitCode = 0;
  } else if (totalEstimatedTokens <= 0) {
    decision = 'GO';
    reason = '預期消耗為 0，配額充裕。';
    exitCode = 0;
  } else {
    const usageRatio = totalEstimatedTokens / Math.max(remainingTokens, 1);
    if (usageRatio > 1.0) {
      decision = 'BLOCK';
      reason = `預期消耗 ${totalEstimatedTokens.toLocaleString()} tokens，超過剩餘配額 ${remainingTokens.toLocaleString()} tokens。建議等待配額重置。`;
      exitCode = 2;
    } else if (usageRatio > 0.7) {
      decision = 'WARN';
      reason = `預期消耗 ${totalEstimatedTokens.toLocaleString()} tokens 達剩餘配額 ${(usageRatio * 100).toFixed(0)}%。建議降低並行數。`;
      exitCode = 1;
    } else {
      decision = 'GO';
      reason = `配額充裕（預期消耗 ${(usageRatio * 100).toFixed(0)}% 剩餘配額）。`;
      exitCode = 0;
    }
  }

  // 8. Build output (BR-008 three-layer quota display)
  const output = {
    decision,
    reason,
    warnings: warnings.length > 0 ? warnings : undefined,
    estimated_total_tokens: totalEstimatedTokens,
    phases: phaseEstimates,
    quota: {
      // Layer 1: Current Session
      current_session: { tokens: sessionTokens },
      // Layer 2: All Models today
      all_models_today: { tokens: todayTokens, cost_usd: todayCost },
      // Layer 3: Extra Usage
      extra_usage: extraUsage,
      // Derived
      estimated_daily_limit: estimatedDailyLimit,
      remaining_tokens: remainingTokens,
      today_429_signals: today429Count,
    },
    checked_at: nowTs(),
  };

  if (verbose) {
    process.stderr.write(`[pipeline-quota-check] phases=${phasesArg} complexity=${complexity} model=${modelKey}\n`);
    process.stderr.write(`[pipeline-quota-check] todayTokens=${todayTokens} estimatedTotal=${totalEstimatedTokens} remaining=${remainingTokens}\n`);
    process.stderr.write(`[pipeline-quota-check] decision=${decision}\n`);
  }

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');

  try { db.close(); } catch (_) { }
  process.exit(exitCode);
}

main();
