---
paths:
  - "_bmad/bmm/workflows/**/create-story/**"
  - "_bmad/bmm/workflows/**/sprint-planning/**"
  - "_bmad/bmm/workflows/**/dev-story/**"
  - "_bmad/bmm/workflows/**/code-review/**"
  - "docs/implementation-artifacts/stories/**"
  - ".context-db/scripts/upsert-story.js"
  - ".context-db/scripts/upsert-*.js"
---

# DB-First Story — 禁止產生 .md 鏡像檔 (CRITICAL — Permanent)

> **2026-05-16 精簡**: 詳情(WEB UI 查詢路徑 / Workflow Override / Incident Record / Self-Check)備份於 cleanup backup。`db-first-write-guard.js` hook(PostToolUse Edit|Write)已部署,偵測 `docs/implementation-artifacts/stories/**/*.md` 寫入時自動注入 advisory。

## Core Principle

> **DB is the Single Source of Truth. 記憶庫有資料沒有 MD 檔是正常的。** 使用者透過 DevConsole Web UI (`tools/dev-console`) 查閱 Story / AC / Tasks / Dev Notes,**不需要** .md 鏡像。

## FORBIDDEN

- ❌ create-story Step 6 產生 `docs/implementation-artifacts/stories/epic-X/{story_id}.md`
- ❌ 將 DB 欄位內容「鏡像」寫回 .md(AC / tasks / dev_notes / implementation_approach / ...)
- ❌ 在 DB 已有資料時,因為「沒看到 .md」就創建 .md
- ❌ source_file 欄位填 `docs/.../{story_id}.md` — 應填 `context-db://stories/{story_id}`

## MANDATORY

- ✅ 先 `search_stories({story_id, include_details:true})` 查 DB — DB 有資料就用 DB
- ✅ 補全動作 = `upsert-story.js --merge` 寫 DB NULL 欄位,**不寫 .md**
- ✅ source_file 格式:`context-db://stories/{story_id}`
- ✅ `docs/tracking/active/{story_id}.track.md` 仍保留(session working log,非 Story 結構化資料鏡像)

## Hook 機制守護

`.claude/hooks/db-first-write-guard.js`(PostToolUse Edit|Write,2026-05-16 deployed):偵測 Story .md pattern 寫入 → 注入 advisory `additionalContext` 提醒 Claude 用 `upsert-story.js` 寫 DB,而非 .md 鏡像。Advisory only(non-blocking)。

## Self-Check(create-story 前 3 題)

1. 「我是否為了『讓使用者看到』而產生 .md?」 → 是 → STOP,使用者用 DevConsole 看
2. 「我是否認為『沒有 .md 就是 Story 不存在』?」 → 是 → 錯,先查 DB
3. 「source_file 是否填 docs/.../.md?」 → 是 → 改 `context-db://stories/{id}`

## Incident

- **2026-04-14 eft-editor-batch-image-panel-free-open**:create-story 補全產生 .md 鏡像,使用者立即制止「DB 是 SSOT,有記憶庫資料沒有 MD 是正常的」。本 rule 建立 + 2026-05-16 hook 機械守護。

## Related

- `.claude/rules/context-memory.md` — DB SSoT 整體原則
- `.claude/rules/create-story-enrichment.md` — DB 欄位補全規範
- `.claude/hooks/db-first-write-guard.js` — PostToolUse advisory hook
