// ============================================================
// PCPT Context Memory DB — MCP Server
// TD-32b/c: MCP Server — search + write + trace Tools
// ============================================================
// 執行方式: node .context-db/server.js
// 傳輸模式: stdio (Claude Code 自動管理生命週期)
// Phase 0: 共 6 個 Tool (2 查詢 + 3 寫入 + 1 追蹤)
// Phase 1 (TD-33): +2 Symbol RAG
// Phase 2 (TD-34): +1 Semantic Search
// CMI-3: +3 Conversation Search
// CMI-5: +1 Document Search
// CMI-6: +2 Story/Debt Search = 共 15 個 Tool
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { cosineSimilarity, deserializeVector } from './scripts/generate-embeddings.js';
import { generateEmbedding } from './scripts/local-embedder.js';
import { getTaiwanTimestamp } from './scripts/timezone.js';
import { syncEmbedding, buildInputText, TABLE_CONFIG } from './scripts/embedding-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'context-memory.db');

// ──────────────────────────────────────────────
// DB 連接（單例，啟動時建立）
// ──────────────────────────────────────────────
let db = null;

function getDb() {
  if (!db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(
        `DB not found at ${DB_PATH}. Run: node .context-db/scripts/init-db.js`
      );
    }
    db = new Database(DB_PATH, { readonly: false });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
  }
  return db;
}

// ──────────────────────────────────────────────
// Ledger Dual-Write (Git-tracked disaster recovery)
// DB-Native tables have no filesystem counterpart — ledger.jsonl is the safety net
// ──────────────────────────────────────────────
const LEDGER_PATH = path.join(__dirname, 'ledger.jsonl');

function appendLedger(table, operation, data) {
  try {
    const entry = JSON.stringify({
      ts: getTaiwanTimestamp(),
      table,
      op: operation,
      data,
    });
    fs.appendFileSync(LEDGER_PATH, entry + '\n', 'utf8');
  } catch (err) {
    // Ledger write failure must never block MCP response
    process.stderr.write(`[pcpt-context] ledger append error: ${err.message}\n`);
  }
}

// ──────────────────────────────────────────────
// Phase 4: Retrieval Observation — 檢索行為追蹤
// 記錄每次 MCP search tool 的呼叫統計
// ──────────────────────────────────────────────
let _retrievalTableReady = false;

function ensureRetrievalTable(database) {
  if (_retrievalTableReady) return;
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS retrieval_observations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name       TEXT NOT NULL,
        query_text      TEXT,
        category_filter TEXT,
        result_count    INTEGER DEFAULT 0,
        search_mode     TEXT,
        avg_similarity  REAL,
        duration_ms     INTEGER,
        timestamp       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_retrieval_tool ON retrieval_observations(tool_name);
      CREATE INDEX IF NOT EXISTS idx_retrieval_ts ON retrieval_observations(timestamp);

      -- Entry-level hit tracking (which memory entries are frequently retrieved)
      CREATE TABLE IF NOT EXISTS retrieval_hits (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source_table    TEXT NOT NULL,
        entry_id        TEXT NOT NULL,
        entry_title     TEXT,
        hit_count       INTEGER DEFAULT 1,
        confidence      REAL DEFAULT 0.1,
        last_query      TEXT,
        first_seen      TEXT NOT NULL,
        last_seen       TEXT NOT NULL,
        UNIQUE(source_table, entry_id)
      );
      CREATE INDEX IF NOT EXISTS idx_retrieval_hits_conf ON retrieval_hits(confidence DESC);

      -- Keyword frequency tracking
      CREATE TABLE IF NOT EXISTS retrieval_keywords (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword         TEXT NOT NULL UNIQUE,
        hit_count       INTEGER DEFAULT 1,
        last_seen       TEXT NOT NULL
      );
    `);
    _retrievalTableReady = true;
  } catch { /* silent — never block search */ }
}

function logRetrieval(toolName, queryText, opts = {}) {
  try {
    const database = getDb();
    ensureRetrievalTable(database);
    const now = getTaiwanTimestamp();

    // 1. Log query-level observation
    database.prepare(`
      INSERT INTO retrieval_observations
        (tool_name, query_text, category_filter, result_count, search_mode, avg_similarity, duration_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      toolName,
      (queryText || '').slice(0, 200),
      opts.category || null,
      opts.resultCount ?? 0,
      opts.searchMode || null,
      opts.avgSimilarity != null ? Math.round(opts.avgSimilarity * 10000) / 10000 : null,
      opts.durationMs ?? null,
      now
    );

    // 2. Log entry-level hits (which entries were returned)
    if (opts.hitEntries && opts.hitEntries.length > 0) {
      const upsertHit = database.prepare(`
        INSERT INTO retrieval_hits (source_table, entry_id, entry_title, hit_count, confidence, last_query, first_seen, last_seen)
        VALUES (?, ?, ?, 1, 0.1, ?, ?, ?)
        ON CONFLICT(source_table, entry_id) DO UPDATE SET
          hit_count = hit_count + 1,
          confidence = MIN(1.0, 0.1 * ln(hit_count + 2)),
          entry_title = COALESCE(excluded.entry_title, entry_title),
          last_query = excluded.last_query,
          last_seen = excluded.last_seen
      `);
      const tx = database.transaction(() => {
        for (const entry of opts.hitEntries.slice(0, 20)) {
          upsertHit.run(
            entry.source || toolName,
            String(entry.id),
            (entry.title || '').slice(0, 200),
            (queryText || '').slice(0, 100),
            now, now
          );
        }
      });
      tx();
    }

    // 3. Log keyword frequency
    if (queryText && queryText.trim().length >= 2) {
      const keywords = extractKeywords(queryText);
      if (keywords.length > 0) {
        const upsertKw = database.prepare(`
          INSERT INTO retrieval_keywords (keyword, hit_count, last_seen)
          VALUES (?, 1, ?)
          ON CONFLICT(keyword) DO UPDATE SET
            hit_count = hit_count + 1,
            last_seen = excluded.last_seen
        `);
        const tx = database.transaction(() => {
          for (const kw of keywords.slice(0, 10)) {
            upsertKw.run(kw, now);
          }
        });
        tx();
      }
    }
  } catch {
    // Silent failure — never block MCP response
  }
}

// Extract meaningful keywords from query text (min 2 chars, skip stopwords)
const STOPWORDS = new Set(['the','and','for','with','from','that','this','are','was','not','but','have','has','had','been','will','can','may','would','could','should','into','than','then','also','just','only','very','more','most','some','such','what','when','where','which','while','how','all','each','every','both','few','any','many','much','own','our','out','too','its','let','get','got','use','used','using']);

