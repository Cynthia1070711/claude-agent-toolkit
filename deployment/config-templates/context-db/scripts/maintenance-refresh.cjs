#!/usr/bin/env node
// ============================================================
// PhyCool Search Infrastructure Maintenance Refresh
// ============================================================
// 統一觸發 5 個檢索基礎建設更新動作:
//   1. incremental-embed       — 處理 embedding_queue pending
//   2. compute-centrality      — 更新 god_nodes weighted PageRank
//   3. scan-doc-index          — 掃描 docs/** 同步 doc_index
//   4. sync-documents          — 更新 document_chunks + embeddings
//   5. backfill-doc-embeddings — 補 sync 後新增 chunks 的缺向量(V7 根治:doc embedding 無自動增量臂 · 改善計畫 §9-A4)
//
// Triggers:
//   - Manual:     node maintenance-refresh.cjs
//   - Dry run:    node maintenance-refresh.cjs --dry-run (列 5 步計畫 + staleness 狀態,不執行,無破壞)
//   - Force all:  node maintenance-refresh.cjs --force
//   - JSON out:   node maintenance-refresh.cjs --json
//   - Stale only: node maintenance-refresh.cjs --stale-only (skip if last < 3d)
//
// 設計理念:idempotent + sequential + per-step timeout + per-step exit-code
// 任一步失敗不阻擋下一步,最後彙總 status。
// ============================================================

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');
const { acquireLock } = require('./retrieval-lock.cjs');

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DB_PATH = path.join(SCRIPT_DIR, '..', 'phycool.db');
const STATE_FILE = path.join(SCRIPT_DIR, '..', '.last-maintenance-refresh.json');
const LOCK_PATH = path.join(SCRIPT_DIR, '..', '.retrieval-refresh.lock');

const STALE_DAYS = 3;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const JSON_OUT = args.includes('--json');
const STALE_ONLY = args.includes('--stale-only');

function nowTaiwan() {
  const d = new Date();
  const offset = 8 * 60 * 60 * 1000;
  return new Date(d.getTime() + offset).toISOString().replace('Z', '+08:00');
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { last_run: null, last_step_status: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function isStale(state) {
  if (!state.last_run) return true;
  const lastMs = new Date(state.last_run.replace(' ', 'T')).getTime();
  return (Date.now() - lastMs) > STALE_MS;
}

function runStep(name, scriptPath, extraArgs = [], timeoutMs = 300000) {
  if (!JSON_OUT) {
    process.stderr.write(`\n[maintenance] === ${name} ===\n`);
  }
  const start = Date.now();
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: PROJECT_ROOT,
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: JSON_OUT ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  });
  return {
    name,
    exit_code: result.status,
    duration_ms: Date.now() - start,
    error: result.error ? result.error.message : null,
  };
}

function checkDbAvailable() {
  if (!fs.existsSync(DB_PATH)) {
    process.stderr.write(`[maintenance] DB not found: ${DB_PATH}\n`);
    return false;
  }
  return true;
}

