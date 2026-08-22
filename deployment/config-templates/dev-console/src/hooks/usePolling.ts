// ============================================================
// usePolling.ts — 輪詢 hook，提煉自 LiveObservationsPanel.tsx:L41-65
// （不修改該檔 — /emergence 頁與本卡零功能交集，見 Dev Notes D-1 決策）。
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';

function nowTaipeiClock(): string {
  return new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export interface UsePollingOptions {
  intervalMs: number;
  enabled: boolean;
}

export interface UsePollingResult {
  fetchedAt: string;
  refresh: () => void;
}

export function usePolling(load: () => Promise<void> | void, { intervalMs, enabled }: UsePollingOptions): UsePollingResult {
  const [fetchedAt, setFetchedAt] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runLoad = useCallback(async () => {
    await load();
    setFetchedAt(nowTaipeiClock());
  }, [load]);

  useEffect(() => { void runLoad(); }, [runLoad]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => void runLoad(), intervalMs);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [enabled, runLoad, intervalMs]);

  return { fetchedAt, refresh: () => void runLoad() };
}
