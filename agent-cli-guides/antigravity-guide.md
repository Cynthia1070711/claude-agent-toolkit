# **Google Antigravity (AGY) 完整使用指南 (2026 最新版)**

> **版本**: 3.0.0
> **建立日期**: 2026-08-07 11:45:00
> **更新日期**: 2026-08-07 14:30:00

---



## **重要更新: 品牌更名**

> **⚠️ 2026 重大變更**: **Windsurf IDE 已更名為 Devin Desktop** (Cognition 平台)
> - 官方公告: https://windsurf.com/blog/windsurf-is-now-devin-desktop
> - 現有用戶透過 OTA 更新自動遷移，方案、定價、擴充套件、設定完整保留
> - 僅名稱與品牌變更，核心 IDE 體驗不變
> - **CLI 別名**: `agy` = **Antigravity/Devin Desktop CLI** (非獨立工具)

---

## **核心定位與特色**

**Devin Desktop (原 Windsurf/Antyigravity)** 是 **Agent-First IDE** - 為每位工程師提供代理團隊的命令中心。

### **關鍵差異化優勢**
| 特性 | 說明 |
|------|------|
| **Agent Command Center** | Spaces、看板視圖、多代理管理前置 |
| **全功能 IDE** | 語法高亮、自動完成、除錯工具內建 |
| **Supercomplete** | 預測下一個思考，不只是下一個編輯 |
| **Fast Context** | 毫秒級找到代理所需的確切檔案/行 |
| **Agent Client Protocol (ACP)** | 跨模型/代理協作標準 (Devin Local/Cloud、Codex、Claude Agent、OpenCode、Cascade) |
| **SWE-1.6 免費模型** | 無限使用全球最快編碼模型 |
| **雲端無縫切換** | 關閉筆電繼續在手機/瀏覽器工作 |

---

## **安裝與啟動**

### **桌面應用程式 (主要介面)**

| 平台 | 下載連結 |
|------|----------|
| **macOS** (Intel + Apple Silicon) | https://windsurf.com/download |
| **Windows** (x64) | https://windsurf.com/download |
| **Windows ARM64** | https://windsurf.com/download |
| **Linux** | 支援 Flatpak/AppImage |

```bash
# macOS 安裝後
open -a "Devin Desktop"

# Windows
# 開始選單 → Devin Desktop
```

### **JetBrains 外掛 (持續支援)**

```bash
# JetBrains Marketplace 搜尋 "Windsurf" 或 "Devin Desktop"
# 支援: IntelliJ IDEA, PyCharm, WebStorm, Rider, GoLand, PhpStorm 等
# 下載: https://plugins.jetbrains.com/plugin/27310-windsurf
```

### **CLI 存取 (Agent Client Protocol)**

> **注意**: Antigravity/Devin Desktop 主要為 **GUI IDE**，CLI 透過 **ACP (Agent Client Protocol)** 與其他代理互操作

```bash
# ACP 客戶端不提供獨立 CLI 安裝
# 透過 IDE 內建終端機或 Remote Control 存取

# 遠端控制 (手機/瀏覽器 → 桌面)
# Devin Desktop → Settings → Remote Control → 啟用
# 手機 App: Devin Mobile (iOS/Android)
```

---

## **核心架構: 四大支柱**

### **1. Agent Command Center (代理命令中心)**

| 組件 | 功能 |
|------|------|
| **Spaces** | 共享上下文、Git Worktrees、跨代理協作空間 |
| **Kanban View** | 視覺化任務看板、狀態追蹤 |
| **Multi-Agent Management** | 並行代理調度、負載均衡 |

**Spaces 核心價值**:
- 一個 Space = 一個工作上下文 (Git worktree + 共享記憶體)
- 多代理在同一 Space 協作，自動同步變更
- 關閉筆電，代理繼續在雲端運行

### **2. 世界級 IDE 體驗**

| 功能 | 說明 |
|------|------|
| **語法高亮/自動完成** | 內建 LSP、Tree-sitter 支援 50+ 語言 |
| **除錯工具** | 斷點、變數檢查、呼叫堆疊、監看表達式 |
| **Inline Diff** | 代理變更即時視覺化比對 |
| **Supercomplete** | 預測意圖而非單字，理解上下文邏輯 |

### **3. Agent Client Protocol (ACP) 生態**

| 代理 | ACP 支援 | 定位 |
|------|----------|------|
| **Devin Local** | ✅ 原生 | 本地代理、完全離線 |
| **Devin Cloud** | ✅ 原生 | 雲端代理、無限算力 |
| **Codex** | ✅ | OpenAI Codex CLI |
| **Claude Agent** | ✅ | Anthropic Claude Code |
| **OpenCode** | ✅ | opencode-ai (現 Crush) |
| **Cascade** | ✅ | Codeium Cascade |

