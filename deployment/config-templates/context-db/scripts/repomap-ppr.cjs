#!/usr/bin/env node
/**
 * repomap-ppr.cjs — Personalized PageRank for PhyCool RepoMap v2 (G14 P2)
 *
 * 在 symbol_dependencies 圖上跑 Personalized PageRank(personalization seeds =
 * 當前任務 vec 命中符號),取代 Layer 3 的靜態 god_nodes centrality,讓結構權重
 * 「相對當前任務」而非全局。對齊 Aider repo-map SOTA(aider.chat/2023/10/22/repomap.html)。
 *
 * Aider 抗污染(改善計畫 §6.7):
 *   1. sqrt(reference_count) 阻尼 — 同 (source→target) 多次引用用 sqrt 聚合,壓制重複引用主導
 *   2. hub 壓制 — symbol_name 定義於 5+ 檔(泛用名 List/Ok/Build)→ ×0.1
 *   3. is_test 過濾 — 測試符號 teleport + 接收權重 ×0(重用 compute-centrality isTest)
 *   4. vendor/temp 排除 — wwwroot/lib · scripts/temp · node_modules · PHP SDK
 *
 * 範式: 重用 compute-centrality.cjs 的 RELATION_WEIGHTS + isTest(DRY · SSoT 對齊)。
 *
 * 用法(CLI 測試):
 *   node repomap-ppr.cjs --seeds "PhyCool.Web.Services.PaymentService.ProcessPayment" --top 20
 *   node repomap-ppr.cjs --seeds "a,b" --json
 *
 * Export: computePersonalizedPageRank(deps, seeds, symbolMeta, options) + buildSymbolMeta(db)
 * Spec: 改善計畫-專家深度分析.md §6.7 · 交接文檔 §7
 */

'use strict';

const path = require('path');
const fs = require('fs');

// DRY: 重用 compute-centrality.cjs 的 RELATION_WEIGHTS + isTest(SSoT 對齊,避免雙份權重 drift)
const { RELATION_WEIGHTS, isTest } = require(path.join(__dirname, 'compute-centrality.cjs'));

const DB_PATH = path.resolve(__dirname, '..', 'phycool.db');

// vendor/temp 排除 pattern(Aider 抗污染 #4)
const VENDOR_RE = /(^|[\\/])(wwwroot[\\/]lib|node_modules|scripts[\\/]temp|temp[\\/]|dist[\\/]|\.min\.)/i;
const HUB_FILE_THRESHOLD = 5;  // symbol_name 定義於 ≥5 檔 → 泛用名 hub
const HUB_PENALTY = 0.1;

// ─────────────────────────────────────────────────────────────
// buildSymbolMeta — 從 symbol_index 建抗污染 metadata
//   file_count: symbol_name → distinct file_path 數(泛用名偵測)
//   is_test / is_vendor: 過濾旗標
// ─────────────────────────────────────────────────────────────
function buildSymbolMeta(db) {
  const rows = db.prepare(
    `SELECT full_name, symbol_name, file_path, namespace FROM symbol_index`
  ).all();

  // symbol_name → Set<file_path>(泛用名 = 同名定義於多檔)
  const nameFiles = new Map();
  for (const r of rows) {
    if (!nameFiles.has(r.symbol_name)) nameFiles.set(r.symbol_name, new Set());
    nameFiles.get(r.symbol_name).add(r.file_path);
  }

  const meta = new Map();
  for (const r of rows) {
    meta.set(r.full_name, {
      is_test: isTest(r.namespace, r.file_path),
      is_vendor: VENDOR_RE.test(r.file_path || ''),
      file_count: nameFiles.get(r.symbol_name)?.size || 1,
    });
  }
  return meta;
}

// 抗污染懲罰因子(0 = 完全過濾,1 = 不懲罰)
function penaltyFactor(node, symbolMeta) {
  const m = symbolMeta.get(node);
  if (!m) return 1.0;             // 無 meta(可能 dep target 未在 symbol_index)→ 不懲罰
  if (m.is_test || m.is_vendor) return 0.0;        // is_test / vendor 過濾
  if (m.file_count >= HUB_FILE_THRESHOLD) return HUB_PENALTY;  // 泛用名 hub 壓制
  return 1.0;
}

