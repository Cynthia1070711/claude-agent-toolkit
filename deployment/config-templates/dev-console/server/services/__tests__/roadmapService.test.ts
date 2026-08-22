// ============================================================
// roadmapService.test.ts — tdb-1-track-plan-roadmap
// resolveDependencies() 純函式測試 + getRoadmap() 母體/gate/排序/leverage/children_progress 整合測試。
// 隔離 temp DB（DDL 逐字複製自 migrations/2026-07-28-add-track-plan-table.sql）。
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const TRACK_PLAN_SQL_PATH = path.join(REPO_ROOT, '.context-db', 'migrations', '2026-07-28-add-track-plan-table.sql');

const STORIES_SCHEMA = `
  CREATE TABLE stories (
    story_id TEXT PRIMARY KEY, epic_id TEXT, domain TEXT, title TEXT, status TEXT,
    priority TEXT, complexity TEXT, story_type TEXT, dependencies TEXT, tags TEXT,
    file_list TEXT, dev_agent TEXT, review_agent TEXT, source_file TEXT, created_at TEXT,
    user_story TEXT, background TEXT, acceptance_criteria TEXT, tasks TEXT, affected_files TEXT,
    cr_score INTEGER, test_count INTEGER, discovery_source TEXT, updated_at TEXT,
    dev_notes TEXT, required_skills TEXT, implementation_approach TEXT, risk_assessment TEXT,
    testing_strategy TEXT, rollback_plan TEXT, monitoring_plan TEXT, definition_of_done TEXT,
    cr_issues_total INTEGER, cr_issues_fixed INTEGER, cr_issues_deferred INTEGER, cr_summary TEXT,
    started_at TEXT, completed_at TEXT, review_completed_at TEXT, execution_log TEXT,
    sdd_spec TEXT, create_agent TEXT, create_started_at TEXT, create_completed_at TEXT,
    pipeline_notes TEXT, review_started_at TEXT, task_track TEXT
  );
`;

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.exec(STORIES_SCHEMA);
  conn.exec(fs.readFileSync(TRACK_PLAN_SQL_PATH, 'utf8'));
  return conn;
}

interface StoryRow {
  story_id: string;
  epic_id?: string;
  title?: string;
  status?: string;
  priority?: string | null;
  complexity?: string | null;
  dependencies?: string | null;
  updated_at?: string;
}

function insertStory(conn: Database.Database, row: StoryRow): void {
  conn.prepare(
    `INSERT INTO stories (story_id, epic_id, title, status, priority, complexity, dependencies, updated_at)
     VALUES (@story_id, @epic_id, @title, @status, @priority, @complexity, @dependencies, @updated_at)`,
  ).run({
    story_id: row.story_id,
    epic_id: row.epic_id ?? 'epic-test',
    title: row.title ?? `Title of ${row.story_id}`,
    status: row.status ?? 'ready-for-dev',
    priority: row.priority ?? 'P2',
    complexity: row.complexity ?? 'M',
    dependencies: row.dependencies ?? null,
    updated_at: row.updated_at ?? '2026-07-28T09:00:00+08:00',
  });
}

interface TrackPlanRow {
  story_id: string;
  lane: string;
  seq?: number | null;
  plan_state?: string;
  pause_reason?: string | null;
  unlock_note?: string | null;
  updated_at?: string;
}

function insertTrackPlan(conn: Database.Database, row: TrackPlanRow): void {
  conn.prepare(
    `INSERT INTO track_plan (story_id, lane, seq, plan_state, pause_reason, unlock_note, updated_at, updated_by)
     VALUES (@story_id, @lane, @seq, @plan_state, @pause_reason, @unlock_note, @updated_at, 'test')`,
  ).run({
    story_id: row.story_id,
    lane: row.lane,
    seq: row.seq ?? null,
    plan_state: row.plan_state ?? 'queued',
    pause_reason: row.pause_reason ?? null,
    unlock_note: row.unlock_note ?? null,
    updated_at: row.updated_at ?? '2026-07-28T09:00:00+08:00',
  });
}

