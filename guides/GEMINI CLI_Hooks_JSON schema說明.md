我看到 repo 有 `docs` 目錄，讓我直接抓取 hooks 相關文件。以下是 Gemini CLI Hooks 完整技術文件整理：

---

# Gemini CLI Hooks 完整技術文件

> **版本**：v0.26.0+ 已預設啟用（最新穩定版 v0.29.5，2026/02/19）  
> **來源**：[geminicli.com/docs/hooks/reference](https://geminicli.com/docs/hooks/reference/)

---

## 一、核心通訊機制（Golden Rule）

Hooks 透過標準 I/O 與 CLI 溝通：

| 管道 | 用途 |
|------|------|
| **stdin** | CLI → Hook，傳入 JSON 輸入 |
| **stdout** | Hook → CLI，必須只輸出最終 JSON，禁止任何純文字 |
| **stderr** | 僅供 Debug / Log，CLI 不解析 |

**Exit Codes：**
- `0` → 成功，解析 stdout JSON
- `2` → 系統封鎖，以 stderr 作為拒絕原因
- `其他` → 警告，CLI 繼續執行但顯示警告

---

## 二、支援的 Hook 類型（完整列表）

### 🔧 Tool Hooks（工具攔截）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `BeforeTool` | 工具執行前 | ✅ 可 deny/block |
| `AfterTool` | 工具執行後 | ✅ 可隱藏結果 |

### 🤖 Agent Hooks（代理攔截）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `BeforeAgent` | 使用者送出 prompt 後、代理規劃前 | ✅ 可 deny 整個 turn |
| `AfterAgent` | 代理產生最終回應後 | ✅ 可拒絕並強制重試 |

### 🧠 Model Hooks（LLM 層攔截）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `BeforeModel` | 送出 LLM 請求前 | ✅ 可修改 model/temperature，或注入合成回應 |
| `BeforeToolSelection` | LLM 決定呼叫哪些工具前 | ⚠️ 只能篩選工具，不支援 deny/continue |
| `AfterModel` | 收到 LLM 每個 chunk 後 | ✅ 可即時修改/過濾 PII |

### 🔄 Lifecycle & System Hooks（生命週期）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `SessionStart` | 啟動、resume、/clear | ❌ 僅 Advisory |
| `SessionEnd` | 退出或清除 session | ❌ CLI 不等待 |
| `Notification` | 系統警示（如工具權限請求） | ❌ 僅觀察用 |
| `PreCompress` | 壓縮 token 歷史前 | ❌ 非同步，無法封鎖 |

---

## 三、JSON Schema

### 設定檔結構（`settings.json`）

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "run_shell_command",
        "sequential": true,
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/security-check.js",
            "name": "SecurityCheck",
            "timeout": 5000,
            "description": "防止執行危險指令"
          }
        ]
      }
    ]
  }
}
```

### Hook Definition Schema

```json
{
  "matcher":    "string（regex 或完整名稱）",
  "sequential": "boolean（true=順序執行, false=平行執行）",
  "hooks":      "array（Hook Config 陣列）"
}
```

### Hook Configuration Schema

```json
{
  "type":        "command（目前唯一支援）",
  "command":     "string（shell 指令）",
  "name":        "string（可選，友好名稱）",
  "timeout":     "number（ms，預設 60000）",
  "description": "string（可選，說明）"
}
```

### Base Input Schema（所有 hooks 共用）

```json
{
  "session_id":       "string",
  "transcript_path":  "string",
  "cwd":              "string",
  "hook_event_name":  "string（例如 BeforeTool）",
  "timestamp":        "string（ISO 8601）"
}
```

### Common Output Fields（通用輸出欄位）

```json
{
  "systemMessage":  "string（顯示給使用者）",
  "suppressOutput": "boolean（隱藏 log/telemetry）",
  "continue":       "boolean（false = 立即停止整個代理迴圈）",
  "stopReason":     "string（continue=false 時的訊息）",
  "decision":       "allow | deny | block",
  "reason":         "string（deny 時的說明）"
}
```

---

## 四、各事件的 hookSpecificOutput

| 事件 | hookSpecificOutput 欄位 | 說明 |
|------|------------------------|------|
| `BeforeTool` | `tool_input` | 覆寫模型產生的工具參數 |
| `AfterTool` | `additionalContext` | 附加文字給代理<br>`tailToolCallRequest: {name, args}` → 串接另一工具 |
| `BeforeAgent` | `additionalContext` | 附加文字到此 turn 的 prompt |
| `AfterAgent` | `clearContext` (boolean) | 清除 LLM 記憶但保留 UI |
| `BeforeModel` | `llm_request` → 覆寫請求<br>`llm_response` → 合成回應（跳過 LLM） | 可完全攔截 LLM 呼叫 |
| `BeforeToolSelection` | `toolConfig.mode` (AUTO/ANY/NONE)<br>`toolConfig.allowedFunctionNames` | 白名單合集策略 |
| `AfterModel` | `llm_response` | 替換當前 chunk |
| `SessionStart` | `additionalContext` | 互動模式注入歷史；非互動則前置到 prompt |

---

## 五、Stable Model API（LLM 層 Schema）

```json
// LLMRequest
{
  "model": "string",
  "messages": [
    { "role": "user | model | system", "content": "string" }
  ],
  "config": { "temperature": 0.7 },
  "toolConfig": { "mode": "AUTO", "allowedFunctionNames": [] }
}