function extractKeywords(text) {
  const words = text.toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

// ──────────────────────────────────────────────
// FTS5 trigram 查詢安全化
// 將使用者輸入包在雙引號內，避免 `-`、`OR`、`NOT` 等被解讀為 FTS5 運算子
// 例：'cmi-1' → '"cmi-1"'，'token 減量' → '"token 減量"'
// ──────────────────────────────────────────────
function sanitizeFtsQuery(raw) {
  const trimmed = raw.trim();
  if (trimmed.length < 3) return null;

  // trigram tokenizer: 雙引號 = 精確子字串匹配
  // 多詞查詢必須拆分為獨立 terms + AND，否則整串包引號會要求連續字元完全一致（幾乎必 FAIL）
  // 保留連字號（story_id 含連字號，作為整體子字串搜索）
  const terms = trimmed.split(/\s+/).filter(t => t.length >= 3);
  if (terms.length === 0) return null;

  return terms.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}

// ──────────────────────────────────────────────
// CMI-10: Hybrid Search Fusion（FTS5 + Vector）
// 公式: final_score = 0.7 × vector_similarity + 0.3 × fts_normalized
// 使用 Reciprocal Rank Fusion 混合兩路結果
// ──────────────────────────────────────────────
// LOW-3 fix: 從 embedding-sync.js TABLE_CONFIG 衍生，避免重複定義
const HYBRID_TABLE_CONFIG = Object.fromEntries(
  Object.entries(TABLE_CONFIG).map(([k, v]) => [k, { embTable: v.embeddingTable, fkCol: v.fkColumn }])
);

const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;
const VECTOR_MIN_SIMILARITY = 0.25;

/**
 * 從 embedding 表取得向量搜尋結果
 * @returns {Map<string|number, number>} id → similarity score
 */
// TODO [CMI-10]: 加入 embedding 快取層，避免每次查詢載入全表（當前 ~2500 筆 ≈ 3.7MB 可接受）
async function getVectorScores(database, tableName, queryText, topK = 50) {
  const config = HYBRID_TABLE_CONFIG[tableName];
  if (!config) return new Map();

  try {
    const queryVec = await generateEmbedding(queryText.trim());
    const rows = database.prepare(
      `SELECT ${config.fkCol} AS match_id, embedding FROM ${config.embTable}`
    ).all();

    if (rows.length === 0) return new Map();

    const scored = [];
    for (const row of rows) {
      const vec = deserializeVector(row.embedding);
      const sim = cosineSimilarity(queryVec, vec);
      if (sim >= VECTOR_MIN_SIMILARITY) {
        scored.push({ id: row.match_id, similarity: sim });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    const result = new Map();
    for (const item of scored.slice(0, topK)) {
      result.set(item.id, item.similarity);
    }
    return result;
  } catch (err) {
    process.stderr.write(`[pcpt-context] vector search fallback (${tableName}): ${err.message}\n`);
    return new Map();
  }
}

/**
 * Hybrid Fusion：合併 FTS 結果與 Vector 結果
 * @param {Array} ftsRows - FTS5 查詢結果（已排序）
 * @param {Map} vectorScores - id → similarity score
 * @param {Function} idExtractor - 從 row 取 ID 的函式
 * @param {number} limit - 回傳上限
 * @returns {Array} 重排後結果（附 _hybrid_score）
 */
function fuseResults(ftsRows, vectorScores, idExtractor, limit) {
  // 若向量搜尋無結果，直接回傳 FTS 結果
  if (vectorScores.size === 0) return ftsRows.slice(0, limit);

  // MEDIUM-5: FTS 0 筆但向量有結果 → rerank 模式無法補充，記錄提示
  if (ftsRows.length === 0 && vectorScores.size > 0) {
    process.stderr.write(`[pcpt-context] hybrid: FTS=0, vector=${vectorScores.size} — rerank 模式無法補充 vector-only 結果\n`);
    return [];
  }

  // 為 FTS 結果計算正規化分數（排名越前分數越高）
  const ftsCount = ftsRows.length;
  const merged = new Map();

  for (let i = 0; i < ftsRows.length; i++) {
    const row = ftsRows[i];
    const id = idExtractor(row);
    const ftsNorm = 1 - (i / Math.max(ftsCount, 1));
    const vecScore = vectorScores.get(id) || 0;
    const hybrid = VECTOR_WEIGHT * vecScore + FTS_WEIGHT * ftsNorm;
    merged.set(id, { row, hybrid });
  }

  // 加入 vector-only 結果（FTS 未命中但向量相似度高的）
  // 注意：vector-only 結果無完整 row，不加入（需要額外 SQL 查詢才能取得）
  // Phase C 先用 rerank 模式，未來可擴充為 supplement 模式

  const sorted = [...merged.values()]
    .sort((a, b) => b.hybrid - a.hybrid)
    .slice(0, limit);

  return sorted.map(item => item.row);
}

// ──────────────────────────────────────────────
// MCP Server 初始化
// ──────────────────────────────────────────────
const server = new Server(
  { name: 'pcpt-context', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

// ──────────────────────────────────────────────
// Tool 清單（Phase 0: 6 個 + Phase 1: 2 個 + Phase 2: 1 個 + CMI-3: 3 個 + CMI-5: 1 個 + CMI-6: 2 個 = 共 15 個 Tool）
// ──────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_context',
      description: '搜尋 AI Agent 上下文記憶。支援全文搜尋 (FTS5) 與多條件過濾。空 query 回傳最近記錄。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字（FTS5 全文搜尋，須 >= 3 字元；空字串回傳最近 N 筆）',
          },
          filters: {
            type: 'object',
            description: '選填過濾條件',
            properties: {
              agent_id: { type: 'string', description: 'Agent 識別碼 (e.g., CC-OPUS)' },
              category: { type: 'string', description: '記憶類別 (e.g., decision, pattern, debug)' },
              story_id: { type: 'string', description: '關聯 Story ID' },
              epic_id: { type: 'string', description: '關聯 Epic ID' },
              limit: { type: 'number', description: '回傳筆數上限（預設 10）' },
              include_content: { type: 'boolean', description: '回傳完整 content（預設 false 只回傳 200 字元預覽）。TDD Phase 讀取 BR/決策時使用。' },
            },
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_tech',
      description: '搜尋技術知識庫。支援全文搜尋 (FTS5) 與 category/tech_stack/outcome 精確過濾。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字（FTS5 全文搜尋，須 >= 3 字元）',
          },
          category: { type: 'string', description: '技術類別 (e.g., architecture, bug-fix, pattern)' },
          tech_stack: { type: 'string', description: '技術棧 (e.g., ASP.NET Core, React, SQLite)' },
          outcome: { type: 'string', description: '結果 (e.g., success, partial, failed)' },
          limit: { type: 'number', description: '回傳筆數上限（預設 10）' },
        },
        required: ['query'],
      },
    },
    {
      name: 'add_context',
      description: '寫入 AI Agent 上下文記憶。Workflow 結束時呼叫，記錄決策、Pattern、除錯發現等。',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id:      { type: 'string', description: 'Agent 識別碼 (e.g., CC-OPUS)' },
          category:      { type: 'string', description: '記憶類別 (e.g., decision, pattern, debug, architecture)' },
          title:         { type: 'string', description: '記憶標題（簡短，< 100 字元）' },
          content:       { type: 'string', description: '詳細內容' },
          tags:          { type: 'string', description: 'JSON array 字串或逗號分隔字串 (e.g., "ESM,MCP" 或 \'["ESM","MCP"]\')' },
          story_id:      { type: 'string', description: '關聯 Story ID (e.g., td-32c-mcp-write-trace-tools)' },
          epic_id:       { type: 'string', description: '關聯 Epic ID (e.g., epic-td)' },
          related_files: { type: 'string', description: '關聯檔案路徑（逗號分隔）' },
          session_id:    { type: 'string', description: '工作階段 ID（選填）' },
        },
        required: ['agent_id', 'category', 'title', 'content'],
      },
    },
    {
      name: 'add_tech',
      description: '寫入技術知識庫。記錄成功模式、失敗教訓、Bug 修復、架構決策等技術發現。',
      inputSchema: {
        type: 'object',
        properties: {
          created_by:    { type: 'string', description: 'Agent 識別碼 (e.g., CC-OPUS)' },
          category: {
            type: 'string',
            description: '技術類別（枚舉）: success, failure, workaround, pattern, bugfix, architecture, benchmark, security, flaky_test, test_pattern, bdd_scenario, ac_pattern, test_failure, test_infra, mock_strategy, review',
          },
          title:         { type: 'string', description: '標題（簡短，< 100 字元）' },
          outcome:       { type: 'string', description: '結果 (e.g., success, partial, failed)' },
          problem:       { type: 'string', description: '問題描述' },
          solution:      { type: 'string', description: '解決方案' },
          lessons:       { type: 'string', description: '學到的教訓' },
          tech_stack:    { type: 'string', description: '技術棧 (e.g., ASP.NET Core, React, SQLite)' },
          tags:          { type: 'string', description: 'JSON array 字串或逗號分隔字串' },
          code_snippets: { type: 'string', description: '程式碼片段（JSON 字串）' },
          related_files: { type: 'string', description: '關聯檔案路徑（逗號分隔）' },
          references:    { type: 'string', description: '參考資料（JSON 字串）' },
          confidence:    { type: 'number', description: '信心分數 0-100（預設 80）' },
        },
        required: ['created_by', 'category', 'title', 'outcome'],
      },
    },
    {
      name: 'add_cr_issue',
      description: 'Code Review Issue 寫入。將 CR 發現映射至 tech_entries (category=review) 作為技術知識保存。',
      inputSchema: {
        type: 'object',
        properties: {
          story_id:       { type: 'string', description: '來源 Story ID' },
          issue_code:     { type: 'string', description: 'Issue 代碼 (e.g., M1, H2)' },
          severity:       { type: 'string', description: '嚴重度（枚舉）: critical, high, medium, low' },
          description:    { type: 'string', description: '問題描述' },
          resolution:     { type: 'string', description: '處理方式（枚舉）: FIXED, DEFERRED, WONT_FIX' },
          category:       { type: 'string', description: 'Issue 類別（選填）' },
          target_story:   { type: 'string', description: 'DEFERRED 時的目標 Story ID（選填）' },
          self_check_q1:  { type: 'string', description: '自檢 Q1 答案（選填）' },
          self_check_q2:  { type: 'string', description: '自檢 Q2 答案（選填）' },
          self_check_q3:  { type: 'string', description: '自檢 Q3 答案（選填）' },
          self_check_q4:  { type: 'string', description: '自檢 Q4 答案（選填）' },
          self_check_q5:  { type: 'string', description: '自檢 Q5 答案（選填）' },
        },
        required: ['story_id', 'issue_code', 'severity', 'description', 'resolution'],
      },
    },
    {
      name: 'trace_context',
      description: '追蹤關聯上下文。FTS5 初始命中後，從 story_id + related_files 擴展一層關聯記錄（圖形追蹤簡化版）。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字（FTS5，須 >= 3 字元）',
          },
          depth: {
            type: 'number',
            description: '關聯擴展深度（預設 1，上限 2）',
          },
        },
        required: ['query'],
      },
    },
    // ── Phase 1: Symbol 級程式碼檢索（TD-33）──
    {
      name: 'search_symbols',
      description: 'Roslyn AST Symbol 搜尋。依關鍵字搜尋 symbol_index（class/method/interface/enum）。用於精確查詢某 Service/Controller/Interface 的程式碼片段，避免讀取整個檔案。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '搜尋關鍵字（Symbol 名稱或 full_name 模糊比對，>= 2 字元）',
          },
          symbol_type: {
            type: 'string',
            description: 'Symbol 類型過濾（選填）: "class" | "method" | "interface" | "enum"',
          },
          namespace: {
            type: 'string',
            description: '命名空間前綴過濾（選填，e.g., "App.Web.Services"）',
          },
          limit: {
            type: 'number',
            description: '回傳筆數上限（預設 10，上限 50）',
          },
        },
        required: ['keyword'],
      },
    },
    {
      name: 'get_symbol_context',
      description: '依 symbol_id 取得完整程式碼片段 + 依賴關係展開（calls/inherits/implements/uses）。先用 search_symbols 取得 id，再用此 Tool 深入查詢。',
      inputSchema: {
        type: 'object',
        properties: {
          symbol_id: {
            type: 'number',
            description: 'Symbol ID（來自 search_symbols 結果的 id 欄位）',
          },
          depth: {
            type: 'number',
            description: '依賴展開層數（1 或 2，預設 1）',
          },
        },
        required: ['symbol_id'],
      },
    },
    // ── CMI-3: 對話記憶查詢工具 ──
    {
      name: 'search_conversations',
      description: '搜尋歷史對話記錄。FTS5 全文搜尋 conversation_turns，支援時間範圍、角色過濾。可回答「近期 token 減量討論」「之前問過 SignalR 嗎」等問答配對查詢。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字（FTS5 全文搜尋，須 >= 3 字元）',
          },
          date_from: {
            type: 'string',
            description: '開始日期（ISO date，例如 "2026-03-06" 或 "2026-03-06T15:00"）',
          },
          date_to: {
            type: 'string',
            description: '結束日期（ISO date）',
          },
          role: {
            type: 'string',
            description: '只搜尋特定角色：\"user\" | \"assistant\"',
          },
          limit: {
            type: 'number',
            description: '回傳筆數上限（預設 10）',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_session_detail',
      description: '取得指定對話的詳細內容。回傳 session 元資料 + 完整 turns 列表。',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: {
            type: 'string',
            description: 'Session UUID（來自 search_conversations 或 list_sessions 結果）',
          },
          role: {
            type: 'string',
            description: '只回傳特定角色的 turns（選填）：\"user\" | \"assistant\"',
          },
          limit: {
            type: 'number',
            description: '回傳 turns 數量上限（預設全部）',
          },
        },
        required: ['session_id'],
      },
    },
    {
      name: 'list_sessions',
      description: '列出對話 session 清單（按時間倒序）。可過濾時間範圍。適合「昨天下午有哪些對話」等時間軸查詢。',
      inputSchema: {
        type: 'object',
        properties: {
          date_from: {
            type: 'string',
            description: '開始日期（ISO date，例如 "2026-03-06" 或 "2026-03-06T15:00"）',
          },
          date_to: {
            type: 'string',
            description: '結束日期（ISO date）',
          },
          limit: {
            type: 'number',
            description: '回傳 session 數量上限（預設 20）',
          },
        },
        required: [],
      },
    },
    // ── CMI-5: 專案文檔語意搜尋 ──
    {
      name: 'search_documents',
      description: '搜尋專案文檔知識庫（Markdown 文檔分段索引）。FTS5 + Embedding 雙路融合搜尋，支援功能規格、技術規格、架構決策等專案知識查詢。API Key 不可用時自動降級至純 FTS5 搜尋。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字或自然語言描述（FTS5 全文搜尋 + 向量語意搜尋，須 >= 3 字元）',
            minLength: 3,
          },
          category: {
            type: 'string',
            description: '文檔類別過濾（選填）: "stories" | "specs" | "architecture" | "tech-decisions" | "functional-specs" | "technical-specs" | "skills" | "tracking" | "reviews" | "knowledge-base" | "ui-specs" | "token-analysis" | "bmad" | "other"',
          },
          epic_id: {
            type: 'string',
            description: 'Epic ID 過濾（選填，e.g., "epic-cmi", "epic-qgr"）',
          },
          limit: {
            type: 'number',
            description: '回傳結果數量上限（預設 10，上限 30）',
          },
        },
        required: ['query'],
      },
    },
    // ── Phase 2: 語意向量搜尋（TD-34）──
    {
      name: 'semantic_search',
      description: '以自然語言語意搜尋程式碼 Symbol（支援中英文、同義詞、描述性查詢）。底層使用本地 ONNX Embedding（Xenova/all-MiniLM-L6-v2）+ Cosine Similarity。模型載入失敗時自動降級至 search_symbols LIKE 搜尋。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '自然語言查詢（如：「處理付款的邏輯」、「認證驗證」）',
            minLength: 2,
          },
          limit: {
            type: 'number',
            description: '回傳結果數量上限（預設 10）',
          },
          symbol_type: {
            type: 'string',
            description: '篩選 Symbol 類型（選填）: "class" | "method" | "interface" | "enum"',
          },
          min_similarity: {
            type: 'number',
            description: '最低相似度門檻（預設 0.3，低於此值不回傳）',
          },
        },
        required: ['query'],
      },
    },
    // ── CMI-6: Story / Tech Debt 查詢工具 ──
    {
      name: 'search_stories',
      description: '查詢 Story 索引（stories 表 40 欄位）。支援 FTS5 全文搜尋（title/tags/dependencies）+ 多條件過濾。空 query 回傳最近 Story。用於查詢 Story 狀態、Epic 進度、開發追蹤、CR 統計等。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字（FTS5 全文搜尋，須 >= 3 字元；空字串回傳最近 N 筆）',
          },
          story_id: { type: 'string', description: 'Story ID 精確查詢（e.g., "fix-P0-02-migration-cascade-convention"）。提供時直接精確匹配，忽略 query 的 FTS5 搜尋。' },
          epic_id: { type: 'string', description: 'Epic ID 過濾（e.g., "epic-mqv", "epic-td"）' },
          status: { type: 'string', description: 'Story 狀態過濾: "backlog" | "ready-for-dev" | "in-progress" | "review" | "done"' },
          domain: { type: 'string', description: '領域過濾（e.g., "editor", "admin", "system"）' },
          complexity: { type: 'string', description: '複雜度過濾: "S" | "M" | "L" | "XL"' },
          story_type: { type: 'string', description: '類型過濾（e.g., "Bug Fix", "Feature", "Enhancement"）' },
          dev_agent: { type: 'string', description: '開發 Agent 過濾（e.g., "CC-SONNET"）' },
          include_details: { type: 'boolean', description: '包含完整欄位（AC/Tasks/Dev Notes 等）。預設 false 只回傳摘要。' },
          fields: { type: 'string', description: '指定回傳欄位（逗號分隔，如 "story_id,title,status"）。指定時忽略 include_details，只回傳白名單內的欄位。用於 Sprint 總覽等輕量查詢。' },
          limit: { type: 'number', description: '回傳筆數上限（預設 10，上限 50）' },
        },
        required: [],
      },
    },
    {
      name: 'search_debt',
      description: '查詢技術債項目（tech_debt_items 表）。支援 FTS5 全文搜尋（title/description/fix_guidance/root_cause）+ 多條件過濾。取代 CLI `upsert-debt.js --query`，提供結構化 JSON 回傳。',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋關鍵字（FTS5 全文搜尋，須 >= 3 字元；空字串回傳最近 N 筆）',
          },
          story_id: { type: 'string', description: '來源 Story ID 過濾' },
          target_story: { type: 'string', description: '目標 Story ID 過濾（查詢待修復的前置債務）' },
          status: { type: 'string', description: '狀態過濾: "open" | "fixed" | "wont-fix"' },
          severity: { type: 'string', description: '嚴重度過濾: "critical" | "high" | "medium" | "low"' },
          category: { type: 'string', description: '分類過濾: "deferred" | "wont_fix"' },
          affected_files: { type: 'string', description: '逗號分隔的檔案路徑，模糊比對 affected_files 欄位（exact/endsWith/contains）。用於 create-story debt pull by file overlap。' },
          include_stats: { type: 'boolean', description: '附加統計摘要（total/open/fixed/wont-fix by severity）。預設 false。' },
          limit: { type: 'number', description: '回傳筆數上限（預設 20，上限 100）' },
        },
        required: [],
      },
    },
    // ── Phase 4/5 Tools ──
    {
      name: 'search_glossary',
      description: '搜尋術語詞彙表 (glossary)。支援 FTS5 全文搜尋 canonical_name / aliases / description。',
      inputSchema: {
        type: 'object',
        properties: {
          query:  { type: 'string', description: '搜尋關鍵字（FTS5 trigram >= 3 字元；空字串回傳最近 N 筆）' },
          domain: { type: 'string', description: '領域過濾（選填）' },
          limit:  { type: 'number', description: '回傳筆數上限（預設 20）' },
        },
        required: [],
      },
    },
    {
      name: 'log_workflow',
      description: '記錄 Workflow 執行至 workflow_executions 表。create-story / dev-story / code-review 完成時呼叫。',
      inputSchema: {
        type: 'object',
        properties: {
          workflow_type: { type: 'string', description: 'Workflow 類型: "create-story" | "dev-story" | "code-review" | ...' },
          story_id:     { type: 'string', description: '關聯 Story ID（選填）' },
          agent_id:     { type: 'string', description: '執行 Agent ID（選填）' },
          status:       { type: 'string', description: '狀態: "running" | "completed" | "failed" | "cancelled"' },
          input_tokens:          { type: 'number', description: '輸入 token 數（選填）' },
          output_tokens:         { type: 'number', description: '輸出 token 數（選填）' },
          cache_read_tokens:     { type: 'number', description: 'Cache Read token 數（選填，Claude API usage.cache_read_input_tokens）' },
          cache_creation_tokens: { type: 'number', description: 'Cache Creation token 數（選填，Claude API usage.cache_creation_input_tokens）' },
          cost_usd:              { type: 'number', description: '本次執行費用 USD（選填）' },
          model:                 { type: 'string', description: '使用的模型 ID（選填，e.g. claude-sonnet-4-6）' },
          duration_ms:           { type: 'number', description: '執行時間 ms（選填）' },
          error_message:         { type: 'string', description: '錯誤訊息（選填）' },
        },
        required: ['workflow_type', 'status'],
      },
    },
    {
      name: 'upsert_benchmark',
      description: '新增或更新 benchmarks 表的效能基線指標。UNIQUE(metric_name, context)。',
      inputSchema: {
        type: 'object',
        properties: {
          metric_name:    { type: 'string', description: '指標名稱' },
          context:        { type: 'string', description: '指標上下文（預設 "global"）' },
          current_value:  { type: 'number', description: '當前值' },
          baseline_value: { type: 'number', description: '基線值（選填）' },
          unit:           { type: 'string', description: '單位: "tokens" | "ms" | "%" | "count" | "usd"' },
          notes:          { type: 'string', description: '備註（選填）' },
        },
        required: ['metric_name', 'current_value', 'unit'],
      },
    },
    {
      name: 'get_patterns',
      description: '查詢 Phase 4 連續學習觀測資料 (pattern_observations)。顯示 Agent 編輯行為模式 + 信心分數。',
      inputSchema: {
        type: 'object',
        properties: {
          domain:         { type: 'string', description: '領域過濾: "editor" | "admin" | "service" | "controller" | ...' },
          min_confidence: { type: 'number', description: '最低信心分數過濾（0-1）' },
          limit:          { type: 'number', description: '回傳筆數上限（預設 50）' },
        },
        required: [],
      },
    },
    // ── DLA-07: IDD Management Tools (Framework v1.3) ──
    {
      name: 'search_intentional_decisions',
      description: '搜尋 Intentional Decision Debt (IDD)。FTS5 全文搜尋 + idd_type/status/criticality/file_path/skill_name 過濾。與 tech_debt_items 互斥。',
      inputSchema: {
        type: 'object',
        properties: {
          query:           { type: 'string', description: '搜尋關鍵字（FTS5，>= 3 字元；空字串回傳最近 active IDD）' },
          idd_type:        { type: 'string', description: 'IDD 類型過濾: "COM" | "STR" | "REG" | "USR"' },
          status:          { type: 'string', description: '狀態過濾: "active" | "retired" | "superseded"（預設 active）' },
          criticality:     { type: 'string', description: '嚴重度過濾: "critical" | "normal" | "low"' },
          file_path:       { type: 'string', description: '反查: 該檔案相關的 IDD（LIKE 比對 related_files）' },
          skill_name:      { type: 'string', description: '反查: 該 Skill 相關的 IDD（LIKE 比對 related_skills）' },
          platform_module: { type: 'string', description: '反查: 該 Module 相關的 IDD（LIKE 比對 platform_modules）' },
          limit:           { type: 'number', description: '回傳筆數上限（預設 10）' },
        },
        required: [],
      },
    },
    {
      name: 'get_intentional_decision',
      description: '依 idd_id 取得單筆 IDD 完整內容（含 code_locations, context, forbidden_changes 等所有欄位）。',
      inputSchema: {
        type: 'object',
        properties: {
          idd_id: { type: 'string', description: 'IDD 識別碼（格式: IDD-{TYPE}-{NNN}，e.g., IDD-COM-001）' },
        },
        required: ['idd_id'],
      },
    },
    {
      name: 'add_intentional_decision',
      description: '新增 Intentional Decision Debt (IDD) 記錄。同步寫入 intentional_decisions 表 + context_entries (category=intentional)。與 tech_debt_items 互斥。',
      inputSchema: {
        type: 'object',
        properties: {
          idd_id:               { type: 'string', description: 'IDD 唯一識別碼（格式: IDD-{TYPE}-{NNN}）' },
          idd_type:             { type: 'string', description: 'IDD 類型: "COM" | "STR" | "REG" | "USR"' },
          title:                { type: 'string', description: 'IDD 標題（簡短）' },
          context:              { type: 'string', description: '背景說明（為何存在此決策）' },
          decision:             { type: 'string', description: '決策內容（做了什麼決定）' },
          reason:               { type: 'string', description: '決策原因（為何做此決定）' },
          adr_path:             { type: 'string', description: 'ADR 文件路徑（必填，e.g., docs/technical-decisions/ADR-IDD-COM-001.md）' },
          signoff_by:           { type: 'string', description: '決策批准人（e.g., Alan (PO)）' },
          signoff_date:         { type: 'string', description: '批准日期（ISO 8601 UTC+8）' },
          criticality:          { type: 'string', description: '嚴重度: "critical" | "normal" | "low"（預設 normal）' },
          forbidden_changes:    { type: 'string', description: '禁止動作清單（JSON array 字串）' },
          code_locations:       { type: 'string', description: '程式碼位置（JSON array: [{file,line,snippet}]）' },
          re_evaluation_trigger:{ type: 'string', description: '重新評估觸發條件（事件描述）' },
          related_skills:       { type: 'string', description: '相關 Skills（JSON array，e.g., ["pcpt-editor-arch"]）' },
          related_docs:         { type: 'string', description: '相關文件（JSON array，doc paths）' },
          platform_modules:     { type: 'string', description: '相關 Platform Modules（JSON array）' },
          related_files:        { type: 'string', description: '相關程式碼檔案（JSON array，paths）' },
          memory_file_path:     { type: 'string', description: 'Memory file 路徑（選填，僅 criticality=critical 需填）' },
          tags:                 { type: 'string', description: 'Tags（JSON array 或逗號分隔）' },
        },
        required: ['idd_id', 'idd_type', 'title', 'context', 'decision', 'reason', 'adr_path', 'signoff_by', 'signoff_date'],
      },
    },
    {
      name: 'verify_intentional_annotations',
      description: '驗證 IDD 記錄完整性：ADR 檔案存在性 (missing_adr) + code_locations 路徑有效性 (mismatched_locations)。orphaned_idd 偵測需 codebase 掃描 (dla-09 實作)。',
      inputSchema: {
        type: 'object',
        properties: {
          scope:     { type: 'string', description: '掃描範圍: "all"（全量）| "file"（單一檔案）（預設 all）' },
          file_path: { type: 'string', description: '當 scope=file 時必填：要掃描的檔案路徑' },
        },
        required: [],
      },
    },
  ],
}));

