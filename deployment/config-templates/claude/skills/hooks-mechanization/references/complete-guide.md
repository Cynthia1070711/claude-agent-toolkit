# Claude Code Hooks 完整使用說明與實用範例

> **資料來源**：官方文件 code.claude.com/docs/zh-TW/hooks、paul-schick.com、smartscope.blog、pixelmojo.io、blakecrosley.com、stevekinney.com、claudelog.com、agentsroom.dev、netnerds.net（Windows/PowerShell 專章）等，彙整至 2026 年 5 月。

---

## 目錄

1. [什麼是 Hooks？](#1-什麼是-hooks)
2. [核心概念與術語](#2-核心概念與術語)
3. [設定檔位置與結構](#3-設定檔位置與結構)
4. [Hook 生命週期事件總覽](#4-hook-生命週期事件總覽)
5. [Handler 類型（command / prompt / agent / http）](#5-handler-類型)
6. [Exit Code 語義](#6-exit-code-語義)
7. [JSON 輸入 / 輸出格式](#7-json-輸入--輸出格式)
8. [決定控制（Decision Control）](#8-決定控制)
9. [各事件詳細說明與範例](#9-各事件詳細說明與範例)
   - 9.1 SessionStart
   - 9.2 PreToolUse
   - 9.3 PostToolUse
   - 9.4 PostToolUseFailure
   - 9.5 PermissionRequest / PermissionDenied
   - 9.6 Stop / StopFailure
   - 9.7 SubagentStart / SubagentStop
   - 9.8 Notification
   - 9.9 UserPromptSubmit
   - 9.10 TaskCreated / TaskCompleted
   - 9.11 SessionEnd
   - 9.12 PreCompact / PostCompact
   - 9.13 FileChanged / CwdChanged
   - 9.14 WorktreeCreate / WorktreeRemove
   - 9.15 Elicitation / ElicitationResult
10. [非同步 Hooks（async）](#10-非同步-hooks)
11. [HTTP Hooks](#11-http-hooks)
12. [Prompt & Agent Hooks](#12-prompt--agent-hooks)
13. [環境變數參考](#13-環境變數參考)
14. [實用完整範例集](#14-實用完整範例集)
15. [Windows / PowerShell 專章](#15-windows--powershell-專章)
16. [偵錯技巧](#16-偵錯技巧)
17. [安全最佳實踐](#17-安全最佳實踐)
18. [完整 settings.json 範本](#18-完整-settingsjson-範本)

---

## 1. 什麼是 Hooks？

Hooks 是使用者定義的自動化程序，在 Claude Code 執行生命週期的**特定時間點**自動觸發。與 `CLAUDE.md` 的文字指令不同，Hooks 是**確定性執行**：無論 Claude 有沒有「記住」你的要求，Hook 都會每次必定執行，沒有例外。

```
CLAUDE.md 指令  →  AI 可能忽略
Hook 設定       →  100% 確定觸發
```

**主要用途：**
- 攔截並阻擋危險指令（如 `rm -rf`、`DROP TABLE`）
- 自動格式化程式碼（Prettier、ESLint、dotnet format）
- 保護敏感檔案（`.env`、`.git/config`）
- 執行完自動跑測試
- 記錄 Session 日誌 / 審計軌跡
- 發送通知（Slack、Windows Toast）
- 強制執行 Commit message 格式

---

## 2. 核心概念與術語

| 術語 | 說明 |
|------|------|
| **Hook Event** | 生命週期觸發點，如 `PreToolUse`、`PostToolUse` |
| **Matcher** | 正規表示式，決定哪些工具名稱觸發此 Hook |
| **Hook Handler** | 實際執行的命令、提示或 HTTP 請求 |
| **Exit Code** | Handler 的回傳碼，決定 Claude 後續行為 |
| **tool_name** | Matcher 匹配的對象，如 `Bash`、`Write`、`Edit` |
| **tool_input** | 傳給工具的輸入 JSON |
| **tool_response** | 工具執行後的結果 JSON（僅 PostToolUse 有） |

---

## 3. 設定檔位置與結構

### 設定檔優先順序（由高到低）

```
企業管理員設定  (managed)
    ↓
全域設定       ~/.claude/settings.json
    ↓
專案設定       .claude/settings.json       ← 推薦（隨 Git 版控）
    ↓
專案本地設定   .claude/settings.local.json ← gitignore，個人專用
```

### 基本結構

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "your-script.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [...],
    "Stop": [...],
    "SessionStart": [...]
  }
}
```

### Matcher 匹配規則

| 模式 | 說明 |
|------|------|
| `"Bash"` | 精確匹配工具名稱 |
| `"Write\|Edit\|MultiEdit"` | OR 匹配（管道符分隔） |
| `".*"` 或 `""` | 匹配所有工具 |
| `"mcp__github__.*"` | 匹配 MCP 工具（格式：`mcp__{server}__{tool}`）|

> **注意**：Matcher 對 `tool_name` 欄位做 RegEx 全文匹配。

---

## 4. Hook 生命週期事件總覽

```
SessionStart
    │
    ├─► InstructionsLoaded
    │
    ├─► UserPromptSubmit
    │
    │   ┌── 代理迴圈（每次工具呼叫）──────────────────┐
    │   │                                              │
    │   │  PreToolUse                                  │
    │   │     ↓ (允許)                                 │
    │   │  PermissionRequest ─► PermissionDenied       │
    │   │     ↓                                        │
    │   │  [工具執行]                                   │
    │   │     ↓                                        │
    │   │  PostToolUse / PostToolUseFailure             │
    │   │                                              │
    │   │  SubagentStart ─► (子代理迴圈) ─► SubagentStop│
    │   │  TaskCreated ─────────────────► TaskCompleted│
    │   └──────────────────────────────────────────────┘
    │
    ├─► Stop / StopFailure
    │
    ├─► PreCompact / PostCompact
    │
    └─► SessionEnd

獨立非同步事件：
  Notification, ConfigChange, CwdChanged, FileChanged
  WorktreeCreate, WorktreeRemove, Elicitation, ElicitationResult
```

### 事件一覽表

| 事件 | 觸發時機 | 可阻擋？ |
|------|----------|---------|
| `SessionStart` | Session 開始或恢復時 | ✗ |
| `InstructionsLoaded` | CLAUDE.md 等指令載入後 | ✗ |
| `UserPromptSubmit` | 使用者送出提示前 | ✓ |
| `PreToolUse` | **工具執行前** | ✓ |
| `PermissionRequest` | 出現權限對話框時 | ✓ |
| `PermissionDenied` | 工具被自動模式拒絕時 | 可 retry |
| `PostToolUse` | 工具**成功**執行後 | ✗（但可反饋）|
| `PostToolUseFailure` | 工具**失敗**後 | ✗ |
| `Notification` | Claude 發送通知時 | ✗ |
| `SubagentStart` | 子代理被生成時 | ✗ |
| `SubagentStop` | 子代理完成時 | ✗ |
| `TaskCreated` | 任務建立時 | ✓ |
| `TaskCompleted` | 任務標記完成時 | ✓ |
| `Stop` | Claude 結束回應時 | ✓（可強制繼續）|
| `StopFailure` | API 錯誤導致 turn 結束 | ✗（輸出被忽略）|
| `TeammateIdle` | 團隊代理閒置時 | ✓ |
| `PreCompact` | 上下文壓縮前 | ✗ |
| `PostCompact` | 上下文壓縮後 | ✗ |
| `SessionEnd` | Session 結束時 | ✗ |
| `CwdChanged` | 工作目錄變更時 | ✗ |
| `FileChanged` | 監視的檔案變更時 | ✗ |
| `WorktreeCreate` | Git Worktree 建立時 | ✗ |
| `WorktreeRemove` | Git Worktree 移除時 | ✗ |
| `ConfigChange` | 設定變更時 | ✗ |
| `Elicitation` | MCP Server 詢問使用者前 | ✓ |
| `ElicitationResult` | 使用者回應 MCP 詢問後 | ✓ |

---

## 5. Handler 類型

### 5.1 command（最常用）

執行 shell 命令，透過 stdin/stdout/exit code 溝通。

```json
{
  "type": "command",
  "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/validate.py\"",
  "timeout": 10
}
```

| 欄位 | 說明 | 預設 |
|------|------|------|
| `command` | Shell 命令字串 | 必填 |
| `timeout` | 超時秒數，超時視為非阻擋錯誤 | 60 |
| `async` | 非同步執行，不等待結果 | false |

### 5.2 http（遠端 Webhook）

將事件 JSON 以 POST 發送到 HTTP 端點。

```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/pre-tool-use",
  "timeout": 30,
  "headers": {
    "Authorization": "Bearer $MY_TOKEN"
  },
  "allowedEnvVars": ["MY_TOKEN"]
}
```

> **注意**：HTTP Hook 的錯誤（非 2xx、連線失敗、超時）是**非阻擋**的。若要阻擋，必須回傳 `2xx` 並在 body 包含 `"decision": "block"`。

### 5.3 prompt（LLM 評估）

將工具輸入送給 Claude 模型做單輪評估，使用 `$ARGUMENTS` 作為佔位符。

```json
{
  "type": "prompt",
  "prompt": "評估此 Bash 命令是否安全：$ARGUMENTS。若不安全，回傳 JSON {\"decision\": \"block\", \"reason\": \"...\"}",
  "timeout": 30
}
```

### 5.4 agent（子代理驗證）

生成一個可存取 Read、Grep、Glob 等工具的子代理進行深度驗證。

```json
{
  "type": "agent",
  "description": "深度安全審查",
  "timeout": 60
}
```

---

## 6. Exit Code 語義

| Exit Code | 行為 |
|-----------|------|
| `0` | 成功，繼續執行；可從 stdout 讀取 JSON 做精細控制 |
| `2` | **阻擋錯誤**：對 PreToolUse 會阻止工具；對 Stop 會強制 Claude 繼續工作；stderr 內容反饋給 Claude |
| 其他非 0 | 非阻擋錯誤：Hook 失敗但執行繼續，stderr 顯示給使用者但不反饋給 Claude |

> **關鍵**：安全 Hook 必須用 `exit 2`，用 `exit 1` 只是警告，**無法阻擋**動作。

---

## 7. JSON 輸入 / 輸出格式

### 通用輸入欄位（所有事件共有）

```json
{
  "session_id": "abc-123",
  "hook_event_name": "PreToolUse",
  "cwd": "/path/to/project",
  "env": {}
}
```

### PreToolUse 額外輸入

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/test"
  },
  "tool_use_id": "toolu_01..."
}
```

### PostToolUse 額外輸入

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/src/app.cs",
    "content": "..."
  },
  "tool_response": {
    "exit_code": 0,
    "stdout": "...",
    "stderr": ""
  }
}
```

### Stop 事件輸入

```json
{
  "stop_hook_active": false,
  "transcript": [...]
}
```

---

## 8. 決定控制

### PreToolUse JSON 輸出（exit 0 時從 stdout 輸出）

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "安全的讀取操作",
    "updatedInput": {
      "command": "修改後的指令"
    },
    "additionalContext": "傳給 Claude 的額外上下文"
  }
}
```

### 阻擋工具（PreToolUse）

```json
{
  "decision": "block",
  "reason": "禁止刪除 .env 檔案"
}
```

### 阻止 Claude 停止（Stop Hook）

```json
{
  "decision": "block",
  "reason": "測試尚未全部通過，請繼續修復"
}
```

### Stop Hook 優先順序

```
continue: false  >  JSON "decision": "block"  >  exit code 2
```

---

## 9. 各事件詳細說明與範例

### 9.1 SessionStart

**觸發時機**：Session 開始或恢復時，每個 Session 只觸發一次。
**用途**：注入環境變數、初始化日誌、提供 Git 分支資訊。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"additionalContext\": \"Branch: '$(git branch --show-current)'\"}'"
          }
        ]
      }
    ]
  }
}
```

**範例：寫入環境變數到 CLAUDE_ENV_FILE**

```bash
#!/usr/bin/env bash
# .claude/hooks/session-setup.sh
echo "PROJECT_ROOT=$(git rev-parse --show-toplevel)" >> "$CLAUDE_ENV_FILE"
echo "NODE_ENV=development" >> "$CLAUDE_ENV_FILE"
echo "BUILD_DATE=$(date +%Y-%m-%d)" >> "$CLAUDE_ENV_FILE"
```

---

### 9.2 PreToolUse

**觸發時機**：任何工具執行**前**，是最重要的 Hook。
**用途**：攔截危險操作、修改工具輸入、強制執行規範。
**Exit 2 = 阻擋動作**，stderr 內容反饋給 Claude。

**範例 1：阻擋危險 Bash 命令**

```bash
#!/usr/bin/env bash
# .claude/hooks/block-dangerous-commands.sh
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# 阻擋 rm -rf（保護根目錄或重要目錄）
if echo "$COMMAND" | grep -qE 'rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+--recursive\s+--force'; then
  echo "❌ 危險命令被攔截：$COMMAND" >&2
  exit 2
fi

# 阻擋 DROP TABLE
if echo "$COMMAND" | grep -qiE 'DROP\s+TABLE|TRUNCATE\s+TABLE'; then
  echo "❌ 資料庫破壞性操作被阻擋" >&2
  exit 2
fi

exit 0
```

**settings.json 設定：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/block-dangerous-commands.sh\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**範例 2：保護敏感檔案**

```bash
#!/usr/bin/env bash
# .claude/hooks/protect-sensitive-files.sh
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# 保護 .env 和 .git 相關檔案
if echo "$FILE_PATH" | grep -qE '\.env$|\.env\.|/\.git/'; then
  cat <<EOF
{
  "decision": "block",
  "reason": "禁止直接修改敏感設定檔 (.env / .git)。請透過環境變數管理工具操作。"
}
EOF
  exit 0
fi

exit 0
```

**範例 3：強制使用 bun 而非 npm（專案規範）**

```bash
#!/usr/bin/env bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE '\bnpm\b'; then
  cat <<EOF
{
  "decision": "block",
  "reason": "專案規範：禁止使用 npm。請改用 bun。例如：bun install、bun run build"
}
EOF
  exit 0
fi
exit 0
```

**範例 4：修改工具輸入（updatedInput）**

```bash
#!/usr/bin/env bash
# 自動加上 --dry-run 旗標（預覽模式）
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE '^rsync\b'; then
  NEW_COMMAND="${COMMAND} --dry-run"
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": {
      "command": "$NEW_COMMAND"
    },
    "additionalContext": "已自動加入 --dry-run 旗標以防止意外覆蓋"
  }
}
EOF
fi
exit 0
```

---

### 9.3 PostToolUse

**觸發時機**：工具**成功**執行後立即觸發。
**用途**：自動格式化、自動 lint、執行測試、記錄日誌。
**注意**：工具已執行完畢，無法撤銷，但可提供反饋給 Claude 的後續決策。

**範例 1：自動 Prettier 格式化**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**範例 2：格式化 + Lint（並行執行）**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\""
          },
          {
            "type": "command",
            "command": "npx eslint --fix \"$CLAUDE_TOOL_INPUT_FILE_PATH\""
          }
        ]
      }
    ]
  }
}
```

> 多個 Hook 在同一 matcher 下**並行執行**。

**範例 3：.NET 專案自動格式化（dotnet format）**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "dotnet format \"$CLAUDE_PROJECT_DIR\" --include \"$CLAUDE_TOOL_INPUT_FILE_PATH\" --severity warn",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

**範例 4：記錄所有檔案修改日誌**

```bash
#!/usr/bin/env bash
# .claude/hooks/log-file-changes.sh
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // "unknown"')
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
echo "$(date '+%Y-%m-%d %H:%M:%S') | $TOOL | $FILE_PATH" >> "$CLAUDE_PROJECT_DIR/.claude/change-log.txt"
exit 0
```

---

### 9.4 PostToolUseFailure

**觸發時機**：工具執行**失敗**時。
**用途**：記錄失敗、發送警報、提供修正建議給 Claude。

```json
{
  "hooks": {
    "PostToolUseFailure": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/log-failure.sh\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

---

### 9.5 PermissionRequest / PermissionDenied

**PermissionRequest**：工具需要權限時。可以自動允許特定白名單操作。

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/auto-allow.sh\""
          }
        ]
      }
    ]
  }
}
```

```bash
#!/usr/bin/env bash
# auto-allow.sh：自動允許安全的 npm 腳本
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qE '^npm run (lint|test|build)$'; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedInput": {"command": "$COMMAND"}
    }
  }
}
EOF
  exit 0
fi
exit 0
```

**PermissionDenied**：自動模式下被拒絕時，可回傳 `retry: true` 讓 Claude 重試。

---

### 9.6 Stop / StopFailure

**Stop**：Claude 完成回應時觸發。
- Exit 2 → 強制 Claude 繼續工作
- JSON `decision: "block"` → 提供原因讓 Claude 繼續

**範例 1：Stop 時自動跑測試**

```bash
#!/usr/bin/env bash
# .claude/hooks/run-tests-on-stop.sh
INPUT=$(cat)

# 防止無限迴圈！
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

# 只在有修改 .cs 或 .js 檔案時才跑測試
if npm test 2>&1 | grep -q "FAIL"; then
  echo "測試失敗，請修復後再停止。" >&2
  exit 2
fi

exit 0
```

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/run-tests-on-stop.sh\"",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

**範例 2：Stop 時確認 Checklist 完成**

```bash
#!/usr/bin/env bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

CHECKLIST="$CLAUDE_PROJECT_DIR/.claude/task-checklist.md"
if grep -q "\[ \]" "$CHECKLIST" 2>/dev/null; then
  cat <<EOF
{
  "decision": "block",
  "reason": "Checklist 尚有未完成項目，請繼續處理 $CHECKLIST 中的 [ ] 項目"
}
EOF
  exit 0
fi
exit 0
```

---

### 9.7 SubagentStart / SubagentStop

子代理的 Hook 同樣受 PreToolUse 等事件約束，安全閘門可遞迴套用。

**範例：記錄子代理成本**

```bash
#!/usr/bin/env bash
# PostToolUse hook 中讀取子代理遙測
INPUT=$(cat)
AGENT_ID=$(echo "$INPUT" | jq -r '.tool_response.agentId // empty')
USAGE=$(echo "$INPUT" | jq -r '.tool_response.usage // empty')
if [ -n "$AGENT_ID" ]; then
  echo "$(date) | SubAgent $AGENT_ID | Usage: $USAGE" >> ~/.claude/agent-cost.log
fi
exit 0
```

---

### 9.8 Notification

**觸發時機**：Claude Code 送出通知時。
**用途**：整合 Slack、系統通知、手機推播。

**範例：Windows Toast 通知（Node.js + BurntToast）**

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%USERPROFILE%\\.claude\\hooks\\toast-notify.js\"",
            "timeout": 10,
            "async": true
          }
        ]
      }
    ]
  }
}
```

```javascript
// ~/.claude/hooks/toast-notify.js
const { spawnSync } = require('child_process');
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const message = input.message || 'Claude 工作完成';
const cwd = require('path').basename(process.cwd());

