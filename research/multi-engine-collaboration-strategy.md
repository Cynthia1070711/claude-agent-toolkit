# MyProject 多引擎 AI Agent 協作策略分析報告

> **文件類型**: 策略分析與規劃文件
> **建立者**: BMAD Party Mode（CEO + Architect + PM + Dev + SM）
> **建立時間**: 2026-02-25
> **最後更新**: 2026-02-25 22:46（§11 跨引擎優化缺口盤點新增）
> **狀態**: ✅ Phase 1 + Phase 2 完成 + §11 缺口盤點
> **相關 Story**: TRS-13（TRS-14 已合併至此）

---

## 1. 現況盤點：四引擎生態系

### 1.1 核心事實

MyProject 專案目前已在使用**四個 AI 開發引擎**進行協作開發。這不是規劃中的願景，而是已經在運作的現實：

| # | 引擎 | 類型 | 當前用途 | 狀態 |
|---|------|------|---------|------|
| 1 | **Claude Code CLI** | 終端機 CLI | 主線任務指揮官 | ✅ 日常使用中 |
| 2 | **Antigravity IDE** | Agent-First IDE | 輔助主線 + E2E 測試 | ✅ 日常使用中 |
| 3 | **Gemini CLI** | 終端機 CLI | 繁瑣執行任務 | ✅ 日常使用中 |
| 4 | **Rovo Dev CLI** | 終端機 CLI + VS Code/Cursor 整合 | 非主線任務 | ✅ 間歇使用中 |

### 1.2 統一憲章現況

**AGENTS.md v3.0 已經存在並運作中**（857 行，2026-02-07 更新），涵蓋：

- §1 專案概述與技術棧
- §2 語言與編碼規範
- §3 目錄結構與必讀文件
- §4 觸發規則（E2E、UI、Workflow、Code Review、交接）
- §5-6 核心技術限制與 UI/UX 規範
- §10 BMAD 指令對照表（Claude 階層式 vs Gemini 扁平式）
- §15.2 多 AI 協作規範（基礎框架）

**命名說明**：`AGENTS.md` 是四引擎共用的統一憲章。各引擎透過各自的配置機制讀取此檔案（Claude Code 透過引用、Gemini CLI 透過 fileName 配置、Antigravity 透過 Rules 引用、Rovo Dev CLI 透過額外系統提示注入）。

### 1.3 各引擎讀取 AGENTS.md 的機制

| 引擎 | 讀取 AGENTS.md 的方式 | 是否原生支援 |
|------|----------------------|-------------|
| **Claude Code** | CLAUDE.md 中透過 `@AGENTS.md` 引用，或 `.claude/rules/` 中引用 | 間接（需配置引用） |
| **Gemini CLI** | `.gemini/settings.json` 中 `context.fileName: ["AGENTS.md", "GEMINI.md"]` | 間接（需配置 fileName） |
| **Antigravity IDE** | `.agent/rules/` 中放置規則檔指向 AGENTS.md，或透過 `@AGENTS.md` 引用 | 間接（需配置規則） |
| **Rovo Dev CLI** | YAML Charter 配置 + 額外系統提示注入 AGENTS.md 內容 | 間接（需配置注入） |

---

## 2. 四引擎詳細規格與可用模型

### 2.1 Claude Code CLI

#### 基本資訊

| 項目 | 規格 |
|------|------|
| **開發商** | Anthropic |
| **類型** | 終端機 CLI + VS Code 整合 |
| **上下文視窗** | ~200K tokens |
| **壓縮機制** | 自動壓縮（預設 83.5% 觸發） |
| **憲章路徑** | `CLAUDE.md`（四層階級：受管域 → 使用者域 → 專案域 → 本地域） |
| **Rules 目錄** | `.claude/rules/` |
| **Skills 目錄** | `.claude/skills/` |
| **MCP 配置** | `.mcp.json`（專案）/ `~/.claude.json`（使用者） |
| **Hooks** | `.claude/settings.json`（14+ 生命週期事件） |
| **授權模式** | Anthropic API Key / Claude Max 訂閱 |

#### 可用模型與適配任務

| 模型別名 | 實際模型 | 核心特性 | 最適任務 |
|---------|---------|---------|---------|
| **opus** | Claude Opus 4.6 | 最強深度推理，擴展思考模式 | 🏗️ 架構設計、create-story、code-review、Party Mode、SM 分析、複雜 debug |
| **sonnet** | Claude Sonnet 4.6 | 速度/推理/成本最佳平衡 | 💻 一般功能開發、程式碼重構、常規 bug 修復 |
| **haiku** | Claude Haiku 4.5 | 高速輕量、低延遲 | 🔍 檔案搜尋、代碼庫探索、簡單指令 |
| **sonnet[1m]** | Sonnet (1M Context) | 100 萬 token 超大視窗 | 📚 超大代碼庫分析、海量日誌偵錯 |
| **opusplan** | Opus(規劃) + Sonnet(執行) | 混合編排模式 | 📋 需嚴謹規劃的大型功能開發 |

#### 進階特性

- **擴展思考（Extended Thinking）**：`Alt+T` 或 `MAX_THINKING_TOKENS` 調整推理深度
- **SKILL.md 中加入 "ultrathink"**：強制最大算力推理
- **Prompt Caching**：靜態專案知識自動快取，降低 token 消耗
- **子代理（Subagent）**：`context: fork` 實現隔離執行環境

#### 在 MyProject 中的角色定位

> **🎖️ 指揮官（CC-OPUS）** — 負責需要最高推理品質的決策層任務

- create-story（需求分析與 Story 建立）
- code-review（對抗式程式碼審查）
- Party Mode（多角色扮演討論）
- SM 角色（Sprint 規劃、狀態分析）
- 架構決策與複雜 debug

---

### 2.2 Google Antigravity IDE

#### 基本資訊

| 項目 | 規格 |
|------|------|
| **開發商** | Google |
| **類型** | Agent-First IDE（基於 VS Code/Windsurf） |
| **上下文視窗** | 依模型（Gemini 1M / Claude 200K） |
| **核心表面** | 編輯器 + Agent Manager + 內建瀏覽器 |
| **並行能力** | Manager View 同時運行最多 5 個 Agent |
| **全域憲章** | `~/.gemini/GEMINI.md`（⚠️ 與 Gemini CLI 共用，有衝突風險） |
| **工作區規則** | `.agent/rules/` |
| **Skills 目錄** | `.agent/skills/` |
| **Workflows** | `.agent/workflows/`（`/指令` 觸發，上限 12,000 字元） |
| **MCP 配置** | `~/.gemini/antigravity/mcp_config.json` |
| **Knowledge Base** | 內建持久記憶，跨 session 保留 |

#### 可用模型與適配任務

