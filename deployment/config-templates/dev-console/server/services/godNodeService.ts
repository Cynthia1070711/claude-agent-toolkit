// ============================================================
// godNodeService.ts — God Node Treemap data service
// Story: td-devconsole-godnode-and-mem-dashboard (BR-VIS-001 ~ 005)
// SQL aligned with .context-db/server.js:1791-1842 handleSearchGodNodes
// ============================================================
import path from 'path';
import { getDb } from '../db.js';
import { config } from '../config.js';

export interface GodNodeRow {
  id: number;
  symbol_name: string;
  full_name: string;
  namespace: string;
  file_path: string;
  absolute_path: string;
  symbol_type: string;
  start_line: number;
  end_line: number;
  signature: string | null;
  centrality_score: number;
}

export interface GodNodeListResult {
  total: number;
  filter: {
    limit: number;
    namespace: string | null;
    include_generated: boolean;
    excluded_namespaces: string[];
  };
  god_nodes: GodNodeRow[];
}

export interface GodNodeDistribution {
  total: number;
  non_zero_count: number;
  non_zero_pct: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  include_generated: boolean;
  last_computed: string | null;
  by_namespace: Array<{ namespace: string; count: number; avg: number; max: number }>;
  // CR F-M10 fix: surface total distinct namespace count so UI can hint when LIMIT 30 truncates
  by_namespace_total: number;
}

const EXCLUDED_NAMESPACES = ['Migrations', 'ModelSnapshot', 'Tests'];

// CR F-M7 fix: build the WHERE clause from EXCLUDED_NAMESPACES so the const stays SSoT.
// Each LIKE term is joined by AND;
//   - mode='AND': '<existing> AND ns NOT LIKE A AND ns NOT LIKE B AND ns NOT LIKE C' (prepend AND, listGodNodes use case)
//   - mode='WHERE': 'WHERE ns NOT LIKE A AND ns NOT LIKE B AND ns NOT LIKE C' (standalone, getDistribution use case)
function buildExcludeClause(mode: 'AND' | 'WHERE' = 'AND'): string {
  const terms = EXCLUDED_NAMESPACES.map(ns => `namespace NOT LIKE '%${ns}%'`);
  return mode === 'AND'
    ? 'AND ' + terms.join(' AND ')
    : 'WHERE ' + terms.join(' AND ');
}

// CR F-M7 fix: distribution queries' shared "non-zero + optional generated exclude" predicate
function buildNonZeroWhere(exclude: boolean): string {
  const parts: string[] = [];
  if (exclude) {
    EXCLUDED_NAMESPACES.forEach(ns => parts.push(`namespace NOT LIKE '%${ns}%'`));
  }
  parts.push('centrality_score > 0');
  return 'WHERE ' + parts.join(' AND ');
}

// CR F-M2 fix: escape SQLite LIKE wildcards (%, _, \) in user-supplied namespace input
function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** 確認 centrality_score 欄位存在(post-migration check) */
export function hasCentralityScore(): boolean {
  const db = getDb();
  if (!db) {
    // CR F-M4 fix: log so operators see why endpoints 503 even though DB is "down" path
    console.warn('[godNodeService] hasCentralityScore: DB unavailable');
    return false;
  }
  try {
    const cols = db.prepare(`PRAGMA table_info(symbol_index)`).all() as { name: string }[];
    return cols.some(c => c.name === 'centrality_score');
  } catch (err) {
    // CR F-M3 fix: surface schema-introspection errors instead of swallowing as "migration not run"
    console.error('[godNodeService] PRAGMA table_info failed', err);
    return false;
  }
}

/** 取 god nodes(高 centrality symbols)— 對齊 handleSearchGodNodes */
export function listGodNodes(opts: {
  limit?: number;
  namespace?: string | null;
  include_generated?: boolean;
}): GodNodeListResult {
  const db = getDb();
  if (!db) {
    return {
      total: 0,
      filter: {
        limit: opts.limit ?? 10,
        namespace: opts.namespace ?? null,
        include_generated: !!opts.include_generated,
        excluded_namespaces: opts.include_generated ? [] : EXCLUDED_NAMESPACES,
      },
      god_nodes: [],
    };
  }

  const safeLimit = Math.min(100, Math.max(1, Number(opts.limit) || 10));

  let sql = `
    SELECT id, file_path, symbol_type, symbol_name, full_name, namespace,
           start_line, end_line, signature, centrality_score
    FROM symbol_index
    WHERE centrality_score > 0
  `;
  const params: unknown[] = [];

  if (!opts.include_generated) {
    // CR F-M7 fix: SSoT exclude clause derived from EXCLUDED_NAMESPACES const
    sql += ' ' + buildExcludeClause('AND');
  }

  if (opts.namespace) {
    // CR F-M2 fix: escape LIKE wildcards (%, _, \) in user-supplied input + ESCAPE clause
    sql += ` AND namespace LIKE ? ESCAPE '\\'`;
    params.push(`%${escapeLike(opts.namespace)}%`);
  }

  sql += ` ORDER BY centrality_score DESC LIMIT ?`;
  params.push(safeLimit);

  const rows = db.prepare(sql).all(...params) as GodNodeRow[];

  return {
    total: rows.length,
    filter: {
      limit: safeLimit,
      namespace: opts.namespace ?? null,
      include_generated: !!opts.include_generated,
      excluded_namespaces: opts.include_generated ? [] : EXCLUDED_NAMESPACES,
    },
    god_nodes: rows.map(r => ({
      id: r.id,
      symbol_name: r.symbol_name,
      full_name: r.full_name,
      namespace: r.namespace,
      file_path: r.file_path,
      absolute_path: path.resolve(config.projectRoot, r.file_path).replace(/\\/g, '/'),
      symbol_type: r.symbol_type,
      start_line: r.start_line,
      end_line: r.end_line,
      signature: r.signature,
      centrality_score: +Number(r.centrality_score).toFixed(2),
    })),
  };
}