const script = `
Import-Module BurntToast -ErrorAction SilentlyContinue
New-BurntToastNotification -Text 'Claude Code [${cwd}]', '${message.replace(/'/g, "''")}' -Silent
`;
spawnSync('pwsh', ['-NoProfile', '-Command', script]);
```

---

### 9.9 UserPromptSubmit

**觸發時機**：使用者送出提示後、Claude 處理前。
**用途**：注入額外上下文、過濾不當內容、記錄所有 prompt。

```bash
#!/usr/bin/env bash
# 記錄所有使用者 Prompt
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
echo "$(date) | PROMPT: $PROMPT" >> ~/.claude/prompt-history.log
exit 0
```

---

### 9.10 TaskCreated / TaskCompleted

**用途**：任務管理整合，可在建立任務時加入額外驗證或在完成時觸發 CI。

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST \"$WEBHOOK_URL\" -d '{\"event\":\"task_done\"}'",
            "async": true
          }
        ]
      }
    ]
  }
}
```

---

### 9.11 SessionEnd

**觸發時機**：Session 結束時，每個 Session 只觸發一次。
**用途**：清理暫存、歸檔日誌。

```bash
#!/usr/bin/env bash
# 歸檔本次 Session 日誌
ARCHIVE_DIR="$CLAUDE_PROJECT_DIR/.claude/session-archives"
mkdir -p "$ARCHIVE_DIR"
LOG="$CLAUDE_PROJECT_DIR/.claude/change-log.txt"
if [ -f "$LOG" ]; then
  cp "$LOG" "$ARCHIVE_DIR/$(date +%Y%m%d-%H%M%S).log"
  > "$LOG"  # 清空日誌
fi
exit 0
```

