// ============================================================
// RuleViolations.tsx — Rule Violation Tracker Dashboard
// Story: ctr-p2-violation-tracker AC4 — 4 區塊:KPI / by-rule / by-phase / timeline
// ============================================================
import { useState, useEffect } from 'react';
import {
  fetchViolationStats,
  fetchViolationRecent,
  type ViolationStats,
  type ViolationEntry,
} from '../services/ruleViolationsApi.js';
import '../styles/rule-violations.css';

type Status = 'GREEN' | 'YELLOW' | 'RED';

function statusClass(status: Status): string {
  return `rule-violations-page__kpi-chip--status-${status.toLowerCase()}`;
}

function badgeClass(status: Status): string {
  return `rule-violations-page__status-badge rule-violations-page__status-badge--${status.toLowerCase()}`;
}

function sevClass(sev: string): string {
  const s = (sev || 'low').toLowerCase();
  return `rule-violations-page__sev rule-violations-page__sev--${s}`;
}

export default function RuleViolations() {
  const [stats, setStats] = useState<ViolationStats | null>(null);
  const [items, setItems] = useState<ViolationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, r] = await Promise.all([
          fetchViolationStats(60),
          fetchViolationRecent(20),
        ]);
        if (cancelled) return;
        setStats(s);
        setItems(r.items);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const maxPhase = stats?.by_phase.reduce((m, p) => Math.max(m, p.count), 0) || 1;

  return (
    <div className="rule-violations-page">
      <div className="rule-violations-page__header">
        <h1>🛡️ Rule 違規追蹤</h1>
        <p className="rule-violations-page__subtitle">
          60 天觀察期 · baseline 8 起/30d · Phase 1 rules paths 套用後目標 ≤ baseline
        </p>
      </div>

      {error && <div className="rule-violations-page__error">載入失敗:{error}</div>}

      {/* ── KPI row ─────────────────────────────────────── */}
      {stats && (
        <div className="rule-violations-page__kpi-row">
          <div className={`rule-violations-page__kpi-chip ${statusClass(stats.status)}`}>
            <span className="rule-violations-page__kpi-label">60 天總違規</span>
            <span className="rule-violations-page__kpi-value">{stats.total_60d}</span>
            <span className="rule-violations-page__kpi-sub">起事故</span>
          </div>
          <div className={`rule-violations-page__kpi-chip ${statusClass(stats.status)}`}>
            <span className="rule-violations-page__kpi-label">30 天 rolling</span>
            <span className="rule-violations-page__kpi-value">{stats.total_30d_rolling}</span>
            <span className="rule-violations-page__kpi-sub">baseline {stats.baseline}</span>
          </div>
          <div className={`rule-violations-page__kpi-chip ${statusClass(stats.status)}`}>
            <span className="rule-violations-page__kpi-label">vs baseline</span>
            <span
              className={`rule-violations-page__kpi-value ${stats.baseline_compare_pct >= 0
                ? 'rule-violations-page__compare-pos'
                : 'rule-violations-page__compare-neg'
              }`}
            >
              {stats.baseline_compare_pct >= 0 ? '+' : ''}{stats.baseline_compare_pct}%
            </span>
            <span className={badgeClass(stats.status)}>{stats.status}</span>
          </div>
        </div>
      )}

      {/* ── By-rule + By-phase grid ────────────────────── */}
      {stats && (
        <div className="rule-violations-page__grid">
          <section className="rule-violations-page__card">
            <h2>Top 10 違反最頻繁的規則</h2>
            {stats.by_rule.length === 0 ? (
              <div className="rule-violations-page__empty">60 天內尚無違規記錄 ✅</div>
            ) : (
              <table className="rule-violations-page__rule-table">
                <thead>
                  <tr>
                    <th>Rule 檔路徑</th>
                    <th className="rule-count">次數</th>
                    <th>最近事故</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_rule.map(r => (
                    <tr key={r.rule}>
                      <td><code>{r.rule}</code></td>
                      <td className="rule-count">{r.count}</td>
                      <td>{r.last_timestamp.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rule-violations-page__card">
            <h2>By workflow phase</h2>
            {stats.by_phase.length === 0 ? (
              <div className="rule-violations-page__empty">—</div>
            ) : (
              stats.by_phase.map(p => (
                <div key={p.phase} className="rule-violations-page__phase-item">
                  <div className="rule-violations-page__phase-header">
                    <span>{p.phase}</span>
                    <span>{p.count}</span>
                  </div>
                  <div className="rule-violations-page__phase-bar">
                    <div
                      className="rule-violations-page__phase-bar-fill"
                      style={{ width: `${Math.round((p.count / maxPhase) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {/* ── Timeline ────────────────────────────────────── */}
      <section className="rule-violations-page__card rule-violations-page__timeline">
        <h2>最近 {items.length} 起事故(timeline)</h2>
        {loading ? (
          <div className="rule-violations-page__empty">載入中…</div>
        ) : items.length === 0 ? (
          <div className="rule-violations-page__empty">60 天內尚無違規記錄 ✅</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>時間</th>
                <th>Rule</th>
                <th>Phase</th>
                <th>Severity</th>
                <th>Flags</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {items.map(e => {
                const m = e.metadata;
                return (
                  <tr key={e.id}>
                    <td className="ts">{e.timestamp.slice(0, 19).replace('T', ' ')}</td>
                    <td><code>{m?.violated_rule_path || e.related_files || '—'}</code></td>
                    <td>{m?.workflow_phase || '—'}</td>
                    <td>{m?.severity && <span className={sevClass(m.severity)}>{m.severity}</span>}</td>
                    <td>
                      <span className={`rule-violations-page__flag rule-violations-page__flag--${m?.rule_loaded_at_time ? 'on' : 'off'}`}>
                        loaded:{m?.rule_loaded_at_time ? 'Y' : 'N'}
                      </span>
                      <span className={`rule-violations-page__flag rule-violations-page__flag--${m?.cli_enforcement ? 'on' : 'off'}`}>
                        CLI:{m?.cli_enforcement ? 'Y' : 'N'}
                      </span>
                    </td>
                    <td>{m?.incident_summary || e.title}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
