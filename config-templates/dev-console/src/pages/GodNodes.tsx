// ============================================================
// GodNodes.tsx — God Node centrality dashboard (R2 redesign)
// Story: td-devconsole-godnode-and-mem-dashboard
// 對齊 /patterns + /rule-violations dashboard 範式 — Status Bar + Top List with score bars + By Namespace sidebar
// (取消 Treemap 因 user feedback「一大片色塊無意義」— Treemap 對 god node 排名 inherently 不適合)
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  fetchGodNodes,
  fetchGodNodeDistribution,
  hslByCluster,
  extractCluster,
  type GodNode,
  type GodNodeDistribution,
} from '../services/godNodesApi.js';
import { useI18n } from '../i18n/I18nProvider.js';
import '../styles/god-nodes.css';

const TOP_N_OPTIONS = [10, 20, 50, 100];

// CR F-L2 fix: pin formatting to Asia/Taipei TZ so output is stable when developer travels.
// (Constitutional Standard §Timestamp Mandate forbids implicit local-TZ formatting.)
const TAIPEI_DATE = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' });
const TAIPEI_TIME = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' });

function formatLastComputed(ts: string | null): string {
  if (!ts) return '—';
  try {
    const date = new Date(ts);
    const todayStr = TAIPEI_DATE.format(new Date());
    const dateStr = TAIPEI_DATE.format(date);
    const timeStr = TAIPEI_TIME.format(date);
    if (todayStr === dateStr) {
      return `今日 ${timeStr}`;
    }
    return `${dateStr} ${timeStr}`;
  } catch {
    return ts.slice(0, 16);
  }
}

