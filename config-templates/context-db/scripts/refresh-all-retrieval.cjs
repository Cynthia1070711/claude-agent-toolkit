#!/usr/bin/env node
// ============================================================
// refresh-all-retrieval.cjs — 一鍵全面更新所有檢索架構 (total orchestrator)
// ============================================================
// 編排既有 wrapper/script(90%+ 重用,不重造邏輯),一次更新所有 DB 內檢索引擎 + 可選 GitNexus:
//   Phase 1  symbol graph : harvest-and-reembed.cjs --force
//                           → symbol_index + symbol_embeddings + god_nodes(harvest→re-embed→centrality + fail-safe 三層)
//   Phase 2  doc + queue  : maintenance-refresh.cjs --force
//                           → incremental-embed + scan-doc-index + sync-documents + backfill-doc-embeddings(+ compute-centrality)
//   Phase 3  GitNexus     : [--with-gitnexus] npx gitnexus analyze(reindex ~3-5min · 預設 SKIP)
//   Phase 4  drift 偵測    : verify-retrieval-architecture.cjs(報告 README/HTML/SKILL vs DB drift · 不自動寫回)
//   (CodeGraph : file watcher ~500ms 自動 re-index,無需編排)
//
// 使用者裁定(2026-05-27 Party Mode):
//   ① 每次強制全量重建(--force 傳子 wrapper,非 staleness gate · 「我就是要全部重來」)
//   ② GitNexus flag 控制(--with-gitnexus 預設關 · 因慢 3-5min + git commit 後才需 reindex)
//   ③ verify 報告 drift 不自動寫回(對齊「會話型計數手動維護 + 批次重建型 agent/人確認後修」feedback)
//
// Usage:
//   node .context-db/scripts/refresh-all-retrieval.cjs                 # 全量重建 symbol+doc+verify(~1-2min)
//   node .context-db/scripts/refresh-all-retrieval.cjs --with-gitnexus # + GitNexus reindex(~4-7min)
//   node .context-db/scripts/refresh-all-retrieval.cjs --dry-run       # 只列計畫不執行(無破壞)
//   node .context-db/scripts/refresh-all-retrieval.cjs --json          # JSON 輸出
//
// 破壞風險: 繼承 harvest-and-reembed.cjs fail-safe 三層(F-S2 symbol_index 暴跌 abort / F-S3 embedding 95% /
//   harvest 從 CodeGraph 可重現)。任一 core phase 失敗 → 後續仍跑(per-step exit-code),最後彙總。
//
// Pre-Audit 對齊: harvest-and-reembed(100%) + maintenance-refresh(100%) + verify(100%) 重用;
//   新增 = 4-phase 編排 + GitNexus thin 調用。不改既有任何 script。
//
// 2026-05-27 · Track: 開發環境檢索架構改善 · 封裝於 SKILL phycool-retrieval-refresh
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { acquireLock } = require('./retrieval-lock.cjs');

const SCRIPT_DIR = __dirname;
const BASE = path.resolve(SCRIPT_DIR, '..');             // .context-db
const PROJECT_ROOT = path.resolve(BASE, '..');
const DB_PATH = path.join(BASE, 'phycool.db');
const LOCK_PATH = path.join(BASE, '.retrieval-refresh.lock');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const WITH_GITNEXUS = args.includes('--with-gitnexus');
const JSON_OUT = args.includes('--json');

function log(m) { if (!JSON_OUT) process.stderr.write(m + '\n'); }
function nowTaipei() { return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }) + '+08:00'; }

// 執行 node 子 script
function runNode(name, scriptPath, extraArgs, timeoutMs) {
  log(`\n[refresh-all] ===== ${name} =====`);
  const start = Date.now();
  const r = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd: PROJECT_ROOT, timeout: timeoutMs, encoding: 'utf8',
    // RETRIEVAL_REFRESH_LOCK_HELD: 告知子行程「本行程鏈已持鎖」,harvest-and-reembed.cjs /
    // maintenance-refresh.cjs 見此旗標會略過自行取鎖(reentrant,避免自己鎖自己誤判衝突)。
    env: { ...process.env, RETRIEVAL_REFRESH_LOCK_HELD: '1' },
    stdio: JSON_OUT ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  });
  return { name, exit_code: r.status, duration_ms: Date.now() - start, error: r.error ? r.error.message : null };
}

// 執行外部 CLI(GitNexus · shell:true 走 PATH/npx)
function runShell(name, cmd, cmdArgs, timeoutMs) {
  log(`\n[refresh-all] ===== ${name} =====`);
  const start = Date.now();
  const r = spawnSync(cmd, cmdArgs, {
    cwd: PROJECT_ROOT, timeout: timeoutMs, encoding: 'utf8', shell: true,
    stdio: JSON_OUT ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  });
  return { name, exit_code: r.status, duration_ms: Date.now() - start, error: r.error ? r.error.message : null };
}

