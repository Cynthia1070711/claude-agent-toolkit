#!/usr/bin/env node
/**
 * pipeline-log-tokens.js — wfq-04 BR-004, BR-005
 * Pipeline 主流程在 phase 結束後直接寫入真實 token 數據至 workflow_executions。
 * 支援 --benchmark flag 自動計算 P50 基線並更新 benchmarks 表。
 *
 * Usage:
 *   node scripts/pipeline-log-tokens.js \
 *     --workflow-type "dev-story" \
 *     --story-id "wfq-04" \
 *     --model "claude-opus-4-6" \
 *     --status "completed" \
 *     --input-tokens 150000 \
 *     --output-tokens 8000 \
 *     --cache-read-tokens 120000 \
 *     --cache-creation-tokens 5000 \
 *     --cost-usd 3.45 \
 *     --duration-ms 1200000 \
 *     [--benchmark] [--complexity M]
 */
'use strict';

const path = require('path');
const fs   = require('fs');

// ── Paths ──
const projectRoot = path.resolve(__dirname, '..');
const dbPath      = path.join(projectRoot, '.context-db', 'phycool.db');
const nodeModDir  = path.join(projectRoot, '.context-db', 'node_modules');
const configPath  = path.join(projectRoot, 'scripts', 'pipeline-config.json');

// ── CLI Args ──
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
const hasFlag = (flag) => args.includes(flag);

const workflowType        = getArg('--workflow-type') || 'dev-story';
const storyId             = getArg('--story-id')      || null;
const model               = getArg('--model')          || null;
const status              = getArg('--status')         || 'completed';
const inputTokens         = parseInt(getArg('--input-tokens')          || '0', 10);
const outputTokens        = parseInt(getArg('--output-tokens')         || '0', 10);
const cacheReadTokens     = parseInt(getArg('--cache-read-tokens')     || '0', 10);
const cacheCreationTokens = parseInt(getArg('--cache-creation-tokens') || '0', 10);
const costUsd             = parseFloat(getArg('--cost-usd')            || '0');
const durationMs          = parseInt(getArg('--duration-ms')           || '0', 10) || null;
const complexity          = getArg('--complexity')     || 'M';
const doBenchmark         = hasFlag('--benchmark');

// ── Taiwan Timestamp ──
function nowTs() {
  const d = new Date();
  const offset = 8 * 60;
  const local = new Date(d.getTime() + (offset - d.getTimezoneOffset()) * 60000);
  return local.toISOString().replace('Z', '+08:00');
}

// ── Model key mapping (BR-003) ──
function getModelKey(rawModel) {
  if (!rawModel) return null;
  const m = rawModel.toLowerCase();
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku'))  return 'haiku';
  if (m.includes('fable'))  return 'fable';
  return null;
}

// ── Cost calculation (BR-003) ──
function calculateCost(inputT, outputT, cacheReadT, cacheCreateT, rawModel) {
  let pricing;
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const key = getModelKey(rawModel);
    pricing = key ? cfg.modelPricing[key] : null;
  } catch (_) { pricing = null; }

  if (!pricing) {
    process.stderr.write(`[pipeline-log-tokens] WARN: unknown model "${rawModel}", cost_usd=0\n`);
    return 0;
  }
  const cost = (inputT   / 1_000_000 * pricing.input)
             + (outputT  / 1_000_000 * pricing.output)
             + (cacheCreateT / 1_000_000 * pricing.cache_create)
             + (cacheReadT   / 1_000_000 * pricing.cache_read);
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}

// ── Open DB ──
function openDb(readonly = false) {
  const Database = require(path.join(nodeModDir, 'better-sqlite3'));
  return new Database(dbPath, { readonly });
}

