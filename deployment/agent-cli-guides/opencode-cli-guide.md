# **OpenCode / Crush 完整使用指南 (2026 最新版)**

> **版本**: 3.0.0
> **建立日期**: 2026-08-07 11:45:00
> **更新日期**: 2026-08-07 14:30:00
> **狀態**: ⚠️ **原專案已歸檔 (2025-09-18)**，續作為 **Crush** 由 Charm 團隊維護
> **官方文檔**: https://github.com/charmbracelet/crush
> **原 GitHub**: https://github.com/opencode-ai/opencode (13.6k ⭐, MIT, 已歸檔)
> **新 GitHub**: https://github.com/charmbracelet/crush
> **作者**: @sachaos (原作者) + Charm 團隊

---

## **重要公告: 專案遷移**

> **⚠️ 2025-09-18 重大變更**: **OpenCode 專案已歸檔**，後續開發移至 **Crush** (Charm 團隊)
> - 原倉庫: https://github.com/opencode-ai/opencode (唯讀歸檔)
> - 新倉庫: https://github.com/charmbracelet/crush
> - 原作者 @sachaos 繼續參與開發
> - **建議**: 新專案請直接使用 **Crush**，現有 OpenCode 用戶請規劃遷移

---

## **核心定位與特色 (Crush 繼承並增強)**

**Crush (原 OpenCode)** 是強大的 **終端機 AI 編碼代理**，採用 Go + Bubble Tea TUI，提供原生終端機體驗。

### **關鍵特色 (Crush 版本)**
| 特性 | 說明 |
|------|------|
| **原生 TUI** | Bubble Tea 構建、Vim 風格鍵盤操作、多會話管理 |
| **多提供商支援** | OpenAI、Anthropic、Google、AWS Bedrock、Groq、Azure、OpenRouter、GitHub Copilot、自架模型 |
| **會話管理** | SQLite 持久化、檢查點、自動壓縮 (Auto Compact) |
| **LSP 整合** | gopls、typescript-language-server、多語言診斷 |
| **MCP 客戶端** | stdio/SSE 雙模式、工具發現、權限控制 |
| **自定義命令** | 專案/用戶層級、命名參數、子目錄組織 |
| **Agent Client Protocol (ACP)** | 與 Devin、Claude Agent、Codex 互操作 |

---

## **安裝與啟動 (Crush 版本)**

### **Crush 安裝 (推薦新專案使用)**

```bash
# 安裝腳本 (Crush)
curl -fsSL https://raw.githubusercontent.com/charmbracelet/crush/main/install | bash

# Homebrew
brew install charmbracelet/tap/crush

# Go 安裝
go install github.com/charmbracelet/crush@latest

# AUR (Arch Linux)
yay -S crush-bin
# 或
paru -S crush-bin
```

### **OpenCode 遺留安裝 (僅供現有用戶參考)**

```bash
# 原安裝腳本 (已停止更新)
curl -fsSL https://raw.githubusercontent.com/opencode-ai/opencode/refs/heads/main/install | bash

# Homebrew (舊 tap)
brew install opencode-ai/tap/opencode

# Go
go install github.com/opencode-ai/opencode@latest
```

### **啟動**

```bash
# Crush (新)
crush

# OpenCode (舊)
opencode

# 除錯模式
crush -d
opencode -d

# 指定工作目錄
crush -c /path/to/project
opencode -c /path/to/project
```

---

## **認證與模型提供商 (Crush 完整支援)**

### **環境變數配置**

| 提供商 | 環境變數 | 模型範例 |
|--------|----------|----------|
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude 4 Sonnet/Opus, 3.5/3.7 Sonnet/Haiku/Opus |
| **OpenAI** | `OPENAI_API_KEY` | GPT-4.1/4o/o1/o3/o4 系列 |
| **Google Gemini** | `GEMINI_API_KEY` | Gemini 2.5/2.0 Flash/Pro |
| **GitHub Copilot** | `GITHUB_TOKEN` | GPT-4o、Claude 3.5/3.7、Gemini 2.0/2.5、o1/o3/o4 |
| **AWS Bedrock** | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` | Claude 3.7 Sonnet |
| **Groq** | `GROQ_API_KEY` | Llama 4、QWEN QWQ-32b、DeepSeek R1 |
| **Azure OpenAI** | `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_API_VERSION` | GPT-4.1/o1/o3/o4 系列 |
| **Google VertexAI** | `VERTEXAI_PROJECT` + `VERTEXAI_LOCATION` | Gemini 2.5/2.0 |
| **OpenRouter** | `OPENROUTER_API_KEY` | 統一介面存取 100+ 模型 |
| **自架模型** | `LOCAL_ENDPOINT` | Ollama、vLLM、TGI 等 |

### **GitHub Copilot 設定 (實驗性)**

```bash
# 前提: 啟用 GitHub Settings → Copilot Chat
# 任一認證方式:
# 1. VS Code Copilot Chat Extension
# 2. GitHub CLI: gh auth login
# 3. Neovim copilot.vim/copilot.lua

