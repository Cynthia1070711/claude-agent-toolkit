// ============================================================
// systemApi.ts — 系統工具 API 呼叫
// AC-4: health / AC-5: runScript / AC-6: history
// ============================================================
import type { HealthInfo, ScriptResult, ScriptHistory } from '../types/system.js';

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch('/api/system/health');
  if (!res.ok) throw new Error(`Health 查詢失敗: ${res.status}`);
  return res.json() as Promise<HealthInfo>;
}

export async function runScript(name: string): Promise<ScriptResult> {
  const res = await fetch('/api/system/run-script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `執行失敗: ${res.status}`);
  }
  return res.json() as Promise<ScriptResult>;
}

export async function fetchHistory(): Promise<ScriptHistory[]> {
  const res = await fetch('/api/system/history');
  if (!res.ok) throw new Error(`History 查詢失敗: ${res.status}`);
  return res.json() as Promise<ScriptHistory[]>;
}