---

### 9.12 PreCompact / PostCompact

在上下文壓縮前後觸發，可用於快取或記錄壓縮事件。

---

### 9.13 FileChanged / CwdChanged

**FileChanged**：監視清單中的檔案被外部程式修改時觸發。
**CwdChanged**：工作目錄變更時觸發。

---

### 9.14 Elicitation / ElicitationResult

攔截或覆蓋 MCP Server 向使用者發出的詢問（v2.1.76+）。

---

## 10. 非同步 Hooks

加入 `"async": true` 讓 Hook 在背景執行，Claude 不等待結果繼續工作。

**限制**：Async Hook 無法阻擋或修改工具呼叫，僅適合通知、日誌等副作用。

```json
{
  "type": "command",
  "command": "echo \"$(date): session completed\" >> ~/claude-work.log",
  "async": true,
  "timeout": 30
}
```

---

## 11. HTTP Hooks

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hooks/pre-tool-use",
            "timeout": 30,
            "headers": {
              "Authorization": "Bearer $MY_TOKEN",
              "X-Project": "PhyCool"
            },
            "allowedEnvVars": ["MY_TOKEN"]
          }
        ]
      }
    ]
  }
}
```

**伺服器回應格式（阻擋範例）：**

```json
HTTP 200 OK
{
  "decision": "block",
  "reason": "命令未通過遠端安全審查"
}
```

---

## 12. Prompt & Agent Hooks

### Prompt Hook（LLM 語意評估）

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "評估 Claude 是否應停止：$ARGUMENTS。若任務未完成，回傳 {\"decision\": \"block\", \"reason\": \"...\"}",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Agent Hook（子代理深度驗證）

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__github__create_pr",
        "hooks": [
          {
            "type": "agent",
            "description": "執行完整測試套件後才允許建立 PR",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

---

## 13. 環境變數參考

| 變數 | 說明 |
|------|------|
| `$CLAUDE_PROJECT_DIR` | 專案根目錄（最重要，建議路徑都用此）|
| `$CLAUDE_TOOL_INPUT_FILE_PATH` | 當前工具操作的檔案路徑（PostToolUse）|
| `$CLAUDE_SESSION_ID` | 當前 Session ID（v2.1.9+）|
| `$CLAUDE_ENV_FILE` | SessionStart 可寫入的環境變數檔 |
| `$CLAUDE_TOOL_INPUT` | 工具輸入 JSON 字串 |

---

## 14. 實用完整範例集

### 範例 A：ASP.NET Core 專案完整 Hook 設定

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/security-gate.sh\"",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-files.sh\"",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "dotnet format \"$CLAUDE_PROJECT_DIR\" --include \"$CLAUDE_TOOL_INPUT_FILE_PATH\" --severity warn",
            "timeout": 60
          },
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/log-changes.sh\"",
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/stop-check.sh\"",
            "timeout": 120
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"additionalContext\": \"Branch: '$(git branch --show-current)' | Project: PhyCool PCPT\"}'"
          }
        ]
      }
    ]
  }
}
```