| 模型名稱 | 提供商 | 推理等級 | 最適任務 |
|---------|--------|---------|---------|
| **antigravity-claude-opus-4-5-thinking** | Anthropic | 🔴 最高（Thinking） | 🏗️ 複雜架構審查、E2E 測試策略設計、深層 debug |
| **antigravity-claude-sonnet-4-6** | Anthropic | 🟠 高 | 💻 日常大規模程式碼撰寫、重構、精準指令遵循 |
| **antigravity-claude-sonnet-4-6-thinking** | Anthropic | 🟠 高（Thinking） | 💻 需推理的程式碼任務、測試撰寫 |
| **antigravity-gemini-3-pro (high)** | Google | 🟠 高 | 📐 多步驟規劃、戰略性互動、深層 debug、UI/UX 設計稿生成 |
| **antigravity-gemini-3-pro (low)** | Google | 🟢 中 | 📝 結構化更新、追蹤文檔維護、快速回應 |
| **antigravity-gemini-3-flash (high)** | Google | 🟡 中高 | ⚡ 快速回應、中等複雜度任務 |
| **antigravity-gemini-3-flash (medium)** | Google | 🟢 中 | ⚡ Tab 自動補全、小修改、即時輔助 |
| **antigravity-gemini-3-flash (low)** | Google | 🔵 低 | ⚡ 最快回應、簡單查詢 |
| **antigravity-gemini-3-flash (minimal)** | Google | ⚪ 最低 | ⚡ 極輕量任務 |
| **GPT-OSS 120B (Medium)** | OpenAI | 🟢 中 | 🔄 後備選項、常規編碼（Gemini/Claude 配額耗盡時） |

#### 運作模式

| 模式 | 觸發條件 | 行為 |
|------|---------|------|
| **快速模式（Fast）** | 簡單、局部性任務 | 直接生成並執行，低延遲 |
| **規劃模式（Planning）** | 複雜專案任務 | 先產出任務清單 + 實作計畫，再執行 |
| **深度思考（Deep Think）** | Gemini 3 Pro 專屬，手動啟動 | 分配額外運算資源，平行假設探索 |

#### 工件（Artifacts）驗證機制

| 工件類型 | 用途 |
|---------|------|
| 任務清單 | 規劃階段：審查代理執行路徑 |
| 實作計畫 | 架構設計：防止破壞性更動 |
| 演練指南 | 完成後：交付報告 + 測試指引 |
| 程式碼差異 | 即時：行級對比，支援「撤銷至此步驟」 |
| 螢幕截圖/錄影 | E2E：視覺化驗證，支援圖上留回饋 |

#### 在 MyProject 中的角色定位

> **🛡️ 副官 + 測試員（AG）** — 動態角色，依選用模型切換能力

- **選用 Claude Opus 4.6 (Thinking) 時** → 輔助主線：複雜 debug、二次 code-review 確認
- **選用 Gemini 3.1 Pro (High) 時** → 分擔 dev-story、UI/UX 設計稿
- **選用 Gemini 3 Flash 時** → 快速輔助：Tab 補全、小修改
- **內建瀏覽器代理** → E2E 測試撰寫與執行（Playwright）、視覺化驗證

---

### 2.3 Gemini CLI

#### 基本資訊

| 項目 | 規格 |
|------|------|
| **開發商** | Google |
| **類型** | 開源終端機 CLI（Apache 2.0，Node.js） |
| **上下文視窗** | **~1M tokens**（最大優勢） |
| **壓縮機制** | 閾值觸發式壓縮 |
| **憲章路徑** | `GEMINI.md`（全域 → 專案 → JIT 動態發現） |
| **特殊配置** | `settings.json` 的 `context.fileName` 可自訂讀取檔名陣列 |
| **Skills 目錄** | `.gemini/skills/` 或 `.agents/skills/` |
| **MCP 配置** | `.gemini/settings.json` 的 `mcpServers` 區塊 |
| **Hooks** | `.gemini/settings.json`（11 個事件，含 BeforeModel、AfterModel） |
| **子代理** | 實驗性支援（`experimental.enableAgents: true`） |
| **授權模式** | Google AI Studio API Key（免費 1M token 視窗） |

#### 可用模型與適配任務

| 模型名稱 | 推理等級 | 路由模式 | 最適任務 |
|---------|---------|---------|---------|
| **gemini-3.1-pro-preview (High)** | 🔴 最高 | Manual Pro | 🏗️ 深度推理、複雜架構除錯、全域安全審計、大規模重構 |
| **gemini-3.1-pro-preview (Low)** | 🟢 中 | — | 📝 結構化更新、追蹤文檔、狀態同步（不需深度推理） |
| **gemini-3-flash-preview** | ⚡ 高速 | Auto 路由降級目標 | ⚡ 簡單文字格式轉換、單行修正、快速查詢 |
| **Auto 路由模式** | 🔄 動態 | 系統自動判斷 | 🔄 系統根據任務複雜度自動切換 Pro/Flash |

#### 路由策略

| 路由模式 | 邏輯 | 適用場景 |
|---------|------|---------|
| **Auto（推薦）** | 根據提示詞複雜度動態切換 Pro/Flash | 日常開發（系統自動最佳化成本/品質） |
| **Manual Pro** | 強制所有請求使用 Pro 模型 | 極複雜除錯、跨檔案重構 |
| **Manual Flash** | 強制使用 Flash 模型 | 批次簡單操作、快速查詢 |

#### 進階特性

- **1M Token 視窗**：可一次載入整個模組的程式碼，不需分批讀取
- **無頭模式（Headless）**：支援 CI/CD 管線整合，透過 stdin/stdout 操作
- **子代理架構**：YOLO 模式下無需逐次授權，極大化背景自動化
- **`/init` 指令**：自動分析目錄結構生成 GEMINI.md
- **`/memory` 指令**：即時檢視被串聯的上下文原始文字

#### 在 MyProject 中的角色定位

> **⚔️ 執行兵（GC-PRO）** — 利用 1M token 視窗處理大量讀寫的苦力活

- dev-story 實作（主要程式碼撰寫，一次讀取整模組）
- 追蹤文檔更新（sprint-status.yaml、.track.md 歸檔）
- UI/UX 設計稿生成（多模態能力）
- 繁瑣的狀態同步與文件維護

---

### 2.4 Rovo Dev CLI（Atlassian 企業級終端代理）

#### 基本資訊

| 項目 | 規格 |
|------|------|
| **開發商** | Atlassian |
| **類型** | 終端機 CLI + VS Code/Cursor 擴充整合 |
| **核心特色** | **Atlassian 生態系深度整合**（Jira/Confluence/Bitbucket）+ 高度代理化協作 |
| **憲章路徑** | YAML 配置檔（家目錄下 `config.yaml`），支援額外系統提示詞注入 |
| **安裝方式** | 透過 Forge CLI + ACLI 模組安裝，API Token 身分驗證 |
| **MCP 支援** | ✅ 完整支援（stdio / http / sse 三種傳輸層） |
| **SWE-bench** | 41.98% 問題解決率（2,294 個真實世界任務） |
| **授權模式** | Atlassian 商業授權（Rovo Dev 點數制） |

#### 可用模型與點數倍率

Rovo Dev CLI 透過 Atlassian 的模型路由機制提供多款前沿模型，每個模型有對應的**點數消耗倍率**：

