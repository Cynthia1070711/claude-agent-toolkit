#!/usr/bin/env node
// ============================================================
// sync-retrieval-doc-counters.cjs — 檢索架構文檔數字一鍵同步
// ============================================================
// 使用者裁定(2026-06-07):「每次進行所有檢索工具全面更新後,當使用者確認更新文檔數字時,
//   可直接調用該 script 直接啟動腳本更新所有文檔數字」。
//   與既有裁定(2026-05-27「verify 只報告不自動寫回」)的關係:
//   - refresh-all-retrieval.cjs orchestrator 維持不自動寫回(FORBIDDEN 不變)
//   - 本 script 為「獨立」寫回工具,由使用者確認後主動調用(非 orchestrator 自動觸發)
//
// 同步目標(4 文檔):
//   ① 開發環境檢索架構全景/README.md       — 全量指標(SSoT)
//   ② 開發環境檢索架構全景/開發環境檢索架構全景.html — 視覺 mirror
//   ③ .claude/skills/phycool-context-memory/SKILL.md — always-on description(MCP Tools / real tables)
//   ④ CLAUDE.md §GitNexus                  — 跨引擎 index 數字(symbols/relationships/flows)
//
// 實測來源(口徑=query 本身,各 metric 單一口徑不混算):
//   - .context-db/phycool.db(symbol graph / embeddings 7 表 / FTS5 13 表 / triggers / queue / DB size)
//   - .context-db/server.js(MCP tools case count)
//   - .gitnexus/meta.json(GitNexus nodes/edges/flows — reindex 後才變)
//   - .codegraph/codegraph.db(CodeGraph nodes/edges/files — watcher 即時)
//
// 防誤改機制(對齊「自動寫回易誤改」顧慮的工程化解法):
//   G1 舊值精確匹配 — 只替換「上次同步值」(狀態檔記錄);更舊的歷史值天然不匹配不被動
//   G2 「→」鄰接保護 — 「A→B」轉換記錄鏈(含 →**B** markdown 粗體變體)兩端皆不替換,
//      歷史轉換記錄(README L4 最後更新行 / §12 表 / HTML RepoMap 卡片)不被竄改
//   G3 歷史 section 排除 — README「## 12. 歷史變更紀錄」區間 + 「> **最後更新**:」行整行跳過
//   G4 豁免造冊 — 狀態檔 exemptions[].contains 命中之行跳過(HTML 審計快照行 pill r / ✓ 準確)
//   G5 小數字錨定 — <4 位數或易撞值走 anchor(行必含表名)或 exact-string(含上下文詞),禁裸替換
//   G6 撞值偵測 — 同舊值不同新值 → conflict 跳過報告人工;同舊值同新值 → 合併
//   G7 預設 dry-run — 列替換計畫不寫檔;--apply 才寫回(對齊 SKILL 鐵律「破壞前先 dry-run」)
//
// Usage:
//   node .context-db/scripts/sync-retrieval-doc-counters.cjs            # dry-run 列計畫(預設,無破壞)
//   node .context-db/scripts/sync-retrieval-doc-counters.cjs --apply    # 實際寫回 + 更新狀態檔 + verify 收尾
//   node .context-db/scripts/sync-retrieval-doc-counters.cjs --apply --no-history  # 寫回但不 prepend 歷史記錄
//   node .context-db/scripts/sync-retrieval-doc-counters.cjs --json     # JSON 輸出
//
// 狀態檔: .context-db/scripts/retrieval-doc-counters.state.json(入版控,與文檔同 commit 推進)
//
// CRLF/BOM 設計(對齊 crlf-normalize-discipline.md,故意「保留原樣」而非 normalize):
//   - split('\n') 後行尾 \r 保留在行串內,join('\n') 寫回 → 各行原行尾逐行保真
//     (CLAUDE.md 實測為 CRLF/LF 混合檔 170/43,normalize 會製造全檔 diff 污染)
//   - 所有行級比對 regex 一律「開頭錨定」或「\s*$」(\s 含 \r),不做 === 全行嚴格比對
//   - 數字替換發生於行中段,不觸行尾;splice 插入新行時行尾對齊鄰行
//   - BOM:讀時記錄剝除,寫回原樣補回
// 2026-06-07 · Track: phycool-retrieval-refresh SKILL 配套 · 不改 refresh-all-retrieval.cjs
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { acquireLock } = require('./retrieval-lock.cjs');

