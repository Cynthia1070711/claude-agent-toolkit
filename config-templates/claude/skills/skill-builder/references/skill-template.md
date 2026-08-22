# SKILL.md 完整規範與範本

> 依據 Claude Code v2.1.85 官方規範

## Frontmatter 完整欄位

```yaml
---
# === 建議必填 ===
name: skill-name                        # kebab-case, ≤64 字元（官方規範為選填，但強烈建議提供）
description: >-                         # Claude 用這個判斷何時載入，務必詳細！（官方規範為 Recommended）
  完整描述做什麼、何時觸發、支援什麼操作。

# === 參數 ===
argument-hint: "[issue-number]"         # 自動完成提示，顯示預期參數格式

# === 觸發控制 ===
disable-model-invocation: true          # true = 僅使用者可觸發（deploy、commit 等有副作用操作）
user-invocable: false                   # false = 隱藏 / 選單（背景知識，Claude 自動載入）

# === 工具與模型 ===
allowed-tools: Read, Grep, Glob         # 活躍時自動核准的工具（不需使用者確認）
model: sonnet                           # 模型覆寫（sonnet/opus/haiku/完整 ID）
effort: high                            # 推理深度（low/medium/high/max）

# === 隔離執行 ===
context: fork                           # fork = 在獨立 subagent context 執行
agent: Explore                          # context:fork 時使用的 agent（Explore/Plan/general-purpose/自訂）

# === 進階 ===
hooks:                                  # Skill 生命週期 hooks
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
shell: powershell                       # bash（預設）或 powershell（Windows）

# === 生命週期欄位（PhyCool 擴展）===
version: 1.0.0                          # semver — patch=規則微調, minor=新增規則, major=架構變更
updated: 2026-04-05                     # 最後更新日期（YYYY-MM-DD），必填
author: CC-OPUS                         # 作者標識，記錄建立者
created: 2026-01-01                     # 首次建立日期（YYYY-MM-DD）
last-synced-epic: epic-xx               # saas-to-skill Mode C 使用，記錄最後同步的 Epic
last-synced-date: 2026-04-05            # 最後同步日期，staleness detection 使用
watches:                                # SaaS 模組 Skill 必填：staleness 偵測 glob 陣列
  - glob: "src/Services/MyFeature*.cs"
    label: "業務服務變更偵測"
  - glob: "src/Models/MyEntity.cs"
    label: "Model 變更偵測"
---
```

### 欄位決策指引

| 問題 | 答案 → 設定 |
|------|-----------|
| 有副作用嗎（部署、發送訊息）？ | Yes → `disable-model-invocation: true` |
| 使用者會手動呼叫嗎？ | No → `user-invocable: false` |
| 需要帶參數嗎？ | Yes → 加 `argument-hint`，內容用 `$ARGUMENTS` |
| 需要限制工具？ | Yes → `allowed-tools: Read, Grep`（唯讀模式） |
| 需要隔離執行？ | Yes → `context: fork` + `agent: Explore` |
| 需要即時資料？ | Yes → 用動態注入預處理語法 |

### 生命週期欄位說明（PhyCool 擴展）

| 欄位 | 說明 | 使用場景 |
|------|------|---------|
| `version` | semver 版本號 | 必填，patch=規則微調 / minor=新增規則 / major=架構變更 |
| `updated` | 最後更新日期（YYYY-MM-DD） | 必填，每次修改後更新 |
| `author` | 作者標識（如 CC-OPUS） | 記錄建立者，方便追溯 |
| `created` | 首次建立日期（YYYY-MM-DD） | 記錄 Skill 生命週期起點 |
| `last-synced-epic` | 最後同步的 Epic ID | saas-to-skill Mode C 自動更新 |
| `last-synced-date` | 最後同步日期（YYYY-MM-DD） | staleness detection 基準日期 |
| `watches` | staleness 偵測 glob 陣列 | SaaS 模組 Skill 必填，指向追蹤的程式碼路徑 |

---

## 字串替換完整清單

| 變數 | 說明 | 範例 |
|------|------|------|
| `$ARGUMENTS` | 全部參數 | `/fix-issue 123` → `$ARGUMENTS` = `123` |
| `$ARGUMENTS[0]` | 第一個參數 | `/migrate A B C` → `$ARGUMENTS[0]` = `A` |
| `$0` | `$ARGUMENTS[0]` 縮寫 | 同上 |
| `$1` | `$ARGUMENTS[1]` 縮寫 | `$1` = `B` |
| `${CLAUDE_SESSION_ID}` | Session UUID | log、session-specific 檔案名 |
| CLAUDE_SKILL_DIR (dollar+braces) | SKILL.md 目錄 | 引用腳本和 references |

**注意**：若 SKILL.md 沒有 `$ARGUMENTS`，Claude Code 自動在末尾附加 `ARGUMENTS: <user input>`。

---

