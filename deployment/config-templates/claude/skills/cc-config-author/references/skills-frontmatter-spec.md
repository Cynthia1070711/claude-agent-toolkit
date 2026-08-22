# SKILL.md Frontmatter 完整規範(2026 Apr)

15 個欄位 + Progressive disclosure 架構。任何新建或修改 SKILL.md 前讀這份。

---

## Progressive Disclosure(進階揭露)架構

理解這個是 SKILL.md 的關鍵。Claude 載入 skill 分 **3 階段**:

| 階段 | 載入內容 | Tokens | 觸發 |
|---|---|---|---|
| 1. Metadata | name + description | ~100/skill | Session 啟動,所有 skills |
| 2. SKILL.md body | 完整 markdown | ≤2500(理想) | Description 匹配當前任務 |
| 3. Bundled resources | references/, scripts/, assets/ | 無上限 | 顯式 Read/Bash 載入 |

> 引用 Anthropic Skills Architecture(2026):
> 可以裝 50+ skills 而沒有 context penalty,因為只有 metadata 永遠在 context

**設計含義**:
- 把 always-needed 內容放 SKILL.md
- 細節範例、長文件、腳本放 `references/` 與 `scripts/`,需要時才讓 Claude 自行 Read

---

## 15 個 frontmatter 欄位

| 欄位 | 必填 | 預設 | 用途 |
|---|---|---|---|
| `name` | ✅ | 父資料夾名 | Skill 識別,`/<name>` 觸發 |
| `description` | ✅ | — | Skill 觸發判斷的核心,**最重要** |
| `allowed-tools` | ❌ | 全工具 | 限制工具白名單 |
| `paths` | ❌ | 任何路徑 | 只在工作目錄符合時觸發 |
| `model` | ❌ | 繼承 session | Override 模型(opus/sonnet/haiku) |
| `effort` | ❌ | 繼承 session | Override effort(low/medium/high/xhigh/max) |
| `disable-model-invocation` | ❌ | false | true = 只能手動 `/name`,不能 auto-trigger |
| `argument-hint` | ❌ | — | 純 UX,展示在 autocomplete |
| `arguments` | ❌ | — | 結構化參數定義(對應 `$name`) |
| `hooks` | ❌ | — | Skill 內嵌 hook |
| `mcpServers` | ❌ | 繼承 | 限制 MCP 存取 |
| `permissionMode` | ❌ | default | default / plan / auto |
| `context` | ❌ | — | `fork` 表示 spawn 隔離 context 跑 |
| `version` | ❌ | — | 版本字串(觀測用) |
| `license` | ❌ | — | 散布時的授權聲明 |

---

## 必填欄位深度解析

### name

**規則**:
- Lowercase letters, numbers, hyphens only
- ≤64 chars
- 不可含 `claude`(Anthropic 保留字)
- 對應 `/<name>` 觸發語

**範例**:
- ✅ `cc-config-author`
- ✅ `hooks-mechanization`
- ✅ `pdf-extract`
- ❌ `Claude-Skill`(有大寫且含 claude)
- ❌ `pdf_extract`(底線)
- ❌ `claude-helper`(含 claude)

### description

**這是最重要的欄位**。Claude 用 description 決定何時載入這個 skill。

**規則**:
- 第三人稱(`This skill should be used when...`)
- 包含 **what**(做什麼)+ **when**(觸發條件)
- **稍微「pushy」**:Claude 傾向 undertrigger,description 要明確指引何時必須觸發
- ≤200 chars(指南)/ ≤1024 chars(硬上限)

**好範例**:
```yaml
description: |
  This skill should be used when the user wants to create or modify hooks in
  .claude/settings.json, write PostToolUse / PreToolUse / Stop hooks, debug
  hook failures, or convert a rule into a deterministic hook. Trigger phrases:
  "做成 hook"、"機械化"、"PreToolUse"、"hook 不觸發"、"async hook".
```

**壞範例**:
```yaml
description: Helps with hooks.
# 太模糊,Claude 不知何時用
```

```yaml
description: Use this skill.
# 完全沒說做什麼
```

**頻繁失誤**:第一人稱

```yaml
description: I help you write hooks.  # ❌ 第一人稱
description: Use me to write hooks.   # ❌ 第二人稱
description: This skill writes hooks. # ✅ 第三人稱
```

---

## 選填欄位重點

### allowed-tools

限制 skill 觸發時可用的工具。安全性與聚焦兼具。

```yaml
allowed-tools: Read, Glob, Grep         # 唯讀
allowed-tools: Bash(git:*), Read         # 只能跑 git 命令
allowed-tools: "Read, Glob, Grep, Bash(node:*)"  # 字串形式也可
```

