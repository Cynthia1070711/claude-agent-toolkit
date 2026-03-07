# 三引擎 AI Agent 協作架構設計全攻略

**Claude Code、Gemini CLI 與 Antigravity IDE 三者可以共存協作，但需要精心設計統一的憲章、技能與追蹤機制。** 三套工具的 Skills 格式已透過 agentskills.io 開放標準實現互通，MCP 伺服器的 JSON 配置格式幾乎一致可複用，但各工具的配置檔路徑與載入機制完全不同——需要一套「單一來源、多路分發」的架構來橋接。本報告完整解析三引擎的架構差異，並提出實戰可行的協作設計方案。

---

## 三引擎架構對照：載入機制決定一切

理解協作設計的第一步，是精確掌握每個引擎如何發現、載入指令與工具。三者的核心差異不在格式，而在**配置路徑與載入時機**。

### Claude Code CLI

Claude Code 採用最成熟的分層記憶架構。**CLAUDE.md** 從企業層級到個人層級共四級自動載入：企業策略（系統目錄）→ 專案記憶（`./CLAUDE.md` 或 `./.claude/CLAUDE.md`）→ 使用者記憶（`~/.claude/CLAUDE.md`）→ 個人專案記憶（`./CLAUDE.local.md`）。它從當前目錄遞迴向上搜尋，子樹的 CLAUDE.md 則在存取該目錄檔案時才延遲載入。Rules 放在 `.claude/rules/` 中，支援 YAML frontmatter 的 `paths:` 欄位進行路徑範圍限定（如 `"src/api/**/*.ts"`），未指定路徑的 Rule 永遠載入。Skills 放在 `.claude/skills/`，每個技能是含 `SKILL.md` 的目錄，遵循 agentskills.io 開放標準，模型根據 description 自動判斷何時啟用。MCP 配置存於 `.mcp.json`（專案層級）或 `~/.claude.json`（使用者層級），格式為標準 `mcpServers` JSON。Hooks 配置在 `.claude/settings.json`，支援 **14+ 生命週期事件**（SessionStart、PreToolUse、PostToolUse、Stop 等）。上下文視窗約 **200K tokens**，有自動壓縮機制（預設 83.5% 觸發）。

### Gemini CLI

Gemini CLI 是開源（Apache 2.0）的 Node.js 終端工具，最大優勢是 **1M token 上下文視窗**。**GEMINI.md** 支援階層式載入：全域（`~/.gemini/GEMINI.md`）→ 專案根目錄（`./GEMINI.md`）→ JIT 動態發現（工具存取新目錄時自動載入該目錄的 GEMINI.md）。關鍵功能：`settings.json` 的 `context.fileName` 可自訂讀取的檔名陣列（如 `["AGENTS.md", "CLAUDE.md", "GEMINI.md"]`），這是跨工具共用憲章的突破口。**沒有獨立的 rules 目錄**——規則直接寫在 GEMINI.md 層級結構中。Skills 放在 `.gemini/skills/` 或 `.agents/skills/`，格式與 Claude Code 完全相同（SKILL.md 標準）。MCP 配置在 `.gemini/settings.json` 的 `mcpServers` 區塊，支援 stdio、SSE、Streamable HTTP 三種傳輸協定。Hooks 系統有 **11 個事件**（比 Claude Code 多了 BeforeModel、AfterModel、BeforeToolSelection），且提供 `CLAUDE_PROJECT_DIR` 相容性環境變數。上下文壓縮為閾值觸發式。

### Antigravity IDE

