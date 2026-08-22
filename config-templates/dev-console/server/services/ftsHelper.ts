// ============================================================
// ftsHelper.ts — FTS5 查詢安全化工具
// AC-1: 防止特殊字元注入，trigram >= 3 字元 + 短查詢 LIKE fallback
// ============================================================

/**
 * 安全化 FTS5 查詢字串（trigram tokenizer 需 >= 3 字元）。
 * - 去除前後空白
 * - 驗證長度 >= 3 字元（trigram 最低要求）
 * - 轉義內部雙引號，整體以雙引號包裹（防特殊字元注入）
 * @returns 安全化後的查詢字串，或 null（字串過短時）
 */
export function sanitizeFtsQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 3) return null;
  // 轉義內部雙引號，再包裹整體
  const escaped = trimmed.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * 判斷查詢是否為短查詢（2 字元），需要使用 LIKE fallback。
 */
export function isShortQuery(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length >= 2 && trimmed.length < 3;
}

/**
 * 為 LIKE 查詢轉義特殊字元 (%, _, \)。
 */
export function escapeLikeQuery(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, '\\$&');
}
