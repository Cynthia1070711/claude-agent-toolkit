12

# **OpenAI Codex CLI 完整使用指南 (2026 最新版)**

> **版本**: 3.0.0
> **建立日期**: 2026-08-07 11:45:00
> **更新日期**: 2026-08-07 14:30:00
> **官方文檔**: https://developers.openai.com/codex
> **GitHub**: https://github.com/openai/codex (104.5k ⭐, Apache 2.0)
> **NPM**: https://www.npmjs.com/package/@openai/codex
> **安裝器**: https://chatgpt.com/codex/install.sh

---

## **核心定位與特色**

**Codex CLI** 是 OpenAI 推出的 **輕量級編碼代理**，運行在本地終端機，提供三種使用模式：終端機 CLI、IDE 整合、桌面應用。

### **關鍵差異化優勢**

| 特性                                  | 說明                                                          |
| ------------------------------------- | ------------------------------------------------------------- |
| **三合一體驗**                  | Terminal CLI + VS Code/Cursor/Windsurf IDE + Desktop App      |
| **ChatGPT 方案整合**            | Plus/Pro/Business/Edu/Enterprise 方案直接使用                 |
| **雲端同步**                    | `codex --cloud` 推送到雲端、`codex --teleport` 跨設備接管 |
| **輕量級**                      | 單一二進位檔、無 Node.js 依賴 (Rust 編譯)                     |
| **Agent Client Protocol (ACP)** | 與 Devin、Claude Agent、OpenCode 互操作                       |
| **開源透明**                    | Apache 2.0，Rust 核心 (codex-rs)                              |

---

## **安裝與啟動**

### **原生安裝器 (推薦，自動更新)**

```bash
# macOS / Linux
curl -fsSL https://chatgpt.com/codex/install.sh | sh

# Windows PowerShell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"

# 強制使用 GitHub Releases (預設使用 releases.openai.com)
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_INSTALLER_USE_RELEASES_OPENAI_COM=false sh
$env:CODEX_INSTALLER_USE_RELEASES_OPENAI_COM='false'; irm https://chatgpt.com/codex/install.ps1 | iex
```

### **套件管理器安裝**

```bash
# NPM
npm install -g @openai/codex

# Homebrew (macOS/Linux)
brew install --cask codex
```

### **手動下載 (GitHub Releases)**

```bash
# https://github.com/openai/codex/releases/latest

# macOS Apple Silicon
codex-aarch64-apple-darwin.tar.gz

# macOS Intel
codex-x86_64-apple-darwin.tar.gz

# Linux x86_64 (musl)
codex-x86_64-unknown-linux-musl.tar.gz

# Linux ARM64 (musl)
codex-aarch64-unknown-linux-musl.tar.gz
```

> **解壓後重命名**: `mv codex-x86_64-unknown-linux-musl codex`

### **啟動與認證**

```bash
# 啟動互動模式
codex

# 首次運行 → 選擇 "Sign in with ChatGPT"
# 支援方案: Plus、Pro、Business、Edu、Enterprise

# API Key 模式 (需額外配置)
# 參考: https://developers.openai.com/codex/auth#sign-in-with-an-api-key
```

---

## **三種使用模式**

| 模式                   | 啟動方式                                   | 適用場景                            |
| ---------------------- | ------------------------------------------ | ----------------------------------- |
| **Terminal CLI** | `codex`                                  | 終端機原生、腳本自動化、CI/CD       |
| **IDE 整合**     | VS Code/Cursor/Windsurf Extensions         | Inline Diff、@mentions、Plan Review |
| **Desktop App**  | `codex app` 或 https://chatgpt.com/codex | 視覺化 Diff、多會話並行、排程       |

### **模式切換**

```bash
# Terminal → Desktop App
codex app

# Terminal → Web/雲端 (Teleport)
codex --cloud
codex --teleport

# Web/手機 → Terminal
codex --teleport
```

---

## **CLI 參考 (核心指令)**

### **基本用法**

```bash
# 互動模式
codex

# 非互動模式 (管道/腳本)
codex -p "解釋此代碼庫架構"

# JSON 結構化輸出
codex -p "分析測試覆蓋率" --output-format json

# 指定工作目錄
codex -c /path/to/project

# 桌面應用
codex app

# 雲端同步
codex --cloud          # 推送到雲端繼續
codex --teleport       # 跨設備接管會話
```

### **參數完整表**