Antigravity 是 Google 基於 VS Code/Windsurf 打造的 Agent-first IDE（2025 年 11 月發表）。工作區配置使用 **`.agent/` 目錄**：`.agent/rules/`（規則，支援 Always On / Glob Pattern / Model Decision / Manual 四種啟動模式）、`.agent/skills/`（技能，同 SKILL.md 標準）、`.agent/workflows/`（工作流，`/指令` 觸發）。全域配置共用 Gemini 的路徑：`~/.gemini/GEMINI.md`（全域規則）、`~/.gemini/antigravity/skills/`（全域技能）、`~/.gemini/antigravity/global_workflows/`（全域工作流）。MCP 配置路徑為 `~/.gemini/antigravity/mcp_config.json`，格式與其他工具類似但 HTTP 伺服器使用 `serverUrl`（非 `url`）。內建 **Manager View** 可同時運行最多 5 個 Agent，支援 Knowledge Base 持久記憶跨 session 保留。**Antigravity 不會自動讀取 CLAUDE.md 或 .claude/ 目錄。**

以下是三引擎的完整配置路徑對照：

| 功能層級 | Claude Code | Gemini CLI | Antigravity IDE |
|---------|-------------|------------|-----------------|
| **全域憲章** | `~/.claude/CLAUDE.md` | `~/.gemini/GEMINI.md` | `~/.gemini/GEMINI.md`（與 Gemini CLI 衝突） |
| **專案憲章** | `./CLAUDE.md` | `./GEMINI.md` | `.agent/rules/*.md` |
| **Rules 目錄** | `.claude/rules/` | 無（寫在 GEMINI.md） | `.agent/rules/` |
| **Skills 目錄** | `.claude/skills/` | `.gemini/skills/` | `.agent/skills/` |
| **MCP 配置** | `.mcp.json` / `~/.claude.json` | `.gemini/settings.json` | `~/.gemini/antigravity/mcp_config.json` |
| **Hooks** | `.claude/settings.json` | `.gemini/settings.json` | IDE 內建 |
| **上下文窗口** | ~200K tokens | ~1M tokens | 依模型（Gemini 1M / Claude 200K） |

---

## 統一憲章設計：單一來源、多路分發

三個工具各讀不同檔案，但我們可以設計一套**「中央憲章 + 分發腳本」**架構。核心原則是：**所有規範寫一次，自動同步到各工具期望的路徑**。

### 推薦的專案目錄結構

```
project-root/
├── AGENTS.md                          ← 統一憲章（單一真相來源）
├── CLAUDE.md → AGENTS.md              ← symlink（Claude Code 讀取）
├── GEMINI.md → AGENTS.md              ← symlink（Gemini CLI 讀取）
├── .mcp-shared.json                   ← 共用 MCP 定義（單一真相來源）
│
├── .claude/
│   ├── settings.json                  ← Claude Code hooks + permissions
│   ├── settings.local.json            ← 個人 Claude 設定（gitignored）
│   ├── rules/
│   │   ├── code-style.md              ← symlink → .shared/rules/code-style.md
│   │   ├── testing.md                 ← symlink → .shared/rules/testing.md
│   │   └── csharp-conventions.md      ← symlink → .shared/rules/csharp-conventions.md
│   └── skills/
│       ├── create-story/              ← symlink → .shared/skills/create-story/
│       ├── dev-story/                 ← symlink → .shared/skills/dev-story/
│       └── code-review/              ← symlink → .shared/skills/code-review/
│
├── .gemini/
│   ├── settings.json                  ← Gemini CLI 設定（含 MCP + hooks）
│   └── skills/
│       ├── create-story/              ← symlink → .shared/skills/create-story/
│       ├── dev-story/                 ← symlink → .shared/skills/dev-story/
│       └── update-tracking/           ← symlink → .shared/skills/update-tracking/
│
├── .agent/
│   ├── rules/
│   │   ├── code-style.md             ← symlink → .shared/rules/code-style.md
│   │   └── testing.md                ← symlink → .shared/rules/testing.md
│   ├── skills/
│   │   ├── create-story/             ← symlink → .shared/skills/create-story/
│   │   └── e2e-testing/              ← symlink → .shared/skills/e2e-testing/
│   └── workflows/
│       └── sprint-review.md
│
├── .shared/                           ← 共用資源（真正的檔案所在地）
│   ├── rules/
│   │   ├── code-style.md
│   │   ├── testing.md
│   │   └── csharp-conventions.md
│   ├── skills/
│   │   ├── create-story/
│   │   │   └── SKILL.md
│   │   ├── dev-story/
│   │   │   └── SKILL.md
│   │   ├── code-review/
│   │   │   └── SKILL.md
│   │   ├── update-tracking/
│   │   │   └── SKILL.md
│   │   └── e2e-testing/
│   │       └── SKILL.md
│   └── mcp/
│       └── sync-mcp.ps1              ← PowerShell 腳本同步 MCP 配置
│
├── .track.md                          ← Agent 執行追蹤日誌
├── sprint-status.yaml                 ← BMAD Sprint 追蹤
└── CLAUDE.local.md                    ← 個人專案偏好（gitignored）
```