function main() {
  if (!fs.existsSync(DB_PATH)) { log(`[refresh-all] DB not found: ${DB_PATH}`); process.exit(2); }

  const plan = [
    '① symbol graph : harvest-and-reembed.cjs --force (symbol_index + symbol_embeddings + god_nodes + fail-safe 三層)',
    '② doc + queue  : maintenance-refresh.cjs --force (incremental-embed + scan-doc-index + sync-documents + backfill-doc-embeddings)',
    WITH_GITNEXUS ? '③ GitNexus    : npx gitnexus analyze (reindex ~3-5min)' : '③ GitNexus    : SKIP (加 --with-gitnexus 啟用)',
    '④ drift 偵測   : verify-retrieval-architecture.cjs (報告 drift,不自動寫回)',
    'CodeGraph     : file watcher 自動(~500ms),無需編排',
  ];
  const out = { run_at: nowTaipei(), with_gitnexus: WITH_GITNEXUS, force_full: true, plan, steps: [], verify_exit: null, result: null };

  if (DRY) {
    out.result = 'dry_run';
    log('[refresh-all] --dry-run 全量重建執行計畫(不執行,無破壞):');
    plan.forEach(p => log('  ' + p));
    log('  決策: 每次強制全量(--force) · GitNexus flag 控制 · verify 報告不寫回');
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  // 並行防呆(2026-07-25):與 sync-retrieval-doc-counters.cjs --apply 共用同一把鎖 ——
  // 兩者皆會動 phycool.db 或衍生文檔,不可重疊執行(見 retrieval-lock.cjs 註解)。
  let releaseLock;
  try {
    releaseLock = acquireLock(LOCK_PATH, { label: 'refresh-all-retrieval' });
  } catch (err) {
    log(`[refresh-all] ⛔ ${err.message}`);
    if (JSON_OUT) console.log(JSON.stringify({ result: 'locked', error: err.message }, null, 2));
    process.exit(3);
  }

  log(`[refresh-all] 全面更新所有檢索架構 開始(force_full=true · with_gitnexus=${WITH_GITNEXUS})@ ${out.run_at}`);

  // Phase 1: symbol graph(harvest + re-embed + centrality + fail-safe 三層)
  out.steps.push(runNode('symbol-graph (harvest-and-reembed --force)', path.join(SCRIPT_DIR, 'harvest-and-reembed.cjs'), ['--force'], 1500000)); // 25min

  // Phase 2: doc + queue(maintenance 含 compute-centrality 與 P1 重複一次,冪等無害)
  out.steps.push(runNode('doc-and-queue (maintenance-refresh --force)', path.join(SCRIPT_DIR, 'maintenance-refresh.cjs'), ['--force'], 1500000));

  // Phase 3: GitNexus reindex(flag 控制 · 預設 SKIP)
  if (WITH_GITNEXUS) {
    out.steps.push(runShell('gitnexus-reindex (npx gitnexus analyze)', 'npx', ['gitnexus', 'analyze'], 900000)); // 15min
  } else {
    log('\n[refresh-all] ===== GitNexus: SKIP(加 --with-gitnexus 啟用 · 因慢 3-5min + git commit 後才需 reindex) =====');
  }

  // Phase 4: drift 偵測(報告不寫回 · verify exit 非 0 = 文檔 drift,不阻 core 成敗)
  const verify = runNode('drift-verify (verify-retrieval-architecture)', path.join(SCRIPT_DIR, 'verify-retrieval-architecture.cjs'), [], 120000);
  out.steps.push(verify);
  out.verify_exit = verify.exit_code;

  // core phase(symbol/doc/gitnexus)exit code 決定成敗;verify 僅報告
  const coreSteps = out.steps.filter(s => !s.name.startsWith('drift-verify'));
  const coreOk = coreSteps.every(s => s.exit_code === 0);
  out.result = coreOk ? (verify.exit_code === 0 ? 'ok' : 'ok_with_doc_drift') : 'core_step_failed';

  log(`\n[refresh-all] ===== Summary =====`);
  out.steps.forEach(s => log(`  ${s.name}: ${s.exit_code === 0 ? 'OK' : 'FAIL/DRIFT'}(${(s.duration_ms / 1000).toFixed(1)}s)${s.error ? ' err=' + s.error : ''}`));
  log(`[refresh-all] result=${out.result}`);
  if (out.verify_exit !== 0) log(`[refresh-all] ⚠️ verify 偵測文檔 drift(exit ${out.verify_exit})→ 見上方 verify 報告,手動/agent 校正 README/SKILL/CLAUDE.md(本工具不自動寫回 · 對齊使用者裁定)`);
  if (WITH_GITNEXUS) log(`[refresh-all] ℹ️ GitNexus reindex 後 CLAUDE.md §GitNexus 數字(nodes/edges)可能需手動同步 — verify 不涵蓋跨引擎 GitNexus index`);

  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
  releaseLock();
  process.exit(coreOk ? 0 : 1);
}

main();
