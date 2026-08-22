// ============================================================
// workflowApi.ts — Workflow/WFQ API fetch wrapper
// dvs-07: WFQ Dashboard 視覺化元件資料來源
// AC-1/2/3: 提供 stats/trend/model-distribution 三個端點封裝
// ============================================================
import { apiFetch } from './apiClient.js';

// ── 型別定義 ──────────────────────────────────────────────────

/** 統計區間（含頭含尾的台灣日，YYYY-MM-DD）*/
export interface DateRange {
  from: string;
  to: string;
}

export interface WorkflowStatsDto {
  totalWorkflows: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  successRate: number;    // 百分比 0~100
  avgDurationMs: number;  // 僅 completed 平均
  zeroTokenPct: number;   // token=0 記錄佔比 0~100（數據品質指標）
  from: string;           // 本次統計實際套用的起日（含）
  to: string;             // 本次統計實際套用的迄日（含）
  pendingTokens: number;  // 區間內尚未聚合進 DB 的 OTel token（input+output）
  usdToTwd: number;       // USD→TWD 換算率，0 表示未設定（前端不顯示 NT）
}

export interface WorkflowTrendDay {
  date: string;              // YYYY-MM-DD
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
  token_percentage: number;   // 佔全部 total_tokens 百分比
  cost_usd: number;
}

// ── API 呼叫函式 ───────────────────────────────────────────────

/** range 省略時由後端套用預設區間（本月全部）*/
export async function fetchWorkflowStats(range?: DateRange): Promise<WorkflowStatsDto> {
  const qs = range ? `?from=${range.from}&to=${range.to}` : '';
  return apiFetch<WorkflowStatsDto>(`/workflows/stats${qs}`);
}

export async function fetchWorkflowTrend(days = 7): Promise<WorkflowTrendDay[]> {
  return apiFetch<WorkflowTrendDay[]>(`/workflows/trend?days=${days}`);
}

export async function fetchModelDistribution(): Promise<ModelDistributionItem[]> {
  return apiFetch<ModelDistributionItem[]>('/workflows/model-distribution');
}