### AGENTS.md 憲章內容設計

AGENTS.md 作為統一憲章，應包含所有三引擎都需要遵守的共通規範。**關鍵設計原則**：避免工具專屬語法，使用純 Markdown 撰寫通用指令。

```markdown
# 專案憲章 — [專案名稱]

## 技術棧
- 後端：C# ASP.NET Core MVC (.NET 8)
- 前端：React 18 + Zustand + Fabric.js
- 資料庫：SQL Server（Azure SQL Database）
- 部署：Azure PaaS (App Service + Azure SQL + Blob Storage)
- 測試：xUnit + Playwright E2E

## 開發方法論
採用 BMAD Method v6，工作流程：create-story → dev-story → code-review
Sprint 追蹤文件：sprint-status.yaml
執行日誌：.track.md

## Agent 任務分工
| Agent 代號 | 工具 | 負責範圍 |
|-----------|------|---------|
| CC-OPUS | Claude Code (Opus 4.6) | 主線：create-story、code-review、Party Mode、SM 分析 |
| AG-OPUS | Antigravity (Claude Opus 4.6) | 輔助主線、E2E 測試撰寫與執行 |
| GC-PRO | Gemini CLI (Gemini 3.1 Pro) | 追蹤文檔更新、dev-story 實作、UI/UX 設計 |

## 執行紀錄規範
所有 Agent 修改追蹤文件時，必須加上執行者標記：
格式：`[AGENT-ID] [ISO-8601 時間戳] [動作摘要]`
範例：`[CC-OPUS] 2026-02-24T14:30:00+08:00 完成 S3.2 code-review`

## 程式碼規範
- C# 遵循 .editorconfig 定義的格式
- React 元件使用 functional component + TypeScript
- 狀態管理統一使用 Zustand store
- API 呼叫統一透過 /services/ 目錄的封裝函式
- 所有公開 API 端點須有輸入驗證（FluentValidation）
- Git commit 訊息遵循 Conventional Commits

## 禁止事項
- 不得直接修改 migration 歷史
- 不得繞過 code-review 直接合併
- 不得在前端硬編碼 API URL
- 不得刪除或覆蓋其他 Agent 的追蹤紀錄
```

### Gemini CLI 的 context.fileName 配置

在 `.gemini/settings.json` 中加入以下設定，讓 Gemini CLI 同時讀取 AGENTS.md 和 GEMINI.md：

```json
{
  "context": {
    "fileName": ["AGENTS.md", "GEMINI.md"]
  }
}
```

### 全域 GEMINI.md 衝突的處理

**Antigravity 和 Gemini CLI 共用 `~/.gemini/GEMINI.md`，這是已知的衝突問題**（GitHub Issue #16058，2026 年 1 月提出，尚未修復）。兩個工具互相污染全域指令。建議的處理策略：將 `~/.gemini/GEMINI.md` 的內容保持極簡，只放兩者都適用的通用指令（如個人偏好的程式風格），工具專屬的配置則分別放在各自的專案層級目錄中。

---

## MCP 伺服器共用：一份定義、三處部署

三個工具的 MCP 配置格式高度一致（都是 `mcpServers` JSON 物件），差異僅在**存放路徑和個別欄位名稱**。核心策略是維護一份 `.mcp-shared.json` 作為共用定義，再用腳本分發到各工具。

### 格式差異對照

