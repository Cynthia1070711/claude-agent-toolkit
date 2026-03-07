# TRS-30: Rovo Dev CLI Event Hooks + Subagents + BMAD 路由配置

## Story 資訊

| 欄位 | 值 |
|------|-----|
| **Story ID** | TRS-30 |
| **狀態** | done |
| **複雜度** | S |
| **優先級** | P2 |
| **建立時間** | 2026-02-26 00:43 |
| **最後更新** | 2026-02-26 23:23 |
| **依賴** | TRS-27（✅ 已完成基礎 Charter + Tool Permissions） |
| **類型** | D 類（操作流程優化） |
| **建立者** | CC-OPUS（Party Mode） |
| **建議執行者** | CC-OPUS |

---

## 目標

為 Rovo Dev CLI 補齊三塊配置：
1. **Event Hooks** — 生命週期事件通知（音效提示）
2. **Subagents** — 工具類子代理（commit-helper / code-scanner）
3. **BMAD 路由表** — 在 Charter 中注入 Workflow 路由指令，讓 Agent 知道 `dev`/`review`/`create`/`party`/`sm` 該去哪裡載入 BMAD Workflow

---

## 背景

- TRS-27 已完成 Charter + Tool Permissions + Atlassian Connections
- `.rovodev/config.yml` 的 `eventHooks.events` 目前為空陣列
- Subagents 完全未配置
- **BMAD Workflow 的執行引擎在 `_bmad/` 目錄，三引擎共用**。Claude Code 用 `.claude/commands/`（Markdown）做路由，Gemini CLI 用 `.gemini/commands/`（TOML）做路由。Rovo Dev CLI 沒有 `/commands/` 機制，但可以在 `additionalSystemPrompt` 中加入路由表達到同等效果。

---

## 實作方案

### Phase 1：Event Hooks 配置

在 `.rovodev/config.yml` 和 `~/.rovodev/config.yml` 的 `eventHooks.events` 中配置：

| 事件 | 觸發時機 | PowerShell 命令 | 音效特徵 |
|------|---------|----------------|---------|
| `onPermissionRequest` | 代理等待授權時 | `[Console]::Beep(800, 300)` | 中頻短促 |
| `onComplete` | 任務完成時 | `[Console]::Beep(1200, 200); [Console]::Beep(1500, 200)` | 雙升調 |
| `onError` | 執行錯誤時 | `[Console]::Beep(400, 500)` | 低頻長音 |

### Phase 2：Subagents 配置（2 個工具類）

#### commit-helper

| 項目 | 值 |
|------|-----|
| 模型 | `claude-haiku-4-5`（0.4x 點數） |
| 溫度 | 0.2 |
| 職責 | Conventional Commits 訊息生成 + Co-Author 標記 |
| 工具權限 | 僅 `git log`、`git diff`、`git status` |

#### code-scanner

| 項目 | 值 |
|------|-----|
| 模型 | `claude-sonnet-4-6`（1.0x 點數） |
| 溫度 | 0.1 |
| 職責 | OWASP Top 10 + MyProject Key Constraints 檢查 |
| 工具權限 | 僅讀取操作，禁止寫入 |

### Phase 3：BMAD Workflow 路由表

在 `additionalSystemPrompt` 新增路由指令區段。**模式與 Claude Code / Gemini CLI 完全一致**——只負責路由，不包含 SOP 本身：

```
## BMAD Workflow Commands

When user says these keywords, load and execute the corresponding workflow:

### Standard Workflows (via workflow.xml engine)
1. Load _bmad/core/tasks/workflow.xml (core execution engine)
2. Pass the workflow-config path below
3. Follow workflow.xml instructions exactly

| Keyword           | workflow-config path                                                  |
|-------------------|-----------------------------------------------------------------------|
| dev, dev-story    | _bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml          |
| review, code-review | _bmad/bmm/workflows/4-implementation/code-review/workflow.yaml     |
| create, create-story | _bmad/bmm/workflows/4-implementation/create-story/workflow.yaml   |
| sm, sprint-status | _bmad/bmm/workflows/4-implementation/sprint-status/workflow.yaml      |

### Standalone Workflows (direct load)
| Keyword           | Direct path                                    |
|-------------------|------------------------------------------------|
| party, party-mode | _bmad/core/workflows/party-mode/workflow.md    |
```

### Phase 4：驗證

- Event Hooks：啟動 Rovo Dev CLI，觸發 onComplete 確認音效
- Subagents：呼叫 commit-helper / code-scanner 確認功能
- BMAD 路由：輸入 `dev`、`review`、`create`、`sm`、`party`，確認 Agent 載入正確的 Workflow

---

## 驗收標準

- [x] `.rovodev/config.yml` 的 `eventHooks.events` 已配置 3 個事件
- [x] `~/.rovodev/config.yml` 同步更新 Event Hooks
- [x] Subagent `commit-helper` 配置完成
- [x] Subagent `code-scanner` 配置完成
- [x] `additionalSystemPrompt` 新增 BMAD Workflow 路由表（5 個路由）
- [x] `~/.rovodev/config.yml` 同步更新路由表
- [x] 使用者手動驗證：啟動 Rovo Dev CLI 確認所有配置載入正確

