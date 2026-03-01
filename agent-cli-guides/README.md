# Agent CLI 入門指南索引

> **版本**: v1.0.0 | **更新日期**: 2026-02-27
> **用途**: 四引擎協作環境的 CLI 入門指南集中索引，搭配 `docs/開發前環境部署_v3.0.0.md` 使用

---

## 指南導航

| 引擎 | 入門指南 | 定位 |
|------|----------|------|
| Claude Code CLI | [claude-code-guide.md](./claude-code-guide.md) | 主線指揮官 — Story 建立、Code Review、架構決策 |
| Gemini CLI | [gemini-cli-guide.md](./gemini-cli-guide.md) | 探索偵察兵 — 大範圍搜尋、文檔分析、Hooks 自動化（含完整 Hooks JSON Schema） |
| Antigravity IDE | [antigravity-guide.md](./antigravity-guide.md) | IDE 整合開發 — 視覺化編輯、即時預覽、重構輔助 |
| Rovo Dev CLI | [rovo-dev-guide.md](./rovo-dev-guide.md) | Atlassian 生態整合 — Jira/Confluence 聯動、Event Hooks |

---

## 四引擎能力比較表

### 基本規格

| 維度 | Claude Code CLI | Gemini CLI | Antigravity IDE | Rovo Dev CLI |
|------|----------------|------------|-----------------|--------------|
| **開發商** | Anthropic | Google | Windsurf (Codeium) | Atlassian |
| **執行方式** | Terminal CLI | Terminal CLI | IDE 內建 | Terminal CLI |
| **核心模型** | Claude Opus 4.6 / Sonnet 4.6 / Haiku 4.5 | Gemini 2.5 Pro / Flash | Claude Opus 4.6 / Sonnet 4.6 | Claude Sonnet 4.6 / Gemini 2.5 Pro |
| **上下文窗口** | 200K tokens | 1M tokens | 200K tokens | 128K tokens |
| **自動壓縮** | ✅ 內建 auto-compact | ✅ PreCompress Hook | ✅ 自動摘要 | ⚠️ 手動管理 |

### 功能矩陣

| 功能 | Claude Code | Gemini CLI | Antigravity | Rovo Dev |
|------|------------|------------|-------------|----------|
| **檔案讀寫** | ✅ Read/Write/Edit | ✅ read_file/write_file | ✅ IDE 原生 | ✅ read_file/edit_file |
| **終端指令** | ✅ Bash tool | ✅ run_shell_command | ✅ 內建 Terminal | ✅ run_command |
| **Subagent** | ✅ Task tool (多型別) | ❌ 無原生支援 | ✅ Cascade 多步驟 | ⚠️ 有限支援 |
| **MCP Server** | ✅ 完整支援 | ✅ 完整支援 | ✅ 完整支援 | ⚠️ 部分支援 |
| **Hooks 機制** | ✅ settings.json hooks | ✅ 完整 Hooks API（10+ 事件） | ❌ 無 | ✅ Event Hooks (config.yml) |
| **Plan Mode** | ✅ EnterPlanMode | ❌ 無 | ✅ 規劃模式 | ❌ 無 |
| **Skills/Rules** | ✅ .claude/skills + rules | ✅ .gemini/skills | ✅ .windsurfrules | ⚠️ .agent/ config |
| **記憶系統** | ✅ auto-memory | ✅ GEMINI.md | ✅ 專案記憶 | ⚠️ 手動配置 |
| **Git 整合** | ✅ 原生 | ✅ 原生 | ✅ IDE 原生 | ✅ 原生 |
| **瀏覽器自動化** | ✅ chrome MCP | ⚠️ 需 MCP 擴充 | ❌ 無 | ❌ 無 |

### Hooks 機制比較

| 維度 | Claude Code | Gemini CLI | Rovo Dev |
|------|------------|------------|----------|
| **配置位置** | `.claude/settings.json` | `.gemini/settings.json` | `.agent/config.yml` |
| **事件類型** | BeforeTool / AfterTool | BeforeTool / AfterTool / BeforeAgent / AfterAgent / BeforeModel / AfterModel / SessionStart / SessionEnd / Notification / PreCompress / BeforeToolSelection | BeforeTool / AfterTool |
| **封鎖能力** | ✅ deny 工具執行 | ✅ deny/block + 合成回應 | ✅ deny 工具執行 |
| **工具篩選** | ❌ 無 | ✅ BeforeToolSelection（白名單） | ❌ 無 |
| **LLM 攔截** | ❌ 無 | ✅ BeforeModel 可覆寫請求或注入合成回應 | ❌ 無 |
| **通訊協議** | stdin JSON → stdout JSON | stdin JSON → stdout JSON | stdin JSON → stdout JSON |
| **Timeout** | 依設定 | 預設 60s，可自訂 | 依設定 |

### 成本模型

| 引擎 | 計費方式 | 備註 |
|------|----------|------|
| **Claude Code** | API 用量計費（Opus > Sonnet > Haiku） | Subagent 建議用 Haiku 降低成本 |
| **Gemini CLI** | API 用量計費（Pro > Flash） | 1M 上下文但 Pro 成本較高 |
| **Antigravity** | IDE 訂閱制 | 包含模型使用額度 |
| **Rovo Dev** | Atlassian 訂閱 + API 用量 | 與 Jira/Confluence 綁定 |

---

## 新引擎接入 SOP（5 步驟）

當專案需要新增第五個（或更多）AI 引擎時，依照以下 SOP 接入：

### Step 1: 讀取入門指南

1. 取得新引擎的官方文檔或入門指南
2. 整理為 `docs/agent-cli-guides/{engine}-guide.md`，格式參考現有 4 份指南
3. 更新本 README 的導航表與比較表

### Step 2: 建立引擎配置

1. 在專案根目錄建立引擎專屬配置目錄（如 `.{engine}/`）
2. 配置 deny 規則（禁止危險操作），參考：
   - Claude Code: `.claude/settings.json` → `deny` 陣列
   - Gemini CLI: `.gemini/settings.json` → `hooks.BeforeTool`
   - Rovo Dev: `.agent/config.yml` → `denied_tools`
3. 配置 Skills/Rules 目錄結構

### Step 3: 註冊 Agent ID

1. 在 `docs/開發前環境部署_v3.0.0.md` PART 2 的 Agent ID 命名表新增條目
2. 格式：`{引擎縮寫}-{模型等級}`，例如 `CP-GPT4`、`MS-PHI`
3. 在 `sprint-status.yaml` 的 `assigned_agent` 欄位中啟用新 ID

### Step 4: 設定交接協議

1. 確保新引擎能讀寫共享狀態：
   - `docs/implementation-artifacts/sprint-status.yaml`
   - `docs/tracking/active/*.track.md`
2. 配置交接三步驟驗證（讀取 sprint-status → 讀取 tracking → 確認上一 Agent 最後 log）
3. 在新引擎的記憶/配置檔中寫入交接規則

### Step 5: 驗證

1. **配置驗證**: 新引擎能正確讀取專案結構、Skills、Rules
2. **交接驗證**: 從 Claude Code 交接一個測試任務給新引擎，確認：
   - 新引擎能讀取 sprint-status.yaml 並理解 Story 狀態
   - 新引擎能正確更新 tracking file 並標註自己的 Agent ID
   - 交接回 Claude Code 時三步驟驗證通過
3. **安全驗證**: deny 規則生效，危險操作被攔截

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| v1.0.0 | 2026-02-27 | 初版：四引擎入門指南打包 + 索引 + 比較表 + 新引擎接入 SOP |