// ──────────────────────────────────────────────
// Tool 呼叫處理
// ──────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Search tools that should be tracked by retrieval observation
  const SEARCH_TOOLS = new Set([
    'search_context', 'search_tech', 'search_symbols', 'get_symbol_context',
    'search_conversations', 'list_sessions', 'semantic_search',
    'search_documents', 'search_stories', 'search_debt', 'search_glossary',
    'get_patterns', 'trace_context',
    'search_intentional_decisions', 'get_intentional_decision', 'verify_intentional_annotations',
  ]);

  try {
    process.stderr.write(`[pcpt-context] Tool call: ${name}\n`);
    const startMs = Date.now();

    let result;
    switch (name) {
      case 'search_context':
        result = await handleSearchContext(args);
        break;
      case 'search_tech':
        result = await handleSearchTech(args);
        break;
      case 'add_context':
        return handleAddContext(args);
      case 'add_tech':
        return handleAddTech(args);
      case 'add_cr_issue':
        return handleAddCrIssue(args);
      case 'trace_context':
        result = handleTraceContext(args);
        break;
      case 'search_symbols':
        result = handleSearchSymbols(args);
        break;
      case 'get_symbol_context':
        result = handleGetSymbolContext(args);
        break;
      case 'search_conversations':
        result = await handleSearchConversations(args);
        break;
      case 'get_session_detail':
        return handleGetSessionDetail(args);
      case 'list_sessions':
        result = handleListSessions(args);
        break;
      case 'semantic_search':
        result = await handleSemanticSearch(args);
        break;
      case 'search_documents':
        result = await handleSearchDocuments(args);
        break;
      case 'search_stories':
        result = await handleSearchStories(args);
        break;
      case 'search_debt':
        result = await handleSearchDebt(args);
        break;
      case 'search_glossary':
        result = handleSearchGlossary(args);
        break;
      case 'log_workflow':
        return handleLogWorkflow(args);
      case 'upsert_benchmark':
        return handleUpsertBenchmark(args);
      case 'get_patterns':
        result = handleGetPatterns(args);
        break;
      // DLA-07: IDD Management Tools
      case 'search_intentional_decisions':
        result = handleSearchIntentionalDecisions(args);
        break;
      case 'get_intentional_decision':
        result = handleGetIntentionalDecision(args);
        break;
      case 'add_intentional_decision':
        return handleAddIntentionalDecision(args);
      case 'verify_intentional_annotations':
        result = handleVerifyIntentionalAnnotations(args);
        break;
      default:
        process.stderr.write(`[pcpt-context] Unknown tool requested: ${name}\n`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        };
    }

    // Log retrieval observation for search tools (async, non-blocking)
    if (SEARCH_TOOLS.has(name) && result && !result.isError) {
      try {
        const durationMs = Date.now() - startMs;
        const text = result.content?.[0]?.text || '';
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = null; }

        // Extract stats + entry IDs from result
        let resultCount = 0;
        let searchMode = null;
        let avgSimilarity = null;
        const hitEntries = [];

        // Map tool_name to source_table for entry tracking
        const SOURCE_MAP = {
          search_context: 'context_entries',
          search_tech: 'tech_entries',
          semantic_search: 'symbol_index',
          search_documents: 'document_chunks',
          search_stories: 'stories',
          search_debt: 'tech_debt_items',
          search_conversations: 'conversation_sessions',
          search_symbols: 'symbol_index',
          search_glossary: 'glossary',
        };

        if (Array.isArray(parsed)) {
          resultCount = parsed.length;
          // context/tech/stories results are arrays with id/title
          for (const r of parsed.slice(0, 20)) {
            const entryId = r.id ?? r.story_id ?? r.session_id;
            if (entryId != null) {
              hitEntries.push({
                source: SOURCE_MAP[name] || name,
                id: entryId,
                title: r.title || r.symbol_name || r.canonical_name || '',
              });
            }
          }
        } else if (parsed?.results) {
          resultCount = parsed.results.length;
          searchMode = parsed.mode || null;
          const sims = parsed.results
            .map(r => r.similarity_score ?? r.vector_score ?? r.final_score)
            .filter(s => s != null);
          if (sims.length > 0) {
            avgSimilarity = sims.reduce((a, b) => a + b, 0) / sims.length;
          }
          // semantic_search/search_documents results have id/symbol_name
          for (const r of parsed.results.slice(0, 20)) {
            const entryId = r.chunk_id ?? r.symbol_id ?? r.id;
            if (entryId != null) {
              hitEntries.push({
                source: SOURCE_MAP[name] || name,
                id: entryId,
                title: r.symbol_name || r.doc_title || r.heading_path || '',
              });
            }
          }
        } else if (parsed?.total !== undefined) {
          resultCount = parsed.total;
        }

        logRetrieval(name, args?.query || args?.keyword || '', {
          category: args?.filters?.category || args?.category || null,
          resultCount,
          searchMode,
          avgSimilarity,
          durationMs,
          hitEntries,
        });
      } catch { /* silent */ }
    }

    return result;
  } catch (err) {
    process.stderr.write(`[pcpt-context] Tool error (${name}): ${err.message}\n`);
    return {
      isError: true,
      content: [{ type: 'text', text: `Tool execution failed: ${err.message}` }],
    };
  }
});

// ──────────────────────────────────────────────
// search_context 實作
// ──────────────────────────────────────────────
async function handleSearchContext(args) {
  const { query = '', filters = {} } = args;
  const {
    agent_id = null,
    category = null,
    story_id = null,
    epic_id = null,
    limit = 10,
    include_content = false,
  } = filters;

  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 100);
  const contentCol = include_content ? 'content' : "SUBSTR(content, 1, 200) AS content_preview";

  let database;
  try {
    database = getDb();
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message }],
    };
  }

  try {
    let rows;

    if (!query || query.trim() === '') {
      // 空查詢：回傳最近 N 筆
      const params = [];
      let sql = `
        SELECT id, agent_id, timestamp, category, title,
               ${contentCol}, tags, story_id
        FROM context_entries
        WHERE 1=1
      `;
      if (agent_id) { sql += ' AND agent_id = ?'; params.push(agent_id); }
      if (category) { sql += ' AND category = ?'; params.push(category); }
      if (story_id) { sql += ' AND story_id = ?'; params.push(story_id); }
      if (epic_id)  { sql += ' AND epic_id = ?';  params.push(epic_id); }
      sql += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(safeLimit);
      rows = database.prepare(sql).all(...params);
    } else {
      // FTS5 全文搜尋
      // trigram 要求查詢字串 >= 3 字元
      const ftsQuery = sanitizeFtsQuery(query);
      if (!ftsQuery) {
        return {
          content: [{ type: 'text', text: JSON.stringify([]) }],
        };
      }

      const params = [ftsQuery];
      let sql = `
        SELECT ce.id, ce.agent_id, ce.timestamp, ce.category, ce.title,
               ${include_content ? 'ce.content' : "SUBSTR(ce.content, 1, 200) AS content_preview"}, ce.tags, ce.story_id
        FROM context_entries ce
        JOIN context_fts f ON ce.rowid = f.rowid
        WHERE context_fts MATCH ?
      `;
      if (agent_id) { sql += ' AND ce.agent_id = ?'; params.push(agent_id); }
      if (category) { sql += ' AND ce.category = ?'; params.push(category); }
      if (story_id) { sql += ' AND ce.story_id = ?'; params.push(story_id); }
      if (epic_id)  { sql += ' AND ce.epic_id = ?';  params.push(epic_id); }
      sql += ' ORDER BY rank LIMIT ?';
      params.push(safeLimit * 2); // 多取一倍供 hybrid rerank
      rows = database.prepare(sql).all(...params);

      // CMI-10: Hybrid Fusion rerank
      const vectorScores = await getVectorScores(database, 'context', query, safeLimit * 2);
      rows = fuseResults(rows, vectorScores, r => r.id, safeLimit);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(rows) }],
    };
  } catch (err) {
    // FTS5 語法錯誤等
    process.stderr.write(`[pcpt-context] search_context error: ${err.message}\n`);
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `搜尋失敗：${err.message}。提示：FTS5 trigram 查詢須 >= 3 字元，請勿使用特殊符號。`,
      }],
    };
  }
}

