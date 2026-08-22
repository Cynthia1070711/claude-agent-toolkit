// ============================================================
// ScriptRunner.tsx — 白名單腳本執行按鈕
// AC-7: 每個腳本一個執行按鈕 + 執行中顯示 spinner
// ============================================================
import { useState } from 'react';
import type { ScriptResult } from '../types/system.js';
import { runScript } from '../services/systemApi.js';

const SCRIPTS = [
  { name: 'check-hygiene', label: '衛生檢查', description: 'check-hygiene.ps1' },
  { name: 'batch-audit', label: '批次審計', description: 'batch-audit.ps1' },
] as const;

interface ScriptRunnerProps {
  onComplete?: () => void;
}

export default function ScriptRunner({ onComplete }: ScriptRunnerProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ScriptResult & { error?: string }>>({});

  async function handleRun(name: string) {
    setRunning(name);
    try {
      const result = await runScript(name);
      setResults((prev) => ({ ...prev, [name]: result }));
      onComplete?.();
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [name]: { success: false, output: '', exitCode: -1, durationMs: 0, error: (err as Error).message },
      }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="system-section">
      <h2 className="system-section__title">腳本執行</h2>
      <div className="script-runner">
        {SCRIPTS.map(({ name, label, description }) => {
          const result = results[name];
          const isRunning = running === name;
          const anyRunning = running !== null;

          return (
            <div key={name} className="script-card">
              <div className="script-card__header">
                <span className="script-card__label">{label}</span>
                <code className="script-card__desc">{description}</code>
                <button
                  type="button"
                  className="script-card__run-btn"
                  onClick={() => handleRun(name)}
                  disabled={anyRunning}
                  aria-label={`執行 ${label}`}
                >
                  {isRunning ? <span className="script-spinner" aria-label="執行中">⏳</span> : '▶ 執行'}
                </button>
              </div>

              {result && (
                <div className={`script-card__result ${result.success ? 'script-card__result--ok' : 'script-card__result--error'}`}>
                  <div className="script-card__result-meta">
                    <span>退出碼: {result.exitCode}</span>
                    <span>耗時: {result.durationMs}ms</span>
                    {result.success ? <span>✅ 成功</span> : <span>❌ 失敗</span>}
                  </div>
                  {result.error && (
                    <pre className="script-card__output">{result.error}</pre>
                  )}
                  {result.output && (
                    <pre className="script-card__output">{result.output}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
