# **Gemini CLI 完整使用指南 (2026 最新版)**

> **版本**: 3.0.0
> **建立日期**: 2026-08-07 11:45:00
> **更新日期**: 2026-08-07 14:30:00

---



## **核心定位與特色**

Gemini CLI 是 Google 開源的 **終端機 AI Agent**，將 Gemini 模型能力直接帶入命令列，提供輕量級、直接的模型存取路徑。

### **關鍵差異化優勢**
| 特性 | 說明 |
|------|------|
| **免費額度慷慨** | 60 req/min、1,000 req/day (Google 帳號) / 1,000 req/day (API Key) |
| **1M Token Context** | Gemini 3 模型支援 1M 上下文窗口 |
| **內建工具豐富** | Google Search Grounding、檔案操作、Shell、Web Fetch |
| **MCP 客戶端** | 標準 MCP 協議支援，可連接外部工具 |
| **開源透明** | Apache 2.0，社群驅動，可自架 |
| **多認證方式** | OAuth / API Key / Vertex AI 企業級 |

---

## **安裝與啟動**

### **快速安裝 (推薦)**

```bash
# 即時執行 (無安裝)
npx @google/gemini-cli

# 全域安裝
npm install -g @google/gemini-cli

# Homebrew (macOS/Linux)
brew install gemini-cli

# MacPorts (macOS)
sudo port install gemini-cli

# Anaconda (受限環境)
conda create -y -n gemini_env -c conda-forge nodejs
conda activate gemini_env
npm install -g @google/gemini-cli
```

### **發布頻道**

| 頻道 | 發布時間 | 適用場景 | 安裝指令 |
|------|----------|----------|----------|
| **Preview** | 每週二 UTC 23:59 | 測試新功能、回饋 | `npm install -g @google/gemini-cli@preview` |
| **Stable** | 每週二 UTC 20:00 | 生產環境 (推薦) | `npm install -g @google/gemini-cli@latest` |
| **Nightly** | 每日 UTC 00:00 | 前沿開發、風險自負 | `npm install -g @google/gemini-cli@nightly` |

### **啟動**

```bash
# 當前目錄
gemini

# 包含多目錄
gemini --include-directories ../lib,../docs

# 指定模型
gemini -m gemini-2.5-flash

# 非互動模式 (腳本)
gemini -p "解釋此代碼庫架構" --output-format json

# 串流 JSON 事件
gemini -p "執行測試並部署" --output-format stream-json
```

---

## **認證方式 (三選一)**

### **Option 1: Google OAuth (推薦個人/付費 Code Assist)**

```bash
gemini
# 選擇 "Sign in with Google" → 瀏覽器授權流程

# 企業 Code Assist 需設定專案
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
gemini
```

| 方案 | 額度 | 模型 | 適用對象 |
|------|------|------|----------|
| **免費 (個人 Google)** | 60 rpm / 1,000 rpd | Gemini 3 (1M context) | 個人開發者 |
| **Code Assist 付費** | 依授權 | Gemini 3 + 企業功能 | 團隊/企業 |

### **Option 2: Gemini API Key (需特定模型控制)**

```bash
# 取得 Key: https://aistudio.google.com/apikey
export GEMINI_API_KEY="YOUR_API_KEY"
gemini
```

| 方案 | 額度 | 模型選擇 | 計費 |
|------|------|----------|------|
| 免費 | 1,000 req/day | Flash/Pro 混合 | 免費 |
| 付費 | 依用量 | 可指定具體模型 | 用量計費 |

### **Option 3: Vertex AI (企業生產)**

```bash
export GOOGLE_API_KEY="YOUR_API_KEY"
export GOOGLE_GENAI_USE_VERTEXAI=true
gemini
```

| 特性 | 說明 |
|------|------|
| 企業級安全合規 | ✅ |
| 更高速率限制 | ✅ |
| 整合 Google Cloud 基礎設施 | ✅ |
| 計費帳戶 | 必需 |

---

## **配置系統 (分層優先級)**

