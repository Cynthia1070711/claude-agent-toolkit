# **Claude Code 完整使用指南 (2026 最新版)**

> **版本**: 3.0.0
> **建立日期**: 2026-08-07 11:45:00
> **更新日期**: 2026-08-07 14:30:00

---



## **核心定位與特色**

Claude Code 是 Anthropic 推出的 **Agentic Coding Tool**，直接運行在終端機，理解整個代碼庫，通過自然語言指令執行常規任務、解釋複雜代碼、處理 Git 工作流。

### **關鍵差異化優勢**
| 特性 | 說明 |
|------|------|
| **Agentic Loop** | 自主規劃 → 執行工具 → 驗證結果 → 迭代，無需人工微管理 |
| **多介面支援** | Terminal、VS Code、JetBrains、Desktop App、Web、Mobile |
| **原生 Git 整合** | 暫存變更、撰寫 Commit、建立分支、開啟 PR |
| **MCP 協議支援** | 連接外部工具、資料源（Google Drive、Jira、Slack、自定義工具） |
| **技能/規則/Hooks** | CLAUDE.md 持久化指令、可分享技能、生命週期 Hooks |
| **子代理/團隊** | 多 Agent 並行協作、Lead Agent 協調、Agent SDK 自定義 |

---

## **安裝與啟動 (2026 推薦方式)**

### **原生安裝 (推薦，自動背景更新)**

```bash
# macOS / Linux / WSL
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex

# Windows CMD
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

### **套件管理器安裝 (需手動更新)**

```bash
# Homebrew (macOS/Linux)
brew install --cask claude-code          # 穩定版 (落後 ~1 週)
brew install --cask claude-code@latest   # 最新版

# WinGet (Windows)
winget install Anthropic.ClaudeCode

# Linux 套件管理器
# Debian/Ubuntu: apt install claude-code
# Fedora/RHEL:   dnf install claude-code
# Alpine:        apk add claude-code
```

### **啟動**

```bash
cd your-project
claude
```

> **注意**: NPM 安裝已棄用 (`npm install -g @anthropic-ai/claude-code`)，請改用原生安裝器。

---

## **模型選擇與別名 (2026 最新)**

| 別名 | 模型 | 適用場景 | Context Window |
|------|------|----------|----------------|
| `sonnet` | **Claude Sonnet 4.6** (預設) | 平衡速度/品質，日常開發 | 200K |
| `opus` | **Claude Opus 4.6** | 複雜推理、架構設計、重構 | 200K |
| `haiku` | **Claude Haiku 4.5** | 快速探索、簡單任務、成本敏感 | 200K |
| `sonnet[1m]` | Sonnet 4.6 (1M Context) | 超大代碼庫、長上下文 | **1M** |
| `opusplan` | Opus 4.6 Plan Mode | 規劃優先、複雜任務分解 | 200K |

### **模型切換方式**

```bash
# 單次指定
claude --model opus

# 環境變數設定預設
export ANTHROPIC_DEFAULT_OPUS_MODEL=1

# 互動模式中切換
/model opus
```

---

## **核心功能深度解析**

### **1. Agentic Loop 自主工作流**

```
用戶指令 → 規劃 (Plan) → 工具執行 (Tools) → 驗證 → 迭代 → 完成
```

**支援工具**: Read/Write/Edit/Bash/Grep/Glob/Task/LS/View/Patch/Diagnostics 等 15+ 內建工具

### **2. Plan Mode 規劃模式**

```bash
# 進入規劃模式
claude "重構認證模組，採用 JWT + Refresh Token"

# 或使用 opusplan 別名
claude --model opusplan "設計微服務架構遷移方案"
```

### **3. 子代理與團隊協作**

```bash
# 生成多個並行子代理
/agent "並行處理：1)寫測試 2)修 lint 3)更新文檔"

# 背景代理 (雲端持續運行)
/background "每日早上 8 點審查新 PR"

# Agent SDK 自定義代理
# 參考: https://code.claude.com/docs/en/agent-sdk/overview
```

### **4. MCP (Model Context Protocol) 整合**

```bash
# 快速啟動 MCP
/mcp

# 配置範例 (~/.claude/mcp_config.json)
{
  "mcpServers": {
    "github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]},
    "slack": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-slack"]},
    "filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]}
  }
}
```

> **MCP 註冊表**: https://github.com/modelcontextprotocol/servers

### **5. CLAUDE.md 持久化記憶**

```markdown
# CLAUDE.md (專案根目錄)

## 專案規範
- 使用 pnpm 而非 npm
- API 回應遵循 RFC 7807 ProblemDetails
- 所有日期時間使用 UTC，顯示時轉 Asia/Taipei

## 架構決策
- ADR-ARCH-001: Editor v2.0 架構
- ADR-TZ-001: 時區處理標準

