# Slash Commands 規範(2026 Apr)

`.claude/commands/*.md` 與 `.claude/skills/*/SKILL.md` 已**整併**(2026 Apr)。但兩者仍有差異。

---

## Commands vs Skills 差異

| 特性 | Commands | Skills |
|---|---|---|
| 路徑 | `.claude/commands/<name>.md` | `.claude/skills/<name>/SKILL.md` |
| 結構 | 單檔 | 可有 references/ scripts/ assets/ |
| Auto-trigger | ❌ 只能手動 `/name` | ✅ description 匹配時自動載入 |
| Bundled resources | ❌ | ✅ |
| paths frontmatter | ❌(沒這欄位) | ✅ |
| 適合 | 簡單可重複的 prompt | 完整可重複的工作流程 |

> 引用官方 docs(2026 Apr):
> 一個檔案在 `.claude/commands/deploy.md` 和一個 skill 在 `.claude/skills/deploy/SKILL.md` 都會建立 `/deploy` 命令,行為一樣。

**新建一律用 skill**(向後相容,但功能更全)。舊 commands 不必遷移。

---

## Command frontmatter(7 欄位)

```yaml
---
description: One-line in /help          # 強烈建議,≤60 chars
allowed-tools: Bash(git:*), Read         # 限制工具
argument-hint: [issue-number] [priority] # 純 UX
model: haiku                             # Override 模型
disable-model-invocation: true           # 不能 auto-trigger(只能 /name)
hooks: {...}                             # 內嵌 hook(2026 Mar+)
context: fork                            # 在 isolated context 跑(2026 Apr)
---
```

---

## Command body 特殊語法

### $ARGUMENTS

```markdown
# .claude/commands/fix-issue.md
---
description: 修復 GitHub issue
argument-hint: <issue-number>
---

Fix issue #$ARGUMENTS. Follow these steps:
1. Use gh issue view to read the issue
2. ...
```

User 輸入 `/fix-issue 123`,Claude 看到的 prompt 是:`Fix issue #123. Follow these steps...`

`$ARGUMENTS` = 整個 trailing string,**包含所有空白與引號**。

### $1, $2(位置參數)

```markdown
---
argument-hint: <issue-number> <priority>
---

Fix issue #$1 with priority $2.
```

User 輸入 `/fix-issue 123 high` → `$1=123`, `$2=high`。

### !`bash command`(嵌入 bash 輸出)

需要 `allowed-tools` 中授權對應 Bash 子命令:

```markdown
---
description: 解釋 git diff
allowed-tools: Bash(git:*)
---

## Context
- Current branch: !`git branch --show-current`
- Recent changes: !`git diff HEAD`

## Task
Explain the changes above in plain language.
```

`!` 前綴的命令**立即執行**,結果嵌入 prompt。Claude 看到的是執行結果,不是命令本身。

### @file/path(嵌入檔案內容)

```markdown
Review the implementation in @src/utils/helpers.ts
Compare @src/old.ts with @src/new.ts
```

Claude Code 自動 Read 這些檔案並嵌入。**無需** `allowed-tools` 授權(因為這是 Code 自己 Read,不是 user-invoked Bash)。

---

## 範例命令(複製即用)

### Fix issue

```markdown
---
description: 修復 GitHub issue
argument-hint: <issue-number>
allowed-tools: Bash(gh:*), Read, Edit
model: sonnet
---

Fix issue #$ARGUMENTS:
1. !`gh issue view $ARGUMENTS`
2. Understand the problem
3. Search the codebase for relevant files
4. Implement the fix following CLAUDE.md conventions
5. Write tests to verify
6. Commit with conventional-commits format
```

### Commit with sanity checks

```markdown
---
description: Commit with pre-checks
argument-hint: [message]
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git commit:*)
model: haiku
---

Before committing:
1. Check current status: !`git status`
2. Check diff: !`git diff HEAD`
3. Scan for TODOs in staged files
4. Scan for console.log / print statements
5. If issues found, ask user before proceeding

Then commit with message: $ARGUMENTS
Use conventional-commits format.
```

### Production deploy approval

```markdown
---
description: 生產部署核准
argument-hint: <deployment-id>
disable-model-invocation: true
allowed-tools: Bash(gh:*)
---

<!-- 此命令需要人工判斷,不可自動觸發 -->

Review deployment $1 for production approval:

Deployment details: !`gh api /deployments/$1`

Verify:
- [ ] All tests passed
- [ ] Security scan clean
- [ ] Stakeholder approval recorded
- [ ] Rollback plan ready

User must type "APPROVED" to confirm.
```

### Test runner

```markdown
---
description: 跑符合 pattern 的測試
argument-hint: [test-pattern]
allowed-tools: Bash(dotnet:*), Read
---

Run tests matching: $ARGUMENTS

1. Detect test framework (xUnit / NUnit / MSTest)
2. Run with provided pattern
3. If failures, analyze and fix
4. Re-run to verify
```

---

## Namespacing(子目錄)

```
.claude/commands/
├── git/
│   ├── commit.md     → /project:git:commit
│   └── push.md       → /project:git:push
└── deploy/
    └── staging.md    → /project:deploy:staging
```

子目錄名變成 namespace 前綴。

⚠️ **但 skill 不支援 namespace**:`.claude/skills/git/commit/SKILL.md` 仍是 `/commit`,不是 `/project:git:commit`。

---

## 行數預算

| 類型 | 軟上限 | 硬上限 |
|---|---|---|
| 簡單命令 | 30 行 | 80 行 |
| 含 bash injection / 多步驟 | 80 行 | 150 行 |

超過 80 行,改寫成 skill 並用 references/ 分拆。

---

## description 寫作要點

- ≤60 chars(顯示在 `/help` 列表)
- 動詞開頭(`修復`、`部署`、`檢查`)
- 不要重複命令名(已經顯示了)

範例:

```yaml
description: 修復 GitHub issue
description: 部署到 staging
description: 跑符合 pattern 的測試
```

不好的:

```yaml
description: This command is used to fix issues...  # 太長
description: fix-issue                              # 重複命令名
description: 修復                                    # 太短沒上下文
```

---

## allowed-tools 設定範例

| 用途 | 設定 |
|---|---|
| 唯讀稽核命令 | `Read, Grep, Glob` |
| Git 操作 | `Bash(git:*)` |
| 部署命令 | `Bash(kubectl:*), Bash(helm:*), Read` |
| 全工具 | omit(預設繼承) |
| 完全禁止任何工具 | `[]` 或 `"none"` |

---

## 健檢清單

新建 command:

- [ ] `description` 已填且 ≤60 chars
- [ ] 用了 `$ARGUMENTS` 或 `$1, $2` 而非硬編碼
- [ ] 用了 `!` 嵌入動態資訊(若適用)
- [ ] 用了 `@file` 而非要 user 貼上檔案內容
- [ ] `allowed-tools` 限制(若命令有風險)
- [ ] `disable-model-invocation: true`(若有副作用)
- [ ] 體積 ≤80 行(否則改 skill)
- [ ] 考慮過要不要 namespace(`git/`、`deploy/`)

---

## PhyCool 適用建議

PhyCool 常用工作流可作為 commands(降低重複輸入):

- `/pc:story-create` — 用 orchestrator-pm subagent 起新 story
- `/pc:bmad-status` — 列出當前 stories status
- `/pc:cr-build` — Vite build + Excel 驗證
- `/pc:deploy-iis` — IIS 部署檢核清單

這些都應該是 skill(因為需要 trigger by description,不只手動 `/`)。