// ── P50 calculation (BR-005) ──
function calcP50(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── Update Benchmark (BR-005) ──
function updateBenchmark(db, wfType, mdl, complexity, inputT, outputT, costUsdVal) {
  const modelKey = getModelKey(mdl) || mdl || 'unknown';
  const totalTokens = inputT + outputT;

  // Query last 20 records for same workflow_type + model
  const rows = db.prepare(`
    SELECT input_tokens, output_tokens
    FROM workflow_executions
    WHERE workflow_type = ?
      AND model LIKE ?
      AND input_tokens > 0
    ORDER BY id DESC
    LIMIT 20
  `).all(wfType, `%${modelKey}%`);

  if (rows.length < 5) {
    process.stdout.write(JSON.stringify({
      benchmark_updated: false,
      reason: `歷史紀錄不足 5 筆 (現有 ${rows.length} 筆)，跳過 benchmark 更新`,
    }) + '\n');
    return;
  }

  const totals = rows.map(r => (r.input_tokens || 0) + (r.output_tokens || 0));
  const p50 = calcP50(totals);

  const metricTokens = `pipeline_tokens_${wfType}_${complexity}`;
  const metricCost   = `pipeline_cost_${wfType}_${complexity}`;
  const ctx          = modelKey;
  const measuredAt   = nowTs();

  db.prepare(`
    INSERT INTO benchmarks (metric_name, context, baseline_value, current_value, unit, measured_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_name, context) DO UPDATE SET
      current_value  = excluded.current_value,
      baseline_value = COALESCE(excluded.baseline_value, benchmarks.baseline_value),
      measured_at    = excluded.measured_at
  `).run(metricTokens, ctx, p50, totalTokens, 'tokens', measuredAt, `P50 from ${rows.length} samples`);

  db.prepare(`
    INSERT INTO benchmarks (metric_name, context, baseline_value, current_value, unit, measured_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(metric_name, context) DO UPDATE SET
      current_value  = excluded.current_value,
      measured_at    = excluded.measured_at
  `).run(metricCost, ctx, null, costUsdVal, 'usd', measuredAt, `Latest phase cost`);

  process.stdout.write(JSON.stringify({
    benchmark_updated: true,
    metric_tokens: metricTokens,
    metric_cost:   metricCost,
    context:       ctx,
    p50_baseline:  p50,
    current_total: totalTokens,
    samples_used:  rows.length,
  }) + '\n');
}

// ── Main ──
function main() {
  // Auto-compute cost if not provided
  const effectiveCost = (costUsd > 0)
    ? costUsd
    : calculateCost(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, model);

  let db;
  try { db = openDb(false); }
  catch (err) {
    process.stderr.write(`[pipeline-log-tokens] FATAL: Cannot open DB: ${err.message}\n`);
    process.exit(1);
  }

  try {
    const now = nowTs();
    const completedAt = (status === 'completed' || status === 'failed') ? now : null;

    const result = db.prepare(`
      INSERT INTO workflow_executions
        (workflow_type, story_id, agent_id, status, started_at, completed_at,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         cost_usd, model, duration_ms, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflowType, storyId, null, status,
      now, completedAt,
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
      effectiveCost, model, durationMs, null
    );

    const insertedId = Number(result.lastInsertRowid);
    process.stdout.write(JSON.stringify({
      id:                   insertedId,
      workflow_type:        workflowType,
      story_id:             storyId,
      model:                model,
      status:               status,
      input_tokens:         inputTokens,
      output_tokens:        outputTokens,
      cache_read_tokens:    cacheReadTokens,
      cache_creation_tokens: cacheCreationTokens,
      cost_usd:             effectiveCost,
      duration_ms:          durationMs,
      message:              '✅ pipeline-log-tokens 寫入成功',
    }) + '\n');

    // Benchmark update if requested and tokens are non-zero (BR-005)
    if (doBenchmark && (inputTokens > 0 || outputTokens > 0)) {
      updateBenchmark(db, workflowType, model, complexity, inputTokens, outputTokens, effectiveCost);
    }
  } catch (err) {
    process.stderr.write(`[pipeline-log-tokens] ERROR: ${err.message}\n`);
    process.exit(1);
  } finally {
    try { db.close(); } catch (_) { }
  }
}

main();