## 審查清單
- [ ] 單元測試覆蓋 ≥ 80%
- [ ] 無硬編碼顏色 (使用 Design Tokens)
- [ ] 無 Base64 圖片在 CanvasJson 中
```

### **記憶層級**
| 層級 | 檔案 | 範圍 | 優先級 |
|------|------|------|--------|
| **專案** | `./CLAUDE.md` | 當前專案 | 高 |
| **用戶** | `~/.claude/CLAUDE.md` | 所有專案 | 中 |
| **自動記憶** | 內建 | 會話學習 (建構指令、除錯洞見) | 低 |

---

## **CLI 參考 (2026 最新)**

### **核心指令**

| 指令 | 說明 |
|------|------|
| `claude` | 互動模式啟動 |
| `claude -p "prompt"` | 非互動模式 (管道/腳本) |
| `claude --teleport` | 從雲端/移動端接管會話 |
| `claude --cloud` | 推送到雲端繼續執行 |
| `claude --model <model>` | 指定模型 |
| `claude --output-format json` | JSON 結構化輸出 |
| `claude --output-format stream-json` | 串流 JSON 事件 |

### **斜線命令 (Slash Commands)**

| 命令 | 功能 |
|------|------|
| `/help` | 顯示說明 |
| `/model <name>` | 切換模型 |
| `/mcp` | MCP 伺服器管理 |
| `/agent` | 子代理生成 |
| `/background` | 背景任務排程 |
| `/schedule` | 週期性任務 (Routines) |
| `/desktop` | 切換到 Desktop App |
| `/loop` | 會話內重複執行 |
| `/compact` | 手動壓縮上下文 |
| `/bug` | 回報 Bug 到 Anthropic |
| `/review` | 程式碼審查工作流 |
| `/init` | 初始化專案 CLAUDE.md |

### **鍵盤快捷鍵**

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+C` | 中斷/退出 |
| `Ctrl+L` | 清除畫面 |
| `Ctrl+R` | 歷史搜尋 |
| `Tab` | 自動完成 |
| `Esc` | 取消輸入 |
| `Option+T` / `Alt+T` | 切換 Extended Thinking |

---

## **Extended Thinking 深度思考模式**

```bash
# 啟用方式 1: 快捷鍵
# 互動模式中按 Option+T (macOS) 或 Alt+T (Windows/Linux)

# 啟用方式 2: 配置
export MAX_THINKING_TOKENS=50000

# 啟用方式 3: ultrathink 關鍵字
claude "ultrathink: 設計高可用分散式系統架構"
```

**Token 成本**: Thinking tokens 計費但享有 **Prompt Caching 90% 折扣**

---

## **Prompt Caching 提示詞快取**

### **自動快取觸發條件**
- 提示詞 ≥ 1,024 tokens (Sonnet/Opus) 或 ≥ 2,048 tokens (Haiku)
- 相同前綴的重複請求

### **控制環境變數**

```bash
# 完全禁用
export DISABLE_PROMPT_CACHING=1

# 僅禁用特定模型
export DISABLE_PROMPT_CACHING_HAIKU=1
export DISABLE_PROMPT_CACHING_SONNET=1
export DISABLE_PROMPT_CACHING_OPUS=1
```

### **成本優化**
| 情況 | 成本 |
|------|------|
| 快取命中 | **原價 10%** (90% 折扣) |
| 快取未命中 | 原價 100% (寫入快取) |
| 存儲費用 | $0.001/百萬 tokens/小時 |

---

## **設定檔配置 (~/.claude/settings.json)**

```json
{
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "Task"],
    "deny": ["Bash(rm -rf)", "Bash(git push --force)"]
  },
  "hooks": {
    "PostToolUse": [
      {"matcher": "Edit|Write", "command": "pnpm run format:check"}
    ],
    "PreToolUse": [
      {"matcher": "Bash(git commit)", "command": "pnpm run lint"}
    ]
  },
  "mcpServers": {
    "github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]}
  },
  "env": {
    "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
  }
}
```

### **Hooks 生命週期事件**

| 事件 | 觸發時機 | 用途 |
|------|----------|------|
| `PreToolUse` | 工具執行前 | 檢查、驗證、阻擋 |
| `PostToolUse` | 工具執行後 | 格式化、測試、通知 |
| `UserPromptSubmit` | 用戶提交提示 | 注入上下文、記錄 |
| `SessionStart` | 會話開始 | 載入配置、恢復狀態 |
| `SessionEnd` | 會話結束 | 清理、保存 |
| `PreCompact` | 壓縮前 | 快照、備份 |
| `Stop` | 用戶按 Ctrl+C | 優雅關閉 |

---

## **多介面無縫切換**