# Token 位置 (自動偵測):
# ~/.config/github-copilot/hosts.json
# ~/.config/github-copilot/apps.json
# $XDG_CONFIG_HOME/github-copilot/

# 或手動設定
export GITHUB_TOKEN="gho_..."
```

### **配置檔 (~/.config/crush/crush.json 或 ./.crush.json)**

```json
{
  "data": {
    "directory": ".crush"
  },
  "providers": {
    "anthropic": {"apiKey": "sk-ant-...", "disabled": false},
    "openai": {"apiKey": "sk-...", "disabled": false},
    "gemini": {"apiKey": "...", "disabled": false},
    "copilot": {"disabled": false},
    "groq": {"apiKey": "gsk_...", "disabled": false},
    "openrouter": {"apiKey": "sk-or-...", "disabled": false}
  },
  "agents": {
    "coder": {"model": "claude-3.7-sonnet", "maxTokens": 5000},
    "task": {"model": "claude-3.7-sonnet", "maxTokens": 5000},
    "title": {"model": "claude-3.7-sonnet", "maxTokens": 80}
  },
  "shell": {"path": "/bin/zsh", "args": ["-l"]},
  "mcpServers": {
    "github": {"type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]}
  },
  "lsp": {
    "go": {"disabled": false, "command": "gopls"},
    "typescript": {"disabled": false, "command": "typescript-language-server", "args": ["--stdio"]}
  },
  "autoCompact": true,
  "debug": false
}
```

### **Shell 配置**

```json
{
  "shell": {
    "path": "/bin/zsh",
    "args": ["-l"]
  }
}
```

---

## **核心功能 (Crush 繼承並增強)**

### **1. 互動式 TUI (Terminal User Interface)**

```
┌─ Sessions ────────────────────────────────────┐
│  ● feat/auth-jwt     (active)                 │
│  ○ fix/token-expiry                           │
│  ○ refactor/order-cqrs                        │
└───────────────────────────────────────────────┘
┌─ Chat ────────────────────────────────────────┐
│  > 實作 JWT 認證...                            │
│  ● Reading src/auth/...                       │
│  ● Writing src/auth/jwt.ts                    │
│  ● Running tests...                           │
└───────────────────────────────────────────────┘
┌─ Editor (Vim 模式) ───────────────────────────┐
│  fn authenticate(token: string): User {       │
│      // 輸入中...                              │
│  }                                            │
└───────────────────────────────────────────────┘
```

### **2. 全域快捷鍵**

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+C` | 退出 / 取消生成 |
| `Ctrl+?` / `?` | 切換說明對話框 |
| `Ctrl+L` | 查看日誌 |
| `Ctrl+A` | 切換會話 |
| `Ctrl+K` | 開啟命令對話框 |
| `Ctrl+O` | 切換模型選擇 |
| `Esc` | 關閉對話框/返回上一模式 |

### **3. 聊天頁快捷鍵**

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+N` | 新建會話 |
| `Ctrl+X` | 取消當前操作 |
| `i` | 聚焦編輯器 |
| `Esc` | 退出編輯模式 |

### **4. 編輯器快捷鍵 (Vim 風格)**

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+S` / `Enter` | 發送訊息 |
| `Ctrl+E` | 開啟外部編輯器 (`$EDITOR`) |
| `Esc` | 模糊編輯器、聚焦訊息 |

### **5. 會話對話框**

| 快捷鍵 | 動作 |
|--------|------|
| `↑`/`k` / `↓`/`j` | 上一個/下一個會話 |
| `Enter` | 選擇會話 |
| `Esc` | 關閉 |

### **6. 模型對話框**

| 快捷鍵 | 動作 |
|--------|------|
| `↑`/`k` / `↓`/`j` | 移動選擇 |
| `←`/`h` / `→`/`l` | 切換提供商 |
| `Esc` | 關閉 |

### **7. 權限對話框**

| 快捷鍵 | 動作 |
|--------|------|
| `←`/`→`/`Tab` | 切換選項 |
| `Enter`/`Space` | 確認 |
| `a` | 允許 (當前) |
| `A` | 允許 (整個會話) |
| `d` | 拒絕 |

---

## **AI 助手工具系統**

### **檔案與代碼工具**

| 工具 | 說明 | 參數 |
|------|------|------|
| `glob` | 模式查找檔案 | `pattern` (必填), `path` (選填) |
| `grep` | 內容搜尋 | `pattern` (必填), `path`, `include`, `literal_text` |
| `ls` | 列出目錄 | `path`, `ignore` |
| `view` | 查看檔案 | `file_path` (必填), `offset`, `limit` |
| `write` | 寫入檔案 | `file_path`, `content` (必填) |
| `edit` | 編輯檔案 | 多參數編輯操作 |
| `patch` | 應用補丁 | `file_path`, `diff` (必填) |
| `diagnostics` | 診斷資訊 (LSP) | `file_path` (選填) |

### **其他工具**

| 工具 | 說明 | 參數 |
|------|------|------|
| `bash` | 執行 Shell 命令 | `command` (必填), `timeout` |
| `fetch` | HTTP 請求 | `url`, `format`, `timeout` |
| `sourcegraph` | 公開代碼搜尋 | `query`, `count`, `context_window` |
| `agent` | 子任務代理 | `prompt` (必填) |

---

## **進階功能**

### **1. Auto Compact 自動壓縮**

```json
{
  "autoCompact": true
}
```

**機制**:
- 監控 Token 使用率
- 達到模型 Context Window 95% 時自動觸發
- 生成摘要 → 建立新會話 → 保留關鍵上下文
- 避免 "out of context" 錯誤

### **2. 自定義命令**

**建立位置**:
```
# 用戶命令 (user: 前綴)
~/.config/crush/commands/           # Linux/macOS
~/.crush/commands/                  # 兼容舊版

# 專案命令 (project: 前綴)
<PROJECT_DIR>/.crush/commands/
```

**範例: `~/.config/crush/commands/prime-context.md`**

```markdown
# 專案上下文初始化

RUN git ls-files
READ README.md
READ AGENTS.md
```

**命名參數** (格式: `$NAME`):

```markdown
# 獲取 Issue 上下文 $ISSUE_NUMBER

RUN gh issue view $ISSUE_NUMBER --json title,body,comments
RUN git grep --author="$AUTHOR_NAME" -n .
RUN grep -R "$SEARCH_PATTERN" $DIRECTORY
```

**執行**: `Ctrl+K` → 選擇 `user:prime-context` → 輸入參數 → `Enter`

### **3. MCP (Model Context Protocol)**

**配置**:

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    },
    "web-search": {
      "type": "sse",
      "url": "https://api.example.com/mcp",
      "headers": {"Authorization": "Bearer token"}
    }
  }
}
```

**支援傳輸**: `stdio` (本地進程)、`SSE` (遠端 HTTP)

### **4. LSP (Language Server Protocol)**

**配置**:

```json
{
  "lsp": {
    "go": {"disabled": false, "command": "gopls"},
    "typescript": {"disabled": false, "command": "typescript-language-server", "args": ["--stdio"]},
    "python": {"disabled": false, "command": "pyright-langserver", "args": ["--stdio"]},
    "rust": {"disabled": false, "command": "rust-analyzer"}
  }
}
```

**AI 可用功能**: `diagnostics` 工具 (錯誤檢查、建議修復)

### **5. 非互動模式 (腳本自動化)**

```bash
# 單次提示
crush -p "解釋 Go 中 context 套件用法"

