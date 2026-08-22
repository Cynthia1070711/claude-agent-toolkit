// ============================================================
// contract.test.ts — 前後端 workers 型別欄位名集合契約（AC4 / Task 1.3）
// 靜態讀 workerRunService.ts 與 types/workers.ts 的 export interface 欄位名，
// 差集非空即 fail，防後端改欄位時前端靜默漂移。
// ============================================================
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractInterfaceFields(source: string, interfaceName: string): Set<string> {
  const re = new RegExp(`export interface ${interfaceName}[^{]*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const m = source.match(re);
  if (!m) throw new Error(`interface ${interfaceName} not found`);
  const body = m[1] as string;
  const fields = new Set<string>();
  for (const line of body.split('\n')) {
    const fm = line.match(/^\s*(\w+)\??:/);
    if (fm) fields.add(fm[1] as string);
  }
  return fields;
}

describe('workers 型別欄位名集合契約', () => {
  const backendSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../server/services/workerRunService.ts'),
    'utf-8',
  );
  const frontendSrc = fs.readFileSync(path.resolve(__dirname, '../workers.ts'), 'utf-8');

  it.each(['WorkerRun', 'WorkerMessage', 'WorkerHandoff'])('%s 欄位名差集為空', (name) => {
    const backendFields = extractInterfaceFields(backendSrc, name);
    const frontendFields = extractInterfaceFields(frontendSrc, name);
    const missing = [...backendFields].filter((f) => !frontendFields.has(f));
    const extra = [...frontendFields].filter((f) => !backendFields.has(f));
    expect(missing, `frontend 缺少欄位: ${missing.join(',')}`).toEqual([]);
    expect(extra, `frontend 多餘欄位: ${extra.join(',')}`).toEqual([]);
  });
});