// ──────────────────────────────────────────────
// search_tech 實作
// ──────────────────────────────────────────────
async function handleSearchTech(args) {
  const {
    query = '',
    category = null,
    tech_stack = null,
    outcome = null,
    limit = 10,
  } = args;

  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 100);

  let database;
  try {
    database = getDb();
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message }],
    };
  }

  try {
    let rows;

    if (!query || query.trim() === '') {
      // 空查詢：回傳最近 N 筆（tech_entries UNION context_entries debug 記錄）
      const params = [];
      // tech_entries 分支的過濾條件
      let techWhere = 'WHERE 1=1';
      const techParams = [];
      if (category)   { techWhere += ' AND category = ?';   techParams.push(category); }
      if (tech_stack) { techWhere += ' AND tech_stack = ?'; techParams.push(tech_stack); }
      if (outcome)    { techWhere += ' AND outcome = ?';    techParams.push(outcome); }

      // context debug 分支：category 過濾不匹配時跳過（debug 固定不符 tech 分類）
      const includeDebug = !category || category === 'debug';
      const includeByOutcome = !outcome || outcome === 'debug';

      let sql;
      if (includeDebug && includeByOutcome && !tech_stack) {
        // 合併 context debug 記錄
        sql = `
          SELECT id, created_by, created_at, category, NULL AS tech_stack, title,
                 SUBSTR(problem, 1, 200) AS problem_preview,
                 SUBSTR(solution, 1, 200) AS solution_preview,
                 outcome, confidence, tags
          FROM tech_entries
          ${techWhere}
          UNION ALL
          SELECT id, agent_id AS created_by, timestamp AS created_at,
                 'debug' AS category, NULL AS tech_stack, title,
                 SUBSTR(content, 1, 200) AS problem_preview,
                 NULL AS solution_preview,
                 'debug' AS outcome, 80 AS confidence, tags
          FROM context_entries
          WHERE category = 'debug'
          ORDER BY created_at DESC LIMIT ?
        `;
        params.push(...techParams, safeLimit);
      } else {
        sql = `
          SELECT id, created_by, created_at, category, tech_stack, title,
                 SUBSTR(problem, 1, 200) AS problem_preview,
                 SUBSTR(solution, 1, 200) AS solution_preview,
                 outcome, confidence, tags
          FROM tech_entries
          ${techWhere}
          ORDER BY created_at DESC LIMIT ?
        `;
        params.push(...techParams, safeLimit);
      }
      rows = database.prepare(sql).all(...params);
    } else {
      const ftsQuery = sanitizeFtsQuery(query);
      if (!ftsQuery) {
        return {
          content: [{ type: 'text', text: JSON.stringify([]) }],
        };
      }

      // tech_entries FTS 分支過濾條件
      const techParams = [ftsQuery];
      let techSql = `
        SELECT te.id, te.created_by, te.created_at, te.category, te.tech_stack,
               te.title,
               SUBSTR(te.problem, 1, 200) AS problem_preview,
               SUBSTR(te.solution, 1, 200) AS solution_preview,
               te.outcome, te.confidence, te.tags
        FROM tech_entries te
        JOIN tech_fts f ON te.rowid = f.rowid
        WHERE tech_fts MATCH ?
      `;
      if (category)   { techSql += ' AND te.category = ?';   techParams.push(category); }
      if (tech_stack) { techSql += ' AND te.tech_stack = ?'; techParams.push(tech_stack); }
      if (outcome)    { techSql += ' AND te.outcome = ?';    techParams.push(outcome); }

      // context debug 分支：只在無衝突過濾條件時加入 UNION
      const includeDebug = (!category || category === 'debug') &&
                           (!outcome  || outcome  === 'debug') &&
                           !tech_stack;

      let sql;
      let params;
      if (includeDebug) {
        sql = `
          SELECT * FROM (
            ${techSql}
          )
          UNION ALL
          SELECT ce.id, ce.agent_id AS created_by, ce.timestamp AS created_at,
                 'debug' AS category, NULL AS tech_stack, ce.title,
                 SUBSTR(ce.content, 1, 200) AS problem_preview,
                 NULL AS solution_preview,
                 'debug' AS outcome, 80 AS confidence, ce.tags
          FROM context_entries ce
          JOIN context_fts cf ON ce.rowid = cf.rowid
          WHERE context_fts MATCH ? AND ce.category = 'debug'
          ORDER BY created_at DESC LIMIT ?
        `;
        params = [...techParams, ftsQuery, safeLimit * 2];
      } else {
        techSql += ' ORDER BY rank LIMIT ?';
        techParams.push(safeLimit * 2);
        sql = techSql;
        params = techParams;
      }
      rows = database.prepare(sql).all(...params);

      // CMI-10: Hybrid Fusion rerank（tech_entries only，debug 來自 context）
      const vectorScores = await getVectorScores(database, 'tech', query, safeLimit * 2);
      rows = fuseResults(rows, vectorScores, r => r.id, safeLimit);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(rows) }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] search_tech error: ${err.message}\n`);
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `搜尋失敗：${err.message}。提示：FTS5 trigram 查詢須 >= 3 字元，請勿使用特殊符號。`,
      }],
    };
  }
}

// ──────────────────────────────────────────────
// tags 正規化輔助函式 (AC-1)
// 接受 JSON array 字串或逗號分隔字串
// ──────────────────────────────────────────────
function normalizeTags(tags) {
  if (!tags || typeof tags !== 'string') return null;
  const s = tags.trim();
  if (!s) return null;
  if (s.startsWith('[')) return s; // 已是 JSON array
  // 逗號分隔 → JSON array
  return JSON.stringify(s.split(',').map(t => t.trim()).filter(Boolean));
}

// ──────────────────────────────────────────────
// add_context 實作 (AC-1)
// ──────────────────────────────────────────────
function handleAddContext(args) {
  const { agent_id, category, title, content, tags, story_id, epic_id, related_files, session_id } = args;

  const trimmedAgentId = (agent_id || '').trim();
  const trimmedCategory = (category || '').trim();
  const trimmedTitle = (title || '').trim();
  const trimmedContent = (content || '').trim();

  if (!trimmedAgentId || !trimmedCategory || !trimmedTitle || !trimmedContent) {
    return {
      isError: true,
      content: [{ type: 'text', text: '缺少必填參數: agent_id, category, title, content（不可為空白）' }],
    };
  }

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    const timestamp = getTaiwanTimestamp();
    const normalizedTags = normalizeTags(tags);

    const result = database.prepare(`
      INSERT INTO context_entries
        (agent_id, timestamp, category, title, content, tags, story_id, epic_id, related_files, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(trimmedAgentId, timestamp, trimmedCategory, trimmedTitle, trimmedContent, normalizedTags, story_id || null, epic_id || null, related_files || null, session_id || null);

    // CMI-10: 同步生成 Embedding（fire-and-forget，不阻塞回應）
    const entryId = result.lastInsertRowid;
    const embText = buildInputText('context', { title: trimmedTitle, content: trimmedContent });
    syncEmbedding(database, 'context', entryId, embText)
      .catch(err => process.stderr.write(`[pcpt-context] context embedding sync error (id=${entryId}): ${err.message}\n`));

    // Ledger dual-write
    appendLedger('context_entries', 'INSERT', { id: Number(entryId), agent_id: trimmedAgentId, category: trimmedCategory, title: trimmedTitle, timestamp });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ id: entryId, message: `✅ add_context 寫入成功 (id=${entryId})` }),
      }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] add_context error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `add_context 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// add_tech 實作 (AC-2)
// ──────────────────────────────────────────────
const VALID_TECH_CATEGORIES = new Set([
  'success', 'failure', 'workaround', 'pattern', 'bugfix', 'architecture',
  'benchmark', 'security', 'flaky_test', 'test_pattern', 'bdd_scenario',
  'ac_pattern', 'test_failure', 'test_infra', 'mock_strategy', 'review',
]);

function handleAddTech(args) {
  const {
    created_by, category, title, outcome,
    problem, solution, lessons, tech_stack, tags,
    code_snippets, related_files, references,
    confidence = 80,
  } = args;

  const trimmedCreatedBy = (created_by || '').trim();
  const trimmedCat = (category || '').trim();
  const trimmedTechTitle = (title || '').trim();
  const trimmedOutcome = (outcome || '').trim();

  if (!trimmedCreatedBy || !trimmedCat || !trimmedTechTitle || !trimmedOutcome) {
    return {
      isError: true,
      content: [{ type: 'text', text: '缺少必填參數: created_by, category, title, outcome（不可為空白）' }],
    };
  }

  if (!VALID_TECH_CATEGORIES.has(trimmedCat)) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `category 無效值 "${category}"。允許值: ${[...VALID_TECH_CATEGORIES].join(', ')}`,
      }],
    };
  }

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    const created_at = getTaiwanTimestamp();
    const normalizedTags = normalizeTags(tags);
    const safeConfidence = Math.min(100, Math.max(0, Number(confidence) || 80));

    const result = database.prepare(`
      INSERT INTO tech_entries
        (created_by, created_at, category, title, outcome, problem, solution, lessons,
         tech_stack, tags, code_snippets, related_files, "references", confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trimmedCreatedBy, created_at, trimmedCat, trimmedTechTitle, trimmedOutcome,
      problem || null, solution || null, lessons || null,
      tech_stack || null, normalizedTags,
      code_snippets || null, related_files || null, references || null, safeConfidence
    );

    // CMI-10: 同步生成 Embedding（fire-and-forget）
    const techEntryId = result.lastInsertRowid;
    const techEmbText = buildInputText('tech', { title: trimmedTechTitle, problem: problem || '', solution: solution || '' });
    syncEmbedding(database, 'tech', techEntryId, techEmbText)
      .catch(err => process.stderr.write(`[pcpt-context] tech embedding sync error (id=${techEntryId}): ${err.message}\n`));

    // Ledger dual-write
    appendLedger('tech_entries', 'INSERT', { id: Number(techEntryId), created_by: trimmedCreatedBy, category: trimmedCat, title: trimmedTechTitle, created_at });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ id: techEntryId, message: `✅ add_tech 寫入成功 (id=${techEntryId})` }),
      }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] add_tech error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `add_tech 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// add_cr_issue 實作 (AC-3)
// 映射至 tech_entries (category='review')
// ──────────────────────────────────────────────
const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const VALID_RESOLUTIONS = new Set(['FIXED', 'DEFERRED', 'WONT_FIX']);

function handleAddCrIssue(args) {
  const {
    story_id, issue_code, severity, description, resolution,
    category, target_story,
    self_check_q1, self_check_q2, self_check_q3, self_check_q4, self_check_q5,
  } = args;

  if (!story_id || !issue_code || !severity || !description || !resolution) {
    return {
      isError: true,
      content: [{ type: 'text', text: '缺少必填參數: story_id, issue_code, severity, description, resolution' }],
    };
  }

  if (!VALID_SEVERITIES.has(severity)) {
    return {
      isError: true,
      content: [{ type: 'text', text: `severity 無效值 "${severity}"。允許值: critical, high, medium, low` }],
    };
  }

  if (!VALID_RESOLUTIONS.has(resolution)) {
    return {
      isError: true,
      content: [{ type: 'text', text: `resolution 無效值 "${resolution}"。允許值: FIXED, DEFERRED, WONT_FIX` }],
    };
  }

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    const selfCheckNotes = [self_check_q1, self_check_q2, self_check_q3, self_check_q4, self_check_q5]
      .filter(Boolean)
      .map((v, i) => `Q${i + 1}: ${v}`)
      .join(' | ');

    // CR Issue 嚴重度 → 信心分數映射（越嚴重 → 越確定是問題 → 越高信心）
    const confidenceMap = { critical: 100, high: 90, medium: 80, low: 75 };
    const mapping = {
      created_by: story_id,
      created_at: getTaiwanTimestamp(),
      category: 'review',
      title: `[${severity.toUpperCase()}] ${issue_code}: ${description.substring(0, 80)}`,
      problem: description,
      solution: `${resolution}${target_story ? ` → ${target_story}` : ''}${selfCheckNotes ? ` | ${selfCheckNotes}` : ''}`,
      outcome: resolution === 'FIXED' ? 'success' : 'partial',
      tags: JSON.stringify([story_id, severity, resolution]),
      related_files: null,
      confidence: confidenceMap[severity] || 80,
    };

    const result = database.prepare(`
      INSERT INTO tech_entries
        (created_by, created_at, category, title, problem, solution, outcome, tags, related_files, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mapping.created_by, mapping.created_at, mapping.category, mapping.title,
      mapping.problem, mapping.solution, mapping.outcome, mapping.tags,
      mapping.related_files, mapping.confidence
    );

    // Ledger dual-write
    appendLedger('tech_entries', 'INSERT', { id: Number(result.lastInsertRowid), category: 'review', title: mapping.title, story_id, severity, resolution });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ id: result.lastInsertRowid, message: `✅ add_cr_issue 寫入成功 (id=${result.lastInsertRowid}, resolution=${resolution})` }),
      }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] add_cr_issue error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `add_cr_issue 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// trace_context 實作 (AC-4)
// Step 1: FTS5 直接命中
// Step 2: 從 story_id + related_files 擴展一層關聯
// ──────────────────────────────────────────────
function handleTraceContext(args) {
  const { query, depth = 1 } = args;

  if (!query || query.trim().length < 3) {
    return { content: [{ type: 'text', text: JSON.stringify({ direct: [], related: [] }) }] };
  }

  const safeDepth = Math.min(2, Math.max(1, Number(depth) || 1));

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) {
      return { content: [{ type: 'text', text: JSON.stringify({ direct: [], related: [] }) }] };
    }

    // Step 1: FTS5 直接命中（proximity=0）
    const directContext = database.prepare(`
      SELECT 'context' AS source, id, title, story_id, related_files
      FROM context_entries WHERE rowid IN (
        SELECT rowid FROM context_fts WHERE context_fts MATCH ?
      )
    `).all(ftsQuery).map(r => ({ ...r, proximity: 0 }));

    const directTech = database.prepare(`
      SELECT 'tech' AS source, id, title, NULL AS story_id, related_files
      FROM tech_entries WHERE rowid IN (
        SELECT rowid FROM tech_fts WHERE tech_fts MATCH ?
      )
    `).all(ftsQuery).map(r => ({ ...r, proximity: 0 }));

    const directHits = [...directContext, ...directTech];

    // 去重 key 集合（直接命中的不重複加入關聯結果）
    const seenKeys = new Set(directHits.map(r => `${r.source}:${r.id}`));
    const relatedHits = [];

    if (safeDepth >= 1 && directHits.length > 0) {
      // 收集 story_id 集合（非 null）
      const storyIds = [...new Set(directHits.map(r => r.story_id).filter(Boolean))];

      // 收集 related_files 中的個別檔案（非 null，逗號分隔）
      const fileSet = new Set();
      for (const r of directHits) {
        if (r.related_files) {
          r.related_files.split(',').map(f => f.trim()).filter(Boolean).forEach(f => fileSet.add(f));
        }
      }
      const relatedFiles = [...fileSet];

      // 依 story_id 擴展 context_entries
      if (storyIds.length > 0) {
        const placeholders = storyIds.map(() => '?').join(',');
        const rows = database.prepare(`
          SELECT 'context' AS source, id, title, story_id, related_files
          FROM context_entries WHERE story_id IN (${placeholders})
        `).all(...storyIds);
        for (const r of rows) {
          const key = `context:${r.id}`;
          if (!seenKeys.has(key)) { seenKeys.add(key); relatedHits.push({ ...r, proximity: 1 }); }
        }
      }

      // 依 related_files 擴展 context_entries（LIKE 查詢）
      for (const file of relatedFiles) {
        const rows = database.prepare(`
          SELECT 'context' AS source, id, title, story_id, related_files
          FROM context_entries WHERE related_files LIKE ?
        `).all(`%${file}%`);
        for (const r of rows) {
          const key = `context:${r.id}`;
          if (!seenKeys.has(key)) { seenKeys.add(key); relatedHits.push({ ...r, proximity: 1 }); }
        }
      }

      // 依 related_files 擴展 tech_entries（LIKE 查詢）
      for (const file of relatedFiles) {
        const rows = database.prepare(`
          SELECT 'tech' AS source, id, title, NULL AS story_id, related_files
          FROM tech_entries WHERE related_files LIKE ?
        `).all(`%${file}%`);
        for (const r of rows) {
          const key = `tech:${r.id}`;
          if (!seenKeys.has(key)) { seenKeys.add(key); relatedHits.push({ ...r, proximity: 1 }); }
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          direct: directHits,
          related: relatedHits,
          depth: safeDepth,
          total: directHits.length + relatedHits.length,
        }),
      }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] trace_context error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `trace_context 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// search_symbols 實作 (AC-6, TD-33)