| 模型 | 點數倍率 | 推理等級 | 最適任務 |
|------|---------|---------|---------|
| **Claude Haiku 4.5** | 0.4x | 🔵 快速 | ⚡ 例行性任務：註解、文件生成、簡單語法重構、單元測試擴充 |
| **Gemini 3 Flash (preview)** | 0.4x | 🔵 快速 | ⚡ 輕量任務、快速查詢（新增） |
| **Claude Sonnet 4 / 4.5 / 4.6** | 1.0x | 🟠 高 | 💻 預設主力：日常功能實作、臭蟲修復、常規架構優化 |
| **GPT-5 / 5.1 / 5.2 / 5.2-Codex** | 1.0x | 🟠 高 | 💻 多語言程式碼生成、特定 DSL 處理 |
| **Claude Opus 4.5 / 4.6** | 2.0x（需升級方案） | 🔴 最高 | 🏗️ 跨模組架構設計、深層系統除錯、大規模重構 |

> **自動模型路由**：系統內建 Auto model selection，根據提示詞複雜度自動分派最具成本效益的模型。

#### 核心機制

**Charter（代理憲規）**：透過 YAML 配置檔定義代理核心行為、系統提示詞、溫度參數（預設 0.3）及會話持久性。團隊可將開發規範、架構準則直接注入代理認知。

**三級工具權限控制**：

| 權限層級 | 行為 | 適用場景 |
|---------|------|---------|
| **Allow（自動允許）** | 免詢問自動執行 | 無損讀取操作（開檔、搜尋、列目錄） |
| **Ask（請求核准）** | 阻斷流程等待確認 | 破壞性/寫入性操作（建檔、刪檔、修改程式碼） |
| **Deny（強制拒絕）** | 徹底阻斷調用 | 機敏檔案、高風險腳本 |

**Shadow Mode（影子模式）**：建立隔離工作區複本進行實驗性修改，不污染主幹程式碼庫。

**Skills（技能矩陣）**：內建原生技能（檔案系統、Git、語法解析）+ Atlassian 業務技能（Jira 議題、Confluence 文件、Bitbucket PR）+ 透過 Forge CLI 自訂技能。

**Subagents（子代理編排）**：支援階層式協同——主控代理拆解任務，委派給專精化子代理（後端/測試/架構/品質守門員），降低單一模型認知負擔。

**Event Hooks（事件鉤子）**：攔截代理生命週期事件（權限請求、完成、錯誤），綁定自動化腳本（通知、Linter、測試執行）。

**Spec-Driven Development（規格驅動開發）**：先產出技術執行計畫 → 多輪溝通修正 → 共識後才執行修改。

#### 在 MyProject 中的角色定位

> **🔧 特種兵（RD）** — 非主線任務的企業級工具

- 非主線的獨立開發任務
- 利用 Atlassian 生態系整合（Jira/Confluence 連動）
- 利用 Shadow Mode 做高風險實驗性重構
- 利用子代理編排做多步驟自動化任務
- 當其他引擎配額耗盡時的**備援方案**

---

## 3. 四引擎協作分工矩陣

### 3.1 任務分工總覽

| BMAD Workflow 階段 | 主責引擎 | Agent ID | 輔助引擎 | 說明 |
|-------------------|---------|----------|---------|------|
| **Party Mode 討論** | Claude Code | CC-OPUS | — | 多角色扮演需最強推理 |
| **create-story** | Claude Code | CC-OPUS | — | 需求分析、AC 定義、技術方案 |
| **Sprint Planning** | Claude Code | CC-OPUS | — | SM 角色分析與規劃 |
| **dev-story** | Gemini CLI | GC-PRO | AG-PRO / AG-SONNET | GC-PRO 主寫，AG 輔助開發 |
| **E2E 測試** | Antigravity | AG-OPUS | — | 瀏覽器代理 + Playwright |
| **code-review** | Claude Code | CC-OPUS | AG-OPUS（二次確認） | 對抗式審查 |
| **update-tracking** | Gemini CLI | GC-PRO | — | 追蹤歸檔、狀態同步 |
| **UI/UX 設計稿** | Gemini CLI | GC-PRO | AG-PRO | 多模態生成能力 |
| **非主線任務** | Rovo Dev CLI | RD-SONNET | — | 獨立修復、備援 |

### 3.2 標準工作流程

```
Phase 1: 規劃（CC-OPUS 主導）
  ┃  Claude Code → create-story / party-mode / sprint-planning
  ┃  產出 Story 文件 → sprint-status.yaml: ready-for-dev
  ┃  標記: [CC-OPUS] [ISO-8601] created story {id}
  ┃
  ┃ ← 交接點 ──────────────────────────────────────────
  ┃    接手方必須執行交接三步驟：
  ┃    1. 讀取 sprint-status.yaml 確認狀態 = ready-for-dev
  ┃    2. 讀取 docs/tracking/active/ 確認追蹤檔存在
  ┃    3. 確認上一個 Agent 的最後一條 log
  ▼
Phase 2: 實作（GC-PRO 主導，AG 輔助）
  ┃  Gemini CLI → dev-story（主要程式碼撰寫）
  ┃  Antigravity → 輔助開發 / IDE 內即時驗證
  ┃  產出程式碼 + 單元測試
  ┃  → sprint-status.yaml: review
  ┃  標記: [GC-PRO] [ISO-8601] dev-completed {id}
  ┃
  ┃ ← 交接點 ──────────────────────────────────────────
  ▼
Phase 3: 審查（CC-OPUS 主導）
  ┃  Claude Code → code-review（對抗式審查）
  ┃  通過 → sprint-status.yaml: done
  ┃  未通過 → 維持 review + 記錄 feedback → 回到 Phase 2
  ┃  標記: [CC-OPUS] [ISO-8601] review-{passed|rejected} {id}
  ┃
  ▼
Phase 4: E2E + 收尾（AG + GC-PRO）
  ┃  Antigravity → E2E 測試（瀏覽器代理驗證）
  ┃  Gemini CLI → update-tracking（追蹤歸檔）
  ┃  標記: [AG] [ISO-8601] e2e-{passed|failed} {id}
  ┃  標記: [GC-PRO] [ISO-8601] tracking-updated {id}
  ▼
✅ Story 完成
```

### 3.3 Antigravity 的動態角色切換

Antigravity 因內建多模型，其角色隨選用的模型動態變化：

| 選用模型 | 等效角色 | 適用場景 |
|---------|---------|---------|
| Claude Opus 4.6 (Thinking) | 副官 | 複雜 debug、二次 code-review、輔助架構決策 |
| Gemini 3.1 Pro (High) | 執行兵+ | 分擔 dev-story、UI/UX 設計稿、深度規劃 |
| Gemini 3 Flash | 快速輔助 | Tab 補全、小修改、即時查詢 |
| GPT-OSS 120B | 後備 | Gemini/Claude 配額耗盡時的備援 |

---

## 4. Agent ID 規範

### 4.1 Agent ID 定義（細分模式 — Alan 2026-02-25 決策確認）

**命名規則**：`{引擎代號}-{模型簡稱}`，精確追蹤每次操作使用的模型。

#### Claude Code CLI

