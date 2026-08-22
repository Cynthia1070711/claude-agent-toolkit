// ============================================================
// PhyCool Context Memory DB — Phase 0 Schema 初始化
// TD-32a: SQLite + FTS5 trigram 初始化腳本
// ============================================================
// 執行方式: node .context-db/scripts/init-db.js
// 冪等設計: 重複執行不報錯 (CREATE TABLE IF NOT EXISTS)
// FTS5 trigram: 查詢字串須 >= 3 字元，2 字元以下回傳空結果
// FTS5 外部內容: 透過 INSERT/UPDATE/DELETE Trigger 自動同步 FTS 索引（TD-32c）
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 資料庫路徑：.context-db/phycool.db
const DB_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'phycool.db');

// Phase 3+ 的表（不得出現在當前資料庫中）
// Phase 1 已啟動 (TD-33): symbol_index / symbol_dependencies 已合法加入
// Phase 2 已啟動 (TD-34): symbol_embeddings 已合法加入
// CMI-2 Phase 1 ETL: stories / cr_reports / cr_issues / doc_index 已合法加入
// Phase 5 已啟動: glossary, workflow_executions, benchmarks, test_journeys, test_traceability
const PHASE3_PLUS_TABLES = [
  'epics', 'story_relations', 'story_history',
  'file_relations', 'design_tokens',
];

