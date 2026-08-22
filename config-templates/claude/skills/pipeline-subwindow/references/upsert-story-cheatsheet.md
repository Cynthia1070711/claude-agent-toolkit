# upsert-story.js Cheatsheet

> 子視窗最常用的 stories 表寫工具完整範例。**MCP 無 stories write tool**,寫操作必走此 CLI。

## §1 三種模式

### Mode 1: 新建 Story(完整 upsert)

```bash
# JSON 內含 story_id,自動偵測:不存在 → 新建
node .context-db/scripts/upsert-story.js --inline '{
  "story_id": "skl-99-example",
  "epic_id": "epic-skl",
  "domain": "skill-governance",
  "title": "Example Story",
  "status": "backlog",
  "priority": "P0",
  "complexity": "S",
  "user_story": "As a ...",
  "background": "...",
  "acceptance_criteria": "..."
}'
```

### Mode 2: 部分更新 — inline JSON(子視窗最常用)

```bash
# 三個 args: --merge {story-id} --inline {json}
# JSON 不需含 story_id(因 args[1] 已給)
node .context-db/scripts/upsert-story.js --merge skl-01-pressure-test-and-forbidden-closure --inline '{
  "status": "review",
  "dev_agent": "CC-SONNET"
}'
```

### Mode 3: 部分更新 — JSON 檔案

```bash
# JSON 檔內仍可含 story_id 欄位供人閱讀對照,但 CLI 不會從中回推 —
# story-id 是必要的 positional arg,必須顯式帶在 --merge 之後
echo '{
  "story_id": "skl-01-...",
  "status": "review",
  "dev_agent": "CC-SONNET"
}' > .context-db/tmp-update.json

node .context-db/scripts/upsert-story.js --merge skl-01-pressure-test-and-forbidden-closure .context-db/tmp-update.json
```

> `upsert-story.js` 以 `args[1]` 取 `storyId`、`args[2]` 判斷是 `--inline` 還是檔案路徑(見 CLI 原始碼 `--merge` 解析區塊),不會解析 JSON 內容找 `story_id` 欄位。漏帶 story-id positional arg 時,`args[2]` 會被誤判為檔案路徑,對應到本檔 §3「錯誤 1」的失敗模式。

## §2 子視窗常用 use-case

### Use-case 1: dev-story 完成 → status=review

```bash
node .context-db/scripts/upsert-story.js --merge {story-id} --inline '{
  "status": "review",
  "dev_agent": "CC-SONNET",
  "file_list": [
    "src/.../File1.tsx",
    "src/.../File2.cs"
  ]
}'
```

> `completed_at` 由 `node scripts/record-phase-timestamp.js {story-id} dev-complete` 補強(COALESCE 保護)

### Use-case 2: code-review 完成 → status=done

```bash
node .context-db/scripts/upsert-story.js --merge {story-id} --inline '{
  "status": "done",
  "review_agent": "CC-OPUS",
  "cr_score": 95,
  "cr_issues_total": 8,
  "cr_issues_fixed": 7,
  "cr_issues_deferred": 1,
  "cr_summary": "..."
}'
```

> `review_completed_at` 由 `node scripts/record-phase-timestamp.js {story-id} review-complete` 補強

### Use-case 3: tasks 回填(經由 tasks-backfill-verify Skill)

```bash
# Skill 引導下生成,不手寫 tasks 字串
# tasks 格式: ✅ 在前 (file:line) 在後
node .context-db/scripts/upsert-story.js --merge {story-id} --inline '{
  "tasks": "- ✅ Task 1: ... (.claude/skills/.../SKILL.md:42)\n- ⬜ Task 2: ... (deferred)"
}'
```

### Use-case 4: 補 background / dev_notes(create-story 階段)

```bash
node .context-db/scripts/upsert-story.js --merge {story-id} --inline '{
  "background": "完整 file:line 證據 + ADR 引用 + ...",
  "dev_notes": "[From original: §Self-Sufficiency Checklist]\n..."
}'
```

## §3 ❌ 常見錯誤(避免)

### 錯誤 1: --merge 漏 story-id

```bash
# ❌
node .context-db/scripts/upsert-story.js --merge '{"status":"review"}'
# Error: paths[0] argument must be of type string. Received undefined
# 原因: script 把 '{json}' 當 story-id,然後 args[2] 不存在 → path.resolve(undefined)
```

### 錯誤 2: 用 --help

```bash
# ❌
node .context-db/scripts/upsert-story.js --help
# Error: ENOENT: '...\--help' as JSON file
# 原因: script 沒實作 --help,所有非 --inline / --merge 的 arg 被當 JSON 檔路徑
```

### 錯誤 3: bash heredoc 多重轉義地獄

```bash
# ❌ 巢狀 escape 容易壞
node -e "const r = JSON.parse(\`{\\\"status\\\":\\\"review\\\"}\`); ..."

# ✅ 寫 temp .js 檔再 node 執行
echo 'const r = {"status":"review"}; console.log(r);' > tmp.js && node tmp.js && rm tmp.js
```

### 錯誤 4: inline JSON 含 backtick/反斜線

```bash
# ❌ Windows PowerShell 對 backtick / dollar 有特殊解釋
node ... --inline '{"command":"`Get-Date`"}'

# ✅ 改用 JSON 檔 mode(Mode 3)避免 escape 問題
```

## §4 lifecycle 推進對照表

| 階段 | 觸發 update | upsert-story.js auto-promote |
|------|-----------|------------------------------|
| backlog | (none) | — |
| ready-for-dev | `create_completed_at` 寫入 | ✅ status: backlog → ready-for-dev |
| in-progress | `started_at` 寫入(由 record-phase-timestamp dev-start) | (status 維持 ready-for-dev,dev-story 自己改 in-progress) |
| review | `completed_at` 寫入 | ✅ status: in-progress → review |
| done | `review_completed_at` 寫入 | ✅ status: review → done |

## §5 範本:典型子視窗 dev-story 完成命令

```bash
# Step 1: 寫 stories 表
node .context-db/scripts/upsert-story.js --merge {story-id} --inline '{
  "status": "review",
  "dev_agent": "{CC-SONNET|CC-OPUS}",
  "file_list": [...]
}'

# Step 2: 補 completed_at(COALESCE 保護)
node scripts/record-phase-timestamp.js {story-id} dev-complete

# Step 3: 驗證
# Tool: mcp__phycool-context__search_stories
# Args: { story_id: "{story-id}" }
# 確認: status="review" + dev_agent 非 NULL + completed_at 非 NULL
```