| Agent ID | 模型 | 典型用途 |
|----------|------|---------|
| **CC-OPUS** | Claude Opus 4.6 | 🎖️ 主線指揮官：create-story、code-review、Party Mode、SM |
| **CC-SONNET** | Claude Sonnet 4.6 | 一般功能開發、常規 bug 修復 |
| **CC-HAIKU** | Claude Haiku 4.5 | Subagent 探索、快速搜尋 |

#### Gemini CLI

| Agent ID | 模型 | 典型用途 |
|----------|------|---------|
| **GC-PRO** | Gemini 3.1 Pro | ⚔️ 執行兵：dev-story、追蹤更新、大規模讀寫 |
| **GC-FLASH** | Gemini 3 Flash | 簡單格式轉換、快速查詢 |

#### Antigravity IDE

| Agent ID | 模型 | 典型用途 |
|----------|------|---------|
| **AG-OPUS** | Claude Opus 4.6 (Thinking) | 🛡️ 副官：複雜 debug、二次 code-review |
| **AG-SONNET** | Claude Sonnet 4.6 (Thinking) | 需推理的程式碼任務、測試撰寫 |
| **AG-PRO** | Gemini 3.1 Pro (High) | 分擔 dev-story、UI/UX 設計稿、深度規劃 |
| **AG-FLASH** | Gemini 3 Flash | Tab 補全、小修改、即時查詢 |
| **AG-GPT** | GPT-OSS 120B | 後備（配額耗盡時） |

#### Rovo Dev CLI

| Agent ID | 模型 | 典型用途 |
|----------|------|---------|
| **RD-OPUS** | Claude Opus 4.5/4.6（2.0x 倍率） | 🏗️ 跨模組架構設計、深層系統除錯 |
| **RD-SONNET** | Claude Sonnet 4.5（1.0x 倍率） | 💻 日常功能開發、臭蟲修復 |
| **RD-GPT** | GPT-5.2 / GPT-5.2-Codex（1.0x 倍率） | 💻 多語言程式碼生成、DSL 處理 |
| **RD-HAIKU** | Claude Haiku 4.5（0.4x 倍率） | ⚡ 例行性任務、文件生成 |

> ✅ **已確認**（Alan 2026-02-25）：採用細分 ID 模式，精確追蹤每次操作使用的引擎+模型組合。

### 4.2 Agent ID 注入方式

各引擎透過各自的私有配置注入身份，**不會交叉污染**：

| 引擎 | 注入位置 | 注入內容 |
|------|---------|---------|
| Claude Code | `CLAUDE.local.md` | Agent ID 對照表（CC-OPUS / CC-SONNET / CC-HAIKU），依當前使用模型標記 |
| Gemini CLI | `.gemini/GEMINI.md`（專案層級） | Agent ID 對照表（GC-PRO / GC-FLASH），依當前模型標記 |
| Antigravity | `.agent/rules/agent-identity.md` | Agent ID 對照表（AG-OPUS / AG-SONNET / AG-PRO / AG-FLASH / AG-GPT），依選用模型標記 |
| Rovo Dev CLI | YAML Charter 配置 + AGENTS.md §16 | Agent ID 對照表（RD-OPUS / RD-SONNET / RD-GPT / RD-HAIKU），依選用模型標記 |

### 4.3 執行紀錄格式

```
[AGENT-ID] [ISO-8601 時間戳] [動作摘要]
```

範例：
```
[CC-OPUS] 2026-02-25T14:00:00+08:00 created story epic-5-story-4
[GC-PRO] 2026-02-25T15:30:00+08:00 dev-started epic-5-story-4
[AG-OPUS] 2026-02-25T17:00:00+08:00 e2e-passed epic-5-story-4
[CC-OPUS] 2026-02-25T17:30:00+08:00 review-passed epic-5-story-4
[GC-PRO] 2026-02-25T17:45:00+08:00 tracking-updated epic-5-story-4
[RD-SONNET] 2026-02-25T18:00:00+08:00 hotfix-applied bugfix-123
```

---

## 5. 狀態同步機制

### 5.1 唯一真相來源

**`sprint-status.yaml`** 是四引擎間的唯一狀態真相來源。追蹤文件就是四引擎之間的「共享記憶體」——每個 Agent 讀取前一個 Agent 的輸出，寫入自己的執行結果。

### 5.2 sprint-status.yaml 建議擴充格式

```yaml
stories:
  - id: "epic-5-story-4"
    title: "某功能實作"
    status: done                    # backlog → ready-for-dev → in-progress → review → done
    assigned_agent: GC-PRO          # ← 新增：實作者 Agent ID
    reviewed_by: CC-OPUS            # ← 新增：審查者 Agent ID
    tested_by: AG                   # ← 新增（可選）：測試者 Agent ID
```

### 5.3 狀態流轉與 Agent 綁定

| 狀態轉換 | 執行者 | 標記要求 |
|---------|--------|---------|
| backlog → ready-for-dev | CC-OPUS | 標記 `assigned_agent` 建議值 |
| ready-for-dev → in-progress | GC-PRO / AG | 標記 `assigned_agent` |
| in-progress → review | GC-PRO / AG | 必須更新追蹤檔 |
| review → done | CC-OPUS | 標記 `reviewed_by` |
| review → in-progress（返工） | CC-OPUS 標記 feedback | 維持 `assigned_agent` |

### 5.4 交接協議（跨引擎切換時）

每次切換引擎時，接手方必須執行**交接三步驟**（參考 `開發前環境部署_v2.8.0.md` PART C）：

1. ✅ 讀取 `sprint-status.yaml` — 確認目標 Story 狀態正確
2. ✅ 讀取 `docs/tracking/active/` — 確認對應追蹤檔存在
3. ✅ 確認上一個 Agent 的最後一條 log — 確保不重複執行已完成步驟

### 5.5 已知陷阱清單（跨引擎協作實戰經驗）

以下為 MyProject 開發過程中已發生的跨引擎協作陷阱，所有引擎在執行任務時須注意：

| # | 陷阱 | 說明 | 防護措施 |
|---|------|------|---------|
| 1 | **dev-story 雙重狀態更新遺漏** | Story 文件有兩個狀態位置（頂部表格 + sprint-status.yaml），容易只更新一處 | 交接三步驟中強制檢查兩處狀態一致 |
| 2 | **CR 延後項目路由錯誤** | Code Review 延後項目被錯誤路由至 Epic TD（技術債），應留在原 Epic 內 | 禁止路由至 TD，必須在同 Epic 建新 Story |
| 3 | **語言選擇錯誤** | AI 消費文件（workflow XML、checklist）翻譯為中文反而增加 token | 見 §5.6 語言選擇規則 |
| 4 | **`~/.gemini/GEMINI.md` 互相污染** | Antigravity 和 Gemini CLI 共用全域路徑，指令互相干擾 | 全域 GEMINI.md 保持極簡，所有專案配置寫在專案層級 |
| 5 | **引擎名稱混淆** | 策略文件建立時將 Rovo Dev CLI（Atlassian）誤寫為 Roo Code（Roo Code, Inc.），兩者是完全不同的工具 | TRS-23 已修正全文。統一使用本文件 §1.1 的正式名稱 |
| 6 | **策略文件重複勞動** | 未先讀取既有文件就開始討論，產出與既有文件重複的內容 | 任何協作策略討論前，先讀取本文件 |
| 7 | **多 Agent 並行寫入同一檔案** | 多開 PowerShell 或跨引擎同時操作，檔案內容靜默覆蓋。同引擎多開時 Agent ID 相同，File Lock 失效 | 同引擎多開必須用 Git Worktree 隔離；跨引擎用 `.agent-locks.json` File Lock 機制。見 `docs/專案部屬必讀/multi-agent-parallel-execution-strategy.md` |
| 8 | **同引擎多開共享 .git 目錄** | 同目錄開多個 CC-OPUS，`git checkout` 會影響所有實例的工作目錄，`git add` 共享 staging area | 必須用 `claude -w <name>` 或 `git worktree add` 建立獨立工作區。詳見 TRS-33 |