```
共通格式（stdio 傳輸）— 三者完全相同：
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}

HTTP 傳輸差異：
  Claude Code:    "url": "https://..."
  Gemini CLI:     "url": "https://..." 或 "httpUrl": "https://..."
  Antigravity:    "serverUrl": "https://..."
```

### 同步腳本（PowerShell，Windows 11 環境）

```powershell
# .shared/mcp/sync-mcp.ps1
$shared = Get-Content ".mcp-shared.json" | ConvertFrom-Json

# → Claude Code（.mcp.json）
$shared | ConvertTo-Json -Depth 10 | Set-Content ".mcp.json"

# → Gemini CLI（.gemini/settings.json 的 mcpServers 區塊）
$geminiSettings = Get-Content ".gemini/settings.json" | ConvertFrom-Json
$geminiSettings.mcpServers = $shared.mcpServers
$geminiSettings | ConvertTo-Json -Depth 10 | Set-Content ".gemini/settings.json"

# → Antigravity（~/.gemini/antigravity/mcp_config.json）
# 注意：Antigravity 不支援 ${workspaceFolder}，需使用絕對路徑
$agConfig = $shared | ConvertTo-Json -Depth 10
$agConfig = $agConfig -replace '\$\{workspaceFolder\}', (Get-Location).Path
$agConfig | Set-Content "$env:USERPROFILE\.gemini\antigravity\mcp_config.json"

Write-Host "MCP config synced to all 3 engines."
```

**對於 HTTP/SSE 類型的 MCP 伺服器**（如遠端資料庫連線），三個工具可以同時連線到同一個運行中的伺服器實例。對於 stdio 類型（本地進程），每個工具會各自啟動獨立的伺服器進程，但共用相同的二進位程式和配置。

---

## Skills 標準化：agentskills.io 是關鍵

三個工具都支援 **agentskills.io 開放標準**的 SKILL.md 格式，這是實現技能共用的最大利器。每個 Skill 是一個目錄，包含必需的 `SKILL.md`（YAML frontmatter + Markdown 指令）和可選的 scripts/references/assets 子目錄。格式完全一致，差異只在**發現路徑**。

### BMAD 工作流對應的 SOP Skill 設計

以下是針對你的 BMAD v6 工作流設計的標準化 Skills（存放在 `.shared/skills/`）：

**create-story Skill（CC-OPUS 主責）：**
```yaml
---
name: create-story
description: >
  BMAD create-story 工作流。當使用者需要從需求建立 User Story 時啟用。
  包含需求分析、驗收條件定義、技術方案評估。
---
# Create Story SOP

## 前置條件
1. 確認 sprint-status.yaml 中的 Epic 已存在
2. 讀取相關 Epic 的 PRD 文件

## 執行步驟
1. 分析需求，拆解為可實作的 Story
2. 定義驗收條件（Given-When-Then 格式）
3. 評估技術複雜度（SP 估點）
4. 產出 Story 文件至 docs/stories/
5. 更新 sprint-status.yaml（新增 Story，狀態設為 drafted）
6. 在 .track.md 記錄執行（格式：[AGENT-ID] [時間戳] created story [ID]）

## 輸出格式
Story 文件須包含：標題、描述、驗收條件、技術備註、估點、依賴關係
```

**dev-story Skill（GC-PRO 主責）：**
```yaml
---
name: dev-story
description: >
  BMAD dev-story 實作工作流。當使用者指定 Story 進行開發實作時啟用。
  負責將 Story 轉化為實際程式碼。
---
# Dev Story SOP

## 前置條件
1. 確認 Story 狀態為 drafted 或 in-progress
2. 讀取 Story 文件（docs/stories/[ID].md）
3. 讀取相關技術規格

## 執行步驟
1. 在 sprint-status.yaml 將 Story 狀態更新為 in-progress
2. 建立或切換到對應 feature branch
3. 依 Story 驗收條件實作程式碼
4. 撰寫單元測試（覆蓋率 > 80%）
5. 執行 `dotnet build` 確認編譯通過
6. 執行 `dotnet test` 確認測試通過
7. 更新 sprint-status.yaml（狀態設為 review）
8. 在 .track.md 記錄執行

## C# 專案特定指引
- Controller 放在 Controllers/，Service 放在 Services/
- 使用 DI 注入所有 Service
- React 元件放在 ClientApp/src/components/
```