/** 取 distribution stats — 對齊 BMAD step-04 §0.5 P50/P75/P95/P99 */
export function getDistribution(opts: { include_generated?: boolean } = {}): GodNodeDistribution {
  const db = getDb();
  if (!db) {
    return {
      total: 0, non_zero_count: 0, non_zero_pct: 0,
      min: 0, max: 0, mean: 0, median: 0,
      p50: 0, p75: 0, p95: 0, p99: 0,
      include_generated: !!opts.include_generated,
      last_computed: null,
      by_namespace: [],
      by_namespace_total: 0,
    };
  }

  const exclude = !opts.include_generated;
  // CR F-M7 fix: SSoT exclude clause derived from EXCLUDED_NAMESPACES const
  const where = exclude ? buildExcludeClause('WHERE') : '';

  const totals = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN centrality_score > 0 THEN 1 ELSE 0 END) AS non_zero,
           MAX(centrality_score) AS max,
           MIN(CASE WHEN centrality_score > 0 THEN centrality_score ELSE NULL END) AS min,
           AVG(centrality_score) AS mean
    FROM symbol_index ${where}
  `).get() as { total: number; non_zero: number; max: number | null; min: number | null; mean: number | null };

  const total = totals.total || 0;
  const nonZero = totals.non_zero || 0;
  const max = totals.max ?? 0;
  const min = totals.min ?? 0;
  const mean = totals.mean ?? 0;

  // Compute percentiles by reading non-zero scores into memory (≤10K rows in production)
  const scoreRows = db.prepare(`
    SELECT centrality_score FROM symbol_index
    ${buildNonZeroWhere(exclude)}
    ORDER BY centrality_score ASC
  `).all() as { centrality_score: number }[];

  const scores = scoreRows.map(r => r.centrality_score);
  const pct = (p: number): number => {
    if (scores.length === 0) return 0;
    const idx = Math.floor((p / 100) * (scores.length - 1));
    return scores[idx];
  };

  const median = scores.length > 0
    ? (scores.length % 2 === 1
        ? scores[Math.floor(scores.length / 2)]
        : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
    : 0;

  // Last computed (proxy: MAX(indexed_at) of non-zero rows)
  const lastComputedRow = db.prepare(`
    SELECT MAX(indexed_at) AS last_computed
    FROM symbol_index
    ${buildNonZeroWhere(exclude)}
  `).get() as { last_computed: string | null };

  // By namespace breakdown(對齊 /patterns Domain Activity 範式)
  const byNamespaceRows = db.prepare(`
    SELECT namespace,
           COUNT(*) AS count,
           AVG(centrality_score) AS avg,
           MAX(centrality_score) AS max
    FROM symbol_index
    ${buildNonZeroWhere(exclude)}
    GROUP BY namespace
    ORDER BY max DESC
    LIMIT 30
  `).all() as Array<{ namespace: string; count: number; avg: number; max: number }>;

  // CR F-M10 fix: total distinct namespace count (for "showing 30 of N" UI hint)
  const byNsTotal = db.prepare(`
    SELECT COUNT(DISTINCT namespace) AS total
    FROM symbol_index
    ${buildNonZeroWhere(exclude)}
  `).get() as { total: number };

  return {
    total,
    non_zero_count: nonZero,
    non_zero_pct: total > 0 ? +((nonZero / total) * 100).toFixed(1) : 0,
    min: +min.toFixed(2),
    max: +max.toFixed(2),
    mean: +mean.toFixed(2),
    median: +median.toFixed(2),
    p50: +pct(50).toFixed(2),
    p75: +pct(75).toFixed(2),
    p95: +pct(95).toFixed(2),
    p99: +pct(99).toFixed(2),
    include_generated: !!opts.include_generated,
    last_computed: lastComputedRow?.last_computed ?? null,
    by_namespace: byNamespaceRows.map(r => ({
      namespace: r.namespace,
      count: r.count,
      avg: +(r.avg ?? 0).toFixed(2),
      max: +(r.max ?? 0).toFixed(2),
    })),
    by_namespace_total: byNsTotal?.total ?? byNamespaceRows.length,
  };
}