| 參數                | 縮寫   | 說明                                       |
| ------------------- | ------ | ------------------------------------------ |
| `-p, --prompt`    |        | 非互動模式提示詞                           |
| `-c, --cwd`       |        | 工作目錄                                   |
| `--output-format` |        | `text` \| `json`                       |
| `--model`         |        | 指定模型 (gpt-4o, gpt-4.1, o1, o3-mini 等) |
| `--approval-mode` |        | `auto` \| `manual` \| `never`        |
| `--cloud`         |        | 推送到雲端                                 |
| `--teleport`      |        | 跨設備接管                                 |
| `--app`           |        | 啟動桌面應用                               |
| `--version`       |        | 顯示版本                                   |
| `--help`          | `-h` | 顯示說明                                   |

---

## **認證與方案**

### **ChatGPT 方案整合 (推薦)**

```bash
codex
# 選擇 "Sign in with ChatGPT"
# 自動檢測方案權益
```

| 方案                 | Codex 存取 | 模型                         | 適用對象   |
| -------------------- | ---------- | ---------------------------- | ---------- |
| **Plus**       | ✅         | GPT-4o、GPT-4.1、o1、o3-mini | 個人開發者 |
| **Pro**        | ✅ 優先    | 所有模型、更高限額           | 專業開發者 |
| **Business**   | ✅         | 團隊管理、審計日誌           | 團隊       |
| **Enterprise** | ✅ 專用    | 專用算力、SLA、合規          | 企業       |
| **Edu**        | ✅         | 教學優化                     | 教育機構   |

### **API Key 模式 (進階)**

```bash
# 需在 OpenAI Platform 建立 API Key
# 參考: https://developers.openai.com/codex/auth#sign-in-with-an-api-key
export OPENAI_API_KEY="sk-..."
codex
```

---

## **核心功能**

### **1. Agentic Coding Loop**

```
用戶指令 → 規劃 → 工具執行 (Read/Write/Edit/Bash/Grep/Glob/Task) → 驗證 → 迭代
```

**支援工具**: 完整檔案操作、Shell 執行、搜尋、Git 操作、Web Fetch

### **2. 原生 Git 整合**

```bash
# 互動模式中
codex "提交我的變更，撰寫描述性訊息"

# 自動: 暫存 → Commit Message → 分支 → PR
```

### **3. 雲端同步與 Teleport**

```bash
# 長時間任務推送雲端
codex --cloud "重構整個認證模組，採用 JWT + Refresh Token"

# 手機/另一台電腦接管
codex --teleport

# 狀態查看
codex --status
```

### **4. Desktop App 功能**

```bash
codex app
# 或訪問 https://chatgpt.com/codex
```

| 功能                  | 說明                     |
| --------------------- | ------------------------ |
| **視覺化 Diff** | 左右對比、行內編輯       |
| **多會話並行**  | 標籤頁管理多個代理任務   |
| **排程任務**    | 週期性 PR 審查、依賴掃描 |
| **會話歷史**    | 完整對話記錄、搜尋、匯出 |

---

## **IDE 整合**

### **VS Code / Cursor / Windsurf**

```bash
# VS Code Marketplace: "Codex" (OpenAI 官方)
# Cursor: 內建支援
# Windsurf/Devin Desktop: 內建支援
```

| 功能                           | 說明                         |
| ------------------------------ | ---------------------------- |
| **Inline Diff**          | 編輯器內直接顯示代理變更     |
| **@mentions**            | `@codex 重構這個函數`      |
| **Plan Review**          | 代理執行前展示計劃、人工確認 |
| **Conversation History** | 側邊欄查看歷史對話           |

---

## **配置檔**

### **專案配置 (AGENTS.md)**

```markdown
# AGENTS.md (專案根目錄，Codex 讀取)

## 專案規範
- Package Manager: pnpm
- API 標準: RFC 7807 ProblemDetails
- 日期時間: UTC 儲存，顯示 Asia/Taipei

## 架構決策
- ADR-ARCH-001: Editor v2.0 (CanvasJson V2, AssetService, JSON Patch)
- ADR-TZ-001: 時區處理

## 開發指令
- Build: `pnpm run build`
- Test: `pnpm run test`
- Lint: `pnpm run lint`
- Typecheck: `pnpm run typecheck`
```

### **環境變數**

```bash
# API Key (非 ChatGPT 方案時)
export OPENAI_API_KEY="sk-..."

# 組織 ID (Enterprise)
export OPENAI_ORG_ID="org-..."
```

---

## **模型選擇**

