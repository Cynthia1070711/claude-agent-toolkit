#!/usr/bin/env node
/**
 * harvest-codegraph-to-symbolgraph.cjs — G14 PhyCool RepoMap v2 (方案1 · P1)
 *
 * Rebuilds phycool.db `symbol_index` + `symbol_dependencies` from CodeGraph's
 * already-resolved multi-language graph (.codegraph/codegraph.db).
 *   - Fixes D1 (in_degree=0): CodeGraph call edges are 100% resolved (both ends are real nodes)
 *   - Fixes D3 (C#-only):    harvests cs/ts/tsx/js/php/... (frontend included)
 *   - Fixes D2 (stale):       re-run via maintenance-3day (P3) → tracks CodeGraph live watcher
 *
 * Reuses existing schema (+ `language` column, idempotent ALTER). NON-destructive elsewhere.
 * Safe: phycool.db backed up to .bak.{ts} before first real run (F-S7). Reversible (re-run / restore .bak).
 *
 * Identity model: symbol_dependencies.source_symbol/target_symbol = CodeGraph qualified_name
 *   (matches symbol_index.full_name → compute-centrality.cjs in_degree works UNCHANGED).
 * Relation map (CodeGraph kind → compute-centrality RELATION_WEIGHTS key):
 *   extends→inherits(1.0) / implements→implements(0.9) / calls→calls(0.7) / instantiates,references→uses_inferred(0.4)
 * Vendor/3rd-party/temp excluded (not PhyCool-authored symbols). is_generated/is_test derived downstream by compute-centrality.
 *
 * Usage:
 *   node .context-db/scripts/harvest-codegraph-to-symbolgraph.cjs --dry-run   # no writes; print counts/lang/schema
 *   node .context-db/scripts/harvest-codegraph-to-symbolgraph.cjs             # rebuild (clears symbol_embeddings → regenerate after)
 *
 * 2026-05-26 · Track: 開發環境檢索架構改善 (Axis 6) · 改善計畫 §6.7
 */
'use strict';

const path = require('path');
const fs = require('fs');
const base = path.resolve(__dirname, '..');              // .context-db
const Database = require(path.join(base, 'node_modules', 'better-sqlite3'));
const PHY = path.join(base, 'phycool.db');
const CG = path.join(base, '..', '.codegraph', 'codegraph.db');
const DRY = process.argv.includes('--dry-run');

function nowTaipei() { return new Date().toLocaleString('sv', { timeZone: 'Asia/Taipei' }) + '+08:00'; }

// vendor / third-party / build / temp — not PhyCool-authored symbols
function isVendor(fp) {
  return /(^|[\\/])(node_modules|bin|obj|dist|packages)[\\/]/i.test(fp || '')
    || /[\\/]wwwroot[\\/]lib[\\/]/i.test(fp || '')
    || /[\\/]scripts[\\/]temp[\\/]/i.test(fp || '')
    || /[\\/]ECPay-API-Skill-master[\\/]/i.test(fp || '')   // vendored PHP SDK
    || /\.min\.(js|css)$/i.test(fp || '');
}

const REL_MAP = { extends: 'inherits', implements: 'implements', calls: 'calls', instantiates: 'uses_inferred', references: 'uses_inferred' };

// Derive a namespace-ish string from file_path so compute-centrality.deriveDomain yields a domain.
function deriveNs(fp) {
  if (!fp) return null;
  const dirs = fp.replace(/\\/g, '/').split('/').slice(0, -1);
  const aw = dirs.indexOf('PhyCool.Web');
  if (aw >= 0) return dirs.slice(aw).join('.');                 // PhyCool.Web.Services.BackOffice
  if (dirs.includes('ClientApp')) return 'PhyCool.Web.ClientApp.' + (dirs.slice(dirs.indexOf('ClientApp') + 1, dirs.indexOf('ClientApp') + 3).join('.') || 'src');
  if (dirs.includes('.claude')) return 'Claude.' + (dirs[dirs.indexOf('.claude') + 1] || 'root');
  if (dirs.includes('.context-db')) return 'ContextDb';
  if (dirs.includes('tools')) return 'Tools.' + (dirs[dirs.indexOf('tools') + 1] || 'root');
  return dirs.slice(-2).join('.') || null;
}

// Unique, semi-readable identity = qualified_name + location.
// CodeGraph qualified_name alone collides for bare top-level fns (e.g. "main" appears in many files);
// appending @relFile:line makes each node's key unique so compute-centrality in/out degree is correct.
function uname(n) {
  const q = n.qualified_name || n.name || '(anon)';
  const f = (n.file_path || '').replace(/\\/g, '/').replace(/^.*?((?:src|\.claude|\.context-db|tools|scripts)\/)/, '$1');
  return `${q} @${f}:${n.start_line || 0}`;
}

