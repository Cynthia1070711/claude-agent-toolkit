---
name: cc-config-author
version: 1.2.0
updated: 2026-07-19
description: |
  Use when creating, editing, auditing, or refactoring Claude Code config files (CLAUDE.md /
  CLAUDE.local.md / .claude/rules/*.md / .claude/skills/*/SKILL.md / .claude/commands/*.md /
  .claude/agents/*.md / .claude/settings.json / .mcp.json). Provides 2026-Apr spec reference,
  frontmatter field tables, known bugs (#23478, #21858), token budgets, and 7-step audit
  playbook. Trigger keywords + auto-load patterns: see references/triggers.md.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Claude Code 配置健檢與作者指引(2026 Apr 規範)

這個 skill 是 Claude Code 配置檔案的「規範守門員」。當 Claude 要建立或修改任何 `.claude/` 內的檔案,先讀這份再動手,確保符合 2026 年最新規範,避開已知 bug,落實 token 預算。

---

## 何時必須使用

**強觸發條件**(必須讀本 skill):

1. 使用者要 **建立** 新的 `.claude/rules/*.md`、`.claude/skills/*/SKILL.md`、`.claude/commands/*.md`、`.claude/agents/*.md`
2. 使用者要 **修改** `CLAUDE.md` / `CLAUDE.local.md` / `.claude/settings.json` / `.mcp.json`
3. 使用者問「`frontmatter` 怎麼寫」「`paths:` 怎麼用」「為什麼 rule 不觸發」
4. 使用者要做 `.claude/` 目錄健檢、稽核、合規檢查
5. PostToolUse hook 偵測到 `.claude/**` 被寫入時自動載入(配套 hook 設計)

**弱觸發**(視語境):

- 使用者問 Claude Code 「最佳實踐」「規範」「2026 新功能」
- 使用者要把 PhyCool 既有 31 條 rules 重組

**不該觸發**:

- 只是泛泛討論 Claude Code,沒有具體要動配置
- 使用者要寫應用程式碼(那是 PhyCool 業務邏輯,不是 cc 配置)

---

## 7 步驟健檢/作者 playbook

任何 `.claude/` 配置變更前,Claude 依此順序:

### 1. 識別檔案類型

依路徑判斷:

| 路徑模式 | 檔案類型 | 對應 reference |
|---|---|---|
| `CLAUDE.md` / `CLAUDE.local.md`(專案根) | Memory 主檔 | `references/claude-md-spec.md` |
| `~/.claude/CLAUDE.md` | User-level memory | `references/claude-md-spec.md` |
| `.claude/rules/*.md` | Rule(modular memory) | `references/rules-directory-spec.md` |
| `.claude/skills/*/SKILL.md` | Skill | `references/skills-frontmatter-spec.md` |
| `.claude/commands/*.md` | Slash command | `references/commands-spec.md` |
| `.claude/agents/*.md` | Subagent 定義 | `references/subagents-spec.md` |
| `.claude/settings.json` | 專案設定 | `references/settings-json-spec.md` |
| `.mcp.json` | MCP 配置 | `references/settings-json-spec.md`(MCP 段) |

### 2. 讀對應 reference 確認當前規範

不要憑記憶寫 frontmatter。**先讀**對應 reference 檔,因為:

- Anthropic 2026 年至少 3 次新增 frontmatter 欄位(`paths`、`hooks`、`effort`、`isolation`、`background`...)
- 已知 bugs 影響某些配置實際行為(見 step 5)
- Opus 4.7 有不相容變更(`thinking.budget_tokens` 移除等)

### 3. 套用 token 預算

每個檔案有預算上限,**不可超越**:

| 檔案 | 軟上限 | 硬上限 | 超出後果 |
|---|---|---|---|
| `CLAUDE.md`(專案根) | 120 行 | 200 行 | Claude 指令遵循率下降 |
| `CLAUDE.local.md` | 30 行 | 80 行 | 同上 |
| 單條 rule(always-on,無 paths) | 60 行 | 100 行 | 與其他 rules 競爭 instruction slots |
| 單條 rule(有 paths) | 150 行 | 250 行 | 觸發時佔比過大 |
| `SKILL.md` body | 300 行 | 500 行 | 觸發後過度膨脹 context |
| 單個 command | 50 行 | 100 行 | UX 變差 |
| Subagent system prompt | 150 行 | 300 行 | isolated context 浪費 |

⚠️ **PhyCool 警示**:當前 31 條 rules 全 always-on,**估 42k tokens**,遠超官方建議的「100-150 條指令上限」。任何新建 rule 都要評估是否該轉成 skill 或 hook。

### 4. 套用 frontmatter spec

每個檔案類型的必填/選填欄位不同。簡表:

#### CLAUDE.md / CLAUDE.local.md

**無 frontmatter**(純 markdown)。

#### .claude/rules/*.md

```yaml
---
paths:                          # 選填,2026 新增,讓 rule lazy-load
  - "src/api/**/*.ts"
  - "**/*.config.{ts,json}"
---
```

⚠️ **Bug #23478**:`paths:` 在 **Write 工具觸發時不載入**(只在 Read 觸發)。
⚠️ **Bug #21858**:user-level rules 的 `paths:` 完全失效。

#### .claude/skills/<name>/SKILL.md

```yaml
---
name: my-skill                  # 必填,lowercase + hyphens,≤64 chars,不可含 "claude"
description: |                  # 必填,第三人稱,包含 what + when triggers
  This skill should be used when...
allowed-tools: Read, Grep, Glob # 選填,限制工具白名單
paths:                          # 選填,只在工作路徑符合時觸發
  - "src/**"
model: opus                     # 選填,override 預設模型
effort: xhigh                   # 選填,override 預設 effort
disable-model-invocation: false # 選填,true = 只能手動 /name 觸發
argument-hint: <required> [opt] # 選填,展示用
hooks:                          # 選填,skill 內嵌 hook
  PreToolUse: ...
---
```

#### .claude/commands/*.md

```yaml
---
description: One line in /help          # 選填但強烈建議,≤60 chars
allowed-tools: Bash(git:*), Read        # 選填,限制工具
argument-hint: [issue-number]           # 選填,展示用
model: haiku                            # 選填,override 預設模型
disable-model-invocation: true          # 選填,true = 不能被自動觸發
---

Command body 內可用 4 種動態語法(完整字面範例見 references/commands-spec.md · 本檔描述化避免被預處理注入):
- ARGUMENTS 變數(dollar 前綴)— 整個 trailing string
- 位置參數(dollar 1 / dollar 2)
- 驚嘆號前綴接反引號包命令 — 執行 bash 並嵌入結果(需 allowed-tools)
- at 前綴接檔案路徑 — 嵌入檔案內容
```

#### .claude/agents/*.md

```yaml
---
name: orchestrator-pm           # 必填
description: |                  # 必填,Claude 用此決定何時委派
  Use when user describes a new feature...
tools: Read, Glob, Grep, Write  # 選填,工具白名單(omit = 繼承 parent)
disallowedTools: []             # 選填,黑名單
model: opus                     # 選填,可填 alias 或完整 model ID
effort: xhigh                   # 選填
permissionMode: default         # 選填
mcpServers: []                  # 選填,限制 MCP 存取
hooks: {...}                    # 選填,subagent 內嵌 hook
maxTurns: 30                    # 選填,Turn 上限
skills:                         # 選填,**必填當需要 parent skills 時**
  - story-spec-author
isolation: worktree             # 選填,2026 新增,git worktree 隔離
memory: false                   # 選填
background: false               # 選填
color: blue                     # 選填,純 UI 用
---

You are PhyCool's PM agent. Your role is to...
```

⚠️ **重要**:Subagent **不繼承** parent 的 skills,必須在 `skills:` frontmatter 顯式列出。

#### .claude/settings.json

無 frontmatter(純 JSON)。主要欄位見 `references/settings-json-spec.md`。

### 5. 檢查已知 bugs 影響

對照 `references/known-bugs.md`,確認當前操作不會踩到:

- [`#23478`] paths rules 在 Write 不觸發 → 重要規則同時放 CLAUDE.md 或寫 hook 兜底
- [`#21858`] user-level paths 完全失效 → 不要在 `~/.claude/rules/` 用 paths
- [`#16299`] 部分版本 paths rules 全載入(無視 frontmatter)→ 用 `/memory` 驗證真實載入

### 6. 寫入並驗證

**寫入順序**:

1. 從 `assets/templates/` 取對應檔案類型範本
2. 填入必要欄位
3. **read-before-modify**:若是修改既有檔案,先 Read 完整內容(constitutional-standard 規範)
4. Write 或 Edit
5. **JSON 檔案驗證**:`node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`
6. **YAML frontmatter 驗證**:用 `references/validate-frontmatter.md` 的方法檢查

### 7. 提示使用者重啟條件

某些配置變更**不會熱套用**:

| 變更類型 | 是否需重啟 | 替代方案 |
|---|---|---|
| `.claude/settings.json` 的 `hooks` 區塊 | **必須重啟** | `/clear` 或退出 CLI 重啟 |
| `.claude/settings.json` 的 `env`、`permissions` | 部分需重啟 | 視變數而定 |
| CLAUDE.md / rules | 可即時觸發 | 但 already-loaded 部分需 `/clear` |
| 新增 skill / command / agent | 即時可用 | 新檔案會被 watch |
| `.mcp.json` | 必須重啟 | MCP server 連線 |

完成配置變更後,**主動告知**使用者是否需要 `/clear` 或重啟。

---

## 配置健檢決策樹

當使用者只說「我想改 .claude 配置」沒講具體做什麼,用此順序判斷:

```
使用者意圖
├─ 想加新規則(rule)?
│  ├─ 規則違規時有具體可偵測訊號 → 寫成 Hook(載入 hooks-mechanization skill)
│  ├─ 規則是「Claude 該怎麼做」的指引,只在特定檔案類型觸發 → rule + paths:
│  ├─ 規則是「Claude 該怎麼做」的指引,但只在使用者明確要時 → skill
│  └─ 規則是「全域不可妥協」 → CLAUDE.md(注意 ≤120 行)
├─ 想加快捷指令?
│  └─ slash command(.claude/commands/)
├─ 想加可重複的工作流程?
│  └─ skill(.claude/skills/)
├─ 想隔離一個專業任務的 context?
│  └─ subagent(.claude/agents/)
├─ 想自動化某個生命週期事件?
│  └─ hook(在 settings.json 註冊,實作放 .claude/hooks/)
└─ 想限制 Claude 能做什麼?
   └─ settings.json permissions
```

---

## 整合 PhyCool 既有約束

PhyCool 環境特殊:Windows 11 + PowerShell 5.1 + Antigravity IDE。任何配置必須:

1. **路徑用正斜線或 `$CLAUDE_PROJECT_DIR`**:`cd "C:/path"` 或 `cd "$CLAUDE_PROJECT_DIR"`,**不要**寫死絕對路徑或用反斜線
2. **編碼 UTF-8 BOM**:寫 `.ps1` 用 `[System.IO.File]::WriteAllText`,寫 `.cs` 也是
3. **使用 zh-TW**:任何 description / system prompt / additionalContext 用繁體中文
4. **NT$ 計價**:任何成本估算用台幣
5. **嚴禁「對齁」typo**:正確是「對齊」
6. **file:line 引用**:憲法級規範,任何引用 PhyCool 程式碼必須附 `path/to/file.cs:42` 格式

---

## 範本與 reference 索引

### `assets/templates/` 範本(複製即用)

- `claude-md.md` — CLAUDE.md 起始範本(精簡版,≤80 行)
- `rule-with-paths.md` — 帶 paths frontmatter 的 rule
- `skill.md` — SKILL.md 起始範本
- `command.md` — slash command 範本
- `subagent.md` — subagent 範本
- `settings.json` — 完整 settings.json 範本(含 hooks/env/permissions)

### `references/` 細節文檔(progressive disclosure,只在需要時讀)

- `claude-md-spec.md` — CLAUDE.md 全規範
- `rules-directory-spec.md` — `.claude/rules/` 載入機制 + 4 個已知 bugs
- `skills-frontmatter-spec.md` — SKILL.md 15 欄位完整對照
- `commands-spec.md` — Slash command 規範(ARGUMENTS 變數 / 位置參數 / 驚嘆號前綴 / at 嵌入)
- `subagents-spec.md` — Subagent frontmatter + skill preload 規則
- `settings-json-spec.md` — settings.json 完整結構
- `known-bugs.md` — 4 個已知 GitHub issues 與 workaround
- `version-watch-2026.md` — 2026 重要版本變更與相容性

### `scripts/` 自動化工具

- `audit-config.js` — 掃描整個 `.claude/` 產生不合規報告

執行方式:

```bash
node .claude/skills/cc-config-author/scripts/audit-config.js
```

---

## 配套機制(建議 PhyCool 部署)

要讓這個 skill 真的「**自動**」執行健檢,而非依賴 Claude 主動載入,搭配下列 3 個機制:

### 機制 A:PostToolUse hook(強制觸發)

在 `.claude/settings.json` 加:

```json
"PostToolUse": [{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/cc-config-guard.js\"",
    "timeout": 3000
  }]
}]
```

`cc-config-guard.js` 偵測 `.claude/**` 寫入時,注入 `additionalContext` 提醒 Claude 讀本 skill。範本見 `scripts/cc-config-guard.js`。

### 機制 B:paths-scoped rule(輕量提示)

在 `.claude/rules/cc-config-guidance.md`:

```yaml
---
paths:
  - ".claude/**/*.md"
  - ".claude/**/*.json"
  - "CLAUDE.md"
  - "CLAUDE.local.md"
---

# Claude Code 配置作者紀律

當你在編輯任何 .claude/ 配置時,主動 invoke `cc-config-author` skill
確認你的變更符合 2026 Apr 規範,並避開 Issue #23478 / #21858。
```

⚠️ Bug #23478 影響此 rule 在 Write 時不載入,所以**必須**搭配機制 A 兜底。

### 機制 C:slash command(明確 invoke)

`.claude/commands/cc-audit.md`:

```yaml
---
description: 健檢 .claude 配置是否符合 2026 規範
allowed-tools: Read, Glob, Bash(node:*)
---

Use the cc-config-author skill to audit all .claude/ configuration files.
Run scripts/audit-config.js and produce a compliance report covering:

1. CLAUDE.md / CLAUDE.local.md 行數與 token 預算
2. .claude/rules/*.md 是否有 paths frontmatter
3. .claude/skills/*/SKILL.md 是否符合 ≤500 行軟上限
4. .claude/commands/*.md 是否有 description
5. .claude/agents/*.md 是否有 description + tools
6. .claude/settings.json hooks 是否有過時欄位(MAX_THINKING_TOKENS 等)
7. 已知 bugs 對當前配置的實際影響

Output: 不合規清單 + 建議 fix。
```

使用方式:`/cc-audit`

---

## 不該做的事(紅線)

1. **不要在 CLAUDE.md 寫超過 120 行** — 官方明確指出超過後 instruction adherence drop
2. **不要在 rule frontmatter 用 globs:** — 那是 Cursor 的語法,Claude Code 用 `paths:`
3. **不要把 skill name 開頭設為 "claude-"** — Anthropic 保留字
4. **不要把 settings.json 改成單行** — 失去可維護性,且 hooks 區塊難 debug
5. **不要在 user-level rules 用 paths:** — Bug #21858,完全失效
6. **不要假設規則永遠 always-on** — 沒 paths 才 always-on,有 paths 是 lazy-load
7. **不要把長 SKILL.md 全塞在主檔** — Progressive disclosure 設計,>500 行就分拆 references
8. **不要在 subagent frontmatter 漏掉 skills:** — Subagent 不繼承 parent skills
9. **不要硬編碼絕對路徑** — 用 `$CLAUDE_PROJECT_DIR`
10. **不要忘記告知使用者重啟需求** — settings.json 的 hooks 不熱套用

---

## 與其他 skill 的關係

- `hooks-mechanization` — 當 user 要把 rule 轉成 hook 時,本 skill 把使用者導向那個 skill
- `skill-creator`(Anthropic 官方) — 當 user 要建立**新 skill 本身**時用那個,本 skill 處理「skill 是否符合規範」

---

## 配套 audit 命令

當 user 說「健檢一下」或執行 `/cc-audit`,跑:

```bash
node .claude/skills/cc-config-author/scripts/audit-config.js
```

腳本會輸出:

- 每個檔案的合規/不合規狀態
- 預估 token 消耗
- 必須修正項清單
- 建議精簡方向

詳細邏輯見 `scripts/audit-config.js`。

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.2.0** | **2026-07-19** | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` 指引由「固定 60(not 85)」改為「**依模型 context window 縮放**」:1M 模型(Opus 4.8 / Sonnet 5 / Fable 5)用 **95 = CLI 原生預設**(window 夠大,提早壓縮浪費可用空間;且 compaction 本身有損,少壓縮優於早壓縮),小 window 模型才調低以避 lost-in-the-middle。同步 2 處:**活躍 hook** `scripts/cc-config-guard.js:76`(settings.json 編輯時注入之提示訊息 · settings.json:230 註冊)+ `assets/templates/settings.json` 註解與值。觸發:2026-07-19 使用者裁定專案 `.claude/settings.json` 由 60 → 95(理由「目前都是 1M 了」· commit `eb6a9c58`),經 cross-ref 掃描發現本 skill 之 hook 提示與範本會與新值牴觸。走 `Skill(skill="skill-builder")` Mode B。 |
| 1.1.0 | 2026-05-16 | (既有,無沿革表時之推定版本) |
