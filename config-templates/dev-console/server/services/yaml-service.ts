// ============================================================
// yaml-service.ts — Story 共用型別 + 狀態驗證常數
// [tdb-2 BR-012/BR-013/BR-014, 2026-07-28] sprint-status.yaml 解析/寫回函式已移除
// (parseSprintStatus / getStoryList / getStoryStats / getEpicList /
//  getComplexityDistribution / getEpicProgress / updateStoryStatus 及其私有輔助函式)。
// sprint-status.yaml 已凍結為唯讀歷史快照(# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs),
// 上述函式的唯一呼叫者(routes/dashboard.ts / routes/sprint.ts / routes/stories.ts /
// services/sync-engine.ts)已全數改讀 stories 表(見 services/db-story-service.ts)或隨
// Sync 功能整體退場(sync-engine.ts / routes/sync.ts 已刪除,BR-014)。
//
// 本檔案保留下來的內容仍有明確唯一/多重呼叫者：
// - 型別定義：被 services/db-story-service.ts 匯入並延伸實作(getDbEpicProgress /
//   getDbComplexityDistribution 回傳型別即 EpicProgress / ComplexityDistribution)。
// - VALID_STATUSES：被 routes/stories.ts 的 PATCH /:key/status 驗證使用。
// ============================================================

export interface StoryMetadata {
  complexity: string | null;    // XS, S, M, L, XL
  priority: string | null;      // P0, P1, P2, P3
  crScore: number | null;       // CR:97 → 97
  testCount: number | null;     // 38 tests → 38
  devAgent: string | null;
  reviewAgent: string | null;
  createdAgent: string | null;
  lastUpdated: string | null;   // ISO 日期 (YYYY-MM-DD)
  comment: string;              // 附加描述文字
  rerun: Record<string, number> | null; // 重跑聚合（tdb-5，phase→MAX(attempt)，來源=worker_runs）
}

export type StoryStatus =
  | 'backlog'
  | 'ready-for-dev'
  | 'in-progress'
  | 'review'
  | 'done'
  | 'cancelled'
  | 'superseded'
  | 'split'
  | 'cancelled-merged'
  | string;

export interface StoryEntry {
  id: string;           // e.g. "dvs-03-story-kanban"
  key: string;          // same as id
  epicId: string;       // derived from key prefix
  title: string;        // extracted from comment or key
  status: StoryStatus;
  isEpic: boolean;
  metadata: StoryMetadata;
}

export interface ParsedSprintStatus {
  stories: StoryEntry[];
  epics: StoryEntry[];
  all: StoryEntry[];    // ordered as in YAML
}

export type DateRange = 'today' | '3d' | 'week' | 'month';
export type SortBy = 'date_desc' | 'date_asc' | 'epic_asc' | 'epic_desc';

export interface StoryFilters {
  epicId?: string;
  status?: string;
  search?: string;
  dateRange?: DateRange;
  sortBy?: SortBy;
}

export interface StoryStats {
  total: number;
  backlog: number;
  readyForDev: number;
  inProgress: number;
  review: number;
  done: number;
  cancelled: number;
  other: number;
}

export interface EpicSummary {
  epicId: string;
  storyCount: number;
  epicStatus: string;
}

// ── ComplexityDistribution 型別 ──
export interface ComplexityDistribution {
  XS: number;
  S: number;
  M: number;
  L: number;
  XL: number;
  untagged: number;
}

// ── EpicProgress 型別 ──
export interface EpicProgress {
  epicId: string;
  epicStatus: string;
  totalStories: number;
  doneCount: number;
  inProgressCount: number;
  reviewCount: number;
  readyForDevCount: number;
  backlogCount: number;
  cancelledCount: number;
  completionPct: number;
}

// ── 有效 PATCH 狀態 ──
export const VALID_STATUSES = new Set([
  'backlog',
  'creating',
  'ready-for-dev',
  'in-progress',
  'review',
  'reviewing',
  'done',
]);