**code-review Skill（CC-OPUS 主責）：**
```yaml
---
name: code-review
description: >
  BMAD code-review 工作流。當 Story 進入 review 狀態時啟用。
  負責程式碼品質審查與回饋。
---
# Code Review SOP

## 前置條件
1. 確認 sprint-status.yaml 中 Story 狀態為 review
2. 識別該 Story 修改的所有檔案

## 審查清單
1. **正確性**：是否滿足驗收條件
2. **安全性**：SQL Injection、XSS、CSRF 防護
3. **效能**：N+1 查詢、不必要的記憶體配置
4. **可維護性**：命名規範、程式結構、DRY 原則
5. **測試覆蓋**：關鍵路徑是否有測試

## 輸出
- 若通過：更新 sprint-status.yaml 為 done，記錄至 .track.md
- 若需修改：在 .track.md 記錄 review feedback，維持 review 狀態
```

**update-tracking Skill（GC-PRO 主責）：**
```yaml
---
name: update-tracking
description: >
  更新追蹤文檔。當需要同步 sprint-status.yaml 或 .track.md 時啟用。
  利用 Gemini 的大上下文窗口處理大量追蹤資料。
---
# Update Tracking SOP

## 步驟
1. 讀取當前 sprint-status.yaml 完整內容
2. 讀取 .track.md 最近的執行紀錄
3. 根據指示更新對應 Story/Epic 的狀態
4. 確保時間戳為 ISO-8601 格式（含時區 +08:00）
5. 確保 Agent ID 標記正確
6. 驗證 YAML 格式有效性
```

### Skill 分發方式

在 Windows 11 環境中使用 symlink（需以系統管理員身份執行或啟用開發者模式）：

```powershell
# 從 .shared/skills/ 建立 symlink 到各工具目錄
$skills = @("create-story", "dev-story", "code-review", "update-tracking", "e2e-testing")
foreach ($skill in $skills) {
    # Claude Code
    New-Item -ItemType SymbolicLink -Path ".claude\skills\$skill" -Target ".shared\skills\$skill" -Force
    # Gemini CLI
    New-Item -ItemType SymbolicLink -Path ".gemini\skills\$skill" -Target ".shared\skills\$skill" -Force
    # Antigravity
    New-Item -ItemType SymbolicLink -Path ".agent\skills\$skill" -Target ".shared\skills\$skill" -Force
}
```

---

## 執行追蹤與 Agent 標註機制

三引擎同時運作最大的挑戰之一是**可追溯性**——必須清楚知道哪個 Agent 在何時做了什麼。設計兩層追蹤系統：

### .track.md 格式設計（即時執行日誌）

```markdown
# Agent 執行追蹤日誌

## 2026-02-24

### Sprint 12 — Epic E3: 畫布編輯器

| 時間戳 | Agent | 動作 | Story | 檔案變更 |
|--------|-------|------|-------|---------|
| 14:00+08 | CC-OPUS | create-story | S3.1 | docs/stories/S3.1.md |
| 14:25+08 | CC-OPUS | create-story | S3.2 | docs/stories/S3.2.md |
| 14:30+08 | GC-PRO | update-tracking | — | sprint-status.yaml |
| 15:00+08 | GC-PRO | dev-story 開始 | S3.1 | src/Controllers/CanvasController.cs |
| 16:30+08 | GC-PRO | dev-story 完成 | S3.1 | +5 files changed |
| 16:35+08 | AG-OPUS | e2e-testing | S3.1 | tests/E2E/Canvas.spec.ts |
| 17:00+08 | CC-OPUS | code-review 通過 | S3.1 | — |
| 17:05+08 | GC-PRO | update-tracking | S3.1 | sprint-status.yaml → done |
```

