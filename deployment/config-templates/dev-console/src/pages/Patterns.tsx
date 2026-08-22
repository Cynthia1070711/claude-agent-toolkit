// ============================================================
// Patterns.tsx — 持續學習模式觀察頁
// Phase 4: Embedding 狀態 + Domain 活動 + 模式表格 + i18n
// td-devconsole-godnode-and-mem-dashboard: +4 Memory Dashboard charts in sidebar
// ============================================================
import { useState, useEffect } from 'react';
import { formatTimestamp } from '../lib/naturalLanguage.js';
import {
  fetchObservations,
  fetchEmbeddingHealth,
  fetchRetrievalStats,
  type PatternObservation,
  type DomainStat,
  type EmbeddingHealth,
  type RetrievalStats,
} from '../services/patternsApi.js';
import {
  fetchDailyContext,
  fetchDebtSeverity,
  fetchIddSubtypes,
  fetchStoryFunnel,
  type DailyContextResponse,
  type DebtSeverityResponse,
  type IddSubtypeResponse,
  type StoryFunnelResponse,
} from '../services/dashboardChartsApi.js';
import DailyContextTrendChart from '../components/charts/DailyContextTrendChart.js';
import TechDebtSeverityChart from '../components/charts/TechDebtSeverityChart.js';
import IDDSubtypesChart from '../components/charts/IDDSubtypesChart.js';
import StoryStatusFunnel from '../components/charts/StoryStatusFunnel.js';
import { useI18n } from '../i18n/I18nProvider.js';
import '../styles/patterns.css';
import '../styles/god-nodes.css';

