// ============================================================
// System.tsx — 系統工具頁面
// AC-7: 三區塊佈局：健康狀態（上）+ 腳本執行（中）+ 執行歷史（下）
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import type { HealthInfo, ScriptHistory } from '../types/system.js';
import { fetchHealth, fetchHistory } from '../services/systemApi.js';
import HealthStatus from '../components/HealthStatus.js';
import ScriptRunner from '../components/ScriptRunner.js';
import '../styles/system.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

export default function System() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [history, setHistory] = useState<ScriptHistory[]>([]);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch (err) {
      setHealthError((err as Error).message);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchHistory();
      setHistory(data);
    } catch {
      // 靜默忽略 history 錯誤
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    void loadHistory();
  }, [loadHealth, loadHistory]);

  function handleScriptComplete() {
    void loadHealth();
    void loadHistory();
  }

  return (
    <div className="system-page">
      <h1 className="system-page__title">⚙️ 系統工具</h1>

      {/* 健康狀態面板（上） */}
      <HealthStatus health={health} loading={healthLoading} error={healthError} />

      {/* 腳本執行區（中） */}
      <ScriptRunner onComplete={handleScriptComplete} />

      {/* 執行歷史表（下） */}
      <section className="system-section">
        <h2 className="system-section__title">執行歷史（最近 10 次）</h2>
        {history.length === 0 ? (
          <p className="system-history-empty">尚無執行記錄</p>
        ) : (
          <table className="system-history-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>腳本</th>
                <th>退出碼</th>
                <th>執行時間</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.name}-${h.startedAt}`}>
                  <td>{formatDate(h.startedAt)}</td>
                  <td>{h.name}</td>
                  <td className={h.exitCode === 0 ? 'history-exit--ok' : 'history-exit--error'}>
                    {h.exitCode}
                  </td>
                  <td>{h.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