| 介面 | 啟動方式 | 特色 |
|------|----------|------|
| **Terminal** | `claude` | 完整功能、腳本自動化 |
| **VS Code** | Extensions: `anthropic.claude-code` | Inline Diff、@mentions、Plan Review |
| **JetBrains** | Marketplace: `Claude Code` | IntelliJ/PyCharm/WebStorm 整合 |
| **Desktop App** | 下載: claude.ai/api/desktop/... | 視覺化 Diff、多會話並行、排程 |
| **Web** | https://claude.ai/code | 無本地環境、雲端長時間任務 |
| **Mobile** | Claude iOS/Android App | 遠端控制、Dispatch 任務 |

### **跨介面傳遞**

```bash
# Terminal → Desktop
/desktop

# Terminal → Web (Teleport)
claude --teleport

# Web/手機 → Terminal
claude --cloud
```

---

## **企業級功能**

### **GitHub Actions 整合**

```yaml
# .github/workflows/claude-review.yml
name: Claude Code Review
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: "審查此 PR 的安全性、效能、架構一致性"
```

### **Slack 整合**

```bash
# 在 Slack 提及 @Claude
@Claude 請審查 #123 PR 的資料庫遷移腳本
```

### **排程任務 (Routines)**

```bash
# 雲端排程 (電腦關機也執行)
/schedule "每日 08:00 執行: 檢查 CI 失敗、分析錯誤、建立修復 PR"

# 桌面排程 (本地檔案存取)
# Desktop App → Scheduled Tasks
```

---

## **最佳實踐與常見模式**

### **1. CLAUDE.md 撰寫原則**
- 使用 **祈使句**: "使用 pnpm" 而非 "建議使用 pnpm"
- **具體化**: "API 回應遵循 RFC 7807" 而非 "遵循標準"
- **分類清單**: 專案規範 / 架構決策 / 審查清單

### **2. 成本控制**
```bash
# 監控 Token 使用
claude -p "分析此專案架構" --output-format json | jq '.usage'

# 設定成本上限 (需 Anthropic Console)
# Console → Organization → Usage Limits
```

### **3. 安全與權限**
```json
// settings.json
{
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash(git *)", "Bash(pnpm *)"],
    "deny": ["Bash(rm -rf)", "Bash(sudo)", "Bash(curl | sh)"]
  }
}
```

### **4. 常用工作流模式**

```bash
# 功能開發
claude "實作用戶認證：JWT + Refresh Token、登入/登出、Token 刷新"

# Bug 修復
claude "修復: 用戶回報登入後 Token 1 小時過期需重新登入"

# 重構
claude "重構 OrderService：拆分為 OrderCommand/OrderQuery、引入 CQRS"

# 程式碼審查
claude "審查 PR #456：關注安全性、N+1 查詢、錯誤處理"

# 測試生成
claude "為 AuthModule 撰寫單元測試，覆蓋率目標 90%"

# 文檔同步
claude "根據程式碼更新 API 文檔 (OpenAPI/Swagger)"
```

---

## **故障排除**

| 問題 | 解決方案 |
|------|----------|
| 安裝失敗 (curl 403) | 參考 [Troubleshoot Installation](https://code.claude.com/docs/en/troubleshoot-install) |
| 模型回應緩慢 | 檢查網路、嘗試 `--model haiku`、減少上下文 |
| 上下文超出限制 | 使用 `/compact`、啟用 auto-compact、切換 1M 模型 |
| MCP 連接失敗 | 檢查 `claude mcp list`、驗證伺服器命令、查看 logs |
| 權限被拒 | 檢查 `settings.json` deny 列表、使用 `/permissions` |

---

## **版本歷程與更新頻道**

| 頻道 | 更新頻率 | 適用場景 |
|------|----------|----------|
| **原生安裝** | 背景自動更新 | 生產環境、日常開發 |
| **Homebrew stable** | ~1 週/次 | 偏好穩定、可控制升級 |
| **Homebrew latest** | 即時 | 嘗鮮新功能 |
| **NPM (棄用)** | 不再更新 | **請遷移至原生安裝** |

---

## **資源連結**

- **官方文檔**: https://code.claude.com/docs/en/overview
- **快速入門**: https://code.claude.com/docs/en/quickstart
- **CLI 參考**: https://code.claude.com/docs/en/cli-reference
- **MCP 快速入門**: https://code.claude.com/docs/en/mcp-quickstart
- **技能指南**: https://code.claude.com/docs/en/skills
- **Hooks 指南**: https://code.claude.com/docs/en/hooks
- **GitHub Actions**: https://code.claude.com/docs/en/github-actions
- **Discord 社群**: https://anthropic.com/discord
- **變更日誌**: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
- **定價**: https://claude.com/pricing
