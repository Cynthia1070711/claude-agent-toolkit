// ============================================================
// roadmap.ts — /api/roadmap 型別鏡像（tdb-1-track-plan-roadmap）
// SSoT: tools/dev-console/server/services/roadmapService.ts
// ============================================================

export type Lane = 'manual' | 'dispatch' | 'reconcile';
export type Gate = 'inflight' | 'unlocked' | 'waiting-external' | 'blocked' | 'paused';

export interface ChildrenProgress {
  done: number;
  total: number;
}

export interface RoadmapCard {
  story_id: string;
  title: string;
  title_short: string;
  priority: string | null;
  complexity: string | null;
  gate: Gate;
  gate_note: string | null;
  gate_since: string;
  unlock_note: string | null;
  unlock_leverage: number;
  deps_raw: string | null;
  blocked_by: string[];
  children_progress: ChildrenProgress | null;
  unplanned: boolean;
  seq: number | null;
  updated_at: string;
}

export interface RoadmapLaneGroup {
  lane: Lane;
  cards: RoadmapCard[];
}

export interface RoadmapKpi {
  total: number;
  done: number;
  unplanned: number;
  pending: number;
  inflight: number;
  paused: number;
}

export interface RoadmapResult {
  kpi: RoadmapKpi;
  lanes: RoadmapLaneGroup[];
  generated_at: string;
}

export const LANES: Lane[] = ['manual', 'dispatch', 'reconcile'];

export const LANE_LABELS: Record<Lane, string> = {
  manual: '手動(使用者視窗)',
  dispatch: '派發(worker 子視窗)',
  reconcile: '收口(母卡)',
};

export const GATE_LABELS: Record<Gate, string> = {
  inflight: '進行中',
  unlocked: '已放行',
  'waiting-external': '等待外部',
  blocked: '被阻塞',
  paused: '已暫停',
};

/** 五態辨識符號（非唯一色彩,供色盲使用者獨立辨識,對齊 AC10 a11y 要求）。 */
export const GATE_ICONS: Record<Gate, string> = {
  inflight: '🔄',
  unlocked: '✅',
  'waiting-external': '⏳',
  paused: '⏸',
  blocked: '🕐',
};