// ─────────────────────────────────────────────────────────────
// computePersonalizedPageRank
//   deps: [{source_symbol, target_symbol, relation_type}]
//   seeds: [full_name] — personalization(當前任務 vec 命中符號)
//   symbolMeta: Map<full_name,{is_test,is_vendor,file_count}>
//   options: {damping=0.85, iterations=40, tolerance=1e-7}
//   → Map<full_name, ppr_score(0~1 normalized)>
// ─────────────────────────────────────────────────────────────
function computePersonalizedPageRank(deps, seeds, symbolMeta, options = {}) {
  const damping = options.damping ?? 0.85;
  const iterations = options.iterations ?? 40;
  const tolerance = options.tolerance ?? 1e-7;
  symbolMeta = symbolMeta || new Map();

  if (!deps || deps.length === 0) return new Map();

  // 1. 聚合邊 + sqrt(reference_count) 阻尼(Aider #1)
  //    同 (source→target) 多次 → 平均權重 × sqrt(count),壓制重複引用線性主導
  const edgeAgg = new Map();  // "src\x00tgt" → {source,target,wSum,count}
  for (const d of deps) {
    if (!d.source_symbol || !d.target_symbol) continue;
    const key = d.source_symbol + '\x00' + d.target_symbol;
    let e = edgeAgg.get(key);
    if (!e) { e = { source: d.source_symbol, target: d.target_symbol, wSum: 0, count: 0 }; edgeAgg.set(key, e); }
    e.wSum += RELATION_WEIGHTS[d.relation_type] || 0.3;
    e.count++;
  }

  // 2. 建 outgoing 鄰接(套 sqrt 阻尼 + target 抗污染懲罰)
  const outgoing = new Map();   // source → [{target, weight}]
  const allNodes = new Set();
  for (const e of edgeAgg.values()) {
    const avgW = e.wSum / e.count;
    const sqrtDamped = avgW * Math.sqrt(e.count);                 // Aider #1 sqrt 阻尼
    const tgtPenalty = penaltyFactor(e.target, symbolMeta);       // Aider #2/#3 hub/test
    const weight = sqrtDamped * tgtPenalty;
    allNodes.add(e.source);
    allNodes.add(e.target);
    if (weight <= 0) continue;   // 完全過濾的 target(test/vendor)不建邊
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source).push({ target: e.target, weight });
  }

  if (allNodes.size === 0) return new Map();

  // 3. personalization vector(seeds 均勻,過濾無效/被懲罰 seed)
  const validSeeds = (seeds || []).filter(s => allNodes.has(s) && penaltyFactor(s, symbolMeta) > 0);
  const p = new Map();
  if (validSeeds.length > 0) {
    const sw = 1 / validSeeds.length;
    for (const s of validSeeds) p.set(s, sw);
  } else {
    const uw = 1 / allNodes.size;   // fallback: uniform(等同全局 PageRank)
    for (const n of allNodes) p.set(n, uw);
  }

  // 4. 預計算每節點 out-weight 總和
  const outWeightSum = new Map();
  for (const [src, edges] of outgoing) {
    outWeightSum.set(src, edges.reduce((s, e) => s + e.weight, 0));
  }

  // 5. power iteration
  let pr = new Map();
  for (const n of allNodes) pr.set(n, p.get(n) || 0);

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map();
    let danglingMass = 0;
    for (const n of allNodes) next.set(n, (1 - damping) * (p.get(n) || 0));  // teleport

    for (const n of allNodes) {
      const prVal = pr.get(n) || 0;
      if (prVal === 0) continue;
      const edges = outgoing.get(n);
      const totalW = outWeightSum.get(n) || 0;
      if (!edges || totalW === 0) { danglingMass += prVal; continue; }  // dangling
      for (const e of edges) {
        next.set(e.target, (next.get(e.target) || 0) + damping * prVal * (e.weight / totalW));
      }
    }
    // dangling 質量重分配回 personalization(保 rank 守恆)
    if (danglingMass > 0) {
      for (const n of allNodes) {
        next.set(n, (next.get(n) || 0) + damping * danglingMass * (p.get(n) || 0));
      }
    }
    // 收斂檢查(L1 diff)
    let diff = 0;
    for (const n of allNodes) diff += Math.abs((next.get(n) || 0) - (pr.get(n) || 0));
    pr = next;
    if (diff < tolerance) break;
  }

  // 6. 套最終抗污染懲罰 + normalize 0~1
  const result = new Map();
  let maxScore = 0;
  for (const [n, score] of pr) {
    const adj = score * penaltyFactor(n, symbolMeta);
    result.set(n, adj);
    if (adj > maxScore) maxScore = adj;
  }
  if (maxScore > 0) {
    for (const [n, s] of result) result.set(n, s / maxScore);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// CLI 測試模式
// ─────────────────────────────────────────────────────────────
function loadDb() {
  let Database;
  try { Database = require(path.resolve(__dirname, '..', 'node_modules', 'better-sqlite3')); }
  catch { try { Database = require('better-sqlite3'); } catch { return null; } }
  if (!fs.existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly: true });
}

function main(argv) {
  const args = { seeds: [], top: 20, json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--seeds') args.seeds = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (argv[i] === '--top') args.top = parseInt(argv[++i], 10) || 20;
    else if (argv[i] === '--json') args.json = true;
  }
  const db = loadDb();
  if (!db) { console.error('[repomap-ppr] DB / better-sqlite3 not available'); return 1; }

  const deps = db.prepare(`SELECT source_symbol, target_symbol, relation_type FROM symbol_dependencies`).all();
  const symbolMeta = buildSymbolMeta(db);
  const t0 = Date.now();
  const ppr = computePersonalizedPageRank(deps, args.seeds, symbolMeta);
  const ms = Date.now() - t0;
  db.close();

  const ranked = [...ppr.entries()].sort((a, b) => b[1] - a[1]).slice(0, args.top);
  if (args.json) {
    console.log(JSON.stringify({ seeds: args.seeds, deps: deps.length, nodes: ppr.size, ms, top: ranked.map(([n, s]) => ({ symbol: n, score: +s.toFixed(4) })) }, null, 2));
  } else {
    console.log(`[repomap-ppr] seeds=${args.seeds.length} deps=${deps.length} nodes=${ppr.size} ${ms}ms`);
    console.log(`  Top ${ranked.length} PPR symbols${args.seeds.length ? ' (personalized)' : ' (global fallback)'}:`);
    for (const [n, s] of ranked) console.log(`    ${s.toFixed(4).padStart(8)}  ${n}`);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { computePersonalizedPageRank, buildSymbolMeta, penaltyFactor, VENDOR_RE, HUB_FILE_THRESHOLD, HUB_PENALTY };