const SCRIPT_DIR = __dirname;
const BASE = path.resolve(SCRIPT_DIR, '..');              // .context-db
const ROOT = path.resolve(BASE, '..');                    // project root
const DB_PATH = path.join(BASE, 'phycool.db');
const STATE_PATH = path.join(SCRIPT_DIR, 'retrieval-doc-counters.state.json');
// 與 refresh-all-retrieval.cjs 共用同一把鎖(同一互斥網域,見 retrieval-lock.cjs 註解)
const LOCK_PATH = path.join(BASE, '.retrieval-refresh.lock');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const NO_HISTORY = args.includes('--no-history');
const JSON_OUT = args.includes('--json');

function log(m) { if (!JSON_OUT) console.log(m); }
function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function comma(n) { return Number(n).toLocaleString('en-US'); }
// offset-aware 台灣時間(對齊 constitutional §Timestamp Mandate;timezone.js 為 ESM 故內聯同邏輯)
function taiwanNow() {
  const now = new Date();
  const tw = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 8 * 3600000);
  const p = (x) => String(x).padStart(2, '0');
  return {
    date: `${tw.getFullYear()}-${p(tw.getMonth() + 1)}-${p(tw.getDate())}`,
    minute: `${tw.getFullYear()}-${p(tw.getMonth() + 1)}-${p(tw.getDate())} ${p(tw.getHours())}:${p(tw.getMinutes())}`,
    iso: `${tw.getFullYear()}-${p(tw.getMonth() + 1)}-${p(tw.getDate())}T${p(tw.getHours())}:${p(tw.getMinutes())}:${p(tw.getSeconds())}+08:00`,
  };
}

