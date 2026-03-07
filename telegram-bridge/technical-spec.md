# Claude Telegram Bridge v2.0 — 技術規格文檔

## 1. 系統架構

### 1.1 元件架構圖

```
┌─────────────────────────────────────────────────────────┐
│                   Telegram Bot Layer                     │
│  指令: /new /stop /clear /model /status /cd /bookmark   │
│  訊息路由 → sendInput / startSession                    │
│  檔案上傳 → 存到工作目錄 + 通知 Claude                   │
│  心跳機制 → typing 狀態指示                              │
│  輸出緩衝 → 800ms 批次 + token/耗時統計                  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                Claude Manager Layer                      │
│  startSession() → 啟動 stream-json 持久進程              │
│  sendInput()    → JSON stdin 寫入 + 佇列管理            │
│  事件: output / ready / responseComplete / closed        │
│  自動重連: 進程死亡 → 下次訊息自動重啟                    │
│  殭屍清理: 啟動前掃描並 kill 殘留 node 進程              │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│             Stream-JSON Parser Layer                     │
│  解析 NDJSON 事件流                                      │
│  累積 text_delta → 完整文字區塊                          │
│  偵測 message_stop → 標記回應完成                        │
│  擷取 session_id + usage (token 統計)                    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│               Session Store (SQLite)                     │
│  會話持久化 + 訊息歷史 + 模型偏好 + 路徑書籤             │
└─────────────────────────────────────────────────────────┘
```

### 1.2 技術堆疊

| 層級 | 技術 | 版本 |
|------|------|------|
| Runtime | Node.js | 18+ |
| 語言 | TypeScript | 5.x |
| Telegram SDK | node-telegram-bot-api | ^0.66 |
| 資料庫 | better-sqlite3 | ^11 |
| CLI | Claude CLI | 最新版 |
| 建構 | tsx (dev) / tsc (build) | — |

---

## 2. Stream-JSON 協議規格

### 2.1 Claude CLI 啟動參數

```bash
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --model sonnet
```

| 參數 | 說明 |
|------|------|
| `-p` | 非互動模式（print mode），在 stream-json 下進程不會退出 |
| `--input-format stream-json` | stdin 接受 NDJSON 輸入 |
| `--output-format stream-json` | stdout 輸出 NDJSON 事件流 |
| `--verbose` | 輸出詳細事件（含 usage 資訊）|
| `--model <name>` | 指定模型（haiku / sonnet / opus）|

### 2.2 輸入格式（寫入 stdin）

每條使用者訊息作為一行 JSON 寫入 stdin，後接 `\n`：

```json
{"type":"user","message":{"role":"user","content":"查看 git status"},"session_id":"abc123"}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| `type` | `"user"` | 固定值，表示使用者輸入 |
| `message.role` | `"user"` | 固定值 |
| `message.content` | `string` | 使用者訊息文字 |
| `session_id` | `string` (optional) | 會話 ID，用於恢復會話 |

### 2.3 輸出格式（從 stdout 讀取）

Claude CLI 輸出 NDJSON 事件流，每行一個 JSON 物件：

#### 2.3.1 串流文字事件

```json
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"目前在 main 分支..."}]},"session_id":"abc123"}
```

#### 2.3.2 結果事件（含 usage）

```json
{
  "type": "result",
  "subtype": "success",
  "result": "完整回應內容",
  "session_id": "abc123",
  "is_error": false,
  "duration_ms": 3200,
  "duration_api_ms": 2800,
  "num_turns": 1,
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 856,
    "cache_read_input_tokens": 500,
    "cache_creation_input_tokens": 0
  },
  "cost_usd": 0.015
}
```

#### 2.3.3 系統訊息事件

```json
{"type":"system","message":"Claude Code session started. Type your message to begin.","session_id":"abc123"}
```

### 2.4 進程生命週期

```
啟動                    持續運行                          關閉
  │                       │                                │
  ▼                       ▼                                ▼
