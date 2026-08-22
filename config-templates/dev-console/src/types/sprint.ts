// ============================================================
// sprint.ts — Sprint 進度頁型別定義
// DVS-05: Sprint 進度圖表頁
// ============================================================
import type { StoryStats } from './stories';

// 重新導出 StoryStats 以便 Sprint 頁面使用
export type { StoryStats };

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
  completionPct: number;  // 0~100
}

export interface ComplexityDistribution {
  XS: number;
  S: number;
  M: number;
  L: number;
  XL: number;
  untagged: number;
}