// ------------------------------------------------------------
// 1. 實測(每 metric 單一口徑 = query 本身)
// ------------------------------------------------------------
function measure() {
  const db = new Database(DB_PATH, { readonly: true });
  const n = (sql) => { try { return db.prepare(sql).get().n; } catch { return null; } };
  const m = {};

  // symbol graph(批次重建型)
  m.symbol_index = n('SELECT COUNT(*) n FROM symbol_index');
  m.symbol_dependencies = n('SELECT COUNT(*) n FROM symbol_dependencies');
  m.god_nodes = n('SELECT COUNT(*) n FROM god_nodes');
  m.in_degree_gt0 = n('SELECT COUNT(*) n FROM god_nodes WHERE in_degree>0');
  m.sum_in_degree = n('SELECT SUM(in_degree) n FROM god_nodes');

  // 語言分布串(README L121/L170 格式)— Verified PRAGMA 2026-06-07: symbol_index.language TEXT
  const LANG_ABBR = { csharp: 'cs', javascript: 'js', typescript: 'ts', tsx: 'tsx', python: 'py', jsx: 'jsx' };
  const ORDER = ['csharp', 'javascript', 'typescript', 'tsx', 'python', 'jsx'];
  const langRows = db.prepare('SELECT language l, COUNT(*) c FROM symbol_index GROUP BY language').all();
  const langMap = Object.fromEntries(langRows.map(r => [r.l, r.c]));
  m.lang_dist = ORDER.filter(l => langMap[l] != null).map(l => `${LANG_ABBR[l]} ${langMap[l]}`).join('/');

  // doc RAG(批次重建型)
  m.document_chunks = n('SELECT COUNT(*) n FROM document_chunks');
  m.document_embeddings = n('SELECT COUNT(*) n FROM document_embeddings');
  m.doc_coverage_pct = m.document_chunks > 0 ? ((m.document_embeddings / m.document_chunks) * 100).toFixed(1) : '0';

  // embeddings 7 表(symbol/doc 批次型;context/conv/tech/stories/debt 會話型 — 同步取跑當下值)
  // 口徑 = verify-retrieval-architecture.cjs embTables 同 7 表合計
  m.symbol_embeddings = n('SELECT COUNT(*) n FROM symbol_embeddings');
  for (const t of ['context_embeddings', 'conversation_embeddings', 'tech_embeddings', 'stories_embeddings', 'debt_embeddings']) {
    m[t] = n(`SELECT COUNT(*) n FROM ${t}`);
  }
  m.embeddings_total = ['symbol_embeddings', 'document_embeddings', 'context_embeddings',
    'conversation_embeddings', 'tech_embeddings', 'stories_embeddings', 'debt_embeddings']
    .reduce((s, k) => s + (m[k] || 0), 0);

  // FTS5 13 表(口徑=FTS 表自身 rows;trigger 同步主表)
  const FTS = ['context_fts', 'tech_fts', 'stories_fts', 'tech_debt_fts', 'intentional_decisions_fts',
    'cr_reports_fts', 'cr_issues_fts', 'review_findings_fts', 'conversation_sessions_fts',
    'conversation_turns_fts', 'document_chunks_fts', 'doc_index_fts', 'glossary_fts'];
  for (const t of FTS) m[t] = n(`SELECT COUNT(*) n FROM ${t}`);

  // 結構統計
  m.fts5_tables = n("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND sql LIKE '%USING fts5%'");
  const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  const shadowRe = /(_fts$|_data$|_idx$|_content$|_docsize$|_config$)/;
  m.real_logical_tables = allTables.filter(t => !shadowRe.test(t) && !t.startsWith('sqlite_')).length;
  m.triggers_count = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n;
  m.embedding_queue_total = n('SELECT COUNT(*) n FROM embedding_queue');

  // ECC 會話型計數(2026-06-07 擴充 — 使用者確認「所有數字最新」意圖,會話型取跑當下值)
  // Verified PRAGMA 2026-06-07: instincts 無 status 欄,approved 口徑 = verifier_status='approved'
  m.instincts_total = n('SELECT COUNT(*) n FROM instincts');
  m.instincts_approved = n("SELECT COUNT(*) n FROM instincts WHERE verifier_status='approved'");
  m.pattern_observations = n('SELECT COUNT(*) n FROM pattern_observations');
  m.observations_queue = n('SELECT COUNT(*) n FROM observations_queue');
  db.close();

  // DB size
  const bytes = fs.statSync(DB_PATH).size;
  m.db_bytes = bytes;
  m.db_mb = Math.round(bytes / 1048576);

  // server.js MCP tools(同 verify 口徑)
  try {
    const serverJs = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
    m.mcp_tools = (serverJs.match(/^\s+case ['"][a-z_]+['"]/gm) || []).length;
  } catch { m.mcp_tools = null; }

  // settings.json hooks(同 verify 口徑)+ lifecycle events 數
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8').replace(/^﻿/, ''));
    let hk = 0;
    for (const ev in (settings.hooks || {})) for (const g of settings.hooks[ev]) hk += (g.hooks || []).length;
    m.hooks_total = hk;
    m.hooks_events = Object.keys(settings.hooks || {}).length;
  } catch { m.hooks_total = null; m.hooks_events = null; }

  // codegraph.db 檔案大小(WAL 模式主檔)
  try {
    m.cg_db_mb = (fs.statSync(path.join(ROOT, '.codegraph', 'codegraph.db')).size / 1048576).toFixed(2);
  } catch { m.cg_db_mb = null; }

  // GitNexus(meta.json — reindex 後才更新)
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, '.gitnexus', 'meta.json'), 'utf8').replace(/^﻿/, ''));
    m.gn_nodes = meta.stats.nodes; m.gn_edges = meta.stats.edges;
    m.gn_flows = meta.stats.processes; m.gn_files = meta.stats.files;
    m.gn_indexed_at = meta.indexedAt || null;
  } catch { m.gn_nodes = m.gn_edges = m.gn_flows = m.gn_files = null; }

  // CodeGraph(codegraph.db — watcher 即時)
  try {
    const cg = new Database(path.join(ROOT, '.codegraph', 'codegraph.db'), { readonly: true });
    m.cg_nodes = cg.prepare('SELECT COUNT(*) n FROM nodes').get().n;
    m.cg_edges = cg.prepare('SELECT COUNT(*) n FROM edges').get().n;
    m.cg_files = cg.prepare('SELECT COUNT(*) n FROM files').get().n;
    cg.close();
  } catch { m.cg_nodes = m.cg_edges = m.cg_files = null; }

  // 衍生 K 形式(README L34 banner「GitNexus(71.7K nodes)· CodeGraph(41.3K nodes)」)
  m.gn_nodes_k = m.gn_nodes != null ? (m.gn_nodes / 1000).toFixed(1) + 'K' : null;
  m.cg_nodes_k = m.cg_nodes != null ? (m.cg_nodes / 1000).toFixed(1) + 'K' : null;
  m.emb_total_k = m.embeddings_total != null ? Math.round(m.embeddings_total / 1000) : null; // 約數「~110K」「106K vectors」用

  return m;
}

// ------------------------------------------------------------
// 2. 文檔配置(metric 子集 + 替換策略;舊值在狀態檔)
//    kind: number(全文,千分位+plain≥4位,→保護)
//          anchored(行必含 anchor 才替換 — 小數字安全)
//          string(exact 舊串→新串;newStr(m) 生成)
// ------------------------------------------------------------
const FTS_TABLES = ['context_fts', 'tech_fts', 'stories_fts', 'tech_debt_fts', 'intentional_decisions_fts',
  'cr_reports_fts', 'cr_issues_fts', 'review_findings_fts', 'conversation_sessions_fts',
  'conversation_turns_fts', 'document_chunks_fts', 'doc_index_fts', 'glossary_fts'];

