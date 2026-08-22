// ============================================================
// WorkerQueues.tsx — 分頁 A 四段待辦佇列（動作分段 + 需注意置頂 + 安全/危險動作二軌）
// whp-10-devconsole-ui Task 8
// ============================================================
import { useEffect, useRef, useState } from 'react';
import type { LiveBoard, WorkerRunView } from '../types/workers.js';
import {
  ackWorkerRun,
  addWorkerMessage,
  gateWorkerRun,
  closeWorkerRun,
  ackAttention,
  describeWorkersApiError,
  WorkersApiError,
} from '../services/workersApi.js';

const UI_AUTHOR = 'devconsole-ui';

interface WorkerQueuesProps {
  queues: LiveBoard['queues'];
  onActionSuccess: () => void;
}

type DangerKind = 'close' | 'approve' | 'revise';

interface DangerDialogState {
  kind: DangerKind;
  runId: string;
}

function rowLabel(run: WorkerRunView): string {
  return `${run.story_id} · ${run.phase}`;
}

export default function WorkerQueues({ queues, onActionSuccess }: WorkerQueuesProps) {
  const [dangerDialog, setDangerDialog] = useState<DangerDialogState | null>(null);
  const [reviseNotes, setReviseNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [errorByRun, setErrorByRun] = useState<Record<string, string>>({});
  const [warningsByRun, setWarningsByRun] = useState<Record<string, string[]>>({});
  const [messageStateByRun, setMessageStateByRun] = useState<Record<string, string>>({});
  const [closeBlockByRun, setCloseBlockByRun] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  // 危險動作對話框的 Esc 關閉 + 初始焦點（對齊同卡 WorkerDrawer.tsx:34-44 既有範式）。
  // 破壞性動作的對話框不應比唯讀抽屜有更弱的鍵盤可達性。
  useEffect(() => {
    if (!dangerDialog) return undefined;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') { setDangerDialog(null); setReviseNotes(''); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dangerDialog]);

  function setRowError(runId: string, err: unknown): void {
    setErrorByRun((prev) => ({ ...prev, [runId]: describeWorkersApiError(err) }));
    if (err instanceof WorkersApiError && typeof err.body['blockedBy'] === 'string') {
      setCloseBlockByRun((prev) => ({ ...prev, [runId]: err.message }));
    }
  }

  /** 動作成功後清掉該列殘留的錯誤訊息，避免上一次失敗的紅字留在已成功的列上。 */
  function clearRowError(runId: string): void {
    setErrorByRun((prev) => {
      if (!(runId in prev)) return prev;
      const next = { ...prev };
      delete next[runId];
      return next;
    });
  }

  async function handleAck(runId: string): Promise<void> {
    try {
      await ackWorkerRun(runId, undefined);
      clearRowError(runId);
      onActionSuccess();
    } catch (err) {
      setRowError(runId, err);
    }
  }

  async function handleAckAttention(runId: string): Promise<void> {
    try {
      await ackAttention(runId, undefined);
      clearRowError(runId);
      onActionSuccess();
    } catch (err) {
      setRowError(runId, err);
    }
  }

  async function handleProgress(runId: string): Promise<void> {
    try {
      const result = await addWorkerMessage(runId, {
        direction: 'worker-to-controller',
        msgType: 'progress',
        mode: 'append',
        body: '中控選擇續等，暫不介入',
        author: UI_AUTHOR,
      });
      if (result.warnings.length > 0) setWarningsByRun((prev) => ({ ...prev, [runId]: result.warnings }));
      onActionSuccess();
    } catch (err) {
      setRowError(runId, err);
    }
  }

  async function handleWake(runId: string): Promise<void> {
    try {
      const result = await addWorkerMessage(runId, {
        direction: 'controller-to-worker',
        msgType: 'wake',
        mode: 'append',
        body: '中控喚醒：請確認是否仍在運作',
        author: UI_AUTHOR,
      });
      setMessageStateByRun((prev) => ({ ...prev, [runId]: result.message.state }));
      if (result.warnings.length > 0) setWarningsByRun((prev) => ({ ...prev, [runId]: result.warnings }));
      onActionSuccess();
    } catch (err) {
      setRowError(runId, err);
    }
  }

  function openDangerDialog(kind: DangerKind, runId: string): void {
    setDangerDialog({ kind, runId });
    setReviseNotes('');
  }

  function closeDangerDialog(): void {
    setDangerDialog(null);
    setReviseNotes('');
  }

  async function confirmDangerDialog(): Promise<void> {
    if (!dangerDialog) return;
    const { kind, runId } = dangerDialog;
    setPending(true);
    try {
      if (kind === 'close') {
        await closeWorkerRun(runId);
        setCloseBlockByRun((prev) => {
          const next = { ...prev };
          delete next[runId];
          return next;
        });
      } else if (kind === 'approve') {
        await gateWorkerRun(runId, { verdict: 'approved' });
      } else {
        await gateWorkerRun(runId, { verdict: 'revise', gateNotes: reviseNotes });
      }
      closeDangerDialog();
      onActionSuccess();
    } catch (err) {
      setRowError(runId, err);
      closeDangerDialog();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="worker-queues">
      {/* 需注意段永遠置頂（UX 原則 5），queues.attention 為空時仍渲染 */}
      <section role="region" aria-label="需注意" className="worker-queue-section is-attention">
        <h3 className="worker-queue-section__title">
          🔴 需注意 <span className="worker-queue-section__count">（{queues.attention.length}）</span>
        </h3>
        {queues.attention.length === 0 ? (
          <p className="worker-queue-section__empty">目前沒有需要注意的項目</p>
        ) : (
          queues.attention.map((run) => (
            <div key={run.run_id} className="worker-queue-row">
              <div>
                <div>{rowLabel(run)}</div>
                <div className="worker-queue-row__meta">
                  {run.health_flag === 'stalled-suspect' && run.stall_rounds > 0 && `連續 ${run.stall_rounds} 輪零變動`}
                </div>
                {messageStateByRun[run.run_id] && (
                  <div className="worker-queue-message-state">
                    指示{messageStateByRun[run.run_id] === 'delivered' ? '已送達' : '未送達'}
                  </div>
                )}
                {warningsByRun[run.run_id]?.map((w) => (
                  <div key={w} className="worker-queue-warning">{w}</div>
                ))}
                {errorByRun[run.run_id] && <div className="worker-queue-warning">{errorByRun[run.run_id]}</div>}
              </div>
              <div className="worker-queue-row__actions">
                <button type="button" onClick={() => void handleProgress(run.run_id)}>續等</button>
                <button type="button" onClick={() => void handleWake(run.run_id)}>喚醒</button>
                <button type="button" className="is-danger" onClick={() => openDangerDialog('close', run.run_id)}>關窗重派</button>
                {/*
                  降旗 CAS 的守衛是 `WHERE requires_attention = 1`（workerRunService.ts:641），
                  但本段的成員資格是聯集 `requires_attention=1 OR health_flag='stalled-suspect'`
                  （workerRunService.ts:231，BR-055）。守護 writeStallIncrement 會同時寫兩欄，
                  而清旗只清得掉 requires_attention —— health_flag 屬守護職責，本卡依 Spec §3.4
                  欄位讀寫矩陣「明確不寫」。故清旗後該列仍會留在本段：此時再給一顆「已知悉」
                  只會恆回 409，是一顆結構上按不動的按鈕。改為只在旗標真的還立著時才提供。
                */}
                {run.requires_attention === 1 ? (
                  <button type="button" onClick={() => void handleAckAttention(run.run_id)}>☑ 已知悉</button>
                ) : (
                  <span className="worker-queue-row__acked" title="requires_attention 已清除；本列因守護仍標記 stalled-suspect 而留在需注意段">
                    ☑ 已知悉 · 守護仍判定停滯
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <section role="region" aria-label="待確認" className="worker-queue-section">
        <h3 className="worker-queue-section__title">
          🔔 待確認 <span className="worker-queue-section__count">（{queues.pendingAck.length}）</span>
        </h3>
        {queues.pendingAck.length === 0 ? (
          <p className="worker-queue-section__empty">目前沒有待確認的項目</p>
        ) : (
          queues.pendingAck.map((run) => (
            <div key={run.run_id} className="worker-queue-row">
              <div>{rowLabel(run)}</div>
              <div className="worker-queue-row__actions">
                <button type="button" className="is-primary" onClick={() => void handleAck(run.run_id)}>✔ 已收到</button>
              </div>
            </div>
          ))
        )}
      </section>

      <section role="region" aria-label="待驗證" className="worker-queue-section">
        <h3 className="worker-queue-section__title">
          🔍 待驗證 <span className="worker-queue-section__count">（{queues.pendingReview.length}）</span>
        </h3>
        {queues.pendingReview.length === 0 ? (
          <p className="worker-queue-section__empty">目前沒有待驗證的項目</p>
        ) : (
          queues.pendingReview.map((run) => (
            <div key={run.run_id} className="worker-queue-row">
              <div>{rowLabel(run)}</div>
              <div className="worker-queue-row__actions">
                <button type="button" className="is-primary" onClick={() => openDangerDialog('approve', run.run_id)}>✅ 核可</button>
                <button type="button" onClick={() => openDangerDialog('revise', run.run_id)}>✏️ 要求修正</button>
              </div>
            </div>
          ))
        )}
      </section>

      <section role="region" aria-label="待關窗" className="worker-queue-section">
        <h3 className="worker-queue-section__title">
          🚪 待關窗 <span className="worker-queue-section__count">（{queues.pendingClose.length}）</span>
        </h3>
        {queues.pendingClose.length === 0 ? (
          <p className="worker-queue-section__empty">目前沒有待關窗的項目</p>
        ) : (
          queues.pendingClose.map((run) => (
            <div key={run.run_id} className="worker-queue-row">
              <div>
                <div>{rowLabel(run)}</div>
                {closeBlockByRun[run.run_id] && (
                  <div className="worker-queue-warning">{closeBlockByRun[run.run_id]}</div>
                )}
              </div>
              <div className="worker-queue-row__actions">
                <button type="button" className="is-danger" onClick={() => openDangerDialog('close', run.run_id)}>🚪 關閉視窗</button>
              </div>
            </div>
          ))
        )}
      </section>

      {dangerDialog && (
        <div className="worker-dialog-overlay" role="dialog" aria-modal="true" aria-label={
          dangerDialog.kind === 'close' ? '關閉視窗確認' : dangerDialog.kind === 'approve' ? '核可確認' : '要求修正'
        }>
          <div className="worker-dialog" ref={dialogRef} tabIndex={-1}>
            {dangerDialog.kind === 'close' && (
              <>
                <h2 className="worker-dialog__title">確認關閉視窗</h2>
                <p className="worker-dialog__message">關窗為不可逆動作，確定要繼續嗎？</p>
              </>
            )}
            {dangerDialog.kind === 'approve' && (
              <>
                <h2 className="worker-dialog__title">確認核可</h2>
                <p className="worker-dialog__message">核可會推進狀態機至下一階段，確定要繼續嗎？</p>
              </>
            )}
            {dangerDialog.kind === 'revise' && (
              <>
                <h2 className="worker-dialog__title">要求修正</h2>
                <p className="worker-dialog__message">請填寫修正意見：</p>
                <textarea
                  value={reviseNotes}
                  onChange={(e) => setReviseNotes(e.target.value)}
                  aria-label="修正意見"
                />
              </>
            )}
            <div className="worker-dialog__actions">
              <button type="button" onClick={closeDangerDialog} disabled={pending}>取消</button>
              <button
                type="button"
                className="is-danger"
                disabled={pending || (dangerDialog.kind === 'revise' && !reviseNotes.trim())}
                onClick={() => void confirmDangerDialog()}
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
