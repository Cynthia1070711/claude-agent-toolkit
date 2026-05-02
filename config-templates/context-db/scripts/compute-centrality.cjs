#!/usr/bin/env node
/**
 * compute-centrality.cjs (deployment template)
 *
 * 對齊 capability-integration-mandate.md 5 步整合 + symbol_index.centrality_score schema
 *
 * 演算法(對齊 graphify analyze.py reasoning + RELATION_WEIGHTS):
 *   centrality_score(symbol) =
 *     0.6 * weighted_in_degree  +  // 「被引用」更代表 god node(被多檔依賴)
 *     0.4 * weighted_out_degree    // 「主動引用」次之(複雜度指標)
 *
 *   weighted_in_degree  = SUM(RELATION_WEIGHTS[t] for incoming edges of type t)
 *   weighted_out_degree = SUM(RELATION_WEIGHTS[t] for outgoing edges of type t)
 *
 *   RELATION_WEIGHTS = { inherits:1.0, implements:0.9, calls:0.7, uses_inferred:0.4 }
 *     ↑ 來源: pre-prompt-rag.js Layer N(SSoT,跨檔同步必對齊)
 *
 * 用法:
 *   node .context-db/scripts/compute-centrality.cjs                   # 預設執行 + 寫 DB
 *   node .context-db/scripts/compute-centrality.cjs --dry-run         # 不寫 DB,只輸出統計
 *   node .context-db/scripts/compute-centrality.cjs --json            # JSON 輸出 distribution + top-N
 *   node .context-db/scripts/compute-centrality.cjs --top 20          # 顯示 top-N god nodes
 *   node .context-db/scripts/compute-centrality.cjs --domain Payment  # 限定 namespace
 *
 * Exit codes:
 *   0 = success
 *   1 = error / no symbols / no dependencies
 *
 * Stress test: T-S1 (200K scores stack overflow防護) — Math.min/max 改 reduce()
 */

'use strict';

const path = require('path');
const fs = require('fs');

// RELATION_WEIGHTS 必對齊 pre-prompt-rag.js 對應 RELATION_WEIGHTS 區段
// 跨檔同步:此處改 → 必同步 pre-prompt-rag.js & capability-integration-mandate.md Step 5
const RELATION_WEIGHTS = {
  inherits: 1.0,
  implements: 0.9,
  calls: 0.7,
  uses_inferred: 0.4,
};

const IN_DEGREE_WEIGHT = 0.6;
const OUT_DEGREE_WEIGHT = 0.4;

// 部署時依專案 DB 命名修改(預設 context-memory.db)
const DB_PATH = path.resolve(__dirname, '..', 'context-memory.db');

// ─────────────────────────────────────────────────────────────
// CLI parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
    topN: 10,
    domain: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--json') args.json = true;
    else if (a === '--top') args.topN = parseInt(argv[++i], 10) || 10;
    else if (a === '--domain') args.domain = argv[++i];
  }
  return args;
}

// ─────────────────────────────────────────────────────────────
// Centrality calculation
// ─────────────────────────────────────────────────────────────

/**
 * Pure function: 計算單一 symbol 的 centrality_score
 * @param {Array<{relation_type: string}>} incoming - 入邊
 * @param {Array<{relation_type: string}>} outgoing - 出邊
 * @returns {number} centrality_score
 */
function calcCentrality(incoming, outgoing) {
  const weightedIn = incoming.reduce((sum, e) => sum + (RELATION_WEIGHTS[e.relation_type] || 0), 0);
  const weightedOut = outgoing.reduce((sum, e) => sum + (RELATION_WEIGHTS[e.relation_type] || 0), 0);
  return IN_DEGREE_WEIGHT * weightedIn + OUT_DEGREE_WEIGHT * weightedOut;
}

/**
 * Compute P-th percentile threshold from sorted scores
 */
function percentile(scores, p) {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100));
  return sorted[idx];
}

/**
 * Build incoming / outgoing edge maps from symbol_dependencies
 * Key by full_name(對齊 server.js get_symbol_context query)
 */
function buildEdgeMaps(deps) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const d of deps) {
    if (!outgoing.has(d.source_symbol)) outgoing.set(d.source_symbol, []);
    outgoing.get(d.source_symbol).push({ relation_type: d.relation_type, target: d.target_symbol });
    if (!incoming.has(d.target_symbol)) incoming.set(d.target_symbol, []);
    incoming.get(d.target_symbol).push({ relation_type: d.relation_type, source: d.source_symbol });
  }
  return { incoming, outgoing };
}

// ─────────────────────────────────────────────────────────────
// Main routine
// ─────────────────────────────────────────────────────────────