const DOCS = [
  {
    id: 'readme',
    rel: 'claude token減量策略研究分析/開發環境檢索架構全景/README.md',
    // 內建歷史排除:§12 歷史變更紀錄 section + 「> **最後更新**:」行(G3)
    historySectionRe: /^#{2,3}\s*\d*\.?\s*(歷史變更紀錄|歷史紀錄|Version History)/,
    lastUpdatedRe: /^> \*\*最後更新\*\*/,
    prependHistory: true,
    specs: [
      ...['symbol_index', 'symbol_dependencies', 'god_nodes', 'in_degree_gt0', 'sum_in_degree',
        'document_chunks', 'document_embeddings', 'embeddings_total', 'embedding_queue_total',
        'gn_nodes', 'gn_edges', 'cg_nodes', 'cg_edges', 'cg_files', 'db_bytes'].map(k => ({ metric: k, kind: 'number' })),
      ...['context_embeddings', 'conversation_embeddings', 'tech_embeddings', 'stories_embeddings', 'debt_embeddings']
        .map(k => ({ metric: k, kind: 'anchored', anchor: k })),
      ...FTS_TABLES.map(k => ({ metric: k, kind: 'anchored', anchor: k })),
      { metric: 'lang_dist', kind: 'string', newStr: m => m.lang_dist },
      { metric: 'doc_coverage_pct', kind: 'string', newStr: m => `coverage ${m.doc_coverage_pct}%` },
      { metric: 'db_mb', kind: 'string', newStr: m => `~${comma(m.db_mb)} MB` },
      { metric: 'real_fts_formula', kind: 'string', newStr: m => `${m.real_logical_tables} real + ${m.fts5_tables} FTS5 virtual = ${m.real_logical_tables + m.fts5_tables} 非影子表` },
      { metric: 'real_fts_short', kind: 'string', newStr: m => `${m.real_logical_tables} real + ${m.fts5_tables} FTS5` },
      { metric: 'gn_nodes_k', kind: 'string', newStr: m => `GitNexus(${m.gn_nodes_k} nodes)` },
      { metric: 'cg_nodes_k', kind: 'string', newStr: m => `CodeGraph(${m.cg_nodes_k} nodes)` },
      // ECC 會話型 + 約數 + hooks(2026-06-07 擴充)
      { metric: 'pattern_observations', kind: 'number' },
      { metric: 'instincts_bold', kind: 'string', newStr: m => `**${m.instincts_total}** instincts` },
      { metric: 'instincts_plain', kind: 'string', newStr: m => `${m.instincts_total} instincts` },
      { metric: 'instincts_rows', kind: 'string', newStr: m => `**${m.instincts_total} rows**` },
      { metric: 'instincts_tbl', kind: 'string', newStr: m => `${m.instincts_total}(approved` },
      { metric: 'approved_bold', kind: 'string', newStr: m => `(approved **${m.instincts_approved}**)` },
      { metric: 'approved_plain', kind: 'string', newStr: m => `(approved ${m.instincts_approved})` },
      { metric: 'obs_queue_inline', kind: 'string', newStr: m => `observations_queue\` ${comma(m.observations_queue)}` },
      { metric: 'obs_queue_note', kind: 'string', newStr: m => `**${comma(m.observations_queue)} 筆**` },
      { metric: 'emb_k_idx', kind: 'string', newStr: m => `~${m.emb_total_k}K 索引條目` },
      { metric: 'emb_k_vec', kind: 'string', newStr: m => `${m.emb_total_k}K vectors` },
      { metric: 'cg_db_mb_str', kind: 'string', newStr: m => `${m.cg_db_mb} MB` },
      { metric: 'hooks_appendix', kind: 'string', newStr: m => `附錄 A — ${m.hooks_total} 個 Hook` },
      { metric: 'hooks_total_row', kind: 'string', newStr: m => `| **總計** | **${m.hooks_total}** | **${m.hooks_events} events** |` },
      { metric: 'hooks_note', kind: 'string', newStr: m => `故 ${m.hooks_total} 個註冊` },
    ],
  },
  {
    id: 'html',
    rel: 'claude token減量策略研究分析/開發環境檢索架構全景/開發環境檢索架構全景.html',
    specs: [
      ...['symbol_index', 'symbol_dependencies', 'god_nodes', 'in_degree_gt0',
        'document_chunks', 'document_embeddings', 'embeddings_total',
        'gn_nodes', 'gn_edges', 'cg_nodes', 'cg_edges', 'cg_files'].map(k => ({ metric: k, kind: 'number' })),
      // 卡片區(L456-459)行含表名
      ...['context_embeddings', 'conversation_embeddings'].map(k => ({ metric: k, kind: 'anchored', anchor: k })),
      ...FTS_TABLES.map(k => ({ metric: k, kind: 'anchored', anchor: k })),
      // L461 合併行(無表名錨,用上下文詞字串)
      { metric: 'tech_emb_inline', kind: 'string', newStr: m => `tech ${comma(m.tech_embeddings)}` },
      { metric: 'stories_emb_inline', kind: 'string', newStr: m => `stories ${comma(m.stories_embeddings)}` },
      { metric: 'debt_emb_inline', kind: 'string', newStr: m => `debt ${comma(m.debt_embeddings)}` },
      { metric: 'ctx_emb_inline', kind: 'string', newStr: m => `context ${comma(m.context_embeddings)}` },
      { metric: 'conv_emb_inline', kind: 'string', newStr: m => `conv ${comma(m.conversation_embeddings)}` },
      { metric: 'symbol_emb_inline', kind: 'string', newStr: m => `symbol ${comma(m.symbol_index)}` },
      { metric: 'doc_emb_inline', kind: 'string', newStr: m => `doc ${comma(m.document_embeddings)}` },
      { metric: 'emb_total_inline', kind: 'string', newStr: m => `總計 ${comma(m.embeddings_total)} vectors` },
      { metric: 'db_mb', kind: 'string', newStr: m => `~${comma(m.db_mb)} MB` },
      { metric: 'real_fts_formula', kind: 'string', newStr: m => `${m.real_logical_tables} real + ${m.fts5_tables} FTS5 + ${m.triggers_count} triggers` },
      // ECC 會話型(2026-06-07 擴充;L598「6 rows·14 欄」為 2026-05-25 審計歷史快照不納)
      { metric: 'pattern_observations', kind: 'number' },
      { metric: 'instincts_phrase', kind: 'string', newStr: m => `${m.instincts_total} instincts(approved ${m.instincts_approved})` },
      { metric: 'instincts_card', kind: 'string', newStr: m => `>${m.instincts_total}</div><div class="note">instincts` },
      { metric: 'obs_queue_html', kind: 'string', newStr: m => `(${comma(m.observations_queue)} · 含 project_type` },
    ],
  },
  {
    id: 'skill-context-memory',
    rel: '.claude/skills/phycool-context-memory/SKILL.md',
    specs: [
      { metric: 'mcp_tools_phrase', kind: 'string', newStr: m => `${m.mcp_tools} MCP Tools` },
      { metric: 'real_tables_phrase', kind: 'string', newStr: m => `${m.real_logical_tables} real tables` },
    ],
  },
  {
    id: 'claude-md',
    rel: 'CLAUDE.md',
    specs: [
      { metric: 'gitnexus_phrase', kind: 'string', newStr: m => `(${m.gn_nodes} symbols, ${m.gn_edges} relationships, ${m.gn_flows} execution flows)` },
    ],
  },
];