// LIKE 搜尋 symbol_index（symbol_name / full_name）
// ──────────────────────────────────────────────
function handleSearchSymbols(args) {
  const { keyword, symbol_type = null, namespace = null, limit = 10 } = args;

  if (!keyword || keyword.trim().length < 2) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'keyword 須 >= 2 字元' }],
    };
  }

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const kw = `%${keyword.trim()}%`;

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    const params = [kw, kw];
    let sql = `
      SELECT id, file_path, symbol_type, symbol_name, full_name, namespace,
             parent_symbol, start_line, end_line,
             SUBSTR(code_snippet, 1, 500) AS code_preview,
             signature, return_type, modifiers, indexed_at
      FROM symbol_index
      WHERE (symbol_name LIKE ? OR full_name LIKE ?)
    `;
    if (symbol_type) { sql += ' AND symbol_type = ?'; params.push(symbol_type); }
    if (namespace)   { sql += ' AND namespace LIKE ?'; params.push(`${namespace}%`); }
    sql += ' ORDER BY symbol_name LIMIT ?';
    params.push(safeLimit);

    const rows = database.prepare(sql).all(...params);
    return {
      content: [{ type: 'text', text: JSON.stringify(rows) }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] search_symbols error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `search_symbols 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// get_symbol_context 實作 (AC-7, TD-33)
// 依 symbol_id 回傳完整 Symbol + 依賴展開（最多 2 層）
// ──────────────────────────────────────────────
function handleGetSymbolContext(args) {
  const { symbol_id, depth = 1 } = args;

  if (symbol_id === undefined || symbol_id === null || isNaN(Number(symbol_id))) {
    return { isError: true, content: [{ type: 'text', text: 'symbol_id 必須為數字' }] };
  }

  const safeDepth = Math.min(2, Math.max(1, Number(depth) || 1));
  const id = Number(symbol_id);

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    // Step 1: 取完整 Symbol 記錄
    const symbol = database.prepare(
      'SELECT * FROM symbol_index WHERE id = ?'
    ).get(id);

    if (!symbol) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ symbol: null, deps_layer1: [], deps_layer2: [], message: `Symbol id=${id} 不存在` }),
        }],
      };
    }

    // Step 2: Layer 1 依賴（source 或 target 為此 Symbol）
    const deps1 = database.prepare(`
      SELECT * FROM symbol_dependencies
      WHERE source_symbol = ? OR target_symbol = ?
    `).all(symbol.full_name, symbol.full_name);

    // Step 3: Layer 2 依賴（depth >= 2）
    let deps2 = [];
    if (safeDepth >= 2 && deps1.length > 0) {
      const seenIds = new Set(deps1.map(d => d.id));
      const relatedNames = new Set();
      for (const dep of deps1) {
        if (dep.source_symbol !== symbol.full_name) relatedNames.add(dep.source_symbol);
        if (dep.target_symbol !== symbol.full_name) relatedNames.add(dep.target_symbol);
      }
      for (const name of relatedNames) {
        const rows = database.prepare(`
          SELECT * FROM symbol_dependencies
          WHERE source_symbol = ? OR target_symbol = ?
        `).all(name, name);
        for (const r of rows) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            deps2.push(r);
          }
        }
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          symbol,
          deps_layer1: deps1,
          deps_layer2: deps2,
          depth: safeDepth,
        }),
      }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] get_symbol_context error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `get_symbol_context 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// search_conversations 實作 (CMI-3, AC-4)
// FTS5 搜尋 conversation_turns，JOIN conversation_sessions
// ──────────────────────────────────────────────
async function handleSearchConversations(args) {
  const { query = '', date_from = null, date_to = null, role = null, limit = 10 } = args;

  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 100);

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    const ftsQuery = sanitizeFtsQuery(query);
    if (!ftsQuery) {
      return { content: [{ type: 'text', text: JSON.stringify([]) }] };
    }

    const params = [ftsQuery];
    let sql = `
      SELECT
        ct.id AS turn_id,
        ct.session_id,
        ct.turn_index,
        ct.role,
        SUBSTR(ct.content_preview, 1, 300) AS content_preview,
        ct.timestamp,
        cs.summary AS session_summary,
        cs.started_at AS session_started_at,
        cs.first_prompt AS session_first_prompt
      FROM conversation_turns ct
      JOIN conversation_turns_fts f ON ct.id = f.rowid
      LEFT JOIN conversation_sessions cs ON ct.session_id = cs.session_id
      WHERE conversation_turns_fts MATCH ?
    `;

    if (date_from) { sql += ' AND ct.timestamp >= ?'; params.push(date_from); }
    if (date_to)   { sql += ' AND ct.timestamp <= ?'; params.push(date_to); }
    if (role)      { sql += ' AND ct.role = ?';       params.push(role); }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(safeLimit * 2);

    let rows = database.prepare(sql).all(...params);

    // CMI-10: Hybrid Fusion rerank（embedding 在 session 層級，用 session_id 匹配）
    const vectorScores = await getVectorScores(database, 'conversations', query, safeLimit * 2);
    rows = fuseResults(rows, vectorScores, r => r.session_id, safeLimit);

    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };

  } catch (err) {
    process.stderr.write(`[pcpt-context] search_conversations error: ${err.message}\n`);
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `搜尋失敗：${err.message}。提示：FTS5 trigram 查詢須 >= 3 字元。`,
      }],
    };
  }
}

// ──────────────────────────────────────────────
// get_session_detail 實作 (CMI-3, AC-4)
// 回傳 session 元資料 + 完整 turns
// ──────────────────────────────────────────────
function handleGetSessionDetail(args) {
  const { session_id, role = null, limit = null } = args;

  if (!session_id || !session_id.trim()) {
    return { isError: true, content: [{ type: 'text', text: 'session_id 不可為空' }] };
  }

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    // Session 元資料
    const session = database.prepare(
      'SELECT * FROM conversation_sessions WHERE session_id = ?'
    ).get(session_id.trim());

    if (!session) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ session: null, turns: [], message: `Session ${session_id} 不存在` }),
        }],
      };
    }

    // Turns 列表
    const params = [session_id.trim()];
    let sql = `
      SELECT id, turn_index, role, content_preview, timestamp, token_estimate, tools_used
      FROM conversation_turns
      WHERE session_id = ?
    `;
    if (role) { sql += ' AND role = ?'; params.push(role); }
    sql += ' ORDER BY turn_index ASC';
    if (limit) { sql += ' LIMIT ?'; params.push(Math.min(1000, Number(limit))); }

    const turns = database.prepare(sql).all(...params);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ session, turns, total_turns: turns.length }),
      }],
    };

  } catch (err) {
    process.stderr.write(`[pcpt-context] get_session_detail error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `get_session_detail 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// list_sessions 實作 (CMI-3, AC-4)
// 按時間倒序列出 session 清單
// ──────────────────────────────────────────────
function handleListSessions(args) {
  const { date_from = null, date_to = null, limit = 20 } = args;

  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 200);

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    const params = [];
    let sql = `
      SELECT
        session_id, started_at, ended_at, agent_id, git_branch,
        SUBSTR(first_prompt, 1, 200) AS first_prompt,
        SUBSTR(summary, 1, 300) AS summary,
        total_turns, user_turns, end_reason
      FROM conversation_sessions
      WHERE 1=1
    `;

    if (date_from) { sql += ' AND started_at >= ?'; params.push(date_from); }
    if (date_to)   { sql += ' AND started_at <= ?'; params.push(date_to); }

    sql += ' ORDER BY started_at DESC LIMIT ?';
    params.push(safeLimit);

    const rows = database.prepare(sql).all(...params);
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };

  } catch (err) {
    process.stderr.write(`[pcpt-context] list_sessions error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `list_sessions 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// semantic_search 實作 (Phase 2, TD-34)
// 流程: query → 本地 ONNX Embedding → Cosine Similarity 全量掃描 → Top-N
// 降級策略: 模型載入失敗 → 回退至 search_symbols LIKE 搜尋
// ──────────────────────────────────────────────
async function handleSemanticSearch(args) {
  const { query, limit = 10, symbol_type = null, min_similarity = 0.3 } = args;

  if (!query || query.trim().length < 2) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'query 須 >= 2 字元' }],
    };
  }

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const safeThreshold = Math.max(0, Math.min(1, Number(min_similarity) || 0.3));

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  // ── 嘗試向量搜尋 ──
  try {
    // Step 1: 將 query 轉為向量（本地 ONNX 推理）
    const queryVec = await generateEmbedding(query.trim());

    // Step 2: 從 symbol_embeddings 讀取全部向量（含 symbol_index JOIN）
    // TODO [TD-35]: 加入記憶體快取，避免每次查詢載入全部 ~32MB embedding 資料
    let sql = `
      SELECT se.symbol_id, se.embedding, se.model,
             si.symbol_name, si.full_name, si.file_path, si.symbol_type,
             SUBSTR(si.code_snippet, 1, 500) AS code_snippet
      FROM symbol_embeddings se
      JOIN symbol_index si ON se.symbol_id = si.id
    `;
    const params = [];
    if (symbol_type) {
      sql += ' WHERE si.symbol_type = ?';
      params.push(symbol_type);
    }

    const rows = database.prepare(sql).all(...params);

    if (rows.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: [],
            mode: 'vector',
            message: 'symbol_embeddings 為空，請先執行 node scripts/generate-embeddings.js --full',
          }),
        }],
      };
    }

    // Step 3: 計算 Cosine Similarity
    const scored = [];
    for (const row of rows) {
      const symbolVec = deserializeVector(row.embedding);
      const score = cosineSimilarity(queryVec, symbolVec);
      if (score >= safeThreshold) {
        scored.push({
          symbol_name: row.symbol_name,
          full_name: row.full_name,
          file_path: row.file_path,
          symbol_type: row.symbol_type,
          similarity_score: Math.round(score * 10000) / 10000,
          code_snippet: row.code_snippet,
        });
      }
    }

    // Step 4: 排序 + 取 Top-N
    scored.sort((a, b) => b.similarity_score - a.similarity_score);
    const topN = scored.slice(0, safeLimit);

    process.stderr.write(`[pcpt-context] semantic_search: query="${query.trim()}", candidates=${rows.length}, passed_threshold=${scored.length}, returned=${topN.length}\n`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          results: topN,
          mode: 'vector',
          total_candidates: rows.length,
          threshold: safeThreshold,
        }),
      }],
    };
  } catch (vectorErr) {
    // ── 降級策略: 回退至 search_symbols LIKE 搜尋 ──
    process.stderr.write(`[pcpt-context] semantic_search vector error, falling back to LIKE: ${vectorErr.message}\n`);

    try {
      const fallbackResult = handleSearchSymbols({
        keyword: query.trim(),
        symbol_type: symbol_type || undefined,
        limit: safeLimit,
      });

      // 解析 fallback 結果並加入降級標記
      const fallbackText = fallbackResult.content?.[0]?.text || '[]';
      const fallbackRows = JSON.parse(fallbackText);
      const fallbackWithNote = fallbackRows.map(r => ({
        ...r,
        similarity_score: null,
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: fallbackWithNote,
            mode: 'fallback_like',
            fallback_reason: vectorErr.message,
            message: '向量搜尋不可用（本地 ONNX 推理失敗），已降級至 LIKE 關鍵字搜尋',
          }),
        }],
      };
    } catch (fallbackErr) {
      process.stderr.write(`[pcpt-context] semantic_search fallback also failed: ${fallbackErr.message}\n`);
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `semantic_search 失敗（向量 + LIKE 均失敗）：${vectorErr.message}`,
        }],
      };
    }
  }
}

