#!/usr/bin/env node
/**
 * compute-centrality.cjs
 *
 * Weighted PageRank centrality for PhyCool symbol graph.
 * Writes to god_nodes table (td-god-nodes-table-rebuild, 2026-05-11).
 *
 * Algorithm (ADR-GOVERNANCE-001 §6.4 + RELATION_WEIGHTS SSoT pre-prompt-rag.js):
 *   centrality_score = 0.6 * weighted_in_degree + 0.4 * weighted_out_degree
 *   RELATION_WEIGHTS = { inherits:1.0, implements:0.9, calls:0.7, uses_inferred:0.4 }
 *
 * Usage:
 *   node .context-db/scripts/compute-centrality.cjs             # full recompute + write
 *   node .context-db/scripts/compute-centrality.cjs --dry-run   # no DB writes
 *   node .context-db/scripts/compute-centrality.cjs --json      # JSON output
 *   node .context-db/scripts/compute-centrality.cjs --top 20    # show top-N
 *   node .context-db/scripts/compute-centrality.cjs --domain BackOffice
 *   node .context-db/scripts/compute-centrality.cjs --force     # force write even if < 1h stale
 *
 * Exit codes: 0 = success, 1 = error / empty DB
 */

'use strict';

const path = require('path');
const fs = require('fs');

// RELATION_WEIGHTS — must align with pre-prompt-rag.js Layer 10 SSoT
// Any change here must also update pre-prompt-rag.js
const RELATION_WEIGHTS = {
  inherits: 1.0,
  implements: 0.9,
  calls: 0.7,
  uses_inferred: 0.4,
};

const IN_DEGREE_WEIGHT = 0.6;
const OUT_DEGREE_WEIGHT = 0.4;

const DB_PATH = path.resolve(__dirname, '..', 'phycool.db');

// ─────────────────────────────────────────────────────────────
// CLI parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
    topN: 10,
    domain: null,
    force: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--json') args.json = true;
    else if (a === '--top') args.topN = parseInt(argv[++i], 10) || 10;
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--force') args.force = true;
  }
  return args;
}

// ─────────────────────────────────────────────────────────────
// Pure functions
// ─────────────────────────────────────────────────────────────

/**
 * Compute weighted centrality for a single symbol.
 * @param {Array<{relation_type:string}>} incoming
 * @param {Array<{relation_type:string}>} outgoing
 * @returns {{ score:number, wIn:number, wOut:number }}
 */
function calcCentrality(incoming, outgoing) {
  const wIn  = incoming.reduce((s, e) => s + (RELATION_WEIGHTS[e.relation_type] || 0), 0);
  const wOut = outgoing.reduce((s, e) => s + (RELATION_WEIGHTS[e.relation_type] || 0), 0);
  return { score: IN_DEGREE_WEIGHT * wIn + OUT_DEGREE_WEIGHT * wOut, wIn, wOut };
}

/**
 * Compute p-th percentile of a numeric array.
 * Uses reduce() — avoids V8 spread-arg RangeError on 200K+ items.
 */
function percentile(scores, p) {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p / 100));
  return sorted[idx];
}

/**
 * Classify centrality score into blast_radius tier.
 */
function classifyBlastRadius(score, p95, p75, p50) {
  if (score >= p95) return 'critical';
  if (score >= p75) return 'high';
  if (score >= p50) return 'medium';
  return 'low';
}

/**
 * Derive domain from C# namespace.
 * e.g. "PhyCool.Web.Services.BackOffice" → "BackOffice"
 */
function deriveDomain(namespace) {
  if (!namespace) return null;
  const skip = new Set(['PhyCool', 'Web', 'PdfWorker']);
  const segs = namespace.split('.');
  for (const s of segs) {
    if (!skip.has(s)) return s;
  }
  return null;
}

/**
 * Detect generated code: Migrations / ModelSnapshot / _generated files.
 */
function isGenerated(ns, fp) {
  return /Migrations|ModelSnapshot/.test(ns || '') ||
         /\.(g|generated)\.cs$/i.test(fp || '');
}

/**
 * Detect test code: Tests namespace or Test/spec/fixture filenames.
 */
function isTest(ns, fp) {
  return /Tests?$/.test(ns || '') ||
         /(Test|test|spec|fixture)/i.test(path.basename(fp || ''));
}

/**
 * Build incoming / outgoing edge maps from symbol_dependencies rows.
 */
function buildEdgeMaps(deps) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const d of deps) {
    if (!outgoing.has(d.source_symbol)) outgoing.set(d.source_symbol, []);
    outgoing.get(d.source_symbol).push({ relation_type: d.relation_type });
    if (!incoming.has(d.target_symbol)) incoming.set(d.target_symbol, []);
    incoming.get(d.target_symbol).push({ relation_type: d.relation_type });
  }
  return { incoming, outgoing };
}

// ─────────────────────────────────────────────────────────────
// Main routine
// ─────────────────────────────────────────────────────────────

