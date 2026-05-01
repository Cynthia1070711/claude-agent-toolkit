// ============================================================
// PCPT Review Analyst — DB Schema 初始化
// 審查報告追蹤系統：review_plans + review_reports + review_findings
// ============================================================
// 執行方式: node .context-db/scripts/init-review-tables.js
// 冪等設計: CREATE TABLE IF NOT EXISTS
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

function initReviewTables() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // ──────────────────────────────────────────────
  // 1. 審查計畫表（Phase 0 plan 產出，子視窗讀取）
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_plans (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id         TEXT UNIQUE NOT NULL,
      plan_date       TEXT NOT NULL,
      status          TEXT DEFAULT 'draft',

      -- 模組與分組
      total_modules   INTEGER DEFAULT 0,
      total_groups    INTEGER DEFAULT 0,
      modules_json    TEXT,
      groups_json     TEXT,
      risk_matrix_json TEXT,
      engine_assignment_json TEXT,

      -- 執行進度
      completed_modules INTEGER DEFAULT 0,
      failed_modules  INTEGER DEFAULT 0,

      -- 元資料
      created_by      TEXT DEFAULT 'CC-OPUS',
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now'))
    );
  `);

  // ──────────────────────────────────────────────
  // 2. 審查報告表（每個模組 × 引擎 × 模式 = 1 筆）
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id       TEXT UNIQUE NOT NULL,
      plan_id         TEXT,
      module_code     TEXT NOT NULL,
      review_mode     TEXT NOT NULL,
      engine          TEXT NOT NULL,
      status          TEXT DEFAULT 'pending',

      -- SaaS SOP 八大維度評分 (1-10)
      score_functional        INTEGER,
      score_data_consistency   INTEGER,
      score_authorization      INTEGER,
      score_billing            INTEGER,
      score_error_recovery     INTEGER,
      score_security           INTEGER,
      score_observability      INTEGER,
      score_uiux               INTEGER,
      score_total              REAL,

      -- Bug 統計
      bugs_p0         INTEGER DEFAULT 0,
      bugs_p1         INTEGER DEFAULT 0,
      bugs_p2         INTEGER DEFAULT 0,
      bugs_p3         INTEGER DEFAULT 0,
      bugs_p4         INTEGER DEFAULT 0,
      bugs_total      INTEGER DEFAULT 0,

      -- 生命週期矩陣統計
      lifecycle_pass  INTEGER DEFAULT 0,
      lifecycle_warn  INTEGER DEFAULT 0,
      lifecycle_fail  INTEGER DEFAULT 0,
      lifecycle_skip  INTEGER DEFAULT 0,

      -- 時間追蹤
      started_at      TEXT,
      completed_at    TEXT,

      -- 人工審查（Alan 審查後填寫）
      reviewed_by     TEXT,
      reviewed_at     TEXT,
      review_notes    TEXT,

      -- 元資料
      report_path     TEXT,
      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),

      FOREIGN KEY (plan_id) REFERENCES review_plans(plan_id)
    );
  `);

  // ──────────────────────────────────────────────
  // 3. 審查發現表（每個 Bug = 1 筆）
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_findings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      finding_id      TEXT UNIQUE NOT NULL,
      report_id       TEXT NOT NULL,
      module_code     TEXT NOT NULL,

      -- Bug 資訊
      severity        TEXT NOT NULL,
      bug_type        TEXT NOT NULL,
      dimension       TEXT,
      title           TEXT NOT NULL,
      description     TEXT,
      file_path       TEXT,
      line_number     INTEGER,

      -- 根因與修復建議
      root_cause      TEXT,
      fix_suggestion  TEXT,
      affected_files  TEXT,
      regression_risk TEXT,
      suggested_story TEXT,

      -- 多引擎交叉比對
      engine          TEXT NOT NULL,
      cross_confirmed INTEGER DEFAULT 0,
      cross_engines   TEXT,

      -- 重現步驟（E2E 模式）
      repro_steps     TEXT,
      expected_result TEXT,
      actual_result   TEXT,

      -- 截圖（E2E 模式）
      screenshot_before TEXT,
      screenshot_after  TEXT,
      console_errors    TEXT,
      network_issues    TEXT,

      -- 修復追蹤（後續填寫）
      fix_status      TEXT DEFAULT 'open',
      fix_story_id    TEXT,
      fix_notes       TEXT,
      fixed_at        TEXT,
      fixed_by        TEXT,
      verified_at     TEXT,
      verified_by     TEXT,

      created_at      TEXT DEFAULT (datetime('now')),
      updated_at      TEXT DEFAULT (datetime('now')),

      FOREIGN KEY (report_id) REFERENCES review_reports(report_id)
    );
  `);

  // ──────────────────────────────────────────────
  // 4. 索引
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_review_reports_plan ON review_reports(plan_id);
    CREATE INDEX IF NOT EXISTS idx_review_reports_module ON review_reports(module_code);
    CREATE INDEX IF NOT EXISTS idx_review_reports_status ON review_reports(status);
    CREATE INDEX IF NOT EXISTS idx_review_reports_engine ON review_reports(engine);

    CREATE INDEX IF NOT EXISTS idx_review_findings_report ON review_findings(report_id);
    CREATE INDEX IF NOT EXISTS idx_review_findings_module ON review_findings(module_code);
    CREATE INDEX IF NOT EXISTS idx_review_findings_severity ON review_findings(severity);
    CREATE INDEX IF NOT EXISTS idx_review_findings_fix_status ON review_findings(fix_status);
    CREATE INDEX IF NOT EXISTS idx_review_findings_engine ON review_findings(engine);
  `);

  // ──────────────────────────────────────────────
  // 5. FTS5 全文索引
  // ──────────────────────────────────────────────
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS review_findings_fts USING fts5(
      title, description, fix_suggestion, file_path, module_code,
      content='review_findings',
      content_rowid='id',
      tokenize='trigram'
    );
  `);

  // FTS5 同步觸發器
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS review_findings_ai AFTER INSERT ON review_findings BEGIN
      INSERT INTO review_findings_fts(rowid, title, description, fix_suggestion, file_path, module_code)
      VALUES (new.id, new.title, new.description, new.fix_suggestion, new.file_path, new.module_code);
    END;

    CREATE TRIGGER IF NOT EXISTS review_findings_ad AFTER DELETE ON review_findings BEGIN
      INSERT INTO review_findings_fts(review_findings_fts, rowid, title, description, fix_suggestion, file_path, module_code)
      VALUES ('delete', old.id, old.title, old.description, old.fix_suggestion, old.file_path, old.module_code);
    END;

    CREATE TRIGGER IF NOT EXISTS review_findings_au AFTER UPDATE ON review_findings BEGIN
      INSERT INTO review_findings_fts(review_findings_fts, rowid, title, description, fix_suggestion, file_path, module_code)
      VALUES ('delete', old.id, old.title, old.description, old.fix_suggestion, old.file_path, old.module_code);
      INSERT INTO review_findings_fts(rowid, title, description, fix_suggestion, file_path, module_code)
      VALUES (new.id, new.title, new.description, new.fix_suggestion, new.file_path, new.module_code);
    END;
  `);

  // ──────────────────────────────────────────────
  // 驗證
  // ──────────────────────────────────────────────
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name IN ('review_plans','review_reports','review_findings')
    ORDER BY name
  `).all();

  const fts = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='review_findings_fts'
  `).all();

  console.log(`✅ Review tables 初始化完成:`);
  console.log(`   Tables: ${tables.map(t => t.name).join(', ')}`);
  console.log(`   FTS5: ${fts.length > 0 ? 'review_findings_fts ✅' : '❌'}`);

  db.close();
}

initReviewTables();
