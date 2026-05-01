// ============================================================
// PCPT Context Memory DB — Stories Schema v2 Migration
// MQV Phase: 擴展 stories 表以支援完整 Story 內容儲存
// ============================================================
// 執行方式: node .context-db/scripts/migrate-stories-v2.js
// 冪等設計: ALTER TABLE ADD COLUMN 若已存在則跳過
// ============================================================

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'context-memory.db');

function migrate() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`DB not found: ${DB_PATH}`);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // 取得 stories 表現有欄位
  const columns = db.prepare("PRAGMA table_info('stories')").all().map(c => c.name);

  const newColumns = [
    { name: 'user_story',           type: 'TEXT' },  // As a... I want... so that...
    { name: 'background',           type: 'TEXT' },  // 問題描述 + 根因分析
    { name: 'acceptance_criteria',  type: 'TEXT' },  // JSON: [{id, title, given, when, then}]
    { name: 'tasks',                type: 'TEXT' },  // JSON: [{id, description, ac_refs, subtasks}]
    { name: 'affected_files',       type: 'TEXT' },  // JSON: [{file, change_type}]
    { name: 'cr_score',             type: 'INTEGER' }, // Code Review 分數
    { name: 'test_count',           type: 'INTEGER' }, // 測試數量
    { name: 'discovery_source',     type: 'TEXT' },  // 發現來源
    { name: 'updated_at',           type: 'TEXT' },  // 最後更新時間
  ];

  let added = 0;
  for (const col of newColumns) {
    if (!columns.includes(col.name)) {
      db.exec(`ALTER TABLE stories ADD COLUMN ${col.name} ${col.type}`);
      added++;
      console.log(`  + 新增欄位: ${col.name} (${col.type})`);
    }
  }

  // 更新 FTS 索引以包含新欄位（重建 FTS 表）
  // 注意：FTS5 content table 新增欄位後，trigger 需要重建以涵蓋新欄位
  // 但 FTS5 external content 不能直接 ALTER，需要 DROP + CREATE
  // 為了安全，只在有新增欄位時重建
  if (added > 0) {
    console.log('\n  重建 FTS 索引...');

    // 移除舊 triggers
    db.exec(`
      DROP TRIGGER IF EXISTS stories_ai;
      DROP TRIGGER IF EXISTS stories_ad;
      DROP TRIGGER IF EXISTS stories_au;
    `);

    // 移除舊 FTS 表
    db.exec('DROP TABLE IF EXISTS stories_fts');

    // 建立新 FTS 表（加入 user_story, background）
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts USING fts5(
        title, tags, dependencies, user_story, background,
        content=stories,
        content_rowid=rowid,
        tokenize='trigram'
      );
    `);

    // 重建 triggers
    db.exec(`
      CREATE TRIGGER stories_ai AFTER INSERT ON stories BEGIN
        INSERT INTO stories_fts(rowid, title, tags, dependencies, user_story, background)
        VALUES (new.rowid, new.title, new.tags, new.dependencies, new.user_story, new.background);
      END;

      CREATE TRIGGER stories_ad AFTER DELETE ON stories BEGIN
        INSERT INTO stories_fts(stories_fts, rowid, title, tags, dependencies, user_story, background)
        VALUES('delete', old.rowid, old.title, old.tags, old.dependencies, old.user_story, old.background);
      END;

      CREATE TRIGGER stories_au AFTER UPDATE ON stories BEGIN
        INSERT INTO stories_fts(stories_fts, rowid, title, tags, dependencies, user_story, background)
        VALUES('delete', old.rowid, old.title, old.tags, old.dependencies, old.user_story, old.background);
        INSERT INTO stories_fts(rowid, title, tags, dependencies, user_story, background)
        VALUES (new.rowid, new.title, new.tags, new.dependencies, new.user_story, new.background);
      END;
    `);

    // 重建 FTS 索引內容（從現有資料）
    db.exec(`
      INSERT INTO stories_fts(stories_fts) VALUES('rebuild');
    `);

    console.log('  FTS 索引重建完成');
  }

  db.close();

  console.log(`\n✅ Stories v2 migration 完成 (新增 ${added} 個欄位)`);
}

try {
  migrate();
} catch (err) {
  console.error('❌ Migration 失敗:', err.message);
  process.exit(1);
}
