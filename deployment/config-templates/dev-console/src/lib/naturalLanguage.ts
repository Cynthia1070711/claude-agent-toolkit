// ============================================================
// naturalLanguage.ts — ECC 計分自然語言化純函式 (AC12 SSoT)
// ecc-emergence-ui-v2
// ============================================================

export function formatAdoption(score: number): string {
  if (score === 0) return '尚未跨視窗使用';
  if (score === 1 || score === 2) return `使用 ${score} 次`;
  if (score === 3) return `同情境通用 ${score} 次`;
  return `全視窗通用 ${score} 次`;
}

export function formatConfidence(confidence: number): string {
  const c = Math.max(0, Math.min(1, confidence));
  if (c < 0.2) return '⭐';
  if (c < 0.4) return '⭐⭐';
  if (c < 0.6) return '⭐⭐⭐';
  if (c < 0.8) return '⭐⭐⭐⭐';
  return '⭐⭐⭐⭐⭐';
}

export function formatVerifier(status: string | null | undefined): string {
  if (status === 'approved') return '✓ 已驗證';
  if (status === 'needs-more-evidence') return '⚠ 待佐證';
  if (status === 'rejected') return '✗ 已否決';
  return '—';
}

export function formatDecay(decay_at: string | null | undefined): string {
  if (!decay_at) return '不會衰退';
  try {
    const decayMs = new Date(decay_at).getTime();
    if (isNaN(decayMs)) return '不會衰退';
    const nowMs = Date.now();
    if (nowMs >= decayMs) return '已衰退';
    const daysLeft = Math.ceil((decayMs - nowMs) / 86400000);
    return `再 ${daysLeft} 天衰退`;
  } catch {
    return '不會衰退';
  }
}

// 時鐘格式化 — 台灣時區人性化(emergence/patterns 漏網死角補強)
// TZ FIX 2026-05-29: 對齊 DecisionCard/MemoryCard/TimelineNode formatDate · pin Asia/Taipei,禁裸印原始 ISO(含 T 與 +08:00)
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// 機客觀混合分 (候選/觀察/否決池) — Master Plan ECC v3.4
export function calcMixedScore(confidence: number, adoption_score: number): number {
  return Math.round((confidence * 60) + ((adoption_score / 5) * 40));
}

// 效果改善率 (技能池)
export function calcImprovementPct(before_freq: number | null, after_freq: number | null): number | null {
  if (before_freq === null || before_freq === undefined || before_freq === 0) return null;
  const af = after_freq ?? 0;
  return Math.round((before_freq - af) / before_freq * 100);
}
