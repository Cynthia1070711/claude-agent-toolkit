// ============================================================
// otelPendingService.ts — 讀取「已寫入 JSONL、尚未聚合進 DB」的 OTel token
//
// 背景：OTel Micro Collector 即時把每次 api_request 寫進
//   logs/main-otel-{YYYY-MM-DD}.jsonl，但只有 SessionEnd Hook
//   (scripts/otel-session-aggregate.js) 才會聚合回寫 workflow_executions。
//   → 主視窗 session 還沒結束時，當天消耗在 Dashboard 上完全看不到；
//     session 非正常結束（視窗被殺）時，那一天甚至永遠不會進 DB。
//
// 本服務以 logs/main-otel-marker.json 記錄的 byte offset 為界，
// 唯讀補上尚未聚合的尾段。不寫 marker、不寫 DB —— 聚合權責仍在
// SessionEnd Hook，避免雙寫入口造成重複計算。
//
// 日期歸屬採「檔名日期」：collector 依台灣日輪替檔案，與 DB 端
// substr(started_at,1,10) 的字面台灣日分組語意一致。
// ============================================================
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export interface PendingDayTotals {
  date: string;                   // YYYY-MM-DD（台灣日）
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
  entry_count: number;            // api_request 筆數（非 workflow 數）
}

const JSONL_RE = /^main-otel-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/** marker 的 key 是絕對路徑；改以 basename 索引，避開路徑分隔符/大小寫差異 */
function readMarkerByBasename(logDir: string): Record<string, number> {
  const byBase: Record<string, number> = {};
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(logDir, 'main-otel-marker.json'), 'utf8'));
    for (const [key, offset] of Object.entries(raw as Record<string, unknown>)) {
      const base = key.split(/[\\/]/).pop();
      if (base && typeof offset === 'number') byBase[base] = offset;
    }
  } catch {
    // marker 不存在或損毀 → 視為全部未消化（offset 0）
  }
  return byBase;
}

/** 從 fromByte 讀到 EOF，累加 api_request 的 token / cost */
function readTail(filePath: string, fromByte: number): Omit<PendingDayTotals, 'date'> | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (stat.size <= fromByte) return null;

  let text: string;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(stat.size - fromByte);
    fs.readSync(fd, buf, 0, buf.length, fromByte);
    text = buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }

  const totals = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    cost_usd: 0,
    entry_count: 0,
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue; // 尾行可能被截斷（collector 正在寫）— 跳過即可
    }
    if (rec['type'] !== 'api_request') continue;
    totals.input_tokens += Number(rec['input_tokens'] ?? 0);
    totals.output_tokens += Number(rec['output_tokens'] ?? 0);
    totals.cache_read_tokens += Number(rec['cache_read_tokens'] ?? 0);
    totals.cache_creation_tokens += Number(rec['cache_creation_tokens'] ?? 0);
    totals.cost_usd += Number(rec['cost_usd'] ?? 0);
    totals.entry_count++;
  }

  return totals.entry_count > 0 ? totals : null;
}

/**
 * 掃描 logs/ 下所有 main-otel-{date}.jsonl，回傳尚未聚合進 DB 的每日總量。
 * 全程唯讀且不拋錯（logs/ 不存在、marker 損毀、檔案被鎖都回退為空）。
 */
export function readPendingOtelByDay(): Map<string, PendingDayTotals> {
  const result = new Map<string, PendingDayTotals>();
  const logDir = path.join(config.projectRoot, 'logs');

  let files: string[];
  try {
    files = fs.readdirSync(logDir);
  } catch {
    return result;
  }

  const marker = readMarkerByBasename(logDir);

  for (const name of files) {
    const m = JSONL_RE.exec(name);
    if (!m) continue;
    const date = m[1] as string;
    const tail = readTail(path.join(logDir, name), marker[name] ?? 0);
    if (tail) result.set(date, { date, ...tail });
  }

  return result;
}
