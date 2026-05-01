// ============================================================
// PCPT Context Memory DB — ADR 文件 ETL 匯入腳本
// 解析 docs/technical-decisions/*.md → tech_entries 表
// ============================================================
// 執行方式:
//   node .context-db/scripts/import-adrs.js              (預設: incremental)
//   node .context-db/scripts/import-adrs.js --full       (清除舊記錄後全量匯入)
//   node .context-db/scripts/import-adrs.js --incremental (僅新增缺少的記錄)
//
// 欄位對應:
//   title        ← H1 標題
//   problem      ← 背景/Context 區塊 (≤500 字)
//   solution     ← 決策/Decision 區塊 (≤500 字)
//   tags         ← 檔名前綴 + 技術關鍵字掃描
//   related_files ← ADR 原始相對路徑
//   category     = 'architecture'
//   created_by   = 'etl-import-adrs'
//   outcome      = 'success'
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const ADR_DIR = path.join(__dirname, '..', '..', 'docs', 'technical-decisions');
const REPO_ROOT = path.join(__dirname, '..', '..');
const CREATED_BY = 'etl-import-adrs';
const CATEGORY = 'architecture';

// ──────────────────────────────────────────────
// 命令列參數解析
// ──────────────────────────────────────────────
const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'incremental';

// ──────────────────────────────────────────────
// 技術關鍵字 → tag 對應表
// ──────────────────────────────────────────────
const TECH_KEYWORD_MAP = [
  [/SignalR/i,           'signalr'],
  [/PDF|QuestPDF/i,      'pdf'],
  [/SQL Server|T-SQL/i,  'sql-server'],
  [/Azure/i,             'azure'],
  [/ASP\.NET|\.NET/i,    'aspnet'],
  [/React/i,             'react'],
  [/Zustand/i,           'zustand'],
  [/Fabric\.js/i,        'fabricjs'],
  [/Canvas/i,            'canvas'],
  [/ECPay|綠界/i,        'ecpay'],
  [/OAuth|JWT|RBAC/i,    'auth'],
  [/Bootstrap/i,         'bootstrap'],
  [/CSS/i,               'css'],
  [/WebSocket/i,         'websocket'],
  [/Excel/i,             'excel'],
  [/IndexedDB|Service Worker|Web Worker/i, 'pwa'],
  [/CDN/i,               'cdn'],
  [/Playwright/i,        'playwright'],
  [/xUnit|Moq/i,         'testing'],
  [/hreflang|JSON-LD|SEO/i, 'seo'],
  [/i18n|locale/i,       'i18n'],
  [/Migration|Entity Framework|EF Core/i, 'ef-core'],
  [/HMAC|reCAPTCHA|CSRF|CSP/i, 'security'],
  [/z-index/i,           'css'],
];

// ──────────────────────────────────────────────
// tag 萃取工具
// ──────────────────────────────────────────────
function extractPrefixTags(filePath) {
  const base = path.basename(filePath, '.md');
  const tags = [];

  if (/^ADR-DEPLOY/i.test(base)) tags.push('deployment');
  else if (/^ADR-FUTURE/i.test(base)) tags.push('future-plan');
  else if (/^ADR-QGR/i.test(base)) tags.push('epic-qgr');
  else if (/^ADR/i.test(base)) tags.push('adr');

  if (/^TD-ARCH/i.test(base)) tags.push('arch-decision');
  if (/^TD-PERF/i.test(base)) tags.push('performance');
  if (/^TD-UI/i.test(base)) tags.push('ui');
  if (/^TD-TEST/i.test(base)) tags.push('testing');
  if (/^TD-CSS/i.test(base)) tags.push('css');
  if (/^TD-ADMIN/i.test(base)) tags.push('admin');

  return tags;
}

function extractTechTags(content) {
  const tags = new Set();
  for (const [pattern, tag] of TECH_KEYWORD_MAP) {
    if (pattern.test(content)) tags.add(tag);
  }
  return [...tags];
}

