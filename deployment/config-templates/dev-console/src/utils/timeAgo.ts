// ============================================================
// timeAgo.ts — 相對時間格式化工具（不引入 dayjs/moment）
// DVS-05: Dashboard + RecentActivity 共用
// ============================================================

export function timeAgo(timestamp: string | null): string {
  if (!timestamp) return '—';
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return '剛才';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}
