// ============================================================
// Intentional.tsx — IDD (Intentional Decision Debt) 管理頁面
// DLA-07 AC-12: 列表 + type/criticality/status 篩選 + 展開詳情
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchIntentionalDecisions } from '../services/intentionalApi.js';
import type { IddEntry } from '../services/intentionalApi.js';

const TYPE_LABELS: Record<string, string> = {
  COM: '💰 Commercial',
  STR: '🗺️ Strategic',
  REG: '⚖️ Regulatory',
  USR: '👤 User Decision',
};

const CRITICALITY_BADGE: Record<string, string> = {
  critical: '🔴 CRITICAL',
  normal: '🟡 Normal',
  low: '🟢 Low',
};

const STATUS_LABELS: Record<string, string> = {
  active: '✅ Active',
  retired: '⏹️ Retired',
  superseded: '🔄 Superseded',
};

export default function Intentional() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<IddEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const iddType = searchParams.get('idd_type') ?? '';
  const criticality = searchParams.get('criticality') ?? '';
  const status = searchParams.get('status') ?? 'active';
  const search = searchParams.get('search') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIntentionalDecisions({
        idd_type: iddType || undefined,
        criticality: criticality || undefined,
        status: status || 'active',
        search: search || undefined,
      });
      setItems(result.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [iddType, criticality, status, search]);

  useEffect(() => { void load(); }, [load]);

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const criticalItems = items.filter((i) => i.criticality === 'critical');
  const normalItems = items.filter((i) => i.criticality === 'normal');
  const lowItems = items.filter((i) => i.criticality === 'low');

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          🛡️ Intentional Decisions (IDD)
        </h1>
        <p style={{ color: '#666', marginTop: '0.25rem', fontSize: '0.875rem' }}>
          Framework v1.3 — 管理「故意不修」的 Business/Strategy/Regulatory/User 決策
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="搜尋 IDD..."
          value={search}
          onChange={(e) => setParam('search', e.target.value)}
          style={{ padding: '0.375rem 0.75rem', border: '1px solid #ddd', borderRadius: '4px', minWidth: '180px' }}
        />
        <select value={iddType} onChange={(e) => setParam('idd_type', e.target.value)}
          style={{ padding: '0.375rem 0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}>
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={criticality} onChange={(e) => setParam('criticality', e.target.value)}
          style={{ padding: '0.375rem 0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}>
          <option value="">All Criticality</option>
          <option value="critical">🔴 Critical</option>
          <option value="normal">🟡 Normal</option>
          <option value="low">🟢 Low</option>
        </select>
        <select value={status} onChange={(e) => setParam('status', e.target.value)}
          style={{ padding: '0.375rem 0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}>
          <option value="active">Active</option>
          <option value="retired">Retired</option>
          <option value="superseded">Superseded</option>
        </select>
      </div>

      {/* Summary */}
      {!loading && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#555' }}>
          <span>共 {items.length} 筆</span>
          {criticalItems.length > 0 && <span style={{ color: '#dc2626' }}>🔴 Critical: {criticalItems.length}</span>}
          {normalItems.length > 0 && <span style={{ color: '#d97706' }}>🟡 Normal: {normalItems.length}</span>}
          {lowItems.length > 0 && <span style={{ color: '#16a34a' }}>🟢 Low: {lowItems.length}</span>}
        </div>
      )}

      {/* Loading / Error */}
      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>載入中...</div>}
      {error && <div style={{ padding: '1rem', background: '#fee2e2', borderRadius: '6px', color: '#991b1b', marginBottom: '1rem' }}>❌ {error}</div>}

      {/* IDD List */}
      {!loading && items.map((item) => {
        const isExpanded = expanded.has(item.idd_id);
        const forbidden = (() => { try { return JSON.parse(item.forbidden_changes || '[]') as string[]; } catch { return []; } })();
        const skills = (() => { try { return JSON.parse(item.related_skills || '[]') as string[]; } catch { return []; } })();
        const platforms = (() => { try { return JSON.parse(item.platform_modules || '[]') as string[]; } catch { return []; } })();

        return (
          <div key={item.idd_id} style={{
            border: '1px solid',
            borderColor: item.criticality === 'critical' ? '#fca5a5' : '#e5e7eb',
            borderRadius: '8px',
            marginBottom: '0.75rem',
            background: item.criticality === 'critical' ? '#fff7f7' : '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {/* Card Header */}
            <div
              style={{ padding: '0.875rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}
              onClick={() => toggleExpand(item.idd_id)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <code style={{ fontSize: '0.8rem', background: '#f3f4f6', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                    {item.idd_id}
                  </code>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{TYPE_LABELS[item.idd_type] ?? item.idd_type}</span>
                  <span style={{ fontSize: '0.75rem' }}>{CRITICALITY_BADGE[item.criticality] ?? item.criticality}</span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{STATUS_LABELS[item.status] ?? item.status}</span>
                </div>
                <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>{item.title}</div>
                <div style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '0.2rem' }}>{item.decision}</div>
                {forbidden.length > 0 && (
                  <div style={{ marginTop: '0.375rem' }}>
                    {forbidden.map((f, i) => (
                      <span key={i} style={{ display: 'inline-block', background: '#fee2e2', color: '#991b1b', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', marginRight: '0.375rem', marginTop: '0.2rem' }}>
                        ❌ {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '0.875rem 1rem', fontSize: '0.875rem', color: '#374151' }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>Reason:</strong> {item.reason}</div>
                <div style={{ marginBottom: '0.5rem' }}><strong>Signoff:</strong> {item.signoff_by} @ {item.signoff_date}</div>
                {item.adr_path && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>ADR:</strong> <code style={{ fontSize: '0.8rem' }}>{item.adr_path}</code>
                  </div>
                )}
                {item.code_locations && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Code Locations:</strong>
                    <pre style={{ margin: '0.25rem 0 0', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', fontSize: '0.78rem', overflow: 'auto' }}>
                      {item.code_locations}
                    </pre>
                  </div>
                )}
                {skills.length > 0 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Related Skills:</strong>{' '}
                    {skills.map((s) => (
                      <code key={s} style={{ fontSize: '0.78rem', background: '#f3f4f6', padding: '0.1rem 0.4rem', borderRadius: '3px', marginRight: '0.25rem' }}>{s}</code>
                    ))}
                  </div>
                )}
                {platforms.length > 0 && (
                  <div>
                    <strong>Platform Modules:</strong>{' '}
                    {platforms.map((p) => (
                      <span key={p} style={{ fontSize: '0.78rem', background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.4rem', borderRadius: '3px', marginRight: '0.25rem' }}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && !error && items.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
          ℹ️ 目前沒有符合條件的 IDD 記錄
        </div>
      )}
    </div>
  );
}