## 動態注入語法

在 SKILL.md 中使用 exclamation + backtick 包裹 shell 命令，Claude Code 會在送給模型前先執行並替換輸出。

範例用法（寫在目標 SKILL.md 中，非本檔案）：
- Git 狀態 → git status --short
- 最近 commit → git log --oneline -5
- 當前分支 → git branch --show-current

**這是預處理**：Claude 只看到輸出結果，不知道執行了什麼命令。

適合：PR 資料、git 狀態、系統資訊、API 即時查詢。

> **注意**：教學類 Skill（如本 Skill）不應直接寫入可執行的預處理語法，否則載入時會觸發 shell 權限檢查。

---

## Invocation Control 矩陣

| 設定 | 使用者可呼叫 | Claude 可呼叫 | Context 載入 | 最適用途 |
|------|:-:|:-:|------|---------|
| 預設 | Yes | Yes | description 常駐 + 全文按需 | 通用型 skill |
| `disable-model-invocation: true` | Yes | No | **零** context | 有副作用操作 |
| `user-invocable: false` | No | Yes | description 常駐 + 全文按需 | 背景知識 |

---

## Context 成本管理

- Skill descriptions 佔 context window 的 **2%**（fallback 16,000 chars）
- `disable-model-invocation: true` = **零 context** 直到使用者呼叫
- Supporting files（references/）= **零 context**，Claude 用 Read 按需載入
- Override budget: `SLASH_COMMAND_TOOL_CHAR_BUDGET` 環境變數
- 檢查: `/context` 會在超 budget 時顯示警告

---

## description 撰寫指引

description 是觸發機制，Claude 根據這個決定是否載入 skill。

**好的 description：**
```
自動產生 ASP.NET Core MVC 的 Controller 和 Model 程式碼。當使用者要求建立 API、
產生 CRUD 操作、或說「幫我建立 Controller」時觸發。支援：(1) 從實體產生完整
Controller，(2) 產生對應的 SQL Server 建表語句，(3) 加入 Swagger 文件註解。
觸發關鍵字：Controller, API, CRUD, Model, 建立 API, generate controller
```

**不好的 description：**
```
產生程式碼的工具。
```

---

## 完整範本

### 參考型（背景知識）

```yaml
---
name: api-conventions
description: API design patterns for this codebase. Use when writing API endpoints.
user-invocable: false
---

When writing API endpoints:
- Use RESTful naming conventions
- Return consistent error formats: `{ error: string, code: number }`
- Include request validation with FluentValidation
```

### 任務型（使用者觸發）

```yaml
---
name: deploy
description: Deploy the application to production
disable-model-invocation: true
argument-hint: "[environment] — staging or production"
allowed-tools: Bash(git *), Bash(npm *), Bash(az *)
---

Deploy $ARGUMENTS to production:
1. Run the test suite: `npm test`
2. Build: `npm run build`
3. Push: `az webapp deploy --name app-$0`
4. Verify: `curl https://app-$0.azurewebsites.net/health`
```

### 研究型（隔離 subagent）

```yaml
---
name: deep-research
description: Research a topic thoroughly in the codebase
context: fork
agent: Explore
argument-hint: "[topic]"
---

Research $ARGUMENTS thoroughly:
1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file:line references
```

### 動態注入型（即時資料）

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Task
Summarize this PR: key changes, risks, and review suggestions.
```

### 帶腳本型（視覺輸出）

```yaml
---
name: codebase-visualizer
description: Generate interactive codebase visualization
allowed-tools: Bash(python *)
disable-model-invocation: true
---

# Codebase Visualizer

Run the visualization script:
```bash
python ${CLAUDE_SKILL_DIR}/scripts/visualize.py .
```

Opens `codebase-map.html` in browser with collapsible tree view.
```

---

## 目錄結構範例

```
my-skill/
├── SKILL.md              # 主說明（必要，< 500 行）
├── references/           # 參考文件（按需載入）
│   ├── api-spec.md       # 詳細 API 規格
│   └── examples.md       # 使用範例
├── scripts/              # 可執行腳本
│   ├── generate.py       # 產生程式碼
│   └── validate.sh       # 驗證工具
└── assets/               # 模板和資源
    └── templates/
        └── default.txt
```

**SKILL.md 引用 supporting files：**
```markdown
## 額外資源
- 完整 API 規格見 [api-spec.md](references/api-spec.md)
- 使用範例見 [examples.md](references/examples.md)
```

Claude 會用 Read 工具在需要時載入這些檔案，不會預先佔用 context。

---

## 簡潔原則

**不要**寫 Claude 已經知道的：
```markdown
## 什麼是 API？
API（Application Programming Interface）是一種...
```

**要**寫專案特有的資訊：
```markdown
## Controller 範本（本專案規範）
使用以下結構，包含審計日誌和權限檢查：
[專案特定程式碼範例]
```
