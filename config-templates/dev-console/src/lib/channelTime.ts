// ============================================================
// channelTime.ts — /channel 頁相對時間 + 逾時計算純函式（ccb-3-devconsole-channel-page）
// 無 DOM，供元件與測試直接呼叫。
// ============================================================

/** 相對時間：分鐘 / 小時 / 天三段（對齊 03 章 §2.1 線框「5 分前」「3 時前」範例）。 */
export function formatRelativeTime(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffMs = Math.max(0, nowMs - t);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

/** 距今小時數（供 >24h 逾時判定 + aria-label「逾時 N 小時」，AC8/BR032）。 */
export function hoursSince(iso: string, nowMs: number = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor(Math.max(0, nowMs - t) / 3600000);
}

export function isOverdue24h(iso: string, nowMs: number = Date.now()): boolean {
  return hoursSince(iso, nowMs) > 24;
}