// ------------------------------------------------------------
// 3. 狀態檔
// ------------------------------------------------------------
function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    console.error(`[sync-doc] 狀態檔不存在: ${STATE_PATH}`);
    console.error('[sync-doc] 需先 bootstrap(記錄各文檔當前「上次同步值」)— 見 SKILL phycool-retrieval-refresh');
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8').replace(/^﻿/, ''));
}

// ------------------------------------------------------------
// 4. 替換引擎
// ------------------------------------------------------------
// G2:「→」鄰接保護 + 數字邊界。
//   前界:非數字、非「數字+逗號」(防千分位左段)、非 → / →**(歷史轉換鏈)
//   後界:非數字、非「逗號+數字」(防千分位右段;允許「數字,文字」正常標點)、非 (**)→
function guardedNumberRegex(form) {
  return new RegExp(`(?<!\\d)(?<!\\d,)(?<!→)(?<!→\\*\\*)${esc(form)}(?!\\d)(?!,\\d)(?!\\*{0,2}→)`, 'g');
}

function numForms(v) {
  const forms = [comma(v)];
  const plain = String(v);
  if (plain.length >= 4 && !forms.includes(plain)) forms.push(plain);
  return forms;
}

// 顯示用:以第一個差異點為中心開窗(避免變化點落在截斷區外看不到)
function diffWindow(before, after) {
  let d = 0;
  while (d < before.length && d < after.length && before[d] === after[d]) d++;
  const from = Math.max(0, d - 60);
  const cut = (s) => (from > 0 ? '…' : '') + s.slice(from, from + 170) + (s.length > from + 170 ? '…' : '');
  return { before: cut(before).trim(), after: cut(after).trim() };
}