**security-gate.sh（完整版）：**

```bash
#!/usr/bin/env bash
set -euo pipefail
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# === 危險指令黑名單 ===
DANGEROUS_PATTERNS=(
  'rm\s+-[a-zA-Z]*r[a-zA-Z]*f'    # rm -rf
  'rmdir\s+/s'                      # rmdir /s（Windows）
  'DROP\s+(TABLE|DATABASE)'         # SQL 破壞
  'TRUNCATE\s+TABLE'
  'format\s+[A-Za-z]:'              # 格式化磁碟
  '>\s*/dev/sd'                     # 覆寫磁碟
  'dd\s+if=.*of=/dev/'              # dd 覆寫
  'sudo\s+rm'                       # sudo rm
)

for PATTERN in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qiE "$PATTERN"; then
    echo "🚫 安全閘門：危險指令被攔截 → $COMMAND" >&2
    exit 2
  fi
done

# === SQL Server 保護（PhyCool 專用）===
if echo "$COMMAND" | grep -qiE 'sqlcmd.*PhyCoolDB' && echo "$COMMAND" | grep -qiE 'DROP|TRUNCATE|DELETE\s+FROM'; then
  echo "🚫 禁止對 PhyCoolDB 執行破壞性 SQL" >&2
  exit 2
fi

exit 0
```

