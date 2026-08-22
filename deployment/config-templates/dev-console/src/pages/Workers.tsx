// ============================================================
// Workers.tsx — /workers 工作台主體：三分頁 Tabs（WAI-ARIA APG）+ 頁首常駐 + 抽屜協調
// whp-10-devconsole-ui Task 5/6
// ============================================================
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchLiveBoard, describeWorkersApiError } from '../services/workersApi.js';
import type { LiveBoard } from '../types/workers.js';
import { formatRelativeHeartbeat } from '../lib/workerTime.js';
import { formatTimestamp } from '../lib/naturalLanguage.js';
import KpiCard from '../components/KpiCard.js';
import WorkerBoard from '../components/WorkerBoard.js';
import WorkerQueues from '../components/WorkerQueues.js';
import WorkerHistory from '../components/WorkerHistory.js';
import WorkerAudit from '../components/WorkerAudit.js';
import WorkerDrawer from '../components/WorkerDrawer.js';
import '../styles/dashboard.css';
import '../styles/workers.css';

const POLL_MS = 10000;

const TABS = [
  { id: 'live', label: '現場' },
  { id: 'history', label: '歷程' },
  { id: 'audit', label: '稽核' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function GuardianBar({ guardian }: { guardian: LiveBoard['guardian'] | undefined }) {
  if (!guardian || guardian.present === false) {
    return (
      <div className="workers-guardian-bar workers-guardian-bar--absent">
        <span aria-hidden="true">⚪</span> 守護未登記
      </div>
    );
  }
  const heartbeat = formatRelativeHeartbeat(guardian.lastBeatAt, Date.now());
  const cls = `workers-guardian-bar ${guardian.stale ? 'is-stale' : 'is-fresh'}`;
  return (
    <div className={cls}>
      <span aria-hidden="true">{guardian.stale ? '⚠️' : '🟢'}</span>
      <span>
        {guardian.stale ? '心跳逾時' : '守護運作中'}
        {' · '}
        <span title={formatTimestamp(guardian.lastBeatAt)}>{heartbeat.text}</span>
      </span>
    </div>
  );
}

export default function Workers() {
  const { runId } = useParams<{ runId?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('live');
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const drawerTriggerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchLiveBoard();
      setBoard(data);
      setLoadError(null);
    } catch (err) {
      // BR-044：單次輪詢失敗保留上一次成功資料，畫面顯示錯誤列
      setLoadError(describeWorkersApiError(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (activeTab !== 'live' || !auto) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => void load(), POLL_MS);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [activeTab, auto, load]);

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex = index;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TABS.length - 1;
    else return;
    e.preventDefault();
    const nextId = TABS[nextIndex]!.id;
    setActiveTab(nextId);
    tabRefs.current[nextId]?.focus();
  }

  function openDrawer(id: string, trigger?: HTMLElement): void {
    // BR-038 焦點返回：trigger 由呼叫端傳入按鈕本身；退而求其次取當下焦點元素
    // （點擊時焦點仍在該按鈕上）。兩者皆無才留 null。
    drawerTriggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    navigate(`/workers/${id}`);
  }

  function closeDrawer(): void {
    navigate('/workers');
    drawerTriggerRef.current?.focus();
  }

  const attentionCount = board?.queues.attention.length ?? 0;

  return (
    <div className="workers-page">
      <GuardianBar guardian={board?.guardian} />

      <div className="workers-kpi-row">
        <KpiCard icon="▶️" label="執行中" value={board?.kpi.running ?? 0} />
        <KpiCard icon="🔔" label="待確認" value={board?.kpi.pendingAck ?? 0} />
        <KpiCard icon="🔍" label="待驗證" value={board?.kpi.pendingReview ?? 0} />
        <KpiCard icon="🚪" label="待關窗" value={board?.kpi.pendingClose ?? 0} />
        <div className={`workers-attention-badge${attentionCount > 0 ? ' is-attention' : ''}`}>
          🔴 需注意 <span>{attentionCount}</span>
        </div>
        <label className="workers-auto-toggle">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          自動 {POLL_MS / 1000}s
        </label>
        <button type="button" onClick={() => void load()}>🔄 重新整理</button>
      </div>

      {loadError && <p className="worker-queue-warning">{loadError}</p>}

      <div role="tablist" aria-label="Pipeline 工作台分頁" className="workers-tablist">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[tab.id] = el; }}
            role="tab"
            id={`workers-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`workers-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className="workers-tab"
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'live' && (
        <div role="tabpanel" id="workers-panel-live" aria-labelledby="workers-tab-live" className="workers-tabpanel">
          <WorkerBoard running={board?.running ?? []} onOpenThread={(id, trigger) => openDrawer(id, trigger)} />
          <WorkerQueues
            queues={board?.queues ?? { pendingAck: [], pendingReview: [], pendingClose: [], attention: [] }}
            onActionSuccess={() => void load()}
          />
        </div>
      )}
      {activeTab === 'history' && (
        <div role="tabpanel" id="workers-panel-history" aria-labelledby="workers-tab-history" className="workers-tabpanel">
          <WorkerHistory />
        </div>
      )}
      {activeTab === 'audit' && (
        <div role="tabpanel" id="workers-panel-audit" aria-labelledby="workers-tab-audit" className="workers-tabpanel">
          <WorkerAudit />
        </div>
      )}

      {runId && <WorkerDrawer runId={runId} onClose={closeDrawer} />}
    </div>
  );
}
