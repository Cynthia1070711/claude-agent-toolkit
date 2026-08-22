---
name: story-status-emoji
description: >
  Use when workflow (create-story, dev-story, code-review) 更新 Story 狀態後，
  需同步 Story .md 檔 H1 標題行的狀態 emoji 時。僅適用於**實體存在 .md 檔**的
  legacy Story；DB-first Story（無 .md 鏡像）無標的，屬 N/A。
  觸發關鍵字：story-status-emoji, 狀態符號, 標題 emoji, status indicator,
  batch-update-emoji, Story 狀態變更, story file heading, 文檔狀態標記。
  支援單檔模式、批次掃描模式、以及 done + 延後項目的雙符號組合標記。
version: 1.1.1
updated: 2026-07-28
triggers:
  - status emoji
  - heading emoji
  - batch-update-emoji
author: CC-OPUS
created: 2026-02-27
last-synced-epic: epic-tdb
last-synced-date: 2026-07-28
---

# Story Status Emoji — 文檔狀態視覺指標

## Overview

Maintains visual status indicators (emoji) in Story file H1 headings, enabling
instant visual scanning of document status. Every Story file's first line follows:

```
# {emoji} Story {ID}: {Title}
```

This skill is invoked **automatically by workflows** and can also run in **batch mode**.

---

## 1. Status-Emoji Mapping Table

### Standard Workflow States

| Status | Emoji | Example |
|--------|-------|---------|
| `backlog` | ⚪ | `# ⚪ Story QGR-A1: ...` |
| `ready-for-dev` | 🔵 | `# 🔵 Story QGR-A2: ...` |
| `in-progress` | 🟡 | `# 🟡 Story QGR-A3: ...` |
| `review` | 🟠 | `# 🟠 Story QGR-D2: ...` |
| `done` | 🟢 | `# 🟢 Story FRA-1: ...` |

### Special Decision States

| Status | Emoji | Example |
|--------|-------|---------|
| `cancelled` | ❌ | `# ❌ Story FRA-3: ...` |
| `superseded` | ⏭️ | `# ⏭️ Story TD-7: ...` |
| `split` | ✂️ | `# ✂️ Story TD-9: ...` |
| `cancelled-merged` | 🔀 | `# 🔀 Story TRS-14: ...` |

### Compound Markers (Status + Annotation)

| Condition | Emoji | Example |
|-----------|-------|---------|
| `done` + has deferred tech debt | 🟢🚧 | `# 🟢🚧 Story QGR-E6: ...` |
| `done` + deferred debt resolved | 🟢 | Revert to standard `done` |

**Tech debt detection** (registry-based, per /phycool-debt-registry v1.0.0):
> **Primary**: Query `tech-debt/registry.yaml` for entries where `source_story == this_story` AND `status == pending`
> **Fallback**: If registry.yaml does not exist, check if Story file contains a `## Code Review 延後項目` section AND the routed target story is NOT yet `done`.
> When ALL matching registry entries become `resolved`, revert emoji from 🟢🚧 → 🟢.

---

## 2. Heading Format Specification

### Target Pattern

```
^# {emoji_cluster} Story {ID}: {Title}
```

- `emoji_cluster`: One or more emoji from the mapping table (no space between compound emojis)
- Single space between emoji_cluster and `Story`
- Colon + space between ID and Title

### Regex for Matching/Replacing

```regex
^(# )[⚪🔵🟡🟠🟢❌⏭️✂️🔀🚧✅]*\s*(Story .+)$
```

**Replace with**: `$1{new_emoji} $2`

### Fallback (No Existing Emoji)

If the heading has no emoji (legacy files):

```regex
^(# )(Story .+)$
```

**Replace with**: `$1{new_emoji} $2`

---

## 3. Execution Modes

### Mode A: Single-File Update (Workflow Integration)

Called when a workflow changes a Story's status. Steps:

1. **Read** the Story file's status field (`**狀態**:` or `| **狀態** |`)
2. **Lookup** the emoji from §1 mapping table
3. **Check** for tech debt compound marker:
   a. **Registry query** (preferred): Read `tech-debt/registry.yaml`, filter `source_story == this_story` AND `status == pending`
   b. **Fallback** (no registry): Check for `## Code Review 延後項目` section
   c. If pending debt found → use 🟢🚧 compound marker
4. **Replace** the H1 heading emoji using §2 regex
5. **Verify** the replacement succeeded

**Integration points** — add this step in each workflow AFTER status update:

| Workflow | When | New Status |
|----------|------|------------|
| `create-story` | After story file creation | `backlog` or `ready-for-dev` |
| `dev-story` | After marking story complete | `review` |
| `code-review` | After CR approval | `done` or `done` + tech debt |
| Manual decision | PO/SM cancels or splits story | `cancelled` / `split` / etc. |

### Mode B: Batch Update (Manual Trigger)

Scans ALL Story files and synchronizes emoji. Steps:

1. **Glob** all Story files: `docs/implementation-artifacts/stories/**/[!README]*.md`
2. **For each file**:
   a. Read status field
   b. Read current H1 heading
   c. Determine correct emoji (including compound markers)
   d. If mismatch → update heading
3. **Report** summary: updated count, skipped count, errors

**Trigger**: User says "batch update emoji" or "同步所有狀態符號"

---

## 4. Multi-Agent Collaboration Protocol

This skill is used across multiple agents. Follow these rules:

### Agent Responsibilities

| Agent | Model | When to Apply |
|-------|-------|---------------|
| CC-OPUS | Opus 4.6 | create-story, code-review, batch update, manual decisions |
| CC-SONNET | Sonnet 4.6 | dev-story completion |
| CC-HAIKU | Haiku 4.5 | Subagent exploration only — NEVER modifies emoji |