spawn claude ──→ 等待 stdin ──→ 收到 JSON ──→ 處理 ──→ 輸出 ──→ 等待 stdin ──→ ...
  │                                                                              │
  └── 載入專案上下文（只做一次）                              /stop 或視窗關閉 ──┘
```

---

## 3. 資料模型

### 3.1 TypeScript 型別定義

#### StreamJsonInput — 寫入 stdin 的 JSON 格式

```typescript
interface StreamJsonInput {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
  session_id?: string;
}
```

#### StreamJsonEvent — 從 stdout 讀取的事件

```typescript
type StreamJsonEvent =
  | { type: 'system'; message: string; session_id: string }
  | { type: 'assistant'; message: AssistantMessage; session_id: string }
  | { type: 'result'; subtype: string; result: string; session_id: string;
      is_error: boolean; duration_ms: number; duration_api_ms: number;
      num_turns: number; usage: TokenUsage; cost_usd: number };
```

#### TokenUsage — Token 用量統計

```typescript
interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}
```

#### Session — 擴展的會話資料

```typescript
interface Session {
  id: string;
  chatId: number;
  workingDirectory: string;
  model: string;              // 新增：模型名稱
  claudeSessionId?: string;   // 新增：Claude CLI session ID
  totalInputTokens: number;   // 新增：累計輸入 token
  totalOutputTokens: number;  // 新增：累計輸出 token
  turnCount: number;          // 新增：對話輪數
  avgResponseMs: number;      // 新增：平均回應時間
  createdAt: string;
  lastActiveAt: string;
}
```

#### ClaudeOutput — 擴展的輸出資料

```typescript
interface ClaudeOutput {
  type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'result';
  content: string;
  sessionId?: string;
  usage?: TokenUsage;
  durationMs?: number;
  costUsd?: number;
}
```

### 3.2 SQLite Schema 變更

#### sessions 表 — 新增欄位

```sql
ALTER TABLE sessions ADD COLUMN model TEXT DEFAULT 'sonnet';
ALTER TABLE sessions ADD COLUMN claude_session_id TEXT;
ALTER TABLE sessions ADD COLUMN total_input_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN total_output_tokens INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN turn_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN avg_response_ms REAL DEFAULT 0;
```

#### bookmarks 表 — 新建

```sql
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, name)
);
```

---

## 4. 元件詳細設計

### 4.1 StreamJsonParser（新建）

**職責**：解析 Claude CLI stdout 的 NDJSON 事件流

```typescript
class StreamJsonParser extends EventEmitter {
  // 事件：
  //   'text'    → (text: string) — 完整文字區塊
  //   'result'  → (result: ResultEvent) — 回應完成 + usage
  //   'system'  → (message: string) — 系統訊息（就緒偵測）
  //   'error'   → (error: Error) — 解析錯誤

  private buffer: string = '';
  private currentText: string = '';

  parseLine(line: string): void {
    // 1. JSON.parse(line)
    // 2. 根據 event.type 分發：
    //    - 'system'    → emit('system', message)
    //    - 'assistant' → 累積文字到 currentText, emit('text', text)
    //    - 'result'    → emit('result', { text, usage, duration, sessionId })
  }

  // 處理 stdout data chunk（可能含不完整行）
  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // 保留最後不完整行
    for (const line of lines) {
      if (line.trim()) this.parseLine(line.trim());
    }
  }
}
```

### 4.2 ClaudeManager 改造

#### 4.2.1 啟動參數改造

```typescript
// Before (v1.0)
const args = ['-p', userMessage, '--output-format', 'json'];

// After (v2.0)
const args = [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--model', session.model || 'sonnet',
];
```

#### 4.2.2 新增 sendInput 方法

```typescript
sendInput(sessionId: string, message: string): void {
  const input: StreamJsonInput = {
    type: 'user',
    message: { role: 'user', content: message },
  };
  // 如果 Claude 正在處理中 → 加入佇列
  // 否則 → 直接寫入 stdin
  if (this.isProcessing) {
    this.messageQueue.push(input);
  } else {
    this.writeToStdin(input);
  }
}