/** Hash-based hue from domain string — produces consistent, varied colors */
function domainHue(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export default function Patterns() {
  const { t } = useI18n();
  const [observations, setObservations] = useState<PatternObservation[]>([]);
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [health, setHealth] = useState<EmbeddingHealth | null>(null);
  const [retrieval, setRetrieval] = useState<RetrievalStats | null>(null);
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // td-devconsole-godnode-and-mem-dashboard: Memory Dashboard charts state
  const [dailyContext, setDailyContext] = useState<DailyContextResponse | null>(null);
  const [debtSeverity, setDebtSeverity] = useState<DebtSeverityResponse | null>(null);
  const [iddSubtypes, setIddSubtypes] = useState<IddSubtypeResponse | null>(null);
  const [storyFunnel, setStoryFunnel] = useState<StoryFunnelResponse | null>(null);
  // Show-more / collapse state for Domain Activity + Observations cards (default 20)
  const [domainExpanded, setDomainExpanded] = useState(false);
  const [observationsExpanded, setObservationsExpanded] = useState(false);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainFilter]);

  // 一次性載入 Memory Dashboard charts(不隨 domain filter 重 fetch)
  useEffect(() => {
    loadDashboardCharts();
  }, []);

  const loadData = async () => {
    try {
      const [obsData, healthData, retrievalData] = await Promise.all([
        fetchObservations(domainFilter || undefined),
        fetchEmbeddingHealth(),
        fetchRetrievalStats(),
      ]);
      setObservations(obsData.observations);
      setDomainStats(obsData.domainStats);
      setHealth(healthData);
      setRetrieval(retrievalData);
    } catch (err) {
      console.error(err);
    }
  };

  const loadDashboardCharts = async () => {
    try {
      const [dc, ds, idd, sf] = await Promise.all([
        fetchDailyContext(30),
        fetchDebtSeverity(),
        fetchIddSubtypes(),
        fetchStoryFunnel(),
      ]);
      setDailyContext(dc);
      setDebtSeverity(ds);
      setIddSubtypes(idd);
      setStoryFunnel(sf);
    } catch (err) {
      console.error('Memory Dashboard load failed:', err);
    }
  };

  const maxOps = Math.max(...domainStats.map(d => d.total_ops), 1);

  return (
    <div className="patterns-page">
      <div className="patterns-page__header">
        <h1>{t.patterns.title}</h1>
        <p className="patterns-page__subtitle">{t.patterns.subtitle}</p>
      </div>

      {/* ── Embedding Status Bar (top) ── */}
      {health && (
        <div className="patterns-page__status-bar">
          <div className="patterns-page__stat-chip">
            <span className="patterns-page__stat-icon">&#x1F9EC;</span>
            <div className="patterns-page__stat-info">
              <span className="patterns-page__stat-value">
                {health.symbolEmbeddings.toLocaleString()} / {health.symbolIndex.toLocaleString()}
              </span>
              <span className="patterns-page__stat-label">{t.patterns.symbolVectors}</span>
            </div>
            {health.symbolIndex > 0 && (
              <span className={`patterns-page__stat-pct ${health.symbolEmbeddings === health.symbolIndex ? 'patterns-page__stat-pct--full' : ''}`}>
                {Math.round((health.symbolEmbeddings / health.symbolIndex) * 100)}%
              </span>
            )}
          </div>
          <div className="patterns-page__stat-chip">
            <span className="patterns-page__stat-icon">&#x1F4C4;</span>
            <div className="patterns-page__stat-info">
              <span className="patterns-page__stat-value">{health.documentEmbeddings.toLocaleString()}</span>
              <span className="patterns-page__stat-label">{t.patterns.docVectors}</span>
            </div>
          </div>
          <div className="patterns-page__stat-chip">
            <span className="patterns-page__stat-icon">&#x23F3;</span>
            <div className="patterns-page__stat-info">
              <span className="patterns-page__stat-value">{health.queuePending}</span>
              <span className="patterns-page__stat-label">{t.patterns.pending}</span>
            </div>
          </div>
          <div className="patterns-page__stat-chip">
            <span className="patterns-page__stat-icon">&#x2705;</span>
            <div className="patterns-page__stat-info">
              <span className="patterns-page__stat-value">{health.queueProcessed}</span>
              <span className="patterns-page__stat-label">{t.patterns.processed}</span>
            </div>
          </div>
          {health.modelName !== 'N/A' && (
            <div className="patterns-page__stat-chip patterns-page__stat-chip--model">
              <span className="patterns-page__stat-icon">&#x1F50D;</span>
              <div className="patterns-page__stat-info">
                <span className="patterns-page__stat-value">{health.modelName}</span>
                <span className="patterns-page__stat-label">{health.dimensions}D</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Top full-width chart: 每日 add_context 趨勢 (by category) ── */}
      {dailyContext && (
        <div id="daily-context" className="patterns-page__top-chart">
          <div className="patterns-page__card">
            <h2>{t.dashboardCharts.dailyContextTitle}</h2>
            <div className="dashboard-chart">
              <DailyContextTrendChart
                data={dailyContext.data}
                categories={dailyContext.categories}
                noDataLabel={t.dashboardCharts.noData}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Second row (3-column): Tech Debt severity / IDD 4 類型 / Story 漏斗 ── */}
      <div className="patterns-page__second-row">
        {debtSeverity && (
          <div id="debt-severity" className="patterns-page__card">
            <h2>{t.dashboardCharts.debtSeverityTitle}</h2>
            <div className="dashboard-chart">
              <TechDebtSeverityChart
                data={debtSeverity.data}
                severities={debtSeverity.severities}
                statuses={debtSeverity.statuses}
                noDataLabel={t.dashboardCharts.noData}
              />
            </div>
          </div>
        )}

        {iddSubtypes && (
          <div id="idd-pie" className="patterns-page__card">
            <h2>{t.dashboardCharts.iddSubtypesTitle}</h2>
            <div className="dashboard-chart dashboard-chart--small">
              <IDDSubtypesChart
                data={iddSubtypes.data}
                types={iddSubtypes.types}
                otherCount={iddSubtypes.other_count}
                noDataLabel={t.dashboardCharts.noData}
              />
            </div>
          </div>
        )}

        {storyFunnel && (
          <div id="story-funnel" className="patterns-page__card">
            <h2>{t.dashboardCharts.storyFunnelTitle}</h2>
            <div className="dashboard-chart dashboard-chart--small">
              <StoryStatusFunnel
                data={storyFunnel.data}
                stages={storyFunnel.stages}
                otherCount={storyFunnel.other_count}
                noDataLabel={t.dashboardCharts.noData}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Main content: Domain (left) + Observations (right) ── */}
      <div className="patterns-page__main">
        {/* Domain Activity + Memory Coverage — left sidebar */}
        <aside className="patterns-page__sidebar">
          <div className="patterns-page__card">
            <h2>{t.patterns.domainActivity} ({domainStats.length})</h2>
            {domainStats.length === 0 ? (
              <div className="patterns-page__empty-state">{t.patterns.noObservations}</div>
            ) : (
              <>
                <div className="patterns-page__domain-list">
                  {(domainExpanded ? domainStats : domainStats.slice(0, 20)).map(d => {
                    const hue = domainHue(d.domain);
                    return (
                      <div
                        key={d.domain}
                        className={`patterns-page__domain-row ${domainFilter === d.domain ? 'patterns-page__domain-row--active' : ''}`}
                        onClick={() => setDomainFilter(domainFilter === d.domain ? '' : d.domain)}
                      >
                        <span
                          className="patterns-page__domain-name"
                          style={{ color: `hsl(${hue}, 60%, 55%)` }}
                        >
                          {d.domain}
                        </span>
                        <div className="patterns-page__bar-wrapper">
                          <div
                            className="patterns-page__bar"
                            style={{
                              width: `${(d.total_ops / maxOps) * 100}%`,
                              background: `hsl(${hue}, 60%, 50%)`,
                            }}
                          />
                        </div>
                        <span className="patterns-page__domain-ops">{d.total_ops}</span>
                        <span className="patterns-page__domain-conf">{(d.avg_confidence * 100).toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
                {domainStats.length > 20 && (
                  <button
                    className="patterns-page__toggle-btn"
                    onClick={() => setDomainExpanded(v => !v)}
                  >
                    {domainExpanded ? t.patterns.showLess : `${t.patterns.showMore}(+${domainStats.length - 20})`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Memory Embedding Coverage — inside sidebar */}
          {health && health.memory.length > 0 && (
            <div className="patterns-page__card patterns-page__card--memory">
              <h2>{t.patterns.memoryCoverage}</h2>
              <div className="patterns-page__memory-list">
                {health.memory.map(m => {
                  const pct = m.src > 0 ? Math.round((m.emb / m.src) * 100) : 0;
                  return (
                    <div key={m.name} className="patterns-page__memory-item">
                      <span className="patterns-page__memory-name">{m.name}</span>
                      <div className="patterns-page__memory-track">
                        <div
                          className={`patterns-page__memory-fill ${pct === 100 ? 'patterns-page__memory-fill--full' : pct < 70 ? 'patterns-page__memory-fill--low' : ''}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="patterns-page__memory-nums">{m.emb}/{m.src}</span>
                      <span className={`patterns-page__memory-pct ${pct === 100 ? 'patterns-page__stat-pct--full' : ''}`}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Retrieval Activity — inside sidebar */}
          {retrieval && retrieval.toolStats.length > 0 && (
            <div className="patterns-page__card patterns-page__card--memory">
              <h2>{t.patterns.retrievalActivity} ({retrieval.totalCalls})</h2>
              <div className="patterns-page__retrieval-list">
                {retrieval.toolStats.map(s => {
                  const shortName = s.tool_name.replace('search_', '').replace('get_', '');
                  return (
                    <div key={s.tool_name} className="patterns-page__retrieval-row">
                      <span className="patterns-page__retrieval-name" title={s.tool_name}>{shortName}</span>
                      <span className="patterns-page__retrieval-count">{s.call_count}</span>
                      <span className="patterns-page__retrieval-meta">
                        {s.avg_results > 0 ? `~${s.avg_results}` : '—'}
                      </span>
                      <span className="patterns-page__retrieval-meta">
                        {s.avg_duration_ms ? `${s.avg_duration_ms}ms` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hot Entries — most retrieved memory entries */}
          {retrieval && retrieval.hotEntries && retrieval.hotEntries.length > 0 && (
            <div className="patterns-page__card patterns-page__card--memory">
              <h2>{t.patterns.hotEntries} ({retrieval.hotEntries.length})</h2>
              <div className="patterns-page__hot-list">
                {retrieval.hotEntries.slice(0, 10).map(e => {
                  const pct = Math.round(e.confidence * 100);
                  return (
                    <div key={`${e.source_table}-${e.entry_id}`} className="patterns-page__hot-row" title={`${e.source_table} #${e.entry_id}\n${e.last_query}`}>
                      <span className="patterns-page__hot-title">{e.entry_title || `#${e.entry_id}`}</span>
                      <span className="patterns-page__retrieval-count">{e.hit_count}</span>
                      <div className="patterns-page__conf-track" style={{ width: 40 }}>
                        <div className={`patterns-page__conf-bar ${pct === 100 ? 'patterns-page__conf-bar--full' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="patterns-page__retrieval-meta">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Keywords — most searched terms */}
          {retrieval && retrieval.topKeywords && retrieval.topKeywords.length > 0 && (
            <div className="patterns-page__card patterns-page__card--memory">
              <h2>{t.patterns.topKeywords}</h2>
              <div className="patterns-page__keyword-cloud">
                {retrieval.topKeywords.slice(0, 20).map(kw => {
                  const maxHits = retrieval.topKeywords[0]?.hit_count || 1;
                  const size = 0.625 + (kw.hit_count / maxHits) * 0.375;
                  return (
                    <span
                      key={kw.keyword}
                      className="patterns-page__keyword-tag"
                      style={{ fontSize: `${size}rem` }}
                      title={`${kw.hit_count} 次搜尋`}
                    >
                      {kw.keyword}
                      <sup className="patterns-page__keyword-count">{kw.hit_count}</sup>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Memory Dashboard 4 charts 已移至頁面頂層(top-chart + second-row),不在 sidebar */}
        </aside>

        {/* Observations Table — right main area */}
        <section className="patterns-page__observations">
          <h2>{t.patterns.observations} ({observations.length})</h2>
          {observations.length === 0 ? (
            <div className="patterns-page__empty-state">{t.patterns.noObservations}</div>
          ) : (
            <>
            <table className="patterns-page__table">
              <thead>
                <tr>
                  <th>{t.patterns.colFile}</th>
                  <th>{t.patterns.colDomain}</th>
                  <th>{t.patterns.colTool}</th>
                  <th>{t.patterns.colOccurrences}</th>
                  <th>{t.patterns.colConfidence}</th>
                  <th>{t.patterns.colLastSeen}</th>
                </tr>
              </thead>
              <tbody>
                {(observationsExpanded ? observations : observations.slice(0, 20)).map(o => {
                  const hue = domainHue(o.domain);
                  return (
                    <>
                      <tr
                        key={o.id}
                        className="patterns-page__row patterns-page__row--clickable"
                        onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                      >
                        <td className="patterns-page__filepath" title={o.file_path}>
                          {o.file_path.split(/[/\\]/).slice(-2).join('/')}
                        </td>
                        <td>
                          <span
                            className="patterns-page__chip"
                            style={{
                              background: `hsl(${hue}, 60%, 15%)`,
                              color: `hsl(${hue}, 60%, 65%)`,
                            }}
                          >
                            {o.domain}
                          </span>
                        </td>
                        <td>{o.tool_name}</td>
                        <td className="patterns-page__center">{o.occurrences}</td>
                        <td>
                          <div className="patterns-page__confidence">
                            <div className="patterns-page__conf-track">
                              <div
                                className="patterns-page__conf-bar"
                                style={{ width: `${o.confidence * 100}%` }}
                              />
                            </div>
                            <span>{(o.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="patterns-page__time">{formatTimestamp(o.last_seen)}</td>
                      </tr>
                      {expandedId === o.id && (
                        <tr className="patterns-page__detail-row">
                          <td colSpan={6}>
                            <div className="patterns-page__detail">
                              <div className="patterns-page__detail-grid">
                                <div>
                                  <span className="patterns-page__detail-label">{t.patterns.colFile}</span>
                                  <code className="patterns-page__detail-value">{o.file_path}</code>
                                </div>
                                <div>
                                  <span className="patterns-page__detail-label">{t.patterns.changeType}</span>
                                  <span className="patterns-page__detail-value">{o.change_type || '—'}</span>
                                </div>
                                <div>
                                  <span className="patterns-page__detail-label">{t.patterns.firstSeen}</span>
                                  <span className="patterns-page__detail-value">{formatTimestamp(o.first_seen)}</span>
                                </div>
                                <div>
                                  <span className="patterns-page__detail-label">{t.patterns.colLastSeen}</span>
                                  <span className="patterns-page__detail-value">{formatTimestamp(o.last_seen)}</span>
                                </div>
                                <div>
                                  <span className="patterns-page__detail-label">{t.patterns.colOccurrences}</span>
                                  <span className="patterns-page__detail-value">{o.occurrences}</span>
                                </div>
                                <div>
                                  <span className="patterns-page__detail-label">{t.patterns.colConfidence}</span>
                                  <span className="patterns-page__detail-value">{(o.confidence * 100).toFixed(1)}%</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {observations.length > 20 && (
              <button
                className="patterns-page__toggle-btn"
                onClick={() => setObservationsExpanded(v => !v)}
              >
                {observationsExpanded ? t.patterns.showLess : `${t.patterns.showMore}(+${observations.length - 20})`}
              </button>
            )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
