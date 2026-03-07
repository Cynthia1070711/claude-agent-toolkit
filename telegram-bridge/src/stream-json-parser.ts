// ============================================================
// Stream-JSON Parser — NDJSON 事件流解析器
// ============================================================

import { EventEmitter } from 'events';
import type { StreamJsonEvent, TokenUsage, ClaudeOutput } from './types';

interface ParserEvents {
  output: (output: ClaudeOutput) => void;
  ready: () => void;
  error: (error: Error) => void;
}

/**
 * 解析 Claude CLI 的 stream-json stdout 輸出。
 *
 * 事件：
 *   'output' → ClaudeOutput（文字、結果、系統訊息）
 *   'ready'  → Claude 進程就緒，可接受輸入
 *   'error'  → JSON 解析錯誤
 */
export class StreamJsonParser extends EventEmitter {
  private buffer: string = '';

  constructor() {
    super();
  }

  // 型別安全的 emit/on
  override emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  /** 餵入 stdout data chunk（可能含不完整行） */
  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // 保留最後不完整行
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.parseLine(trimmed);
    }
  }

  /** 解析單行 JSON 事件 */
  private parseLine(line: string): void {
    let event: StreamJsonEvent;
    try {
      event = JSON.parse(line);
    } catch {
      // 非 JSON 行（可能是 Claude CLI 的 stderr 混入或啟動訊息），忽略
      return;
    }

    switch (event.type) {
      case 'system':
        this.handleSystem(event);
        break;

      case 'assistant':
        this.handleAssistant(event);
        break;

      case 'result':
        this.handleResult(event);
        break;

      default:
        // 未知事件類型，忽略
        break;
    }
  }

  /** 處理系統訊息（就緒偵測） */
  private handleSystem(event: { type: 'system'; message: string; session_id: string }): void {
    this.emit('output', {
      type: 'system',
      content: event.message,
      sessionId: event.session_id,
    } satisfies ClaudeOutput);

    // 就緒偵測：系統訊息通常在進程啟動後發出
    this.emit('ready');
  }

  /** 處理 assistant 回應（累積文字） */
  private handleAssistant(event: { type: 'assistant'; message: { role: 'assistant'; content: Array<{ type: string; text: string }> }; session_id: string }): void {
    const textParts = event.message.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text);

    if (textParts.length > 0) {
      this.emit('output', {
        type: 'text',
        content: textParts.join(''),
        sessionId: event.session_id,
      } satisfies ClaudeOutput);
    }
  }

  /** 處理結果事件（回應完成 + usage） */
  private handleResult(event: {
    type: 'result';
    subtype: string;
    result: string;
    session_id: string;
    is_error: boolean;
    duration_ms: number;
    usage: TokenUsage;
    cost_usd: number;
  }): void {
    this.emit('output', {
      type: 'result',
      content: event.result,
      sessionId: event.session_id,
      usage: event.usage,
      durationMs: event.duration_ms,
      costUsd: event.cost_usd,
    } satisfies ClaudeOutput);
  }

  /** 清空內部緩衝區 */
  reset(): void {
    this.buffer = '';
  }
}
