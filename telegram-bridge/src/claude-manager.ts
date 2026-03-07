// ============================================================
// Claude Manager — Stream-JSON 持久進程管理
// ============================================================

import { EventEmitter } from 'events';
import { spawn, ChildProcess, execSync } from 'child_process';
import type { StreamJsonInput, ClaudeOutput, Session } from './types';
import { StreamJsonParser } from './stream-json-parser';

/**
 * 管理 Claude CLI 持久進程。
 *
 * 事件：
 *   'output'  → (output: ClaudeOutput) — 文字/結果/系統訊息
 *   'ready'   → () — Claude 進程就緒
 *   'closed'  → (code: number | null) — 進程退出
 */
export class ClaudeManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private parser: StreamJsonParser | null = null;
  private messageQueue: StreamJsonInput[] = [];
  private _isProcessing: boolean = false;
  private _isReady: boolean = false;
  private _isRunning: boolean = false;
  private activePids: Set<number> = new Set();
  private currentSession: Session | null = null;

  get isRunning(): boolean { return this._isRunning; }
  get isReady(): boolean { return this._isReady; }
  get isProcessing(): boolean { return this._isProcessing; }

  /** 啟動 stream-json 持久進程 */
  startSession(session: Session): void {
    // 如果已有進程在跑，先停止
    if (this.process) {
      this.stopSession();
    }

    this.currentSession = session;
    this._isReady = false;
    this._isProcessing = false;
    this.messageQueue = [];

    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', session.model || 'sonnet',
    ];

    // 如果有 Claude session ID，嘗試恢復
    if (session.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }

    console.log(`[ClaudeManager] 啟動: claude ${args.join(' ')}`);
    console.log(`[ClaudeManager] 工作目錄: ${session.workingDirectory}`);

    this.process = spawn('claude', args, {
      cwd: session.workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    if (this.process.pid) {
      this.activePids.add(this.process.pid);
    }

    this._isRunning = true;
    this.parser = new StreamJsonParser();

    // 監聽 parser 事件
    this.parser.on('output', (output: ClaudeOutput) => {
      this.emit('output', output);

      // result 事件表示回應完成，處理佇列
      if (output.type === 'result') {
        this.onResponseComplete();
      }
    });

    this.parser.on('ready', () => {
      if (!this._isReady) {
        this._isReady = true;
        console.log('[ClaudeManager] Claude 進程就緒');
        this.emit('ready');
      }
    });

    this.parser.on('error', (err: Error) => {
      console.error('[ClaudeManager] 解析錯誤:', err.message);
    });

    // 監聽 stdout
    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.parser?.feed(chunk.toString('utf-8'));
    });

    // 監聽 stderr（記錄但不中斷）
    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim();
      if (text) {
        console.log(`[ClaudeManager] stderr: ${text}`);

        // stderr 中的就緒訊號（某些版本的 Claude CLI 從 stderr 輸出狀態）
        if (!this._isReady && (text.includes('session') || text.includes('Claude'))) {
          this._isReady = true;
          console.log('[ClaudeManager] Claude 進程就緒 (via stderr)');
          this.emit('ready');
        }
      }
    });

    // 監聽進程退出
    this.process.on('exit', (code) => {
      console.log(`[ClaudeManager] 進程退出, code=${code}`);
      if (this.process?.pid) {
        this.activePids.delete(this.process.pid);
      }
      this.process = null;
      this.parser = null;
      this._isRunning = false;
      this._isReady = false;
      this._isProcessing = false;
      this.emit('closed', code);
    });

    this.process.on('error', (err) => {
      console.error('[ClaudeManager] 進程錯誤:', err.message);
      this._isRunning = false;
      this.emit('output', {
        type: 'error',
        content: `Claude 進程啟動失敗: ${err.message}`,
      } as ClaudeOutput);
    });

    // 就緒超時：如果 10 秒內沒收到就緒訊號，強制標記就緒
    setTimeout(() => {
      if (this._isRunning && !this._isReady) {
        console.log('[ClaudeManager] 就緒超時，強制標記就緒');
        this._isReady = true;
        this.emit('ready');
      }
    }, 10000);
  }

  /** 送入使用者訊息（佇列管理） */
  sendInput(message: string, sessionId?: string): void {
    const input: StreamJsonInput = {
      type: 'user',
      message: { role: 'user', content: message },
    };
    if (sessionId) {
      input.session_id = sessionId;
    }

    if (this._isProcessing) {
      console.log(`[ClaudeManager] 佇列中，目前佇列長度: ${this.messageQueue.length + 1}`);
      if (this.messageQueue.length >= 50) {
        this.emit('output', {
          type: 'error',
          content: '訊息佇列已滿（50 條上限），請等待處理完成。',
        } as ClaudeOutput);
        return;
      }
      this.messageQueue.push(input);
    } else {
      this.writeToStdin(input);
    }
  }

  /** 停止 Claude 進程 */
  stopSession(): void {
    if (this.process) {
      console.log('[ClaudeManager] 停止 Claude 進程');
      try {
        this.process.kill('SIGTERM');
      } catch {
        // 進程可能已經退出
      }
      this.process = null;
    }
    this.parser?.reset();
    this.parser = null;
    this._isRunning = false;
    this._isReady = false;
    this._isProcessing = false;
    this.messageQueue = [];
  }

  /** 清理所有追蹤的子進程 */
  cleanup(): void {
    this.stopSession();
    for (const pid of this.activePids) {
      try {
        process.kill(pid);
      } catch {
        // 進程可能已經退出
      }
    }
    this.activePids.clear();
  }

  /** 殭屍進程清理（Windows 專用，啟動前呼叫） */
  static cleanupZombies(): number {
    try {
      const script = `
        $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
          Where-Object { $_.CommandLine -like '*claude-telegram-bridge*' -and $_.ProcessId -ne $PID }
        $count = 0
        foreach ($p in $procs) {
          try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; $count++ } catch {}
        }
        Write-Output $count
      `;
      const result = execSync(`powershell -Command "${script.replace(/\n/g, ' ')}"`, {
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();
      return parseInt(result, 10) || 0;
    } catch {
      console.log('[ClaudeManager] 殭屍清理跳過（非 Windows 或權限不足）');
      return 0;
    }
  }

  // --- 內部方法 ---

  private writeToStdin(input: StreamJsonInput): void {
    if (!this.process?.stdin?.writable) {
      this.emit('output', {
        type: 'error',
        content: 'Claude 進程 stdin 不可寫，嘗試重新啟動...',
      } as ClaudeOutput);
      this._isRunning = false;
      return;
    }

    this._isProcessing = true;
    const json = JSON.stringify(input) + '\n';
    this.process.stdin.write(json);
    console.log(`[ClaudeManager] 已送入訊息: ${input.message.content.substring(0, 80)}...`);
  }

  private onResponseComplete(): void {
    this._isProcessing = false;

    // 處理佇列中的下一條訊息
    if (this.messageQueue.length > 0) {
      const next = this.messageQueue.shift()!;
      console.log(`[ClaudeManager] 處理佇列訊息，剩餘: ${this.messageQueue.length}`);
      this.writeToStdin(next);
    }
  }
}