private writeToStdin(input: StreamJsonInput): void {
  this.isProcessing = true;
  this.process.stdin.write(JSON.stringify(input) + '\n');
}
```

#### 4.2.3 佇列管理

```typescript
private messageQueue: StreamJsonInput[] = [];
private isProcessing: boolean = false;

// 當收到 result 事件（回應完成）時：
private onResponseComplete(): void {
  this.isProcessing = false;
  if (this.messageQueue.length > 0) {
    const next = this.messageQueue.shift()!;
    this.writeToStdin(next);
  }
}
```

#### 4.2.4 就緒偵測

```typescript
// 監聽 system 事件中包含 "session started" 的訊息
parser.on('system', (message: string) => {
  if (message.includes('session') || message.includes('started')) {
    this.isReady = true;
    this.emit('ready');
  }
});
```

#### 4.2.5 殭屍進程清理

```typescript
static async cleanupZombies(): Promise<number> {
  // Windows 專用：使用 PowerShell 掃描 claude 相關進程
  const script = `
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Where-Object { $_.CommandLine -like '*claude*' -and $_.ProcessId -ne $PID } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  `;
  // 執行清理並回報清理數量
}
```

#### 4.2.6 PID 追蹤

```typescript
private activePids: Set<number> = new Set();

startSession(): void {
  const proc = spawn('claude', args);
  this.activePids.add(proc.pid);
  proc.on('exit', () => this.activePids.delete(proc.pid));
}

cleanup(): void {
  for (const pid of this.activePids) {
    try { process.kill(pid); } catch {}
  }
  this.activePids.clear();
}
```

### 4.3 TelegramBot 改造

#### 4.3.1 訊息路由改造

```typescript
// Before (v1.0)
async handleMessage(msg) {
  await this.claudeManager.startSession(session, msg.text);
}

// After (v2.0)
async handleMessage(msg) {
  if (!this.claudeManager.isRunning) {
    // 進程未運行 → 啟動 + 等待就緒 + 送入訊息
    await this.claudeManager.startSession(session);
    this.claudeManager.once('ready', () => {
      this.claudeManager.sendInput(session.id, msg.text);
    });
  } else {
    // 進程運行中 → 直接送入（佇列自動管理）
    this.claudeManager.sendInput(session.id, msg.text);
  }
}
```

#### 4.3.2 Typing 心跳

```typescript
private startTypingHeartbeat(chatId: number): void {
  this.typingInterval = setInterval(() => {
    this.bot.sendChatAction(chatId, 'typing');
  }, 4000); // Telegram typing 狀態每 5 秒過期，4 秒更新一次
}