---

### 範例 B：Git Commit 品質閘門

```bash
#!/usr/bin/env bash
# .claude/hooks/git-commit-gate.sh
# 在 Stop hook 中，確保 commit 前測試通過
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi

# 只在有 git commit 操作時觸發
LAST_COMMAND=$(echo "$INPUT" | jq -r '.transcript[-1].content // empty')
if echo "$LAST_COMMAND" | grep -q "git commit"; then
  echo "🔍 執行 commit 前品質檢查..."
  
  # 跑測試
  if ! dotnet test --no-build --verbosity quiet 2>&1; then
    cat <<EOF >&2
測試失敗！請先修復所有測試才能 commit。
EOF
    exit 2
  fi
  
  echo "✅ 品質檢查通過" >&2
fi

exit 0
```

---

### 範例 C：自動偵測並修復 CRLF（Windows 開發者必備）

```bash
#!/usr/bin/env bash
# .claude/hooks/normalize-crlf.sh
# PostToolUse：自動 normalize 換行符
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then exit 0; fi

# 只處理指令碼檔案
if echo "$FILE_PATH" | grep -qE '\.(sh|ps1|bat|cmd)$'; then
  if command -v dos2unix &>/dev/null; then
    dos2unix "$FILE_PATH" 2>/dev/null
  else
    sed -i 's/\r$//' "$FILE_PATH" 2>/dev/null || true
  fi
  echo "✅ 已 normalize CRLF：$FILE_PATH" >&2
fi
exit 0
```

