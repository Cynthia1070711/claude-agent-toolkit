// ============================================================
// 台灣時間 (UTC+8) 時間戳工具
// 所有 Context Memory DB 寫入統一使用此函式
// ============================================================

/**
 * 回傳台灣時間 ISO 8601 格式字串
 * 範例: 2026-03-07T16:45:00.123+08:00
 */
export function getTaiwanTimestamp() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const tw = new Date(utc + 8 * 3600000);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const y = tw.getFullYear();
  const M = pad(tw.getMonth() + 1);
  const d = pad(tw.getDate());
  const h = pad(tw.getHours());
  const m = pad(tw.getMinutes());
  const s = pad(tw.getSeconds());
  const ms = pad(tw.getMilliseconds(), 3);

  return `${y}-${M}-${d}T${h}:${m}:${s}.${ms}+08:00`;
}
