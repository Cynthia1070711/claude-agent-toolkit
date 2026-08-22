// ============================================================
// WorkerBoard.tsx — 分頁 A 執行中看板（九欄 + 軌別分組 + PID 4-Tuple hover）
// whp-10-devconsole-ui Task 7
// ============================================================
import { useMemo, useState } from 'react';
import type { WorkerRunView } from '../types/workers.js';
import { formatRelativeHeartbeat } from '../lib/workerTime.js';
import { formatTimestamp } from '../lib/naturalLanguage.js';

interface WorkerBoardProps {
  running: WorkerRunView[];
  /** trigger 為開啟抽屜的按鈕本身，供抽屜關閉時把焦點還回去（BR-038）。 */
  onOpenThread: (runId: string, trigger?: HTMLElement) => void;
}

function buildDirectiveText(run: WorkerRunView): string {
  return [
    `run_id: ${run.run_id}`,
    `story_id: ${run.story_id}`,
    `phase: ${run.phase}`,
    `controller_track: ${run.controller_track}`,
    `attempt: ${run.attempt}`,
  ].join('\n');
}

export default function WorkerBoard({ running, onOpenThread }: WorkerBoardProps) {
  const [clipboardFallbackRunId, setClipboardFallbackRunId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkerRunView[]>();
    for (const run of running) {
      const key = run.controller_track || '未分軌';
      const list = map.get(key) ?? [];
      list.push(run);
      map.set(key, list);
    }
    return map;
  }, [running]);

  async function handleCopy(run: WorkerRunView): Promise<void> {
    const text = buildDirectiveText(run);
    if (!navigator.clipboard) {
      setClipboardFallbackRunId(run.run_id);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setClipboardFallbackRunId(null);
    } catch {
      setClipboardFallbackRunId(run.run_id);
    }
  }

  if (running.length === 0) {
    return <div className="worker-board worker-board__empty">目前沒有執行中的 worker</div>;
  }

  return (
    <div className="worker-board">
      {Array.from(grouped.entries()).map(([track, rows]) => (
        <div key={track}>
          <div className="worker-board__track-group">{track}（{rows.length}）</div>
          <table className="worker-board__table">
            <thead>
              <tr>
                <th>軌別</th>
                <th>Story / Phase</th>
                <th>派發</th>
                <th>模型</th>
                <th>PID</th>
                <th>心跳</th>
                <th>執行權</th>
                <th>可否關閉</th>
                <th>快捷</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => {
                const heartbeat = formatRelativeHeartbeat(run.last_turn_at, Date.now());
                const fourTupleTitle = [
                  `cmd_line: ${run.cmd_line ?? '—'}`,
                  `window_title: ${run.window_title ?? '—'}`,
                  `started_at: ${run.started_at}`,
                ].join('\n');
                const closeBlocked = run.lifecycle === 'reported' || run.lifecycle === 'awaiting-review';

                return (
                  <tr key={run.run_id}>
                    <td data-field="track">{run.controller_track || '—'}</td>
                    <td data-field="story-phase">{run.story_id} / {run.phase}</td>
                    <td
                      data-field="attempt"
                      className={run.attempt > 1 ? 'is-retry' : undefined}
                      title={run.attempt > 1 ? run.resumed_from_run_id ?? undefined : undefined}
                    >
                      第 {run.attempt} 次派發
                    </td>
                    <td data-field="model">{run.model_id || '—'}</td>
                    <td data-field="pid" title={fourTupleTitle}>
                      視窗 {run.wrapper_pid ?? '—'}・{run.claude_pid == null ? '未回填' : `claude ${run.claude_pid}`}
                    </td>
                    <td data-field="heartbeat" className={`tone-${heartbeat.tone}`}>
                      第 {run.turn_count} turn ·{' '}
                      <span title={formatTimestamp(run.last_turn_at)}>{heartbeat.text}</span>
                    </td>
                    <td data-field="owner">
                      {run.executionOwner === 'worker' ? 'Worker' : run.executionOwner === 'controller' ? '中控' : '—'}
                    </td>
                    <td data-field="closable" className={`worker-board__closable${closeBlocked ? ' is-blocked' : ''}`}>
                      {closeBlocked ? '請勿關閉' : run.closable ? '可關閉' : '否'}
                    </td>
                    <td data-field="actions">
                      <div className="worker-board__actions">
                        <button type="button" onClick={(e) => onOpenThread(run.run_id, e.currentTarget)}>開啟溝通串</button>
                        <button type="button" onClick={() => void handleCopy(run)}>複製指示</button>
                      </div>
                      {clipboardFallbackRunId === run.run_id && (
                        <div className="worker-board__clipboard-fallback">
                          瀏覽器不支援自動複製，請手動選取後複製：
                          <textarea readOnly value={buildDirectiveText(run)} onFocus={(e) => e.currentTarget.select()} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