async function initDb() {
  // 確保目錄存在
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // WAL 模式：支援多 Agent 併發讀取
  db.pragma('journal_mode = WAL');

  // ──────────────────────────────────────────────
  // 1. 上下文記憶表
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT,
      agent_id        TEXT NOT NULL,
      timestamp       TEXT NOT NULL,
      category        TEXT NOT NULL,
      tags            TEXT,
      title           TEXT NOT NULL,
      content         TEXT NOT NULL,
      related_files   TEXT,
      story_id        TEXT,
      epic_id         TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(
      title, content, tags,
      content=context_entries,
      content_rowid=id,
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers — context_entries → context_fts (AC-5)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS context_ai AFTER INSERT ON context_entries BEGIN
      INSERT INTO context_fts(rowid, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS context_ad AFTER DELETE ON context_entries BEGIN
      INSERT INTO context_fts(context_fts, rowid, title, content, tags)
      VALUES('delete', old.id, old.title, old.content, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS context_au AFTER UPDATE ON context_entries BEGIN
      INSERT INTO context_fts(context_fts, rowid, title, content, tags)
      VALUES('delete', old.id, old.title, old.content, old.tags);
      INSERT INTO context_fts(rowid, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
  `);

  // ──────────────────────────────────────────────
  // 2. 技術知識庫表
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tech_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      created_by      TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      updated_at      TEXT,
      category        TEXT NOT NULL,
      tech_stack      TEXT,
      tags            TEXT,
      title           TEXT NOT NULL,
      problem         TEXT,
      solution        TEXT,
      outcome         TEXT NOT NULL,
      lessons         TEXT,
      code_snippets   TEXT,
      related_files   TEXT,
      "references"    TEXT,
      confidence      INTEGER DEFAULT 80
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS tech_fts USING fts5(
      title, problem, solution, lessons, tags,
      content=tech_entries,
      content_rowid=id,
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers — tech_entries → tech_fts (AC-5)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tech_ai AFTER INSERT ON tech_entries BEGIN
      INSERT INTO tech_fts(rowid, title, problem, solution, lessons, tags)
      VALUES (new.id, new.title, new.problem, new.solution, new.lessons, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS tech_ad AFTER DELETE ON tech_entries BEGIN
      INSERT INTO tech_fts(tech_fts, rowid, title, problem, solution, lessons, tags)
      VALUES('delete', old.id, old.title, old.problem, old.solution, old.lessons, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS tech_au AFTER UPDATE ON tech_entries BEGIN
      INSERT INTO tech_fts(tech_fts, rowid, title, problem, solution, lessons, tags)
      VALUES('delete', old.id, old.title, old.problem, old.solution, old.lessons, old.tags);
      INSERT INTO tech_fts(rowid, title, problem, solution, lessons, tags)
      VALUES (new.id, new.title, new.problem, new.solution, new.lessons, new.tags);
    END;
  `);

  // ──────────────────────────────────────────────
  // 3. Sprint 狀態索引
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprint_index (
      story_id        TEXT PRIMARY KEY,
      epic_id         TEXT NOT NULL,
      title           TEXT NOT NULL,
      status          TEXT NOT NULL,
      priority        TEXT,
      assigned_agent  TEXT,
      last_updated    TEXT
    );
  `);

  // ──────────────────────────────────────────────
  // -- Phase 1: Symbol 索引（TD-33）
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS symbol_index (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path        TEXT NOT NULL,
      symbol_type      TEXT NOT NULL,
      symbol_name      TEXT NOT NULL,
      full_name        TEXT NOT NULL,
      namespace        TEXT,
      parent_symbol    TEXT,
      start_line       INTEGER NOT NULL,
      end_line         INTEGER NOT NULL,
      code_snippet     TEXT NOT NULL,
      signature        TEXT,
      return_type      TEXT,
      parameters       TEXT,
      modifiers        TEXT,
      indexed_at       TEXT NOT NULL,
      file_hash        TEXT,
      centrality_score REAL NOT NULL DEFAULT 0.0  -- ADR-GOVERNANCE-001 + Tianji v1.1.0 (2026-05-02)
                                                  -- migration: 2026-05-02-add-symbol-centrality-score.sql
                                                  -- compute: scripts/compute-centrality.js (weighted in/out-degree from RELATION_WEIGHTS)
                                                  -- consume: search_god_nodes MCP tool + Layer 10 S_final δ=0.05 加權
    );

    CREATE TABLE IF NOT EXISTS symbol_dependencies (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source_symbol   TEXT NOT NULL,
      target_symbol   TEXT NOT NULL,
      relation_type   TEXT NOT NULL,
      source_file     TEXT,
      target_file     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_symbol_name       ON symbol_index(symbol_name);
    CREATE INDEX IF NOT EXISTS idx_symbol_fullname   ON symbol_index(full_name);
    CREATE INDEX IF NOT EXISTS idx_symbol_file       ON symbol_index(file_path);
    CREATE INDEX IF NOT EXISTS idx_symbol_index_centrality ON symbol_index(centrality_score DESC);  -- ADR-GOVERNANCE-001
    CREATE INDEX IF NOT EXISTS idx_dep_source        ON symbol_dependencies(source_symbol);
    CREATE INDEX IF NOT EXISTS idx_dep_target        ON symbol_dependencies(target_symbol);
  `);

  // ──────────────────────────────────────────────
  // -- Phase 2: Symbol Embedding 向量儲存（TD-34）
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS symbol_embeddings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol_id       INTEGER NOT NULL UNIQUE,
      embedding       BLOB NOT NULL,
      model           TEXT NOT NULL,
      dimensions      INTEGER NOT NULL,
      token_count     INTEGER,
      generated_at    TEXT NOT NULL,
      FOREIGN KEY (symbol_id) REFERENCES symbol_index(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_embedding_symbol ON symbol_embeddings(symbol_id);
  `);

  // ──────────────────────────────────────────────
  // -- Phase 3: God Nodes — weighted PageRank projection
  //    migration: 2026-05-11-add-god-nodes-table.sql
  //    upstream:  scripts/compute-centrality.cjs (RELATION_WEIGHTS PageRank)
  //    consume:   search_god_nodes MCP tool (blast_radius / computed_at / staleness)
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS god_nodes (
      symbol_id              INTEGER PRIMARY KEY,
      file_path              TEXT NOT NULL,
      start_line             INTEGER NOT NULL,
      end_line               INTEGER NOT NULL,
      domain                 TEXT,
      centrality_score       REAL NOT NULL DEFAULT 0.0,
      in_degree              INTEGER NOT NULL DEFAULT 0,
      out_degree             INTEGER NOT NULL DEFAULT 0,
      weighted_in_degree     REAL NOT NULL DEFAULT 0.0,
      weighted_out_degree    REAL NOT NULL DEFAULT 0.0,
      blast_radius           TEXT CHECK (blast_radius IN ('critical','high','medium','low')),
      is_generated           INTEGER NOT NULL DEFAULT 0,
      is_test                INTEGER NOT NULL DEFAULT 0,
      computed_at            TEXT NOT NULL,
      FOREIGN KEY (symbol_id) REFERENCES symbol_index(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_god_nodes_centrality   ON god_nodes(centrality_score DESC);
    CREATE INDEX IF NOT EXISTS idx_god_nodes_domain       ON god_nodes(domain);
    CREATE INDEX IF NOT EXISTS idx_god_nodes_blast_radius ON god_nodes(blast_radius);
    CREATE INDEX IF NOT EXISTS idx_god_nodes_computed_at  ON god_nodes(computed_at);
  `);

  // ──────────────────────────────────────────────
  // -- CMI-2 Phase 1 ETL: Story / CR / Doc 索引表
  // ──────────────────────────────────────────────

  // 4a. stories — Story Metadata 索引
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      story_id      TEXT PRIMARY KEY,
      epic_id       TEXT NOT NULL,
      domain        TEXT NOT NULL,
      title         TEXT NOT NULL,
      status        TEXT NOT NULL,
      priority      TEXT,
      complexity    TEXT,
      story_type    TEXT,
      dependencies  TEXT,
      tags          TEXT,
      file_list     TEXT,
      dev_agent     TEXT,
      review_agent  TEXT,
      source_file   TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts USING fts5(
      story_id, title, tags, dependencies,
      content=stories,
      content_rowid=rowid,
      tokenize='trigram'
    );

    CREATE INDEX IF NOT EXISTS idx_stories_epic   ON stories(epic_id);
    CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
    CREATE INDEX IF NOT EXISTS idx_stories_domain ON stories(domain);
  `);

  // FTS5 Content-Sync Triggers — stories → stories_fts
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS stories_ai AFTER INSERT ON stories BEGIN
      INSERT INTO stories_fts(rowid, story_id, title, tags, dependencies)
      VALUES (new.rowid, new.story_id, new.title, new.tags, new.dependencies);
    END;

    CREATE TRIGGER IF NOT EXISTS stories_ad AFTER DELETE ON stories BEGIN
      INSERT INTO stories_fts(stories_fts, rowid, story_id, title, tags, dependencies)
      VALUES('delete', old.rowid, old.story_id, old.title, old.tags, old.dependencies);
    END;

    CREATE TRIGGER IF NOT EXISTS stories_au AFTER UPDATE ON stories BEGIN
      INSERT INTO stories_fts(stories_fts, rowid, story_id, title, tags, dependencies)
      VALUES('delete', old.rowid, old.story_id, old.title, old.tags, old.dependencies);
      INSERT INTO stories_fts(rowid, story_id, title, tags, dependencies)
      VALUES (new.rowid, new.story_id, new.title, new.tags, new.dependencies);
    END;
  `);

  // 4a-fts-upgrade: stories_fts 擴展索引欄位（冪等：檢查具體欄位名決定是否重建）
  // 目標: story_id, title, tags, dependencies, dev_notes, cr_summary (6 欄)
  {
    const ftsColNames = db.prepare("PRAGMA table_info(stories_fts)").all().map(r => r.name);
    const hasStoryId = ftsColNames.includes('story_id');
    const hasDevNotes = ftsColNames.includes('dev_notes');
    const hasCrSummary = ftsColNames.includes('cr_summary');
    if (!hasStoryId || !hasDevNotes || !hasCrSummary) {
      // 需要升級：DROP triggers → DROP FTS → RECREATE → REBUILD triggers
      db.exec(`
        DROP TRIGGER IF EXISTS stories_ai;
        DROP TRIGGER IF EXISTS stories_ad;
        DROP TRIGGER IF EXISTS stories_au;
        DROP TABLE IF EXISTS stories_fts;

        CREATE VIRTUAL TABLE stories_fts USING fts5(
          story_id, title, tags, dependencies, dev_notes, cr_summary,
          content=stories,
          content_rowid=rowid,
          tokenize='trigram'
        );

        CREATE TRIGGER stories_ai AFTER INSERT ON stories BEGIN
          INSERT INTO stories_fts(rowid, story_id, title, tags, dependencies, dev_notes, cr_summary)
          VALUES (new.rowid, new.story_id, new.title, new.tags, new.dependencies, new.dev_notes, new.cr_summary);
        END;

        CREATE TRIGGER stories_ad AFTER DELETE ON stories BEGIN
          INSERT INTO stories_fts(stories_fts, rowid, story_id, title, tags, dependencies, dev_notes, cr_summary)
          VALUES('delete', old.rowid, old.story_id, old.title, old.tags, old.dependencies, old.dev_notes, old.cr_summary);
        END;

        CREATE TRIGGER stories_au AFTER UPDATE ON stories BEGIN
          INSERT INTO stories_fts(stories_fts, rowid, story_id, title, tags, dependencies, dev_notes, cr_summary)
          VALUES('delete', old.rowid, old.story_id, old.title, old.tags, old.dependencies, old.dev_notes, old.cr_summary);
          INSERT INTO stories_fts(rowid, story_id, title, tags, dependencies, dev_notes, cr_summary)
          VALUES (new.rowid, new.story_id, new.title, new.tags, new.dependencies, new.dev_notes, new.cr_summary);
        END;
      `);
      // Rebuild FTS index from existing stories data
      db.exec("INSERT INTO stories_fts(stories_fts) VALUES('rebuild')");
      console.log('   📝 stories_fts 升級完成：→6 欄位（+story_id, +dev_notes, +cr_summary）+ rebuild');
    }
  }

  // 4b. cr_reports — CR 報告索引
  db.exec(`
    CREATE TABLE IF NOT EXISTS cr_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id        TEXT NOT NULL,
      round           TEXT NOT NULL,
      saas_score      INTEGER,
      issues_total    INTEGER DEFAULT 0,
      issues_fixed    INTEGER DEFAULT 0,
      issues_deferred INTEGER DEFAULT 0,
      issues_wontfix  INTEGER DEFAULT 0,
      deferred_targets TEXT,
      reviewer        TEXT,
      review_date     TEXT NOT NULL,
      tags            TEXT,
      source_file     TEXT NOT NULL,
      created_at      TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS cr_reports_fts USING fts5(
      story_id, tags, reviewer,
      content=cr_reports,
      content_rowid=id,
      tokenize='trigram'
    );

    CREATE INDEX IF NOT EXISTS idx_cr_story ON cr_reports(story_id);
    CREATE INDEX IF NOT EXISTS idx_cr_score ON cr_reports(saas_score);
  `);

  // FTS5 Content-Sync Triggers — cr_reports → cr_reports_fts
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS cr_reports_ai AFTER INSERT ON cr_reports BEGIN
      INSERT INTO cr_reports_fts(rowid, story_id, tags, reviewer)
      VALUES (new.id, new.story_id, new.tags, new.reviewer);
    END;

    CREATE TRIGGER IF NOT EXISTS cr_reports_ad AFTER DELETE ON cr_reports BEGIN
      INSERT INTO cr_reports_fts(cr_reports_fts, rowid, story_id, tags, reviewer)
      VALUES('delete', old.id, old.story_id, old.tags, old.reviewer);
    END;

    CREATE TRIGGER IF NOT EXISTS cr_reports_au AFTER UPDATE ON cr_reports BEGIN
      INSERT INTO cr_reports_fts(cr_reports_fts, rowid, story_id, tags, reviewer)
      VALUES('delete', old.id, old.story_id, old.tags, old.reviewer);
      INSERT INTO cr_reports_fts(rowid, story_id, tags, reviewer)
      VALUES (new.id, new.story_id, new.tags, new.reviewer);
    END;
  `);

  // 4c. cr_issues — CR Issue 細項
  db.exec(`
    CREATE TABLE IF NOT EXISTS cr_issues (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      cr_report_id    INTEGER,
      story_id        TEXT NOT NULL,
      issue_code      TEXT NOT NULL,
      severity        TEXT NOT NULL,
      dimension       TEXT,
      summary         TEXT NOT NULL,
      resolution      TEXT NOT NULL,
      target_story    TEXT,
      file_path       TEXT,
      created_at      TEXT NOT NULL,
      FOREIGN KEY (cr_report_id) REFERENCES cr_reports(id) ON DELETE SET NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS cr_issues_fts USING fts5(
      summary, dimension, file_path, story_id,
      content=cr_issues,
      content_rowid=id,
      tokenize='trigram'
    );

    CREATE INDEX IF NOT EXISTS idx_cri_story      ON cr_issues(story_id);
    CREATE INDEX IF NOT EXISTS idx_cri_severity   ON cr_issues(severity);
    CREATE INDEX IF NOT EXISTS idx_cri_resolution ON cr_issues(resolution);
    CREATE INDEX IF NOT EXISTS idx_cri_report     ON cr_issues(cr_report_id);
  `);

  // FTS5 Content-Sync Triggers — cr_issues → cr_issues_fts
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS cr_issues_ai AFTER INSERT ON cr_issues BEGIN
      INSERT INTO cr_issues_fts(rowid, summary, dimension, file_path, story_id)
      VALUES (new.id, new.summary, new.dimension, new.file_path, new.story_id);
    END;

    CREATE TRIGGER IF NOT EXISTS cr_issues_ad AFTER DELETE ON cr_issues BEGIN
      INSERT INTO cr_issues_fts(cr_issues_fts, rowid, summary, dimension, file_path, story_id)
      VALUES('delete', old.id, old.summary, old.dimension, old.file_path, old.story_id);
    END;

    CREATE TRIGGER IF NOT EXISTS cr_issues_au AFTER UPDATE ON cr_issues BEGIN
      INSERT INTO cr_issues_fts(cr_issues_fts, rowid, summary, dimension, file_path, story_id)
      VALUES('delete', old.id, old.summary, old.dimension, old.file_path, old.story_id);
      INSERT INTO cr_issues_fts(rowid, summary, dimension, file_path, story_id)
      VALUES (new.id, new.summary, new.dimension, new.file_path, new.story_id);
    END;
  `);

  // 4d. doc_index — 文檔目錄索引 (Layer B)
  db.exec(`
    CREATE TABLE IF NOT EXISTS doc_index (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type        TEXT NOT NULL,
      title           TEXT NOT NULL,
      path            TEXT NOT NULL UNIQUE,
      tags            TEXT,
      last_updated    TEXT,
      created_at      TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS doc_index_fts USING fts5(
      title, path, tags,
      content=doc_index,
      content_rowid=id,
      tokenize='trigram'
    );

    CREATE INDEX IF NOT EXISTS idx_doc_type ON doc_index(doc_type);
  `);

  // FTS5 Content-Sync Triggers — doc_index → doc_index_fts
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS doc_index_ai AFTER INSERT ON doc_index BEGIN
      INSERT INTO doc_index_fts(rowid, title, path, tags)
      VALUES (new.id, new.title, new.path, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS doc_index_ad AFTER DELETE ON doc_index BEGIN
      INSERT INTO doc_index_fts(doc_index_fts, rowid, title, path, tags)
      VALUES('delete', old.id, old.title, old.path, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS doc_index_au AFTER UPDATE ON doc_index BEGIN
      INSERT INTO doc_index_fts(doc_index_fts, rowid, title, path, tags)
      VALUES('delete', old.id, old.title, old.path, old.tags);
      INSERT INTO doc_index_fts(rowid, title, path, tags)
      VALUES (new.id, new.title, new.path, new.tags);
    END;
  `);

    // ──────────────────────────────────────────────
  // -- CMI-3: Conversation Memory Schema
  // -- conversation_sessions + conversation_turns (AC-1)
  // ──────────────────────────────────────────────

  // 5a. conversation_sessions — 對話元資料
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      session_id      TEXT PRIMARY KEY,   -- Claude Code session UUID
      project_path    TEXT,               -- 專案路徑
      started_at      TEXT NOT NULL,      -- ISO 8601
      ended_at        TEXT,               -- 對話結束時間
      end_reason      TEXT,               -- clear/logout/prompt_input_exit/other
      agent_id        TEXT,               -- CC-OPUS / CC-SONNET
      git_branch      TEXT,               -- 對話時的 git branch
      first_prompt    TEXT,               -- 使用者第一句話
      summary         TEXT,               -- Claude 自動生成摘要
      topics          TEXT,               -- JSON array: 討論主題標籤
      total_turns     INTEGER DEFAULT 0,  -- 輪次總數
      user_turns      INTEGER DEFAULT 0,  -- 使用者提問次數
      files_modified  TEXT,               -- JSON array: 修改的檔案
      stories_touched TEXT,               -- JSON array: 涉及的 Story ID
      transcript_path TEXT                -- JSONL 完整記錄路徑
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS conversation_sessions_fts USING fts5(
      first_prompt, summary, topics,
      content=conversation_sessions,
      content_rowid=rowid,
      tokenize='trigram'
    );

    CREATE INDEX IF NOT EXISTS idx_conv_sessions_started ON conversation_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_conv_sessions_topics  ON conversation_sessions(topics);
  `);

  // FTS5 Content-Sync Triggers — conversation_sessions → conversation_sessions_fts
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS conv_sessions_ai AFTER INSERT ON conversation_sessions BEGIN
      INSERT INTO conversation_sessions_fts(rowid, first_prompt, summary, topics)
      VALUES (new.rowid, new.first_prompt, new.summary, new.topics);
    END;

    CREATE TRIGGER IF NOT EXISTS conv_sessions_ad AFTER DELETE ON conversation_sessions BEGIN
      INSERT INTO conversation_sessions_fts(conversation_sessions_fts, rowid, first_prompt, summary, topics)
      VALUES('delete', old.rowid, old.first_prompt, old.summary, old.topics);
    END;

    CREATE TRIGGER IF NOT EXISTS conv_sessions_au AFTER UPDATE ON conversation_sessions BEGIN
      INSERT INTO conversation_sessions_fts(conversation_sessions_fts, rowid, first_prompt, summary, topics)
      VALUES('delete', old.rowid, old.first_prompt, old.summary, old.topics);
      INSERT INTO conversation_sessions_fts(rowid, first_prompt, summary, topics)
      VALUES (new.rowid, new.first_prompt, new.summary, new.topics);
    END;
  `);

  // 5b. conversation_turns — 問答配對
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT NOT NULL,       -- FK → conversation_sessions
      turn_index      INTEGER NOT NULL,    -- 第幾輪（從 0 開始）
      role            TEXT NOT NULL,       -- 'user' | 'assistant'
      content         TEXT NOT NULL,       -- 完整訊息內容（上限 10,000 字元）
      content_preview TEXT,               -- 前 300 字預覽
      timestamp       TEXT NOT NULL,       -- ISO 8601
      token_estimate  INTEGER,            -- 估算 token 數
      tools_used      TEXT,               -- JSON array: 工具名稱
      files_touched   TEXT                -- JSON array: 此輪次涉及的檔案
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS conversation_turns_fts USING fts5(
      content, content_preview,
      content=conversation_turns,
      content_rowid=id,
      tokenize='trigram'
    );

    CREATE INDEX IF NOT EXISTS idx_conv_turns_session   ON conversation_turns(session_id, turn_index);
    CREATE INDEX IF NOT EXISTS idx_conv_turns_role      ON conversation_turns(role);
    CREATE INDEX IF NOT EXISTS idx_conv_turns_timestamp ON conversation_turns(timestamp);
  `);

  // FTS5 Content-Sync Triggers — conversation_turns → conversation_turns_fts
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS conv_turns_ai AFTER INSERT ON conversation_turns BEGIN
      INSERT INTO conversation_turns_fts(rowid, content, content_preview)
      VALUES (new.id, new.content, new.content_preview);
    END;

    CREATE TRIGGER IF NOT EXISTS conv_turns_ad AFTER DELETE ON conversation_turns BEGIN
      INSERT INTO conversation_turns_fts(conversation_turns_fts, rowid, content, content_preview)
      VALUES('delete', old.id, old.content, old.content_preview);
    END;

    CREATE TRIGGER IF NOT EXISTS conv_turns_au AFTER UPDATE ON conversation_turns BEGIN
      INSERT INTO conversation_turns_fts(conversation_turns_fts, rowid, content, content_preview)
      VALUES('delete', old.id, old.content, old.content_preview);
      INSERT INTO conversation_turns_fts(rowid, content, content_preview)
      VALUES (new.id, new.content, new.content_preview);
    END;
  `);

  // ──────────────────────────────────────────────
  // -- CMI-5: Document Vectorization Schema
  // -- document_chunks + document_embeddings (AC-1)
  // ──────────────────────────────────────────────

  // 4a-ext. stories — 擴充欄位（冪等：先 PRAGMA table_info 確認再 ALTER）
  {
    const storiesColumns = db.prepare('PRAGMA table_info(stories)').all().map(r => r.name);
    const storyNewColumns = [
      // 既有擴充
      { name: 'dev_notes',            sql: 'ALTER TABLE stories ADD COLUMN dev_notes TEXT' },
      { name: 'required_skills',      sql: 'ALTER TABLE stories ADD COLUMN required_skills TEXT' },
      // --- Schema 擴充 v2: 開發追蹤欄位 ---
      { name: 'implementation_approach', sql: 'ALTER TABLE stories ADD COLUMN implementation_approach TEXT' },
      { name: 'risk_assessment',      sql: 'ALTER TABLE stories ADD COLUMN risk_assessment TEXT' },
      { name: 'testing_strategy',     sql: 'ALTER TABLE stories ADD COLUMN testing_strategy TEXT' },
      { name: 'rollback_plan',        sql: 'ALTER TABLE stories ADD COLUMN rollback_plan TEXT' },
      { name: 'monitoring_plan',      sql: 'ALTER TABLE stories ADD COLUMN monitoring_plan TEXT' },
      { name: 'definition_of_done',   sql: 'ALTER TABLE stories ADD COLUMN definition_of_done TEXT' },
      // --- Schema 擴充 v2: CR 統計欄位 ---
      { name: 'cr_issues_total',      sql: 'ALTER TABLE stories ADD COLUMN cr_issues_total INTEGER DEFAULT 0' },
      { name: 'cr_issues_fixed',      sql: 'ALTER TABLE stories ADD COLUMN cr_issues_fixed INTEGER DEFAULT 0' },
      { name: 'cr_issues_deferred',   sql: 'ALTER TABLE stories ADD COLUMN cr_issues_deferred INTEGER DEFAULT 0' },
      { name: 'cr_summary',           sql: 'ALTER TABLE stories ADD COLUMN cr_summary TEXT' },
      // --- Schema 擴充 v2: 執行紀錄欄位 ---
      { name: 'started_at',           sql: 'ALTER TABLE stories ADD COLUMN started_at TEXT' },
      { name: 'completed_at',         sql: 'ALTER TABLE stories ADD COLUMN completed_at TEXT' },
      { name: 'review_completed_at',  sql: 'ALTER TABLE stories ADD COLUMN review_completed_at TEXT' },
      { name: 'execution_log',        sql: 'ALTER TABLE stories ADD COLUMN execution_log TEXT' },
      // --- Schema 擴充 v2.1: SDD Spec 關聯 ---
      { name: 'sdd_spec',              sql: 'ALTER TABLE stories ADD COLUMN sdd_spec TEXT' },
      // --- Schema 擴充 v2.2: Create 階段資訊 ---
      { name: 'create_agent',          sql: 'ALTER TABLE stories ADD COLUMN create_agent TEXT' },
      { name: 'create_started_at',     sql: 'ALTER TABLE stories ADD COLUMN create_started_at TEXT' },
      { name: 'create_completed_at',   sql: 'ALTER TABLE stories ADD COLUMN create_completed_at TEXT' },
      // --- Schema 擴充 v2.3: party-to-pipeline v4.0.0 主線/副線分流 ---
      // task_track: 'main' = PhyCool SaaS business code | 'side' = toolkit/env/workflow upgrade
      { name: 'task_track',            sql: "ALTER TABLE stories ADD COLUMN task_track TEXT DEFAULT 'main'" },
    ];
    for (const col of storyNewColumns) {
      if (!storiesColumns.includes(col.name)) {
        db.exec(col.sql);
      }
    }
  }

  // ──────────────────────────────────────────────
  // -- 4e. tech_debt_items — 技術債統一儲存表（取代 registry.yaml + .debt.md）
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tech_debt_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id         TEXT UNIQUE NOT NULL,
      story_id        TEXT NOT NULL,
      category        TEXT NOT NULL DEFAULT 'deferred',
      severity        TEXT NOT NULL DEFAULT 'medium',
      dimension       TEXT,
      title           TEXT NOT NULL,
      description     TEXT,
      affected_files  TEXT,
      fix_guidance    TEXT,
      root_cause      TEXT,
      target_story    TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      wont_fix_reason TEXT,
      source_review_date TEXT,
      created_at      TEXT NOT NULL,
      resolved_at     TEXT,
      resolved_by     TEXT,
      resolved_in_story TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_debt_story    ON tech_debt_items(story_id);
    CREATE INDEX IF NOT EXISTS idx_debt_target   ON tech_debt_items(target_story);
    CREATE INDEX IF NOT EXISTS idx_debt_status   ON tech_debt_items(status);
    CREATE INDEX IF NOT EXISTS idx_debt_severity ON tech_debt_items(severity);

    CREATE VIRTUAL TABLE IF NOT EXISTS tech_debt_fts USING fts5(
      title, description, fix_guidance, root_cause,
      content=tech_debt_items,
      content_rowid=id,
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers — tech_debt_items → tech_debt_fts
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS debt_ai AFTER INSERT ON tech_debt_items BEGIN
      INSERT INTO tech_debt_fts(rowid, title, description, fix_guidance, root_cause)
      VALUES (new.id, new.title, new.description, new.fix_guidance, new.root_cause);
    END;

    CREATE TRIGGER IF NOT EXISTS debt_ad AFTER DELETE ON tech_debt_items BEGIN
      INSERT INTO tech_debt_fts(tech_debt_fts, rowid, title, description, fix_guidance, root_cause)
      VALUES('delete', old.id, old.title, old.description, old.fix_guidance, old.root_cause);
    END;

    CREATE TRIGGER IF NOT EXISTS debt_au AFTER UPDATE ON tech_debt_items BEGIN
      INSERT INTO tech_debt_fts(tech_debt_fts, rowid, title, description, fix_guidance, root_cause)
      VALUES('delete', old.id, old.title, old.description, old.fix_guidance, old.root_cause);
      INSERT INTO tech_debt_fts(rowid, title, description, fix_guidance, root_cause)
      VALUES (new.id, new.title, new.description, new.fix_guidance, new.root_cause);
    END;
  `);

  // 4f. tech_debt_items — v3.0 Schema 擴充 (11 新欄位 + 2 indexes, 冪等)
  {
    const debtColumns = db.prepare('PRAGMA table_info(tech_debt_items)').all().map(r => r.name);
    const v3Columns = [
      { name: 'priority_score',      sql: 'ALTER TABLE tech_debt_items ADD COLUMN priority_score REAL' },
      { name: 'blast_radius',        sql: 'ALTER TABLE tech_debt_items ADD COLUMN blast_radius TEXT' },
      { name: 'business_impact',     sql: 'ALTER TABLE tech_debt_items ADD COLUMN business_impact TEXT' },
      { name: 'fix_cost',            sql: 'ALTER TABLE tech_debt_items ADD COLUMN fix_cost TEXT' },
      { name: 'related_skills',      sql: 'ALTER TABLE tech_debt_items ADD COLUMN related_skills TEXT' },
      { name: 'platform_modules',    sql: 'ALTER TABLE tech_debt_items ADD COLUMN platform_modules TEXT' },
      { name: 'review_date',         sql: 'ALTER TABLE tech_debt_items ADD COLUMN review_date TEXT' },
      { name: 'accepted_reason',     sql: 'ALTER TABLE tech_debt_items ADD COLUMN accepted_reason TEXT' },
      { name: 'boy_scout_fixed',     sql: 'ALTER TABLE tech_debt_items ADD COLUMN boy_scout_fixed INTEGER DEFAULT 0' },
      { name: 'quick_fix_candidate', sql: 'ALTER TABLE tech_debt_items ADD COLUMN quick_fix_candidate INTEGER DEFAULT 0' },
      { name: 'stale_reason',        sql: 'ALTER TABLE tech_debt_items ADD COLUMN stale_reason TEXT' },
    ];
    for (const col of v3Columns) {
      if (!debtColumns.includes(col.name)) {
        db.exec(col.sql);
      }
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_debt_stale ON tech_debt_items(stale_reason)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_debt_category_v3 ON tech_debt_items(category)');
  }

  // 5c. doc_index — 擴充 6 個新欄位（冪等：先 PRAGMA table_info 確認再 ALTER）
  {
    const docIndexColumns = db.prepare('PRAGMA table_info(doc_index)').all().map(r => r.name);
    const newColumns = [
      { name: 'category',       sql: 'ALTER TABLE doc_index ADD COLUMN category TEXT' },
      { name: 'epic_id',        sql: 'ALTER TABLE doc_index ADD COLUMN epic_id TEXT' },
      { name: 'checksum',       sql: 'ALTER TABLE doc_index ADD COLUMN checksum TEXT' },
      { name: 'chunk_count',    sql: 'ALTER TABLE doc_index ADD COLUMN chunk_count INTEGER DEFAULT 0' },
      { name: 'total_tokens',   sql: 'ALTER TABLE doc_index ADD COLUMN total_tokens INTEGER DEFAULT 0' },
      { name: 'chunk_strategy', sql: "ALTER TABLE doc_index ADD COLUMN chunk_strategy TEXT DEFAULT 'h2'" },
    ];
    for (const col of newColumns) {
      if (!docIndexColumns.includes(col.name)) {
        db.exec(col.sql);
      }
    }
  }

  // 5d. document_chunks — 文檔內容分塊表
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id        INTEGER NOT NULL,
      chunk_index   INTEGER NOT NULL,
      heading_path  TEXT NOT NULL,
      content       TEXT NOT NULL,
      token_count   INTEGER NOT NULL,
      checksum      TEXT NOT NULL,
      is_stale      INTEGER DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT,
      UNIQUE(doc_id, chunk_index),
      FOREIGN KEY (doc_id) REFERENCES doc_index(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
      heading_path, content,
      content=document_chunks,
      content_rowid=id,
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers — document_chunks → document_chunks_fts (3 個)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS doc_chunks_ai AFTER INSERT ON document_chunks BEGIN
      INSERT INTO document_chunks_fts(rowid, heading_path, content)
      VALUES (new.id, new.heading_path, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS doc_chunks_ad AFTER DELETE ON document_chunks BEGIN
      INSERT INTO document_chunks_fts(document_chunks_fts, rowid, heading_path, content)
      VALUES('delete', old.id, old.heading_path, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS doc_chunks_au AFTER UPDATE ON document_chunks BEGIN
      INSERT INTO document_chunks_fts(document_chunks_fts, rowid, heading_path, content)
      VALUES('delete', old.id, old.heading_path, old.content);
      INSERT INTO document_chunks_fts(rowid, heading_path, content)
      VALUES (new.id, new.heading_path, new.content);
    END;
  `);

  // 5e. document_embeddings — 向量嵌入儲存表
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_embeddings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      chunk_id      INTEGER NOT NULL UNIQUE,
      embedding     BLOB NOT NULL,
      model         TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      token_count   INTEGER,
      batch_id      TEXT,
      generated_at  TEXT NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc    ON document_chunks(doc_id);
    CREATE INDEX IF NOT EXISTS idx_doc_chunks_stale  ON document_chunks(is_stale);
    CREATE INDEX IF NOT EXISTS idx_doc_embed_chunk   ON document_embeddings(chunk_id);
    CREATE INDEX IF NOT EXISTS idx_doc_embed_batch   ON document_embeddings(batch_id);
  `);

  // ──────────────────────────────────────────────
  // -- CMI-10: 全表向量化 — 5 張核心表 Embedding 儲存
  // ──────────────────────────────────────────────

  // 6a. context_embeddings — context_entries 向量嵌入
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_embeddings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id      INTEGER NOT NULL UNIQUE,
      embedding     BLOB NOT NULL,
      model         TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      token_count   INTEGER,
      generated_at  TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES context_entries(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ctx_emb_entry ON context_embeddings(entry_id);
  `);

  // 6b. tech_embeddings — tech_entries 向量嵌入
  db.exec(`
    CREATE TABLE IF NOT EXISTS tech_embeddings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id      INTEGER NOT NULL UNIQUE,
      embedding     BLOB NOT NULL,
      model         TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      token_count   INTEGER,
      generated_at  TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES tech_entries(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tech_emb_entry ON tech_embeddings(entry_id);
  `);

  // 6c. stories_embeddings — stories 向量嵌入（stories 為 TEXT PK，FK 用 story_id）
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories_embeddings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id      TEXT NOT NULL UNIQUE,
      embedding     BLOB NOT NULL,
      model         TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      token_count   INTEGER,
      generated_at  TEXT NOT NULL,
      FOREIGN KEY (story_id) REFERENCES stories(story_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_story_emb_id ON stories_embeddings(story_id);
  `);

  // 6d. conversation_embeddings — conversation_sessions 向量嵌入（TEXT PK，FK 用 session_id）
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_embeddings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT NOT NULL UNIQUE,
      embedding     BLOB NOT NULL,
      model         TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      token_count   INTEGER,
      generated_at  TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES conversation_sessions(session_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_conv_emb_id ON conversation_embeddings(session_id);
  `);

  // 6e. debt_embeddings — tech_debt_items 向量嵌入
  db.exec(`
    CREATE TABLE IF NOT EXISTS debt_embeddings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id       INTEGER NOT NULL UNIQUE,
      embedding     BLOB NOT NULL,
      model         TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      token_count   INTEGER,
      generated_at  TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES tech_debt_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_debt_emb_item ON debt_embeddings(item_id);
  `);

  // ──────────────────────────────────────────────
  // Phase 5: Extended Tables
  // ──────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS glossary (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name  TEXT NOT NULL UNIQUE,
      aliases         TEXT,
      domain          TEXT NOT NULL,
      description     TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_glossary_domain ON glossary(domain);

    CREATE VIRTUAL TABLE IF NOT EXISTS glossary_fts USING fts5(
      canonical_name, aliases, description,
      content=glossary, content_rowid=id, tokenize='trigram'
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_type         TEXT NOT NULL,
      story_id              TEXT,
      agent_id              TEXT,
      status                TEXT NOT NULL DEFAULT 'running',
      started_at            TEXT NOT NULL,
      completed_at          TEXT,
      input_tokens          INTEGER DEFAULT 0,
      output_tokens         INTEGER DEFAULT 0,
      cache_read_tokens     INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cost_usd              REAL DEFAULT 0.0,
      model                 TEXT,
      duration_ms           INTEGER,
      error_message         TEXT,
      metadata              TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_wf_type ON workflow_executions(workflow_type);
    CREATE INDEX IF NOT EXISTS idx_wf_story ON workflow_executions(story_id);
    CREATE INDEX IF NOT EXISTS idx_wf_status ON workflow_executions(status);
  `);

  // Migration: 對已存在的 DB 新增 wfq-05 欄位（SQLite 不支援 ADD COLUMN IF NOT EXISTS）
  const wfqMigrations = [
    { col: 'cache_read_tokens',     ddl: 'ALTER TABLE workflow_executions ADD COLUMN cache_read_tokens INTEGER DEFAULT 0' },
    { col: 'cache_creation_tokens', ddl: 'ALTER TABLE workflow_executions ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0' },
    { col: 'cost_usd',              ddl: 'ALTER TABLE workflow_executions ADD COLUMN cost_usd REAL DEFAULT 0.0' },
    { col: 'model',                 ddl: 'ALTER TABLE workflow_executions ADD COLUMN model TEXT' },
    // party-to-pipeline v4.0.0 ACK handshake: full evidence JSON from stop-report.ps1
    { col: 'evidence_json',         ddl: 'ALTER TABLE workflow_executions ADD COLUMN evidence_json TEXT' },
  ];
  for (const { ddl } of wfqMigrations) {
    try { db.exec(ddl); } catch (_) { /* 欄位已存在，忽略 */ }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS benchmarks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name     TEXT NOT NULL,
      context         TEXT NOT NULL DEFAULT 'global',
      baseline_value  REAL,
      current_value   REAL NOT NULL,
      unit            TEXT NOT NULL,
      measured_at     TEXT NOT NULL,
      notes           TEXT,
      UNIQUE(metric_name, context)
    );
    CREATE INDEX IF NOT EXISTS idx_bench_metric ON benchmarks(metric_name);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS test_journeys (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL UNIQUE,
      description     TEXT,
      route_sequence  TEXT,
      priority        TEXT DEFAULT 'normal',
      status          TEXT DEFAULT 'active',
      last_run_at     TEXT,
      last_result     TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tj_status ON test_journeys(status);
    CREATE INDEX IF NOT EXISTS idx_tj_priority ON test_journeys(priority);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS test_traceability (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      ac_id           TEXT NOT NULL,
      story_id        TEXT NOT NULL,
      test_file       TEXT NOT NULL,
      test_name       TEXT NOT NULL,
      test_type       TEXT DEFAULT 'unit',
      status          TEXT DEFAULT 'pending',
      linked_at       TEXT NOT NULL,
      verified_at     TEXT,
      UNIQUE(ac_id, test_file, test_name)
    );
    CREATE INDEX IF NOT EXISTS idx_trace_story ON test_traceability(story_id);
    CREATE INDEX IF NOT EXISTS idx_trace_status ON test_traceability(status);
    CREATE INDEX IF NOT EXISTS idx_trace_ac ON test_traceability(ac_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_checkpoints (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id           TEXT NOT NULL UNIQUE,
      orchestrator_session  TEXT,
      pipeline_type         TEXT NOT NULL,
      total_steps           INTEGER DEFAULT 0,
      current_step          INTEGER DEFAULT 0,
      status                TEXT NOT NULL DEFAULT 'running',
      steps_json            TEXT,
      orchestrator_reasoning TEXT,
      sub_windows           TEXT,
      error_context         TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_status ON pipeline_checkpoints(status);
    CREATE INDEX IF NOT EXISTS idx_pipeline_type ON pipeline_checkpoints(pipeline_type);
  `);

  // ──────────────────────────────────────────────
  // -- DLA-07: intentional_decisions — IDD 主表 + FTS5 + sync triggers
  // -- Framework v1.3: 管理「故意不修」決策 (IDD-COM/STR/REG/USR)
  // -- 與 tech_debt_items 互斥（不入 tech_debt_items）
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS intentional_decisions (
      idd_id TEXT PRIMARY KEY,
      idd_type TEXT NOT NULL CHECK(idd_type IN ('COM','STR','REG','USR')),
      title TEXT NOT NULL,
      context TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      code_locations TEXT,
      adr_path TEXT NOT NULL,
      memory_file_path TEXT,
      signoff_by TEXT NOT NULL,
      signoff_date TEXT NOT NULL,
      re_evaluation_trigger TEXT,
      re_evaluation_date TEXT,
      forbidden_changes TEXT,
      criticality TEXT DEFAULT 'normal' CHECK(criticality IN ('critical','normal','low')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','retired','superseded')),
      superseded_by TEXT,
      related_skills TEXT,
      related_docs TEXT,
      platform_modules TEXT,
      related_files TEXT,
      tags TEXT,
      last_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(superseded_by) REFERENCES intentional_decisions(idd_id)
    );

    CREATE INDEX IF NOT EXISTS idx_idd_type ON intentional_decisions(idd_type);
    CREATE INDEX IF NOT EXISTS idx_idd_status ON intentional_decisions(status);
    CREATE INDEX IF NOT EXISTS idx_idd_criticality ON intentional_decisions(criticality);

    CREATE VIRTUAL TABLE IF NOT EXISTS intentional_decisions_fts USING fts5(
      idd_id, title, context, decision, reason, forbidden_changes, tags,
      content='intentional_decisions',
      content_rowid='rowid',
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers — intentional_decisions → intentional_decisions_fts (3 個)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS idd_fts_insert AFTER INSERT ON intentional_decisions BEGIN
      INSERT INTO intentional_decisions_fts(rowid, idd_id, title, context, decision, reason, forbidden_changes, tags)
      VALUES (new.rowid, new.idd_id, new.title, new.context, new.decision, new.reason, new.forbidden_changes, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS idd_fts_update AFTER UPDATE ON intentional_decisions BEGIN
      INSERT INTO intentional_decisions_fts(intentional_decisions_fts, rowid, idd_id, title, context, decision, reason, forbidden_changes, tags)
      VALUES('delete', old.rowid, old.idd_id, old.title, old.context, old.decision, old.reason, old.forbidden_changes, old.tags);
      INSERT INTO intentional_decisions_fts(rowid, idd_id, title, context, decision, reason, forbidden_changes, tags)
      VALUES (new.rowid, new.idd_id, new.title, new.context, new.decision, new.reason, new.forbidden_changes, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS idd_fts_delete AFTER DELETE ON intentional_decisions BEGIN
      INSERT INTO intentional_decisions_fts(intentional_decisions_fts, rowid, idd_id, title, context, decision, reason, forbidden_changes, tags)
      VALUES('delete', old.rowid, old.idd_id, old.title, old.context, old.decision, old.reason, old.forbidden_changes, old.tags);
    END;
  `);

  // Sync IDD 插入到 context_entries (category='intentional')
  // 讓 Hook Layer 4 (decisions query) 自動感知 IDD，無需修改既有查詢邏輯
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS sync_idd_insert_to_context AFTER INSERT ON intentional_decisions BEGIN
      INSERT INTO context_entries (
        agent_id, timestamp, category, title, content, tags, related_files,
        story_id, epic_id
      ) VALUES (
        'CC-OPUS',
        NEW.created_at,
        'intentional',
        NEW.idd_id || ' ' || NEW.title,
        '[' || NEW.idd_id || '/' || NEW.idd_type || '] '
          || NEW.decision || char(10) || char(10)
          || 'Reason: ' || NEW.reason || char(10) || char(10)
          || 'Forbidden: ' || COALESCE(NEW.forbidden_changes, '[]') || char(10)
          || 'ADR: ' || NEW.adr_path,
        COALESCE(NEW.tags, '[]'),
        COALESCE(NEW.related_files, '[]'),
        NULL, NULL
      );
    END;
  `);

  // ──────────────────────────────────────────────
  // Phase 邊界驗證（Phase 3+ 否定測試）
  // ──────────────────────────────────────────────
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(r => r.name);

  const violations = PHASE3_PLUS_TABLES.filter(t => tables.includes(t));
  if (violations.length > 0) {
    db.close();
    throw new Error(
      `[Phase Boundary Violation] Phase 2+ tables detected: ${violations.join(', ')}`
    );
  }

  // ──────────────────────────────────────────────
  // Epic-ECC-V2 α-path: L2 Atomic Instincts (ecc-07 · 2026-05-24)
  // ──────────────────────────────────────────────
  // adapt-from-source: ECC homunculus instinct schema (id/trigger/confidence/domain/source/
  //   action/evidence · everything-claude-code-instincts.yaml) → PhyCool SQLite.
  // 適配 (tianji L3): scope 4-value (CEO §8.1) + verifier_status + decay_at + UNIQUE(trigger,scope)。
  // Idempotent. Migration trace: migrations/2026-05-24-add-ecc-instincts-tables.sql.
  db.exec(`
    CREATE TABLE IF NOT EXISTS instincts (
      id                TEXT PRIMARY KEY,
      trigger           TEXT NOT NULL,
      action            TEXT NOT NULL,
      confidence        REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
      scope             TEXT NOT NULL CHECK (scope IN ('session','pipeline-session','project','global')),
      domain            TEXT,
      source            TEXT,
      source_session_id TEXT,
      evidence_jsonb    TEXT,
      verifier_status   TEXT CHECK (verifier_status IN ('approved','rejected','needs-more-evidence')),
      verifier_reason   TEXT,
      created_at        TEXT NOT NULL,
      last_seen         TEXT NOT NULL,
      decay_at          TEXT,
      CONSTRAINT unique_trigger_scope UNIQUE (trigger, scope)
    );
    CREATE INDEX IF NOT EXISTS idx_instincts_scope_conf ON instincts (scope, confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_instincts_last_seen ON instincts (last_seen DESC);
    CREATE INDEX IF NOT EXISTS idx_instincts_domain ON instincts (domain);

    CREATE TABLE IF NOT EXISTS observations_queue (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT NOT NULL,
      tool_name     TEXT NOT NULL,
      file_path     TEXT,
      pattern_type  TEXT NOT NULL,
      context_jsonb TEXT NOT NULL,
      processed     INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_observations_processed ON observations_queue (processed, created_at);

    CREATE TABLE IF NOT EXISTS instincts_rejected (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger        TEXT NOT NULL,
      action         TEXT NOT NULL,
      reject_reason  TEXT NOT NULL,
      evidence_jsonb TEXT,
      rejected_at    TEXT NOT NULL
    );
  `);
  console.log('   Epic-ECC-V2 α tables: instincts, observations_queue, instincts_rejected (+ 4 indexes)');

  // ──────────────────────────────────────────────
  // Epic-ECC-V2 D5: Adoption-Score Model (2026-05-25 · ADR-ECC-LEARNING-001 v1.4.0)
  // ──────────────────────────────────────────────
  // 多視窗跨視窗採納控制 (僅軌道 α 動態湧現)。冪等: 先 PRAGMA table_info 確認再 ALTER。
  // Migration trace: migrations/2026-05-25-add-ecc-adoption-score-model.sql.
  {
    const instinctCols = db.prepare('PRAGMA table_info(instincts)').all().map(r => r.name);
    const instinctNewCols = [
      // project_type 三軌: pcpt-business(主線) / env-tooling(副線環境工具) / workflow(工作流文檔)
      { name: 'project_type',   sql: "ALTER TABLE instincts ADD COLUMN project_type TEXT CHECK (project_type IN ('pcpt-business','env-tooling','workflow'))" },
      // business: domain 粗粒度上卷 (1 business : N domain)
      { name: 'business',       sql: 'ALTER TABLE instincts ADD COLUMN business TEXT' },
      // adoption_score 0~5: 0=僅原 session 不跨視窗 / 3=同 project_type / 4-5=全視窗普世
      { name: 'adoption_score', sql: 'ALTER TABLE instincts ADD COLUMN adoption_score INTEGER NOT NULL DEFAULT 3 CHECK (adoption_score BETWEEN 0 AND 5)' },
    ];
    for (const col of instinctNewCols) {
      if (!instinctCols.includes(col.name)) db.exec(col.sql);
    }
    const obsCols = db.prepare('PRAGMA table_info(observations_queue)').all().map(r => r.name);
    if (!obsCols.includes('project_type')) {
      db.exec("ALTER TABLE observations_queue ADD COLUMN project_type TEXT CHECK (project_type IN ('pcpt-business','env-tooling','workflow'))");
    }
    // Layer 12 注入過濾索引: verifier_status + adoption_score + project_type
    db.exec('CREATE INDEX IF NOT EXISTS idx_instincts_adoption ON instincts (verifier_status, adoption_score DESC, project_type)');
  }
  console.log('   Epic-ECC-V2 D5: instincts +3 cols (project_type/business/adoption_score) + observations_queue +project_type (idempotent)');

  // ──────────────────────────────────────────────
  // Epic-ECC-V2 UI (ecc-emergence-ui-core 2026-05-28)
  // instincts +3 UI cols + instincts_rejected +2 cols (additive, idempotent)
  // ──────────────────────────────────────────────
  {
    const instinctColsUi = db.prepare('PRAGMA table_info(instincts)').all().map(r => r.name);
    const instinctUiCols = [
      { name: 'description_zh',   sql: 'ALTER TABLE instincts ADD COLUMN description_zh TEXT' },
      { name: 'user_note',        sql: 'ALTER TABLE instincts ADD COLUMN user_note TEXT' },
      { name: 'user_star_rating', sql: "ALTER TABLE instincts ADD COLUMN user_star_rating INTEGER CHECK(user_star_rating BETWEEN 1 AND 10)" },
    ];
    for (const col of instinctUiCols) {
      if (!instinctColsUi.includes(col.name)) db.exec(col.sql);
    }
    const rejColsUi = db.prepare('PRAGMA table_info(instincts_rejected)').all().map(r => r.name);
    const rejUiCols = [
      { name: 'reject_count', sql: 'ALTER TABLE instincts_rejected ADD COLUMN reject_count INTEGER NOT NULL DEFAULT 1' },
      { name: 'norm_key',     sql: 'ALTER TABLE instincts_rejected ADD COLUMN norm_key TEXT' },
    ];
    for (const col of rejUiCols) {
      if (!rejColsUi.includes(col.name)) db.exec(col.sql);
    }
  }
  console.log('   Epic-ECC-V2 UI: instincts +3 cols (description_zh/user_note/user_star_rating) + instincts_rejected +2 cols (reject_count/norm_key) (idempotent)');

  // ──────────────────────────────────────────────
  // Epic-ECC-V2 UI v2 (ecc-emergence-ui-v2 2026-05-28)
  // instincts_rejected +restored_at / generated_skills NEW / effect_metrics NEW
  // Verified PRAGMA 2026-05-28: instincts_rejected.restored_at = TEXT / generated_skills 7 cols / effect_metrics 7 cols
  // ──────────────────────────────────────────────
  {
    // 1. instincts_rejected +restored_at (idempotent)
    const rejColsV2 = db.prepare('PRAGMA table_info(instincts_rejected)').all().map(r => r.name);
    if (!rejColsV2.includes('restored_at')) {
      db.exec('ALTER TABLE instincts_rejected ADD COLUMN restored_at TEXT');
    }

    // 2. generated_skills (new table)
    db.exec(`CREATE TABLE IF NOT EXISTS generated_skills (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      instinct_cluster_id TEXT NOT NULL,
      skill_path          TEXT NOT NULL UNIQUE,
      status              TEXT NOT NULL CHECK(status IN('active','paused','deleted')) DEFAULT 'active',
      generated_at        TEXT NOT NULL,
      paused_at           TEXT,
      deleted_at          TEXT
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_generated_skills_status ON generated_skills (status)');

    // 3. effect_metrics (new table)
    db.exec(`CREATE TABLE IF NOT EXISTS effect_metrics (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id            INTEGER NOT NULL REFERENCES generated_skills(id),
      before_freq         INTEGER NOT NULL,
      after_freq          INTEGER NOT NULL,
      improvement_pct     REAL NOT NULL,
      measured_at         TEXT NOT NULL,
      sample_window_days  INTEGER NOT NULL DEFAULT 7
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_effect_metrics_skill_measured ON effect_metrics (skill_id, measured_at DESC)');
  }
  console.log('   Epic-ECC-V2 UI v2: instincts_rejected +restored_at + generated_skills (7 cols) + effect_metrics (7 cols) (idempotent)');

  // ──────────────────────────────────────────────
  // Tianji-Pavilion schema integration (2026-05-18)
  // ──────────────────────────────────────────────
  // Idempotent (CREATE TABLE IF NOT EXISTS). Source: tianji-pavilion Skill.
  // Tables: baseline_snapshots (25 cols) + external_evaluations (35 cols, v1.3.0
  // GitNexus blast-radius cols included) + 7 indexes.
  // ESM-compatible: db-patch script is CommonJS, use createRequire bridge.
  // Safe to skip if Skill not installed — try/catch keeps init-db.js standalone.
  try {
    const { createRequire } = await import('module');
    const requireCJS = createRequire(import.meta.url);
    const tianjiPatch = requireCJS(
      path.resolve(__dirname, '..', '..',
        '.claude', 'skills', 'tianji-pavilion', 'scripts', 'db-patch-init-db.js')
    );
    tianjiPatch.applyTianjiSchema(db);
    console.log('   Tianji-Pavilion tables: baseline_snapshots, external_evaluations (+ 7 indexes)');
  } catch (err) {
    console.warn(`   [tianji-patch] skipped: ${err.message}`);
  }

  // ──────────────────────────────────────────────
  // Epic-WHP worker protocol registry (whp-3-db-schema-registry 2026-07-27)
  // 四表(worker_runs/worker_messages/worker_handoffs/guardian_heartbeat)+ 8 indexes。
  // DDL 逐字取自 SSoT §23(雙向握手協議機制.md,gitignored)。純資料層,零行為變更 —— 不改任何既有表 / 執行路徑。
  // Verified PRAGMA 2026-07-27(isolated temp DB,18/18 assertions): worker_runs=39 cols /
  // worker_messages=12 / worker_handoffs=13 / guardian_heartbeat=10。
  // 兩個刻意設計(勿「順手改良」— 詳 SDD Spec §3.3):
  //   ① 不建 lifecycle 的 partial UNIQUE index(live tracker.json 已有同 story+phase 兩筆 running 並存,
  //      該約束當場建不起來且會永久擋重派;唯一性只在 (story_id,phase,attempt))。
  //   ② ix_worker_runs_pending_ack 是全庫第一個 partial index(non-unique,WHERE ack_at IS NULL,
  //      不影響既有資料,只窄化守護每 30 秒的熱查詢範圍)。
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_runs (
      run_id              TEXT PRIMARY KEY,
      session_id          TEXT NOT NULL,
      resumed_from_run_id TEXT,
      story_id            TEXT NOT NULL,
      phase               TEXT NOT NULL,
      attempt             INTEGER NOT NULL DEFAULT 1,
      controller_track    TEXT NOT NULL DEFAULT 'unspecified',
      run_mode            TEXT NOT NULL DEFAULT 'window',
      wrapper_pid         INTEGER,
      claude_pid          INTEGER,
      cmd_line            TEXT,
      window_title        TEXT,
      ipc_dir             TEXT NOT NULL,
      model_id            TEXT,
      effort              TEXT,
      work_root           TEXT,
      baseline_commit     TEXT,
      lifecycle           TEXT NOT NULL DEFAULT 'dispatching',
      close_source        TEXT,
      last_status         TEXT,
      evidence_incomplete INTEGER NOT NULL DEFAULT 0,
      turn_count          INTEGER NOT NULL DEFAULT 0,
      files_modified      TEXT,
      health_flag         TEXT,
      stall_rounds        INTEGER NOT NULL DEFAULT 0,
      reported_at         TEXT,
      ack_at              TEXT,
      ack_by              TEXT,
      notify_count        INTEGER NOT NULL DEFAULT 0,
      last_notified_at    TEXT,
      window_vanished_at  TEXT,
      abandoned_at_stage  TEXT,
      requires_attention  INTEGER NOT NULL DEFAULT 0,
      guardian_exit_reason TEXT,
      started_at          TEXT NOT NULL,
      last_turn_at        TEXT,
      closed_at           TEXT,
      closed_detected_at  TEXT,
      updated_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worker_messages (
      msg_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id        TEXT NOT NULL,
      seq           INTEGER NOT NULL,
      direction     TEXT NOT NULL,
      msg_type      TEXT NOT NULL,
      body          TEXT NOT NULL,
      author        TEXT NOT NULL,
      state         TEXT NOT NULL DEFAULT 'pending',
      delivered_via TEXT,
      created_at    TEXT NOT NULL,
      delivered_at  TEXT,
      consumed_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS worker_handoffs (
      run_id          TEXT PRIMARY KEY,
      story_id        TEXT NOT NULL,
      phase           TEXT NOT NULL,
      evidence_json   TEXT,
      deliverables    TEXT,
      gate_result     TEXT NOT NULL DEFAULT 'pending',
      gate_by         TEXT,
      gate_notes      TEXT,
      override_reason TEXT,
      gate_at         TEXT,
      next_phase      TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guardian_heartbeat (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      guardian_pid   INTEGER,
      host           TEXT,
      started_at     TEXT,
      last_beat_at   TEXT,
      fast_tick_sec  INTEGER NOT NULL DEFAULT 30,
      slow_tick_sec  INTEGER NOT NULL DEFAULT 600,
      watched_runs   INTEGER NOT NULL DEFAULT 0,
      last_error     TEXT,
      updated_at     TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_worker_runs_key       ON worker_runs(story_id, phase, attempt);
    CREATE INDEX        IF NOT EXISTS ix_worker_runs_lifecycle ON worker_runs(lifecycle, updated_at);
    CREATE INDEX        IF NOT EXISTS ix_worker_runs_track     ON worker_runs(controller_track, started_at);
    CREATE INDEX        IF NOT EXISTS ix_worker_runs_session   ON worker_runs(session_id);
    CREATE INDEX        IF NOT EXISTS ix_worker_runs_pending_ack
      ON worker_runs(lifecycle, reported_at) WHERE ack_at IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_worker_messages_run_seq ON worker_messages(run_id, seq);
    CREATE INDEX        IF NOT EXISTS ix_worker_messages_pending ON worker_messages(run_id, direction, state);

    CREATE INDEX IF NOT EXISTS ix_worker_handoffs_gate ON worker_handoffs(gate_result, updated_at);
  `);
  console.log('   Epic-WHP worker protocol: worker_runs (39 cols), worker_messages, worker_handoffs, guardian_heartbeat (+ 8 indexes)');

  // ──────────────────────────────────────────────
  // worker_messages -- D2 knock idempotency marker (whp-11-d2-inline-revise 2026-08-02, BR-008/BR-010)
  // 12→13 cols. Orthogonal nullable column, not a new state value: read-worker-directives.js's
  // selection (`state='pending'`) stays untouched, so the knock loop-bound is just an extra
  // `AND knocked_at IS NULL` predicate -- see dev_notes "設計要點：為什麼是新增欄位而不是新增 state 值".
  // ──────────────────────────────────────────────
  {
    const workerMessagesColumns = db.prepare('PRAGMA table_info(worker_messages)').all().map(r => r.name);
    const workerMessagesNewColumns = [
      { name: 'knocked_at', sql: 'ALTER TABLE worker_messages ADD COLUMN knocked_at TEXT' },
    ];
    for (const col of workerMessagesNewColumns) {
      if (!workerMessagesColumns.includes(col.name)) {
        db.exec(col.sql);
      }
    }
  }

  // ──────────────────────────────────────────────
  // Epic-CCB 聊天室資料層(ccb-1-db-mcp-import 2026-07-28)
  // ctrl_ 四表(ctrl_threads/ctrl_messages/ctrl_message_reads/ctrl_boards)+ 6 索引 + FTS5(trigram)。
  // DDL 逐字取自 SDD Spec §3(docs/implementation-artifacts/specs/epic-ccb/ccb-1-db-mcp-import-spec.md)。
  // 純資料層,零行為變更 —— 不改任何既有表 / 執行路徑,不觸碰 worker_* 四表(通道獨立,00 §一 定錨)。
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ctrl_threads (
      thread_id        TEXT PRIMARY KEY,
      topic            TEXT NOT NULL,
      category         TEXT,
      channel          TEXT NOT NULL DEFAULT 'general',
      initiator_track  TEXT NOT NULL,
      state            TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
      must_read        INTEGER NOT NULL DEFAULT 0,
      closed_at        TEXT,
      created_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ctrl_messages (
      msg_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id     TEXT NOT NULL REFERENCES ctrl_threads(thread_id),
      seq           INTEGER NOT NULL,
      from_track    TEXT NOT NULL,
      to_tracks     TEXT NOT NULL,
      msg_type      TEXT NOT NULL CHECK (msg_type IN ('inform','discuss','request','handoff','decision','state')),
      body          TEXT NOT NULL,
      ref_json      TEXT,
      superseded_by INTEGER,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ctrl_message_reads (
      msg_id   INTEGER NOT NULL,
      track    TEXT NOT NULL,
      read_at  TEXT NOT NULL,
      PRIMARY KEY (msg_id, track)
    );

    CREATE TABLE IF NOT EXISTS ctrl_boards (
      board_id   TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      state_json TEXT NOT NULL,
      version    INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_ctrl_messages_thread_seq ON ctrl_messages(thread_id, seq);
    CREATE INDEX        IF NOT EXISTS ix_ctrl_messages_created    ON ctrl_messages(created_at);
    CREATE INDEX        IF NOT EXISTS ix_ctrl_threads_channel     ON ctrl_threads(channel, state);
    CREATE INDEX        IF NOT EXISTS ix_ctrl_threads_category    ON ctrl_threads(category);
    CREATE INDEX        IF NOT EXISTS ix_ctrl_threads_must_read   ON ctrl_threads(must_read, state);
    CREATE INDEX        IF NOT EXISTS ix_ctrl_reads_track         ON ctrl_message_reads(track, read_at);

    CREATE VIRTUAL TABLE IF NOT EXISTS ctrl_messages_fts USING fts5(
      body,
      content=ctrl_messages,
      content_rowid=msg_id,
      tokenize='trigram'
    );
  `);

  // FTS5 Content-Sync Triggers — ctrl_messages → ctrl_messages_fts(逐字對齊 :62-88 context_fts 既有範式)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ctrl_messages_ai AFTER INSERT ON ctrl_messages BEGIN
      INSERT INTO ctrl_messages_fts(rowid, body) VALUES (new.msg_id, new.body);
    END;

    CREATE TRIGGER IF NOT EXISTS ctrl_messages_ad AFTER DELETE ON ctrl_messages BEGIN
      INSERT INTO ctrl_messages_fts(ctrl_messages_fts, rowid, body) VALUES('delete', old.msg_id, old.body);
    END;

    CREATE TRIGGER IF NOT EXISTS ctrl_messages_au AFTER UPDATE ON ctrl_messages BEGIN
      INSERT INTO ctrl_messages_fts(ctrl_messages_fts, rowid, body) VALUES('delete', old.msg_id, old.body);
      INSERT INTO ctrl_messages_fts(rowid, body) VALUES (new.msg_id, new.body);
    END;
  `);
  console.log('   Epic-CCB ctrl_ channel: ctrl_threads, ctrl_messages, ctrl_message_reads, ctrl_boards (+ 6 indexes + FTS5 trigram)');

  // ──────────────────────────────────────────────
  // Epic-TDB 排程層(tdb-1-track-plan-roadmap 2026-07-28)
  // track_plan 表(1:1 對 stories)+ 2 索引 —— 排程維度(lane/seq/plan_state/pause_reason/unlock_note)
  // 結構化入庫,取代推進地圖 .md 手工維護投影。純 additive,零既有表 schema 變更,不建 FTS5 / trigger。
  // 本區塊為 track_plan DDL 的**單一真實來源**;兩支 migration .sql 與其一致(僅縮排差異)。
  // 衍生自 SDD Spec §3(docs/implementation-artifacts/specs/epic-tdb/tdb-1-track-plan-roadmap-spec.md),
  // 但**非逐字**——與 Spec 有三處具名偏離(FK 未實作 / plan_state 為 4 值不含 'in-flight' / 欄位順序),
  // 完整理由見該 Spec 檔頭「Known implementation divergences」block(tdb-1 code-review F5 補記)。
  // 刻意不宣告 FOREIGN KEY REFERENCES stories(story_id):better-sqlite3 此建置 PRAGMA foreign_keys
  // 預設為 1(ON,非多數人假設的 SQLite 傳統預設 OFF),而 upsert-story.js _doUpsert 用
  // INSERT OR REPLACE INTO stories(PK 衝突時底層等於 DELETE+INSERT)——若宣告 ON DELETE CASCADE,
  // 任何一次無關欄位的 Story 更新都會靜默把該卡的 track_plan 列級聯刪除。referential integrity
  // 改在應用層做(migrate-track-plan.js FK 完整性中止 + upsert-track-plan.js 寫入前 story 存在性檢查)。
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS track_plan (
      story_id      TEXT PRIMARY KEY,
      lane          TEXT NOT NULL CHECK (lane IN ('manual','dispatch','reconcile')),
      seq           INTEGER,
      plan_state    TEXT NOT NULL DEFAULT 'queued' CHECK (plan_state IN ('queued','paused','unlocked','done-exited')),
      pause_reason  TEXT,
      unlock_note   TEXT,
      updated_at    TEXT NOT NULL,
      updated_by    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_track_plan_lane_seq ON track_plan(lane, seq);
    CREATE INDEX IF NOT EXISTS ix_track_plan_state     ON track_plan(plan_state);
  `);
  console.log('   Epic-TDB track_plan: track_plan (+ 2 indexes)');

  // ──────────────────────────────────────────────
  // Epic-CCB 中控視窗註冊表(ccb-4-ctrl-notify-knock 2026-08-03)
  // controller_windows 表 + 1 索引 —— session_id → track 顯式綁定(+ 可空 console_pid)。
  // DDL 逐字取自 SDD Spec §3.1(docs/implementation-artifacts/specs/epic-ccb/ccb-4-ctrl-notify-knock-spec.md);
  // 兩支 migration .sql 與本區塊同源。
  //
  // 為何 PK 是 session_id 而非 track:一個 Claude session = 一個視窗 = 一個軌別,但一個軌別可
  // 合法地重新綁到新視窗(舊視窗關閉後)。以 track 為 key 會使該情境變成 update-in-place,靜默
  // 丟掉舊視窗的 PID;以 session_id 為 key 則讓陳舊列自然老化。
  //
  // 為何 console_cmdline 是存下來而非每次重算:它是 judgeLiveness()(reap-worker-runs.js)Tuple 3/4
  // 的中控域對應物 —— 那兩個 Tuple 檢查命令列含 ipc_dir 與 worker-{suffix}.ps1,兩者都是 worker
  // 專屬 token,中控視窗不存在。等價守衛是「命令列是否仍是綁定當下記錄的那一條」;少了它,一個
  // 被重用的 Windows PID 會被當成原視窗敲門。
  //
  // 為何兩個 last_*_count 預設 -1 而非 0 或 NULL:0 是真實的未讀數,NULL 讓比較式變複雜;-1 對
  // COUNT(*) 不可達,因此不需要第二個 nullable 旗標就能表達「從未輸出過」。
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS controller_windows (
      session_id            TEXT PRIMARY KEY,
      track                 TEXT NOT NULL,
      console_pid           INTEGER,
      console_cmdline       TEXT,
      last_probe_at         TEXT,
      last_probe_count      INTEGER NOT NULL DEFAULT -1,
      last_stop_block_at    TEXT,
      last_stop_block_count INTEGER NOT NULL DEFAULT -1,
      last_knock_at         TEXT,
      bound_at              TEXT NOT NULL,
      last_seen_at          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_controller_windows_track ON controller_windows(track, last_seen_at);
  `);
  console.log('   Epic-CCB controller_windows: controller_windows (+ 1 index)');

  db.close();

  console.log('✅ PhyCool Context Memory DB initialized successfully');
  console.log(`   Path: ${DB_PATH}`);
  console.log(`   Phase 0 tables: context_entries, context_fts, tech_entries, tech_fts, sprint_index`);
  console.log(`   Phase 1 tables: symbol_index, symbol_dependencies (TD-33)`);
  console.log(`   Phase 2 tables: symbol_embeddings (TD-34)`);
  console.log(`   CMI-2 ETL tables: stories (+14 v2 cols, FTS5 5-col), cr_reports, cr_issues, doc_index (+ FTS5 + triggers)`);
  console.log(`   CMI-2 v2: tech_debt_items (+ FTS5 + triggers — replaces registry.yaml)`);
  console.log(`   CMI-3 tables: conversation_sessions, conversation_turns (+ FTS5 + triggers)`);
  console.log(`   CMI-5 tables: document_chunks, document_embeddings (+ FTS5 + triggers + doc_index 6 columns)`);
  console.log(`   CMI-10 tables: context_embeddings, tech_embeddings, stories_embeddings, conversation_embeddings, debt_embeddings`);
  console.log(`   Phase 5 tables: glossary (+ FTS5), workflow_executions, benchmarks, test_journeys, test_traceability`);
  console.log(`   Pipeline tables: pipeline_checkpoints (+ 2 indexes)`);
  console.log(`   DLA-07 tables: intentional_decisions (+ FTS5 + 3 indexes + 4 triggers: 3 FTS5 + 1 sync_to_context)`);
  console.log(`   epic-whp tables: worker_runs (39 cols), worker_messages, worker_handoffs, guardian_heartbeat (+ 8 indexes)`);
  console.log(`   epic-ccb tables: ctrl_threads, ctrl_messages, ctrl_message_reads, ctrl_boards (+ 6 indexes + FTS5 trigram + 3 triggers)`);
  console.log(`   epic-ccb tables: controller_windows (11 cols, + 1 index)`);
  console.log(`   epic-tdb tables: track_plan (+ 2 indexes)`);
  console.log(`   Triggers: context(3) + tech(3) + stories(3) + cr_reports(3) + cr_issues(3) + doc_index(3) + conv_sessions(3) + conv_turns(3) + doc_chunks(3) + debt(3) + idd(4) + ctrl_messages(3) = 37`);
  console.log(`   Mode: WAL`);
  console.log(`   Phase boundary: OK (no Phase 3+ tables)`);
}

// 執行初始化
initDb().catch((err) => {
  console.error('❌ Initialization failed:', err.message);
  process.exit(1);
});