// LLMResponse
{
  "candidates": [
    {
      "content": { "role": "model", "parts": ["string"] },
      "finishReason": "string"
    }
  ],
  "usageMetadata": { "totalTokenCount": 1234 }
}
```

---

## 六、實際範例

### 範例 1：BeforeTool — 防止 API Key 寫入程式碼（Bash）

```bash
#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

if echo "$CONTENT" | grep -qE "(sk-|AIza|AKIA)[A-Za-z0-9]{20,}"; then
  echo '{"decision":"deny","reason":"偵測到 API Key，拒絕寫入！"}' 
else
  echo '{"decision":"allow"}'
fi
```

### 範例 2：BeforeToolSelection — 動態篩選可用工具（Node.js）

```javascript
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const prompt = input.llm_request.messages.at(-1)?.content || '';

let allowed;
if (prompt.includes('file') || prompt.includes('檔案')) {
  allowed = ['read_file', 'write_file', 'list_directory'];
} else {
  allowed = ['run_shell_command', 'web_fetch'];
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    toolConfig: {
      mode: 'ANY',
      allowedFunctionNames: allowed
    }
  }
}));
```

### 範例 3：AfterAgent — 驗證回應品質並強制重試

```javascript
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const response = input.prompt_response || '';

if (response.length < 50 || response.includes('我不確定')) {
  console.log(JSON.stringify({
    decision: 'deny',
    reason: '回應品質不符，請提供更詳細的說明並確認資訊正確性。'
  }));
} else {
  console.log(JSON.stringify({ decision: 'allow' }));
}
```

### 範例 4：SessionStart — 載入專案 Memory

```javascript
const fs = require('fs');
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

let context = '';
try {
  context = fs.readFileSync(`${process.env.GEMINI_PROJECT_DIR}/.gemini/memory.md`, 'utf8');
} catch (e) {
  process.stderr.write('No memory file found\n');
}

console.log(JSON.stringify({
  hookSpecificOutput: { additionalContext: context },
  systemMessage: '✅ 專案 Memory 已載入'
}));
```

---

## 七、環境變數（Hooks 執行時可用）

| 變數 | 說明 |
|------|------|
| `GEMINI_PROJECT_DIR` | 專案根目錄絕對路徑 |
| `GEMINI_SESSION_ID` | 當前 session 唯一 ID |
| `GEMINI_CWD` | 當前工作目錄 |
| `CLAUDE_PROJECT_DIR` | 相容別名（同 GEMINI_PROJECT_DIR） |

---

## 八、Matcher 規則（工具匹配）

| 模式 | 範例 | 說明 |
|------|------|------|
| 精確匹配 | `run_shell_command` | 只匹配此工具 |
| Regex | `read_.*` | 匹配所有讀取工具 |
| MCP 工具 | `mcp__github__list_prs` | MCP server 命名格式 |
| 全部 | `.*` 或 `*` | 匹配所有工具 |

---

## 九、安全注意事項

⚠️ **Hooks 以當前使用者權限執行任意程式碼。**

- 專案層級 hooks（`.gemini/settings.json`）風險最高，開啟不信任專案時特別警慎
- CLI 會對專案 hooks 建立指紋，若 `name` 或 `command` 變更（例如 git pull 後），視為新的未信任 hook，執行前會警告
- 預設 timeout：60 秒；建議快速 hooks 設更短的 timeout（如 5000ms）
- 絕對不要在 stdout 混入非 JSON 輸出