function run(args) {
  let Database;
  try {
    Database = require(path.resolve(__dirname, '..', 'node_modules', 'better-sqlite3'));
  } catch (e) {
    try { Database = require('better-sqlite3'); } catch (_) {
      process.stderr.write('[compute-centrality] better-sqlite3 not available\n');
      return { exitCode: 1 };
    }
  }

  const dbPath = (args && args._dbPath) ? args._dbPath : DB_PATH;

  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`[compute-centrality] DB not found: ${dbPath}\n`);
    return { exitCode: 1 };
  }

  const isReadonly = !!(args && args.dryRun);
  const db = new Database(dbPath, { readonly: isReadonly });
  if (!isReadonly) db.pragma('journal_mode = WAL');

  // Verify god_nodes table exists
  const tableExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='god_nodes'`
  ).get();
  if (!tableExists) {
    process.stderr.write(
      '[compute-centrality] god_nodes table not found. Run migration:\n' +
      '  sqlite3 .context-db/phycool.db < .context-db/migrations/2026-05-11-add-god-nodes-table.sql\n'
    );
    db.close();
    return { exitCode: 1 };
  }

  // Staleness check (skip if computed within 1 hour, unless --force)
  if (!args.dryRun && !args.force) {
    const latest = db.prepare(`SELECT MAX(computed_at) AS ts FROM god_nodes`).get();
    if (latest && latest.ts) {
      // Preserve +08:00 offset — replacing it with 'Z' would mis-interpret Taiwan
      // time as UTC, causing 8-hour drift. Just normalize space → 'T' for ISO 8601.
      const lastTs = new Date(latest.ts.replace(' ', 'T'));
      const ageMs = Date.now() - lastTs.getTime();
      if (ageMs < 60 * 60 * 1000) {
        process.stderr.write(
          `[compute-centrality] Skipped — computed ${Math.round(ageMs / 60000)} min ago. Use --force to override.\n`
        );
        const out = {
          timestamp: new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }) + '+08:00',
          dry_run: false,
          skipped: true,
          last_computed: latest.ts,
          total_symbols: 0,
          total_dependencies: 0,
          updated_rows: 0,
          top_god_nodes: [],
        };
        db.close();
        return { exitCode: 0, result: out };
      }
    }
  }

  // Load symbols
  const symbols = db.prepare(
    `SELECT id, full_name, file_path, namespace, symbol_type, symbol_name, start_line, end_line
     FROM symbol_index`
  ).all();

  if (symbols.length === 0) {
    process.stderr.write('[compute-centrality] symbol_index is empty — run indexer first\n');
    db.close();
    return { exitCode: 1 };
  }

  // Load dependencies
  const deps = db.prepare(
    `SELECT source_symbol, target_symbol, relation_type FROM symbol_dependencies`
  ).all();

  process.stderr.write(
    `[compute-centrality] Loaded ${symbols.length} symbols + ${deps.length} dependencies\n`
  );

  // Build edge maps (single pass)
  const { incoming, outgoing } = buildEdgeMaps(deps);

  // Compute centrality for each symbol
  const results = [];
  for (const s of symbols) {
    const inEdges  = incoming.get(s.full_name) || [];
    const outEdges = outgoing.get(s.full_name) || [];
    const { score, wIn, wOut } = calcCentrality(inEdges, outEdges);
    results.push({
      id: s.id,
      full_name: s.full_name,
      symbol_name: s.symbol_name,
      namespace: s.namespace,
      file_path: s.file_path,
      symbol_type: s.symbol_type,
      start_line: s.start_line || 0,
      end_line: s.end_line || 0,
      in_degree: inEdges.length,
      out_degree: outEdges.length,
      weighted_in_degree: wIn,
      weighted_out_degree: wOut,
      centrality_score: score,
      domain: deriveDomain(s.namespace),
      is_generated: isGenerated(s.namespace, s.file_path) ? 1 : 0,
      is_test: isTest(s.namespace, s.file_path) ? 1 : 0,
    });
  }

  // Filter to non-zero only for god_nodes
  const nonZero = results.filter(r => r.centrality_score > 0);

  // Compute percentile thresholds from non-zero set
  const scores = nonZero.map(r => r.centrality_score);
  const p95 = percentile(scores, 95);
  const p75 = percentile(scores, 75);
  const p50 = percentile(scores, 50);

  // Apply blast_radius classification
  for (const r of nonZero) {
    r.blast_radius = classifyBlastRadius(r.centrality_score, p95, p75, p50);
  }

  // Distribution stats (using reduce — V8 spread-arg guard for 200K+ items)
  const allScores = results.map(r => r.centrality_score);
  const distribution = {
    min: allScores.length === 0 ? 0 : allScores.reduce((m, v) => (v < m ? v : m), Infinity),
    max: allScores.length === 0 ? 0 : allScores.reduce((m, v) => (v > m ? v : m), -Infinity),
    mean: allScores.length === 0 ? 0 : allScores.reduce((a, b) => a + b, 0) / allScores.length,
    p50, p75, p95,
    nonzero_count: nonZero.length,
  };

  const computedAt = new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }) + '+08:00';

  // Write to DB (TRUNCATE + bulk INSERT inside transaction — idempotent)
  let updateCount = 0;
  if (!args.dryRun) {
    const tx = db.transaction((rows) => {
      db.prepare(`DELETE FROM god_nodes`).run();
      // ★ 2026-05-27 fix: 回寫 symbol_index.centrality_score(denormalized cache)
      //   根因: RepoMap v2 harvest 重建 symbol_index 後 centrality_score 全 0,本腳本原只寫 god_nodes 表,
      //   DevConsole godNodeService 查 symbol_index WHERE centrality_score>0 → 空頁。Layer 3 δ·centrality fallback 同受影響。
      //   修復: 先 reset 再 back-propagate nonZero(idempotent · 同 transaction 原子性)。
      db.prepare(`UPDATE symbol_index SET centrality_score = 0 WHERE centrality_score != 0`).run();
      const updSi = db.prepare(`UPDATE symbol_index SET centrality_score = ? WHERE id = ?`);
      const ins = db.prepare(`
        INSERT INTO god_nodes
          (symbol_id, file_path, start_line, end_line, domain, centrality_score,
           in_degree, out_degree, weighted_in_degree, weighted_out_degree,
           blast_radius, is_generated, is_test, computed_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of rows) {
        ins.run(
          r.id, r.file_path, r.start_line, r.end_line, r.domain, r.centrality_score,
          r.in_degree, r.out_degree, r.weighted_in_degree, r.weighted_out_degree,
          r.blast_radius, r.is_generated, r.is_test, computedAt
        );
        updSi.run(r.centrality_score, r.id);  // back-propagate 至 symbol_index
      }
    });
    tx(nonZero);
    updateCount = nonZero.length;
    process.stderr.write(`[compute-centrality] Updated ${updateCount} rows\n`);
  } else {
    process.stderr.write('[compute-centrality] --dry-run mode: no DB writes\n');
  }

  db.close();

  // Top-N output (exclude generated/test by default, matching MCP behavior)
  let topN = [...nonZero]
    .filter(r => !r.is_generated && !r.is_test)
    .sort((a, b) => b.centrality_score - a.centrality_score);
  if (args.domain) {
    topN = topN.filter(r => r.namespace && r.namespace.includes(args.domain));
  }
  topN = topN.slice(0, args.topN);

  const out = {
    timestamp: computedAt,
    dry_run: args.dryRun,
    skipped: false,
    total_symbols: results.length,
    total_dependencies: deps.length,
    updated_rows: updateCount,
    distribution,
    relation_weights: RELATION_WEIGHTS,
    formula: `centrality = ${IN_DEGREE_WEIGHT} * weighted_in + ${OUT_DEGREE_WEIGHT} * weighted_out`,
    percentile_thresholds: { p50, p75, p95 },
    top_god_nodes: topN.map(r => ({
      symbol_id: r.id,
      symbol_name: r.symbol_name,
      full_name: r.full_name,
      namespace: r.namespace,
      file_path: r.file_path,
      domain: r.domain,
      in_degree: r.in_degree,
      out_degree: r.out_degree,
      centrality_score: +r.centrality_score.toFixed(4),
      blast_radius: r.blast_radius,
      is_generated: r.is_generated,
      is_test: r.is_test,
    })),
  };

  return { exitCode: 0, result: out };
}