export default function GodNodes() {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<GodNode[]>([]);
  const [distribution, setDistribution] = useState<GodNodeDistribution | null>(null);
  const [filter, setFilter] = useState<{ excluded_namespaces: string[] } | null>(null);
  const [topN, setTopN] = useState<number>(20);
  const [namespace, setNamespace] = useState<string>('');
  const [includeGenerated, setIncludeGenerated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  // CR F-H5 fix: sequence-id ref prevents stale fetch results from overwriting fresh state
  // when user toggles filters rapidly (no AbortController needed for read-only GET).
  const fetchSeqRef = useRef(0);

  const loadData = useCallback(async () => {
    const mySeq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [list, dist] = await Promise.all([
        fetchGodNodes({
          limit: topN,
          namespace: namespace || undefined,
          include_generated: includeGenerated,
        }),
        fetchGodNodeDistribution(includeGenerated),
      ]);
      // Drop stale fetch — only the latest in-flight request commits state
      if (mySeq !== fetchSeqRef.current) return;
      setNodes(list.god_nodes);
      setFilter(list.filter);
      setDistribution(dist);
    } catch (err) {
      if (mySeq === fetchSeqRef.current) {
        setError((err as Error).message);
      }
    } finally {
      if (mySeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [topN, namespace, includeGenerated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const namespaceOptions = useMemo(() => {
    const set = new Set<string>();
    distribution?.by_namespace.forEach(n => set.add(n.namespace));
    nodes.forEach(n => set.add(n.namespace));
    return Array.from(set).sort();
  }, [nodes, distribution]);

  const maxScore = distribution?.max ?? Math.max(...nodes.map(n => n.centrality_score), 1);
  const maxNsCount = Math.max(...(distribution?.by_namespace.map(n => n.count) ?? [1]), 1);

  // BR-VIS-004: vscode:// click + clipboard fallback
  // CR F-H1+M8+M13 fix: encodeURI + log + soft hint when protocol handler not available
  const handleNodeClick = useCallback((node: GodNode) => {
    // encode each path segment to neutralize wildcards / scheme-breaking chars
    const safePath = node.absolute_path.split('/').map(seg => encodeURIComponent(seg)).join('/');
    const url = `vscode://file/${safePath}:${node.start_line}`;
    try {
      window.location.href = url;
    } catch (err) {
      console.error('[GodNodes] vscode:// navigation failed', err);
    }
  }, []);

  const copyPath = useCallback(async (node: GodNode) => {
    const text = `${node.file_path}:${node.start_line}`;
    // CR F-M6 fix: feature-detect navigator.clipboard before usage (HTTPS/permission gate)
    if (!navigator.clipboard?.writeText) {
      console.warn('[GodNodes] navigator.clipboard unavailable (insecure context or unsupported browser)');
      setCopyToast(t.godNodes.copyFailed);
      setTimeout(() => setCopyToast(null), 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(`${t.godNodes.copied}: ${text}`);
      setTimeout(() => setCopyToast(null), 2000);
    } catch (err) {
      console.error('[GodNodes] clipboard write failed', err);
      setCopyToast(t.godNodes.copyFailed);
      setTimeout(() => setCopyToast(null), 2000);
    }
  }, [t.godNodes.copied, t.godNodes.copyFailed]);

  return (
    <div className="god-nodes-page">
      <div className="god-nodes-page__header">
        <h1>{t.godNodes.title}</h1>
        <p className="god-nodes-page__subtitle">{t.godNodes.subtitle}</p>
      </div>

      {/* ── Status Bar (top, /patterns 範式) ───────────────────── */}
      {distribution && (
        <div className="god-nodes-page__status-bar">
          <div className="god-nodes-page__stat-chip">
            <span className="god-nodes-page__stat-icon">📊</span>
            <div className="god-nodes-page__stat-info">
              <span className="god-nodes-page__stat-value">{distribution.total.toLocaleString()}</span>
              <span className="god-nodes-page__stat-label">總 Symbols</span>
            </div>
          </div>
          <div className="god-nodes-page__stat-chip god-nodes-page__stat-chip--highlight">
            <span className="god-nodes-page__stat-icon">⭐</span>
            <div className="god-nodes-page__stat-info">
              <span className="god-nodes-page__stat-value">
                {distribution.non_zero_count.toLocaleString()}
                <span className="god-nodes-page__stat-pct">({distribution.non_zero_pct}%)</span>
              </span>
              <span className="god-nodes-page__stat-label">Non-Zero god nodes</span>
            </div>
          </div>
          <div className="god-nodes-page__stat-chip">
            <span className="god-nodes-page__stat-icon">🔝</span>
            <div className="god-nodes-page__stat-info">
              <span className="god-nodes-page__stat-value">{distribution.max.toFixed(2)}</span>
              <span className="god-nodes-page__stat-label">Max</span>
            </div>
          </div>
          <div className="god-nodes-page__stat-chip">
            <span className="god-nodes-page__stat-icon">📈</span>
            <div className="god-nodes-page__stat-info">
              <span className="god-nodes-page__stat-value">{distribution.p95.toFixed(2)}</span>
              <span className="god-nodes-page__stat-label">P95(god 上層門檻)</span>
            </div>
          </div>
          <div className="god-nodes-page__stat-chip">
            <span className="god-nodes-page__stat-icon">📉</span>
            <div className="god-nodes-page__stat-info">
              <span className="god-nodes-page__stat-value">{distribution.median.toFixed(2)}</span>
              <span className="god-nodes-page__stat-label">Median</span>
            </div>
          </div>
          <div className="god-nodes-page__stat-chip god-nodes-page__stat-chip--health">
            <span className="god-nodes-page__stat-icon">🔄</span>
            <div className="god-nodes-page__stat-info">
              <span className="god-nodes-page__stat-value">{formatLastComputed(distribution.last_computed)}</span>
              <span className="god-nodes-page__stat-label">Last Indexed(centrality 數據活著)</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Filter Bar ─────────────────────────────────────────── */}
      <div className="god-nodes-page__filters">
        <div className="god-nodes-page__filter-group">
          <label htmlFor="top-n-filter">{t.godNodes.topNLabel}</label>
          <select id="top-n-filter" value={topN} onChange={e => setTopN(Number(e.target.value))}>
            {TOP_N_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="god-nodes-page__filter-group">
          <label htmlFor="namespace-filter">{t.godNodes.namespaceLabel}</label>
          <select id="namespace-filter" value={namespace} onChange={e => setNamespace(e.target.value)}>
            <option value="">{t.godNodes.allNamespaces}</option>
            {namespaceOptions.map(ns => <option key={ns} value={ns}>{ns}</option>)}
          </select>
        </div>
        <div className="god-nodes-page__filter-group">
          <label>
            <input type="checkbox" checked={includeGenerated} onChange={e => setIncludeGenerated(e.target.checked)} />
            {' '}{t.godNodes.includeGenerated}
          </label>
        </div>
        {filter && filter.excluded_namespaces.length > 0 && (
          <span className="god-nodes-page__filter-note">
            {t.godNodes.excluded}: {filter.excluded_namespaces.join(', ')}
          </span>
        )}
      </div>

      {error && (
        <div className="god-nodes-page__error">{t.godNodes.loadError}: {error}</div>
      )}

      <div className="god-nodes-page__main">
        {/* Top List (left) — symbol + centrality bar + namespace chip + file:line */}
        <section className="god-nodes-page__list-area" id="god-nodes-table">
          <h2>核心節點 Top {topN}{loading ? '(載入中…)' : ''}</h2>
          {nodes.length === 0 ? (
            <div className="god-nodes-page__empty">{t.godNodes.empty}</div>
          ) : (
            <table className="god-nodes-page__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Symbol</th>
                  <th>Namespace</th>
                  <th>Centrality</th>
                  <th>File:Line</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n, i) => {
                  const cluster = extractCluster(n.namespace);
                  const hue = hslByCluster(cluster);
                  const widthPct = Math.max(2, (n.centrality_score / maxScore) * 100);
                  return (
                    <tr key={n.id} className="god-nodes-page__row">
                      <td className="god-nodes-page__rank">{i + 1}</td>
                      <td>
                        <button
                          className="god-nodes-page__symbol-btn"
                          title={`Click → vscode://file/${n.absolute_path}:${n.start_line}`}
                          onClick={() => handleNodeClick(n)}
                        >
                          {n.symbol_name}
                        </button>
                      </td>
                      <td>
                        <span
                          className="god-nodes-page__chip"
                          style={{ background: hue.replace(', 50%)', ', 18%)'), color: hue.replace(', 50%)', ', 70%)') }}
                          title={n.namespace}
                        >
                          {cluster.replace(/^PhyCool\./, '')}
                        </span>
                      </td>
                      <td>
                        <div className="god-nodes-page__bar-row">
                          <div className="god-nodes-page__bar-track">
                            <div
                              className="god-nodes-page__bar-fill"
                              style={{ width: `${widthPct}%`, background: hue }}
                            />
                          </div>
                          <span className="god-nodes-page__score">{n.centrality_score.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="god-nodes-page__file-cell">
                        <span className="god-nodes-page__file-path" title={`${n.file_path}:${n.start_line}`}>
                          {n.file_path.split('/').slice(-2).join('/')}:{n.start_line}
                        </span>
                        <button
                          className="god-nodes-page__copy-btn"
                          title={t.godNodes.copyTooltip}
                          onClick={() => copyPath(n)}
                        >📋</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Sidebar (right) — By Namespace + Distribution Stats */}
        <aside className="god-nodes-page__sidebar">
          {/* By Namespace breakdown(對齊 /patterns Domain Activity 範式)*/}
          {distribution && distribution.by_namespace.length > 0 && (
            <div className="god-nodes-page__card" id="by-namespace">
              {/* CR F-M10 fix: surface "showing 12 of N total" hint when LIMIT 30 truncates */}
              <h2>
                By Namespace ({distribution.by_namespace.length}
                {distribution.by_namespace_total !== undefined &&
                 distribution.by_namespace_total > distribution.by_namespace.length
                  ? ` of ${distribution.by_namespace_total}`
                  : ''})
              </h2>
              <div className="god-nodes-page__ns-list">
                {distribution.by_namespace.slice(0, 12).map(ns => {
                  const cluster = extractCluster(ns.namespace);
                  const hue = hslByCluster(cluster);
                  const widthPct = (ns.count / maxNsCount) * 100;
                  return (
                    <div
                      key={ns.namespace}
                      className={`god-nodes-page__ns-row${namespace === ns.namespace ? ' god-nodes-page__ns-row--active' : ''}`}
                      onClick={() => setNamespace(namespace === ns.namespace ? '' : ns.namespace)}
                    >
                      <span className="god-nodes-page__ns-name" style={{ color: hue.replace(', 50%)', ', 65%)') }}>
                        {ns.namespace.replace(/^PhyCool\./, '')}
                      </span>
                      <div className="god-nodes-page__ns-bar-track">
                        <div className="god-nodes-page__ns-bar-fill" style={{ width: `${widthPct}%`, background: hue }} />
                      </div>
                      <span className="god-nodes-page__ns-count">{ns.count}</span>
                      <span className="god-nodes-page__ns-max">↑{ns.max.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Distribution Stats panel */}
          {distribution && (
            <div className="god-nodes-page__card" id="distribution">
              <h2>{t.godNodes.distribution}</h2>
              <div className="distribution-stats__grid">
                {[
                  { label: 'Min', value: distribution.min.toFixed(2) },
                  { label: 'Max', value: distribution.max.toFixed(2), highlight: true },
                  { label: 'Mean', value: distribution.mean.toFixed(2) },
                  { label: 'Median', value: distribution.median.toFixed(2) },
                  { label: 'P50', value: distribution.p50.toFixed(2) },
                  { label: 'P75', value: distribution.p75.toFixed(2) },
                  { label: 'P95', value: distribution.p95.toFixed(2), highlight: true },
                  { label: 'P99', value: distribution.p99.toFixed(2), highlight: true },
                ].map(c => (
                  <div key={c.label} className={`distribution-stats__chip${c.highlight ? ' distribution-stats__chip--highlight' : ''}`}>
                    <span className="distribution-stats__label">{c.label}</span>
                    <span className="distribution-stats__value">{c.value}</span>
                  </div>
                ))}
              </div>
              <div className="distribution-stats__note">
                BlastRadius 分位:P95 ≥ {distribution.p95.toFixed(1)} = god 上層 / P75 ≥ {distribution.p75.toFixed(1)} = high-impact / P50 ≥ {distribution.p50.toFixed(1)} = mid-impact
              </div>
            </div>
          )}
        </aside>
      </div>

      {copyToast && <div className="god-nodes-page__toast" role="status">{copyToast}</div>}
    </div>
  );
}