// ──────────────────────────────────────────────
// search_documents 實作 (CMI-5)
// 流程: FTS5 搜尋 + 可選向量搜尋 → Hybrid Fusion → Top-N
// 融合公式: final_score = 0.7 × vector_similarity + 0.3 × fts5_score
// 降級策略: API Key 缺失 / API 失敗 → FTS5-only + "degraded": true
// 排除 is_stale = 1 的 chunks
// ──────────────────────────────────────────────
async function handleSearchDocuments(args) {
  const { query, category = null, epic_id = null, limit = 10 } = args;

  if (!query || query.trim().length < 2) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'query 須 >= 2 字元' }],
    };
  }

  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 10));
  const trimmedQuery = query.trim();

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  // ── Step 1: FTS5 全文搜尋 ──
  let ftsResults = [];
  try {
    const ftsQuery = sanitizeFtsQuery(trimmedQuery);
    if (ftsQuery) {
      const ftsParams = [ftsQuery];
      let ftsSql = `
        SELECT
          dc.id AS chunk_id,
          dc.doc_id,
          dc.chunk_index,
          dc.heading_path,
          SUBSTR(dc.content, 1, 400) AS content_preview,
          dc.token_count,
          di.path AS file_path,
          di.title AS doc_title,
          di.category AS doc_category,
          di.epic_id AS doc_epic_id,
          rank AS fts_rank
        FROM document_chunks dc
        JOIN document_chunks_fts fts ON dc.id = fts.rowid
        JOIN doc_index di ON dc.doc_id = di.id
        WHERE document_chunks_fts MATCH ?
          AND dc.is_stale = 0
      `;
      if (category) { ftsSql += ' AND di.category = ?'; ftsParams.push(category); }
      if (epic_id)  { ftsSql += ' AND di.epic_id = ?';  ftsParams.push(epic_id); }
      ftsSql += ' ORDER BY rank LIMIT ?';
      ftsParams.push(safeLimit * 3); // 取 3x 備用融合
      ftsResults = database.prepare(ftsSql).all(...ftsParams);
    }
  } catch (ftsErr) {
    process.stderr.write(`[pcpt-context] search_documents FTS5 error: ${ftsErr.message}\n`);
  }

  // ── Step 2: 向量搜尋（本地 ONNX 推理） ──
  let vectorResults = [];
  let degraded = false;
  let vectorErr = null;

  try {
    // 生成 query 向量（本地 ONNX 推理）
    const queryVec = await generateEmbedding(trimmedQuery);

    // 讀取文檔 Embedding（含 doc_index JOIN 用於過濾）
    const vecParams = [];
    let vecSql = `
      SELECT
        de.chunk_id,
        de.embedding,
        dc.doc_id,
        dc.chunk_index,
        dc.heading_path,
        SUBSTR(dc.content, 1, 400) AS content_preview,
        dc.token_count,
        di.path AS file_path,
        di.title AS doc_title,
        di.category AS doc_category,
        di.epic_id AS doc_epic_id
      FROM document_embeddings de
      JOIN document_chunks dc ON de.chunk_id = dc.id
      JOIN doc_index di ON dc.doc_id = di.id
      WHERE dc.is_stale = 0
    `;
    if (category) { vecSql += ' AND di.category = ?'; vecParams.push(category); }
    if (epic_id)  { vecSql += ' AND di.epic_id = ?';  vecParams.push(epic_id); }

    const rows = database.prepare(vecSql).all(...vecParams);

    // 計算 Cosine Similarity，門檻 0.3（BR-009 定義最低相似度門檻）
    for (const row of rows) {
      const docVec = deserializeVector(row.embedding);
      const score = cosineSimilarity(queryVec, docVec);
      if (score >= 0.3) {
        vectorResults.push({ ...row, vector_score: score });
      }
    }

    process.stderr.write(`[pcpt-context] search_documents: query="${trimmedQuery}", vec_candidates=${rows.length}, vec_passed=${vectorResults.length}\n`);

  } catch (err) {
    vectorErr = err;
    degraded = true;
    process.stderr.write(`[pcpt-context] search_documents vector fallback: ${err.message}\n`);
  }

  // ── Step 3: Hybrid Fusion 評分 ──
  // 以 chunk_id 為 key，合併 FTS5 + Vector 結果
  const chunkMap = new Map(); // chunk_id → { ...chunkData, fts_score, vector_score, final_score }

  // 處理 FTS5 結果
  // FTS5 rank 是負數（越接近 0 越好），需正規化為 0-1 分
  const ftsScores = ftsResults.map(r => r.fts_rank);
  const minRank = ftsScores.length > 0 ? Math.min(...ftsScores) : -1;
  const maxRank = ftsScores.length > 0 ? Math.max(...ftsScores) : 0;
  const rankRange = (maxRank - minRank) || 1;

  for (const r of ftsResults) {
    // 正規化 FTS rank：rank 越小（更負）→ 相似度越高，轉為 0-1 正向分
    const normalizedFts = (r.fts_rank - minRank) / rankRange; // 0 = 最差, 1 = 最好
    // 反轉：原本 minRank（最負）是最佳匹配，正規化後應給高分
    const ftsScore = 1 - normalizedFts;

    chunkMap.set(r.chunk_id, {
      chunk_id:       r.chunk_id,
      doc_id:         r.doc_id,
      chunk_index:    r.chunk_index,
      heading_path:   r.heading_path,
      content_preview: r.content_preview,
      token_count:    r.token_count,
      file_path:      r.file_path,
      doc_title:      r.doc_title,
      doc_category:   r.doc_category,
      doc_epic_id:    r.doc_epic_id,
      fts_score:      Math.round(ftsScore * 10000) / 10000,
      vector_score:   null,
      final_score:    null,
    });
  }

  // 處理向量搜尋結果（合併至 chunkMap）
  for (const r of vectorResults) {
    if (chunkMap.has(r.chunk_id)) {
      chunkMap.get(r.chunk_id).vector_score = Math.round(r.vector_score * 10000) / 10000;
    } else {
      chunkMap.set(r.chunk_id, {
        chunk_id:       r.chunk_id,
        doc_id:         r.doc_id,
        chunk_index:    r.chunk_index,
        heading_path:   r.heading_path,
        content_preview: r.content_preview,
        token_count:    r.token_count,
        file_path:      r.file_path,
        doc_title:      r.doc_title,
        doc_category:   r.doc_category,
        doc_epic_id:    r.doc_epic_id,
        fts_score:      null,
        vector_score:   Math.round(r.vector_score * 10000) / 10000,
        final_score:    null,
      });
    }
  }

  // 計算 final_score
  for (const item of chunkMap.values()) {
    const vecScore = item.vector_score ?? 0;
    const ftsScore = item.fts_score ?? 0;

    if (degraded) {
      // 降級模式：純 FTS5 分數
      item.final_score = ftsScore;
    } else {
      // 融合模式：0.7 × vector + 0.3 × fts5
      item.final_score = Math.round((0.7 * vecScore + 0.3 * ftsScore) * 10000) / 10000;
    }
  }

  // ── Step 4: 排序 + Top-N ──
  const ranked = Array.from(chunkMap.values())
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, safeLimit)
    .map(({ embedding: _e, ...rest }) => rest); // 去除 embedding blob

  const response = {
    results: ranked,
    mode: degraded ? 'fts5_only' : 'hybrid',
    total_candidates: chunkMap.size,
    fts_hits: ftsResults.length,
    vector_hits: vectorResults.length,
  };

  if (degraded) {
    response.degraded = true;
    response.fallback_reason = vectorErr?.message || '向量搜尋不可用';
    response.message = '向量搜尋不可用，已降級至純 FTS5 搜尋';
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
  };
}

