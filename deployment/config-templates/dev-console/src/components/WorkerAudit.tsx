// ============================================================
// WorkerAudit.tsx — 分頁 C：殭屍清單 + close_source 九分類 + 送達健康度 + 不變量違反
// whp-10-devconsole-ui Task 10
// ============================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLiveBoard, listWorkerRuns, reapWorkerRuns, describeWorkersApiError } from '../services/workersApi.js';
import type { WorkerRun, GuardianStatus, ReapReport } from '../types/workers.js';
import { CloseSourcePieChart } from './charts/WorkerCharts.js';

// ponytail: 無批次查詢 API，僅取最近 100 筆（started_at DESC）供稽核聚合；
// 逾此規模需 whp-9 補分頁聚合 endpoint 才能升級。
const AUDIT_SAMPLE_SIZE = 100;

interface InvariantViolation {
  rule: string;
  detail: string;
}

function detectInvariantViolations(items: WorkerRun[], guardian: GuardianStatus | undefined): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const item of items) {
    if (item.lifecycle === 'closed' && !item.closed_at) {
      violations.push({ rule: 'closed-but-closed-at-null', detail: `${item.run_id}：lifecycle=closed 但 closed_at 為空` });
    }
  }

  const byStoryPhase = new Map<string, number[]>();
  for (const item of items) {
    const key = `${item.story_id}::${item.phase}`;
    const list = byStoryPhase.get(key) ?? [];
    list.push(item.attempt);
    byStoryPhase.set(key, list);
  }
  for (const [key, attempts] of byStoryPhase) {
    const sorted = [...attempts].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]! - sorted[i - 1]! > 1) {
        violations.push({ rule: 'attempt-gap', detail: `${key}：attempt 跳號（${sorted.join(',')}）` });
        break;
      }
    }
  }

  if (guardian && guardian.present && guardian.stale) {
    violations.push({ rule: 'guardian-stale', detail: '守護心跳逾時（guardian.stale = true）' });
  }

  return violations;
}

export default function WorkerAudit() {
  const [items, setItems] = useState<WorkerRun[]>([]);
  const [guardian, setGuardian] = useState<GuardianStatus | undefined>(undefined);
  const [reapPreview, setReapPreview] = useState<ReapReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [board, list] = await Promise.all([
        fetchLiveBoard(),
        listWorkerRuns({ page: 1, pageSize: AUDIT_SAMPLE_SIZE }),
      ]);
      setGuardian(board.guardian);
      setItems(list.items);
      setError(null);
    } catch (err) {
      setError(describeWorkersApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleReapPreview(): Promise<void> {
    try {
      const report = await reapWorkerRuns(true);
      setReapPreview(report);
    } catch (err) {
      setError(describeWorkersApiError(err));
    }
  }

  async function handleReapConfirm(): Promise<void> {
    try {
      await reapWorkerRuns(false);
      setReapPreview(null);
      await load();
    } catch (err) {
      setError(describeWorkersApiError(err));
    }
  }

  const zombies = items.filter((r) => r.lifecycle === 'abandoned');
  const violations = detectInvariantViolations(items, guardian);

  if (loading) return <p>載入中…</p>;

  return (
    <div className="worker-audit">
      {error && <p className="worker-queue-warning">{error}</p>}

      <section className="worker-audit__section">
        <h3 className="worker-audit__section-title">殭屍清單</h3>
        {zombies.length === 0 ? (
          <p>目前無殭屍列</p>
        ) : (
          zombies.map((z) => (
            <div key={z.run_id} className="worker-audit__zombie-row">
              <span>{z.run_id}（{z.story_id}/{z.phase}）abandoned_at_stage：{z.abandoned_at_stage ?? '—'}</span>
              <Link to={`/stories/${encodeURIComponent(z.story_id)}`}>查該 story 交付</Link>
            </div>
          ))
        )}
        <div className="worker-audit__reap-actions">
          <button type="button" onClick={() => void handleReapPreview()}>立即 reaper 對帳</button>
        </div>
        {reapPreview && (
          <div className="worker-audit__reap-preview">
            <p>掃描 {reapPreview.scanned} · 存活 {reapPreview.alive} · 將標記為 abandoned：{reapPreview.reaped}</p>
            <ul>
              {reapPreview.runs.map((r) => (
                <li key={r.run_id}>{r.run_id}（{r.story_id}/{r.phase}）{r.from} → {r.to}［{r.reason}］</li>
              ))}
            </ul>
            <div className="worker-audit__reap-actions">
              <button type="button" onClick={() => void handleReapConfirm()}>確認執行（將寫入 abandoned，不可逆）</button>
              <button type="button" onClick={() => setReapPreview(null)}>取消</button>
            </div>
          </div>
        )}
      </section>

      <section className="worker-audit__section">
        <h3 className="worker-audit__section-title">close_source 分布（九分類）</h3>
        <div className="worker-chart-card">
          <CloseSourcePieChart items={items} />
        </div>
      </section>

      <section className="worker-audit__section">
        <h3 className="worker-audit__section-title">送達健康度</h3>
        <p>本區塊需逐一開啟溝通串查看訊息送達狀態（whp-9 尚無跨 run 批次查詢 API）。</p>
      </section>

      <section className="worker-audit__section">
        <h3 className="worker-audit__section-title">不變量違反</h3>
        {violations.length === 0 ? (
          <p>目前無不變量違反</p>
        ) : (
          violations.map((v, i) => (
            <p key={`${v.rule}-${i}`} className="worker-audit__invariant-row">⚠ {v.detail}</p>
          ))
        )}
      </section>
    </div>
  );
}
