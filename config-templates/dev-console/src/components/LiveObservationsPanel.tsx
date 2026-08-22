// ============================================================
// LiveObservationsPanel.tsx — 即時原始觀測面板 (pattern_observations live feed)
// 使用者增強(2026-05-30):在湧現迴路頁即時顯示原始觀測,驗證 ECC 觀測迴路運作中。
// 純讀 pattern_observations(非侵入 · 零改 ECC 行為);15s 輪詢 + 手動重新整理 + 點列開窗詳情。
// ============================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchRecentObservations, type PatternObservation } from '../services/patternsApi.js';
import { formatTimestamp } from '../lib/naturalLanguage.js';
import ObservationDetailModal from './ObservationDetailModal.js';

const POLL_MS = 15000;
const LIMIT = 20;
const ACTIVE_WINDOW_MS = 10 * 60 * 1000; // 最新觀測在 10 分鐘內 = 運作中

function shortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

function nowTaipeiClock(): string {
  return new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LiveObservationsPanel() {
  const [rows, setRows] = useState<PatternObservation[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [latest, setLatest] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [selected, setSelected] = useState<PatternObservation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchRecentObservations(LIMIT);
      setRows(data.observations);
      setTodayCount(data.todayCount);
      setLatest(data.latest);
      setFetchedAt(nowTaipeiClock());
    } catch {
      setError('觀測資料載入失敗(後端服務未運行?)');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!auto) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(load, POLL_MS);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [auto, load]);

  // 運作狀態:最新觀測在 ACTIVE_WINDOW_MS 內視為「觀測迴路運作中」
  const isActive = !!latest && (Date.now() - new Date(latest).getTime()) < ACTIVE_WINDOW_MS;

  return (
    <div className="emergence-live-obs" role="region" aria-label="即時原始觀測">
      <div className="emergence-live-obs__head">
        <h3 className="emergence-live-obs__title">
          <span className={`emergence-live-obs__dot ${isActive ? 'is-active' : ''}`} aria-hidden="true" />
          <span className="emergence-live-obs__status-text">
            {isActive ? '觀測迴路運作中' : '近期無觀測'}
            <span className="emergence-live-obs__status-meta">
              {' · '}今日 {todayCount} 筆 · 最新 {formatTimestamp(latest)}
              {fetchedAt && ` · 更新於 ${fetchedAt}`}
            </span>
          </span>
        </h3>
        <div className="emergence-live-obs__controls">
          <label className="emergence-live-obs__auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            自動 {POLL_MS / 1000}s
          </label>
          <button className="emergence-live-obs__refresh" onClick={load} aria-label="重新整理觀測">🔄</button>
        </div>
      </div>

      {error && <p className="emergence-live-obs__error">{error}</p>}
      {!error && loading && rows.length === 0 && <p className="emergence-live-obs__empty">載入中…</p>}
      {!error && !loading && rows.length === 0 && <p className="emergence-live-obs__empty">尚無觀測記錄</p>}

      <ul className="emergence-live-obs__list">
        {rows.map((o) => (
          <li key={o.id} className="emergence-live-obs__item-wrap">
            <button
              className="emergence-live-obs__item"
              onClick={() => setSelected(o)}
              aria-haspopup="dialog"
              aria-label={`查看觀測詳情：${o.domain} ${o.tool_name}`}
            >
              <span className="emergence-live-obs__time">{shortTime(o.last_seen)}</span>
              <span className="emergence-live-obs__domain">{o.domain || '—'}</span>
              <span className="emergence-live-obs__tool">{o.tool_name || '—'}</span>
              <span className="emergence-live-obs__occ">×{o.occurrences}</span>
            </button>
          </li>
        ))}
      </ul>

      {selected && <ObservationDetailModal obs={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
