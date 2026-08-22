#!/usr/bin/env node
/**
 * ecc-haiku-eval.cjs — ECC-10 Phase 3 · Haiku dispatch quality 評估器 (D4 evaluation gate)
 *
 * 從 .context-db/ecc-state/dispatch_log.json 讀取 dispatch 紀錄,計算 D4 三指標:
 *   - success_rate  (status='success' / total · 對齊 IDD-STR-001 D4 criteria ≥ 90%)
 *   - latency       (avg / p95 · 從 entry.latency_ms · D4 criteria ≤ 5x Opus baseline)
 *   - token_cost    (已 instrument · gemini usageMetadata.totalTokenCount → dispatch_log token_count 欄
 *                    報 avg tokens · D4「≤50% Opus」比較需 Opus baseline 另計 · 不影響現有 gate 邏輯)
 *
 * 對齊 ecc-10 BR-ECC-10-02 (Haiku Agent dispatch quality 評估報告) + ADR-ECC-LEARNING-001 §D4。
 *
 * Run:
 *   node .claude/skills/ecc-haiku-dispatch/scripts/ecc-haiku-eval.cjs            # 全部 (mock+real)
 *   node .claude/skills/ecc-haiku-dispatch/scripts/ecc-haiku-eval.cjs --gate     # D4 gate (現役引擎 gemini · 明確命名)
 *   node .claude/skills/ecc-haiku-dispatch/scripts/ecc-haiku-eval.cjs --real     # 同 --gate (向後相容別名)
 *   node .claude/skills/ecc-haiku-dispatch/scripts/ecc-haiku-eval.cjs --json     # JSON 輸出
 *
 * Exit: 0 = D4 PASS (real success_rate ≥ 90%), 1 = D4 FAIL/INSUFFICIENT, 2 = error
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', '..', '..', '..', '.context-db', 'ecc-state', 'dispatch_log.json');
const REAL_ONLY = process.argv.includes('--real') || process.argv.includes('--gate');
const JSON_OUT = process.argv.includes('--json');

// D4 criteria (對齊 ADR-ECC-LEARNING-001 §D4 + IDD-STR-001 re_evaluation_trigger)
const D4 = { successRateMin: 0.90, opusLatencyBaselineMs: 6000, latencyMaxMultiplier: 5 };

// Dispatch engine 分層 — D2 amendment (ADR-ECC-LEARNING-001 v1.8.0) + 使用者裁定 A 案 (2026-05-27):
// dispatch 引擎由 Haiku pivot 為 Gemini-backed。D4 gate 衡量「現役引擎」品質,非合併計算。
//   CURRENT_ENGINE_MODES = 'gemini' (D2 後現役 dispatch 引擎) → D4 gate 計算基準
//   LEGACY_MODES = 'real' (pre-pivot Haiku · 已棄用) → 透明分段報告,不計入 gate
//     (legacy Haiku 實測 3/5 = 60% 成功 + 21-24s 慢,正是 D2 棄 Haiku 改 Gemini 的數據證據,保留可見不隱藏)
//   mock → 不計
const CURRENT_ENGINE_MODES = new Set(['gemini']);
const LEGACY_MODES = new Set(['real']);

function normalizeCRLF(s) { return s.replace(/^﻿/, '').replace(/\r\n/g, '\n'); }

function loadEntries() {
  if (!fs.existsSync(LOG_FILE)) throw new Error(`dispatch_log.json not found: ${LOG_FILE} (run init-ecc-state.cjs)`);
  const raw = normalizeCRLF(fs.readFileSync(LOG_FILE, 'utf8'));
  const obj = JSON.parse(raw);
  if (!Array.isArray(obj.entries)) throw new Error('dispatch_log.json .entries not an array');
  return obj.entries;
}

function pct(n, d) { return d === 0 ? 0 : n / d; }

function percentile(arr, p) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function evaluate(entries) {
  // D4 gate scope = 現役引擎 (gemini)。--real 旗標現意指「現役引擎 gate」(D2 後 Haiku 已棄用,使用者裁定 A 案)。
  const scoped = REAL_ONLY ? entries.filter(e => CURRENT_ENGINE_MODES.has(e.mode)) : entries;
  const total = scoped.length;
  const success = scoped.filter(e => e.status === 'success').length;
  const failure = scoped.filter(e => e.status === 'failure').length;
  const partial = scoped.filter(e => e.status === 'partial').length;
  // latency: 僅取有 latency_ms 且 > 0 的 entry (舊 entry 無此欄位 → 跳過 · 不假設)
  const latencies = scoped.filter(e => typeof e.latency_ms === 'number' && e.latency_ms > 0).map(e => e.latency_ms);
  const successRate = pct(success, total);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const p95Latency = percentile(latencies, 95);

  // token_cost: 從 entry.token_count 計算 avg (已 instrument · gemini dispatch 自動記錄)
  const tokenCounts = scoped.filter(e => typeof e.token_count === 'number' && e.token_count > 0).map(e => e.token_count);
  const avgTokens = tokenCounts.length ? Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length) : null;

  const currentEngineCount = entries.filter(e => CURRENT_ENGINE_MODES.has(e.mode)).length;

  // 透明分段:legacy Haiku (pre-pivot · D2 已棄用 · 不計入 gate · 保留可見作棄用證據)
  const legacy = entries.filter(e => LEGACY_MODES.has(e.mode));
  const legacySuccess = legacy.filter(e => e.status === 'success').length;
  const legacyStats = {
    mode: 'real (Haiku · pre-pivot)',
    total: legacy.length,
    success: legacySuccess,
    success_rate: Number(pct(legacySuccess, legacy.length).toFixed(3)),
    note: 'D2 棄 Haiku 改 Gemini 的數據證據 (60% + 21-24s 慢) · 不計入 D4 gate',
  };

  // D4 gate: 需足夠現役引擎樣本 (≥ 5) 才有統計意義;否則 INSUFFICIENT 而非 PASS/FAIL (誠實 · 不過早宣稱)
  const sufficientSample = REAL_ONLY ? total >= 5 : currentEngineCount >= 5;
  const successGate = successRate >= D4.successRateMin;
  const latencyGate = avgLatency === null ? null : avgLatency <= D4.opusLatencyBaselineMs * D4.latencyMaxMultiplier;

  let d4Status;
  if (!sufficientSample) d4Status = 'INSUFFICIENT-SAMPLE';
  else if (successGate && latencyGate !== false) d4Status = 'PASS';
  else d4Status = 'FAIL';

  return {
    scope: REAL_ONLY ? 'current-engine (gemini · D2)' : 'all',
    total, success, failure, partial,
    success_rate: Number(successRate.toFixed(3)),
    latency: { samples: latencies.length, avg_ms: avgLatency, p95_ms: p95Latency },
    token_cost: avgTokens !== null
      ? { samples: tokenCounts.length, avg_tokens: avgTokens, note: 'raw avg tokens · D4「≤50% Opus」比較需 Opus baseline 另計' }
      : 'N/A — 尚無 token 紀錄(已 instrument · 未來 gemini dispatch 自動記錄;舊紀錄無此欄)',
    current_engine_sample_count: currentEngineCount,
    legacy_haiku: legacyStats,
    d4: {
      criteria: D4,
      success_gate: successGate,
      latency_gate: latencyGate,
      sufficient_sample: sufficientSample,
      status: d4Status,
    },
  };
}

function main() {
  let r;
  try { r = evaluate(loadEntries()); } catch (e) {
    if (JSON_OUT) console.log(JSON.stringify({ error: e.message }, null, 2));
    else console.error(`[ERROR] ${e.message}`);
    process.exit(2);
  }
  if (JSON_OUT) { console.log(JSON.stringify(r, null, 2)); }
  else {
    console.log('▶ ecc-10 Phase 3 · Dispatch Quality (D4 evaluation gate · 現役引擎 Gemini-backed)');
    console.log('');
    console.log(`  Scope:          ${r.scope}`);
    console.log(`  Total:          ${r.total}  (success ${r.success} / failure ${r.failure} / partial ${r.partial})`);
    console.log(`  Success rate:   ${(r.success_rate * 100).toFixed(1)}%  (D4 需 ≥ ${(D4.successRateMin * 100)}%)`);
    console.log(`  Latency:        avg ${r.latency.avg_ms ?? 'n/a'}ms · p95 ${r.latency.p95_ms ?? 'n/a'}ms  (samples ${r.latency.samples} · D4 需 ≤ ${D4.opusLatencyBaselineMs * D4.latencyMaxMultiplier}ms)`);
    const tokenDisplay = (r.token_cost && typeof r.token_cost === 'object')
      ? `avg ${r.token_cost.avg_tokens} tokens (samples ${r.token_cost.samples}) · ${r.token_cost.note}`
      : r.token_cost;
    console.log(`  Token cost:     ${tokenDisplay}`);
    console.log(`  現役引擎 samples: ${r.current_engine_sample_count}  (gemini · D2)`);
    console.log(`  Legacy Haiku:   ${r.legacy_haiku.success}/${r.legacy_haiku.total} = ${(r.legacy_haiku.success_rate * 100).toFixed(1)}%  (pre-pivot · 不計 gate · ${r.legacy_haiku.note})`);
    console.log('');
    console.log(`  ▶ D4 Gate: ${r.d4.status}${r.d4.status === 'INSUFFICIENT-SAMPLE' ? `  (需 ≥ 5 現役引擎 dispatch · 現 ${r.current_engine_sample_count})` : ''}`);
  }
  process.exit(r.d4.status === 'PASS' ? 0 : 1);
}

main();
