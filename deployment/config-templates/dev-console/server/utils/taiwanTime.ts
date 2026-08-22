// ============================================================
// taiwanTime.ts — offset-aware 台灣時間戳 helper（server/ 內自建）
// 語意同 .context-db/scripts/timezone.js:L10-25 getTaiwanTimestamp()，
// 但不可跨 rootDir import 該檔（tsconfig.server.json rootDir:"server"），
// 故在 server/ 內自建同語意版本。whp-9-devconsole-api T2 / AC14。
// ============================================================

/**
 * 回傳台灣時間（UTC+8）ISO 8601 offset-aware 格式字串。
 * 範例: 2026-07-28T00:20:11.004+08:00
 */
export function getTaiwanTimestamp(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const tw = new Date(utc + 8 * 3600000);

  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const y = tw.getFullYear();
  const M = pad(tw.getMonth() + 1);
  const d = pad(tw.getDate());
  const h = pad(tw.getHours());
  const m = pad(tw.getMinutes());
  const s = pad(tw.getSeconds());
  const ms = pad(tw.getMilliseconds(), 3);

  return `${y}-${M}-${d}T${h}:${m}:${s}.${ms}+08:00`;
}
