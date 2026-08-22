// migrate-track-plan.test.js — tdb-1-track-plan-roadmap
// 遷移冪等 / FK 完整性中止 / --report 對帳 / done 卡 plan_state 正確性。
// 走隔離 temp DB(never touches .context-db/phycool.db)。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrate, SOURCE_ROWS } from '../scripts/migrate-track-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP_SQL = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '2026-07-28-add-track-plan-table.sql'),
  'utf8',
);

function makeDb() {
  const dbPath = path.join(os.tmpdir(), `tdb1-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  const db = new Database(dbPath);
  db.exec('CREATE TABLE stories (story_id TEXT PRIMARY KEY, status TEXT NOT NULL);');
  db.exec(UP_SQL);
  db.close();
  return dbPath;
}

function seedAllStories(dbPath, rows = SOURCE_ROWS) {
  const db = new Database(dbPath);
  const stmt = db.prepare('INSERT INTO stories (story_id, status) VALUES (?, ?)');
  for (const r of rows) {
    stmt.run(r.story_id, r.seq === null ? 'done' : 'ready-for-dev');
  }
  db.close();
}

function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

let dbPath;

beforeEach(() => {
  dbPath = makeDb();
});

afterEach(() => {
  cleanup(dbPath);
});

describe('BR-007: 冪等重跑', () => {
  it('BR007_MigrateTwice_SecondRunInsertsZero: 連續執行兩次，第二次 inserted=0 unchanged=30', () => {
    seedAllStories(dbPath);
    const r1 = runMigrate(dbPath);
    expect(r1.inserted).toBe(30);
    expect(r1.unchanged).toBe(0);
    expect(r1.mismatch).toEqual([]);

    const r2 = runMigrate(dbPath);
    expect(r2.inserted).toBe(0);
    expect(r2.unchanged).toBe(30);
    expect(r2.mismatch).toEqual([]);
  });

  it('BR007_MigrateAfterManualReseq_PreservesSeq99: 手動改 seq=99 後重跑，仍為 99（ON CONFLICT DO NOTHING 不覆寫）', () => {
    seedAllStories(dbPath);
    runMigrate(dbPath);

    const overrideDb = new Database(dbPath);
    overrideDb.prepare("UPDATE track_plan SET seq=99 WHERE story_id='bwu-3-dev-consume-review-audit'").run();
    overrideDb.close();

    runMigrate(dbPath);

    const checkDb = new Database(dbPath, { readonly: true });
    const seq = checkDb.prepare("SELECT seq FROM track_plan WHERE story_id='bwu-3-dev-consume-review-audit'").get().seq;
    checkDb.close();
    expect(seq).toBe(99);
  });
});

describe('BR-011/BR-012: 全新 DB 遷移正確性', () => {
  it('BR011_MigrateFreshDb_Inserts30Rows: 空 track_plan 上跑遷移，COUNT=30，done-exited=13，seq IS NULL=13', () => {
    seedAllStories(dbPath);
    runMigrate(dbPath);

    const db = new Database(dbPath, { readonly: true });
    expect(db.prepare('SELECT COUNT(*) c FROM track_plan').get().c).toBe(30);
    expect(db.prepare("SELECT COUNT(*) c FROM track_plan WHERE plan_state='done-exited'").get().c).toBe(13);
    expect(db.prepare('SELECT COUNT(*) c FROM track_plan WHERE seq IS NULL').get().c).toBe(13);
    db.close();
  });

  it('BR012_MigrateDoneCards_WriteDoneExitedWithNullSeq: 13 張 done 卡 plan_state 與 seq 各自正確', () => {
    seedAllStories(dbPath);
    runMigrate(dbPath);

    const db = new Database(dbPath, { readonly: true });
    const doneRows = SOURCE_ROWS.filter((r) => r.seq === null);
    expect(doneRows.length).toBe(13);
    for (const r of doneRows) {
      const row = db.prepare('SELECT plan_state, seq FROM track_plan WHERE story_id = ?').get(r.story_id);
      expect(row.plan_state, r.story_id).toBe('done-exited');
      expect(row.seq, r.story_id).toBeNull();
    }
    db.close();
  });
});

describe('BR-013: FK 完整性中止', () => {
  it('BR013_MigrateWithMissingStoryId_RollsBackAll: 常數表含不存在 story_id → 全部不寫入 + exit 非 PASS', () => {
    const db = new Database(dbPath);
    db.prepare("INSERT INTO stories (story_id, status) VALUES ('real-story-1', 'ready-for-dev')").run();
    db.close();

    const badRows = [
      { story_id: 'real-story-1', lane: 'manual', seq: 1 },
      { story_id: 'ghost-1', lane: 'manual', seq: 2 },
    ];
    const result = runMigrate(dbPath, { rows: badRows });
    expect(result.aborted).toBe(true);
    expect(result.missingIds).toEqual(['ghost-1']);

    const checkDb = new Database(dbPath, { readonly: true });
    expect(checkDb.prepare('SELECT COUNT(*) c FROM track_plan').get().c).toBe(0);
    checkDb.close();
  });
});

describe('BR-014: --report 逐列對帳', () => {
  it('BR014_MigrateReport_PrintsPerRowReconciliation: rows 含 30 筆逐列資料 + mismatch 摘要', () => {
    seedAllStories(dbPath);
    const result = runMigrate(dbPath);
    expect(result.rows.length).toBe(30);
    for (const r of result.rows) {
      expect(r).toHaveProperty('story_id');
      expect(r).toHaveProperty('lane');
      expect(r).toHaveProperty('plan_state');
    }
    expect(Array.isArray(result.mismatch)).toBe(true);
  });
});

// ============================================================
// [code-review 補件] BR-057 / BR-058 —— 推進地圖凍結標頭
// testing_strategy 列了這兩個具名案例但 dev-story 未落地,且未列入「具名豁免行」。
// 凍結標頭是本卡把 .md 手工維護導向 /roadmap 的唯一使用者可見出口 —— 若被後續編輯誤刪,
// 使用者會回頭手編一份已停止更新的地圖而毫無警示。以下為回歸鎖。
// ============================================================
const FREEZE_DOC = path.join(__dirname, '..', '..', 'docs', 'tracking', 'active', '多軌推進地圖-bwu-whp-tddevenv.md');

describe('BR-057/BR-058: 推進地圖凍結標頭', () => {
  it('BR057_RoadmapMdFreezeHeader_ContainsThreeKeyPoints: FREEZE-MARKER 後 15 行含「已遷移」「禁手編」「upsert-track-plan」三要點', () => {
    const raw = fs.readFileSync(FREEZE_DOC, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const lines = raw.split('\n');
    // [bwu-12] 錨點自「檔案絕對前 15 行」改為「FREEZE-MARKER 後 15 行」——execution-tree-doc-sop.md
    // 治理下新增了凍結線以上的可手編狀態區(見本檔頂端 🔔 最新狀態區塊),使凍結公告段落被合法推到
    // 檔案深處;但保護意圖(禁止公告段落被靜默刪除)不變,故錨點改跟隨 FREEZE-MARKER 本身,不再假設
    // 它固定在檔案開頭。四要點仍要求落在該段的首屏(FREEZE-MARKER 後緊接 15 行內)。
    const markerIdx = lines.findIndex(l => l.includes('FREEZE-MARKER'));
    expect(markerIdx, 'FREEZE-MARKER comment must exist').toBeGreaterThanOrEqual(0);
    const head = lines.slice(markerIdx, markerIdx + 15).join('\n');

    expect(head).toContain('已遷移');
    expect(head).toContain('禁手編');
    expect(head).toContain('upsert-track-plan');
    // 三要點必須落在首屏,不能被推到檔案深處
    expect(head).toContain('/roadmap');
  });

  it('BR058_FreezeHeaderApply_SecondRunKeepsSingleMarker: FREEZE-MARKER 全檔出現次數為 1（冪等,重跑貼附不重複）', () => {
    const raw = fs.readFileSync(FREEZE_DOC, 'utf8');
    const hits = raw.match(/FREEZE-MARKER/g) || [];
    expect(hits.length).toBe(1);
    expect(raw).toContain('FREEZE-MARKER:tdb-1-track-plan-roadmap');
  });

  it('原文段落保留（回滾零資料損失）—— 凍結後仍可見「整體進度」歷史快照章節', () => {
    const raw = fs.readFileSync(FREEZE_DOC, 'utf8');
    expect(raw).toContain('## 整體進度');
  });
});

// ============================================================
// [code-review 補件] BR-059 —— db-schema.md 計數自洽
// testing_strategy 具名此案例但 dev-story 未落地。原案例設計為「宣告數 vs sqlite_master 實查」,
// 但 .context-db/phycool.db 為 gitignored（fresh clone / CI 無此檔）,直接查活庫的測試不可攜。
// 本檔改鎖**可攜的那一半**:文件內三個分項數字必須加總等於宣告的 Total,且 track_plan 已登錄。
// （「宣告 vs PRAGMA 實查」的另一半於本次 code-review 以獨立腳本人工驗證:
//   total=124 / 實體基表=54 / FTS5 主表=14 / shadow=56,54+14+56=124 相符。）
// ============================================================
const DB_SCHEMA_DOC = path.join(
  __dirname, '..', '..', '.claude', 'skills', 'phycool-context-memory', 'references', 'db-schema.md',
);

describe('BR-059: db-schema.md 計數自洽', () => {
  const doc = fs.readFileSync(DB_SCHEMA_DOC, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

  it('BR059_DbSchemaDoc_CountsAreSelfConsistent: 實體基表 + FTS5 主表 + shadow 必等於 Total', () => {
    const total = Number(doc.match(/Total `sqlite_master` table rows[^|]*\|\s*\*\*(\d+)\*\*/)?.[1]);
    const base = Number(doc.match(/\*\*實體基表\*\*[^|]*\|\s*\*\*(\d+)\*\*/)?.[1]);
    const shadow = Number(doc.match(/FTS5 shadow tables \(`_data`[^|]*\|\s*(\d+)\s*\|/)?.[1]);

    expect(Number.isFinite(total), 'Total 未能自 §0 Inventory 表解析').toBe(true);
    expect(Number.isFinite(base), '實體基表數未能自 §0 Inventory 表解析').toBe(true);
    expect(Number.isFinite(shadow), 'shadow 數未能自 §0 Inventory 表解析').toBe(true);

    const fts = total - base - shadow;
    expect(fts, `算式不自洽: ${base}(實體) + ${fts}(FTS5 主表) + ${shadow}(shadow) 應 = ${total}`).toBeGreaterThan(0);
    expect(base + fts + shadow).toBe(total);
  });

  it('BR059_DbSchemaDoc_RecordsTrackPlan: §Post-snapshot additions 已登錄 track_plan（本卡新增表）', () => {
    expect(doc).toContain('track_plan');
    expect(doc).toContain('tdb-1-track-plan-roadmap');
  });
});

describe('BR-006: --db path injection', () => {
  it('BR006_MigrateScript_SupportsDbPathInjection: 僅寫入指定 temp DB，不觸碰其他路徑', () => {
    seedAllStories(dbPath);
    const otherDbPath = makeDb();
    seedAllStories(otherDbPath);
    try {
      runMigrate(dbPath);
      const otherDb = new Database(otherDbPath, { readonly: true });
      expect(otherDb.prepare('SELECT COUNT(*) c FROM track_plan').get().c).toBe(0);
      otherDb.close();

      const targetDb = new Database(dbPath, { readonly: true });
      expect(targetDb.prepare('SELECT COUNT(*) c FROM track_plan').get().c).toBe(30);
      targetDb.close();
    } finally {
      cleanup(otherDbPath);
    }
  });
});