### 5.6 語言選擇規則

| 檔案類型 | 語言 | 原因 |
|----------|------|------|
| Workflow 指令（instructions.xml、checklist.md、workflow.yaml） | **英文** | AI 消費，英文 token 效率遠高於中文（中文每字 2-3 tokens） |
| Story、追蹤報告、CR 報告、說明文件、規劃文件 | **繁體中文** | 人類閱讀，遵循 constitutional-standard |
| Agent ID、執行紀錄格式、技術名詞 | **英文** | 機器解析 + 國際通用 |
| AGENTS.md / CLAUDE.md / GEMINI.md 的技術規範段落 | **混合** | 標題與說明用繁體中文，程式碼/路徑/變數名用英文 |

---

## 6. AGENTS.md v3.0 → v4.0 升級缺口分析

### 6.1 已有（不需重做）

| 章節 | 內容 | 狀態 |
|------|------|------|
| §1 | 專案概述、技術棧 | ✅ 完整 |
| §2 | 語言與編碼規範 | ✅ 完整 |
| §3 | 目錄結構與必讀文件 | ✅ 完整 |
| §4 | 觸發規則（5 大類） | ✅ 完整 |
| §5-6 | 核心技術限制、UI/UX 規範 | ✅ 完整 |
| §10 | BMAD 指令對照表（Claude vs Gemini） | ⚠️ 缺 Rovo Dev CLI |
| §15.2 | 多 AI 協作規範 | ⚠️ 僅基礎框架 |

### 6.2 缺失（需新增到 v4.0）

| # | 缺口 | 說明 | 建議新增章節 |
|---|------|------|-------------|
| 1 | **Agent 分工表不存在** | 沒有定義 CC-OPUS / GC-PRO / AG / RD 各自負責什麼 | §16: 多引擎 Agent 分工表 |
| 2 | **狀態流轉的 Agent 標記機制不存在** | sprint-status.yaml 沒有 `assigned_agent` 欄位 | §17: 狀態流轉與 Agent 標記 |
| 3 | **交接協議不完整** | AGENTS.md 本身未引用交接三步驟，Rovo Dev CLI 透過系統提示讀取 AGENTS.md 時不會知道交接協議 | §15.2 擴充 |
| 4 | **Rovo Dev CLI 指令格式未記錄** | §10 只有 Claude/Gemini 對照表 | §10 擴充 |
| 5 | **Antigravity 多模型策略未記錄** | AG 的動態角色切換需要被文件化 | §16 內含 |
| 6 | **四引擎協作 SOP 流程未文件化** | 四階段流程（規劃→實作→審查→E2E收尾）全靠 Alan 肌肉記憶 | 獨立 SOP 文件或 §18 |

---

## 7. 四引擎配置路徑完整對照表

| 功能層級 | Claude Code | Gemini CLI | Antigravity IDE | Rovo Dev CLI |
|---------|-------------|------------|-----------------|-------------|
| **統一憲章** | `@AGENTS.md`（引用） | `context.fileName` 配置 | `.agent/rules/` 引用 | YAML Charter 配置 + 系統提示注入 |
| **專屬憲章** | `CLAUDE.md` | `GEMINI.md` | `~/.gemini/GEMINI.md` | YAML `config.yaml`（家目錄） |
| **Rules** | `.claude/rules/` | 寫在 GEMINI.md | `.agent/rules/` | YAML Charter 中的系統提示詞 |
| **Skills** | `.claude/skills/` | `.gemini/skills/` | `.agent/skills/` | 原生 + Forge CLI 自訂技能 |
| **MCP** | `.mcp.json` | `.gemini/settings.json` | `~/.gemini/antigravity/mcp_config.json` | YAML 配置檔（stdio/http/sse） |
| **Hooks** | `.claude/settings.json` | `.gemini/settings.json` | IDE 內建 | ✅ Event Hooks（權限請求/完成/錯誤） |
| **上下文視窗** | ~200K tokens | **~1M tokens** | 依模型 | 依模型 |
| **Agent ID 注入** | `CLAUDE.local.md` | `.gemini/GEMINI.md` | `.agent/rules/agent-identity.md` | YAML Charter 配置 |

---

## 8. 已知風險與待驗證項目

### 8.1 已知風險

| 風險 | 等級 | 說明 | 緩解方案 |
|------|------|------|---------|
| `~/.gemini/GEMINI.md` 共用衝突 | 🟠 高 | Antigravity 和 Gemini CLI 共用全域 GEMINI.md，互相污染 | GitHub Issue #16058 尚未修復。緩解：全域 GEMINI.md 保持極簡，專案層級各自管理 |
| Windows 11 Symlink 權限 | 🟡 中 | 若後續要用 `.shared/` + symlink 架構，需開發者模式 | 目前方案不使用 symlink，風險暫不適用 |
| Party Mode Token 倍增 | 🟡 中 | 多 Agent 在線時上下文膨脹 | 使用 subagent 隔離模式（主 Agent + 摘要交接） |
| 四引擎狀態同步遺漏 | 🟡 中 | Agent 完成任務後忘記更新 sprint-status.yaml | SOP 強制要求 + 交接三步驟驗證 |

### 8.2 決策紀錄（2026-02-25 Alan 確認）

| # | 決策項 | ✅ 決定 | 備註 |
|---|--------|--------|------|
| 1 | TRS-13/14 合併 | **合併為單一 TRS-13**，TRS-14 標記 cancelled-merged | 原雙引擎/三引擎範圍已過時 |
| 2 | Agent ID 命名粒度 | **細分 ID**（AG-OPUS / AG-PRO / RD-OPUS 等） | 見 §4.1 完整定義 |
| 3 | 推進方式 | **直接執行** Phase 1，不走 create-story 正式流程 | 策略文件已足夠完整作為藍圖 |
| 4 | E2E 測試範圍 | 待定（Phase 3 再決定） | 先跑 2 Sprint 收集數據 |

---

## 9. 建議行動方案

### 9.1 Phase 1：立即可做（無依賴）— ✅ 執行中

| 項目 | 負責 | 狀態 | 說明 |
|------|------|------|------|
| 合併 TRS-13 + TRS-14 | CC-OPUS | ✅ 已決定 | TRS-14 標記 cancelled-merged |
| sprint-status.yaml 格式擴充 | CC-OPUS | 🔄 執行中 | 新增 assigned_agent / reviewed_by / tested_by |
| 各引擎 Agent ID 注入 | CC-OPUS | 🔄 執行中 | 四引擎各建立對照表檔案 |
| 策略文件補充項寫入 | CC-OPUS | ✅ 完成 | §5.5 陷阱清單 + §5.6 語言規則 + §8.2 決策紀錄 |