// 構建本 doc 的替換項(撞值偵測 G6)
function buildReplacements(doc, docState, measured, report) {
  const reps = [];           // {metric, kind, anchor, oldText, newText}
  const numMap = new Map();  // oldForm → {newForm, metrics[]}(kind=number 撞值合併)

  for (const spec of doc.specs) {
    const old = docState.metrics ? docState.metrics[spec.metric] : undefined;
    if (old == null) { report.skipped.push({ doc: doc.id, metric: spec.metric, reason: 'state 無舊值(未 bootstrap)' }); continue; }

    if (spec.kind === 'string') {
      const newText = spec.newStr(measured);
      if (newText == null || /null|undefined|NaN/.test(newText)) { report.skipped.push({ doc: doc.id, metric: spec.metric, reason: '實測值缺失' }); continue; }
      for (const o of Array.isArray(old) ? old : [old]) {
        if (o === newText) continue; // no-op
        reps.push({ metric: spec.metric, kind: 'string', oldText: o, newText });
      }
      continue;
    }

    const newVal = measured[spec.metric];
    if (newVal == null) { report.skipped.push({ doc: doc.id, metric: spec.metric, reason: '實測值缺失' }); continue; }
    for (const o of Array.isArray(old) ? old : [old]) {
      if (Number(o) === Number(newVal)) continue; // no-op
      if (spec.kind === 'anchored') {
        reps.push({ metric: spec.metric, kind: 'anchored', anchor: spec.anchor, oldText: comma(o), newText: comma(newVal), oldPlain: String(o), newPlain: String(newVal) });
      } else {
        // kind=number:全文替換,進 numMap 做撞值偵測
        const ofs = numForms(o), nfs = numForms(newVal);
        for (let i = 0; i < ofs.length; i++) {
          const oldForm = ofs[i], newForm = i < nfs.length ? nfs[i] : nfs[0];
          const hit = numMap.get(oldForm);
          if (hit) {
            if (hit.newForm !== newForm) { // G6 conflict
              report.conflicts.push({ doc: doc.id, oldForm, a: `${hit.metrics.join('+')}→${hit.newForm}`, b: `${spec.metric}→${newForm}` });
              hit.dead = true;
            } else hit.metrics.push(spec.metric);
          } else numMap.set(oldForm, { newForm, metrics: [spec.metric] });
        }
      }
    }
  }
  for (const [oldForm, v] of numMap) {
    if (v.dead) continue;
    reps.push({ metric: v.metrics.join('+'), kind: 'number', oldText: oldForm, newText: v.newForm });
  }
  // 長舊值優先(防子串先換)
  reps.sort((a, b) => b.oldText.length - a.oldText.length);
  return reps;
}