function run(args) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    console.error('[compute-centrality] better-sqlite3 not available');
    return { exitCode: 1 };
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[compute-centrality] DB not found: ${DB_PATH}`);
    return { exitCode: 1 };
  }

  const db = new Database(DB_PATH, { readonly: args.dryRun });

  // Verify schema(post-migration check)
  const cols = db.prepare(`PRAGMA table_info(symbol_index)`).all();
  if (!cols.find(c => c.name === 'centrality_score')) {
    console.error('[compute-centrality] symbol_index.centrality_score column not found. Run migration first:');
    console.error('  sqlite3 .context-db/<db-name>.db < .context-db/migrations/<date>-add-symbol-centrality-score.sql');
    db.close();
    return { exitCode: 1 };
  }

  // Load symbols + dependencies
  const symbols = db.prepare(`
    SELECT id, full_name, file_path, namespace, symbol_type, symbol_name
    FROM symbol_index
  `).all();

  const deps = db.prepare(`SELECT source_symbol, target_symbol, relation_type FROM symbol_dependencies`).all();

  if (symbols.length === 0) {
    console.error('[compute-centrality] symbol_index is empty');
    db.close();
    return { exitCode: 1 };
  }

  console.error(`[compute-centrality] Loaded ${symbols.length} symbols + ${deps.length} dependencies`);

  // Build edge maps once
  const { incoming, outgoing } = buildEdgeMaps(deps);

  // Compute centrality for each symbol
  const results = [];
  for (const s of symbols) {
    const inEdges = incoming.get(s.full_name) || [];
    const outEdges = outgoing.get(s.full_name) || [];
    const score = calcCentrality(inEdges, outEdges);
    results.push({
      id: s.id,
      full_name: s.full_name,
      symbol_name: s.symbol_name,
      namespace: s.namespace,
      file_path: s.file_path,
      symbol_type: s.symbol_type,
      in_degree: inEdges.length,
      out_degree: outEdges.length,
      weighted_in: inEdges.reduce((s, e) => s + (RELATION_WEIGHTS[e.relation_type] || 0), 0),
      weighted_out: outEdges.reduce((s, e) => s + (RELATION_WEIGHTS[e.relation_type] || 0), 0),
      centrality_score: score,
    });
  }

  // Compute distribution
  // SECURITY: avoid Math.min/max(...spread) — V8 spread arg limit ~125K causes
  // RangeError when symbol_index grows large. Use reduce() instead.
  const scores = results.map(r => r.centrality_score);
  const distribution = {
    min: scores.length === 0 ? 0 : scores.reduce((m, v) => (v < m ? v : m), Infinity),
    max: scores.length === 0 ? 0 : scores.reduce((m, v) => (v > m ? v : m), -Infinity),
    mean: scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length,
    median: percentile(scores, 50),
    p75: percentile(scores, 75),
    p90: percentile(scores, 90),
    p95: percentile(scores, 95),
    p99: percentile(scores, 99),
    nonzero_count: scores.filter(s => s > 0).length,
  };

  // Top-N god nodes
  const sortedDesc = [...results].sort((a, b) => b.centrality_score - a.centrality_score);
  let topN = sortedDesc.slice(0, args.topN);
  if (args.domain) {
    topN = sortedDesc.filter(r => r.namespace && r.namespace.includes(args.domain)).slice(0, args.topN);
  }

  // Write to DB(unless dry-run)
  let updateCount = 0;
  if (!args.dryRun) {
    const updateStmt = db.prepare(`UPDATE symbol_index SET centrality_score = ? WHERE id = ?`);
    const tx = db.transaction((rows) => {
      for (const r of rows) {
        updateStmt.run(r.centrality_score, r.id);
        updateCount++;
      }
    });
    tx(results);
    console.error(`[compute-centrality] Updated ${updateCount} rows`);
  } else {
    console.error('[compute-centrality] --dry-run mode: no DB writes');
  }

  db.close();

  const out = {
    timestamp: new Date().toISOString(),
    dry_run: args.dryRun,
    total_symbols: results.length,
    total_dependencies: deps.length,
    updated_rows: updateCount,
    distribution,
    relation_weights: RELATION_WEIGHTS,
    formula: `centrality = ${IN_DEGREE_WEIGHT} * weighted_in + ${OUT_DEGREE_WEIGHT} * weighted_out`,
    top_god_nodes: topN.map(r => ({
      symbol_name: r.symbol_name,
      full_name: r.full_name,
      namespace: r.namespace,
      file_path: r.file_path,
      in_degree: r.in_degree,
      out_degree: r.out_degree,
      centrality_score: +r.centrality_score.toFixed(2),
    })),
  };

  return { exitCode: 0, result: out };
}

// ─────────────────────────────────────────────────────────────
// Output formatters
// ─────────────────────────────────────────────────────────────

function renderJson(result) {
  return JSON.stringify(result, null, 2);
}

function renderConsole(result) {
  const lines = [];
  lines.push(`[compute-centrality] ${result.timestamp}`);
  lines.push(`  symbols: ${result.total_symbols} | deps: ${result.total_dependencies} | updated: ${result.updated_rows}`);
  lines.push(`  distribution:`);
  lines.push(`    min=${result.distribution.min.toFixed(2)}  max=${result.distribution.max.toFixed(2)}`);
  lines.push(`    mean=${result.distribution.mean.toFixed(2)}  median=${result.distribution.median.toFixed(2)}`);
  lines.push(`    p75=${result.distribution.p75.toFixed(2)}  p90=${result.distribution.p90.toFixed(2)}  p95=${result.distribution.p95.toFixed(2)}  p99=${result.distribution.p99.toFixed(2)}`);
  lines.push(`    non-zero: ${result.distribution.nonzero_count} / ${result.total_symbols}`);
  lines.push('');
  lines.push(`  Top ${result.top_god_nodes.length} god nodes:`);
  for (const g of result.top_god_nodes) {
    const ns = g.namespace ? ` [${g.namespace}]` : '';
    lines.push(`    ${g.centrality_score.toString().padStart(8)}  ${g.symbol_name}${ns}  in=${g.in_degree} out=${g.out_degree}`);
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

function main(argv) {
  const args = parseArgs(argv);
  const { exitCode, result } = run(args);
  if (result) {
    if (args.json) console.log(renderJson(result));
    else console.log(renderConsole(result));
  }
  return exitCode;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  parseArgs,
  calcCentrality,
  percentile,
  buildEdgeMaps,
  run,
  renderJson,
  renderConsole,
  RELATION_WEIGHTS,
  IN_DEGREE_WEIGHT,
  OUT_DEGREE_WEIGHT,
};