vi.mock('../../db.js', async () => {
  const { createDbConnection } = await import('../../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

import * as db from '../../db.js';
import { resolveDependencies, getRoadmap, isDbReady } from '../roadmapService.js';

// ============================================================
// resolveDependencies() — 純函式，無需 DB
// ============================================================
describe('resolveDependencies', () => {
  const knownIds = [
    'tdb-1-track-plan-roadmap', 'tdb-2-sprint-status-freeze-refs', 'tdb-3-sop-skill', 'tdb-4-snapshot-retire',
    'whp-4-write-path-wiring',
  ];

  it('BR025_ResolveDependencies_RangeNotation_ExpandsFour: tdb-1~4 展開為 4 個 + whp-4 全解析', () => {
    const result = resolveDependencies('子卡 tdb-1~4;D6 收口項 dep whp-4-write-path-wiring。', knownIds);
    expect(result.blockedBy).toEqual(
      expect.arrayContaining([
        'tdb-1-track-plan-roadmap', 'tdb-2-sprint-status-freeze-refs',
        'tdb-3-sop-skill', 'tdb-4-snapshot-retire', 'whp-4-write-path-wiring',
      ]),
    );
    expect(result.blockedBy.length).toBe(5);
  });

  it('BR025_ResolveDependencies_FullWidthParens_Stripped: 全形括號註記剝除，token 仍解析', () => {
    const result = resolveDependencies('bwu-3（進行中）+ tdb-1（track_plan 先存在）', ['bwu-3-dev-consume-review-audit', 'tdb-1-track-plan-roadmap']);
    expect(result.blockedBy.sort()).toEqual(['bwu-3-dev-consume-review-audit', 'tdb-1-track-plan-roadmap'].sort());
  });

  it('BR026_ResolveDependencies_AmbiguousPrefix_LeavesUnresolved: 多重命中 token 不得任選其一', () => {
    const result = resolveDependencies('foo-1 相關卡', ['foo-1-a', 'foo-1-b']);
    expect(result.blockedBy).toEqual([]);
  });

  it('BR027_ResolveDependencies_ExternalOnlyWithUnlockNote_GateWaitingExternal: 純外部條件文字零 token', () => {
    const result = resolveDependencies('01 章 UI 規格 v1.1.0（architect 審查修訂後）為 create 輸入', knownIds);
    expect(result.blockedBy).toEqual([]);
    expect(result.explicitlyNone).toBe(false);
  });

  it('顯式「無」開頭標記 explicitlyNone=true（與零 token 但無「無」不同語意）', () => {
    const result = resolveDependencies('無(SOP 草案已由使用者核可為最終內容)。', knownIds);
    expect(result.blockedBy).toEqual([]);
    expect(result.explicitlyNone).toBe(true);
  });

  it('空格型範圍記法「whp-1 ~ whp-11」正確展開並標記 rangeChildren', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `whp-${i + 1}-x`);
    const result = resolveDependencies('逐子卡 whp-1 ~ whp-11 依序推進', ids);
    expect(result.blockedBy.length).toBe(11);
    expect(result.rangeChildren.length).toBe(11);
  });

  it('清單記法「ccb-1/2/3」展開為三個獨立 id 並標記 rangeChildren', () => {
    const ids = ['ccb-1-db-mcp-import', 'ccb-2-unread-inject-hook', 'ccb-3-devconsole-channel-page'];
    const result = resolveDependencies('子卡 ccb-1/2/3', ids);
    expect(result.blockedBy.sort()).toEqual([...ids].sort());
    expect(result.rangeChildren.sort()).toEqual([...ids].sort());
  });

  it('空字串 / null 輸入回傳空結果，不拋例外', () => {
    expect(resolveDependencies(null, knownIds)).toEqual({ blockedBy: [], explicitlyNone: false, rangeChildren: [] });
    expect(resolveDependencies('', knownIds)).toEqual({ blockedBy: [], explicitlyNone: false, rangeChildren: [] });
  });

  // [tdb-1 CR] BR-028 補件 —— testing_strategy 具名此案例但 dev-story 未落地,且未列入「具名豁免行」。
  // 判定率 100% = 每列「或解析出 ≥1 具名 blocked_by、或顯式聲明無依賴」,不得出現「全 token 未解析
  // ∧ 非顯式無依賴」的 deps_raw ⚠ 列。語料為 2026-07-28 自 DB 取出的**逐字真實 dependencies**
  // （截斷但保留各自記法特徵）—— 刻意不查活庫以維持測試 hermetic（phycool.db 為 gitignored,
  // CI / fresh clone 無此檔）。活庫全 30 列的實測於 code-review 以獨立腳本量得 deps_raw ⚠ = 0。
  it('BR028_ResolveDependencies_RealCorpus_HundredPercentResolved: 真實語料每列皆可判定,零 deps_raw ⚠', () => {
    const realIds = [
      'bwu-1-inject-and-drift-repair', 'bwu-2-create-testspec-production', 'bwu-3-dev-consume-review-audit',
      'bwu-4-p1-distill-and-coverage', 'bwu-5-manual-window-inject-hook', 'bwu-bmad-spec-closure-upgrade',
      'ccb-1-db-mcp-import', 'ccb-2-unread-inject-hook', 'ccb-3-devconsole-channel-page', 'ccb-controller-chat-board',
      'tdb-1-track-plan-roadmap', 'tdb-2-sprint-status-freeze-refs', 'tdb-3-sop-skill', 'tdb-4-snapshot-retire',
      'tdb-controller-track-db',
      ...Array.from({ length: 11 }, (_, i) => `whp-${i + 1}-x`),
      'whp-worker-handshake-protocol',
    ];

    // 每筆 = [情境標籤, 逐字 dependencies 片段]
    const corpus: Array<[string, string]> = [
      ['傘卡:顯式無 + 空格型範圍 whp-1 ~ whp-11',
        '無。本卡為傘卡,不直接 dev;逐子卡 whp-1 ~ whp-11 依序推進。'],
      ['收口卡:清單記法 ccb-1/2/3',
        '子卡 ccb-1/2/3;排程接 epic-whp(whp-5 檔案序列)之後。'],
      ['收口卡:緊湊範圍 tdb-1~4 + 完整 id',
        '子卡 tdb-1~4;D6 收口項 dep whp-4-write-path-wiring。'],
      ['短前綴 bwu-3 + 全形括號註記',
        'bwu-3(CR workflow 同資料夾檔案序列,避免交疊)。覆蓋率統一值 80% 為中控自決,使用者可否決改 70。'],
      ['「+」分隔 + 全形括號',
        'whp-4(dedup guard 已改 DB turn_count)+ whp-5(訊息表)。**純加速,不影響正確性** —— 可最後做。'],
      ['emoji 前綴 + 完整 id + 短前綴混用',
        '🔴 bwu-3-dev-consume-review-audit done(dev/review workflow 同檔交疊,後動者=本卡;bwu-3 進行中)+ tdb-1(track_plan 先存在)。'],
      ['大寫 TD- 債務編號混入(不得誤匹配為 story)',
        'whp-3(四表必須先存在)。; TD-WHP3-REAPER-DISPATCH-RACE-NO-GRACE-WINDOW (from whp-3-db-schema-registry CR R1, DEFERRED/open)'],
      ['顯式「無硬依賴」+ 軟排序建議 tdb-1/2',
        '無硬依賴;建議排 tdb-1/2 後(低優先)。'],
      ['傘卡:顯式無 + 散文提及多卡',
        '無。本卡為傘卡,不直接 dev;逐子卡推進。與 epic-whp 並行無衝突(唯 whp-6 軟依賴 bwu-1、whp-5 與 bwu-1 同檔 server.js 序列)。'],
      ['並行協調註記(非硬依賴)',
        'ccb-1(tools/表先落地);與 bwu-5 同掛載點 — 開工時對表 bwu-5 狀態,先落地者先註冊、後者 rebase settings.json,職責正交不合併。'],
    ];

    const unresolvable: string[] = [];
    for (const [label, deps] of corpus) {
      const r = resolveDependencies(deps, realIds);
      // 判定成立 = 有具名 blocked_by 或顯式聲明無依賴
      if (r.blockedBy.length === 0 && !r.explicitlyNone) unresolvable.push(label);
    }
    expect(unresolvable, `以下情境無法判定（會在 /roadmap 顯示 deps_raw ⚠）: ${unresolvable.join(' | ')}`).toEqual([]);
  });

  it('BR028 反例對照:純外部條件且未顯式聲明無依賴 → 落入未判定（證明上述斷言非恆真）', () => {
    const r = resolveDependencies('等待使用者對第 01 章 UI 規格的審查結論', ['tdb-1-track-plan-roadmap']);
    expect(r.blockedBy).toEqual([]);
    expect(r.explicitlyNone).toBe(false); // → showDepsRaw 成立,頁面顯示 ⚠（此時應由 unlock_note 補述）
  });
});

// ============================================================
// getRoadmap() — 整合測試（temp DB）
// ============================================================
describe('getRoadmap', () => {
  let tmpDir: string;
  let conn: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvc-roadmap-svc-'));
    conn = initTestDb(path.join(tmpDir, 'roadmap.db'));
    vi.mocked(db.getDb).mockReturnValue(conn);
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('isDbReady reflects getDb() null/non-null', () => {
    expect(isDbReady()).toBe(true);
    vi.mocked(db.getDb).mockReturnValue(null);
    expect(isDbReady()).toBe(false);
  });

  it('BR029_GetRoadmap_RenderScope_Returns17Not175: epic 白名單子查詢排除非五軌 epic', () => {
    // 5 軌 epic 各 1 張待推卡
    insertStory(conn, { story_id: 'a-1', epic_id: 'epic-a', status: 'ready-for-dev' });
    insertTrackPlan(conn, { story_id: 'a-1', lane: 'manual', seq: 1 });
    // 非五軌 epic：不進 track_plan，且不應出現在渲染結果
    insertStory(conn, { story_id: 'foreign-1', epic_id: 'epic-foreign', status: 'ready-for-dev' });

    const result = getRoadmap();
    const allIds = result.lanes.flatMap((l) => l.cards.map((c) => c.story_id));
    expect(allIds).toContain('a-1');
    expect(allIds).not.toContain('foreign-1');
    expect(allIds.filter((id) => id.startsWith('foreign')).length).toBe(0);
  });

  it('BR030_GetRoadmap_DoneRevertedToReview_CardReappears: status 即時判非 plan_state 快照', () => {
    insertStory(conn, { story_id: 'b-1', epic_id: 'epic-b', status: 'review' });
    insertTrackPlan(conn, { story_id: 'b-1', lane: 'manual', seq: null, plan_state: 'done-exited' });

    const result = getRoadmap();
    const ids = result.lanes.flatMap((l) => l.cards.map((c) => c.story_id));
    expect(ids).toContain('b-1');
  });

  it('BR030_GetRoadmap_SkippedStatus_NotRendered: skipped 不在 CANCELLED_STATUSES 4 值內，需顯式排除', () => {
    insertStory(conn, { story_id: 'c-1', epic_id: 'epic-c', status: 'skipped' });
    insertTrackPlan(conn, { story_id: 'c-1', lane: 'manual', seq: 1 });

    const result = getRoadmap();
    const ids = result.lanes.flatMap((l) => l.cards.map((c) => c.story_id));
    expect(ids).not.toContain('c-1');
  });

  it('BR031_GetRoadmap_PausedAndInProgress_GateIsPaused: paused 優先於 inflight', () => {
    insertStory(conn, { story_id: 'd-1', epic_id: 'epic-d', status: 'in-progress' });
    insertTrackPlan(conn, { story_id: 'd-1', lane: 'manual', seq: 1, plan_state: 'paused', pause_reason: '等待人工確認' });

    const result = getRoadmap();
    const card = result.lanes.flatMap((l) => l.cards).find((c) => c.story_id === 'd-1')!;
    expect(card.gate).toBe('paused');
    expect(card.gate_note).toBe('等待人工確認');
  });

  it('BR031_GetRoadmap_UnlockedOverrideWithBlockingDep_GateIsUnlocked: 人工 override 優先於 blocked 推導', () => {
    insertStory(conn, { story_id: 'e-1', epic_id: 'epic-e', status: 'ready-for-dev', dependencies: 'e-2' });
    insertStory(conn, { story_id: 'e-2', epic_id: 'epic-e', status: 'ready-for-dev' });
    insertTrackPlan(conn, { story_id: 'e-1', lane: 'manual', seq: 1, plan_state: 'unlocked' });
    insertTrackPlan(conn, { story_id: 'e-2', lane: 'manual', seq: 2 });

    const result = getRoadmap();
    const card = result.lanes.flatMap((l) => l.cards).find((c) => c.story_id === 'e-1')!;
    expect(card.gate).toBe('unlocked');
  });

  it('BR032_GetRoadmap_SupersededUpstream_DownstreamNotBlocked: 取消的上游不永久卡死下游', () => {
    insertStory(conn, { story_id: 'f-1', epic_id: 'epic-f', status: 'ready-for-dev', dependencies: 'f-2' });
    insertStory(conn, { story_id: 'f-2', epic_id: 'epic-f', status: 'superseded' });
    insertTrackPlan(conn, { story_id: 'f-1', lane: 'manual', seq: 1 });

    const result = getRoadmap();
    const card = result.lanes.flatMap((l) => l.cards).find((c) => c.story_id === 'f-1')!;
    expect(card.gate).not.toBe('blocked');
  });

  it('BR033_UnlockLeverage_CountsOtherPendingReferrers: 槓桿計數反查其他待推卡引用數', () => {
    insertStory(conn, { story_id: 'g-1', epic_id: 'epic-g', status: 'ready-for-dev' });
    insertStory(conn, { story_id: 'g-2', epic_id: 'epic-g', status: 'ready-for-dev', dependencies: 'g-1' });
    insertStory(conn, { story_id: 'g-3', epic_id: 'epic-g', status: 'ready-for-dev', dependencies: 'g-1' });
    insertTrackPlan(conn, { story_id: 'g-1', lane: 'manual', seq: 1 });
    insertTrackPlan(conn, { story_id: 'g-2', lane: 'manual', seq: 2 });
    insertTrackPlan(conn, { story_id: 'g-3', lane: 'manual', seq: 3 });

    const result = getRoadmap();
    const card = result.lanes.flatMap((l) => l.cards).find((c) => c.story_id === 'g-1')!;
    expect(card.unlock_leverage).toBeGreaterThanOrEqual(2);
  });

  it('BR034_GetRoadmap_SortOrder_GateThenPriorityThenLeverageThenSeq: 排序鍵五層', () => {
    // 兩張皆 unlocked，P0 應排在 P1 前
    insertStory(conn, { story_id: 'h-p1', epic_id: 'epic-h', status: 'ready-for-dev', priority: 'P1' });
    insertStory(conn, { story_id: 'h-p0', epic_id: 'epic-h', status: 'ready-for-dev', priority: 'P0' });
    insertTrackPlan(conn, { story_id: 'h-p1', lane: 'manual', seq: 1 });
    insertTrackPlan(conn, { story_id: 'h-p0', lane: 'manual', seq: 2 });

    const result = getRoadmap();
    const manualIds = result.lanes.find((l) => l.lane === 'manual')!.cards.map((c) => c.story_id);
    expect(manualIds.indexOf('h-p0')).toBeLessThan(manualIds.indexOf('h-p1'));
  });

  it('BR035_GetRoadmap_StoryWithoutTrackPlanRow_MarkedUnplanned: 未排程卡標記正確 + 計入 KPI', () => {
    insertStory(conn, { story_id: 'i-1', epic_id: 'epic-i', status: 'ready-for-dev' });
    insertStory(conn, { story_id: 'i-2', epic_id: 'epic-i', status: 'ready-for-dev' });
    insertTrackPlan(conn, { story_id: 'i-1', lane: 'manual', seq: 1 }); // i-1 建立白名單 epic-i；i-2 故意不進 track_plan

    const result = getRoadmap();
    const card = result.lanes.flatMap((l) => l.cards).find((c) => c.story_id === 'i-2')!;
    expect(card.unplanned).toBe(true);
    expect(card.seq).toBeNull();
    expect(result.kpi.unplanned).toBe(1);
  });

  it('BR042_GetRoadmapRoute_ReconcileCard_HasChildrenProgress: 僅 reconcile lane 卡回傳 children_progress', () => {
    insertStory(conn, { story_id: 'j-1', epic_id: 'epic-j', status: 'ready-for-dev' });
    insertStory(conn, { story_id: 'j-2', epic_id: 'epic-j', status: 'done' });
    insertStory(conn, { story_id: 'j-recon', epic_id: 'epic-j', status: 'backlog', dependencies: '子卡 j-1~2' });
    insertTrackPlan(conn, { story_id: 'j-1', lane: 'manual', seq: 1 });
    // j-2 為 done 子卡：對齊真實系統慣例，done 卡同樣有 track_plan 列（plan_state='done-exited'，seq=NULL）
    // ——resolveDependencies() 的 knownStoryIds 全集來自 track_plan.story_id，缺列會使 token 無法解析。
    insertTrackPlan(conn, { story_id: 'j-2', lane: 'manual', seq: null, plan_state: 'done-exited' });
    insertTrackPlan(conn, { story_id: 'j-recon', lane: 'reconcile', seq: null, plan_state: 'queued' });

    const result = getRoadmap();
    const reconCard = result.lanes.find((l) => l.lane === 'reconcile')!.cards.find((c) => c.story_id === 'j-recon')!;
    expect(reconCard.children_progress).toEqual({ done: 1, total: 2 });

    const manualCard = result.lanes.find((l) => l.lane === 'manual')!.cards.find((c) => c.story_id === 'j-1')!;
    expect(manualCard.children_progress).toBeNull();
  });

  it('kpi.pending 不含 inflight 與 paused', () => {
    insertStory(conn, { story_id: 'k-unlocked', epic_id: 'epic-k', status: 'ready-for-dev' });
    insertStory(conn, { story_id: 'k-inflight', epic_id: 'epic-k', status: 'in-progress' });
    insertStory(conn, { story_id: 'k-paused', epic_id: 'epic-k', status: 'in-progress' });
    insertTrackPlan(conn, { story_id: 'k-unlocked', lane: 'manual', seq: 1 });
    insertTrackPlan(conn, { story_id: 'k-inflight', lane: 'manual', seq: 2 });
    insertTrackPlan(conn, { story_id: 'k-paused', lane: 'manual', seq: 3, plan_state: 'paused', pause_reason: 'x' });

    const result = getRoadmap();
    expect(result.kpi.pending).toBe(1);
    expect(result.kpi.inflight).toBe(1);
    expect(result.kpi.paused).toBe(1);
  });

  it('generated_at 為 offset-aware（+08:00 結尾）', () => {
    insertStory(conn, { story_id: 'l-1', epic_id: 'epic-l', status: 'ready-for-dev' });
    insertTrackPlan(conn, { story_id: 'l-1', lane: 'manual', seq: 1 });
    const result = getRoadmap();
    expect(result.generated_at).toMatch(/\+08:00$/);
  });

  it('每張卡回傳 16 個指定欄位', () => {
    insertStory(conn, { story_id: 'm-1', epic_id: 'epic-m', status: 'ready-for-dev' });
    insertTrackPlan(conn, { story_id: 'm-1', lane: 'manual', seq: 1 });
    const result = getRoadmap();
    const card = result.lanes.flatMap((l) => l.cards)[0];
    const expectedKeys = [
      'story_id', 'title', 'title_short', 'priority', 'complexity', 'gate', 'gate_note',
      'gate_since', 'unlock_note', 'unlock_leverage', 'deps_raw', 'blocked_by',
      'children_progress', 'unplanned', 'seq', 'updated_at',
    ].sort();
    expect(Object.keys(card).sort()).toEqual(expectedKeys);
  });
});

// ============================================================
// BR-037: 零寫入路徑（靜態掃描）
// ============================================================
describe('BR037_RoadmapService_HasNoWritePath', () => {
  it('roadmapService.ts 不含 INSERT/UPDATE/DELETE 語句', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'roadmapService.ts'), 'utf8');
    const hits = (src.match(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/g) || []).length;
    expect(hits).toBe(0);
  });
});