function processDoc(doc, docState, measured, report) {
  const abs = path.join(ROOT, doc.rel);
  if (!fs.existsSync(abs)) { report.skipped.push({ doc: doc.id, reason: `檔案不存在 ${doc.rel}` }); return null; }
  const raw = fs.readFileSync(abs, 'utf8');
  const hasBOM = raw.charCodeAt(0) === 0xFEFF;
  const body = hasBOM ? raw.slice(1) : raw;
  const lines = body.split('\n'); // 行尾 \r 保留在行串內(CRLF 安全)

  const reps = buildReplacements(doc, docState, measured, report);
  if (!reps.length) return { abs, hasBOM, lines, changes: [], reps };

  const exemptions = (docState.exemptions || []).map(e => e.contains);
  const changes = [];
  let inHistory = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // G3 歷史 section 狀態機(README)
    if (doc.historySectionRe) {
      if (inHistory && (/^#{1,3}\s+/.test(line) || /^---\s*$/.test(line)) && !doc.historySectionRe.test(line)) inHistory = false;
      if (doc.historySectionRe.test(line)) inHistory = true;
      if (inHistory) continue;
    }
    if (doc.lastUpdatedRe && doc.lastUpdatedRe.test(line)) continue;          // G3 最後更新行
    if (exemptions.some(x => line.includes(x))) continue;                      // G4 豁免造冊

    let updated = line;
    for (const r of reps) {
      if (r.kind === 'anchored') {
        if (!updated.includes(r.anchor)) continue;
        const before = updated;
        updated = updated.replace(guardedNumberRegex(r.oldText), r.newText);
        if (updated === before && r.oldPlain && r.oldPlain.length >= 2) {
          updated = updated.replace(new RegExp(`(?<![\\d,.])${esc(r.oldPlain)}(?![\\d,.])`, 'g'), r.newPlain);
        }
        if (updated !== before) changes.push({ doc: doc.id, line: i + 1, metric: r.metric, ...diffWindow(before, updated) });
      } else if (r.kind === 'string') {
        if (!updated.includes(r.oldText)) continue;
        const before = updated;
        updated = updated.split(r.oldText).join(r.newText);
        changes.push({ doc: doc.id, line: i + 1, metric: r.metric, ...diffWindow(before, updated) });
      } else {
        const re = guardedNumberRegex(r.oldText);
        if (!re.test(updated)) continue;
        const before = updated;
        updated = updated.replace(guardedNumberRegex(r.oldText), r.newText);
        if (updated !== before) changes.push({ doc: doc.id, line: i + 1, metric: r.metric, ...diffWindow(before, updated) });
      }
    }
    lines[i] = updated;
  }
  return { abs, hasBOM, lines, changes, reps };
}

// ------------------------------------------------------------
// 5. README 歷史記錄 prepend(G3 配套:最後更新行由此維護,非機械替換)
// ------------------------------------------------------------
function buildTransitions(docState, measured) {
  const CORE = [
    ['symbol_index', 'symbol_index'], ['symbol_dependencies', 'symbol_dependencies'],
    ['god_nodes', 'god_nodes'], ['document_chunks', 'document_chunks'],
    ['document_embeddings', 'document_embeddings'], ['embeddings_total', '7 表 embeddings'],
    ['gn_nodes', 'GitNexus nodes'], ['cg_nodes', 'CodeGraph nodes'],
  ];
  const t = [];
  for (const [k, label] of CORE) {
    const old = docState.metrics[k];
    const o = Array.isArray(old) ? old[0] : old;
    const nv = measured[k];
    if (o != null && nv != null && Number(o) !== Number(nv)) t.push(`${label} ${comma(o)}→${comma(nv)}`);
  }
  return t;
}

function prependHistory(lines, transitions, measured, ts) {
  if (!transitions.length) return false;
  const seg = `${ts.minute}(**檢索數字自動同步** — \`sync-retrieval-doc-counters.cjs\` ${transitions.join(' / ')} / doc coverage ${measured.doc_coverage_pct}%)`;
  let done = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^> \*\*最後更新\*\*: /.test(lines[i])) {
      lines[i] = lines[i].replace(/^(> \*\*最後更新\*\*: )/, `$1${seg}· `);
      done = true; break;
    }
  }
  // §12 表格 prepend(標題後第一條資料列前;插入行行尾對齊鄰行 — CRLF 安全)
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}\s*\d*\.?\s*(歷史變更紀錄|歷史紀錄)/.test(lines[i])) {
      for (let j = i + 1; j < lines.length && j < i + 8; j++) {
        if (/^\|[-\s|]+\|\s*$/.test(lines[j])) {
          const eol = lines[j].endsWith('\r') ? '\r' : '';
          lines.splice(j + 1, 0, `| ${ts.date} | **檢索數字自動同步**(\`sync-retrieval-doc-counters.cjs\`)— ${transitions.join(' / ')} · doc coverage ${measured.doc_coverage_pct}% | (本次)|${eol}`);
          return done;
        }
      }
      break;
    }
  }
  return done;
}