// ─────────────────────────────────────────────────────────────
// Output formatters
// ─────────────────────────────────────────────────────────────

function renderConsole(result) {
  const lines = [];
  lines.push(`[compute-centrality] ${result.timestamp}`);
  if (result.skipped) {
    lines.push(`  Skipped (recently computed). Use --force to override.`);
    return lines.join('\n');
  }
  lines.push(`  symbols: ${result.total_symbols} | deps: ${result.total_dependencies} | updated: ${result.updated_rows}`);
  lines.push(`  percentiles: p50=${result.distribution.p50.toFixed(2)} p75=${result.distribution.p75.toFixed(2)} p95=${result.distribution.p95.toFixed(2)}`);
  lines.push(`  non-zero: ${result.distribution.nonzero_count}`);
  lines.push('');
  lines.push(`  Top ${result.top_god_nodes.length} god nodes:`);
  for (const g of result.top_god_nodes) {
    const blast = g.blast_radius ? ` [${g.blast_radius}]` : '';
    lines.push(`    ${g.centrality_score.toFixed(4).padStart(10)}  ${g.symbol_name}${blast}  in=${g.in_degree} out=${g.out_degree}`);
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
    if (args.json) console.log(JSON.stringify(result, null, 2));
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
  classifyBlastRadius,
  deriveDomain,
  isGenerated,
  isTest,
  buildEdgeMaps,
  run,
  renderConsole,
  RELATION_WEIGHTS,
  IN_DEGREE_WEIGHT,
  OUT_DEGREE_WEIGHT,
  DB_PATH,
};