---

### 範例 D：PhyCool 多租戶保護 Hook

```bash
#!/usr/bin/env bash
# .claude/hooks/multitenant-protect.sh
# 防止跨租戶資料存取
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# 禁止在 SELECT 中省略 TenantId WHERE 子句（簡單檢查）
if echo "$COMMAND" | grep -qiE 'SELECT.*FROM\s+(Users|Orders|Subscriptions)' && \
   ! echo "$COMMAND" | grep -qiE 'WHERE.*TenantId\s*='; then
  cat <<EOF
{
  "decision": "block",
  "reason": "PhyCool 多租戶原則：查詢 Users/Orders/Subscriptions 必須包含 TenantId 過濾條件"
}
EOF
  exit 0
fi
exit 0
```

---

### 範例 E：ECPay/NewebPay 金鑰保護

```bash
#!/usr/bin/env bash
# .claude/hooks/payment-key-protect.sh
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

# 偵測是否要把 API Key 硬寫進程式碼
if echo "$CONTENT" | grep -qE '(HashKey|HashIV|MerchantID)\s*=\s*"[0-9A-Za-z]{10,}"'; then
  cat <<EOF
{
  "decision": "block",
  "reason": "禁止將 ECPay/NewebPay 金鑰硬編碼進原始碼。請使用 appsettings.json 或環境變數，並確認已加入 .gitignore。"
}
EOF
  exit 0
fi
exit 0
```