// ------------------------------------------------------------
// 6. main
// ------------------------------------------------------------
function main() {
  if (!fs.existsSync(DB_PATH)) { console.error(`[sync-doc] DB not found: ${DB_PATH}`); process.exit(2); }
  const ts = taiwanNow();
  const state = loadState();
  const measured = measure();
  const report = { run_at: ts.iso, mode: APPLY ? 'apply' : 'dry-run', docs: {}, conflicts: [], skipped: [], verify_exit: null };

  log('==========================================');
  log(`  檢索架構文檔數字同步 (${report.mode})`);
  log('==========================================');
  log('\n=== DB/引擎 實測真值 ===');
  for (const k of ['symbol_index', 'symbol_dependencies', 'god_nodes', 'in_degree_gt0', 'sum_in_degree',
    'document_chunks', 'document_embeddings', 'embeddings_total', 'doc_coverage_pct',
    'gn_nodes', 'gn_edges', 'gn_flows', 'cg_nodes', 'cg_edges', 'cg_files',
    'mcp_tools', 'real_logical_tables', 'fts5_tables', 'hooks_total', 'db_mb']) {
    log(`  ${k}: ${measured[k]}`);
  }

  const pending = [];
  for (const doc of DOCS) {
    const docState = state.docs[doc.rel];
    if (!docState) { report.skipped.push({ doc: doc.id, reason: 'state 檔無此 doc' }); continue; }
    const out = processDoc(doc, docState, measured, report);
    if (!out) continue;

    // README prepend 歷史記錄(dry-run 也模擬以顯示計畫;不寫檔即無破壞)
    let prepended = false;
    if (doc.prependHistory && !NO_HISTORY && out.changes.length) {
      const transitions = buildTransitions(docState, measured);
      prepended = prependHistory(out.lines, transitions, measured, ts);
    }
    report.docs[doc.id] = { rel: doc.rel, changes: out.changes.length, prepended };

    log(`\n=== ${doc.id}(${out.changes.length} 處變更${prepended ? ` + 歷史記錄 prepend${APPLY ? '' : '(dry-run 模擬)'}` : ''})===`);
    for (const c of out.changes) log(`  L${c.line} [${c.metric}]\n    - ${c.before}\n    + ${c.after}`);
    if (!out.changes.length) log('  (無變更 — 已同步或無匹配)');

    if (out.changes.length || prepended) pending.push({ doc, out });
  }

  if (report.conflicts.length) {
    log('\n⚠ 撞值衝突(同舊值不同新值,已跳過,需人工):');
    for (const c of report.conflicts) log(`  ${c.doc}: 舊值 ${c.oldForm} → ${c.a} vs ${c.b}`);
  }
  if (report.skipped.length) {
    log('\nℹ 跳過項:');
    for (const s of report.skipped) log(`  ${s.doc}/${s.metric || '-'}: ${s.reason}`);
  }

  if (!APPLY) {
    log('\n[sync-doc] dry-run 完成,未寫任何檔。確認計畫無誤後加 --apply 實際寫回。');
    if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
    return;
  }

  // --apply:寫回 + 更新狀態檔 + verify 收尾
  // 並行防呆(2026-07-25):與 refresh-all-retrieval.cjs 共用同一把鎖 —— 若該腳本正在
  // 全量重建中,DB 值可能是 harvest 清空/尚未 backfill 完的過渡態,此時寫回文檔數字
  // 會把「暫時性偏低值」誤植入 README/HTML,必須拒絕重疊執行(見 retrieval-lock.cjs)。
  let releaseLock;
  try {
    releaseLock = acquireLock(LOCK_PATH, { label: 'sync-retrieval-doc-counters --apply' });
  } catch (err) {
    console.error(`[sync-doc] ⛔ ${err.message}`);
    process.exit(3);
  }

  for (const { doc, out } of pending) {
    const content = (out.hasBOM ? '﻿' : '') + out.lines.join('\n');
    fs.writeFileSync(out.abs, content, 'utf8');
    log(`\n[sync-doc] ✍ 已寫回 ${doc.rel}`);
  }
  // 狀態檔:全部 metric 推進至實測值(含 no-op 與多舊值收斂為單值)
  for (const doc of DOCS) {
    const docState = state.docs[doc.rel];
    if (!docState) continue;
    for (const spec of doc.specs) {
      if (spec.kind === 'string') {
        const nv = spec.newStr(measured);
        if (nv != null && !/null|undefined|NaN/.test(nv)) docState.metrics[spec.metric] = nv;
      } else if (measured[spec.metric] != null) {
        docState.metrics[spec.metric] = measured[spec.metric];
      }
    }
  }
  state.last_synced_at = ts.iso;
  state.last_measured = { symbol_index: measured.symbol_index, embeddings_total: measured.embeddings_total, gn_nodes: measured.gn_nodes, cg_nodes: measured.cg_nodes };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
  log(`[sync-doc] ✍ 狀態檔已推進 ${path.relative(ROOT, STATE_PATH)}`);

  // verify 收尾(機械驗證同步成功)
  log('\n[sync-doc] ===== verify 收尾 =====');
  const v = spawnSync(process.execPath, [path.join(SCRIPT_DIR, 'verify-retrieval-architecture.cjs')], {
    cwd: ROOT, timeout: 120000, encoding: 'utf8', stdio: JSON_OUT ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  });
  report.verify_exit = v.status;
  log(`\n[sync-doc] 完成。verify exit=${v.status}${v.status === 0 ? '(無 drift ✅)' : '(仍有 drift — 見上方 verify 報告,可能為本工具 scope 外項目)'}`);
  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  releaseLock();
  process.exit(0);
}

main();
