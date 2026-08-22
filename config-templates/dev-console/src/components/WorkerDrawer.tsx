// ============================================================
// WorkerDrawer.tsx — 右側抽屜：時間軸 + 溝通串 + 交接證據鏈
// whp-10-devconsole-ui Task 11
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { fetchWorkerRunDetail, describeWorkersApiError } from '../services/workersApi.js';
import type { WorkerRunDetail } from '../types/workers.js';
import { formatTimestamp } from '../lib/naturalLanguage.js';

interface WorkerDrawerProps {
  runId: string;
  onClose: () => void;
}

interface TimelineNode {
  key: string;
  label: string;
  value: string | null;
}

export default function WorkerDrawer({ runId, onClose }: WorkerDrawerProps) {
  const [detail, setDetail] = useState<WorkerRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorkerRunDetail(runId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((err) => { if (!cancelled) setError(describeWorkersApiError(err)); });
    return () => { cancelled = true; };
  }, [runId]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const timelineNodes: TimelineNode[] = detail
    ? [
        { key: 'started_at', label: '開始執行', value: detail.run.started_at },
        { key: 'last_turn_at', label: '最後回合', value: detail.run.last_turn_at },
        { key: 'reported_at', label: '已回報', value: detail.run.reported_at },
        { key: 'ack_at', label: '已簽收', value: detail.run.ack_at },
        { key: 'gate_at', label: '已裁決', value: detail.handoff?.gate_at ?? null },
        { key: 'closed_at', label: '已關閉', value: detail.run.closed_at },
      ]
    : [];

  return (
    <div className="worker-drawer-overlay" onClick={onClose}>
      <div
        className="worker-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Worker Run 詳情"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="worker-drawer__header">
          <h2>Run 詳情</h2>
          <button type="button" className="worker-drawer__close" onClick={onClose} aria-label="關閉抽屜">✕</button>
        </div>

        {error && <p className="worker-queue-warning">{error}</p>}

        {detail && (
          <>
            <section className="worker-drawer__section">
              <h3 className="worker-drawer__section-title">概況時間軸</h3>
              <div className="worker-drawer__timeline">
                {timelineNodes.map((n) => (
                  <div key={n.key} className={`worker-drawer__timeline-node${n.value ? '' : ' is-pending'}`}>
                    <span>{n.label}</span>
                    <span>{n.value ? formatTimestamp(n.value) : '尚未發生'}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="worker-drawer__section">
              <h3 className="worker-drawer__section-title">溝通串</h3>
              {detail.messages.length === 0 ? (
                <p className="worker-drawer__empty">尚無溝通紀錄</p>
              ) : (
                detail.messages.map((m) => (
                  <div key={m.msg_id} className="worker-drawer__message">
                    <div>#{m.seq} · {m.direction} · {m.msg_type} · {m.state} · {formatTimestamp(m.created_at)}</div>
                    <div>{m.body}</div>
                  </div>
                ))
              )}
            </section>

            <section className="worker-drawer__section">
              <h3 className="worker-drawer__section-title">交接證據鏈</h3>
              {detail.handoff === null ? (
                <p className="worker-drawer__empty">尚無交接紀錄</p>
              ) : (
                <div>
                  <p>裁決：{detail.handoff.gate_result}</p>
                  <p>裁決者：{detail.handoff.gate_by ?? '—'}</p>
                  <p>備註：{detail.handoff.gate_notes ?? '—'}</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
