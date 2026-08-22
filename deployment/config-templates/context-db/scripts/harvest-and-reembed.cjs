#!/usr/bin/env node
// ============================================================
// harvest-and-reembed.cjs — G14 RepoMap v2 P3 半自動安全 wrapper
// ============================================================
// 串接既有 3 腳本(不改它們)+ staleness gate + fail-safe 三層,
// 解決 D2(symbol_index 脫 2026-03-28 凍結 → 追蹤 CodeGraph live watcher)。
//
//   ① staleness gate : codegraph.db mtime vs symbol_index MAX(indexed_at)
//                       差 < HARVEST_STALE_DAYS(預設 7d)→ skip(no-op);--force 跳過
//   ② pre-snapshot   : 記錄 symbol_index / symbol_dependencies / symbol_embeddings count
//   ③ harvest        : harvest-codegraph-to-symbolgraph.cjs(transaction 重建 + 清空 symbol_embeddings)
//   ④ F-S2 驗證       : harvest 後 symbol_index ≥ snapshot × 0.8 ?(CodeGraph 圖損壞防護)否則 abort
//   ⑤ re-embed       : generate-embeddings.js --incremental(idempotent · 只補無向量的 symbol)
//   ⑥ F-S3 驗證       : symbol_embeddings ≥ symbol_index × 0.95 ? 未達標 warn(下次 maintenance 續補)
//   ⑦ compute-centrality : compute-centrality.cjs --force(harvest 後重算 god_nodes)
//
// Usage:
//   node .context-db/scripts/harvest-and-reembed.cjs --dry-run    # 只檢查 gate + snapshot,不執行(無破壞)
//   node .context-db/scripts/harvest-and-reembed.cjs              # staleness gate 把關,夠 stale 才跑
//   node .context-db/scripts/harvest-and-reembed.cjs --force      # 跳過 gate 強制執行(首次手動監督用)
//   node .context-db/scripts/harvest-and-reembed.cjs --json       # JSON 輸出
//   --stale-days N   # 自訂 staleness 閾值(預設 7)
//
// 破壞風險防護理念:
//   harvest 從 CodeGraph 圖「可重現」→ 真風險僅 ③→⑤ 之間 symbol_embeddings 偏低窗口
//   → wrapper 內連續執行縮小窗口 + generate-embeddings --incremental 為 idempotent,
//     單次中斷下次續補,不會永久歸零。不依賴 1GB phycool.db backup。
//
// Pre-Audit 對齊: 重用 harvest(100%) + generate-embeddings(100%) + compute-centrality + maintenance 範式;
//   新增 = staleness gate + fail-safe 三層(原 0% 對齊缺口)。不改既有 3 腳本。
//
// 2026-05-27 · Track: 開發環境檢索架構改善 P3 · 改善計畫 §6.7 + 交接 §7 · 半自動(先手動監督,觀察安全後再評估掛 maintenance)
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { acquireLock } = require('./retrieval-lock.cjs');

const SCRIPT_DIR = __dirname;
const BASE = path.resolve(SCRIPT_DIR, '..');               // .context-db
const PROJECT_ROOT = path.resolve(BASE, '..');
const DB_PATH = path.join(BASE, 'phycool.db');
const CG_PATH = path.join(PROJECT_ROOT, '.codegraph', 'codegraph.db');
const LOCK_PATH = path.join(BASE, '.retrieval-refresh.lock');
const Database = require(path.join(BASE, 'node_modules', 'better-sqlite3'));

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const JSON_OUT = args.includes('--json');

let HARVEST_STALE_DAYS = 7;
const sdIdx = args.indexOf('--stale-days');
if (sdIdx >= 0) { const v = parseInt(args[sdIdx + 1], 10); if (Number.isFinite(v) && v >= 0) HARVEST_STALE_DAYS = v; }

const FS2_MIN_RATIO = 0.8;    // harvest 後 symbol_index 不得低於 snapshot 的 80%(防 CodeGraph 圖損壞)
const FS3_MIN_RATIO = 0.95;   // re-embed 後 symbol_embeddings 須達 symbol_index 的 95%

function log(msg) { if (!JSON_OUT) process.stderr.write(msg + '\n'); }
function nowTaipei() { return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }) + '+08:00'; }

function snapshot(db) {
  return {
    symbol_index: db.prepare('SELECT COUNT(1) c FROM symbol_index').get().c,
    symbol_dependencies: db.prepare('SELECT COUNT(1) c FROM symbol_dependencies').get().c,
    symbol_embeddings: db.prepare('SELECT COUNT(1) c FROM symbol_embeddings').get().c,
    symbol_index_indexed_at: db.prepare('SELECT MAX(indexed_at) m FROM symbol_index').get().m,
  };
}

