// ============================================================
// Claude Telegram Bridge v2.0 — 型別定義
// ============================================================

// --- Stream-JSON 協議型別 ---

/** 寫入 Claude CLI stdin 的 JSON 格式 */
export interface StreamJsonInput {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
  session_id?: string;
}

/** Token 用量統計 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Claude CLI stdout 的 assistant 訊息結構 */
export interface AssistantMessage {
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

/** Claude CLI stdout 的 result 事件 */
export interface ResultEvent {
  type: 'result';
  subtype: string;
  result: string;
  session_id: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  usage: TokenUsage;
  cost_usd: number;
}

/** Claude CLI stdout 的所有事件類型 */
export type StreamJsonEvent =
  | { type: 'system'; message: string; session_id: string }
  | { type: 'assistant'; message: AssistantMessage; session_id: string }
  | ResultEvent;

// --- 會話與輸出型別 ---

/** 會話資料 */
export interface Session {
  id: string;
  chatId: number;
  workingDirectory: string;
  model: string;
  claudeSessionId?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  turnCount: number;
  avgResponseMs: number;
  createdAt: string;
  lastActiveAt: string;
}

/** Claude 輸出事件（傳遞給 TelegramBot 層） */
export interface ClaudeOutput {
  type: 'text' | 'result' | 'system' | 'error';
  content: string;
  sessionId?: string;
  usage?: TokenUsage;
  durationMs?: number;
  costUsd?: number;
}

/** 路徑書籤 */
export interface Bookmark {
  id: number;
  chatId: number;
  name: string;
  path: string;
  createdAt: string;
}

// --- 設定型別 ---

/** 應用程式設定 */
export interface AppConfig {
  telegramBotToken: string;
  allowedUserIds: number[];
  defaultWorkingDir: string;
  defaultModel: string;
}