// ──────────────────────────────────────────────
// Markdown 萃取工具
// ──────────────────────────────────────────────
function extractTitle(content) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function extractDate(content) {
  // 支援：**日期**: 2025-12-28  |  **建檔日期**：2026-03-07  |  **決策日期**: ...
  const m = content.match(/\*\*(?:日期|建檔日期|決策日期|Date)\*\*[：:]\s*(\d{4}-\d{2}-\d{2})/);
  return m ? `${m[1]}T00:00:00.000Z` : new Date().toISOString();
}

function extractStatus(content) {
  const m = content.match(/\*\*狀態\*\*[：:]\s*(.+?)(?:\n|$)/);
  return m ? m[1].trim().replace(/\*/g, '') : null;
}

/**
 * 萃取指定區塊的純文字內容（~500 字）
 * headingVariants: 正則字串陣列，逐一嘗試
 */
function extractSection(content, headingVariants) {
  for (const variant of headingVariants) {
    // 匹配 ## 標題 或 **粗體標題** 後面的內容
    const regex = new RegExp(
      `(?:^|\\n)(?:${variant})\\s*[：:]*\\s*\\n?([\\s\\S]*?)(?=\\n#{1,3}\\s|\\n---\\n|\\n\\*\\*[\\w\\u4e00-\\u9fa5]+\\*\\*[：:]|$)`,
      'i'
    );
    const m = content.match(regex);
    if (!m) continue;

    const text = m[1]
      .replace(/```[\s\S]*?```/g, '')      // 移除 code block
      .replace(/^\s*\|.+/gm, '')           // 移除表格行
      .replace(/^\s*[-*>]\s+/gm, '')       // 移除 list marker
      .replace(/\*\*/g, '')                // 移除 bold 標記
      .replace(/`[^`]+`/g, '')             // 移除 inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除連結，保留文字
      .replace(/\n{2,}/g, '\n')
      .trim();

    if (text.length > 15) return text.slice(0, 500).trim();
  }
  return null;
}

// ──────────────────────────────────────────────
// 解析單一 ADR 文件 → tech_entries 欄位物件
// ──────────────────────────────────────────────
function parseAdr(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const title = extractTitle(content);
  if (!title) return null; // 無 H1 (如 README.md) 則跳過

  const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const createdAt = extractDate(content);
  const status = extractStatus(content);

  // 問題/背景
  const problem = extractSection(content, [
    '##\\s+(?:\\d+\\.\\s+)?(?:背景|問題|Background|Context|背景與問題)',
    '\\*\\*背景\\*\\*',
  ]);

  // 決策/解決方案
  const solution =
    extractSection(content, [
      '##\\s+(?:\\d+\\.\\s+)?(?:決策|Decision|採用方案)',
      '\\*\\*決策\\*\\*',
    ]) ||
    extractSection(content, [
      '##\\s+(?:結論|後果|Consequences|Result)',
    ]);

  // tags 合併：前綴分類 + 技術關鍵字
  const prefixTags = extractPrefixTags(filePath);
  const techTags = extractTechTags(content);
  const allTags = [...new Set([...prefixTags, ...techTags])];

  // tech_stack：取前 5 個技術 tag
  const techStack = techTags.slice(0, 5).join(', ') || null;

  return {
    created_by: CREATED_BY,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    category: CATEGORY,
    tech_stack: techStack,
    tags: allTags.join(','),
    title,
    problem: problem || null,
    solution: solution || null,
    outcome: 'success',
    lessons: status ? `決策狀態: ${status}` : null,
    code_snippets: null,
    related_files: relativePath,
    references: null,
    confidence: 85,
  };
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function importAdrs() {
  console.log(`ADR ETL 匯入腳本 — 模式: ${MODE.toUpperCase()}`);
  console.log(`   ADR 目錄: ${ADR_DIR}`);
  console.log(`   DB:       ${DB_PATH}`);
  console.log('');

  if (!fs.existsSync(ADR_DIR)) {
    throw new Error(`ADR 目錄不存在: ${ADR_DIR}`);
  }

  // 收集所有 .md 檔（排除 README.md）
  const files = fs.readdirSync(ADR_DIR)
    .filter(f => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .map(f => path.join(ADR_DIR, f));

  console.log(`[1] 發現 ${files.length} 個 .md 檔（已排除 README.md）`);

  // 解析所有檔案
  const entries = [];
  const parseSkipped = [];

  for (const file of files) {
    const entry = parseAdr(file);
    if (entry) {
      entries.push(entry);
    } else {
      parseSkipped.push(path.basename(file));
    }
  }

  console.log(`[2] 解析成功: ${entries.length} 筆，跳過（無 H1）: ${parseSkipped.length} 筆`);
  if (parseSkipped.length > 0) {
    console.log(`    跳過: ${parseSkipped.join(', ')}`);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // --full 模式：先刪除所有 etl-import-adrs 記錄
  if (MODE === 'full') {
    const del = db.prepare(`DELETE FROM tech_entries WHERE created_by = ?`).run(CREATED_BY);
    console.log(`[3] 清除舊 ETL 記錄: ${del.changes} 筆`);
  }

  // 查詢現有記錄集合（title|category）用於 incremental 去重
  const existingKeys = new Set(
    db.prepare(
      `SELECT title || '|' || category AS k FROM tech_entries WHERE created_by = ?`
    ).all(CREATED_BY).map(r => r.k)
  );

  const stmt = db.prepare(`
    INSERT INTO tech_entries
      (created_by, created_at, updated_at, category, tech_stack, tags,
       title, problem, solution, outcome, lessons, code_snippets,
       related_files, "references", confidence)
    VALUES
      (@created_by, @created_at, @updated_at, @category, @tech_stack, @tags,
       @title, @problem, @solution, @outcome, @lessons, @code_snippets,
       @related_files, @references, @confidence)
  `);

  let inserted = 0;
  let duped = 0;

  const insertAll = db.transaction((rows) => {
    for (const row of rows) {
      const key = `${row.title}|${row.category}`;
      if (MODE === 'incremental' && existingKeys.has(key)) {
        duped++;
        continue;
      }
      stmt.run(row);
      inserted++;
    }
  });

  console.log('[4] 寫入 tech_entries...');
  insertAll(entries);

  // ── 結果統計 ──
  const etlCount = db.prepare(
    `SELECT COUNT(*) as c FROM tech_entries WHERE created_by = ?`
  ).get(CREATED_BY).c;

  const totalCount = db.prepare(
    `SELECT COUNT(*) as c FROM tech_entries`
  ).get().c;

  console.log('');
  console.log('匯入完成');
  console.log(`   本次新增:             ${inserted} 筆`);
  if (duped > 0) {
    console.log(`   重複跳過 (dedup):     ${duped} 筆`);
  }
  console.log(`   ETL 記錄小計:         ${etlCount} 筆 (created_by=${CREATED_BY})`);
  console.log(`   tech_entries 全表:    ${totalCount} 筆`);

  // 顯示已匯入清單
  const imported = db.prepare(
    `SELECT title, tags, related_files FROM tech_entries
     WHERE created_by = ?
     ORDER BY created_at DESC, id DESC`
  ).all(CREATED_BY);

  console.log('');
  console.log('   ─── 已匯入 ADR 列表 ───');
  for (const r of imported) {
    const t = (r.title || '').slice(0, 48).padEnd(48);
    const tags = (r.tags || '').slice(0, 50);
    console.log(`   ${t}  [${tags}]`);
  }

  db.close();
}

try {
  importAdrs();
} catch (err) {
  console.error('ADR ETL 失敗:', err.message);
  process.exit(1);
}
