// ============================================================
// workflowService.ts — Workflow 執行 DB 查詢服務層
// dvs-06: 4 個查詢函式，遵循 techDebtService/sessionService 模式
// better-sqlite3 同步 API（非 async）
// ============================================================
import { getDb } from '../db.js';
import { config } from '../config.js';
import { readPendingOtelByDay, type PendingDayTotals } from './otelPendingService.js';

// ── 型別定義 ──────────────────────────────────────────────────

/** 統計區間（含頭含尾的台灣日，YYYY-MM-DD）*/
export interface DateRange {
  from: string;
  to: string;
}

export interface WorkflowExecutionDto {
  id: number;
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
}

export interface WorkflowListResponse {
  items: WorkflowExecutionDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WorkflowStatsResponse {
  totalWorkflows: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  successRate: number;    // 百分比 0~100
  avgDurationMs: number;  // 僅 completed 的平均
  zeroTokenPct: number;   // token=0 記錄佔比 0~100（數據品質指標）
  /** 本次統計實際套用的區間（含頭含尾；輸入不合法時為回退後的值）*/
  from: string;
  to: string;
  /** 區間內尚未聚合進 DB 的 OTel token（input+output），0 表示全部已落盤 */
  pendingTokens: number;
  /** USD → TWD 匯率（server/config.ts `usdToTwd` / env `USD_TO_TWD`，手動維護）*/
  usdToTwd: number;
}

export interface WorkflowTrendDay {
  date: string;             // YYYY-MM-DD
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  workflow_count: number;
  cost_usd: number;
}

export interface ModelDistributionItem {
  model: string;
  count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;       // input + output
  token_percentage: number;   // 佔全部 total_tokens 的百分比
  cost_usd: number;
}

export interface WorkflowQueryOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  workflow_type?: string;
  story_id?: string;
}

// ── 空結構常數 ────────────────────────────────────────────────

const EMPTY_STATS: WorkflowStatsResponse = {
  totalWorkflows: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalCostUsd: 0,
  successRate: 0,
  avgDurationMs: 0,
  zeroTokenPct: 0,
  from: '',
  to: '',
  pendingTokens: 0,
  usdToTwd: 0,
};

// 排除種子估計數據的基礎條件
const EXCLUDE_SEED = "workflow_type NOT LIKE '%--seed-estimate%'";

// ── 區間篩選（台灣日界，對齊 started_at 的 +08:00 字面值）────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 台灣牆鐘日（對齊 scripts/otel-session-aggregate.js todayStr 範式）*/
export function taiwanToday(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10);
}

/** 預設區間 = 本月全部（1 號 ~ 月底），以台灣日為準 */
export function defaultRange(): DateRange {
  const today = taiwanToday();
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 為 1-based → 下月第 0 日 = 本月最後一日
  return {
    from: `${today.slice(0, 7)}-01`,
    to: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * 正規化使用者輸入的區間：格式不合法的一端回退為預設值；
 * 起日晚於迄日時對調（信任邊界防護，不讓前端約束是唯一保險）。
 */
export function normalizeRange(input: Partial<DateRange> = {}): DateRange {
  const fallback = defaultRange();
  let from = input.from && DATE_RE.test(input.from) ? input.from : fallback.from;
  let to = input.to && DATE_RE.test(input.to) ? input.to : fallback.to;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

// ── 工具：建構條件式 WHERE 子句 ──────────────────────────────

function buildWhere(
  conditions: string[],
): string {
  return conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
}

/** 取出落在指定區間內、尚未聚合進 DB 的 OTel 每日總量 */
function pendingInRange(range: DateRange): PendingDayTotals[] {
  return [...readPendingOtelByDay().values()].filter(
    (p) => p.date >= range.from && p.date <= range.to,
  );
}

// ── 查詢函式 ──────────────────────────────────────────────────

/**
 * BR-001/002: 分頁查詢 workflow_executions 列表。
 * page 預設 1，pageSize 預設 20，上限 50。
 */
export function getWorkflowExecutions(options: WorkflowQueryOptions = {}): WorkflowListResponse {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));

  const db = getDb();
  if (!db) return { items: [], total: 0, page, pageSize };

  const conditions: string[] = [EXCLUDE_SEED];
  const params: unknown[] = [];

  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options.workflow_type) {
    conditions.push('workflow_type = ?');
    params.push(options.workflow_type);
  }
  if (options.story_id) {
    conditions.push('story_id = ?');
    params.push(options.story_id);
  }

  const where = buildWhere(conditions);

  try {
    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM workflow_executions ${where}`)
      .get(...params) as { total: number };

    const total = countRow.total;
    const offset = (page - 1) * pageSize;

    const items = db
      .prepare(
        `SELECT * FROM workflow_executions ${where}
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as WorkflowExecutionDto[];

    return { items, total, page, pageSize };
  } catch {
    return { items: [], total: 0, page, pageSize };
  }
}