### 9.2 Phase 2：SOP 文件化 — ✅ 完成

| 項目 | 負責引擎 | 狀態 | 說明 |
|------|---------|------|------|
| AGENTS.md v4.0 升級（補上 6 個缺口） | CC-OPUS | ✅ 完成 | 992 行，§10/§15.2 擴充 + §16/§17/§18 新增 |
| `docs/reference/multi-engine-sop.md` 產出 | CC-OPUS | ✅ 完成 | 7 章節，含四階段流程、交接協議、陷阱清單 |

### 9.3 Phase 3：多 Agent 並行執行策略 — 🔄 執行中

| 項目 | 負責引擎 | 狀態 | Story | 說明 |
|------|---------|------|-------|------|
| 多 Agent 並行策略報告 | CC-OPUS | ✅ 完成 | TRS-31 | 三層架構定案 + 部署必讀整合 |
| File Lock 機制實作 | 待指派 | ⏳ ready-for-dev | TRS-32 | 3 個 PS1 腳本 + 4 引擎 Hook 配置 |
| Worktree 並行 SOP + 部署整合 | 待指派 | ⏳ ready-for-dev | TRS-33 | 部署手冊更新 + Merge 衝突 SOP |

### 9.4 Phase 4：驗證與迭代（跑 2 個 Sprint 後）

| 項目 | 說明 |
|------|------|
| 檢視 Agent ID 命名是否需要細分 | 根據追蹤紀錄的實際使用情況決定 |
| 評估 Hooks 自動追蹤的必要性 | 如果手動紀律夠好就不做 |
| 評估 `.shared/` + symlink 架構 | 如果維護成本可接受就不做 |
| 驗證 Worktree + Merge 流程可行性 | 跑 1 輪完整的 5 Agent 並行後評估 |
| 驗證 File Lock 機制實際攔截效果 | 檢查是否有誤觸發或漏放 |

---

## 10. 效益預估

| 效益類型 | 說明 |
|---------|------|
| **Token 成本最佳化** | Claude Code token 消耗預估轉移 ~40% 至 Gemini CLI（免費 1M token 視窗） |
| **認知負擔降低** | 四引擎切換不再依賴肌肉記憶，有 SOP 可循 |
| **狀態同步風險降低** | 交接三步驟 + Agent ID 標記，消除狀態遺漏 |
| **可追溯性提升** | 完整紀錄每個 Agent 在何時做了什麼 |
| **新引擎接入成本降低** | 如未來加入新工具，只需讀取 AGENTS.md 即可了解規範 |

---

## 11. 跨引擎優化缺口盤點（2026-02-25 Party Mode 發現）

> **背景**：TRS 系列從「Claude Code Token 減量策略」出發，scope 僅覆蓋 Claude Code 生態系（`.claude/`）。
> 其他三引擎（Gemini CLI、Antigravity IDE、Rovo Dev CLI）的憲章、Skills、配置**均未進行系統性整合與優化**。
> 本節記錄 Party Mode 討論中發現的所有缺口，供後續規劃使用。

### 11.1 各引擎使用說明參考資料

Alan 已將四引擎的入門指南放置於分析資料夾，供規劃時查閱各引擎的規格與配置能力：

| 引擎 | 使用說明路徑 | 行數 |
|------|-------------|------|
| Claude Code CLI | `claude token減量策略研究分析/各AGENT使用說明/Claude Code 入門指南.md` | 221 |
| Gemini CLI | `claude token減量策略研究分析/各AGENT使用說明/Gemini CLI 入門指南.md` | 229 |
| Antigravity IDE | `claude token減量策略研究分析/各AGENT使用說明/Antigravity 入門指南.md` | 259 |
| Rovo Dev CLI | `claude token減量策略研究分析/各AGENT使用說明/Rovo Dev CLI 入門指南.md` | 167 |

> ✅ **已確認（Alan 2026-02-25）**：第四引擎是 **Rovo Dev CLI**（Atlassian）。
> ✅ **TRS-23 已完成**：全文「Roo Code」引用已修正為「Rovo Dev CLI」，Agent ID 已從 RC-* 更新為 RD-*。

### 11.2 TRS 系列覆蓋範圍與盲區

**已覆蓋（Claude Code 生態系）：**

| TRS Story | 優化對象 | 狀態 |
|-----------|---------|------|
| TRS-1 | 全域 `~/.claude/CLAUDE.md` | ✅ done |
| TRS-2 | 專案 `CLAUDE.md` | ✅ done |
| TRS-3 | `.claude/rules/` 重組 | ✅ done |
| TRS-4 | `.claude/skills/` 清理（刪除無關 Skills） | ✅ done |
| TRS-5~12, 15~19 | Workflow、Sprint Status、Story 模板等 | ✅ done |
| TRS-13 | AGENTS.md v4.0 + multi-engine-sop.md | ✅ done |

**未覆蓋（其他三引擎）：**

| 缺口 | 引擎 | 嚴重度 | 說明 |
|------|------|--------|------|
| 全域 GEMINI.md 膨脹 | Gemini CLI + Antigravity | 🔴 高 | 388 行，§5 Thinking Protocol 150 行是最大浪費源。AG 選用 Claude 模型時 token 要付費 |
| 專案 GEMINI.md 未精簡 | Gemini CLI | 🔴 高 | 832 行，是 CLAUDE.md (119行) 的 7 倍，~650 行與 AGENTS.md v4.0 重複 |
| `.gemini/skills/` 未清理 | Gemini CLI | 🟠 中 | 41 個 Skills (15,505 行)，含 23 個與 MyProject 無關的 Skills (Go, Java, PostgreSQL 等) |
| `.agent/skills/` 未清理 | Antigravity | 🟠 中 | 41 個 Skills (14,962 行)，同上 23 個無關 Skills |
| `.agent/skills/skills_list.md` 未更新 | Antigravity | 🟠 中 | 140 行，列出所有 Skills 含無關項，增加 create-story 掃描成本與誤觸發風險 |
| `.gemini/skills/skills_list.md` 未更新 | Gemini CLI | 🟠 中 | 同上 |
| ~~Rovo Dev CLI 無配置~~ | Rovo Dev CLI | ✅ 已修正 | TRS-27 已建立 `.rovodev/config.yml` + 全域 Charter 注入 |
| Antigravity `.agent/rules/` 僅 1 檔 | Antigravity | 🟢 低 | 只有 `agent-identity.md` (33行)，已是精簡狀態 |

### 11.3 各引擎配置現況量化

| 引擎 | 憲章行數 | Skills 數 | Skills 行數 | Rules | 需優化項 |
|------|---------|----------|------------|-------|---------|
| **Claude Code** | 119 行 | 21 | 9,388 | 5 檔 | ✅ 已完成（TRS-1~4） |
| **Gemini CLI** | 832 行 | 41 | 15,505 | 寫在 GEMINI.md | 🔴 憲章精簡 + Skills 清理 |
| **Antigravity** | 無獨立憲章 | 41 | 14,962 | 1 檔 (33行) | 🟠 Skills 清理 |
| **Rovo Dev CLI** | `.rovodev/config.yml` | `additionalSystemPrompt` | RD-OPUS/SONNET/GPT/HAIKU | — | ✅ TRS-27 完成 |

