// ============================================================
// HealthStatus.tsx — DB 健康狀態面板
// AC-7: DB 連線 dot + 大小 + 記錄數 + 最後寫入時間
// ============================================================
import type { HealthInfo } from '../types/system.js';

interface HealthStatusProps {
  health: HealthInfo | null;
  loading: boolean;
  error: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

export default function HealthStatus({ health, loading, error }: HealthStatusProps) {
  if (loading) {
    return <div className="system-section system-section--loading">載入中…</div>;
  }
  if (error) {
    return <div className="system-section system-section--error">⚠️ {error}</div>;
  }
  if (!health) {
    return <div className="system-section">尚無資料</div>;
  }

  const { db, records } = health;
  const dotClass = db.connected ? 'system-dot system-dot--ok' : 'system-dot system-dot--error';

  return (
    <section className="system-section">
      <h2 className="system-section__title">健康狀態</h2>
      <div className="system-health-grid">
        <div className="system-kpi">
          <span className={dotClass} />
          <span className="system-kpi__label">DB 連線</span>
          <span className="system-kpi__value">{db.connected ? '已連線' : '未連線'}</span>
        </div>
        <div className="system-kpi">
          <span className="system-kpi__label">DB 大小</span>
          <span className="system-kpi__value">{formatBytes(db.sizeBytes)}</span>
        </div>
        <div className="system-kpi">
          <span className="system-kpi__label">Table 數</span>
          <span className="system-kpi__value">{db.tableCount}</span>
        </div>
        <div className="system-kpi">
          <span className="system-kpi__label">最後寫入</span>
          <span className="system-kpi__value">{formatDate(db.lastWriteTime)}</span>
        </div>
        <div className="system-kpi">
          <span className="system-kpi__label">Context 記錄</span>
          <span className="system-kpi__value">{records.context.toLocaleString()}</span>
        </div>
        <div className="system-kpi">
          <span className="system-kpi__label">Tech 記錄</span>
          <span className="system-kpi__value">{records.tech.toLocaleString()}</span>
        </div>
        <div className="system-kpi">
          <span className="system-kpi__label">CR Issues</span>
          <span className="system-kpi__value">{records.cr_issues.toLocaleString()}</span>
        </div>
        <div className="system-kpi">
          <span className="system-kpi__label">Conversations</span>
          <span className="system-kpi__value">{records.conversations.toLocaleString()}</span>
        </div>
      </div>
    </section>
  );
}
