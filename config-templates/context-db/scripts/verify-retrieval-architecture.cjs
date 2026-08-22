#!/usr/bin/env node
/**
 * verify-retrieval-architecture.cjs — 檢索架構 docs-as-code drift 偵測 (G2)
 *
 * 用途: 偵測「README / HTML 聲稱的檢索架構數字」vs「DB 實測真值」的 drift。
 *   檢索架構數字散落 README 多處(§1/§Layer2/§Layer3/§5/§13.7),
 *   人工同步必漂移(2026-05-27 V7 + RepoMap v2 P1 後 §Layer3 stale 即實例)。
 *   本腳本機械偵測,掛 maintenance-3day-refresh(第 6 step)自動把關。
 *
 * 範式: 重用 scripts/verify-deployment-docs.cjs 的 Phase + pass/fail/warn + exit code,
 *   差異 = 實測來源從 countDir(檔案) 擴為 better-sqlite3 DB query(檢索架構真值)。
 *
 * 偵測法: 對每個 DB 實測真值,檢查 README 是否含該值(千分位 25,237 + 純數字 25237 兩式)。
 *   核心大數字(symbol_index/deps/god_nodes/doc chunks/embeddings) 巧合命中率極低 → fail on miss。
 *   小數字(FTS5 表數) advisory warn(格式差異容忍)。
 *
 * 退出碼: 0 = 無 drift / 1 = drift(README stale) / 2 = INTERNAL ERROR
 * 使用: node .context-db/scripts/verify-retrieval-architecture.cjs [--quiet] [--strict]
 * Spec: 改善計畫-專家深度分析.md §7 (Paige docs-as-code) + §9-E (V7 連鎖)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SCRIPT_DIR = __dirname;
const DB_PATH = path.join(SCRIPT_DIR, '..', 'phycool.db');
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DOC_DIR = path.join(ROOT, 'claude token減量策略研究分析', '開發環境檢索架構全景');
const README_PATH = path.join(DOC_DIR, 'README.md');
const HTML_PATH = path.join(DOC_DIR, '開發環境檢索架構全景.html');

const ARGS = process.argv.slice(2);
const QUIET = ARGS.includes('--quiet');
const STRICT = ARGS.includes('--strict');

let errors = 0;
let warnings = 0;
function info(m) { if (!QUIET) console.log(m); }
function pass(m) { if (!QUIET) console.log(`✓ PASS: ${m}`); }
function warn(m) { warnings++; console.warn(`⚠ WARN: ${m}`); }
function fail(m) { errors++; console.error(`✗ FAIL: ${m}`); }

// DB 實測真值
function measureDb() {
  const db = new Database(DB_PATH, { readonly: true });
  const n = (sql) => { try { return db.prepare(sql).get().n; } catch { return null; } };
  const m = {
    symbol_index: n('SELECT COUNT(*) n FROM symbol_index'),
    symbol_dependencies: n('SELECT COUNT(*) n FROM symbol_dependencies'),
    god_nodes: n('SELECT COUNT(*) n FROM god_nodes'),
    document_chunks: n('SELECT COUNT(*) n FROM document_chunks'),
    document_embeddings: n('SELECT COUNT(*) n FROM document_embeddings'),
    fts5_tables: n("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND sql LIKE '%USING fts5%'"),
  };
  // G2 P4 擴充(2026-05-27): real logical tables(排除 FTS5 main + 影子表)+ MCP tools(server.js case count)
  //   根因 = 原腳本只偵測 README/HTML symbol graph,未涵蓋 SKILL.md always-on description 的 tools/tables 數
  const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  const shadowRe = /(_fts$|_data$|_idx$|_content$|_docsize$|_config$)/;
  m.real_logical_tables = allTables.filter(t => !shadowRe.test(t) && !t.startsWith('sqlite_')).length;
  try {
    const serverJs = fs.readFileSync(path.join(SCRIPT_DIR, '..', 'server.js'), 'utf8');
    m.mcp_tools = (serverJs.match(/^\s+case ['"][a-z_]+['"]/gm) || []).length;
  } catch { m.mcp_tools = null; }
  // G2 擴充(2026-05-27 P1-B): hooks 總數(settings.json 所有事件的 hook command 數)
  //   根因 = 加 retrieval-health-advisor 後 hooks 59→60,但原腳本未測 hooks 數 → drift 不被偵測
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8').replace(/^﻿/, ''));
    let hk = 0;
    for (const ev in (settings.hooks || {})) for (const g of settings.hooks[ev]) hk += (g.hooks || []).length;
    m.hooks_total = hk;
  } catch { m.hooks_total = null; }
  const embTables = ['symbol_embeddings', 'document_embeddings', 'context_embeddings',
    'conversation_embeddings', 'tech_embeddings', 'stories_embeddings', 'debt_embeddings'];
  let embTotal = 0;
  for (const t of embTables) { const v = n(`SELECT COUNT(*) n FROM ${t}`); if (v != null) embTotal += v; }
  m.embeddings_total = embTotal;
  m.doc_coverage_pct = m.document_chunks > 0 ? ((m.document_embeddings / m.document_chunks) * 100).toFixed(1) : '0';
  db.close();
  return m;
}

// 文檔是否含該數字(千分位 + 純數字兩式)
function docHasNumber(doc, actual) {
  if (actual == null) return false;
  const withComma = Number(actual).toLocaleString('en-US');
  const plain = String(actual);
  return doc.includes(withComma) || doc.includes(plain);
}

function main() {
  console.log('==========================================');
  console.log('  檢索架構 docs-as-code Drift 偵測 (G2)');
  console.log('==========================================');
  try {
    if (!fs.existsSync(DB_PATH)) { console.error(`DB not found: ${DB_PATH}`); process.exit(2); }
    const m = measureDb();
    info('\n=== DB 實測真值 ===');
    Object.entries(m).forEach(([k, v]) => info(`  ${k}: ${v}`));

    if (!fs.existsSync(README_PATH)) { fail(`README 不存在: ${README_PATH}`); process.exit(1); }
    const readme = fs.readFileSync(README_PATH, 'utf8');

    info('\n=== README drift 偵測(核心大數字 README 應含實測值)===');
    // 核心精確大數字(巧合命中率極低)→ miss = fail
    // 批次重建型大數字(harvest/import 觸發,應穩定同步)→ miss = fail
    const coreMetrics = ['symbol_index', 'symbol_dependencies', 'god_nodes',
      'document_chunks', 'document_embeddings'];
    for (const k of coreMetrics) {
      if (docHasNumber(readme, m[k])) pass(`${k}=${m[k]} 出現於 README(同步)`);
      else fail(`${k}=${Number(m[k]).toLocaleString('en-US')} 未出現於 README → drift(README 可能 stale)`);
    }
    // FTS5 表數(小數字)→ advisory
    if (docHasNumber(readme, m.fts5_tables)) pass(`fts5_tables=${m.fts5_tables} 出現於 README`);
    else warn(`fts5_tables=${m.fts5_tables} 未明確出現於 README(格式差異容忍)`);
    // embeddings_total 含會話型表(context/conversation/tech/stories/debt 每對話持續增長)→ 註定 drift → advisory warn
    //   對齊使用者 MEMORY feedback「會話型計數 drift 手動維護,agent 驗證報告即可不當需修缺口」(批次重建型 symbol/doc 已上方 fail 把關)
    if (docHasNumber(readme, m.embeddings_total)) pass(`embeddings_total=${m.embeddings_total} 出現於 README`);
    else warn(`embeddings_total=${Number(m.embeddings_total).toLocaleString('en-US')} ≠ README(會話型 embeddings 持續增長,自然 drift,使用者手動維護)`);

    // hooks 總數(settings.json 實測 · advisory)— README/SKILL/交接 多為歷史轉換記錄(57→58 等),
    //   當前真值在交接真值基線;此處報實測值供同步,README 未含則 advisory(非 fail)
    if (m.hooks_total != null) {
      if (docHasNumber(readme, m.hooks_total)) pass(`hooks_total=${m.hooks_total} 出現於 README(同步)`);
      else warn(`hooks_total=${m.hooks_total}(settings.json 實測)未出現於 README — 若文檔現況段引用 hooks 數請同步至 ${m.hooks_total}`);
    }

    // HTML 同步(關鍵指標,若 HTML 存在)
    if (fs.existsSync(HTML_PATH)) {
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      info('\n=== HTML drift(關鍵指標)===');
      for (const k of ['symbol_index', 'god_nodes', 'document_embeddings']) {
        if (docHasNumber(html, m[k])) pass(`HTML ${k}=${m[k]} 同步`);
        else warn(`HTML ${k}=${m[k]} 未出現(可能 stale)`);
      }
    }

    // G2 P4 擴充: SKILL.md always-on description drift(tools/tables 數每 prompt 注入 agent,drift 影響最大)
    const SKILL_PATH = path.join(ROOT, '.claude', 'skills', 'phycool-context-memory', 'SKILL.md');
    if (fs.existsSync(SKILL_PATH)) {
      const skill = fs.readFileSync(SKILL_PATH, 'utf8');
      info('\n=== SKILL.md always-on drift(description tools/tables)===');
      if (m.mcp_tools != null) {
        if (skill.includes(`${m.mcp_tools} MCP Tools`)) pass(`SKILL.md MCP Tools=${m.mcp_tools} 同步`);
        else fail(`SKILL.md 未含「${m.mcp_tools} MCP Tools」→ always-on drift(每 prompt 注入錯誤 tool 數)`);
      }
      if (skill.includes(`${m.real_logical_tables} real tables`) || skill.includes(`${m.real_logical_tables} 實體基表`)) pass(`SKILL.md real tables=${m.real_logical_tables} 同步`);
      else fail(`SKILL.md 未含「${m.real_logical_tables} real tables」或「${m.real_logical_tables} 實體基表」→ always-on drift(real=DB PRAGMA 實測,非含 FTS5 的 56 混算口徑)`);
    }

    // CLAUDE.md §GitNexus(70829/129207)屬跨引擎 index,不在 phycool.db → 需 mcp__gitnexus__list_repos 另驗(本腳本只涵蓋 phycool.db-derivable 真值)
    info('\n=== 註: CLAUDE.md §GitNexus 跨引擎數字需 gitnexus list_repos 另驗(本腳本範圍外)===');

    console.log('\n==========================================');
    console.log(`  Result: ${errors === 0 ? '✓ 無 drift' : `✗ ${errors} drift`}, ${warnings} warnings`);
    console.log('==========================================\n');
    if (errors > 0) process.exit(1);
    if (STRICT && warnings > 0) process.exit(1);
    process.exit(0);
  } catch (e) {
    console.error('Internal error:', e);
    process.exit(2);
  }
}

main();
