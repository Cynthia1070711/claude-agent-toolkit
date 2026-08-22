// ============================================================
// workerCharts.ts — 分頁 B 歷程圖表聚合純函式（whp-10-devconsole-ui Task 9.2/9.3）
// 前端對「當前查詢結果」聚合，不新增後端聚合 endpoint。
// 平均時長只採真實關閉時間欄位，偵測時間欄位不得出現於本檔（SSoT §23 絕不混欄）。
// ============================================================
import type { WorkerRun } from '../types/workers.js';

export interface TrackStackedDatum {
  track: string;
  byLifecycle: Record<string, number>;
}

/** ① 每軌派發次數（依 lifecycle 分層堆疊）。 */
export function aggregateTrackStackedByLifecycle(items: WorkerRun[]): TrackStackedDatum[] {
  const byTrack = new Map<string, Record<string, number>>();
  for (const item of items) {
    const track = item.controller_track || '未分軌';
    const bucket = byTrack.get(track) ?? {};
    bucket[item.lifecycle] = (bucket[item.lifecycle] ?? 0) + 1;
    byTrack.set(track, bucket);
  }
  return Array.from(byTrack.entries())
    .map(([track, byLifecycle]) => ({ track, byLifecycle }))
    .sort((a, b) => a.track.localeCompare(b.track));
}

export interface PhaseDurationDatum {
  phase: string;
  avgMs: number;
  sampleCount: number;
}

/** ② 每 phase 平均執行時長（只採 closed_at，closed_at 為 null 的列不計入樣本）。 */
export function aggregateAvgDurationByPhase(items: WorkerRun[]): PhaseDurationDatum[] {
  const byPhase = new Map<string, number[]>();
  for (const item of items) {
    if (!item.closed_at) continue;
    const startMs = new Date(item.started_at).getTime();
    const endMs = new Date(item.closed_at).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    const list = byPhase.get(item.phase) ?? [];
    list.push(endMs - startMs);
    byPhase.set(item.phase, list);
  }
  return Array.from(byPhase.entries())
    .map(([phase, durations]) => ({
      phase,
      avgMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      sampleCount: durations.length,
    }))
    .sort((a, b) => a.phase.localeCompare(b.phase));
}

export interface AttemptDistributionDatum {
  attempt: number;
  count: number;
}

/** ③ attempt 分布。 */
export function aggregateAttemptDistribution(items: WorkerRun[]): AttemptDistributionDatum[] {
  const byAttempt = new Map<number, number>();
  for (const item of items) {
    byAttempt.set(item.attempt, (byAttempt.get(item.attempt) ?? 0) + 1);
  }
  return Array.from(byAttempt.entries())
    .map(([attempt, count]) => ({ attempt, count }))
    .sort((a, b) => a.attempt - b.attempt);
}

export interface DailyDispatchDatum {
  date: string;
  count: number;
}

/** ④ 每日派發趨勢（依 started_at 之 Asia/Taipei 日期分桶）。 */
export function aggregateDailyDispatchTrend(items: WorkerRun[]): DailyDispatchDatum[] {
  const byDate = new Map<string, number>();
  for (const item of items) {
    const d = new Date(item.started_at);
    if (Number.isNaN(d.getTime())) continue;
    const date = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  return Array.from(byDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** close_source 九分類權威集合（.context-db/scripts/upsert-worker-run.js:53-56 逐字對齊）+ NULL 獨立為「未記錄」。 */
export const CLOSE_SOURCE_VALUES = [
  'ControllerAfterHandshake', 'ControllerForce', 'UserClosed', 'ExternalKill',
  'PowerFailure', 'DispatchFailed', 'StartupFailed', 'Unknown',
] as const;

export interface CloseSourceSliceDatum {
  label: string;
  count: number;
}

/** close_source 九分類分布（8 具名值 + NULL 獨立「未記錄」，不得與 Unknown 合併）。 */
export function aggregateCloseSourceDistribution(items: WorkerRun[]): CloseSourceSliceDatum[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.close_source ?? '__NULL__';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const slices: CloseSourceSliceDatum[] = CLOSE_SOURCE_VALUES.map((cs) => ({ label: cs, count: counts.get(cs) ?? 0 }));
  slices.push({ label: '未記錄', count: counts.get('__NULL__') ?? 0 });
  return slices;
}
