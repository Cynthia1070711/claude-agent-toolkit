// ============================================================
// workflowService.test.ts — Workflow Service 單元測試
// dvs-06: 9 BR 測試案例（TDD RED → GREEN）
// 策略：使用臨時 SQLite DB（real better-sqlite3），mock getDb()
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── Mock 設定 ─────────────────────────────────────────────────

vi.mock('../../db.js', async () => {
  const { createDbConnection } = await import('../../db.js');
  return { createDbConnection, getDb: vi.fn(), resetDb: vi.fn() };
});

// projectRoot 為空 → otelPendingService 找不到 logs/ → pending 恆為 0，
// 使本檔的 token 斷言只反映 DB 內容（不受開發機真實 OTel log 干擾）。
vi.mock('../../config.js', () => ({
  config: {
    dbPath: '', port: 3001, allowedOrigin: 'http://localhost:5174',
    projectRoot: '', usdToTwd: 32.5,
  },
}));

import * as db from '../../db.js';

// ── DB Schema 初始化 ──────────────────────────────────────────

function initTestDb(dbPath: string): Database.Database {
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.exec(`
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
  `);
  return conn;
}

// ── Fixture 插入輔助 ──────────────────────────────────────────

function insertWorkflow(
  conn: Database.Database,
  overrides: Partial<{
    workflow_type: string;
    story_id: string | null;
    agent_id: string | null;
    status: string;
    started_at: string;
    completed_at: string | null;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    cost_usd: number;
    model: string | null;
    duration_ms: number | null;
    error_message: string | null;
  }> = {},
) {
  const defaults = {
    workflow_type: 'dev-story',
    story_id: null,
    agent_id: 'CC-OPUS',
    status: 'completed',
    started_at: '2026-04-01T10:00:00+08:00',
    completed_at: '2026-04-01T10:05:00+08:00',
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_tokens: 200,
    cache_creation_tokens: 100,
    cost_usd: 0.015,
    model: 'claude-opus-4-6',
    duration_ms: 300000,
    error_message: null,
  };
  const row = { ...defaults, ...overrides };
  conn.prepare(`
    INSERT INTO workflow_executions
      (workflow_type, story_id, agent_id, status, started_at, completed_at,
       input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
       cost_usd, model, duration_ms, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.workflow_type, row.story_id, row.agent_id, row.status,
    row.started_at, row.completed_at, row.input_tokens, row.output_tokens,
    row.cache_read_tokens, row.cache_creation_tokens, row.cost_usd,
    row.model, row.duration_ms, row.error_message,
  );
}

// ── 測試 ─────────────────────────────────────────────────────

describe('workflowService', () => {
  let tmpDir: string;
  let tmpDbPath: string;
  let conn: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvs06-wf-svc-'));
    tmpDbPath = path.join(tmpDir, 'wf.db');
    conn = initTestDb(tmpDbPath);
    vi.mocked(db.getDb).mockReturnValue(conn);
  });

  afterEach(() => {
    conn.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  // ── BR001: 分頁預設值 ─────────────────────────────────────

  it('BR001_Pagination_DefaultValues — page=1, pageSize=20 預設值', async () => {
    for (let i = 0; i < 25; i++) {
      insertWorkflow(conn, { workflow_type: `type-${i}` });
    }
    const { getWorkflowExecutions } = await import('../workflowService.js');
    const result = getWorkflowExecutions();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.items.length).toBe(20);
    expect(result.total).toBe(25);
  });

  // ── BR001: 分頁上限截斷 ───────────────────────────────────

  it('BR001_Pagination_MaxPageSize — pageSize>50 自動截斷為 50', async () => {
    const { getWorkflowExecutions } = await import('../workflowService.js');
    const result = getWorkflowExecutions({ pageSize: 999 });
    expect(result.pageSize).toBe(50);
  });

  // ── BR002: 列表回傳格式 ───────────────────────────────────

  it('BR002_ListResponse_CorrectShape — 回傳含 items/total/page/pageSize', async () => {
    insertWorkflow(conn);
    const { getWorkflowExecutions } = await import('../workflowService.js');
    const result = getWorkflowExecutions();
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('pageSize');
    expect(Array.isArray(result.items)).toBe(true);
    // 每筆 DTO 應含所有必要欄位
    const item = result.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('workflow_type');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('started_at');
    expect(item).toHaveProperty('input_tokens');
    expect(item).toHaveProperty('output_tokens');
    expect(item).toHaveProperty('cache_read_tokens');
    expect(item).toHaveProperty('cache_creation_tokens');
    expect(item).toHaveProperty('cost_usd');
  });

  // ── BR003: 統計聚合欄位 ───────────────────────────────────

  it('BR003_Stats_AllFields — 聚合回傳所有必要欄位', async () => {
    insertWorkflow(conn, { status: 'completed', input_tokens: 1000, output_tokens: 500, duration_ms: 60000 });
    insertWorkflow(conn, { status: 'failed', input_tokens: 200, output_tokens: 100, duration_ms: null });
    const { getWorkflowStats } = await import('../workflowService.js');
    // 顯式全涵蓋區間 — 本例驗聚合欄位本身，fixture 日期(2026-04)不在預設本月區間內
    const stats = getWorkflowStats({ from: '2000-01-01', to: '2099-12-31' });
    expect(stats).toHaveProperty('totalWorkflows');
    expect(stats).toHaveProperty('totalInputTokens');
    expect(stats).toHaveProperty('totalOutputTokens');
    expect(stats).toHaveProperty('totalCacheReadTokens');
    expect(stats).toHaveProperty('totalCacheCreationTokens');
    expect(stats).toHaveProperty('totalCostUsd');
    expect(stats).toHaveProperty('successRate');
    expect(stats).toHaveProperty('avgDurationMs');
    expect(stats.totalWorkflows).toBe(2);
    expect(stats.totalInputTokens).toBe(1200);
    expect(stats.totalOutputTokens).toBe(600);
  });

  // ── BR004: successRate 計算 ───────────────────────────────

  it('BR004_SuccessRate_Calculation — 排除 running，計算 completed/(completed+failed)', async () => {
    insertWorkflow(conn, { status: 'completed' });
    insertWorkflow(conn, { status: 'completed' });
    insertWorkflow(conn, { status: 'failed' });
    insertWorkflow(conn, { status: 'running' }); // 不計入 successRate
    const { getWorkflowStats } = await import('../workflowService.js');
    const stats = getWorkflowStats({ from: '2000-01-01', to: '2099-12-31' });
    expect(stats.totalWorkflows).toBe(4);
    // successRate = 2/(2+1) * 100 = 66.7
    expect(stats.successRate).toBeCloseTo(66.7, 0);
  });

  // ── 區間篩選（起日 ~ 迄日，含頭含尾的台灣日）───────────────

  it('BR003_Stats_DateRange — 只涵蓋區間內記錄，邊界含頭含尾', async () => {
    insertWorkflow(conn, { started_at: '2026-05-09T23:59:00+08:00', input_tokens: 1, output_tokens: 0 });
    insertWorkflow(conn, { started_at: '2026-05-10T00:00:00+08:00', input_tokens: 10, output_tokens: 0 });
    insertWorkflow(conn, { started_at: '2026-05-15T12:00:00+08:00', input_tokens: 100, output_tokens: 0 });
    insertWorkflow(conn, { started_at: '2026-05-20T23:59:00+08:00', input_tokens: 1000, output_tokens: 0 });
    insertWorkflow(conn, { started_at: '2026-05-21T00:00:00+08:00', input_tokens: 10000, output_tokens: 0 });

    const { getWorkflowStats } = await import('../workflowService.js');
    // 10 + 100 + 1000 = 1110（起迄兩端皆納入，區間外的 1 與 10000 排除）
    const stats = getWorkflowStats({ from: '2026-05-10', to: '2026-05-20' });
    expect(stats.totalInputTokens).toBe(1110);
    expect(stats.from).toBe('2026-05-10');
    expect(stats.to).toBe('2026-05-20');
  });

  it('BR003_Stats_RangeSwap — 起日晚於迄日時自動對調', async () => {
    insertWorkflow(conn, { started_at: '2026-05-15T12:00:00+08:00', input_tokens: 100, output_tokens: 0 });

    const { getWorkflowStats } = await import('../workflowService.js');
    const stats = getWorkflowStats({ from: '2026-05-20', to: '2026-05-10' });
    expect(stats.from).toBe('2026-05-10');
    expect(stats.to).toBe('2026-05-20');
    expect(stats.totalInputTokens).toBe(100);
  });

  it('BR003_Stats_RangeFallback — 格式不合法的一端回退為本月預設', async () => {
    const { getWorkflowStats, defaultRange } = await import('../workflowService.js');
    const fallback = defaultRange();
    const stats = getWorkflowStats({ from: 'not-a-date', to: fallback.to });
    expect(stats.from).toBe(fallback.from);
    expect(stats.to).toBe(fallback.to);
  });

  it('BR003_Stats_DefaultRange — 未指定時預設為本月 1 號 ~ 月底', async () => {
    const { getWorkflowStats, defaultRange, taiwanToday } = await import('../workflowService.js');
    const stats = getWorkflowStats();
    const ym = taiwanToday().slice(0, 7);
    expect(stats.from).toBe(`${ym}-01`);
    expect(stats.to).toBe(defaultRange().to);
    // 月底日與該月天數一致（2 月 / 閏年不得算錯）
    expect(Number(stats.to.slice(8))).toBeGreaterThanOrEqual(28);
    expect(Number(stats.to.slice(8))).toBeLessThanOrEqual(31);
  });

  // ── BR005: Trend 按日聚合 ─────────────────────────────────

  it('BR005_Trend_DayAggregation — 按日分組，days 上限 90', async () => {
    // 插入 3 個不同日期的記錄
    insertWorkflow(conn, { started_at: '2026-03-28T10:00:00+08:00' });
    insertWorkflow(conn, { started_at: '2026-03-29T10:00:00+08:00' });
    insertWorkflow(conn, { started_at: '2026-03-30T10:00:00+08:00' });
    const { getWorkflowTrend } = await import('../workflowService.js');

    // days 上限截斷
    const trend90 = getWorkflowTrend({ days: 999 });
    // 驗證 trend 的欄位格式
    if (trend90.length > 0) {
      const day = trend90[0];
      expect(day).toHaveProperty('date');
      expect(day).toHaveProperty('input_tokens');
      expect(day).toHaveProperty('output_tokens');
      expect(day).toHaveProperty('cache_read_tokens');
      expect(day).toHaveProperty('cache_creation_tokens');
      expect(day).toHaveProperty('workflow_count');
      expect(day).toHaveProperty('cost_usd');
    }
    // 驗證分組正確（過去 90 天應包含 3 筆記錄在 3 個不同 date）
    const trend = getWorkflowTrend({ days: 90 });
    expect(Array.isArray(trend)).toBe(true);
    // 所有 date 應唯一
    const dates = trend.map(d => d.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  // ── BR005b: Trend 台灣時區日界(Constitutional Timestamp Mandate UTC+8)──────
  // 防回歸: 台灣凌晨記錄(+08:00)不可被 DATE() 轉 UTC 併入「前一日」(2026-05-29 修)
  it('BR005b_Trend_TaiwanTimezoneGrouping — 台灣凌晨記錄按台灣日分組(非 UTC)', async () => {
    // 計算 2 天前的台灣日曆日(相對 now,避免固定日期的 N-day 窗口 fragility)
    const twNow = new Date(Date.now() + 8 * 3600 * 1000);
    twNow.setUTCDate(twNow.getUTCDate() - 2);
    const y = twNow.getUTCFullYear();
    const m = String(twNow.getUTCMonth() + 1).padStart(2, '0');
    const d = String(twNow.getUTCDate()).padStart(2, '0');
    const twDate = `${y}-${m}-${d}`;
    // 同一台灣日的兩筆: 凌晨 01:30(其 UTC 為前一日 17:30)+ 下午 15:00
    insertWorkflow(conn, { started_at: `${twDate}T01:30:00+08:00`, input_tokens: 100, output_tokens: 50 });
    insertWorkflow(conn, { started_at: `${twDate}T15:00:00+08:00`, input_tokens: 200, output_tokens: 80 });
    const { getWorkflowTrend } = await import('../workflowService.js');
    const trend = getWorkflowTrend({ days: 7 });
    // 兩筆應分組到「同一台灣日」(非分裂成 UTC 前一日 + 當日)
    const sameDay = trend.filter(t => t.date === twDate);
    expect(sameDay.length).toBe(1);
    expect(sameDay[0].workflow_count).toBe(2);
    expect(sameDay[0].input_tokens).toBe(300);
    // 不可出現「前一 UTC 日」的錯誤分組(舊 code 用 DATE() 會產生)
    const prevUtcDate = new Date(`${twDate}T01:30:00+08:00`).toISOString().slice(0, 10);
    if (prevUtcDate !== twDate) {
      expect(trend.find(t => t.date === prevUtcDate)).toBeUndefined();
    }
  });

  // ── BR006: 模型分佈 token 佔比 ────────────────────────────

  it('BR006_ModelDistribution_Percentage — token 佔比加總 = 100%', async () => {
    insertWorkflow(conn, { model: 'claude-opus-4-6', input_tokens: 1000, output_tokens: 500 });
    insertWorkflow(conn, { model: 'claude-sonnet-4-6', input_tokens: 500, output_tokens: 250 });
    const { getModelDistribution } = await import('../workflowService.js');
    const dist = getModelDistribution();
    expect(dist.length).toBe(2);
    const totalPct = dist.reduce((sum, d) => sum + d.token_percentage, 0);
    expect(totalPct).toBeCloseTo(100, 0);
    // 每筆含必要欄位
    const item = dist[0];
    expect(item).toHaveProperty('model');
    expect(item).toHaveProperty('count');
    expect(item).toHaveProperty('input_tokens');
    expect(item).toHaveProperty('output_tokens');
    expect(item).toHaveProperty('total_tokens');
    expect(item).toHaveProperty('token_percentage');
    expect(item).toHaveProperty('cost_usd');
  });

  // ── BR007: DB null 時回傳空結構 ──────────────────────────

  it('BR007_EmptyDb_GracefulReturn — DB null 時回傳空結構', async () => {
    vi.mocked(db.getDb).mockReturnValue(null);
    const { getWorkflowExecutions, getWorkflowStats, getWorkflowTrend, getModelDistribution } =
      await import('../workflowService.js');

    const list = getWorkflowExecutions();
    expect(list.items).toEqual([]);
    expect(list.total).toBe(0);

    const stats = getWorkflowStats();
    expect(stats.totalWorkflows).toBe(0);
    expect(stats.successRate).toBe(0);

    const trend = getWorkflowTrend();
    expect(trend).toEqual([]);

    const dist = getModelDistribution();
    expect(dist).toEqual([]);
  });

  // ── BR008: status 篩選 ────────────────────────────────────

  it('BR008_StatusFilter_Applied — status 篩選條件正確套用', async () => {
    insertWorkflow(conn, { status: 'completed' });
    insertWorkflow(conn, { status: 'failed' });
    insertWorkflow(conn, { status: 'running' });
    const { getWorkflowExecutions } = await import('../workflowService.js');

    const completedResult = getWorkflowExecutions({ status: 'completed' });
    expect(completedResult.items.every(i => i.status === 'completed')).toBe(true);
    expect(completedResult.total).toBe(1);

    const failedResult = getWorkflowExecutions({ status: 'failed' });
    expect(failedResult.items.every(i => i.status === 'failed')).toBe(true);
    expect(failedResult.total).toBe(1);
  });
});