### Conflict Prevention

- Emoji is derived from **Story file status field** — single source of truth
- Emoji reflects the Story file's own status field only — `sprint-status.yaml` is frozen (2026-07-28,`# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs`) and is no longer a status source
- If status field and heading emoji disagree, **status field wins**
- After updating emoji, log in tracking file:
  ```
  [CC-OPUS] 2026-02-27T14:00:00+08:00 更新 QGR-E6 標題 emoji: 🟠 → 🟢🚧
  ```

### Handoff Safety

When an agent picks up a story mid-workflow:
1. Read current Story file heading + status field
2. If emoji is stale → update it before proceeding
3. Do NOT assume previous agent already updated the emoji

---

## 5. Edge Cases

| Scenario | Handling |
|----------|----------|
| Legacy file with no emoji in heading | Insert emoji between `# ` and `Story` |
| Legacy file with `✅ **Done**` in heading | Strip old format, apply standard emoji |
| Heading doesn't start with `# Story` | Skip — not a standard Story file |
| Status field has strikethrough (e.g., `~~ready-for-dev~~`) | Use the final status after strikethrough |
| Multiple status values in field | Use the last/most recent value |
| File has no status field | Default to ⚪ (backlog) |
| Epic README.md files | Skip — this skill only handles Story files |

---

## 6. Quick Reference Card

```
⚪ backlog        🔵 ready-for-dev    🟡 in-progress
🟠 review         🟢 done             🟢🚧 done+debt
❌ cancelled       ⏭️ superseded       ✂️ split
🔀 cancelled-merged
```

---

## 7. 適用範圍：DB-first Story 為 N/A

本 Skill 的唯一標的是 **Story `.md` 檔的 H1 標題行**。PhyCool 自 2026-04-14 起採 DB-first（`.claude/rules/db-first-no-md-mirror.md`），新 Story **不產生 `.md` 鏡像**，狀態只存 `stories.status` 欄位。

| Story 型態 | 本 Skill 適用? | 處理 |
|-----------|:-------------:|------|
| Legacy Story（`docs/implementation-artifacts/stories/**/*.md` 實體存在，2026-07-27 實測 511 檔） | ✅ 適用 | 單檔或批次模式同步 H1 emoji |
| DB-first Story（`source_file` = `context-db://stories/{id}`，無 `.md`） | ❌ **N/A** | 無標的可改；狀態以 `stories.status` 為準，DevConsole 直接讀 DB |

**workflow 呼叫方對應處理**：`create-story/steps/step-06:530`、`dev-story/steps/step-09:125`、`code-review/steps/step-05:182` 三處寫「CRITICAL: Invoke `/story-status-emoji`」。對 DB-first Story，該步驟屬 **no-op**，Agent 應明確記錄「N/A — DB-first Story 無 .md 標的」而非硬找檔案或報錯。

---

## FORBIDDEN

- ❌ 對 DB-first Story 硬造 `.md` 檔以便套用本 Skill（違反 `db-first-no-md-mirror.md`）
- ❌ H1 不以 `# Story` 開頭卻仍寫入 emoji（見 §5 Edge Cases）
- ❌ **（2026-07-27 新增）為省 description token 而重新加回 `disable-model-invocation: true`**
  - **Common Rationalization**：「只有 workflow 會用到，設 DMI 可省 context」
  - **Red Flag**：三處 workflow step 皆寫 `CRITICAL: Invoke`；設 DMI 會讓調用回 `<tool_use_error>... cannot be used with Skill tool due to disable-model-invocation</tool_use_error>` 而必然失敗
  - 若要恢復零 context 成本，**必須同時**把三處改為「Read SKILL.md 後照 SOP 手動執行」或標記為 DB-first N/A，不可只改 frontmatter

---

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.1.1** | **2026-07-28** | **tdb-2-sprint-status-freeze-refs BR-015**:「Never set emoji based on `sprint-status.yaml` alone」改為「Emoji reflects the Story file's own status field only — sprint-status.yaml is frozen」— 該檔已於同批凍結(`# FREEZE-MARKER:tdb-2-sprint-status-freeze-refs`),原「it may lag」措辭已不適用(不是「可能落後」而是「已凍結不再更新」)。`last-synced-epic` epic-ctr → epic-tdb。走**字面** `Skill(skill="skill-builder")` Mode B。 |
| **1.1.0** | **2026-07-27** | **移除 `disable-model-invocation: true`** — 該旗標使三處 workflow step 明文要求的 `CRITICAL: Invoke` 必然失敗（實證錯誤訊息見 FORBIDDEN）。同步：description 改 `Use when` 開頭第三人稱並加註 DB-first N/A（移除 DMI 後 description 進入模型 budget 故需符 quick_validate CSO 規）+ 新增 §7 適用範圍（DB-first vs legacy `.md`，2026-07-27 實測 511 個 legacy 檔仍存在）+ 新增 FORBIDDEN 段 + 本 Version History。代價：description 進入 2% context budget。觸發：party-to-pipeline 薄手子視窗閘門實查（17 session 全掃）。 |
| 1.0.1 | 2026-04-05 | Epic SKU Skill Upgrade — metadata 補全。 |
| 1.0.0 | 2026-02-27 | 初版建立 — H1 狀態 emoji 單檔 / 批次 / 技術債組合標記三模式。 |

---

## 除錯參考

> 相關除錯知識請查閱 `docs/knowledge-base/` 目錄。