/**
 * BR-003/004: 聚合統計。
 * successRate = completed / (completed + failed) × 100，排除 running。
 *
 * from/to 為含頭含尾的台灣日區間，預設本月全部（舊版無日期條件實為全時段，
 * 與卡片標題「本月」不符）。起日晚於迄日時由 normalizeRange 對調。
 * token / cost 會合併「已寫入 OTel JSONL 但尚未經 SessionEnd Hook 聚合進 DB」的
 * 尾段，否則主視窗當日消耗要等 session 結束才看得到。
 */
export function getWorkflowStats(
  options: { status?: string; from?: string; to?: string } = {},
): WorkflowStatsResponse {
  const range = normalizeRange(options);
  const usdToTwd = config.usdToTwd;
  const db = getDb();
  if (!db) return { ...EMPTY_STATS, ...range, usdToTwd };

  const conditions: string[] = [EXCLUDE_SEED, 'substr(started_at, 1, 10) BETWEEN ? AND ?'];
  const params: unknown[] = [range.from, range.to];

  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }

  const where = buildWhere(conditions);

  try {
    const statsRow = db
      .prepare(
        `SELECT
           COUNT(*) as totalWorkflows,
           COALESCE(SUM(input_tokens), 0) as totalInputTokens,
           COALESCE(SUM(output_tokens), 0) as totalOutputTokens,
           COALESCE(SUM(cache_read_tokens), 0) as totalCacheReadTokens,
           COALESCE(SUM(cache_creation_tokens), 0) as totalCacheCreationTokens,
           COALESCE(SUM(cost_usd), 0.0) as totalCostUsd,
           COALESCE(AVG(CASE WHEN status='completed' THEN duration_ms END), 0) as avgDurationMs
         FROM workflow_executions
         ${where}`,
      )
      .get(...params) as Omit<WorkflowStatsResponse, 'successRate' | 'zeroTokenPct'>;

    // BR-004: successRate 排除 running
    const rateRow = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as cntCompleted,
           SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as cntFailed
         FROM workflow_executions
         ${where}`,
      )
      .get(...params) as { cntCompleted: number; cntFailed: number };

    const denom = (rateRow.cntCompleted || 0) + (rateRow.cntFailed || 0);
    const successRate =
      denom > 0 ? Math.round(((rateRow.cntCompleted || 0) / denom) * 1000) / 10 : 0;

    // 數據品質指標：最近 24 小時 completed 記錄的 token=0 佔比
    // FIX 2026-04-05: OTel Micro Collector 上線(2026-04-05)後只看近期數據
    //   歷史零值（OTel 上線前）不計入品質指標
    //   失敗/abort 的 Pipeline 自然產生零值也不計入
    const qualityRow = db
      .prepare(
        `SELECT
           CASE WHEN COUNT(*) > 0
             THEN ROUND(COUNT(CASE WHEN input_tokens = 0 AND output_tokens = 0 THEN 1 END) * 100.0 / COUNT(*), 1)
             ELSE 0
           END as zeroTokenPct
         FROM workflow_executions
         WHERE status = 'completed'
           AND completed_at >= datetime('now', '+8 hours', '-1 day')`,
      )
      .get() as { zeroTokenPct: number };

    // 合併尚未落盤的 OTel 尾段（唯讀，不動 marker/DB）
    const pending = pendingInRange(range);
    const pendingTokens = pending.reduce((s, p) => s + p.input_tokens + p.output_tokens, 0);

    return {
      ...statsRow,
      totalInputTokens: statsRow.totalInputTokens + pending.reduce((s, p) => s + p.input_tokens, 0),
      totalOutputTokens: statsRow.totalOutputTokens + pending.reduce((s, p) => s + p.output_tokens, 0),
      totalCacheReadTokens:
        statsRow.totalCacheReadTokens + pending.reduce((s, p) => s + p.cache_read_tokens, 0),
      totalCacheCreationTokens:
        statsRow.totalCacheCreationTokens + pending.reduce((s, p) => s + p.cache_creation_tokens, 0),
      totalCostUsd: statsRow.totalCostUsd + pending.reduce((s, p) => s + p.cost_usd, 0),
      successRate,
      zeroTokenPct: qualityRow.zeroTokenPct,
      ...range,
      pendingTokens,
      usdToTwd,
    };
  } catch {
    return { ...EMPTY_STATS, ...range, usdToTwd };
  }
}

/**
 * BR-005: 按日聚合 token 趨勢。
 * days 預設 7，上限 90。
 */
export function getWorkflowTrend(options: { days?: number } = {}): WorkflowTrendDay[] {
  const db = getDb();
  if (!db) return [];

  const days = Math.min(90, Math.max(1, options.days ?? 7));

  try {
    // FIX (2026-05-29 · Constitutional Timestamp Mandate UTC+8):
    //   started_at 儲存為 +08:00 字面台灣時間(如 "2026-05-30T01:37:08+08:00")。
    //   原 DATE(started_at) 會把 +08:00 轉成 UTC 再取日 → 台灣凌晨記錄被併入「前一 UTC 日」,
    //   且 DATE('now') 為 UTC(off 8h)→ 趨勢日界偏移、台灣「今日」不顯示(使用者回報症狀)。
    //   改用 substr(started_at,1,10) 取「字面台灣日」分組 + date('now','+8 hours',...) 台灣窗口。
    const rows = db
      .prepare(
        `SELECT
           substr(started_at, 1, 10) as date,
           COALESCE(SUM(input_tokens), 0) as input_tokens,
           COALESCE(SUM(output_tokens), 0) as output_tokens,
           COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
           COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
           COUNT(*) as workflow_count,
           COALESCE(SUM(cost_usd), 0.0) as cost_usd
         FROM workflow_executions
         WHERE ${EXCLUDE_SEED}
           AND substr(started_at, 1, 10) >= date('now', '+8 hours', '-' || ? || ' days')
         GROUP BY substr(started_at, 1, 10)
         ORDER BY date ASC`,
      )
      .all(days) as WorkflowTrendDay[];

    // FIX (2026-08-08): 補上尚未經 SessionEnd Hook 聚合進 DB 的 OTel 尾段。
    //   主視窗 session 進行中 → 當日 token 只在 logs/main-otel-{date}.jsonl；
    //   session 非正常結束 → 該日永遠不會進 DB（實測 2026-08-07 即此情形）。
    //   兩者都會讓趨勢圖「今天是 0」或整天消失。
    const { cutoff } = db
      .prepare(`SELECT date('now', '+8 hours', '-' || ? || ' days') as cutoff`)
      .get(days) as { cutoff: string };

    const byDate = new Map(rows.map((r) => [r.date, r]));
    for (const p of readPendingOtelByDay().values()) {
      if (p.date < cutoff) continue;
      const row = byDate.get(p.date);
      if (row) {
        row.input_tokens += p.input_tokens;
        row.output_tokens += p.output_tokens;
        row.cache_read_tokens += p.cache_read_tokens;
        row.cache_creation_tokens += p.cache_creation_tokens;
        row.cost_usd += p.cost_usd;
      } else {
        byDate.set(p.date, {
          date: p.date,
          input_tokens: p.input_tokens,
          output_tokens: p.output_tokens,
          cache_read_tokens: p.cache_read_tokens,
          cache_creation_tokens: p.cache_creation_tokens,
          workflow_count: 1, // 尚未落盤的 interactive-session 視為 1 次
          cost_usd: p.cost_usd,
        });
      }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * BR-006: 各模型 workflow 數量與 token 佔比。
 * token_percentage 在 service 層計算（需全域 total 作分母）。
 */
export function getModelDistribution(): ModelDistributionItem[] {
  const db = getDb();
  if (!db) return [];

  try {
    const rows = db
      .prepare(
        `SELECT
           COALESCE(model, 'unknown') as model,
           COUNT(*) as count,
           COALESCE(SUM(input_tokens), 0) as input_tokens,
           COALESCE(SUM(output_tokens), 0) as output_tokens,
           COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
           COALESCE(SUM(cost_usd), 0.0) as cost_usd
         FROM workflow_executions
         WHERE ${EXCLUDE_SEED}
         GROUP BY COALESCE(model, 'unknown')
         ORDER BY total_tokens DESC`,
      )
      .all() as Omit<ModelDistributionItem, 'token_percentage'>[];

    const grandTotal = rows.reduce((sum, r) => sum + r.total_tokens, 0);

    return rows.map((r) => ({
      ...r,
      token_percentage:
        grandTotal > 0 ? Math.round((r.total_tokens / grandTotal) * 1000) / 10 : 0,
    }));
  } catch {
    return [];
  }
}
