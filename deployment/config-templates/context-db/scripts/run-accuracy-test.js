// ============================================================
// PCPT Context Memory DB — 搜尋準確度基準測試
// TD-32d AC-3~7: 15 個搜尋案例 + 5 個 trace_context 案例
// ============================================================
// 執行方式: node .context-db/scripts/run-accuracy-test.js
// 輸出: .context-db/accuracy-report.md
// Phase 0 通過標準: 總 Recall >= 70% (11/15)
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'context-memory.db');
const REPORT_PATH = path.join(__dirname, '..', 'accuracy-report.md');

// ──────────────────────────────────────────────
// 測試案例定義：AC-3 英文查詢（5 案例）
// ──────────────────────────────────────────────
const englishTestCases = [
  {
    id: 'EN-1',
    query: 'Canvas coordinate transform',
    table: 'tech',
    expectedKeywords: ['canvas', 'coordinate', 'dpi', 'scale', 'canvasconstants'],
    expectedTitleHint: 'Canvas coordinate',
    description: '應命中 Canvas 座標轉換相關記錄（英文條目 TE-16）',
  },
  {
    id: 'EN-2',
    query: 'PDF Chinese font',
    table: 'tech',
    expectedKeywords: ['pdf', 'font', '字型', 'questpdf', 'chinese'],
    expectedTitleHint: 'PDF 中文字型',
    description: '應命中 PdfWorker 中文字型記錄',
  },
  {
    id: 'EN-3',
    query: 'ECPay Webhook retry',
    table: 'tech',
    expectedKeywords: ['ecpay', 'webhook', 'retry', '冪等', 'idempotency'],
    expectedTitleHint: 'ECPay Webhook',
    description: '應命中 WebhooksController 相關記錄',
  },
  {
    id: 'EN-4',
    query: 'useShallow infinite loop',
    table: 'tech',
    expectedKeywords: ['useshallow', 'infinite', 'zustand', 'selector', 'loop'],
    expectedTitleHint: 'useShallow',
    description: '應命中 Zustand useShallow 無限重渲染修復記錄',
  },
  {
    id: 'EN-5',
    query: 'SignalR progress hub',
    table: 'context',
    expectedKeywords: ['signalr', 'hub', 'progress', 'pdf', 'push'],
    expectedTitleHint: 'SignalR',
    description: '應命中 QGR-D5 SignalR 相關記錄',
  },
];

// ──────────────────────────────────────────────
// 測試案例定義：AC-4 中文查詢（5 案例）
// ──────────────────────────────────────────────
const chineseTestCases = [
  {
    id: 'ZH-1',
    query: '座標轉換',
    table: 'context',
    expectedKeywords: ['canvas', '座標', 'dpi', '轉換'],
    expectedTitleHint: '座標',
    description: '應命中 Canvas 座標系統記錄',
  },
  {
    id: 'ZH-2',
    query: '技術債',
    table: 'context',
    expectedKeywords: ['sprint-status', 'trs', 'yaml', '效能'],
    expectedTitleHint: 'Sprint-Status',
    description: '應命中 TRS/技術債相關記錄',
  },
  {
    id: 'ZH-3',
    query: '金流退款',
    table: 'tech',
    expectedKeywords: ['ecpay', 'webhook', '冪等', 'order'],
    expectedTitleHint: 'ECPay',
    description: '應命中 ECPay 金流相關記錄',
  },
  {
    id: 'ZH-4',
    query: '品牌色彩',
    table: 'context',
    expectedKeywords: ['品牌', 'css', 'design token', 'variable', 'wcag'],
    expectedTitleHint: '品牌',
    description: '應命中 QGR-A5 品牌色彩記錄',
  },
  {
    id: 'ZH-5',
    query: '測試覆蓋',
    table: 'tech',
    expectedKeywords: ['test', 'coverage', '測試', 'pattern'],
    expectedTitleHint: null, // 寬鬆：任何 test_pattern 記錄
    description: '應命中 testing patterns 相關記錄',
  },
];

// ──────────────────────────────────────────────
// 測試案例定義：AC-5 中英混合查詢（5 案例）
// ──────────────────────────────────────────────
const mixedTestCases = [
  {
    id: 'MX-1',
    query: 'PDF QuestPDF 浮水印',
    table: 'tech',
    expectedKeywords: ['pdf', 'questpdf', 'watermark', '浮水印'],
    expectedTitleHint: 'PDF',
    description: '應命中 QGR-D3 PDF 記錄',
  },
  {
    id: 'MX-2',
    query: 'Zustand stale closure',
    table: 'context',
    expectedKeywords: ['zustand', 'stale', 'closure', 'selector', 'getstate'],
    expectedTitleHint: 'Zustand',
    description: '應命中 Zustand stale closure 修復記錄（context_entries CE-9）',
  },
  {
    id: 'MX-3',
    query: 'Admin Dashboard KPI',
    table: 'tech',
    expectedKeywords: ['admin', 'dashboard', 'kpi', 'backoffice', 'service'],
    expectedTitleHint: 'Admin Dashboard KPI',
    description: '應命中 Admin Dashboard KPI 即時資料架構設計（TE-11）',
  },
  {
    id: 'MX-4',
    query: 'reCAPTCHA 驗證',
    table: 'context',
    expectedKeywords: ['recaptcha', '驗證', 'contact', 'google'],
    expectedTitleHint: 'reCAPTCHA',
    description: '應命中 QGR-M5 reCAPTCHA 記錄',
  },
  {
    id: 'MX-5',
    query: 'sprint-status YAML 效能',
    table: 'context',
    expectedKeywords: ['sprint-status', 'yaml', '效能', 'cache'],
    expectedTitleHint: 'Sprint-Status',
    description: '應命中 TRS sprint-status 效能記錄',
  },
];