// staleness gate: codegraph.db mtime vs symbol_index MAX(indexed_at)
function checkStaleness() {
  if (!fs.existsSync(CG_PATH)) return { stale: false, reason: 'codegraph.db 不存在 → 無法 harvest', cg_mtime: null, si_indexed_at: null, diff_days: null };
  const cgMtime = fs.statSync(CG_PATH).mtime;
  const db = new Database(DB_PATH, { readonly: true });
  const siRaw = db.prepare('SELECT MAX(indexed_at) m FROM symbol_index').get().m;
  db.close();
  if (!siRaw) return { stale: true, reason: 'symbol_index 無 indexed_at(空表)→ 須 harvest', cg_mtime: cgMtime.toISOString(), si_indexed_at: null, diff_days: null };
  const siTime = new Date(String(siRaw).replace(' ', 'T'));
  const diffDays = (cgMtime.getTime() - siTime.getTime()) / (24 * 3600 * 1000);
  return {
    stale: diffDays >= HARVEST_STALE_DAYS,
    reason: `codegraph 比 symbol_index 新 ${diffDays.toFixed(2)} 天(閾值 ${HARVEST_STALE_DAYS}d)`,
    cg_mtime: cgMtime.toISOString(), si_indexed_at: siRaw, diff_days: Number(diffDays.toFixed(3)),
  };
}

function runStep(name, scriptPath, extraArgs, timeoutMs) {
  log(`\n[harvest-reembed] === ${name} ===`);
  const start = Date.now();
  const r = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: PROJECT_ROOT, timeout: timeoutMs, encoding: 'utf8',
    stdio: JSON_OUT ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  });
  return { name, exit_code: r.status, duration_ms: Date.now() - start, error: r.error ? r.error.message : null };
}

function emit(out, exitCode) {
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  process.exit(exitCode);
}