// ──────────────────────────────────────────────
// search_stories 實作（CMI-6）
// ──────────────────────────────────────────────
async function handleSearchStories(args) {
  const {
    query = '',
    story_id = null,
    epic_id = null,
    status = null,
    domain = null,
    complexity = null,
    story_type = null,
    dev_agent = null,
    include_details = false,
    fields = null,
    limit = 10,
  } = args || {};

  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 50);

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  // fields 白名單（防止 SQL injection）
  const ALLOWED_STORY_FIELDS = new Set([
    'story_id', 'epic_id', 'domain', 'title', 'status',
    'priority', 'complexity', 'story_type', 'dev_agent', 'review_agent',
    'tags', 'dependencies', 'created_at', 'updated_at',
    'cr_issues_total', 'cr_issues_fixed', 'cr_issues_deferred', 'cr_summary',
    'started_at', 'completed_at', 'review_completed_at',
    'user_story', 'background', 'acceptance_criteria', 'tasks', 'dev_notes',
    'required_skills', 'file_list', 'implementation_approach', 'testing_strategy',
    'definition_of_done', 'rollback_plan', 'monitoring_plan',
    'discovery_source', 'cr_score', 'test_count', 'execution_log', 'source_file',
    'sdd_spec', 'create_agent', 'create_started_at', 'create_completed_at',
    'pipeline_notes', 'review_started_at',
  ]);

  try {
    let rows;
    let selectCols;

    if (fields) {
      // fields 模式：只回傳指定欄位（opt-in 精簡）
      const requestedFields = fields.split(',').map(f => f.trim()).filter(f => ALLOWED_STORY_FIELDS.has(f));
      if (requestedFields.length === 0) {
        return { isError: true, content: [{ type: 'text', text: `fields 參數無有效欄位。允許欄位：${[...ALLOWED_STORY_FIELDS].join(', ')}` }] };
      }
      selectCols = requestedFields.map(f => `s.${f}`).join(', ');
    } else {
      // 預設模式：摘要 + 可選詳情（向後相容）
      const summaryCols = `
        s.story_id, s.epic_id, s.domain, s.title, s.status,
        s.priority, s.complexity, s.story_type, s.dev_agent, s.review_agent,
        s.tags, s.dependencies, s.created_at, s.updated_at,
        s.cr_issues_total, s.cr_issues_fixed, s.cr_issues_deferred,
        SUBSTR(s.cr_summary, 1, 200) AS cr_summary_preview,
        s.started_at, s.completed_at, s.review_completed_at
      `;

      const detailCols = include_details ? `,
        s.user_story, s.background,
        SUBSTR(s.acceptance_criteria, 1, 500) AS acceptance_criteria_preview,
        SUBSTR(s.tasks, 1, 500) AS tasks_preview,
        SUBSTR(s.dev_notes, 1, 500) AS dev_notes_preview,
        s.required_skills, s.file_list,
        SUBSTR(s.implementation_approach, 1, 300) AS implementation_approach_preview,
        SUBSTR(s.testing_strategy, 1, 300) AS testing_strategy_preview,
        SUBSTR(s.definition_of_done, 1, 300) AS definition_of_done_preview,
        s.discovery_source, s.cr_score, s.test_count,
        SUBSTR(s.execution_log, 1, 300) AS execution_log_preview
      ` : '';

      selectCols = summaryCols + detailCols;
    }

    if (story_id) {
      // story_id 精確查詢：直接 WHERE 匹配，跳過 FTS5
      const sql = `SELECT ${selectCols} FROM stories s WHERE s.story_id = ?`;
      rows = database.prepare(sql).all(story_id);
    } else if (!query || query.trim() === '') {
      // 空查詢：回傳最近 N 筆 + 條件過濾
      const params = [];
      let sql = `SELECT ${selectCols} FROM stories s WHERE 1=1`;
      if (epic_id)    { sql += ' AND s.epic_id = ?';    params.push(epic_id); }
      if (status)     { sql += ' AND s.status = ?';     params.push(status); }
      if (domain)     { sql += ' AND s.domain = ?';     params.push(domain); }
      if (complexity) { sql += ' AND s.complexity = ?';  params.push(complexity); }
      if (story_type) { sql += ' AND s.story_type = ?'; params.push(story_type); }
      if (dev_agent)  { sql += ' AND s.dev_agent = ?';  params.push(dev_agent); }
      sql += ' ORDER BY s.updated_at DESC LIMIT ?';
      params.push(safeLimit);
      rows = database.prepare(sql).all(...params);
    } else {
      // FTS5 全文搜尋
      const ftsQuery = sanitizeFtsQuery(query);
      if (!ftsQuery) {
        return { content: [{ type: 'text', text: JSON.stringify([]) }] };
      }

      const params = [ftsQuery];
      let sql = `
        SELECT ${selectCols}
        FROM stories s
        JOIN stories_fts f ON s.rowid = f.rowid
        WHERE stories_fts MATCH ?
      `;
      if (epic_id)    { sql += ' AND s.epic_id = ?';    params.push(epic_id); }
      if (status)     { sql += ' AND s.status = ?';     params.push(status); }
      if (domain)     { sql += ' AND s.domain = ?';     params.push(domain); }
      if (complexity) { sql += ' AND s.complexity = ?';  params.push(complexity); }
      if (story_type) { sql += ' AND s.story_type = ?'; params.push(story_type); }
      if (dev_agent)  { sql += ' AND s.dev_agent = ?';  params.push(dev_agent); }
      sql += ' ORDER BY rank LIMIT ?';
      params.push(safeLimit * 2);
      rows = database.prepare(sql).all(...params);

      // CMI-10: Hybrid Fusion rerank
      const vectorScores = await getVectorScores(database, 'stories', query, safeLimit * 2);
      rows = fuseResults(rows, vectorScores, r => r.story_id, safeLimit);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(rows) }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] search_stories error: ${err.message}\n`);
    return {
      isError: true,
      content: [{ type: 'text', text: `search_stories 失敗：${err.message}。提示：FTS5 trigram 查詢須 >= 3 字元。` }],
    };
  }
}

// ──────────────────────────────────────────────
// search_debt 實作（CMI-6）
// ──────────────────────────────────────────────
async function handleSearchDebt(args) {
  const {
    query = '',
    story_id = null,
    target_story = null,
    status = null,
    severity = null,
    category = null,
    affected_files = null,
    include_stats = false,
    limit = 20,
  } = args || {};

  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);

  let database;
  try {
    database = getDb();
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  try {
    let rows;

    const selectCols = `
      d.debt_id, d.story_id, d.category, d.severity, d.dimension,
      d.title, SUBSTR(d.description, 1, 200) AS description_preview,
      SUBSTR(d.fix_guidance, 1, 200) AS fix_guidance_preview,
      SUBSTR(d.root_cause, 1, 200) AS root_cause_preview,
      d.target_story, d.status, d.wont_fix_reason,
      d.source_review_date, d.created_at,
      d.resolved_at, d.resolved_by, d.resolved_in_story,
      d.affected_files
    `;

    if (!query || query.trim() === '') {
      // 空查詢：回傳最近 N 筆 + 條件過濾
      const params = [];
      let sql = `SELECT ${selectCols} FROM tech_debt_items d WHERE 1=1`;
      if (story_id)     { sql += ' AND d.story_id = ?';     params.push(story_id); }
      if (target_story) { sql += ' AND d.target_story = ?'; params.push(target_story); }
      if (status)       { sql += ' AND d.status = ?';       params.push(status); }
      if (severity)     { sql += ' AND d.severity = ?';     params.push(severity); }
      if (category)     { sql += ' AND d.category = ?';     params.push(category); }
      sql += ' ORDER BY d.created_at DESC LIMIT ?';
      params.push(safeLimit);
      rows = database.prepare(sql).all(...params);
    } else {
      // FTS5 全文搜尋
      const ftsQuery = sanitizeFtsQuery(query);
      if (!ftsQuery) {
        return { content: [{ type: 'text', text: JSON.stringify({ items: [], stats: null }) }] };
      }

      const params = [ftsQuery];
      let sql = `
        SELECT ${selectCols}
        FROM tech_debt_items d
        JOIN tech_debt_fts f ON d.id = f.rowid
        WHERE tech_debt_fts MATCH ?
      `;
      if (story_id)     { sql += ' AND d.story_id = ?';     params.push(story_id); }
      if (target_story) { sql += ' AND d.target_story = ?'; params.push(target_story); }
      if (status)       { sql += ' AND d.status = ?';       params.push(status); }
      if (severity)     { sql += ' AND d.severity = ?';     params.push(severity); }
      if (category)     { sql += ' AND d.category = ?';     params.push(category); }
      sql += ' ORDER BY rank LIMIT ?';
      params.push(safeLimit * 2);
      rows = database.prepare(sql).all(...params);

      // CMI-10: Hybrid Fusion rerank（debt_id 是 TEXT PK，但 embedding FK 是 item_id INTEGER）
      // debt_embeddings.item_id = tech_debt_items.id (INTEGER rowid)
      // FTS 結果中用 debt_id 識別，需要 id 欄位來匹配向量分數
      // 但 selectCols 不含 d.id，改用 debt_id 對應 → 需查映射
      const vectorScores = await getVectorScores(database, 'debt', query, safeLimit * 2);
      // debt embedding FK 是 item_id (INTEGER)，但 FTS 結果只有 debt_id (TEXT)
      // 建立映射：item_id → debt_id
      if (vectorScores.size > 0) {
        const debtIdMap = new Map();
        const mappingRows = database.prepare('SELECT id, debt_id FROM tech_debt_items').all();
        for (const m of mappingRows) debtIdMap.set(m.id, m.debt_id);
        // 轉換 vectorScores 的 key 從 item_id 到 debt_id
        const debtVectorScores = new Map();
        for (const [itemId, score] of vectorScores) {
          const dId = debtIdMap.get(itemId);
          if (dId) debtVectorScores.set(dId, score);
        }
        rows = fuseResults(rows, debtVectorScores, r => r.debt_id, safeLimit);
      } else {
        rows = rows.slice(0, safeLimit);
      }
    }

    // DLA-01: affected_files fuzzy matching (reuses boy-scout-sweep.js pattern)
    if (affected_files && affected_files.trim()) {
      const inputFiles = affected_files.split(',').map(f => f.trim()).filter(Boolean);
      if (inputFiles.length > 0) {
        // Load all debts with affected_files for fuzzy matching
        const afParams = [];
        let afSql = `SELECT ${selectCols} FROM tech_debt_items d WHERE d.affected_files IS NOT NULL AND d.affected_files != ''`;
        if (status)   { afSql += ' AND d.status = ?';   afParams.push(status); }
        if (severity) { afSql += ' AND d.severity = ?'; afParams.push(severity); }
        if (category) { afSql += ' AND d.category = ?'; afParams.push(category); }
        afSql += ' ORDER BY d.created_at DESC LIMIT 500';
        const allWithFiles = database.prepare(afSql).all(...afParams);

        const fileMatched = [];
        for (const debt of allWithFiles) {
          // Parse affected_files: try JSON array, fallback comma-separated
          let debtFiles;
          try {
            debtFiles = JSON.parse(debt.affected_files);
            if (!Array.isArray(debtFiles)) debtFiles = [String(debtFiles)];
          } catch {
            debtFiles = debt.affected_files.split(',').map(f => f.trim()).filter(Boolean);
          }
          if (debtFiles.length === 0) continue;

          const debtFilesNorm = debtFiles.map(f => f.replace(/\\/g, '/'));
          let hit = false;
          for (const inputFile of inputFiles) {
            const inputNorm = inputFile.replace(/\\/g, '/');
            for (const df of debtFilesNorm) {
              if (df === inputNorm ||
                  df.endsWith('/' + inputNorm) ||
                  inputNorm.endsWith('/' + df) ||
                  df.includes(inputNorm) ||
                  inputNorm.includes(df)) {
                hit = true;
                break;
              }
            }
            if (hit) break;
          }
          if (hit) fileMatched.push(debt);
        }

        // If affected_files is the sole ID-based filter (no query, no story_id, no target_story),
        // replace initial results with file-matched results only (BR-CS-DEBT-FILES).
        // Otherwise merge with existing rows for combined queries (BR-CS-DEDUP).
        const hasIdFilter = query.trim() || story_id || target_story;
        if (!hasIdFilter) {
          rows = fileMatched.slice(0, safeLimit);
        } else {
          const seen = new Set(rows.map(r => r.debt_id));
          for (const fm of fileMatched) {
            if (!seen.has(fm.debt_id)) {
              rows.push(fm);
              seen.add(fm.debt_id);
            }
          }
          rows = rows.slice(0, safeLimit);
        }
      }
    }

    // 附加統計
    let stats = null;
    if (include_stats) {
      const total   = database.prepare('SELECT COUNT(*) as c FROM tech_debt_items').get().c;
      const open    = database.prepare("SELECT COUNT(*) as c FROM tech_debt_items WHERE status = 'open'").get().c;
      const fixed   = database.prepare("SELECT COUNT(*) as c FROM tech_debt_items WHERE status = 'fixed'").get().c;
      const wontfix = database.prepare("SELECT COUNT(*) as c FROM tech_debt_items WHERE status = 'wont-fix'").get().c;
      const bySeverity = database.prepare(`
        SELECT severity, COUNT(*) as c FROM tech_debt_items WHERE status = 'open'
        GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END
      `).all();
      stats = { total, open, fixed, wontfix, open_by_severity: bySeverity };
    }

    const response = include_stats ? { items: rows, stats } : rows;

    return {
      content: [{ type: 'text', text: JSON.stringify(response) }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] search_debt error: ${err.message}\n`);
    return {
      isError: true,
      content: [{ type: 'text', text: `search_debt 失敗：${err.message}。提示：FTS5 trigram 查詢須 >= 3 字元。` }],
    };
  }
}

// ──────────────────────────────────────────────
// Phase 4/5 Tool Handlers
// ──────────────────────────────────────────────

function handleSearchGlossary(args) {
  const { query = '', domain = null, limit = 20 } = args || {};
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    let rows;
    if (!query || query.trim() === '') {
      const params = [];
      let sql = 'SELECT * FROM glossary WHERE 1=1';
      if (domain) { sql += ' AND domain = ?'; params.push(domain); }
      sql += ' ORDER BY updated_at DESC LIMIT ?';
      params.push(safeLimit);
      rows = database.prepare(sql).all(...params);
    } else {
      const ftsQuery = sanitizeFtsQuery(query);
      if (!ftsQuery) return { content: [{ type: 'text', text: JSON.stringify([]) }] };
      const params = [ftsQuery];
      let sql = `
        SELECT g.* FROM glossary g
        JOIN glossary_fts f ON g.rowid = f.rowid
        WHERE glossary_fts MATCH ?
      `;
      if (domain) { sql += ' AND g.domain = ?'; params.push(domain); }
      sql += ' ORDER BY rank LIMIT ?';
      params.push(safeLimit);
      rows = database.prepare(sql).all(...params);
    }
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  } catch (err) {
    process.stderr.write(`[pcpt-context] search_glossary error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `search_glossary 失敗：${err.message}` }] };
  }
}

function handleLogWorkflow(args) {
  const {
    workflow_type,
    story_id = null,
    agent_id = null,
    status,
    input_tokens = 0,
    output_tokens = 0,
    cache_read_tokens = 0,
    cache_creation_tokens = 0,
    cost_usd = 0.0,
    model = null,
    duration_ms = null,
    error_message = null,
  } = args || {};

  if (!workflow_type?.trim() || !status?.trim()) {
    return { isError: true, content: [{ type: 'text', text: '缺少必填參數: workflow_type, status' }] };
  }

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    const now = getTaiwanTimestamp();
    const completedAt = (status === 'completed' || status === 'failed') ? now : null;
    const result = database.prepare(`
      INSERT INTO workflow_executions (workflow_type, story_id, agent_id, status, started_at, completed_at, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, model, duration_ms, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflow_type.trim(), story_id || null, agent_id || null, status.trim(),
      now, completedAt,
      input_tokens || 0, output_tokens || 0,
      cache_read_tokens || 0, cache_creation_tokens || 0,
      cost_usd || 0.0, model || null,
      duration_ms || null, error_message || null
    );

    // Ledger dual-write
    appendLedger('workflow_executions', 'INSERT', { id: Number(result.lastInsertRowid), workflow_type: workflow_type.trim(), story_id, agent_id, status: status.trim(), started_at: now, model: model || null, cost_usd: cost_usd || 0.0 });

    return {
      content: [{ type: 'text', text: JSON.stringify({ id: Number(result.lastInsertRowid), message: `✅ log_workflow 寫入成功` }) }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] log_workflow error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `log_workflow 失敗：${err.message}` }] };
  }
}

function handleUpsertBenchmark(args) {
  const { metric_name, context = 'global', current_value, baseline_value = null, unit, notes = null } = args || {};

  if (!metric_name?.trim() || current_value == null || !unit?.trim()) {
    return { isError: true, content: [{ type: 'text', text: '缺少必填參數: metric_name, current_value, unit' }] };
  }

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    const now = getTaiwanTimestamp();
    const result = database.prepare(`
      INSERT INTO benchmarks (metric_name, context, baseline_value, current_value, unit, measured_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(metric_name, context) DO UPDATE SET
        current_value = excluded.current_value,
        baseline_value = COALESCE(excluded.baseline_value, benchmarks.baseline_value),
        measured_at = excluded.measured_at,
        notes = COALESCE(excluded.notes, benchmarks.notes)
    `).run(metric_name.trim(), context.trim(), baseline_value, current_value, unit.trim(), now, notes || null);

    // Ledger dual-write
    appendLedger('benchmarks', 'UPSERT', { metric_name: metric_name.trim(), context: context.trim(), current_value, unit: unit.trim(), measured_at: now });

    return {
      content: [{ type: 'text', text: JSON.stringify({ changes: result.changes, message: `✅ upsert_benchmark 成功 (${metric_name}@${context})` }) }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] upsert_benchmark error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `upsert_benchmark 失敗：${err.message}` }] };
  }
}