| 優先級 | 位置 | 範圍 | 用途 |
|--------|------|------|------|
| 1 (最高) | 運行時參數 `--model`, `--include-directories` | 單次執行 | 臨時覆蓋 |
| 2 | 專案 `.gemini/settings.json` | 專案 | 團隊共享配置 |
| 3 | 用戶 `~/.gemini/settings.json` | 全域 | 個人偏好 |
| 4 | 系統 `/etc/gemini-cli/system-defaults.json` | 全機器 | IT 管理 |
| 5 (最低) | 內建預設 | 所有 | 基準值 |

### **專案配置範例 (.gemini/settings.json)**

```json
{
  "theme": "dark",
  "model": "gemini-2.5-pro",
  "includeDirectories": ["src", "tests", "docs"],
  "fileFiltering": {
    "enableFuzzySearch": true,
    "customIgnoreFilePaths": [".geminiignore", ".gitignore"]
  },
  "autoConfigureMemory": true,
  "checkpointing": {
    "enabled": true,
    "intervalMinutes": 30
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

### **環境變數配置**

| 變數 | 用途 | 範例 |
|------|------|------|
| `GEMINI_API_KEY` | API Key 認證 | `sk-...` |
| `GOOGLE_CLOUD_PROJECT` | Vertex AI/Code Assist 專案 | `my-project-123` |
| `GOOGLE_GENAI_USE_VERTEXAI` | 啟用 Vertex AI | `true` |
| `GOOGLE_API_KEY` | Vertex AI API Key | `...` |

---

## **GEMINI.md 持久化上下文**

### **建立與管理**

```bash
# 互動模式中
/init                    # 自動生成專案 GEMINI.md
/memory add "專案使用 pnpm、API 遵循 RFC 7807"  # 手動添加
/memory show             # 查看當前記憶
/memory refresh          # 從代碼庫重新掃描
```

### **GEMINI.md 範本**

```markdown
# 專案上下文

## 技術棧
- Runtime: Node.js 20 + TypeScript 5.6
- Package Manager: pnpm 9
- Framework: React 18 + Vite 5
- Backend: ASP.NET Core 8

## 規範
- 所有日期時間 UTC 儲存，顯示轉 Asia/Taipei
- API 回應: RFC 7807 ProblemDetails
- 無硬編碼色彩，使用 Design Tokens (--color-*)

## 架構決策 (ADR)
- ADR-ARCH-001: Editor v2.0 (CanvasJson V2, AssetService, JSON Patch)
- ADR-TZ-001: 時區處理標準

## 開發指令
- 建置: `pnpm run build`
- 測試: `pnpm run test`
- Lint: `pnpm run lint`
- 類型檢查: `pnpm run typecheck`

## 常用指令別名
- `dev`: 啟動開發伺服器
- `test:watch`: 監看模式測試
```

### **記憶層級機制**

| 層級 | 檔案 | 生命週期 | 更新方式 |
|------|------|----------|----------|
| **專案** | `./GEMINI.md` | 專案存續 | `/memory add`、自動掃描 |
| **用戶** | `~/.gemini/GEMINI.md` | 長期 | 手動編輯 |
| **自動** | 內建 | 會話 | 對話中學習 |

---

## **核心功能深度解析**

### **1. 內建工具系統**

| 工具類別 | 工具 | 說明 |
|----------|------|------|
| **檔案系統** | `read_file`, `write_file`, `list_dir`, `glob`, `grep` | 完整檔案操作 |
| **Shell** | `run_shell_command` | 執行命令、管道、腳本 |
| **Web** | `fetch`, `search` | HTTP 請求、Google Search Grounding |
| **Git** | 內建 Git 操作 | diff、log、commit、push |

### **2. Checkpointing 會話檢查點**

```bash
# 互動命令
/checkpoint save "完成認證模組重構"
/checkpoint list
/checkpoint load <checkpoint-id>

