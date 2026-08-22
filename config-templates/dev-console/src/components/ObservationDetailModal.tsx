// ============================================================
// ObservationDetailModal.tsx — 原始觀測詳情彈窗 (LiveObservationsPanel 點列開窗)
// 複用 emergence-detail-modal 樣式 + ESC / backdrop / body-overflow 範式(對齊 InstinctDetailModal)
// ============================================================
import { useEffect, useCallback } from 'react';
import type { PatternObservation } from '../services/patternsApi.js';
import { formatTimestamp } from '../lib/naturalLanguage.js';

interface Props {
  obs: PatternObservation;
  onClose: () => void;
}

export default function ObservationDetailModal({ obs, onClose }: Props) {
  // ESC 關閉
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // body overflow:hidden(避免背景滾動)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);
  const stopProp = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  return (
    <div className="emergence-detail-modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div
        className="emergence-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`觀測詳情：${obs.domain} ${obs.tool_name}`}
        onClick={stopProp}
      >
        <div className="emergence-detail-modal__header">
          <div className="emergence-detail-modal__title-area">
            <div className="emergence-detail-modal__trigger">{obs.domain || '—'} · {obs.tool_name || '—'}</div>
            <div className="emergence-detail-modal__action">{obs.change_type || '—'} · 累計 {obs.occurrences} 次</div>
          </div>
          <button className="emergence-detail-modal__close" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <div className="emergence-detail-modal__body">
          <dl className="emergence-detail-modal__dl">
            <dt>檔案</dt><dd className="emergence-live-obs__path">{obs.file_path || '—'}</dd>
            <dt>領域</dt><dd>{obs.domain || '—'}</dd>
            <dt>工具</dt><dd>{obs.tool_name || '—'}</dd>
            <dt>變更類型</dt><dd>{obs.change_type || '—'}</dd>
            <dt>累計次數</dt><dd>{obs.occurrences}</dd>
            <dt>信心值</dt><dd>{(obs.confidence * 100).toFixed(0)}%</dd>
            <dt>首次觀測</dt><dd>{formatTimestamp(obs.first_seen)}</dd>
            <dt>最後觀測</dt><dd>{formatTimestamp(obs.last_seen)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