> **對比**：Claude Code 在 TRS-4 後只剩 21 個 Skills (9,388 行)，但 Gemini/Antigravity 各有 41 個 (15K+ 行)，多出的 23 個全是無關語言/框架的通用 Skills。

### 11.4 無關 Skills 清單（`.gemini/skills/` + `.agent/skills/` 共有）

以下 23 個 Skills 與 MyProject 專案（ASP.NET Core + React + SQL Server）**完全無關**，在 `.claude/skills/` 的 TRS-4 中已刪除，但 `.gemini/skills/` 和 `.agent/skills/` 未同步：

| # | Skill 名稱 | 無關原因 |
|---|-----------|---------|
| 1 | `golang-patterns` | MyProject 不使用 Go 語言 |
| 2 | `golang-testing` | 同上 |
| 3 | `java-coding-standards` | MyProject 不使用 Java |
| 4 | `jpa-patterns` | 同上 |
| 5 | `springboot-patterns` | 同上 |
| 6 | `springboot-security` | 同上 |
| 7 | `springboot-tdd` | 同上 |
| 8 | `springboot-verification` | 同上 |
| 9 | `postgres-patterns` | MyProject 使用 SQL Server，非 PostgreSQL |
| 10 | `clickhouse-io` | MyProject 不使用 ClickHouse |
| 11 | `backend-patterns` | 通用，已被 MyProject 專用 Skills 覆蓋 |
| 12 | `frontend-patterns` | 通用，已被 MyProject 專用 Skills 覆蓋 |
| 13 | `coding-standards` | 通用，已被 MyProject 專用 Skills 覆蓋 |
| 14 | `project-guidelines-example` | 範例模板，非實際使用 |
| 15 | `continuous-learning` | 實驗性功能，未在專案中啟用 |
| 16 | `continuous-learning-v2` | 同上 |
| 17 | `eval-harness` | 同上 |
| 18 | `iterative-retrieval` | 同上 |
| 19 | `strategic-compact` | 同上 |
| 20 | `verification-loop` | 同上 |
| 21 | `webgpu-threejs-tsl` | MyProject 不使用 WebGPU/Three.js |
| 22 | `security-review` | 通用版，MyProject 有專用 `example-auth-identity` |
| 23 | `tdd-workflow` | 通用版，MyProject 有專用 `example-testing-patterns` |

### 11.5 已建立的優化 Story

| Story ID | 標題 | 複雜度 | 引擎 | 狀態 |
|----------|------|--------|------|------|
| **TRS-20** | 全域 GEMINI.md 瘦身 (388→~100 行) | S | Gemini CLI + Antigravity | ready-for-dev |
| **TRS-21** | 專案 GEMINI.md 對齊 CLAUDE.md 結構 (832→~150 行) | M | Gemini CLI | ready-for-dev |
| **TRS-22** | Gemini + Antigravity Skills 清理（23 個無關 Skills） | S | Gemini CLI + Antigravity | ready-for-dev |
| **TRS-23** | Roo Code → Rovo Dev CLI 全文修正 + §2.4 重寫 | L | 全部 | ✅ done |
| **TRS-24** | .agent/skills/ YAML 適配 Antigravity 動名詞規範 | M | Antigravity | ready-for-dev |
| **TRS-25** | .gemini/skills/ YAML 適配 Gemini CLI 漸進式揭露 | M | Gemini CLI | ready-for-dev |
| **TRS-26** | 全域 GEMINI.md 分離策略（Gemini CLI + Antigravity 共用衝突） | M | Gemini CLI + Antigravity | ready-for-dev |
| **TRS-27** | Rovo Dev CLI 初始 Charter 配置 | S | Rovo Dev CLI | ✅ done |
| **TRS-28** | Gemini CLI settings.json 審查 + Hooks 啟用 | S | Gemini CLI | ready-for-dev |
| **TRS-29** | Antigravity Workflows 審查 + Knowledge Base 規劃 | S | Antigravity | ✅ done |

### 11.6 優化項目與 Story 對照（全部已建立）

| # | 優化項目 | Story ID | 狀態 |
|---|---------|----------|------|
| 1-4 | Skills 清理 + skills_list.md 更新 | **TRS-22** | ready-for-dev |
| 5 | Rovo Dev CLI 初始配置 | **TRS-27** | ✅ done |
| 6 | Gemini CLI settings.json 審查 + Hooks | **TRS-28** | ready-for-dev |
| 7 | Antigravity Workflows 審查 + Knowledge Base | **TRS-29** | ✅ done |
| 8 | 全域 GEMINI.md 分離策略 | **TRS-26** | ready-for-dev |
| 9 | Roo Code → Rovo Dev CLI 全文修正 | **TRS-23** | ✅ done |

> ✅ **2026-02-25 Party Mode**：§11.6 + §11.8 所有待規劃項目已全部建立 Story（TRS-20~29，共 10 個）。

### 11.7 ✅ 已修正：Roo Code → Rovo Dev CLI（TRS-23 完成）

**事故摘要**：策略文件建立時將第四引擎錯誤記錄為「Roo Code」（Roo Code, Inc. 開源產品），實際使用的是「Rovo Dev CLI」（Atlassian 企業產品）。
**修正狀態**：TRS-23 已完成全文修正，包含 §2.4 整節重寫、Agent ID RC-* → RD-*、§5.5 陷阱描述修正。

**兩者對比：**

| 項目 | Roo Code（❌ 錯誤引用） | Rovo Dev CLI（✅ 實際使用） |
|------|----------------------|--------------------------|
| **開發商** | Roo Code, Inc. | Atlassian |
| **授權** | Apache 2.0（開源） | Atlassian 商業授權 |
| **核心特色** | 模型無關（Model Agnostic） | Atlassian 生態系整合（Jira/Confluence/Bitbucket） |
| **憲章路徑** | `AGENTS.md`（原生讀取） | `~/.config/rovo-dev/config.yaml` 或專案 `.rovo-dev/charter.md`（待確認） |
| **內建模式** | Architect/Code/Ask/Debug | 企業級代理模式 |
| **SOC 2** | Type 2 合規 | Atlassian Cloud 合規（Trust Center） |
| **MCP** | ✅ 完整支援 | ✅ 支援 |
| **SWE-bench** | — | 41.98% 問題解決率 |
| **使用說明** | — | `各AGENT使用說明/Rovo Dev CLI 入門指南.md`（167 行） |

**受影響的文件與修正範圍：**