function main() {
  if (!checkDbAvailable()) process.exit(2);

  const state = loadState();
  const stale = isStale(state);

  const steps = [
    {
      name: 'incremental-embed',
      script: path.join(SCRIPT_DIR, 'incremental-embed.js'),
      args: FORCE ? ['--force'] : [],
      timeout: 600000, // 10 min
    },
    {
      name: 'compute-centrality',
      script: path.join(SCRIPT_DIR, 'compute-centrality.cjs'),
      args: [],
      timeout: 300000, // 5 min
    },
    {
      name: 'scan-doc-index',
      script: path.join(SCRIPT_DIR, 'scan-doc-index.js'),
      args: [],
      timeout: 300000, // 5 min
    },
    {
      name: 'sync-documents',
      script: path.join(SCRIPT_DIR, 'sync-documents.js'),
      args: [],
      timeout: 600000, // 10 min
    },
    {
      // V7 根治(2026-05-27):doc embedding 無自動增量臂(sync-documents 只寫 chunks 不 embed)
      // → 補在 sync 後,補新增 chunks 缺向量。idempotent(NOT IN)+ --limit 控單次 ONNX CPU。
      name: 'backfill-doc-embeddings',
      script: path.join(SCRIPT_DIR, 'backfill-doc-embeddings.js'),
      args: ['--limit', '2000'],
      timeout: 600000, // 10 min
    },
  ];

  // --dry-run(2026-07-25 補):總是列完整 5 步計畫 + staleness 狀態,不執行任何步驟、不取鎖,無破壞。
  // 與 refresh-all-retrieval.cjs / harvest-and-reembed.cjs 的 --dry-run 慣例一致(steps 定義共用同一
  // 陣列,避免 dry-run 顯示的計畫與實際執行的步驟各自維護一份而漂移)。
  if (DRY) {
    const wouldSkipStaleOnly = STALE_ONLY && !FORCE && !stale;
    const plan = steps.map((s) => {
      const exists = fs.existsSync(s.script);
      const argsStr = s.args.length ? ` ${s.args.join(' ')}` : '';
      return `${s.name}${argsStr}${exists ? '' : ' [MISSING SCRIPT]'}`;
    });
    const out = {
      result: 'dry_run',
      stale_days_threshold: STALE_DAYS,
      last_run: state.last_run,
      is_stale: stale,
      would_skip_stale_only: wouldSkipStaleOnly,
      plan,
    };
    if (JSON_OUT) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      process.stderr.write('[maintenance] --dry-run(無破壞,不執行任何步驟、不取鎖)\n');
      process.stderr.write(`  staleness    : last_run=${state.last_run || '(從未執行)'} stale=${stale}(閾值 ${STALE_DAYS}d)\n`);
      process.stderr.write(`  --stale-only : ${wouldSkipStaleOnly ? '會跳過(not stale;用 --force 覆蓋)' : '不會跳過,會執行以下 5 步'}\n`);
      process.stderr.write('  5 步計畫(依序,任一失敗不阻擋下一步):\n');
      plan.forEach((p) => process.stderr.write(`    - ${p}\n`));
    }
    process.exit(0);
  }

  if (STALE_ONLY && !FORCE && !stale) {
    if (!JSON_OUT) {
      process.stderr.write(`[maintenance] not stale (last_run=${state.last_run}, < ${STALE_DAYS} days), skipping\n`);
    } else {
      console.log(JSON.stringify({ skipped: true, reason: 'not_stale', last_run: state.last_run, stale_days: STALE_DAYS }));
    }
    process.exit(0);
  }

  // 並行防呆(2026-07-25):與 refresh-all-retrieval.cjs / sync-retrieval-doc-counters.cjs 共用同一把鎖。
  // Reentrant:若由 refresh-all-retrieval.cjs 內部呼叫(已持鎖),env flag 已設,本腳本略過自行取鎖。
  if (!process.env.RETRIEVAL_REFRESH_LOCK_HELD) {
    try {
      acquireLock(LOCK_PATH, { label: 'maintenance-refresh' });
    } catch (err) {
      process.stderr.write(`[maintenance] ⛔ ${err.message}\n`);
      process.exit(3);
    }
  }

  const results = [];
  for (const step of steps) {
    if (!fs.existsSync(step.script)) {
      results.push({ name: step.name, exit_code: -1, error: 'script not found', skipped: true });
      continue;
    }
    results.push(runStep(step.name, step.script, step.args, step.timeout));
  }

  const allOk = results.every(r => r.exit_code === 0);
  const summary = {
    run_at: nowTaiwan(),
    all_ok: allOk,
    steps: results,
  };

  state.last_run = summary.run_at;
  state.last_step_status = Object.fromEntries(results.map(r => [r.name, r.exit_code === 0 ? 'ok' : 'fail']));
  saveState(state);

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    process.stderr.write('\n[maintenance] === Summary ===\n');
    results.forEach(r => {
      const status = r.exit_code === 0 ? 'OK' : 'FAIL';
      process.stderr.write(`  ${r.name}: ${status} (${r.duration_ms}ms)${r.error ? ' err=' + r.error : ''}\n`);
    });
    process.stderr.write(`[maintenance] all_ok=${allOk}\n`);
  }

  process.exit(allOk ? 0 : 1);
}

if (require.main === module) main();

module.exports = { main, isStale, STALE_DAYS };
