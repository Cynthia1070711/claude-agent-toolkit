// ============================================================
// db-story-service.test.ts — dateRange 過濾 + 排序邏輯 單元測試
// DVS-07 AC-4: today/3d/week/month + 邊界值測試
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ── 取得台灣時間的輔助函式（純函式，不依賴任何模組）──
function twDateStr(daysOffset: number): string {
  const now = new Date();
  const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  twNow.setDate(twNow.getDate() + daysOffset);
  const y = twNow.getFullYear();
  const m = String(twNow.getMonth() + 1).padStart(2, '0');
  const d = String(twNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── getDateRangeStart 純函式測試（dynamic import，避免 singleton 快取）──
// [tdb-2 修正] 現行實作回傳純日期前綴（無 T00:00:00+08:00 後綴，見 db-story-service.ts:104-109
// 註解:確保 DB 兩種 updated_at 格式皆能字串比較），本檔測試沿用舊版全時間戳期望值已與實作脫鉤,
// 與 sprint-status.yaml 凍結無關的既有 pre-existing drift,5-Min Rule 就地修正。
describe('getDateRangeStart', () => {
  it('BR-002/AC-2: today — 回傳今日純日期前綴', async () => {
    const { getDateRangeStart } = await import('../db-story-service.js');
    expect(getDateRangeStart('today')).toBe(twDateStr(0));
  });

  it('BR-004/AC-4: 3d — 回傳 2 天前純日期前綴（含今日共3天）', async () => {
    const { getDateRangeStart } = await import('../db-story-service.js');
    expect(getDateRangeStart('3d')).toBe(twDateStr(-2));
  });

  it('BR-004/AC-4: week — 回傳本週一純日期前綴', async () => {
    const { getDateRangeStart } = await import('../db-story-service.js');
    const result = getDateRangeStart('week');
    const now = new Date();
    const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const dayOfWeek = twNow.getDay();
    const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(twNow.getFullYear(), twNow.getMonth(), twNow.getDate() - daysBack);
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    expect(result).toBe(`${y}-${m}-${d}`);
  });

  it('BR-004/AC-4: month — 回傳本月 1 日純日期前綴', async () => {
    const { getDateRangeStart } = await import('../db-story-service.js');
    const result = getDateRangeStart('month');
    const now = new Date();
    const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const y = twNow.getFullYear();
    const m = String(twNow.getMonth() + 1).padStart(2, '0');
    expect(result).toBe(`${y}-${m}-01`);
  });

  it('格式驗證: 回傳值符合 YYYY-MM-DD 純日期格式', async () => {
    const { getDateRangeStart } = await import('../db-story-service.js');
    expect(getDateRangeStart('today')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── DB 整合測試（vi.doMock + resetModules 注入測試 DB）──
describe('getDbStoryList with dateRange filter', () => {
  let tmpDir: string;
  let testDb: Database.Database;

  function createSchema(conn: Database.Database) {
    conn.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        story_id     TEXT PRIMARY KEY,
        epic_id      TEXT NOT NULL DEFAULT '',
        domain       TEXT NOT NULL DEFAULT '',
        title        TEXT NOT NULL DEFAULT '',
        status       TEXT NOT NULL DEFAULT 'backlog',
        priority     TEXT,
        complexity   TEXT,
        story_type   TEXT,
        tags         TEXT,
        dev_agent    TEXT,
        review_agent TEXT,
        cr_score     INTEGER,
        test_count   INTEGER,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT
      );
      -- +CR F3 連帶：tdb-5 起 getDbStoryList() 會查 worker_runs。原 fixture 缺此表，
      -- 使本組每個案例的 buildRerunMap 都走 catch 分支 —— 在 CR 補上 console.warn 之前
      -- 完全無聲，斷言又不涉及 rerun 故永遠不會紅。建空表使 fixture 涵蓋被測路徑。
      CREATE TABLE IF NOT EXISTS worker_runs (
        run_id     TEXT PRIMARY KEY,
        story_id   TEXT NOT NULL,
        phase      TEXT NOT NULL,
        attempt    INTEGER NOT NULL DEFAULT 1
      );
    `);
  }

  async function getService() {
    const mod = await import('../db-story-service.js');
    return mod;
  }

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvs07-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    testDb = new Database(dbPath);
    createSchema(testDb);

    // 取得今日 UTC+8 時間戳（不依賴 service，使用本地函式）
    const todayTs = twDateStr(0);

    // 昨天
    const now = new Date();
    const twNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const yesterday = new Date(twNow.getFullYear(), twNow.getMonth(), twNow.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}T10:00:00+08:00`;

    // 30天前
    const old = new Date(twNow.getFullYear(), twNow.getMonth(), twNow.getDate() - 30);
    const oldStr = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}T10:00:00+08:00`;

    const insert = testDb.prepare(
      `INSERT OR REPLACE INTO stories (story_id, epic_id, domain, title, status, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run('test-today-1', 'epic-test', 'test', 'Today Story', 'in-progress', todayTs, todayTs);
    insert.run('test-yesterday-1', 'epic-test', 'test', 'Yesterday Story', 'done', yStr, yStr);
    insert.run('test-old-1', 'epic-test', 'test', 'Old Story', 'done', oldStr, oldStr);
    insert.run('test-null-updated', 'epic-test', 'test', 'Null Updated Story', 'backlog', null, todayTs);

    // 使用 vi.doMock（非 hoist）注入測試 DB
    vi.doMock('../../db.js', () => ({
      getDb: () => testDb,
    }));
  });

  afterEach(() => {
    vi.doUnmock('../../db.js');
    vi.resetModules();
    try { testDb?.close(); } catch { /* ignore */ }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('BR-002/AC-2: dateRange=today — 只回傳今日更新的 Story', async () => {
    const { getDbStoryList } = await getService();
    const result = getDbStoryList({ dateRange: 'today' });
    const keys = result.map(s => s.key);
    expect(keys).toContain('test-today-1');
    expect(keys).not.toContain('test-yesterday-1');
    expect(keys).not.toContain('test-old-1');
  });

  it('AC-2: updated_at=null 但 created_at=today 的 Story 應納入今日範圍', async () => {
    const { getDbStoryList } = await getService();
    const result = getDbStoryList({ dateRange: 'today' });
    const keys = result.map(s => s.key);
    expect(keys).toContain('test-null-updated');
  });

  it('AC-4: dateRange=3d — 包含今日和昨日 Story，排除30天前', async () => {
    const { getDbStoryList } = await getService();
    const result = getDbStoryList({ dateRange: '3d' });
    const keys = result.map(s => s.key);
    expect(keys).toContain('test-today-1');
    expect(keys).toContain('test-yesterday-1');
    expect(keys).not.toContain('test-old-1');
  });

  it('AC-4: dateRange=undefined (全部) — 回傳至少4筆 Story', async () => {
    const { getDbStoryList } = await getService();
    const result = getDbStoryList();
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});

// ── getDbEpicProgress / getDbComplexityDistribution（[tdb-2 BR-013] 取代 yaml-service 對應函式）──
describe('getDbEpicProgress / getDbComplexityDistribution', () => {
  let tmpDir: string;
  let testDb: Database.Database;

  function createSchema(conn: Database.Database) {
    conn.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        story_id     TEXT PRIMARY KEY,
        epic_id      TEXT NOT NULL DEFAULT '',
        domain       TEXT NOT NULL DEFAULT '',
        title        TEXT NOT NULL DEFAULT '',
        status       TEXT NOT NULL DEFAULT 'backlog',
        priority     TEXT,
        complexity   TEXT,
        story_type   TEXT,
        tags         TEXT,
        dev_agent    TEXT,
        review_agent TEXT,
        cr_score     INTEGER,
        test_count   INTEGER,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT
      )
    `);
  }

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdb2-epic-test-'));
    testDb = new Database(path.join(tmpDir, 'test.db'));
    createSchema(testDb);

    const insert = testDb.prepare(
      `INSERT INTO stories (story_id, epic_id, domain, title, status, complexity) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    // epic-cat: 1 story, all done → 100%
    insert.run('cat-1', 'epic-cat', 'test', 'Cat 1', 'done', 'M');
    // epic-dvs: mixed statuses + complexity（含 untagged）
    insert.run('dvs-1', 'epic-dvs', 'test', 'Dvs 1', 'done', 'M');
    insert.run('dvs-2', 'epic-dvs', 'test', 'Dvs 2', 'in-progress', 'S');
    insert.run('dvs-3', 'epic-dvs', 'test', 'Dvs 3', 'backlog', null);

    vi.doMock('../../db.js', () => ({ getDb: () => testDb }));
  });

  afterEach(() => {
    vi.doUnmock('../../db.js');
    vi.resetModules();
    try { testDb?.close(); } catch { /* ignore */ }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('BR013_GetDbEpicProgress_AllDoneEpic_Status100Pct: epic-cat（1/1 done）status=done, completionPct=100', async () => {
    const { getDbEpicProgress } = await import('../db-story-service.js');
    const epics = getDbEpicProgress();
    const cat = epics.find(e => e.epicId === 'epic-cat');
    expect(cat).toBeDefined();
    expect(cat!.epicStatus).toBe('done');
    expect(cat!.completionPct).toBe(100);
  });

  it('BR013_GetDbEpicProgress_MixedStatusEpic_StatusInProgress: epic-dvs 含 in-progress → status=in-progress', async () => {
    const { getDbEpicProgress } = await import('../db-story-service.js');
    const epics = getDbEpicProgress();
    const dvs = epics.find(e => e.epicId === 'epic-dvs');
    expect(dvs).toBeDefined();
    expect(dvs!.epicStatus).toBe('in-progress');
    expect(dvs!.totalStories).toBe(3);
    expect(dvs!.doneCount).toBe(1);
  });

  it('BR013_GetDbEpicProgress_Sorted_CompletionPctDescending: 依 completionPct 高到低排序', async () => {
    const { getDbEpicProgress } = await import('../db-story-service.js');
    const epics = getDbEpicProgress();
    for (let i = 0; i < epics.length - 1; i++) {
      expect(epics[i].completionPct).toBeGreaterThanOrEqual(epics[i + 1].completionPct);
    }
  });

  it('BR013_GetDbComplexityDistribution_UntaggedNull_CountsAsUntagged: complexity=null 歸入 untagged', async () => {
    const { getDbComplexityDistribution } = await import('../db-story-service.js');
    const dist = getDbComplexityDistribution();
    expect(dist.untagged).toBe(1);
    expect(dist.M).toBe(2);
    expect(dist.S).toBe(1);
  });

  it('BR013_GetDbComplexityDistribution_EpicIdFilter_OnlyCountsThatEpic: epicId=epic-dvs 只計 3 筆', async () => {
    const { getDbComplexityDistribution } = await import('../db-story-service.js');
    const dist = getDbComplexityDistribution('epic-dvs');
    const total = dist.XS + dist.S + dist.M + dist.L + dist.XL + dist.untagged;
    expect(total).toBe(3);
  });
});

// ── buildRerunMap（tdb-5 重跑聚合，worker_runs 單一 SSoT）──
describe('buildRerunMap (tdb-5 rerun 聚合)', () => {
  let tmpDir: string;
  let testDb: Database.Database;

  function createSchema(conn: Database.Database) {
    conn.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        story_id       TEXT PRIMARY KEY,
        epic_id        TEXT NOT NULL DEFAULT '',
        domain         TEXT NOT NULL DEFAULT '',
        title          TEXT NOT NULL DEFAULT '',
        status         TEXT NOT NULL DEFAULT 'backlog',
        priority       TEXT,
        complexity     TEXT,
        story_type     TEXT,
        tags           TEXT,
        dev_agent      TEXT,
        review_agent   TEXT,
        cr_score       INTEGER,
        test_count     INTEGER,
        pipeline_notes TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT
      );
      CREATE TABLE IF NOT EXISTS worker_runs (
        run_id     TEXT PRIMARY KEY,
        story_id   TEXT NOT NULL,
        phase      TEXT NOT NULL,
        attempt    INTEGER NOT NULL DEFAULT 1,
        ipc_dir    TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      -- +CR F5：補生產表既有的 UNIQUE index（init-db.js:1384）。
      -- Story implementation_approach §3 的推論「同 (story_id,phase) 的 COUNT>1 必然蘊含
      -- MAX(attempt)>1」完全建立在這條約束上，但原 fixture 沒有它 —— 等於在一個
      -- 允許該推論不成立的 schema 上驗證依賴該推論的邏輯。
      CREATE UNIQUE INDEX IF NOT EXISTS ux_worker_runs_key ON worker_runs(story_id, phase, attempt);
    `);
  }

  function insertStory(storyId: string, pipelineNotes: string | null = null) {
    testDb.prepare(
      `INSERT INTO stories (story_id, epic_id, domain, title, status, pipeline_notes) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(storyId, 'epic-test', 'test', storyId, 'in-progress', pipelineNotes);
  }

  function insertRun(storyId: string, phase: string, attempt: number) {
    testDb.prepare(
      `INSERT INTO worker_runs (run_id, story_id, phase, attempt) VALUES (?, ?, ?, ?)`,
    ).run(`${storyId}-${phase}-${attempt}`, storyId, phase, attempt);
  }

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdb5-rerun-test-'));
    testDb = new Database(path.join(tmpDir, 'test.db'));
    createSchema(testDb);
    vi.doMock('../../db.js', () => ({ getDb: () => testDb }));
  });

  afterEach(() => {
    vi.doUnmock('../../db.js');
    vi.resetModules();
    try { testDb?.close(); } catch { /* ignore */ }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('(a) 同 (story,phase) attempt 1+2 兩列 → MAX(attempt)=2', async () => {
    insertStory('S1');
    insertRun('S1', 'dev-story', 1);
    insertRun('S1', 'dev-story', 2);
    const { getDbStoryList } = await import('../db-story-service.js');
    const s1 = getDbStoryList().find(x => x.key === 'S1');
    expect(s1?.metadata.rerun).toEqual({ dev: 2 });
  });

  it('(b) 單列 attempt=1 → null（嚴格非 {}）', async () => {
    insertStory('S2');
    insertRun('S2', 'dev-story', 1);
    const { getDbStoryList } = await import('../db-story-service.js');
    const s2 = getDbStoryList().find(x => x.key === 'S2');
    expect(s2?.metadata.rerun).toBeNull();
  });

  it('(c) 多 phase 混合 — 只含 mx>1 的 phase', async () => {
    insertStory('S3');
    insertRun('S3', 'create-story', 1);
    insertRun('S3', 'code-review', 1);
    insertRun('S3', 'code-review', 2);
    insertRun('S3', 'code-review', 3);
    const { getDbStoryList } = await import('../db-story-service.js');
    const s3 = getDbStoryList().find(x => x.key === 'S3');
    expect(s3?.metadata.rerun).toEqual({ review: 3 });
  });

  it('(d) 具名反例 — pipeline_notes 含 [rerun] 但 worker_runs 僅 1 列 attempt=1 → null（鎖死 AC2 不回頭採用受污染來源）', async () => {
    insertStory('S4', '[rerun] create-start 再次執行 @ 2026-08-02T10:00:00+08:00 (preserved existing value)');
    insertRun('S4', 'create-story', 1);
    const { getDbStoryList } = await import('../db-story-service.js');
    const s4 = getDbStoryList().find(x => x.key === 'S4');
    expect(s4?.metadata.rerun).toBeNull();
  });

  // +CR F4：getDbStory 單列路徑原先零測試覆蓋 —— stories-route.test.ts 對它整支 vi.fn() mock，
  // 故 rerun 併入該路徑的行為從未被任何測試執行過。本案例同時鎖住「單列只聚合該筆」。
  it('(e) getDbStory 單列路徑回傳該筆 rerun，且不摻入其他 story 的重跑', async () => {
    insertStory('S5');
    insertRun('S5', 'code-review', 1);
    insertRun('S5', 'code-review', 2);
    insertStory('S6');
    insertRun('S6', 'dev-story', 1);
    insertRun('S6', 'dev-story', 2);
    const { getDbStory } = await import('../db-story-service.js');
    expect(getDbStory('S5')?.metadata.rerun).toEqual({ review: 2 });
    expect(getDbStory('S6')?.metadata.rerun).toEqual({ dev: 2 });
  });

  // +CR F5：把 Story implementation_approach §3 的推論（UNIQUE 使 COUNT>1 蘊含 MAX(attempt)>1）
  // 變成機械斷言，而非只寫在文件裡。fixture 缺這條約束時本測試會失敗。
  it('(f) fixture schema 保有生產表的 ux_worker_runs_key UNIQUE 約束', () => {
    insertStory('S7');
    insertRun('S7', 'dev-story', 1);
    expect(() => insertRun('S7', 'dev-story', 1)).toThrow(/UNIQUE/i);
  });

  // +CR F3：查詢失敗時原本回空 Map 且完全無訊號 —— AC2 的驗收（全庫 rerun 皆 null）
  // 在「正確地無重跑」與「查詢整個壞掉」兩種情況下結果相同，無 warn 則永遠無法區分。
  it('(g) worker_runs 不可查時 fail-safe 回 null，且留下可觀測的警告', async () => {
    insertStory('S8');
    testDb.exec('DROP TABLE worker_runs');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { getDbStoryList } = await import('../db-story-service.js');
      const s8 = getDbStoryList().find(x => x.key === 'S8');
      expect(s8?.metadata.rerun).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

// ── sortStories 邏輯測試（純函式，不依賴 DB）──
describe('sortStories logic (AC-6)', () => {
  type SortableStory = { key: string; epicId: string; metadata: { lastUpdated: string | null } };
  const stories: SortableStory[] = [
    { key: 'a', epicId: 'epic-z', metadata: { lastUpdated: '2026-03-10' } },
    { key: 'b', epicId: 'epic-a', metadata: { lastUpdated: '2026-03-14' } },
    { key: 'c', epicId: 'epic-m', metadata: { lastUpdated: '2026-03-01' } },
  ];

  function sortStories(arr: SortableStory[], order: string): SortableStory[] {
    return [...arr].sort((a, b) => {
      switch (order) {
        case 'date-asc': {
          const ta = a.metadata.lastUpdated ?? '';
          const tb = b.metadata.lastUpdated ?? '';
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        }
        case 'date-desc': {
          const ta = a.metadata.lastUpdated ?? '';
          const tb = b.metadata.lastUpdated ?? '';
          return ta > tb ? -1 : ta < tb ? 1 : 0;
        }
        case 'epic-az':
          return a.epicId.localeCompare(b.epicId);
        case 'epic-za':
          return b.epicId.localeCompare(a.epicId);
        default:
          return 0;
      }
    });
  }

  it('AC-6: date-desc — 最新在前（2026-03-14 > 2026-03-10 > 2026-03-01）', () => {
    expect(sortStories(stories, 'date-desc').map(s => s.key)).toEqual(['b', 'a', 'c']);
  });

  it('AC-6: date-asc — 最舊在前（2026-03-01 > 2026-03-10 > 2026-03-14）', () => {
    expect(sortStories(stories, 'date-asc').map(s => s.key)).toEqual(['c', 'a', 'b']);
  });

  it('AC-6: epic-az — Epic A→Z 排序（epic-a < epic-m < epic-z）', () => {
    expect(sortStories(stories, 'epic-az').map(s => s.key)).toEqual(['b', 'c', 'a']);
  });

  it('AC-6: epic-za — Epic Z→A 排序（epic-z > epic-m > epic-a）', () => {
    expect(sortStories(stories, 'epic-za').map(s => s.key)).toEqual(['a', 'c', 'b']);
  });
});