**ACP 優勢**: 統一介面調度異構代理，模型無關、廠商中立

### **4. 模型選擇自由度 (Model Optionality)**

| 模型層級 | 可用模型 | 適用場景 |
|----------|----------|----------|
| **免費層** | **SWE-1.6** (無限量) | 日常編碼、重構、測試生成 |
| **Pro 層** | **SWE-1.6 Fast** | 速度優先、即時回應 |
| **Max 層** | **Claude Opus 4.6 / Sonnet 4.6** | 複雜推理、架構設計 |
| **企業層** | **GPT-OSS / 自架模型** | 合規、資料主權 |

> **關鍵**: 無限制使用 **SWE-1.6** (全球最快編碼模型排行榜第一)

---

## **定價方案 (2026)**

| 方案 | 價格 | 核心權益 |
|------|------|----------|
| **Free** | $0/月 | SWE-1.6 無限量、基礎 IDE、1 Space |
| **Pro** | **$20/月** | 所有模型、優先存取、5 Spaces、雲端同步 |
| **Max** | **$200/月** | 專用算力、SLA、無限 Spaces、企業功能 |
| **Teams** | $80/月 + $40/席 | 團隊管理、共享 Spaces、審計日誌 |
| **Enterprise** | 請洽詢 | 專有部署、合規、專屬支援 |

> **遷移說明**: 現有 Windsurf 用戶方案、定價**完全不變**，僅品牌更新

---

## **關鍵工作流**

### **1. 代理分派與監控**

```markdown
# 在 IDE 中 (Command Palette: Cmd/Ctrl+Shift+P)
> Devin: New Session
> Devin: Create Space "Auth Refactor"
> Devin: Dispatch Agent "重構認證模組為 JWT + Refresh Token"
> Devin: Dispatch Agent "撰寫單元測試覆蓋率 90%"
> Devin: Dispatch Agent "更新 API 文檔"
```

**監控面板**: Spaces 視圖即時顯示每個代理狀態 (Running/Waiting/Review/PR Ready)

### **2. 程式碼審查流程**

```markdown
# 代理完成 → 自動建立 PR → 人工審查
# 快速審查工具:
# - Inline Diff (左右對比)
# - Rapid Review (跳過式審查)
# - Flag 系統 (Bug/Flags/Informational)
```

### **3. 雲端無縫切換**

```
本地開發 → 關閉筆電 → 手機 App 接手 → 雲端代理持續運行 → 回辦公室 → 桌面同步
```

| 介面 | 存取方式 | 同步內容 |
|------|----------|----------|
| **Desktop** | 原生 App | 完整狀態 |
| **Web** | https://app.devin.ai | 完整狀態 |
| **Mobile** | Devin iOS/Android App | 會話、Spaces、通知 |
| **Remote Control** | Settings → Remote Control | 即時控制桌面會話 |

### **4. 整合生態系統**

| 類別 | 整合 | 類型 |
|------|------|------|
| **通訊** | Slack | MCP Server |
| **專案管理** | Linear, Jira | MCP Server |
| **程式碼品質** | ESLint, Prettier, rust-analyzer, clangd | Extension / LSP |
| **資料庫** | Postgres, MySQL | MCP Server |
| **監控** | Datadog, Sentry | MCP Server |
| **部署** | Vercel, Stripe | MCP Server |
| **文檔** | Notion, Figma | MCP Server |
| **語言伺服器** | gopls, pyright, typescript-language-server | LSP |

---

## **Antigravity (AGY) CLI 技能生態**

> **重要**: `agy` 是 **Antigravity/Devin Desktop 的 CLI 別名**，非獨立工具。社群技能適用於 Antigravity 環境。

### **社群技能資源**

| 專案 | 說明 | 連結 |
|------|------|------|
| **agent-skills** | 124 專家技能，支援 Claude Code / Codex CLI / **Antigravity (agy)** | https://github.com/simota/agent-skills |
| **agent-fuel** | 統一終端機儀表板：Claude Code、Codex、**AGY** 配額監控 | https://github.com/jperod/agent-fuel |
| **agentup** | 跨平台 CLI：偵測/管理/升級 Codex、Claude Code、OpenCode、**Agy** | https://github.com/rockychang7/agentup |
| **mewmew_orchestrator** | 多代理編排：Codex、OpenCode、**agy** | https://github.com/narmadainfosys/mewmew_orchestrator |
| **agy.nvim** | Neovim 整合：AI 代理分割、浮動視窗、視覺化代碼動作 | https://github.com/3plz/agy.nvim |
| **custom_agent_agy** | 8 個生產級自定義代理：Antigravity CLI 全生命週期 | https://github.com/Le-Ngoc-Tu/custom_agent_agy |
| **agy-connector** | Telegram Bot 連接 Antigravity/Claude/Gemini CLI | https://github.com/Harlan1997/agy-connector |
| **nixpkg-antigravity** | Nix Flake 套件：Antigravity CLI | https://github.com/RogerNavelsaker/nixpkg-antigravity |