# JSON 輸出
crush -p "分析測試覆蓋率" -f json

# 靜默模式 (無 spinner)
crush -p "快速查詢" -q

# 輸出格式
crush -p "..." -f text   # 純文字 (預設)
crush -p "..." -f json   # JSON 物件
```

---

## **命令列參數完整表**

| 參數 | 縮寫 | 說明 |
|------|------|------|
| `--help` | `-h` | 顯示說明 |
| `--debug` | `-d` | 除錯模式 |
| `--cwd` | `-c` | 工作目錄 |
| `--prompt` | `-p` | 非互動模式提示詞 |
| `--output-format` | `-f` | `text` \| `json` |
| `--quiet` | `-q` | 隱藏 spinner |

---

## **從 OpenCode 遷移到 Crush**

### **遷移清單**

| 項目 | OpenCode | Crush | 遷移動作 |
|------|----------|-------|----------|
| **執行檔** | `opencode` | `crush` | 更新腳本、別名、CI/CD |
| **配置目錄** | `~/.config/opencode/` | `~/.config/crush/` | 重命名目錄、更新路徑 |
| **專案配置** | `.opencode.json` | `.crush.json` | 重命名檔案 |
| **資料目錄** | `~/.opencode/` | `~/.crush/` | 遷移 SQLite DB |
| **命令目錄** | `~/.config/opencode/commands/` | `~/.config/crush/commands/` | 移動檔案 |
| **MCP 配置** | 相容 | 相容 | 無需變更 |
| **LSP 配置** | 相容 | 相容 | 無需變更 |

### **資料遷移腳本**

```bash
#!/bin/bash
# migrate-opencode-to-crush.sh

