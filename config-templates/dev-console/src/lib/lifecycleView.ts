// ============================================================
// lifecycleView.ts — worker lifecycle 九態三重編碼 + 四段佇列 meta（純函式，whp-10-devconsole-ui）
// icon + label + tone 三重編碼（SSoT UX 原則 1：狀態不只靠顏色）。
// label 為繁中人話，不得回傳協議英文字面。無 DOM / 無 fetch。
// ============================================================

export type LifecycleTone = 'active' | 'attention' | 'success' | 'neutral' | 'danger' | 'none';

export interface LifecycleView {
  icon: string;
  label: string;
  tone: LifecycleTone;
}

/** 九態權威集合（.context-db/scripts/upsert-worker-run.js:47-50 LIFECYCLES 逐字對齊）。 */
const LIFECYCLE_VIEWS: Record<string, LifecycleView> = {
  dispatching: { icon: '🚀', label: '派發中', tone: 'active' },
  running: { icon: '▶️', label: '執行中', tone: 'active' },
  reported: { icon: '📨', label: '已回報 · 待簽收', tone: 'attention' },
  'awaiting-review': { icon: '🔍', label: '待驗證', tone: 'attention' },
  revising: { icon: '✏️', label: '修正中', tone: 'active' },
  approved: { icon: '✅', label: '已核可 · 待關窗', tone: 'success' },
  closed: { icon: '🔒', label: '已關閉', tone: 'neutral' },
  failed: { icon: '❌', label: '失敗', tone: 'danger' },
  abandoned: { icon: '👻', label: '已放棄', tone: 'danger' },
};

export function lifecycleView(lifecycle: string): LifecycleView {
  return LIFECYCLE_VIEWS[lifecycle] ?? { icon: '❓', label: lifecycle, tone: 'none' };
}

// ── 四段待辦佇列 meta（Task 3.3）─────────────────────────────────

export type QueueSectionKey = 'pendingAck' | 'pendingReview' | 'pendingClose' | 'attention';

export interface QueueSectionMeta {
  key: QueueSectionKey;
  icon: string;
  title: string;
  tone: 'action' | 'attention';
}

/** 標題為繁中「動作」詞，不得含協議英文字面（reported/awaiting-review/approved 等）。 */
export const QUEUE_SECTION_META: QueueSectionMeta[] = [
  { key: 'pendingAck', icon: '🔔', title: '待確認', tone: 'action' },
  { key: 'pendingReview', icon: '🔍', title: '待驗證', tone: 'action' },
  { key: 'pendingClose', icon: '🚪', title: '待關窗', tone: 'action' },
  { key: 'attention', icon: '🔴', title: '需注意', tone: 'attention' },
];