### **技能安裝方式**

```bash
# 透過 agentup 管理
agentup install antigravity

# 或手動安裝技能到 Antigravity
# Settings → Skills → Import
```

---

## **快捷鍵與生產力**

### **全域快捷鍵 (IDE)**

| 快捷鍵 | 動作 |
|--------|------|
| `Cmd/Ctrl+Shift+P` | Command Palette |
| `Cmd/Ctrl+K` | 快速動作/代理分派 |
| `Cmd/Ctrl+Shift+A` | Agent Command Center |
| `Cmd/Ctrl+E` | Supercomplete 觸發 |
| `Cmd/Ctrl+.` | 快速修復/重構 |
| `F12` | Go to Definition |
| `Shift+F12` | Find References |

### **代理管理快捷鍵**

| 快捷鍵 | 動作 |
|--------|------|
| `Ctrl+Shift+N` | 新 Session |
| `Ctrl+Shift+S` | 新 Space |
| `Ctrl+Shift+D` | Dispatch Agent |
| `Ctrl+Shift+R` | Review PR |

---

## **最佳實踐**

### **1. Space 設計原則**
- **一個功能 = 一個 Space** (Git worktree 隔離)
- **命名規範**: `feat/auth-jwt`, `fix/token-expiry`, `refactor/order-cqrs`
- **共享上下文**: 同 Space 代理自動同步檔案變更、終端機輸出

### **2. 代理分派策略**
```markdown
# 複雜功能拆解範例: 電商訂單系統
Space: feat/order-system

Agent 1 (Architect): "設計訂單領域模型、事件溯源架構、CQRS 讀寫分離"
Agent 2 (Backend): "實作 OrderCommand/OrderQuery、領域事件、投影器"
Agent 3 (API): "REST API 端點、驗證、OpenAPI 文檔生成"
Agent 4 (Test): "整合測試、契約測試、混沌測試場景"
Agent 5 (Docs): "架構決策記錄 (ADR)、API 文檔、部署指南"
```

### **3. Supercomplete 使用技巧**
- **輸入意圖而非代碼**: "為這個函數加入重試邏輯、指數退避、最大 3 次"
- **上下文感知**: Supercomplete 會讀取相關檔案、理解專案模式
- **接受/修改**: `Tab` 接受、`Esc` 拒絕、`Ctrl+→` 部分接受

### **4. 成本優化 (免費層最大化)**
- 優先使用 **SWE-1.6** (無限量、最快)
- 複雜推理才切換到 Pro/Max 模型
- 利用 **Spaces** 共享上下文，避免重複載入

---

## **故障排除**

| 問題 | 解決方案 |
|------|----------|
| 自動更新失敗 | 手動下載最新版: https://windsurf.com/download |
| 代理卡住 | Space → 右鍵代理 → Restart / Kill |
| Git 衝突 | Space 內建 Git 整合 → Visual Merge Tool |
| 擴充套件衝突 | Settings → Extensions → 停用衝突項 |
| 遠端同步失敗 | 檢查網路、重新登入、Remote Control 重新配對 |
| 模型回應慢 | 切換到 SWE-1.6 Fast、減少上下文範圍 |

---

## **遷移指南: Windsurf → Devin Desktop**

| 項目 | 說明 |
|------|------|
| **自動遷移** | OTA 更新自動完成，無需手動操作 |
| **方案/定價** | 完全不變，舊訂閱自動對應新方案 |
| **設定/擴充套件** | 100% 保留遷移 |
| **進行中工作** | Sessions、Spaces、未提交變更全部保留 |
| **JetBrains 外掛** | 繼續支援，Marketplace 搜尋 "Windsurf" |
| **品牌變更** | 僅 UI 文字、Logo、官網域名更新 |

---

## **資源連結**

- **官方網站**: https://windsurf.com (重導向至 Devin Desktop)
- **下載頁面**: https://windsurf.com/download
- **文檔中心**: https://docs.devin.ai/desktop/
- **常見問題**: https://docs.devin.ai/desktop/devin-desktop-faq
- **品牌更名公告**: https://windsurf.com/blog/windsurf-is-now-devin-desktop
- **定價**: https://app.devin.ai/auth/signup
- **ACP 協議**: https://github.com/agent-client-protocol/acp
- **SWE-1.6 模型**: https://cognition.ai/blog/swe-1.6
- **社群技能**: https://github.com/simota/agent-skills
- **Discord/社群**: https://discord.gg/devin