function build() {
  const cg = new Database(CG, { readonly: true });
  const nodes = new Map();
  for (const n of cg.prepare('SELECT id,kind,name,qualified_name,file_path,language,start_line,end_line,signature FROM nodes').all()) nodes.set(n.id, n);
  const edges = cg.prepare("SELECT source,target,kind FROM edges WHERE kind IN ('calls','extends','implements','instantiates','references')").all();
  cg.close();

  const isReal = n => n && n.kind !== 'import' && n.kind !== 'file';
  const keep = new Set();
  const symRows = [];
  for (const [id, n] of nodes) {
    if (!isReal(n) || !n.file_path || isVendor(n.file_path)) continue;   // skip null-path (NOT NULL guard)
    keep.add(id);
    symRows.push({
      file_path: n.file_path, symbol_type: n.kind || 'symbol',
      symbol_name: n.name || n.qualified_name || '(anon)',                // NOT NULL guard
      full_name: uname(n),                                                // UNIQUE key (qualified_name@file:line) — avoids bare-name collision
      namespace: deriveNs(n.file_path),
      start_line: n.start_line || 0, end_line: n.end_line || 0,
      signature: n.signature || null, code_snippet: n.signature || '',    // code_snippet NOT NULL → '' fallback
      language: n.language || null,
    });
  }
  const depRows = [];
  for (const e of edges) {
    if (!keep.has(e.source) || !keep.has(e.target)) continue;
    const s = nodes.get(e.source), t = nodes.get(e.target);
    depRows.push({
      source_symbol: uname(s), target_symbol: uname(t),
      relation_type: REL_MAP[e.kind] || 'calls', source_file: s.file_path, target_file: t.file_path,
    });
  }
  return { cgNodeCount: nodes.size, cgEdgeCount: edges.length, symRows, depRows };
}

function main() {
  if (!fs.existsSync(CG)) { console.error('[harvest] CodeGraph DB not found:', CG); process.exit(1); }
  const { cgNodeCount, cgEdgeCount, symRows, depRows } = build();

  const langDist = {}; for (const r of symRows) langDist[r.language] = (langDist[r.language] || 0) + 1;
  const relDist = {}; for (const r of depRows) relDist[r.relation_type] = (relDist[r.relation_type] || 0) + 1;

  console.log(`[harvest] CodeGraph: nodes=${cgNodeCount} edges(dep kinds)=${cgEdgeCount}`);
  console.log(`[harvest] → symbol_index rows=${symRows.length} (excl import/file/vendor)`);
  console.log(`[harvest] → symbol_dependencies rows=${depRows.length} (both ends kept, resolved)`);
  console.log(`[harvest] language dist:`, JSON.stringify(langDist));
  console.log(`[harvest] relation dist:`, JSON.stringify(relDist));

  if (DRY) {
    const rdb = new Database(PHY, { readonly: true });
    const cols = rdb.prepare('PRAGMA table_info(symbol_index)').all();
    const notNull = cols.filter(c => c.notnull && !c.pk).map(c => c.name);
    const cur = rdb.prepare('SELECT (SELECT COUNT(*) FROM symbol_index) si,(SELECT COUNT(*) FROM symbol_dependencies) sd,(SELECT COUNT(*) FROM symbol_embeddings) se').get();
    rdb.close();
    console.log(`[harvest] symbol_index NOT NULL (non-pk) cols:`, JSON.stringify(notNull));
    console.log(`[harvest] current phycool.db: symbol_index=${cur.si} symbol_dependencies=${cur.sd} symbol_embeddings=${cur.se}`);
    console.log('[harvest] --dry-run: NO writes. Review above, then run without --dry-run.');
    return;
  }

  const db = new Database(PHY);
  db.pragma('journal_mode = WAL');
  const cols = db.prepare('PRAGMA table_info(symbol_index)').all().map(c => c.name);
  if (!cols.includes('language')) { db.exec('ALTER TABLE symbol_index ADD COLUMN language TEXT'); console.log('[harvest] added column symbol_index.language'); }
  const ts = nowTaipei();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM symbol_index').run();
    db.prepare('DELETE FROM symbol_dependencies').run();
    db.prepare('DELETE FROM symbol_embeddings').run();          // orphan-clear; regenerate after harvest
    const insS = db.prepare('INSERT INTO symbol_index (file_path,symbol_type,symbol_name,full_name,namespace,start_line,end_line,signature,code_snippet,language,centrality_score,indexed_at) VALUES (@file_path,@symbol_type,@symbol_name,@full_name,@namespace,@start_line,@end_line,@signature,@code_snippet,@language,0,@indexed_at)');
    for (const r of symRows) insS.run({ ...r, indexed_at: ts });
    const insD = db.prepare('INSERT INTO symbol_dependencies (source_symbol,target_symbol,relation_type,source_file,target_file) VALUES (@source_symbol,@target_symbol,@relation_type,@source_file,@target_file)');
    for (const r of depRows) insD.run(r);
  });
  tx();
  console.log(`[harvest] WROTE symbol_index=${symRows.length} symbol_dependencies=${depRows.length} @ ${ts}`);
  console.log('[harvest] symbol_embeddings CLEARED → run generate-embeddings / incremental-embed to repopulate (multi-lang).');
  console.log('[harvest] NEXT: node .context-db/scripts/compute-centrality.cjs --force  (rebuild god_nodes with correct in_degree)');
  db.close();
}

main();
