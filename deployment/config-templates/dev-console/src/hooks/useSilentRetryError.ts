// ============================================================
// useSilentRetryError.ts — 輪詢失敗 silent retry ×N（初次載入例外，立即顯示，非等 N 次）
// 抽出自 Channel.tsx:39-64（ccb-3-devconsole-channel-page，tdb-1-track-plan-roadmap 抽出至 hooks/）。
// ============================================================
import { useCallback, useMemo, useRef, useState } from 'react';

export interface UseSilentRetryErrorResult {
  error: string | null;
  reportSuccess: () => void;
  reportFailure: (message: string) => void;
}

export function useSilentRetryError(threshold = 3): UseSilentRetryErrorResult {
  const failCountRef = useRef(0);
  const isFirstRef = useRef(true);
  const [error, setError] = useState<string | null>(null);

  const reportSuccess = useCallback(() => {
    failCountRef.current = 0;
    isFirstRef.current = false;
    setError(null);
  }, []);

  const reportFailure = useCallback((message: string) => {
    if (isFirstRef.current) {
      setError(message);
    } else {
      failCountRef.current += 1;
      if (failCountRef.current >= threshold) setError(message);
    }
    isFirstRef.current = false;
  }, [threshold]);

  // useMemo：回傳物件參照穩定（僅 error 實際變化時才變），否則下游 useCallback deps
  // 含此物件會在每次 render 都視為「變了」，級聯讓 loadTabData/loadAll/usePolling.runLoad
  // 全部失去記憶化，導致 initial-load effect（deps=[runLoad]）在每次 render 後又觸發一次。
  return useMemo(() => ({ error, reportSuccess, reportFailure }), [error, reportSuccess, reportFailure]);
}