| # | 文件 | 影響範圍 | 修正類型 |
|---|------|---------|---------|
| 1 | `multi-engine-collaboration-strategy.md` | §1.1, §1.2, §1.3, **§2.4 整節**, §3.1-3.3, §4.1-4.3, §5.5 #5, §6.2 #4-5, §7, §8.1, §8.2 | **§2.4 需根據入門指南重寫**，其餘改名 + 調整 |
| 2 | `AGENTS.md` v4.0 | §10, **§16 Agent ID 表**, §17, §18 | Agent ID 前綴 RC-* → RD-*，§16 描述需重寫 |
| 3 | `docs/reference/multi-engine-sop.md` | §1, §3, §5 配置表 | 改名 + 配置路徑更新 |
| 4 | `sprint-status.yaml` | Agent ID 註解行 | RC-* → RD-* |

**Agent ID 已完成更新（TRS-23）：**

| 舊 ID（已廢棄） | 新 ID（已生效） | 模型 |
|---------------|---------------|------|
| ~~RC-OPUS~~ | **RD-OPUS** | Claude Opus 4.5/4.6（2.0x 倍率） |
| ~~RC-SONNET~~ | **RD-SONNET** | Claude Sonnet 4.5（1.0x 倍率） |
| ~~RC-GPT~~ | **RD-GPT** | GPT-5.2 / GPT-5.2-Codex（1.0x 倍率） |
| ~~RC-GEMINI~~ | **RD-HAIKU** | Claude Haiku 4.5（0.4x 倍率） |

> ✅ 已根據 `各AGENT使用說明/Rovo Dev CLI 入門指南.md` 驗證。Rovo Dev CLI 使用 Atlassian 點數倍率機制（非 Provider 模式），支援模型與 Roo Code 完全不同。
> 注意：RC-GEMINI 已替換為 RD-HAIKU（Rovo Dev CLI 不直接提供 Gemini 模型，改用低成本的 Haiku 作為輕量任務選項）。

### 11.8 Gemini CLI vs Antigravity IDE 架構差異分析（2026-02-25 Party Mode）

> **來源**：分析 `各AGENT使用說明/Gemini CLI 入門指南.md` (229 行) + `各AGENT使用說明/Antigravity 入門指南.md` (259 行)
> **核心發現**：兩者的 Skills、Rules、Workflows、Hooks **架構完全不同**，目前的 `.gemini/skills/` 和 `.agent/skills/` 是直接複製，未針對各引擎特性做適配。

#### Skills 架構差異

| 維度 | Gemini CLI | Antigravity IDE |
|------|-----------|-----------------|
| **觸發機制** | 漸進式揭露 — 初始只載入名稱+描述，模型自主呼叫 `activate_skill`，需使用者確認後注入完整內容 | 語義觸發 — YAML description 關鍵字自動匹配，自動注入上下文 |
| **YAML name 規範** | 無嚴格限制 | ≤64 字元、小寫+連字號、**必須動名詞形式** (e.g., `testing-code` 非 `test-patterns`) |
| **YAML 禁止** | 無 | **禁止 name 包含 "claude" 或 "anthropic"** |
| **Skills 管理** | `/skills list/enable/disable`、`gemini skills link`（symlink） | 無直接管理指令，靠語義匹配 |
| **發現優先級** | 工作區 > 使用者 > 擴充套件（同名覆蓋） | 工作區 > 全域 |

#### 配置架構差異

| 維度 | Gemini CLI | Antigravity IDE |
|------|-----------|-----------------|
| **Rules** | 寫在 `GEMINI.md`（全域+專案），無獨立 rules 目錄 | `.agent/rules/` 目錄，支援 `@Mentions` 引用其他 .md 檔案 |
| **Workflows** | 無原生概念；靠 `.toml` 自訂 slash commands 或 Headless Mode | `.agent/workflows/`，≤12,000 字元/檔，`/name` 觸發，支援組合性（工作流調用工作流） |
| **Hooks** | `settings.json` 中 `hooks.BeforeTool` / `hooks.AfterTool` — **原生 11 事件** | **無原生 Hooks API** — 需靠 Rules + Workflows 模擬 |
| **記憶** | `/memory` 手動檢視上下文串聯，無持久學習 | **內建永久記憶 (Knowledge Base / Knowledge Items)** — 自動學習跨 session |
| **MCP** | `.gemini/settings.json` → `mcpServers` | `~/.gemini/antigravity/mcp_config.json`（獨立路徑） |
| **全域憲章** | `~/.gemini/GEMINI.md` | `~/.gemini/GEMINI.md` ⚠️ **共用同一檔案** |
| **沙箱** | Docker/Podman 容器化（Windows/Linux），Seatbelt（macOS） | 三段式終端機控制（Off/Auto/Turbo）+ 瀏覽器雙層名單 |
| **檢查點** | 自動檢查點（影子 Git 儲存庫）+ `/restore` 時光倒流 | 程式碼差異工件 + 「撤銷至此步驟」UI |

#### 已發現的具體問題

| # | 問題 | 嚴重度 | 說明 |
|---|------|--------|------|
| 1 | `.agent/skills/` YAML name 不符合動名詞規範 | 🟡 中 | 目前 `example-editor-arch` 不是動名詞形式，應為 `managing-editor-arch` 或類似。是否影響語義觸發需驗證 |
| 2 | `.agent/skills/` 可能包含禁止的模型名稱 | 🟡 中 | Antigravity 禁止 YAML name 含 "claude"/"anthropic"，需掃描 |
| 3 | `.gemini/skills/` 和 `.agent/skills/` 是相同副本 | 🟠 高 | 兩引擎的 Skills 觸發機制完全不同，YAML 格式要求不同，不應是相同內容 |
| 4 | `~/.gemini/GEMINI.md` 全域共用衝突 | 🟠 高 | Gemini CLI 和 Antigravity 對同一檔案的期望不同（策略文件 §8.1 已標記） |
| 5 | ~~Antigravity Workflows 未充分利用~~ | ✅ 已解決 | TRS-29：7→6 檔（刪除冗餘 `bmm-auto-pilot.md`），修復 4 個路徑引用錯誤，全部 < 12K 限制 |
| 6 | ~~Antigravity 永久記憶未規劃~~ | ✅ 已解決 | TRS-29：評估結論為「被動觀察策略」，不主動預寫入 Knowledge Items，以 Git 版本控制文件為 Source of Truth |
| 7 | Gemini CLI Hooks 未利用 | 🟡 中 | `settings.json` 支援 BeforeTool/AfterTool，可用於自動追蹤 Agent ID 和防護性攔截 |
| 8 | Gemini CLI 子代理 (Subagents) 未規劃 | 🟢 低 | 實驗性功能（需 `experimental.enableAgents: true`），可用於隔離執行 |

#### 適配項目 → Story 對照（全部已建立）

| # | 項目 | Story ID | 狀態 |
|---|------|----------|------|
| 9 | `.agent/skills/` YAML 適配 Antigravity 規範 | **TRS-24** | ready-for-dev |
| 10 | `.gemini/skills/` YAML 適配 Gemini CLI 漸進式揭露 | **TRS-25** | ready-for-dev |
| 11 | 全域 GEMINI.md 分離策略 | **TRS-26** | ready-for-dev |
| 12 | Antigravity Knowledge Base 規劃 | **TRS-29**（合併） | ✅ done |
| 13 | Gemini CLI Hooks 啟用 | **TRS-28**（合併） | ready-for-dev |

---
