// ============================================================
// scriptRunnerService.ts — 白名單腳本執行服務
// AC-5: spawn + shell:false + 白名單限制
// AC-6: in-memory history queue（最近 10 次）
// ============================================================
import { spawn } from 'child_process';
import path from 'path';
import { config } from '../config.js';

// ── 型別 ─────────────────────────────────────────────────────

export interface ScriptHistory {
  name: string;
  startedAt: string;
  completedAt: string;
  exitCode: number;
  /** stdout + stderr 合流，供人閱讀的診斷輸出（既有 /api/system/run-script 契約，不變）。*/
  output: string;
  /**
   * 僅 stdout。機器可讀輸出（如 whp-9 /reap 的 --json report）必須用這個欄位解析 ——
   * 用合流後的 `output` 解析時，任何一個 stderr 位元組（Node warning 等）都會讓
   * JSON.parse 失敗，把成功的執行誤報成失敗。
   */
  stdout: string;
  durationMs: number;
}

// ── 白名單（name → ps1 檔名）─────────────────────────────────

const WHITELIST: Record<string, string> = {
  'check-hygiene': 'check-hygiene.ps1',
  'batch-audit': 'batch-audit.ps1',
};

// ── In-memory 狀態 ────────────────────────────────────────────

const MAX_HISTORY = 10;
const historyQueue: ScriptHistory[] = [];
// 正在執行中的腳本名稱集合（防止重複執行）
const runningScripts = new Set<string>();

// ── Exports ───────────────────────────────────────────────────

export function isWhitelisted(name: string): boolean {
  return name in WHITELIST;
}

export function isRunning(name: string): boolean {
  return runningScripts.has(name);
}

export function getHistory(): ScriptHistory[] {
  return [...historyQueue];
}

/**
 * 共用 spawn + 追蹤邏輯（history queue + runningScripts 並行守衛 + 60 秒逾時）。
 * `key` 是 runningScripts/historyQueue 的追蹤鍵（白名單 name 或 whp-9 的 'reap' / `close-${runId}`）。
 */
function executeAndTrack(key: string, spawnFn: () => ReturnType<typeof spawn>): Promise<Omit<ScriptHistory, 'name'>> {
  runningScripts.add(key);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  return new Promise((resolve, reject) => {
    const proc = spawnFn();
    const outputChunks: string[] = [];
    const stdoutChunks: string[] = [];

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      outputChunks.push(text);
      stdoutChunks.push(text);
    });
    proc.stderr?.on('data', (chunk: Buffer) => outputChunks.push(chunk.toString()));

    // 超時 60 秒
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
    }, 60_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      runningScripts.delete(key);

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;
      const output = outputChunks.join('');
      const stdout = stdoutChunks.join('');
      const exitCode = code ?? -1;

      const record: ScriptHistory = { name: key, startedAt, completedAt, exitCode, output, stdout, durationMs };

      // 寫入 history（FIFO，保留最近 10 筆）
      historyQueue.unshift(record);
      if (historyQueue.length > MAX_HISTORY) historyQueue.pop();

      resolve({ startedAt, completedAt, exitCode, output, stdout, durationMs });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      runningScripts.delete(key);

      // 記錄失敗到 history（spawn 本身的錯誤也需可追溯）
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;
      const record: ScriptHistory = {
        name: key, startedAt, completedAt, exitCode: -1,
        output: `spawn error: ${err.message}`, stdout: '', durationMs,
      };
      historyQueue.unshift(record);
      if (historyQueue.length > MAX_HISTORY) historyQueue.pop();

      reject(err);
    });
  });
}

/**
 * 執行白名單腳本（既有簽章，向後相容 — /api/system/run-script 依賴此簽章不變）。
 * - 安全組裝路徑：projectRoot/scripts/{ps1檔名}（禁止使用者輸入直接拼接）
 * - spawn shell:false，避免 Shell Injection
 * - 超時 60 秒後強制 kill
 */
export function runScript(name: string): Promise<Omit<ScriptHistory, 'name'>> {
  const ps1File = WHITELIST[name];
  if (!ps1File) throw new Error(`腳本 "${name}" 不在白名單中`);

  // 安全路徑組裝
  const scriptPath = path.resolve(config.projectRoot, 'scripts', ps1File);
  return executeAndTrack(name, () => spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], { shell: false }));
}

/**
 * whp-9-devconsole-api T12：帶引數執行（/close 呼叫 close-worker.ps1 帶 -RunId / /reap 呼叫 Node 腳本）。
 * - scriptPath 與 args 一律由呼叫端（route 層）以 config.projectRoot + 常數組裝，永不取自 request body 拼接
 * - key 與既有 runScript(name) 共用同一組 runningScripts/historyQueue（沿用 isRunning() 並行守衛語意）
 */
export function runScriptWithArgs(
  key: string,
  runtime: 'powershell' | 'node',
  scriptPath: string,
  args: string[] = [],
): Promise<Omit<ScriptHistory, 'name'>> {
  const spawnArgs = runtime === 'powershell' ? ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args] : [scriptPath, ...args];
  return executeAndTrack(key, () => spawn(runtime, spawnArgs, { shell: false }));
}