# 自動檢查點配置
{
  "checkpointing": {
    "enabled": true,
    "intervalMinutes": 30,
    "maxCheckpoints": 10
  }
}
```

### **3. Token Caching Token 快取**

```bash
# 配置
{
  "tokenCaching": {
    "enabled": true,
    "ttlHours": 24
  }
}
```

**優點**: 重複上下文請求大幅減少 Token 消耗

### **4. MCP 伺服器整合**

```json
// .gemini/settings.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"]
    },
    "database": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "./data.db"]
    }
  }
}
```

**使用方式**:
```bash
> @github 列出我的開放 PR
> @slack 發送今日提交摘要到 #dev
> @database 查詢非活躍用戶
```

### **5. GitHub Actions 整合**

```yaml
# .github/workflows/gemini-review.yml
name: Gemini PR Review
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/run-gemini-cli@v1
        with:
          prompt: |
            審查此 PR 的：
            1. 程式碼品質與最佳實踐
            2. 潛在安全風險
            3. 效能優化建議
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

**功能**: PR 審查、Issue 分流、@gemini-cli 指派任務

---

## **CLI 參考**

### **核心參數**

| 參數 | 縮寫 | 說明 |
|------|------|------|
| `--model` | `-m` | 指定模型 (gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash) |
| `--include-directories` | `-i` | 包含額外目錄 |
| `--prompt` | `-p` | 非互動模式提示詞 |
| `--output-format` | `-f` | `text` \| `json` \| `stream-json` |
| `--checkpoint` | | 啟用檢查點 |
| `--help` | `-h` | 顯示說明 |

### **互動模式斜線命令**

| 命令 | 功能 |
|------|------|
| `/help` | 顯示所有命令 |
| `/chat` | 切換聊天模式 |
| `/memory` | 記憶管理 (add/show/refresh) |
| `/checkpoint` | 檢查點管理 (save/list/load) |
| `/tools` | 工具權限管理 |
| `/mcp` | MCP 伺服器管理 |
| `/config` | 配置查看/編輯 |
| `/theme` | 主題切換 |
| `/clear` | 清除畫面 |
| `/quit` | 退出 |

### **鍵盤快捷鍵**

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+C` | 中斷/退出 |
| `Ctrl+L` | 清除畫面 |
| `Ctrl+R` | 歷史搜尋 |
| `Tab` | 自動完成 |
| `Esc` | 取消/退出對話框 |

---

## **模型選擇指南 (2026)**

| 模型 | 適用場景 | Context | 速度 | 成本 |
|------|----------|---------|------|------|
| **gemini-2.5-pro** | 複雜推理、架構設計、重構 | 1M | 中 | 高 |
| **gemini-2.5-flash** | 日常開發、快速任務、平衡 | 1M | 快 | 低 |
| **gemini-2.0-flash** | 輕量任務、成本敏感 | 1M | 極快 | 極低 |

```bash
# 指定模型啟動
gemini -m gemini-2.5-pro

# 互動中切換
/model gemini-2.5-flash
```

---

## **進階主題**

### **Headless Mode 自動化腳本**

```bash
# 簡單回應
gemini -p "解釋此代碼庫架構"

# 結構化 JSON 輸出 (CI/CD 解析)
gemini -p "分析測試覆蓋率缺口" --output-format json | jq '.'

# 串流事件 (長時間任務監控)
gemini -p "執行完整測試套件並部署" --output-format stream-json

