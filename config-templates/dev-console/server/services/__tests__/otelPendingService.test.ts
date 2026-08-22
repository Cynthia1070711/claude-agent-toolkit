// ============================================================
// otelPendingService.test.ts — 未聚合 OTel 尾段讀取
// 核心不變量：只計 marker offset 之後的 api_request（不得重複計算已落盤部分）
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mockConfig = vi.hoisted(() => ({ projectRoot: '' }));
vi.mock('../../config.js', () => ({ config: mockConfig }));

import { readPendingOtelByDay } from '../otelPendingService.js';

let tmpRoot: string;
let logDir: string;

function entry(input: number, output: number, cost = 0.1): string {
  return JSON.stringify({
    ts: '2026-08-08T01:00:00.000Z',
    type: 'api_request',
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: 10,
    cache_creation_tokens: 5,
    cost_usd: cost,
    model: 'claude-opus-5',
  });
}

/** 回傳寫入的 byte 數，供 marker offset 使用 */
function writeJsonl(date: string, lines: string[]): number {
  const p = path.join(logDir, `main-otel-${date}.jsonl`);
  const content = lines.join('\n') + '\n';
  fs.writeFileSync(p, content, 'utf8');
  return Buffer.byteLength(content, 'utf8');
}

function writeMarker(map: Record<string, number>): void {
  const abs: Record<string, number> = {};
  for (const [base, off] of Object.entries(map)) abs[path.join(logDir, base)] = off;
  fs.writeFileSync(path.join(logDir, 'main-otel-marker.json'), JSON.stringify(abs), 'utf8');
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'otel-pending-'));
  logDir = path.join(tmpRoot, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  mockConfig.projectRoot = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('readPendingOtelByDay', () => {
  it('只累加 marker offset 之後的 entry（已落盤部分不重複計算）', () => {
    const consumedBytes = Buffer.byteLength(entry(100, 200) + '\n', 'utf8');
    writeJsonl('2026-08-08', [entry(100, 200), entry(7, 9, 0.25)]);
    writeMarker({ 'main-otel-2026-08-08.jsonl': consumedBytes });

    const day = readPendingOtelByDay().get('2026-08-08');
    expect(day).toBeDefined();
    expect(day!.input_tokens).toBe(7);
    expect(day!.output_tokens).toBe(9);
    expect(day!.cost_usd).toBeCloseTo(0.25, 6);
    expect(day!.entry_count).toBe(1);
  });

  it('marker 完全沒記錄的日期 → 整檔計入（session 非正常結束情境）', () => {
    writeJsonl('2026-08-07', [entry(1, 2), entry(3, 4)]);
    writeMarker({}); // 該日不在 marker 內

    const day = readPendingOtelByDay().get('2026-08-07');
    expect(day!.input_tokens).toBe(4);
    expect(day!.output_tokens).toBe(6);
    expect(day!.entry_count).toBe(2);
  });

  it('offset 已到 EOF → 該日不出現在結果中', () => {
    const size = writeJsonl('2026-08-06', [entry(50, 60)]);
    writeMarker({ 'main-otel-2026-08-06.jsonl': size });

    expect(readPendingOtelByDay().has('2026-08-06')).toBe(false);
  });

  it('尾行被截斷（collector 正在寫）不影響已完整的行', () => {
    const p = path.join(logDir, 'main-otel-2026-08-08.jsonl');
    fs.writeFileSync(p, entry(11, 22) + '\n' + '{"type":"api_req', 'utf8');

    const day = readPendingOtelByDay().get('2026-08-08');
    expect(day!.entry_count).toBe(1);
    expect(day!.input_tokens).toBe(11);
  });

  it('非 api_request 型別（如 tool_decision）不計入', () => {
    writeJsonl('2026-08-08', [
      JSON.stringify({ type: 'tool_decision', input_tokens: 999 }),
      entry(1, 1),
    ]);

    expect(readPendingOtelByDay().get('2026-08-08')!.input_tokens).toBe(1);
  });

  it('logs/ 不存在 → 回空 Map 不拋錯', () => {
    fs.rmSync(logDir, { recursive: true, force: true });
    expect(readPendingOtelByDay().size).toBe(0);
  });

  it('marker JSON 損毀 → 視為全未消化，不拋錯', () => {
    writeJsonl('2026-08-08', [entry(5, 5)]);
    fs.writeFileSync(path.join(logDir, 'main-otel-marker.json'), '{ broken', 'utf8');

    expect(readPendingOtelByDay().get('2026-08-08')!.input_tokens).toBe(5);
  });
});
