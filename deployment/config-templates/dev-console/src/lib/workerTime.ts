// ============================================================
// workerTime.ts — worker 心跳相對時間 + 三段色階（純函式，whp-10-devconsole-ui）
// 無 DOM / 無 fetch，供 workerTime.test.ts 直接測試。
// ============================================================

export type HeartbeatTone = 'fresh' | 'warn' | 'stale' | 'none';

export interface RelativeHeartbeat {
  text: string;
  tone: HeartbeatTone;
}

const FRESH_MAX_MS = 5 * 60 * 1000; // < 5 分鐘（含 300_000ms 邊界，AC5）
const WARN_MAX_MS = 30 * 60 * 1000; // 5–30 分鐘（含 1_800_000ms 邊界，AC5）

/**
 * 心跳相對時間 + 三段色階：< 5min fresh / 5–30min warn / > 30min stale。
 * 邊界為閉區間下界：300_000ms 判 fresh，1_800_000ms 判 warn。
 */
export function formatRelativeHeartbeat(iso: string | null | undefined, nowMs: number): RelativeHeartbeat {
  if (!iso) return { text: '—', tone: 'none' };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { text: '—', tone: 'none' };

  const diffMs = Math.max(0, nowMs - t);
  const minutes = Math.floor(diffMs / 60000);
  const text = `${minutes} 分鐘前`;

  let tone: HeartbeatTone;
  if (diffMs <= FRESH_MAX_MS) tone = 'fresh';
  else if (diffMs <= WARN_MAX_MS) tone = 'warn';
  else tone = 'stale';

  return { text, tone };
}