function main() {
  if (!fs.existsSync(DB_PATH)) { log(`[harvest-reembed] DB not found: ${DB_PATH}`); process.exit(2); }

  const gate = checkStaleness();
  const db0 = new Database(DB_PATH, { readonly: true });
  const snap = snapshot(db0);
  db0.close();

  const out = { run_at: nowTaipei(), stale_days_threshold: HARVEST_STALE_DAYS, gate, pre_snapshot: snap, steps: [], result: null };

  // --dry-run: 總是印完整 gate + snapshot,不執行任何破壞性步驟
  if (DRY) {
    out.result = 'dry_run';
    log(`[harvest-reembed] --dry-run(無破壞)`);
    log(`  staleness gate : stale=${gate.stale} — ${gate.reason}`);
    log(`  codegraph.db   : ${gate.cg_mtime}`);
    log(`  symbol_index   : indexed_at=${gate.si_indexed_at}`);
    log(`  pre-snapshot   : symbol_index=${snap.symbol_index} deps=${snap.symbol_dependencies} embeddings=${snap.symbol_embeddings}`);
    log(`  若執行(--force 或 gate.stale)會跑: harvest → re-embed --incremental → compute-centrality --force`);
    log(`  CodeGraph 圖損壞防護 F-S2: symbol_index < ${snap.symbol_index} × ${FS2_MIN_RATIO} = ${Math.floor(snap.symbol_index * FS2_MIN_RATIO)} → abort`);
    emit(out, 0);
  }

  // ① staleness gate(非 dry-run)
  if (!gate.stale && !FORCE) {
    out.result = 'skipped_not_stale';
    log(`[harvest-reembed] staleness gate: NOT stale(${gate.reason})→ skip。需要時用 --force 強制執行。`);
    emit(out, 0);
  }
  if (gate.cg_mtime === null) {
    out.result = 'skipped_no_codegraph';
    log(`[harvest-reembed] ${gate.reason} → 無法執行。`);
    emit(out, 2);
  }

  // 並行防呆(2026-07-25):與 refresh-all-retrieval.cjs / sync-retrieval-doc-counters.cjs 共用同一把鎖。
  // Reentrant:若由 refresh-all-retrieval.cjs 內部呼叫(已持鎖),env flag 已設,本腳本略過自行取鎖
  // (否則同一行程鏈自己鎖自己 = 假性衝突)。獨立直接執行(無 flag)時才自行取鎖。
  if (!process.env.RETRIEVAL_REFRESH_LOCK_HELD) {
    try {
      acquireLock(LOCK_PATH, { label: 'harvest-and-reembed' });
    } catch (err) {
      log(`[harvest-reembed] ⛔ ${err.message}`);
      out.result = 'locked';
      emit(out, 3);
    }
  }

  log(`[harvest-reembed] 啟動(gate.stale=${gate.stale}, force=${FORCE})。pre-snapshot: si=${snap.symbol_index} deps=${snap.symbol_dependencies} emb=${snap.symbol_embeddings}`);

  // ③ harvest
  const harvest = runStep('harvest', path.join(SCRIPT_DIR, 'harvest-codegraph-to-symbolgraph.cjs'), [], 300000);
  out.steps.push(harvest);
  if (harvest.exit_code !== 0) {
    out.result = 'harvest_failed';
    log(`[harvest-reembed] ❌ harvest 失敗(exit ${harvest.exit_code})→ abort。symbol graph 可能部分變更,請檢查 CodeGraph 後重跑。`);
    emit(out, 1);
  }

  // ④ F-S2: harvest 後 symbol_index 暴跌防護(CodeGraph 圖損壞)
  const db1 = new Database(DB_PATH, { readonly: true });
  const postHarvest = snapshot(db1);
  db1.close();
  out.post_harvest = postHarvest;
  if (snap.symbol_index > 0 && postHarvest.symbol_index < snap.symbol_index * FS2_MIN_RATIO) {
    out.result = 'fs2_abort_symbol_index_dropped';
    log(`[harvest-reembed] 🔴 F-S2 abort: symbol_index ${snap.symbol_index}→${postHarvest.symbol_index}(< ${FS2_MIN_RATIO * 100}%)— 疑 CodeGraph 圖損壞或空。`);
    log(`[harvest-reembed]    symbol_embeddings 已被 harvest 清空(${postHarvest.symbol_embeddings})→ 請檢查 CodeGraph(codegraph_status)後重跑本 wrapper,或手動 generate-embeddings --incremental 補回。`);
    emit(out, 1);
  }

  // ⑤ re-embed(idempotent · 補無向量的 symbol)
  const reembed = runStep('re-embed', path.join(SCRIPT_DIR, 'generate-embeddings.js'), ['--incremental'], 1200000); // 20 min
  out.steps.push(reembed);

  // ⑥ F-S3: 再生完整度驗證
  const db2 = new Database(DB_PATH, { readonly: true });
  const postEmbed = snapshot(db2);
  db2.close();
  out.post_embed = postEmbed;
  const embedRatio = postEmbed.symbol_index > 0 ? postEmbed.symbol_embeddings / postEmbed.symbol_index : 0;
  out.embed_ratio = Number(embedRatio.toFixed(4));
  if (embedRatio < FS3_MIN_RATIO) {
    log(`[harvest-reembed] ⚠️ F-S3 warn: symbol_embeddings ${postEmbed.symbol_embeddings}/${postEmbed.symbol_index}(${(embedRatio * 100).toFixed(1)}% < ${FS3_MIN_RATIO * 100}%)— 再生未完整。`);
    log(`[harvest-reembed]    idempotent: 重跑 generate-embeddings --incremental(或下次 maintenance)會續補。Layer 3 vec 暫時部分降級,symbol graph 本身已正確。`);
  }

  // ⑦ compute-centrality(harvest 後重算 god_nodes)
  const centrality = runStep('compute-centrality', path.join(SCRIPT_DIR, 'compute-centrality.cjs'), ['--force'], 300000);
  out.steps.push(centrality);

  const stepsOk = out.steps.every(s => s.exit_code === 0);
  const allOk = stepsOk && embedRatio >= FS3_MIN_RATIO;
  out.result = allOk ? 'ok' : 'completed_with_warnings';

  log(`\n[harvest-reembed] === Summary ===`);
  log(`  symbol_index:        ${snap.symbol_index} → ${postEmbed.symbol_index}`);
  log(`  symbol_dependencies: ${snap.symbol_dependencies} → ${postEmbed.symbol_dependencies}`);
  log(`  symbol_embeddings:   ${snap.symbol_embeddings} → ${postEmbed.symbol_embeddings}(${(embedRatio * 100).toFixed(1)}%)`);
  out.steps.forEach(s => log(`  ${s.name}: ${s.exit_code === 0 ? 'OK' : 'FAIL'}(${s.duration_ms}ms)${s.error ? ' err=' + s.error : ''}`));
  log(`[harvest-reembed] result=${out.result}`);

  emit(out, allOk ? 0 : 1);
}

main();
