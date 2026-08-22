// ============================================================
// session.ts — Session 時間軸前端型別定義
// DVS-06 AC-1: SessionTimelineItemDto + 查詢參數 + 篩選回應
// ============================================================

export interface SessionTimelineItemDto {
  id: string;                              // context entry id 或 conversation session_id
  source: 'context' | 'conversation';     // 資料來源
  title: string;
  content: string;
  summary: string | null;                 // 前 200 字元摘要（API 回傳）
  agent: string | null;
  tags: string | null;                    // JSON 陣列字串或逗號分隔
  related_files: string | null;           // DVC-09-M5 修復
  timestamp: string;                      // ISO 8601 排序依據
  created_at: string;
}

export interface SessionQueryParams {
  startDate?: string;    // ISO date string (YYYY-MM-DD)
  endDate?: string;      // ISO date string (YYYY-MM-DD)
  agent?: string;
  tags?: string;         // 逗號分隔標籤
  page?: number;
  pageSize?: number;
}

export interface SessionTimelineResponse {
  items: SessionTimelineItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionFiltersResponse {
  agents: string[];
  tags: string[];
}