// ──────────────────────────────────────────────
// 測試案例定義：AC-6 trace_context（5 案例）
// ──────────────────────────────────────────────
const traceTestCases = [
  {
    id: 'TR-1',
    query: 'Canvas 座標',
    pivotTable: 'context',
    expectedProximity: [0, 1],
    description: '查詢 Canvas 座標 → 追蹤到同 story_id 的其他記錄（proximity=0/1）',
  },
  {
    id: 'TR-2',
    query: 'ECPay Webhook',
    pivotTable: 'tech',
    expectedProximity: [0, 1],
    description: '查詢 ECPay Webhook → 追蹤到同 related_files 的其他記錄',
  },
  {
    id: 'TR-3',
    query: 'ESM module',
    pivotTable: 'context',
    expectedProximity: [0, 1],
    description: '查詢 ESM → 追蹤到 TD-32 系列記錄',
  },
  {
    id: 'TR-4',
    query: 'WAL SQLite',
    pivotTable: 'tech',
    expectedProximity: [0],
    description: '直接命中 WAL 模式記錄（proximity=0）',
  },
  {
    id: 'TR-5',
    query: 'FTS5 trigram',
    pivotTable: 'context',
    expectedProximity: [0, 1],
    description: '查詢 FTS5 → 追蹤到 Context Memory 系列記錄',
  },
];