---

## 15. Windows / PowerShell 專章

Claude Code 在 Windows 環境下有一些特殊注意事項。

### 15.1 PowerShell 5.1 (powershell.exe) 問題

`powershell.exe`（Windows PowerShell 5.1）在 Claude Code 執行環境中**無法正常載入模組**，會出現 "module could not be loaded" 錯誤。**請改用 `pwsh`（PowerShell 7+）**。

### 15.2 阻擋 Inline PowerShell（強制寫成 .ps1 檔）

```bash
#!/usr/bin/env bash
# .claude/hooks/pre-bash-powershell.sh
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# 完全封鎖 powershell.exe
if echo "$COMMAND" | grep -qiP '\bpowershell(\.exe)?\b'; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
"permissionDecisionReason":"不要使用 powershell.exe (5.1)。請寫 .ps1 檔並執行：pwsh -NoProfile -File <script.ps1>"}}
EOF
  exit 0
fi

# 封鎖 pwsh -Command inline 寫法
if echo "$COMMAND" | grep -qiP 'pwsh(\s+-\w+)*\s+-(c|Command)\b'; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
"permissionDecisionReason":"不要用 pwsh -Command inline。請將程式碼寫入 .ps1 檔再執行。"}}
EOF
  exit 0
fi

exit 0
```

### 15.3 Windows Toast 通知完整方案

**安裝 BurntToast：**

```powershell
Install-Module -Name BurntToast -Scope CurrentUser
```

**settings.json（Notification Hook）：**

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%USERPROFILE%\\.claude\\hooks\\toast-notify.js\"",
            "timeout": 10,
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%USERPROFILE%\\.claude\\hooks\\toast-notify.js\"",
            "timeout": 10,
            "async": true
          }
        ]
      }
    ]
  }
}
```

**toast-notify.js：**

```javascript
const { spawnSync } = require('child_process');
const path = require('path');

let input = {};
try {
  const raw = require('fs').readFileSync(0, 'utf8'); // stdin
  input = JSON.parse(raw);
} catch {}

function psEscape(s) {
  return String(s || '').replace(/'/g, "''").substring(0, 150);
}

const cwd = psEscape(path.basename(process.cwd()));
const event = psEscape(input.hook_event_name || 'Event');
const message = psEscape(input.message || `Claude ${event} 完成`);

const script = `
Try {
  Import-Module BurntToast -ErrorAction Stop
  New-BurntToastNotification -Text 'Claude Code [${cwd}]', '${message}' -Silent
} Catch {}
`;

spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
  timeout: 8000,
  stdio: 'ignore'
});
```

### 15.4 Windows 路徑注意事項

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "pwsh -NoProfile -File \"%CLAUDE_PROJECT_DIR%\\.claude\\hooks\\format.ps1\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**format.ps1：**

```powershell
# .claude/hooks/format.ps1
$input_json = $Input | ConvertFrom-Json
$file_path = $input_json.tool_input.file_path