---

## 風險

- 🟢 低：純配置修改，不影響程式碼
- 🟡 中：Subagents YAML 格式需實測確認
- 🟡 中：路由表注入 additionalSystemPrompt 後，需確認 Rovo Dev 能正確解析 `@` 路徑引用或需調整為相對路徑

---

## 實測教訓：Event Hooks YAML Schema（官方未公開）

Atlassian 官方文件**完全沒有公開** `eventHooks.events` 的 YAML Schema，以下格式是透過 Pydantic 驗證錯誤逐步反推確認：

```yaml
# CORRECT FORMAT (confirmed by Pydantic validation)
eventHooks:
  events:
  - name: on_tool_permission          # enum: on_tool_permission | on_complete | on_error
    commands:                          # array of CliCommandConfig objects
    - command: powershell -Command "..." # each item is a dict with 'command' key
```

| 迭代 | 嘗試的格式 | Pydantic 錯誤 | 修正 |
|------|-----------|--------------|------|
| 1 | `event: on_tool_permission` | `name` Field required | 欄位名 `event` → `name` |
| 2 | `name: on_response_complete` | Input should be enum | 事件名 → `on_complete` |
| 3 | `commands: ["string"]` | should be CliCommandConfig dict | 純字串 → `{command: "..."}` 物件 |

**合法事件名稱（enum）**：`on_tool_permission`、`on_complete`、`on_error`

### 實測教訓：Subagent 可用工具清單

Subagent frontmatter `tools:` 中的工具名稱必須與 Rovo Dev CLI 實際提供的工具完全一致，否則會出現 `Unavailable tools in subagent` 警告。

**已確認可用的 Subagent 工具**：
- `open_files`, `expand_code_chunks`, `expand_folder`, `grep` — 讀取類工具
- `powershell` — Shell 執行（Windows 環境下，非 `bash`）

**已確認不可用的工具**：
- ~~`bash`~~ — Windows 環境下不存在，應用 `powershell`
- ~~`grep_file_content`~~, ~~`grep_file_paths`~~ — 已移除或改名，用 `grep` 即可

---

## 不在範圍內

- ❌ MCP 伺服器配置
- ❌ BMAD SOP 重新封裝（SOP 在 `_bmad/` 中已存在，共用即可）
- ❌ Forge App 開發

---

## 異動檔案清單

| 檔案 | 異動類型 | 說明 |
|------|---------|------|
| `.rovodev/config.yml` | 修改 | 新增 Event Hooks (3 事件) + BMAD 路由表 (5 路由) |
| `~/.rovodev/config.yml` | 修改 | 同步 Event Hooks + BMAD 路由表 |
| `.rovodev/subagents/commit-helper.md` | 新增 | Conventional Commits 訊息生成子代理 |
| `.rovodev/subagents/code-scanner.md` | 新增 | OWASP + MyProject Key Constraints 掃描子代理 |

---

## 參考資料

- Claude Code 路由範例：`.claude/commands/bmad/bmm/workflows/code-review.md`（14 行）
- Gemini CLI 路由範例：`.gemini/commands/bmad-workflow-bmm-code-review.toml`（24 行）
- 入門指南：`claude token減量策略研究分析/各AGENT使用說明/Rovo Dev CLI 入門指南.md`
- 現有配置：`.rovodev/config.yml`（TRS-27 產出）

---

## Change Log

| 時間 | Agent | 動作 |
|------|-------|------|
| 2026-02-26 00:43 | CC-OPUS | 建立 Story（Party Mode 討論產出） |
| 2026-02-26 00:48 | CC-OPUS | 擴充範圍：新增 BMAD Workflow Subagents（過度設計版） |
| 2026-02-26 00:55 | CC-OPUS | 簡化範圍：BMAD 部分改為路由表注入 additionalSystemPrompt，與 Claude Code/Gemini CLI 同模式，複雜度 M→S |
| 2026-02-26 23:23 | CC-OPUS | dev-story 完成：Event Hooks 3 事件 + Subagents 2 個 + BMAD 路由表 5 路由，專案+全域同步 |
| 2026-02-26 23:35 | CC-OPUS | Event Hooks 格式修正 3 輪（name/enum/CliCommandConfig），啟動驗證通過，新增 Schema 教訓文件 |
| 2026-02-27 00:04 | CC-OPUS | 全項驗證通過：Event Hooks OK + commit-helper OK + code-scanner OK + BMAD sm 路由 OK；修正 subagent 工具清單（bash→powershell, 移除 grep_file_content/grep_file_paths） |
| 2026-02-27 01:32 | CC-OPUS | 狀態修復：review → done，sprint-status.yaml 同步更新，tracking 歸檔 |
