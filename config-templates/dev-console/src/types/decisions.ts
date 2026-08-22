// ============================================================
// decisions.ts — 技術決策前端型別定義
// DVS-07 AC-1/2: 合併 context_entries + tech_entries decision 記錄
// ============================================================

export type DecisionSource = 'context' | 'tech';

/** 合併 context + tech 的 Decision 聯合型別 */
export interface DecisionEntry {
  id: number;
  source: DecisionSource;
  title: string;
  /** context entry 的 content；tech entry 的 problem + solution 合併 */
  content: string;
  /** context: timestamp；tech: created_at */
  timestamp: string;
  tags: string | null;
  story_id: string | null;
  epic_id: string | null;
}

export interface DecisionListResult {
  items: DecisionEntry[];
  total: number;
  page: number;
}