| 模型                   | 適用場景                | 方案需求 |
| ---------------------- | ----------------------- | -------- |
| **GPT-4o**       | 平衡速度/品質、日常開發 | Plus+    |
| **GPT-4.1**      | 長上下文、大代碼庫      | Plus+    |
| **GPT-4.1-mini** | 快速任務、成本敏感      | Plus+    |
| **o1**           | 複雜推理、數學、科學    | Pro      |
| **o1-pro**       | 最強推理、極複雜任務    | Pro      |
| **o3-mini**      | 快速推理、程式碼生成    | Plus+    |
| **o4-mini**      | 輕量推理                | Plus+    |

```bash
# 指定模型
codex --model gpt-4.1

# 互動中切換
/model gpt-4o
```

---

## **自動化與 CI/CD**

### **GitHub Actions 整合**

```yaml
# .github/workflows/codex-review.yml
name: Codex Code Review
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Codex Review
        uses: openai/codex-action@v1
        with:
          prompt: |
            審查此 PR：
            1. 程式碼品質與安全性
            2. 效能與架構一致性
            3. 測試覆蓋率
          openai_api_key: ${{ secrets.OPENAI_API_KEY }}
```

### **非互動模式腳本**

```bash
# PR 審查自動化
git diff main --name-only | codex -p "審查變更檔案的安全性、效能問題" --output-format json

# 翻譯自動化
codex -p "將新字串翻譯為繁體中文，建立 PR" --output-format json

# 批次操作
find . -name "*.ts" -exec codex -p "為此檔案添加 JSDoc 註解" \;
```

---

## **最佳實踐**

### **1. AGENTS.md 撰寫**

- 祈使句："使用 pnpm" 而非 "建議使用"
- 具體規範："RFC 7807" 而非 "標準錯誤格式"
- 分類清單：專案規範 / 架構決策 / 開發指令

### **2. 成本控制**

```bash
# 監控使用量
codex -p "分析專案" --output-format json | jq '.usage'

# 方案限額查看
# ChatGPT Settings → Usage
```

### **3. 常用工作流**

```bash
# 功能開發
codex "實作用戶認證：JWT + Refresh Token、登入/登出、Token 刷新"

# Bug 修復
codex "修復: 用戶回報登入後 Token 1 小時過期需重新登入"

# 程式碼審查
codex "審查 PR #123：安全性、N+1 查詢、錯誤處理"

# 測試生成
codex "為 AuthModule 撰寫單元測試，覆蓋率目標 90%"

# 重構
codex "重構 OrderService：CQRS 讀寫分離、事件溯源"
```

---

## **ACP (Agent Client Protocol) 整合**

Codex CLI 支援 **Agent Client Protocol**，可與其他代理互操作：

| 代理                     | ACP 支援 | 整合方式         |
| ------------------------ | -------- | ---------------- |
| **Devin Desktop**  | ✅       | 統一 Spaces 管理 |
| **Claude Agent**   | ✅       | 代理團隊協作     |
| **OpenCode/Crush** | ✅       | 跨工具調度       |
| **Cascade**        | ✅       | 統一介面         |

```bash
# ACP 客戶端不需獨立安裝
# 透過 Desktop App 或 IDE 整合使用
```

---

## **故障排除**

| 問題          | 解決方案                                                        |
| ------------- | --------------------------------------------------------------- |
| 安裝失敗      | 檢查網路、嘗試`CODEX_INSTALLER_USE_RELEASES_OPENAI_COM=false` |
| 認證失敗      | `codex auth logout` → 重新登入 ChatGPT                       |
| 模型回應慢    | 切換較輕量模型 (`--model gpt-4o-mini`)、減少上下文            |
| 權限被拒      | 檢查方案權益、Enterprise 需聯繫銷售                             |
| Teleport 失敗 | 確認雲端同步完成、檢查網路連線                                  |

---

## **資源連結**

- **官方文檔**: https://developers.openai.com/codex
- **GitHub**: https://github.com/openai/codex
- **安裝器**: https://chatgpt.com/codex/install.sh
- **Desktop App**: https://chatgpt.com/codex
- **IDE 整合**: https://developers.openai.com/codex/ide
- **認證指南**: https://developers.openai.com/codex/auth
- **更新日誌**: https://github.com/openai/codex/blob/main/CHANGELOG.md
- **定價**: https://help.openai.com/en/articles/11369540-codex-in-chatgpt
- **ACP 協議**: https://github.com/agent-client-protocol/acp