### sprint-status.yaml 擴充欄位

```yaml
sprint:
  id: 12
  start: 2026-02-17
  end: 2026-03-02

epics:
  - id: E3
    title: "畫布編輯器 - Fabric.js 整合"
    stories:
      - id: S3.1
        title: "Canvas 基礎渲染元件"
        status: done
        assigned_agent: GC-PRO          # 實作者
        reviewed_by: CC-OPUS            # 審查者
        tested_by: AG-OPUS              # 測試者
        story_points: 5
        history:
          - agent: CC-OPUS
            action: created
            at: 2026-02-24T14:00:00+08:00
          - agent: GC-PRO
            action: dev-started
            at: 2026-02-24T15:00:00+08:00
          - agent: GC-PRO
            action: dev-completed
            at: 2026-02-24T16:30:00+08:00
          - agent: AG-OPUS
            action: e2e-passed
            at: 2026-02-24T16:35:00+08:00
          - agent: CC-OPUS
            action: review-passed
            at: 2026-02-24T17:00:00+08:00
```

### Agent ID 的注入方式

每個工具需要知道自己的 Agent ID。可透過以下機制注入：

- **Claude Code**：在 `CLAUDE.local.md` 中寫入 `你的 Agent 代號是 CC-OPUS`
- **Gemini CLI**：在 `.gemini/GEMINI.md`（專案層級）中寫入 `你的 Agent 代號是 GC-PRO`
- **Antigravity**：在 `.agent/rules/agent-identity.md` 中寫入 `你的 Agent 代號是 AG-OPUS`

由於三者讀取不同路徑的配置，**不會交叉污染 Agent ID**。統一憲章 AGENTS.md 中定義分工表，而各自的私有配置中注入身份——這是這套架構的核心設計巧思。

---

## 內建 LLM 模組的選擇策略

Antigravity IDE 提供多模型選擇，**正確的模型配對直接影響任務效率與成本**。以下是基於實測與架構特性的推薦配置：

| 任務類型 | 推薦 Agent | 推薦模型 | 原因 |
|---------|-----------|---------|------|
| create-story（需求分析） | CC-OPUS | Claude Opus 4.6 (Thinking) | 深度推理、結構化輸出最佳 |
| Party Mode 討論 | CC-OPUS | Claude Opus 4.6 (Thinking) | 多角色扮演需要最強推理能力 |
| code-review | CC-OPUS | Claude Opus 4.6 (Thinking) | 程式碼理解與安全分析精準度最高 |
| dev-story 實作 | GC-PRO | Gemini 3.1 Pro (High) | 1M 上下文可一次讀取整個模組，High 思考層級確保品質 |
| 追蹤文檔更新 | GC-PRO | Gemini 3.1 Pro (Low) | 結構化更新不需深度推理，Low 模式更快 |
| UI/UX 設計稿 | GC-PRO | Gemini 3.1 Pro (High) | 多模態能力支援設計圖檔生成 |
| E2E 測試撰寫 | AG-OPUS | Claude Opus 4.6 (Thinking) | 理解完整使用者流程需要深度推理 |
| 輔助實作（IDE 內） | AG-OPUS | Gemini 3 Flash | 快速回應、Tab 補全用途，省配額 |
| 快速查詢/小修改 | AG-OPUS | Gemini 3 Flash | 低延遲、適合即時輔助 |

**GPT-OSS 120B (Medium)** 定位為中等能力的開源模型，適合不需要頂級推理能力的常規編碼任務，可作為 Gemini/Claude 配額耗盡時的後備選項。值得注意的是，有社群回報指出 Antigravity 的模型顯示名稱可能與實際路由的模型不完全一致，建議在正式工作流中先以簡單任務測試各模型的實際表現。

---

## 實戰工作流：BMAD 三引擎協作 SOP

將 BMAD v6 的 create-story → dev-story → code-review 流程具體對應到三引擎分工：

**階段一：需求分析與 Story 建立（CC-OPUS 主導）**