工具語法:
- 純工具名:`Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`
- 子命令限制:`Bash(git:*)`, `Bash(npm:*)`
- MCP 工具:`mcp__server__tool`

### paths

只在工作路徑匹配時觸發(降低 token 成本)。

```yaml
paths:
  - "src/**"
  - "**/*.config.ts"
```

⚠️ **同 rules 的 Bug**:paths 在 Write 工具觸發時不載入。

### model + effort

Override 該 skill 觸發時用的模型與 effort。

```yaml
model: haiku              # 用 Haiku 跑這個 skill(降低成本)
effort: medium            # 用 medium effort
```

**何時 override**:
- 唯讀探索類 skill → haiku + medium
- 高複雜度判斷類 → opus + xhigh
- 一般實作類 → 繼承 session(別填)

### disable-model-invocation

```yaml
disable-model-invocation: true   # 只能手動 /skill-name 觸發
```

**何時用**:
- 有副作用的 skill(如部署、刪除)
- 想完全控制觸發時機

### hooks(skill 內嵌)

Skill 可自帶 hook,觸發時生效:

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-bash.sh"
```

**何時用**:Skill 行為需要額外閘門時(如 db-migration skill 加 PreToolUse 攔截危險 SQL)。

### arguments / argument-hint

```yaml
name: deploy
arguments:
  - branch
  - environment
argument-hint: <branch> <environment>
---

Deploy $branch to $environment.
```

User 輸入 `/deploy main staging` → `$branch=main`, `$environment=staging`。

**對比** `$ARGUMENTS`:
- `$ARGUMENTS` — 整個 trailing string(舊機制)
- `$1`, `$2` — 位置參數
- `$branch`, `$environment` — 命名參數(新,搭配 `arguments:` frontmatter)

---

## 行數預算

| 部位 | 軟上限 | 硬上限 |
|---|---|---|
| SKILL.md body | 300 行 | 500 行 |
| 單個 reference 檔 | 250 行 | 400 行 |
| 單個 script 檔 | 200 行 | 500 行 |

⚠️ 接近 500 行就**拆出 references/**。

---

## 目錄結構建議

```
my-skill/
├── SKILL.md                # 必填,主檔
├── scripts/                # 選填,可執行檔(Python/Node/Bash)
│   └── do-thing.js
├── references/             # 選填,長文檔(只在需要時 Read)
│   └── deep-dive.md
└── assets/                 # 選填,靜態資源(範本、icons、固定資料)
    └── template.json
```

**Anthropic 官方範例**(PDF skill):

```
pdf-skill/
├── SKILL.md                # 短指引 + 何時讀哪個 reference
├── FORMS.md                # 表單填寫(Reference,只在用戶提 form 時讀)
└── REFERENCE.md            # 完整 API 參考(只在進階用法讀)
```

---

## description 寫作 anti-patterns

### A1. 太短

```yaml
description: Helps with PDFs.
```
→ Claude 完全不知何時用

### A2. 太長(>1024 chars)

→ 浪費 always-on tokens(每個 skill 都載入 metadata)

### A3. 第一人稱 / 第二人稱

```yaml
description: I can help you write hooks.
description: Use me when you want hooks.
```
→ Claude 看到自己被當作工具有點精神分裂,觸發判斷錯亂

### A4. 沒有觸發條件

```yaml
description: This skill writes hooks.
```
→ Claude 不知何時「該寫 hooks」。要加 trigger phrases。

### A5. 觸發條件太籠統

```yaml
description: Use when working with files.
```
→ 任何任務都涉及檔案,會 over-trigger

---

## 健檢清單

新建 SKILL.md:

- [ ] `name` 沒有大寫、底線、不含 `claude`
- [ ] `description` 第三人稱
- [ ] `description` 包含 what + when
- [ ] `description` 有具體 trigger phrases
- [ ] `description` 「稍微 pushy」(避免 undertrigger)
- [ ] SKILL.md body ≤500 行
- [ ] 細節已拆到 references/ 或 scripts/
- [ ] `allowed-tools` 已限制(如果不需要全工具)
- [ ] 考慮過 `paths:` 是否能進一步降低觸發成本
- [ ] 考慮過 `model: haiku` 是否能省成本

---

## 與 commands 的關係

從 2026 Apr 起,**slash commands 已合併到 skills**:

> `.claude/commands/deploy.md` 與 `.claude/skills/deploy/SKILL.md` 都可建立 `/deploy`,行為相同。

差別:
- Skill 可有 bundled resources(references/、scripts/)
- Skill 可被 auto-trigger(不只手動 `/name`)
- Skill 可有 paths frontmatter

**遷移建議**:新建一律用 skill,舊 commands 留著仍可用(向後相容)。