# 管道組合
git diff main --name-only | gemini -p "審查變更檔案的安全性問題" --output-format json
```

### **IDE 整合**

| IDE | 整合方式 |
|-----|----------|
| **VS Code** | Gemini CLI Companion Extension (側邊欄、內聯) |
| **JetBrains** | 終端機整合、外部工具配置 |
| **Neovim** | `gemini.nvim` 插件 |

### **Sandboxing 安全執行環境**

```json
{
  "sandbox": {
    "enabled": true,
    "policy": "restricted",
    "allowedCommands": ["pnpm", "git", "node", "python"],
    "deniedCommands": ["rm -rf", "sudo", "docker"]
  }
}
```

### **Trusted Folders 受信任資料夾**

```json
{
  "trustedFolders": [
    "~/projects/**",
    "/workspace/**"
  ],
  "untrustedFolderPolicy": "ask"
}
```

### **企業部署指南**

```bash
# 企業配置範例
{
  "enterprise": {
    "enforceTrustedFolders": true,
    "disableTelemetry": true,
    "allowedModels": ["gemini-2.5-pro", "gemini-2.5-flash"],
    "mcpServerWhitelist": ["github", "slack", "jira"],
    "auditLog": {
      "enabled": true,
      "destination": "cloud-logging"
    }
  }
}
```

---

## **故障排除**

| 問題 | 解決方案 |
|------|----------|
| 認證失敗 | `gemini auth logout` → 重新登入、檢查 `GOOGLE_CLOUD_PROJECT` |
| 模型回應慢 | 切換 `-m gemini-2.5-flash`、減少 `--include-directories` |
| 上下文超出 | 啟用 `/checkpoint`、使用 `/compact`、檢查 `tokenCaching` |
| MCP 連線失敗 | `gemini mcp list` 檢查狀態、驗證 `command/args`、查看除錯日誌 |
| 權限被拒 | `.gemini/settings.json` → `tools.permissions` 配置 |

### **除錯模式**

```bash
# 詳細日誌
DEBUG=gemini:* gemini

# 或
gemini --verbose
```

---

## **最佳實踐**

### **1. 專案初始化流程**
```bash
cd my-project
gemini
> /init                    # 生成 GEMINI.md
> /memory add "團隊規範..." # 添加團隊規範
> /checkpoint save "初始化完成"
```

### **2. 成本優化**
- 優先使用 `gemini-2.5-flash` (免費額度內)
- 啟用 `tokenCaching` 減少重複上下文成本
- 使用 `checkpointing` 避免長會話重複上下文
- 設定 `trustedFolders` 避免重複授權

### **3. 團隊協作**
```bash
# 共享配置提交到 Git
git add .gemini/settings.json GEMINI.md
git commit -m "chore: 添加 Gemini CLI 團隊配置"

# CI 整合
# .github/workflows/gemini.yml 參考上文 GitHub Actions 範例
```

### **4. 常用工作流**

```bash
# 功能開發
gemini -p "實作用戶認證：JWT + Refresh Token、登入/登出"

# Bug 修復
gemini -p "修復: Token 1 小時過期需重新登入" --include-directories src/auth

# 程式碼審查 (CI)
gemini -p "審查 PR 變更：安全性、效能、架構一致性" --output-format json

# 測試生成
gemini -p "為 AuthModule 撰寫單元測試，目標覆蓋率 90%"

# 文檔同步
gemini -p "根據程式碼更新 API 文檔 (OpenAPI 3.0)"

# 架構分析
gemini -p "分析此代碼庫的模組耦合度，提出解耦建議"
```

---

## **資源連結**

- **官方文檔**: https://geminicli.com/docs/
- **快速入門**: https://geminicli.com/docs/get-started
- **認證指南**: https://geminicli.com/docs/get-started/authentication
- **配置參考**: https://geminicli.com/docs/reference/configuration
- **命令參考**: https://geminicli.com/docs/reference/commands
- **工具參考**: https://geminicli.com/docs/reference/tools
- **MCP 整合**: https://geminicli.com/docs/tools/mcp-server
- **擴展開發**: https://geminicli.com/docs/extensions/writing-extensions
- **免費課程**: https://learn.deeplearning.ai/courses/gemini-cli-code-and-create-with-an-open-source-agent/
- **官方 Roadmap**: https://github.com/orgs/google-gemini/projects/11
- **更新日誌**: https://geminicli.com/docs/changelogs
- **GitHub Issues**: https://github.com/google-gemini/gemini-cli/issues
- **Discord/社群**: GitHub Discussions
- **定價**: https://cloud.google.com/gemini/docs/quotas