// ──────────────────────────────────────────────
// FTS5 查詢安全化：避免特殊字元被解析為運算子
// - 連字號 (-) → 空格（防止被解析為 NOT 運算子）
// - 引號、括號等 → 移除
// - 短字串（< 3 char per token）由 FTS5 trigram 自動過濾
// ──────────────────────────────────────────────
function safeFtsQuery(query) {
  return query
    .replace(/-/g, ' ')   // 連字號改空格（避免 FTS5 NOT 運算子）
    .replace(/["()*:^]/g, ' ')  // 移除 FTS5 特殊字元
    .replace(/\s+/g, ' ')
    .trim();
}

// ──────────────────────────────────────────────
// 搜尋實作（直接查詢 DB，不透過 MCP）
// ──────────────────────────────────────────────
function searchContext(db, query, limit = 10) {
  const safeQuery = safeFtsQuery(query);
  if (safeQuery.length < 3) {
    // FTS5 trigram 限制：< 3 字元改用最近記錄
    return db.prepare('SELECT * FROM context_entries ORDER BY id DESC LIMIT ?').all(limit);
  }
  try {
    return db.prepare(`
      SELECT ce.*, fts.rank
      FROM context_fts fts
      JOIN context_entries ce ON ce.id = fts.rowid
      WHERE context_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(safeQuery, limit);
  } catch (e) {
    // FTS5 解析錯誤時退回最近記錄
    console.warn(`    [WARN] FTS5 query error for "${safeQuery}": ${e.message}`);
    return [];
  }
}

function searchTech(db, query, limit = 10) {
  const safeQuery = safeFtsQuery(query);
  if (safeQuery.length < 3) {
    return db.prepare('SELECT * FROM tech_entries ORDER BY id DESC LIMIT ?').all(limit);
  }
  try {
    return db.prepare(`
      SELECT te.*, fts.rank
      FROM tech_fts fts
      JOIN tech_entries te ON te.id = fts.rowid
      WHERE tech_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(safeQuery, limit);
  } catch (e) {
    console.warn(`    [WARN] FTS5 query error for "${safeQuery}": ${e.message}`);
    return [];
  }
}

function traceContext(db, query, limit = 5) {
  const results = [];
  const safeQuery = safeFtsQuery(query);
  let directHits = [];

  // proximity=0: 直接命中
  if (safeQuery.length >= 3) {
    try {
      const ctxHits = db.prepare(`
        SELECT ce.*, 'context' as source_table, 0 as proximity, fts.rank
        FROM context_fts fts
        JOIN context_entries ce ON ce.id = fts.rowid
        WHERE context_fts MATCH ?
        ORDER BY fts.rank LIMIT ?
      `).all(safeQuery, limit);
      directHits.push(...ctxHits);
    } catch (e) {
      console.warn(`    [WARN] trace context FTS5 error: ${e.message}`);
    }

    try {
      const techHits = db.prepare(`
        SELECT te.*, 'tech' as source_table, 0 as proximity, fts.rank
        FROM tech_fts fts
        JOIN tech_entries te ON te.id = fts.rowid
        WHERE tech_fts MATCH ?
        ORDER BY fts.rank LIMIT ?
      `).all(safeQuery, limit);
      directHits.push(...techHits);
    } catch (e) {
      console.warn(`    [WARN] trace tech FTS5 error: ${e.message}`);
    }

    results.push(...directHits.map(r => ({ ...r, proximity: 0 })));
  }

  // proximity=1: 同 story_id 關聯（直接 story_id 查詢，避免 FTS5 NOT IN）
  const pivotStoryIds = [...new Set(directHits
    .map(r => r.story_id)
    .filter(Boolean))];
  const directIds = new Set(directHits.map(r => r.id).filter(Boolean));

  for (const storyId of pivotStoryIds) {
    try {
      const related = db.prepare(`
        SELECT *, 'context' as source_table, 1 as proximity
        FROM context_entries
        WHERE story_id = ?
        LIMIT 5
      `).all(storyId);
      results.push(...related.filter(r => !directIds.has(r.id)));
    } catch (e) {
      // ignore
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// CMI-3 搜尋實作（conversation 表）
// ──────────────────────────────────────────────
function searchConversations(db, query, { dateFrom, dateTo, role, limit = 10 } = {}) {
  const safeQuery = safeFtsQuery(query);
  if (safeQuery.length < 3) return [];
  try {
    let sql = `
      SELECT ct.session_id, ct.role, ct.content_preview, ct.timestamp, cs.started_at
      FROM conversation_turns_fts fts
      JOIN conversation_turns ct ON ct.id = fts.rowid
      JOIN conversation_sessions cs ON cs.session_id = ct.session_id
      WHERE conversation_turns_fts MATCH ?
    `;
    const params = [safeQuery];
    if (role) { sql += ' AND ct.role = ?'; params.push(role); }
    if (dateFrom) { sql += ' AND ct.timestamp >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND ct.timestamp <= ?'; params.push(dateTo + 'T23:59:59'); }
    sql += ' ORDER BY fts.rank LIMIT ?';
    params.push(limit);
    return db.prepare(sql).all(...params);
  } catch (e) {
    console.warn(`    [WARN] conversation FTS5 error for "${safeQuery}": ${e.message}`);
    return [];
  }
}

function listSessions(db, { dateFrom, dateTo, limit = 10 } = {}) {
  try {
    let sql = 'SELECT * FROM conversation_sessions WHERE 1=1';
    const params = [];
    if (dateFrom) { sql += ' AND started_at >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND started_at <= ?'; params.push(dateTo + 'T23:59:59'); }
    sql += ' ORDER BY started_at DESC LIMIT ?';
    params.push(limit);
    return db.prepare(sql).all(...params);
  } catch (e) {
    console.warn(`    [WARN] listSessions error: ${e.message}`);
    return [];
  }
}

// ──────────────────────────────────────────────
// CMI-3 測試案例（4 案例，AC-5 Recall >= 80%）
// ──────────────────────────────────────────────
const cmi3TestCases = [
  {
    id: 'CMI3-1',
    description: 'list_sessions: 2026-03-06 日期範圍應有對話記錄',
    fn: (db) => listSessions(db, { dateFrom: '2026-03-06', dateTo: '2026-03-07' }),
    check: (rows) => rows.length > 0,
  },
  {
    id: 'CMI3-2',
    description: 'search_conversations: "token" 查詢應命中 token 相關對話',
    fn: (db) => searchConversations(db, 'token'),
    check: (rows) => rows.length > 0 && rows.some(r =>
      (r.content_preview || '').toLowerCase().includes('token')
    ),
  },
  {
    id: 'CMI3-3',
    description: 'search_conversations: "editor" + date 過濾應命中編輯器相關對話',
    fn: (db) => searchConversations(db, 'editor', { dateFrom: '2026-02-01' }),
    check: (rows) => rows.length > 0,
  },
  {
    id: 'CMI3-4',
    description: 'search_conversations: "SignalR" + role=user 應命中使用者提問記錄',
    fn: (db) => searchConversations(db, 'SignalR', { role: 'user' }),
    check: (rows) => rows.length > 0 && rows.every(r => r.role === 'user'),
  },
];

// ──────────────────────────────────────────────
// Phase 1 搜尋實作（CMI-2 新表）
// ──────────────────────────────────────────────
function searchStories(db, query, limit = 10) {
  const safeQuery = safeFtsQuery(query);
  if (safeQuery.length < 3) {
    return db.prepare('SELECT * FROM stories ORDER BY rowid DESC LIMIT ?').all(limit);
  }
  try {
    return db.prepare(`
      SELECT s.*, fts.rank
      FROM stories_fts fts
      JOIN stories s ON s.rowid = fts.rowid
      WHERE stories_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(safeQuery, limit);
  } catch (e) {
    console.warn(`    [WARN] stories FTS5 error for "${safeQuery}": ${e.message}`);
    return [];
  }
}

function searchCrIssues(db, query, limit = 10) {
  const safeQuery = safeFtsQuery(query);
  if (safeQuery.length < 3) {
    return db.prepare('SELECT * FROM cr_issues ORDER BY id DESC LIMIT ?').all(limit);
  }
  try {
    return db.prepare(`
      SELECT ci.*, fts.rank
      FROM cr_issues_fts fts
      JOIN cr_issues ci ON ci.id = fts.rowid
      WHERE cr_issues_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(safeQuery, limit);
  } catch (e) {
    console.warn(`    [WARN] cr_issues FTS5 error for "${safeQuery}": ${e.message}`);
    return [];
  }
}

function searchDocIndex(db, query, limit = 10) {
  const safeQuery = safeFtsQuery(query);
  if (safeQuery.length < 3) {
    return db.prepare('SELECT * FROM doc_index ORDER BY id DESC LIMIT ?').all(limit);
  }
  try {
    return db.prepare(`
      SELECT di.*, fts.rank
      FROM doc_index_fts fts
      JOIN doc_index di ON di.id = fts.rowid
      WHERE doc_index_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `).all(safeQuery, limit);
  } catch (e) {
    console.warn(`    [WARN] doc_index FTS5 error for "${safeQuery}": ${e.message}`);
    return [];
  }
}

// ──────────────────────────────────────────────
// Phase 1 測試案例（CMI-2 AC-8: 10 案例）
// ──────────────────────────────────────────────
const phase1TestCases = [
  // Stories 表搜尋（3 案例）
  {
    id: 'P1-1',
    query: 'dashboard chart',
    table: 'stories',
    expectedKeywords: ['dashboard', 'chart', 'qgr-a2'],
    expectedTitleHint: 'dashboard',
    description: '搜尋 stories_fts: 應命中 Dashboard Chart 相關 Story',
  },
  {
    id: 'P1-2',
    query: 'PDF preview thumbnail',
    table: 'stories',
    expectedKeywords: ['pdf', 'preview', 'thumbnail'],
    expectedTitleHint: 'pdf',
    description: '搜尋 stories_fts: 應命中 PDF 預覽縮圖 Story',
  },
  {
    id: 'P1-3',
    query: 'API金鑰管理',
    table: 'stories',
    expectedKeywords: ['api', '金鑰', 'apikey'],
    expectedTitleHint: 'api',
    description: '搜尋 stories_fts: 中文查詢應命中 API 金鑰相關 Story',
  },
  // CR Issues 搜尋（3 案例）
  {
    id: 'P1-4',
    query: 'ErrorHandling',
    table: 'cr_issues',
    expectedKeywords: ['error', 'handling', 'errorhandling'],
    expectedTitleHint: null,
    description: '搜尋 cr_issues_fts: 應命中 ErrorHandling 維度的 Issue',
  },
  {
    id: 'P1-5',
    query: 'DEFERRED',
    table: 'cr_issues',
    expectedKeywords: ['deferred'],
    expectedTitleHint: null,
    description: '搜尋 cr_issues_fts: 應命中延後處理的 Issue',
  },
  {
    id: 'P1-6',
    query: 'TestCoverage',
    table: 'cr_issues',
    expectedKeywords: ['test', 'coverage', 'testcoverage'],
    expectedTitleHint: null,
    description: '搜尋 cr_issues_fts: 應命中測試覆蓋率維度的 Issue',
  },
  // Doc Index 搜尋（2 案例）
  {
    id: 'P1-7',
    query: 'database schema',
    table: 'doc_index',
    expectedKeywords: ['database', 'schema', 'sql'],
    expectedTitleHint: 'database',
    description: '搜尋 doc_index_fts: 應命中資料庫 Schema 規格文件',
  },
  {
    id: 'P1-8',
    query: 'security spec',
    table: 'doc_index',
    expectedKeywords: ['security', 'spec', 'csp'],
    expectedTitleHint: 'security',
    description: '搜尋 doc_index_fts: 應命中安全規格文件',
  },
  // 跨表驗證（2 案例：Story → CR 關聯）
  {
    id: 'P1-9',
    query: 'excel export',
    table: 'stories',
    expectedKeywords: ['excel', 'export', 'download'],
    expectedTitleHint: 'excel',
    description: '搜尋 stories_fts: 應命中 Excel 匯出相關 Story',
  },
  {
    id: 'P1-10',
    query: 'SignalR realtime push',
    table: 'stories',
    expectedKeywords: ['signalr', 'realtime', 'push'],
    expectedTitleHint: 'signalr',
    description: '搜尋 stories_fts: 應命中 SignalR 即時推送 Story',
  },
];

// ──────────────────────────────────────────────
// CMI-5 文檔搜尋實作（document_chunks_fts）
// ──────────────────────────────────────────────
function searchDocumentChunks(db, query, limit = 10) {
  const safeQuery = safeFtsQuery(query);
  if (safeQuery.length < 3) return [];
  try {
    return db.prepare(`
      SELECT dc.id AS chunk_id, dc.heading_path, SUBSTR(dc.content, 1, 300) AS content_preview,
             di.path AS file_path, di.title AS doc_title, di.category AS doc_category,
             di.epic_id AS doc_epic_id, fts.rank
      FROM document_chunks_fts fts
      JOIN document_chunks dc ON dc.id = fts.rowid
      JOIN doc_index di ON dc.doc_id = di.id
      WHERE document_chunks_fts MATCH ?
        AND dc.is_stale = 0
      ORDER BY fts.rank
      LIMIT ?
    `).all(safeQuery, limit);
  } catch (e) {
    console.warn(`    [WARN] document_chunks FTS5 error for "${safeQuery}": ${e.message}`);
    return [];
  }
}

// ──────────────────────────────────────────────
// CMI-5 測試案例（QA-01~10，Pass Rate >= 80%）
// 涵蓋功能規格、技術規格、架構決策、Skills、Story 等文檔類型
// ──────────────────────────────────────────────
const cmi5TestCases = [
  {
    id: 'QA-01',
    query: 'ECPay Webhook 冪等',
    expectedKeywords: ['ecpay', 'webhook', '冪等', 'payment'],
    expectedFileHint: 'payment',
    description: '金流 Webhook 冪等處理 → 應命中金流功能規格或相關 Story',
  },
  {
    id: 'QA-02',
    query: 'Canvas 座標轉換 DPI',
    expectedKeywords: ['canvas', '座標', 'dpi', 'transform'],
    expectedFileHint: null,
    expectedCategoryHint: ['architecture', 'functional-specs', 'skills', 'stories'],
    description: 'Canvas 座標轉換 → 應命中編輯器架構文件或相關 Story',
  },
  {
    id: 'QA-03',
    query: 'SignalR 即時推送',
    expectedKeywords: ['signalr', '即時', '推送', 'hub'],
    expectedFileHint: 'signalr',
    description: 'SignalR 即時推送 → 應命中 SignalR Skill 或相關技術規格',
  },
  {
    id: 'QA-04',
    query: 'PDF QuestPDF 生成',
    expectedKeywords: ['pdf', 'questpdf'],
    expectedFileHint: null,
    expectedCategoryHint: ['functional-specs', 'architecture', 'skills', 'stories'],
    description: 'PDF 生成 → 應命中 PDF 引擎功能規格或架構文件',
  },
  {
    id: 'QA-05',
    query: 'Zustand stale closure getState',
    expectedKeywords: ['zustand', 'stale', 'closure', 'getstate'],
    expectedFileHint: 'zustand',
    description: 'Zustand 陳舊閉包 → 應命中 pcpt-zustand-patterns Skill',
  },
  {
    id: 'QA-06',
    query: 'database schema migration SQL',
    expectedKeywords: ['database', 'schema', 'migration', 'sql'],
    expectedFileHint: null,
    expectedCategoryHint: ['technical-specs', 'architecture'],
    description: '資料庫 Schema → 應命中技術規格或架構文件',
  },
  {
    id: 'QA-07',
    query: 'CSP security headers',
    expectedKeywords: ['csp', 'security', 'header'],
    expectedFileHint: 'security',
    description: 'CSP 安全標頭 → 應命中安全規格文件',
  },
  {
    id: 'QA-08',
    query: 'API金鑰管理功能規格',
    expectedKeywords: ['api', '金鑰', 'apikey'],
    expectedFileHint: null,
    expectedCategoryHint: ['functional-specs', 'stories'],
    description: 'API 金鑰管理 → 應命中功能規格或相關 Story',
  },
  {
    id: 'QA-09',
    query: 'Admin Dashboard KPI 管理後台',
    expectedKeywords: ['admin', 'dashboard', 'kpi'],
    expectedFileHint: null,
    expectedCategoryHint: ['functional-specs', 'stories'],
    description: 'Admin Dashboard → 應命中管理後台功能規格',
  },
  {
    id: 'QA-10',
    query: 'testing strategy coverage xUnit',
    expectedKeywords: ['test', 'coverage', 'xunit'],
    expectedFileHint: 'testing',
    description: '測試策略 → 應命中測試策略文件',
  },
];

// ──────────────────────────────────────────────
// CMI-5 命中判斷
// ──────────────────────────────────────────────
function isDocumentHit(results, testCase) {
  if (results.length === 0) return false;

  // 以 expectedFileHint 判斷（命中含 hint 的 file_path 或 doc_title）
  if (testCase.expectedFileHint) {
    const hint = testCase.expectedFileHint.toLowerCase();
    if (results.some(r => {
      const path = (r.file_path || '').toLowerCase();
      const title = (r.doc_title || '').toLowerCase();
      return path.includes(hint) || title.includes(hint);
    })) return true;
  }

  // 以 expectedCategoryHint 判斷（命中指定 category 的文檔）
  if (testCase.expectedCategoryHint) {
    if (results.some(r => testCase.expectedCategoryHint.includes(r.doc_category))) return true;
  }

  // 以 expectedKeywords 關鍵字命中（任意 2 個以上）
  const keywords = testCase.expectedKeywords;
  return results.some(r => {
    const text = [r.doc_title, r.heading_path, r.content_preview, r.file_path, r.doc_epic_id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matches = keywords.filter(kw => text.includes(kw.toLowerCase()));
    return matches.length >= 2;
  });
}

// ──────────────────────────────────────────────
// Phase 1 命中判斷（與 Phase 0 類似但適配新表欄位）
// ──────────────────────────────────────────────
function isPhase1Hit(results, testCase) {
  if (results.length === 0) return false;

  if (testCase.expectedTitleHint) {
    const hint = testCase.expectedTitleHint.toLowerCase();
    return results.some(r => {
      const title = (r.title || r.summary || r.story_id || '').toLowerCase();
      return title.includes(hint);
    });
  }

  const keywords = testCase.expectedKeywords;
  return results.some(r => {
    const text = [r.title, r.summary, r.tags, r.dimension, r.story_id, r.path, r.domain]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matches = keywords.filter(kw => text.includes(kw.toLowerCase()));
    return matches.length >= 1;
  });
}

// ──────────────────────────────────────────────
// 命中判斷邏輯
// ──────────────────────────────────────────────
function isHit(results, testCase) {
  if (results.length === 0) return false;

  // 以 expectedTitleHint 為主要命中判斷
  if (testCase.expectedTitleHint) {
    const hint = testCase.expectedTitleHint.toLowerCase();
    return results.some(r => {
      const title = (r.title || '').toLowerCase();
      return title.includes(hint);
    });
  }

  // 以 expectedKeywords 關鍵字命中（任意 2 個以上）
  const keywords = testCase.expectedKeywords;
  return results.some(r => {
    const text = [r.title, r.content, r.problem, r.solution, r.lessons, r.tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matches = keywords.filter(kw => text.includes(kw.toLowerCase()));
    return matches.length >= 2;
  });
}

// ──────────────────────────────────────────────
// trace_context 命中判斷
// ──────────────────────────────────────────────
function isTraceHit(results, testCase) {
  if (results.length === 0) return false;
  const hasProximity0 = results.some(r => r.proximity === 0);
  const hasProximity1 = results.some(r => r.proximity === 1);
  return hasProximity0 || hasProximity1;
}

// ──────────────────────────────────────────────
// 執行測試並收集結果
// ──────────────────────────────────────────────
function runTests(db) {
  const results = {
    english: [],
    chinese: [],
    mixed: [],
    trace: [],
    phase1: [],
  };

  console.log('\n[AC-3] 英文查詢測試（5 案例）...');
  for (const tc of englishTestCases) {
    const fn = tc.table === 'tech' ? searchTech : searchContext;
    const rows = fn(db, tc.query);
    const hit = isHit(rows, tc);
    results.english.push({ ...tc, hit, resultCount: rows.length, topResult: rows[0]?.title || '(無結果)' });
    console.log(`  ${hit ? '✅' : '❌'} ${tc.id}: ${tc.query} → ${rows.length} 筆, 命中: ${hit ? 'YES' : 'NO'}`);
    if (!hit && rows.length > 0) {
      console.log(`     Top: "${rows[0]?.title || rows[0]?.problem?.slice(0, 50) || '?'}"`);
    }
  }

  console.log('\n[AC-4] 中文查詢測試（5 案例）...');
  for (const tc of chineseTestCases) {
    const fn = tc.table === 'tech' ? searchTech : searchContext;
    const rows = fn(db, tc.query);
    const hit = isHit(rows, tc);
    results.chinese.push({ ...tc, hit, resultCount: rows.length, topResult: rows[0]?.title || '(無結果)' });
    console.log(`  ${hit ? '✅' : '❌'} ${tc.id}: ${tc.query} → ${rows.length} 筆, 命中: ${hit ? 'YES' : 'NO'}`);
    if (!hit && rows.length > 0) {
      console.log(`     Top: "${rows[0]?.title || '?'}"`);
    }
  }

  console.log('\n[AC-5] 中英混合查詢測試（5 案例）...');
  for (const tc of mixedTestCases) {
    const fn = tc.table === 'tech' ? searchTech : searchContext;
    const rows = fn(db, tc.query);
    const hit = isHit(rows, tc);
    results.mixed.push({ ...tc, hit, resultCount: rows.length, topResult: rows[0]?.title || '(無結果)' });
    console.log(`  ${hit ? '✅' : '❌'} ${tc.id}: ${tc.query} → ${rows.length} 筆, 命中: ${hit ? 'YES' : 'NO'}`);
    if (!hit && rows.length > 0) {
      console.log(`     Top: "${rows[0]?.title || '?'}"`);
    }
  }

  console.log('\n[AC-6] trace_context 測試（5 案例）...');
  for (const tc of traceTestCases) {
    const rows = traceContext(db, tc.query);
    const hit = isTraceHit(rows, tc);
    const p0count = rows.filter(r => r.proximity === 0).length;
    const p1count = rows.filter(r => r.proximity === 1).length;
    results.trace.push({ ...tc, hit, resultCount: rows.length, p0count, p1count });
    console.log(`  ${hit ? '✅' : '❌'} ${tc.id}: ${tc.query} → P0:${p0count}, P1:${p1count}, 命中: ${hit ? 'YES' : 'NO'}`);
  }

  // Phase 1 測試（CMI-2 AC-8: 10 案例）
  const hasPhase1Tables = (() => {
    try {
      db.prepare("SELECT 1 FROM stories LIMIT 1").get();
      return true;
    } catch { return false; }
  })();

  if (hasPhase1Tables) {
    console.log('\n[CMI-2 AC-8] Phase 1 ETL 搜尋測試（10 案例）...');
    for (const tc of phase1TestCases) {
      const fnMap = { stories: searchStories, cr_issues: searchCrIssues, doc_index: searchDocIndex };
      const fn = fnMap[tc.table];
      const rows = fn(db, tc.query);
      const hit = isPhase1Hit(rows, tc);
      results.phase1.push({ ...tc, hit, resultCount: rows.length, topResult: rows[0]?.title || rows[0]?.summary || rows[0]?.story_id || '(無結果)' });
      console.log(`  ${hit ? '✅' : '❌'} ${tc.id}: ${tc.query} → ${rows.length} 筆, 命中: ${hit ? 'YES' : 'NO'}`);
      if (!hit && rows.length > 0) {
        console.log(`     Top: "${rows[0]?.title || rows[0]?.summary || '?'}"`);
      }
    }
  } else {
    console.log('\n[CMI-2 AC-8] Phase 1 表不存在，跳過（需先執行 init-db.js + ETL 匯入）');
  }

  // CMI-5 測試（document_chunks 查詢，10 案例）
  const hasDocChunks = (() => {
    try { db.prepare("SELECT 1 FROM document_chunks LIMIT 1").get(); return true; }
    catch { return false; }
  })();

  if (hasDocChunks) {
    const docCount = (() => {
      try { return db.prepare("SELECT COUNT(*) as cnt FROM document_chunks WHERE is_stale = 0").get().cnt; }
      catch { return 0; }
    })();
    console.log(`\n[CMI-5 QA-01~10] Document Search 驗收測試（10 案例，${docCount} 個有效 chunks）...`);

    if (docCount === 0) {
      console.log('  ⚠️  document_chunks 為空，請先執行: node .context-db/scripts/import-documents.js');
      results.cmi5 = cmi5TestCases.map(tc => ({ ...tc, hit: false, resultCount: 0, topResult: '(無資料)' }));
    } else {
      for (const tc of cmi5TestCases) {
        const rows = searchDocumentChunks(db, tc.query, 10);
        const hit = isDocumentHit(rows, tc);
        results.cmi5 = results.cmi5 || [];
        results.cmi5.push({ ...tc, hit, resultCount: rows.length, topResult: rows[0]?.doc_title || rows[0]?.file_path || '(無結果)' });
        console.log(`  ${hit ? '✅' : '❌'} ${tc.id}: ${tc.query} → ${rows.length} 筆, 命中: ${hit ? 'YES' : 'NO'}`);
        if (!hit && rows.length > 0) {
          console.log(`     Top: "${rows[0]?.doc_title || rows[0]?.file_path || '?'}" [${rows[0]?.doc_category || '?'}]`);
        }
      }
    }
  } else {
    console.log('\n[CMI-5 QA-01~10] document_chunks 表不存在，跳過（需先執行 init-db.js + import-documents.js）');
    results.cmi5 = [];
  }

  // CMI-3 測試（conversation 查詢，4 案例）
  const hasConvTables = (() => {
    try { db.prepare("SELECT 1 FROM conversation_sessions LIMIT 1").get(); return true; }
    catch { return false; }
  })();

  if (hasConvTables) {
    console.log('\n[CMI-3 AC-5] Conversation 查詢驗證（4 案例）...');
    for (const tc of cmi3TestCases) {
      const rows = tc.fn(db);
      const hit = tc.check(rows);
      results.cmi3 = results.cmi3 || [];
      results.cmi3.push({ ...tc, hit, resultCount: rows.length });
      console.log(`  ${hit ? '✅' : '❌'} ${tc.id}: ${tc.description} → ${rows.length} 筆, 命中: ${hit ? 'YES' : 'NO'}`);
    }
  } else {
    console.log('\n[CMI-3 AC-5] conversation 表不存在，跳過（需先執行 init-db.js + import-conversations.js）');
    results.cmi3 = [];
  }

  return results;
}

// ──────────────────────────────────────────────
// Recall 計算
// ──────────────────────────────────────────────
function calcRecall(cases) {
  const hits = cases.filter(c => c.hit).length;
  return { hits, total: cases.length, recall: hits / cases.length };
}

// ──────────────────────────────────────────────
// Markdown 報告產出
// ──────────────────────────────────────────────
function generateReport(results, dbStats) {
  const enRecall = calcRecall(results.english);
  const zhRecall = calcRecall(results.chinese);
  const mxRecall = calcRecall(results.mixed);
  const trRecall = calcRecall(results.trace);
  const p1Recall = results.phase1.length > 0 ? calcRecall(results.phase1) : { hits: 0, total: 0, recall: 0 };
  const cmi3Recall = results.cmi3 && results.cmi3.length > 0 ? calcRecall(results.cmi3) : { hits: 0, total: 0, recall: 0 };
  const cmi5Recall = results.cmi5 && results.cmi5.length > 0 ? calcRecall(results.cmi5) : { hits: 0, total: 0, recall: 0 };

  const totalHits = enRecall.hits + zhRecall.hits + mxRecall.hits;
  const totalCases = enRecall.total + zhRecall.total + mxRecall.total;
  const totalRecall = totalHits / totalCases;

  const pass = totalRecall >= 0.70;
  const enPass = enRecall.recall >= 0.80;
  const zhPass = zhRecall.recall >= 0.60;
  const mxPass = mxRecall.recall >= 0.70;

  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);

  function caseRow(tc) {
    const icon = tc.hit ? '✅ HIT' : '❌ MISS';
    const detail = tc.p0count !== undefined
      ? `P0:${tc.p0count}, P1:${tc.p1count}`
      : tc.topResult;
    return `| ${tc.id} | \`${tc.query}\` | ${tc.resultCount} | ${icon} | ${detail} |`;
  }

  const report = `# PCPT Context Memory DB — Phase 0 搜尋準確度測試報告

> 產出時間: ${now}
> Story: TD-32d-search-accuracy-seed-data
> 執行腳本: \`.context-db/scripts/run-accuracy-test.js\`

---

## 摘要

| 指標 | 結果 | 標準 | 判定 |
|------|------|------|------|
| **英文 Recall** | ${enRecall.hits}/${enRecall.total} = **${(enRecall.recall * 100).toFixed(0)}%** | >= 80% (4/5) | ${enPass ? '✅ PASS' : '❌ FAIL'} |
| **中文 Recall** | ${zhRecall.hits}/${zhRecall.total} = **${(zhRecall.recall * 100).toFixed(0)}%** | >= 60% (3/5) | ${zhPass ? '✅ PASS' : '❌ FAIL'} |
| **混合 Recall** | ${mxRecall.hits}/${mxRecall.total} = **${(mxRecall.recall * 100).toFixed(0)}%** | >= 70% (4/5) | ${mxPass ? '✅ PASS' : '❌ FAIL'} |
| **總 Recall** | ${totalHits}/${totalCases} = **${(totalRecall * 100).toFixed(0)}%** | >= 70% (11/15) | ${pass ? '✅ PASS' : '❌ FAIL'} |
| **trace_context** | ${trRecall.hits}/${trRecall.total} (基線記錄) | Phase 0 無強制標準 | ℹ️ 參考 |
| **Phase 1 ETL** | ${p1Recall.hits}/${p1Recall.total} = **${p1Recall.total > 0 ? (p1Recall.recall * 100).toFixed(0) : 'N/A'}%** | >= 70% (7/10) | ${p1Recall.total === 0 ? '⏭️ 跳過' : p1Recall.recall >= 0.70 ? '✅ PASS' : '❌ FAIL'} |
| **CMI-3 Conversation** | ${cmi3Recall.hits}/${cmi3Recall.total} = **${cmi3Recall.total > 0 ? (cmi3Recall.recall * 100).toFixed(0) : 'N/A'}%** | >= 80% (4/4) | ${cmi3Recall.total === 0 ? '⏭️ 跳過' : cmi3Recall.recall >= 0.80 ? '✅ PASS' : '❌ FAIL'} |
| **CMI-5 Document** | ${cmi5Recall.hits}/${cmi5Recall.total} = **${cmi5Recall.total > 0 ? (cmi5Recall.recall * 100).toFixed(0) : 'N/A'}%** | >= 80% (8/10) | ${cmi5Recall.total === 0 ? '⏭️ 跳過' : cmi5Recall.recall >= 0.80 ? '✅ PASS' : '❌ FAIL'} |

### Phase 0 PoC 結論: ${pass ? '🟢 **PASS** — 達到可用標準，建議繼續投資 Phase 1' : '🔴 **FAIL** — 未達可用標準，需調整種子資料或 FTS5 配置'}

---

## DB 統計

| 表格 | 記錄數 |
|------|--------|
| context_entries | ${dbStats.contextCount} |
| tech_entries | ${dbStats.techCount} |
| sprint_index | ${dbStats.sprintCount} |

---

## AC-3: 英文查詢測試（Recall 標準 >= 80%）

| ID | 查詢 | 結果數 | 判定 | Top 結果 |
|----|------|:------:|------|---------|
${results.english.map(caseRow).join('\n')}

**分類 Recall: ${enRecall.hits}/${enRecall.total} = ${(enRecall.recall * 100).toFixed(0)}% ${enPass ? '✅ PASS' : '❌ FAIL'}**

${results.english.filter(r => !r.hit).length > 0 ? `
**未命中分析:**
${results.english.filter(r => !r.hit).map(r => `- ${r.id} (\`${r.query}\`): ${r.description}。回傳 ${r.resultCount} 筆，Top: "${r.topResult}"`).join('\n')}
` : '> 全部命中 ✅'}

---

## AC-4: 中文查詢測試（Recall 標準 >= 60%）

| ID | 查詢 | 結果數 | 判定 | Top 結果 |
|----|------|:------:|------|---------|
${results.chinese.map(caseRow).join('\n')}

**分類 Recall: ${zhRecall.hits}/${zhRecall.total} = ${(zhRecall.recall * 100).toFixed(0)}% ${zhPass ? '✅ PASS' : '❌ FAIL'}**

${results.chinese.filter(r => !r.hit).length > 0 ? `
**未命中分析:**
${results.chinese.filter(r => !r.hit).map(r => `- ${r.id} (\`${r.query}\`): ${r.description}。回傳 ${r.resultCount} 筆，Top: "${r.topResult}"`).join('\n')}
` : '> 全部命中 ✅'}

---

## AC-5: 中英混合查詢測試（Recall 標準 >= 70%）

| ID | 查詢 | 結果數 | 判定 | Top 結果 |
|----|------|:------:|------|---------|
${results.mixed.map(caseRow).join('\n')}

**分類 Recall: ${mxRecall.hits}/${mxRecall.total} = ${(mxRecall.recall * 100).toFixed(0)}% ${mxPass ? '✅ PASS' : '❌ FAIL'}**

${results.mixed.filter(r => !r.hit).length > 0 ? `
**未命中分析:**
${results.mixed.filter(r => !r.hit).map(r => `- ${r.id} (\`${r.query}\`): ${r.description}。回傳 ${r.resultCount} 筆，Top: "${r.topResult}"`).join('\n')}
` : '> 全部命中 ✅'}

---

## AC-6: trace_context 關聯追蹤測試（Phase 0 基線記錄）

| ID | 查詢 | 結果數 | 判定 | P0 直接命中 | P1 關聯命中 |
|----|------|:------:|------|:----------:|:----------:|
${results.trace.map(tc => `| ${tc.id} | \`${tc.query}\` | ${tc.resultCount} | ${tc.hit ? '✅ HIT' : '❌ MISS'} | ${tc.p0count} | ${tc.p1count} |`).join('\n')}

> Phase 0 不要求高 Recall，以上為基線記錄，供 Phase 1 改善參考。

---

## 改善建議

${pass ? `
### 建議（Phase 0 PASS 後的 Phase 1 優化方向）

1. **中文查詢準確度提升**: 2 字元查詢（如「技術」「退款」）建議 Phase 1 改用 Unicode bigram 而非 trigram
2. **trace_context 關聯強化**: Phase 1 引入 story_relations 表，建立正式的跨 Story 關聯索引
3. **種子資料擴充**: 目前 10 context + 15 tech 筆；Phase 1 建議 50+ 筆以提高 Recall 穩定性
4. **查詢優化**: 考慮 BM25 rank 調整（FTS5 支援 bm25() 函式），提高相關性排序品質
` : `
### 緊急修復方向

1. **擴充種子資料**: 針對未命中案例新增更多相關記錄
2. **調整 tags/content 關鍵字**: 確保搜尋目標的 tags 包含預期的查詢詞
3. **FTS5 查詢優化**: 考慮使用 FTS5 的 NEAR 運算子或 OR 查詢增加命中率
4. **降級查詢**: 對 FTS5 無結果的查詢新增 LIKE %query% fallback
`}

---

## 容錯降級測試（AC-8）

請手動執行以下驗證（非自動化）:

1. **DB 不存在**: 重命名 context-memory.db → context-memory.db.bak，確認 Claude Code MCP 回傳錯誤但不阻塞
2. **Server 未啟動**: 停止 MCP Server，確認 Claude Code 退回標準讀檔模式

---

*報告由 \`.context-db/scripts/run-accuracy-test.js\` 自動產出*
*TD-32d Phase 0 PoC 驗證*
`;

  return { report, pass, totalRecall, enRecall, zhRecall, mxRecall, trRecall, p1Recall, cmi3Recall, cmi5Recall };
}

// ──────────────────────────────────────────────
// 主程式
// ──────────────────────────────────────────────
function main() {
  console.log('🔍 PCPT Context Memory DB — 搜尋準確度基準測試');
  console.log(`   DB: ${DB_PATH}`);

  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');

  // DB 統計
  const safeCount = (table) => {
    try { return db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count; }
    catch { return 0; }
  };
  const dbStats = {
    contextCount: safeCount('context_entries'),
    techCount: safeCount('tech_entries'),
    sprintCount: safeCount('sprint_index'),
    storiesCount: safeCount('stories'),
    crReportsCount: safeCount('cr_reports'),
    crIssuesCount: safeCount('cr_issues'),
    docIndexCount: safeCount('doc_index'),
  };

  console.log(`\n   DB 統計 (Phase 0): context=${dbStats.contextCount}, tech=${dbStats.techCount}, sprint=${dbStats.sprintCount}`);
  console.log(`   DB 統計 (Phase 1): stories=${dbStats.storiesCount}, cr_reports=${dbStats.crReportsCount}, cr_issues=${dbStats.crIssuesCount}, doc_index=${dbStats.docIndexCount}`);

  // 執行測試
  const testResults = runTests(db);

  // 產出報告
  const { report, pass, totalRecall, enRecall, zhRecall, mxRecall, p1Recall, cmi3Recall, cmi5Recall } = generateReport(testResults, dbStats);

  fs.writeFileSync(REPORT_PATH, report, 'utf-8');

  console.log('\n' + '='.repeat(60));
  console.log('📊 測試結果摘要');
  console.log('='.repeat(60));
  console.log(`英文 Recall:  ${enRecall.hits}/${enRecall.total} = ${(enRecall.recall * 100).toFixed(0)}% ${enRecall.recall >= 0.80 ? '✅ PASS' : '❌ FAIL'} (標準: 80%)`);
  console.log(`中文 Recall:  ${zhRecall.hits}/${zhRecall.total} = ${(zhRecall.recall * 100).toFixed(0)}% ${zhRecall.recall >= 0.60 ? '✅ PASS' : '❌ FAIL'} (標準: 60%)`);
  console.log(`混合 Recall:  ${mxRecall.hits}/${mxRecall.total} = ${(mxRecall.recall * 100).toFixed(0)}% ${mxRecall.recall >= 0.70 ? '✅ PASS' : '❌ FAIL'} (標準: 70%)`);
  console.log(`總 Recall:    ${Math.round(totalRecall * 15)}/15 = ${(totalRecall * 100).toFixed(0)}% ${pass ? '✅ PASS' : '❌ FAIL'} (標準: 70%)`);
  if (p1Recall.total > 0) {
    console.log(`Phase 1 ETL:  ${p1Recall.hits}/${p1Recall.total} = ${(p1Recall.recall * 100).toFixed(0)}% ${p1Recall.recall >= 0.70 ? '✅ PASS' : '❌ FAIL'} (標準: 70%)`);
  }
  if (cmi3Recall.total > 0) {
    console.log(`CMI-3 Conv:   ${cmi3Recall.hits}/${cmi3Recall.total} = ${(cmi3Recall.recall * 100).toFixed(0)}% ${cmi3Recall.recall >= 0.80 ? '✅ PASS' : '❌ FAIL'} (標準: 80%)`);
  }
  if (cmi5Recall.total > 0) {
    console.log(`CMI-5 Doc:    ${cmi5Recall.hits}/${cmi5Recall.total} = ${(cmi5Recall.recall * 100).toFixed(0)}% ${cmi5Recall.recall >= 0.80 ? '✅ PASS' : '❌ FAIL'} (標準: 80%)`);
  }
  console.log('='.repeat(60));
  console.log(`Phase 0 PoC: ${pass ? '🟢 PASS — 達到可用標準' : '🔴 FAIL — 未達可用標準'}`);
  console.log(`\n📄 報告已輸出: ${REPORT_PATH}`);

  db.close();

  if (!pass) {
    process.exit(1);
  }
}

main();