1. 使用者在 Claude Code CLI 啟動 Party Mode，召喚 PM + Analyst + Architect 角色討論需求
2. CC-OPUS 執行 `/create-story` Skill，產出 Story 文件
3. CC-OPUS 在 .track.md 記錄 `[CC-OPUS] [時間戳] created story S3.1`
4. CC-OPUS 更新 sprint-status.yaml（狀態：drafted）

**階段二：實作開發（GC-PRO 主導）**

5. 使用者在 Gemini CLI 指派 `請實作 S3.1`
6. GC-PRO 啟用 `/dev-story` Skill，讀取 Story 文件
7. GC-PRO 利用 1M token 上下文一次載入整個相關模組
8. GC-PRO 實作程式碼 + 撰寫單元測試
9. GC-PRO 更新 sprint-status.yaml（狀態：review）+ .track.md

**階段三：E2E 測試（AG-OPUS 輔助）**

10. 使用者在 Antigravity IDE 內指派 `為 S3.1 撰寫 E2E 測試`
11. AG-OPUS 啟用 `/e2e-testing` Skill，在 IDE 內建終端機執行 Playwright
12. AG-OPUS 記錄測試結果至 .track.md

**階段四：程式碼審查（CC-OPUS 主導）**

13. 使用者回到 Claude Code CLI，指派 `審查 S3.1`
14. CC-OPUS 啟用 `/code-review` Skill，讀取 diff + Story 驗收條件
15. 審查通過：CC-OPUS 更新 sprint-status.yaml（狀態：done）

**階段五：追蹤同步（GC-PRO 收尾）**

16. GC-PRO 執行 `/update-tracking`，整理當天的 .track.md，確保所有紀錄一致

這個流程的關鍵在於**每個階段切換時，下一個 Agent 都能透過 sprint-status.yaml 和 .track.md 了解前一個 Agent 做了什麼**。追蹤文件就是三引擎之間的「共享記憶體」。

---

## Hooks 實現自動化追蹤與防護

利用 Claude Code 和 Gemini CLI 的 Hooks 系統，可以自動化部分追蹤邏輯：

**Claude Code Hook（PostToolUse — 自動記錄檔案修改）：**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "powershell -Command \"$ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'; Add-Content .track.md ('| ' + $ts + ' | CC-OPUS | file-edit | — | ' + $env:CLAUDE_TOOL_INPUT_FILE + ' |')\"",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

**Gemini CLI Hook（AfterTool — 自動記錄）：**
```json
{
  "hooks": {
    "AfterTool": [
      {
        "matcher": "write_file|replace_in_file",
        "hooks": [{
          "name": "track-changes",
          "type": "command",
          "command": "powershell -Command \"$ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'; Add-Content .track.md ('| ' + $ts + ' | GC-PRO | file-edit | — | modified |')\"",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

---

## 結論與關鍵洞察

這套三引擎協作架構的可行性建立在三個技術基石上：**agentskills.io 統一了 Skills 格式**（SKILL.md 可在三個工具間零修改共用）、**MCP 協議標準化了工具連線**（配置格式 95% 相同，僅需簡單轉換腳本同步）、**純 Markdown 憲章檔案具有天然的可攜性**（內容一致，只需 symlink 到各工具的期望路徑）。

最值得注意的發現是 `~/.gemini/GEMINI.md` 的共用衝突——Antigravity 和 Gemini CLI 在全域層級「意外共享」同一個配置檔，這既是風險也是機會：小心管理時可以讓全域偏好自動在兩者間同步，但若不注意則會造成指令污染。

最深刻的架構洞察在於**追蹤文件即通訊協議**。三個 Agent 不需要直接通訊——sprint-status.yaml 和 .track.md 就是它們的共享狀態機。每個 Agent 讀取前一個 Agent 的輸出，寫入自己的執行結果，形成一個基於檔案系統的異步協作迴路。這比任何複雜的 Agent-to-Agent 通訊框架都更可靠、更可除錯、更符合你現有的 BMAD 方法論。