private stopTypingHeartbeat(): void {
  if (this.typingInterval) {
    clearInterval(this.typingInterval);
    this.typingInterval = null;
  }
}
```

#### 4.3.3 Token 統計顯示

```typescript
private formatUsageFooter(usage: TokenUsage, durationMs: number): string {
  const inputK = (usage.input_tokens / 1000).toFixed(1);
  const outputK = (usage.output_tokens / 1000).toFixed(1);
  const seconds = (durationMs / 1000).toFixed(1);
  return `\n\n📊 input: ${inputK}k / output: ${outputK}k tokens (${seconds}s)`;
}
```

#### 4.3.4 檔案上傳處理

```typescript
async handleFileUpload(msg: TelegramBot.Message): Promise<void> {
  const file = msg.document || msg.photo?.[msg.photo.length - 1];
  if (!file) return;

  const fileInfo = await this.bot.getFile(file.file_id);
  const fileName = msg.document?.file_name || `photo_${Date.now()}.jpg`;

  // 下載到工作目錄的 _uploads/
  const uploadDir = path.join(session.workingDirectory, '_uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  // ... 下載並儲存

  // 通知 Claude
  this.claudeManager.sendInput(session.id,
    `使用者上傳了檔案 ${fileName}，已存到 ${filePath}`
  );
}
```

### 4.4 SessionStore 擴展

#### 新增方法

```typescript
// 模型偏好
updateModel(sessionId: string, model: string): void;

// 書籤管理
addBookmark(chatId: number, name: string, path: string): void;
removeBookmark(chatId: number, name: string): void;
getBookmarks(chatId: number): Bookmark[];
getBookmarkPath(chatId: number, name: string): string | null;

// Token 統計
updateUsage(sessionId: string, usage: TokenUsage, durationMs: number): void;
```

### 4.5 index.ts — 啟動前 Pre-flight

```typescript
async function main() {
  console.log('[Bridge] 啟動前 pre-flight 檢查...');

  // 1. 殭屍進程清理
  const killed = await ClaudeManager.cleanupZombies();
  if (killed > 0) {
    console.log(`[Bridge] 已清理 ${killed} 個殘留進程`);
  }

  // 2. 資料庫遷移
  sessionStore.migrate();

  // 3. 啟動 Telegram Bot
  const bot = new TelegramBot(sessionStore);
  bot.start();

  // 4. 優雅關閉
  const shutdown = () => {
    console.log('[Bridge] 正在關閉...');
    bot.stop();
    claudeManager.cleanup();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

---

## 5. 改動檔案清單

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/types.ts` | 修改 | 新增 StreamJsonInput/Event/Usage 型別，擴展 Session/ClaudeOutput |
| `src/stream-json-parser.ts` | **新建** | NDJSON 事件流解析器 + token usage 擷取 |
| `src/claude-manager.ts` | 修改 | stream-json 啟動、佇列、就緒偵測、殭屍清理、PID 追蹤 |
| `src/telegram-bot.ts` | 修改 | 訊息路由改造、/model、/bookmark、檔案上傳、心跳、token 統計顯示 |
| `src/session-store.ts` | 修改 | 新增 model 欄位 + bookmarks 表 + usage 更新 |
| `src/index.ts` | 修改 | 啟動前殭屍清理 pre-flight |
| `src/output-parser.ts` | 保留 | 不刪除，作為 fallback |

---

## 6. 實作順序

```
Phase 1: types.ts           — 型別定義（無依賴）
Phase 2: stream-json-parser — 新建解析器（依賴 Phase 1）
Phase 3: session-store.ts   — DB schema 遷移（依賴 Phase 1）
Phase 4: claude-manager.ts  — 核心改造（依賴 Phase 1 + 2）
Phase 5: telegram-bot.ts    — UI 層改造（依賴 Phase 3 + 4）
Phase 6: index.ts           — 殭屍清理 + pre-flight（依賴 Phase 4）
Phase 7: 整合測試           — 全流程驗證
```

---

## 7. 錯誤處理策略

| 情境 | 處理方式 |
|------|----------|
| Claude 進程啟動失敗 | 回覆使用者「啟動失敗」+ 錯誤訊息，允許重試 |
| stdin 寫入失敗 | 標記進程為 dead，下次訊息觸發重啟 |
| JSON 解析失敗 | 記錄錯誤日誌，跳過該行，不中斷整個事件流 |
| SQLite 操作失敗 | 記錄錯誤，功能降級（書籤/統計不可用，核心對話不受影響）|
| 訊息佇列溢出 | 上限 50 條，超過時回覆使用者「請等待處理完成」|
| Telegram API 失敗 | 重試 3 次，指數退避（1s, 2s, 4s）|

---

## 8. 安全考量

| 項目 | 措施 |
|------|------|
| Bot Token | 透過 `.env` 配置，不硬編碼 |
| 使用者授權 | `ALLOWED_USER_IDS` 白名單，只允許指定使用者操作 |
| 檔案上傳 | 限制大小（20MB）、驗證副檔名、存到隔離目錄 |
| 工作目錄 | 只允許存在的路徑，防止路徑穿越 |
| 殭屍清理 | 只 kill 包含特定標記的進程，避免誤殺 |