# 1. 配置目錄
mv ~/.config/opencode ~/.config/crush

# 2. 專案配置
find . -name ".opencode.json" -exec sh -c 'mv "$1" "${1%.opencode.json}.crush.json"' _ {} \;

# 3. 資料目錄 (SQLite)
if [ -d ~/.opencode ]; then
  mv ~/.opencode ~/.crush
fi

# 4. 更新 shell 別名
echo "alias opencode='crush'" >> ~/.bashrc
echo "alias opencode='crush'" >> ~/.zshrc

echo "遷移完成！請重新啟動終端機。"
```

---

## **最佳實踐 (Crush 版本)**

### **1. 模型選擇策略**

| 任務類型 | 推薦模型 | 提供商 |
|----------|----------|--------|
| **日常編碼** | Claude 3.7 Sonnet | Anthropic |
| **複雜推理/架構** | Claude 4 Opus / GPT-4.1 | Anthropic / OpenAI |
| **快速任務/成本** | Gemini 2.5 Flash / GPT-4.1-mini | Google / OpenAI |
| **開源/自架** | Llama 4 / QWEN | Groq / OpenRouter / Local |
| **企業/合規** | Vertex AI Gemini / Azure OpenAI | Google Cloud / Azure |

### **2. 會話管理**

```bash
# 每個功能一個會話
crush -c /project/feat/auth-jwt

# 定期檢查點
# 互動中: Ctrl+K → "Compact Session" (手動觸發)

# 自動壓縮已啟用 (預設)
# 達到 95% Context Window 時自動摘要
```

### **3. 團隊協作**

```bash
# 共享專案配置
git add .crush.json .crush/commands/
git commit -m "chore: 添加 Crush 團隊配置"

# 共享自定義命令
mkdir -p .crush/commands
# team:deploy.md, team:review.md 等
```

### **4. 常用工作流**

```bash
# 功能開發
crush -p "實作 JWT 認證：Access + Refresh Token、登入/登出"

# Bug 修復
crush -p "修復: Token 1小時過期需重新登入" -c src/auth

# 程式碼審查 (CI)
crush -p "審查 PR 變更：安全性、效能、架構" -f json

# 測試生成
crush -p "為 AuthModule 撰寫單元測試，覆蓋率 90%"

# 重構
crush -p "重構 OrderService：CQRS + 事件溯源"

# 架構分析
crush -p "分析模組耦合度，提出解耦建議"
```

---

## **故障排除**

| 問題 | 解決方案 |
|------|----------|
| 二進位檔不存在 | 重新安裝 `curl -fsSL .../crush/install \| bash` |
| API Key 無效 | 檢查環境變數、提供商配額、Key 權限 |
| 模型回應慢 | 切換較輕量模型、減少 `--include-directories` |
| LSP 不工作 | 檢查 `gopls`/`typescript-language-server` 已安裝、PATH 正確 |
| MCP 連線失敗 | `crush mcp list` 檢查、驗證命令/參數、查看 debug 日誌 |
| Auto Compact 異常 | 設定 `"autoCompact": false` 暫停、手動 `Compact Session` |
| 權限彈窗卡住 | `A` 允許整個會話、檢查 `.crush.json` 權限配置 |

### **除錯模式**

```bash
crush -d                    # 除錯日誌
DEBUG=crush:* crush         # 詳細日誌 (環境變數)
```

---

## **資源連結**

- **Crush 官方**: https://github.com/charmbracelet/crush
- **OpenCode 歸檔**: https://github.com/opencode-ai/opencode
- **Charm 團隊**: https://github.com/charmbracelet
- **Bubble Tea (TUI 框架)**: https://github.com/charmbracelet/bubbletea
- **安裝腳本**: https://raw.githubusercontent.com/charmbracelet/crush/main/install
- **ACP 協議**: https://github.com/agent-client-protocol/acp
- **MCP 規範**: https://github.com/modelcontextprotocol/specification
- **LSP 規範**: https://microsoft.github.io/language-server-protocol/