function handleGetPatterns(args) {
  const { domain = null, min_confidence = null, limit = 50 } = args || {};
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    const params = [];
    let sql = 'SELECT * FROM pattern_observations WHERE 1=1';
    if (domain) { sql += ' AND domain = ?'; params.push(domain); }
    if (min_confidence != null) { sql += ' AND confidence >= ?'; params.push(Number(min_confidence)); }
    sql += ' ORDER BY occurrences DESC, last_seen DESC LIMIT ?';
    params.push(safeLimit);

    const rows = database.prepare(sql).all(...params);

    // Domain summary stats
    const stats = database.prepare(
      'SELECT domain, COUNT(*) as count, SUM(occurrences) as total_ops, ROUND(AVG(confidence), 3) as avg_confidence FROM pattern_observations GROUP BY domain ORDER BY total_ops DESC'
    ).all();

    return { content: [{ type: 'text', text: JSON.stringify({ observations: rows, domain_stats: stats }) }] };
  } catch (err) {
    process.stderr.write(`[pcpt-context] get_patterns error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `get_patterns 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// DLA-07: IDD Tool Handlers (Framework v1.3)
// ──────────────────────────────────────────────

function handleSearchIntentionalDecisions(args) {
  const {
    query = '',
    idd_type = null,
    status = null,
    criticality = null,
    file_path = null,
    skill_name = null,
    platform_module = null,
    limit = 10,
  } = args || {};
  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 50);

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    let rows;
    const effectiveStatus = status || 'active';

    if (!query || query.trim() === '') {
      // 空查詢: 回傳最近 active IDD（按 criticality 排序）
      const params = [effectiveStatus];
      let sql = `
        SELECT idd_id, idd_type, title, decision, reason, forbidden_changes,
               criticality, adr_path, related_skills, platform_modules, status, updated_at
        FROM intentional_decisions WHERE status = ?
      `;
      if (idd_type)       { sql += ' AND idd_type = ?';           params.push(idd_type); }
      if (criticality)    { sql += ' AND criticality = ?';         params.push(criticality); }
      if (file_path)      { sql += " AND related_files LIKE ?";    params.push('%' + file_path + '%'); }
      if (skill_name)     { sql += " AND related_skills LIKE ?";   params.push('%' + skill_name + '%'); }
      if (platform_module){ sql += " AND platform_modules LIKE ?"; params.push('%' + platform_module + '%'); }
      sql += " ORDER BY CASE criticality WHEN 'critical' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC LIMIT ?";
      params.push(safeLimit);
      rows = database.prepare(sql).all(...params);
    } else {
      const ftsQuery = sanitizeFtsQuery(query);
      if (!ftsQuery) return { content: [{ type: 'text', text: JSON.stringify({ items: [], total: 0 }) }] };

      const params = [ftsQuery, effectiveStatus];
      let sql = `
        SELECT id.idd_id, id.idd_type, id.title, id.decision, id.reason, id.forbidden_changes,
               id.criticality, id.adr_path, id.related_skills, id.platform_modules, id.status, id.updated_at
        FROM intentional_decisions id
        JOIN intentional_decisions_fts f ON id.rowid = f.rowid
        WHERE intentional_decisions_fts MATCH ? AND id.status = ?
      `;
      if (idd_type)       { sql += ' AND id.idd_type = ?';           params.push(idd_type); }
      if (criticality)    { sql += ' AND id.criticality = ?';         params.push(criticality); }
      if (file_path)      { sql += " AND id.related_files LIKE ?";    params.push('%' + file_path + '%'); }
      if (skill_name)     { sql += " AND id.related_skills LIKE ?";   params.push('%' + skill_name + '%'); }
      if (platform_module){ sql += " AND id.platform_modules LIKE ?"; params.push('%' + platform_module + '%'); }
      sql += " ORDER BY rank LIMIT ?";
      params.push(safeLimit);
      rows = database.prepare(sql).all(...params);
    }

    return { content: [{ type: 'text', text: JSON.stringify({ items: rows, total: rows.length }) }] };
  } catch (err) {
    process.stderr.write(`[pcpt-context] search_intentional_decisions error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `search_intentional_decisions 失敗：${err.message}` }] };
  }
}

function handleGetIntentionalDecision(args) {
  const { idd_id } = args || {};
  if (!idd_id?.trim()) {
    return { isError: true, content: [{ type: 'text', text: '缺少必填參數: idd_id' }] };
  }

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    const row = database.prepare('SELECT * FROM intentional_decisions WHERE idd_id = ?').get(idd_id.trim());
    if (!row) {
      return { content: [{ type: 'text', text: JSON.stringify(null) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(row) }] };
  } catch (err) {
    process.stderr.write(`[pcpt-context] get_intentional_decision error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `get_intentional_decision 失敗：${err.message}` }] };
  }
}

function handleAddIntentionalDecision(args) {
  const {
    idd_id, idd_type, title, context, decision, reason,
    adr_path, signoff_by, signoff_date,
    code_locations = null,
    memory_file_path = null,
    re_evaluation_trigger = null,
    re_evaluation_date = null,
    forbidden_changes = null,
    criticality = 'normal',
    superseded_by = null,
    related_skills = null,
    related_docs = null,
    platform_modules = null,
    related_files = null,
    tags = null,
  } = args || {};

  // Validation
  if (!idd_id?.trim() || !idd_type?.trim() || !title?.trim() || !context?.trim() ||
      !decision?.trim() || !reason?.trim() || !adr_path?.trim() ||
      !signoff_by?.trim() || !signoff_date?.trim()) {
    return { isError: true, content: [{ type: 'text', text: '缺少必填參數: idd_id, idd_type, title, context, decision, reason, adr_path, signoff_by, signoff_date' }] };
  }
  if (!['COM', 'STR', 'REG', 'USR'].includes(idd_type)) {
    return { isError: true, content: [{ type: 'text', text: `IDD_001: idd_type 必須為 COM/STR/REG/USR，收到: ${idd_type}` }] };
  }
  if (criticality && !['critical', 'normal', 'low'].includes(criticality)) {
    return { isError: true, content: [{ type: 'text', text: `criticality 必須為 critical/normal/low` }] };
  }

  // Validate JSON fields
  const jsonFields = { forbidden_changes, code_locations, related_skills, related_docs, platform_modules, related_files };
  for (const [field, val] of Object.entries(jsonFields)) {
    if (val != null) {
      try { JSON.parse(val); }
      catch { return { isError: true, content: [{ type: 'text', text: `IDD_005: ${field} 必須為合法 JSON array 字串` }] }; }
    }
  }

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    const now = getTaiwanTimestamp();
    // UPSERT — 已存在則更新所有欄位
    database.prepare(`
      INSERT INTO intentional_decisions (
        idd_id, idd_type, title, context, decision, reason,
        code_locations, adr_path, memory_file_path, signoff_by, signoff_date,
        re_evaluation_trigger, re_evaluation_date, forbidden_changes,
        criticality, status, superseded_by, related_skills, related_docs,
        platform_modules, related_files, tags, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(idd_id) DO UPDATE SET
        title=excluded.title, context=excluded.context, decision=excluded.decision,
        reason=excluded.reason, code_locations=excluded.code_locations,
        adr_path=excluded.adr_path, memory_file_path=excluded.memory_file_path,
        signoff_by=excluded.signoff_by, signoff_date=excluded.signoff_date,
        re_evaluation_trigger=excluded.re_evaluation_trigger,
        re_evaluation_date=excluded.re_evaluation_date,
        forbidden_changes=excluded.forbidden_changes, criticality=excluded.criticality,
        superseded_by=excluded.superseded_by, related_skills=excluded.related_skills,
        related_docs=excluded.related_docs, platform_modules=excluded.platform_modules,
        related_files=excluded.related_files, tags=excluded.tags, updated_at=?
    `).run(
      idd_id.trim(), idd_type.trim(), title.trim(), context.trim(),
      decision.trim(), reason.trim(),
      code_locations || null, adr_path.trim(), memory_file_path || null,
      signoff_by.trim(), signoff_date.trim(),
      re_evaluation_trigger || null, re_evaluation_date || null,
      forbidden_changes || null, criticality || 'normal', 'active',
      superseded_by || null, related_skills || null, related_docs || null,
      platform_modules || null, related_files || null, tags || null,
      now, now,
      now, // ON CONFLICT updated_at
    );

    // Ledger dual-write
    appendLedger('intentional_decisions', 'UPSERT', { idd_id: idd_id.trim(), idd_type, title: title.trim(), criticality, adr_path: adr_path.trim(), created_at: now });

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, idd_id: idd_id.trim(), message: `✅ IDD ${idd_id.trim()} 已寫入 DB` }) }],
    };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return { isError: true, content: [{ type: 'text', text: `IDD_004: idd_id ${idd_id} UPSERT 失敗（UNIQUE constraint 異常，請回報錯誤）` }] };
    }
    process.stderr.write(`[pcpt-context] add_intentional_decision error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `add_intentional_decision 失敗：${err.message}` }] };
  }
}

function handleVerifyIntentionalAnnotations(args) {
  const { scope = 'all', file_path = null } = args || {};

  let database;
  try { database = getDb(); }
  catch (err) { return { isError: true, content: [{ type: 'text', text: err.message }] }; }

  try {
    // 從 DB 取得所有 active IDD
    const activeIdds = database.prepare("SELECT idd_id, adr_path, code_locations FROM intentional_decisions WHERE status = 'active'").all();

    const valid = [];
    const missing_adr = [];
    const orphaned_idd = [];
    const mismatched_locations = [];

    // fs and path are imported at top of file (ESM static imports)

    for (const idd of activeIdds) {
      // Check ADR file exists
      if (!idd.adr_path) {
        missing_adr.push({ idd_id: idd.idd_id, reason: 'adr_path is empty' });
        continue;
      }
      const adrFull = path.join(__dirname, '..', idd.adr_path);
      if (!fs.existsSync(adrFull)) {
        missing_adr.push({ idd_id: idd.idd_id, adr_path: idd.adr_path, reason: 'ADR file not found' });
        continue;
      }

      // Check code_locations if specified
      if (idd.code_locations) {
        try {
          const locs = JSON.parse(idd.code_locations);
          if (Array.isArray(locs) && locs.length > 0) {
            if (scope === 'file' && file_path) {
              // Only check specified file
              const fileLocs = locs.filter(l => l.file && l.file.includes(file_path));
              if (fileLocs.length === 0) {
                valid.push({ idd_id: idd.idd_id, files: [] });
                continue;
              }
            }
            const validLocs = [];
            const mismatchedLocs = [];
            for (const loc of locs) {
              if (!loc.file) continue;
              const fullPath = path.join(__dirname, '..', loc.file);
              if (fs.existsSync(fullPath)) {
                validLocs.push({ path: loc.file, line: loc.line });
              } else {
                mismatchedLocs.push({ path: loc.file, line: loc.line, reason: 'file not found' });
              }
            }
            if (mismatchedLocs.length > 0) {
              mismatched_locations.push({ idd_id: idd.idd_id, mismatched: mismatchedLocs });
            }
            if (validLocs.length > 0) {
              valid.push({ idd_id: idd.idd_id, files: validLocs });
            }
          } else {
            valid.push({ idd_id: idd.idd_id, files: [] });
          }
        } catch {
          mismatched_locations.push({ idd_id: idd.idd_id, reason: 'code_locations JSON parse error' });
        }
      } else {
        valid.push({ idd_id: idd.idd_id, files: [] });
      }
    }

    // ── Orphaned IDD Detection (DLA-09: reads idd-cross-reference.json) ──
    // Detect code annotations [Intentional: IDD-XXX] that reference IDDs not in DB
    const crossRefPath = path.join(__dirname, 'idd-cross-reference.json');
    let crossRefWarning = null;
    if (fs.existsSync(crossRefPath)) {
      try {
        const crossRef = JSON.parse(fs.readFileSync(crossRefPath, 'utf8'));
        const activeIddSet = new Set(activeIdds.map(i => i.idd_id));
        for (const annotation of (crossRef.code_annotations || [])) {
          if (annotation.idd_id && !activeIddSet.has(annotation.idd_id)) {
            orphaned_idd.push({
              annotation_file: annotation.file,
              annotation_line: annotation.line,
              referenced_idd_id: annotation.idd_id,
              reason: 'Code annotation references IDD not found in intentional_decisions (active)',
            });
          }
        }
      } catch (parseErr) {
        crossRefWarning = `idd-cross-reference.json parse error: ${parseErr.message}`;
      }
    } else {
      crossRefWarning = 'idd-cross-reference.json not found — run build-idd-cross-reference.js first to enable orphaned_idd detection';
    }

    const total = activeIdds.length;
    const issueCount = missing_adr.length + orphaned_idd.length + mismatched_locations.length;

    const summaryObj = { checked: total, valid: valid.length, issues: issueCount };
    if (crossRefWarning) summaryObj.cross_ref_warning = crossRefWarning;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid, missing_adr, orphaned_idd, mismatched_locations,
          summary: summaryObj,
        }),
      }],
    };
  } catch (err) {
    process.stderr.write(`[pcpt-context] verify_intentional_annotations error: ${err.message}\n`);
    return { isError: true, content: [{ type: 'text', text: `verify_intentional_annotations 失敗：${err.message}` }] };
  }
}

// ──────────────────────────────────────────────
// 啟動 Transport + Graceful Shutdown
// ──────────────────────────────────────────────
async function main() {
  // 嘗試啟動時連接 DB（AC-1: 連接失敗不 crash，輸出 stderr）
  try {
    getDb();
    process.stderr.write('[pcpt-context] DB connected: ' + DB_PATH + '\n');
  } catch (err) {
    process.stderr.write('[pcpt-context] WARNING: ' + err.message + '\n');
    process.stderr.write('[pcpt-context] Server will start but queries will fail until DB is initialized.\n');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[pcpt-context] MCP Server ready (stdio transport)\n');

  // LOW-2 fix: graceful shutdown — 等待 500ms 讓 pending embedding Promise 完成
  const gracefulShutdown = (signal) => {
    process.stderr.write(`[pcpt-context] ${signal} received, shutting down...\n`);
    setTimeout(() => {
      if (db) {
        db.close();
        process.stderr.write('[pcpt-context] DB connection closed\n');
      }
      process.exit(0);
    }, 500);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write('[pcpt-context] Fatal: ' + err.message + '\n');
  process.exit(1);
});