if ($file_path -match '\.(cs|csproj)$') {
    & dotnet format $env:CLAUDE_PROJECT_DIR --include $file_path --severity warn
}
exit 0
```

### 15.5 啟用 PowerShell Tool（Windows 原生支援）

在 `settings.json` 中啟用：

```json
{
  "env": {
    "CLAUDE_CODE_USE_POWERSHELL_TOOL": "1"
  },
  "defaultShell": "powershell"
}
```

---

## 16. 偵錯技巧

### 16.1 互動式查看 Hook 清單

在 Claude Code 內輸入 `/hooks` 可查看所有已啟用的 Hook 及其來源。

### 16.2 開啟 Verbose 模式

按 `Ctrl+O` 開啟 verbose 模式，可看到 PreToolUse / PostToolUse 等 Hook 的 stdout/stderr 輸出。

### 16.3 手動測試 Hook 腳本

```bash
# 模擬 PreToolUse 輸入，測試 Hook 行為
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/test"}}' \
  | bash .claude/hooks/security-gate.sh
echo "Exit code: $?"
```

### 16.4 停用所有 Hooks

在 settings.json 加入：

```json
{
  "disableAllHooks": true
}
```

### 16.5 效能監控原則

- 簡單檢查 Hook：< 200ms（不影響體驗）
- PostToolUse Hook：< 500ms 為佳
- 超過 500ms 考慮改用 `async: true`
- 使用 `time your-hook.sh` 評估執行時間

### 16.6 防止 Stop Hook 無限迴圈

```bash
#!/usr/bin/env bash
INPUT=$(cat)
# ⚠️ 必須！防止無限迴圈
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi
# ... 你的邏輯
```

---

## 17. 安全最佳實踐

1. **不要在 Hook 中記錄敏感資料**（API Key、密碼）
2. **Hook 腳本設定嚴格權限**：`chmod 750 .claude/hooks/*.sh`
3. **使用 `set -euo pipefail`** 在 bash 腳本開頭，避免靜默失敗
4. **避免在 Hook 中直接 `eval` 工具輸入**，防止注入攻擊
5. **設定合理 timeout**：簡單檢查 5-10 秒，LLM 評估 30+ 秒
6. **企業環境**：使用 `allowManagedHooksOnly` 限制只允許管理員核准的 Hook
7. **定期審查 Hook 腳本**，確認沒有過時的規則或安全漏洞
8. **將 Hook 腳本納入 Git 版控**（`.claude/settings.json` + `.claude/hooks/`）

---

## 18. 完整 settings.json 範本

以下為適合 PhyCool ASP.NET Core 開發環境的完整範本：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"{\\\"additionalContext\\\": \\\"Branch: $(git branch --show-current 2>/dev/null || echo 'N/A') | Env: Development | Project: PhyCool-PCPT\\\"}\""
          }
        ]
      }
    ],

    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/security-gate.sh\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-bash-powershell.sh\"",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-files.sh\"",
            "timeout": 5
          },
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/payment-key-protect.sh\"",
            "timeout": 5
          }
        ]
      }
    ],

    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "dotnet format \"$CLAUDE_PROJECT_DIR\" --include \"$CLAUDE_TOOL_INPUT_FILE_PATH\" --severity warn 2>/dev/null || true",
            "timeout": 60
          },
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/normalize-crlf.sh\"",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/log-changes.sh\"",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],

    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/stop-check.sh\"",
            "timeout": 120
          },
          {
            "type": "command",
            "command": "node \"%USERPROFILE%\\.claude\\hooks\\toast-notify.js\"",
            "async": true,
            "timeout": 10
          }
        ]
      }
    ],

    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"%USERPROFILE%\\.claude\\hooks\\toast-notify.js\"",
            "async": true,
            "timeout": 10
          }
        ]
      }
    ],

    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-end.sh\"",
            "async": true,
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

---

## 附錄：Hook 腳本目錄建議結構

```
.claude/
├── settings.json              ← 專案 Hook 設定（Git 版控）
├── settings.local.json        ← 個人設定（gitignore）
└── hooks/
    ├── security-gate.sh       ← 安全閘門（危險命令攔截）
    ├── protect-files.sh       ← 敏感檔案保護
    ├── payment-key-protect.sh ← 金流 API Key 保護
    ├── pre-bash-powershell.sh ← PowerShell 規範（Windows）
    ├── normalize-crlf.sh      ← 換行符正規化
    ├── log-changes.sh         ← 異動日誌
    ├── stop-check.sh          ← Stop 品質閘門
    └── session-end.sh         ← Session 結束清理

~/.claude/                     ← 全域設定
├── settings.json
└── hooks/
    └── toast-notify.js        ← Windows 通知
```

---

> **最後更新**：2026 年 5 月 | **適用版本**：Claude Code v2.1.x+
>
> 官方參考文件：https://code.claude.com/docs/zh-TW/hooks
