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

## Applies When

create-story / dev-story / code-review / sprint-planning / 任何涉及 Story / Spec / Decision 的 workflow。

## Core Principle

> **DB is the Single Source of Truth. 記憶庫有資料沒有 MD 檔是正常的。**
>
> 使用者透過 DevConsole Web UI (`tools/dev-console`) 直接查閱 Story / AC / Tasks / Dev Notes,**不需要** .md 作為「人類可讀鏡像」。產生 .md 會:
> - 增加專案檔案數量 (負擔)
> - 造成 DB 與 .md 不一致風險 (DB 才是 SSOT)
> - 浪費 token 做雙向同步

## FORBIDDEN

- ❌ create-story Step 6 產生 `docs/implementation-artifacts/stories/epic-X/{story_id}.md`
- ❌ 將 DB 欄位內容「鏡像」寫回 .md 檔(AC / tasks / dev_notes / implementation_approach / ...)
- ❌ 在 DB 已有資料時,因為「沒看到 .md」就創建 .md
- ❌ source_file 欄位填 `docs/.../{story_id}.md` — 應填 `context-db://stories/{story_id}`

## MANDATORY

- ✅ 先 `search_stories({story_id, include_details: true})` 查 DB — DB 有資料就用 DB
- ✅ 補全動作 = `upsert-story.js --merge` 寫 DB NULL 欄位,**不寫 .md**
- ✅ source_file 欄位格式: `context-db://stories/{story_id}`(DevConsole 原生識別)
- ✅ create-story workflow step-06 §1 `Initialize Story File` → **SKIP**(不產生 .md)
- ✅ create-story workflow step-06 §2 `TEMPLATE OUTPUT: Write story header` → **SKIP**(不寫檔)
- ✅ create-story workflow step-07 §4 DB upsert → **執行**(主要輸出)

## Tracking Files (暫例外,待確認)

`docs/tracking/active/{story_id}.track.md` 仍保留 — 為 session-to-session working log,與 Story 結構化資料分離。未來可能遷移至 DB `context_entries` (category=session) 或 `workflow_executions` 後完全廢除 .md。

> **待確認**: 使用者若要求 tracking .md 也停止產生,將 working log 改寫 DB,需:
> 1. 移除 create-story step-07 §2 Create Tracking File
> 2. Pipeline `story-pipeline-interactive.ps1` 對應調整
> 3. Memory DB 寫入 session-style `context_entries`

## WEB UI 查詢路徑

使用者於 `tools/dev-console` 查詢 Story:
- **Kanban 看板**: `/stories` (epic/status/priority 分類)
- **Story Detail**: `/stories/{story_id}` (DB 欄位 primary + .md fallback badge)
- **Schema 瀏覽**: `/schema` (全表結構)
- **Patterns**: `/patterns` (連續學習觀測)

Backend `storyDetailService.ts` 優先讀 DB,DB 欄位為 NULL 才降級讀 .md。符合 DB-first。

## Workflow Override

本 rule **優先於** `_bmad/bmm/workflows/4-implementation/create-story/steps/step-06-create-story-file.md` 的 template write step 和 step-07 的 `source_file` 欄位值。

BMM 是外部 framework,不直接修改;但 PCPT 專案內 rule 優先級最高。

## Incident Record

- **2026-04-14 eft-editor-batch-image-panel-free-open 事故**: create-story 補全時產生 `.md` 鏡像檔,使用者立即制止並澄清「DB 是 SSOT,有記憶庫資料沒有 MD 是正常的」。已刪除 .md + 復原 source_file 至 `context-db://`。本 rule 建立以機制性防止未來新對話視窗再犯。

## Self-Check (每次 create-story 執行前)

Agent 須自問 3 題:

1. **「我是否正在為了『讓使用者看到』而產生 .md?」** → 是 → STOP,使用者用 DevConsole 看
2. **「我是否認為『沒有 .md 就是 Story 不存在』?」** → 是 → 錯,先查 DB
3. **「source_file 是否填 docs/.../.md?」** → 是 → 改為 `context-db://stories/{id}`

---

## Related Rules

- `.claude/rules/context-memory.md` — DB 為 SSOT 的整體原則
- `.claude/rules/create-story-enrichment.md` — DB 欄位補全規範
- `memory/feedback_no_yaml_update.md` — sprint-status.yaml 不寫(DB-first 同源)

## Version History

| 版本 | 日期 | 變更 |
|------|------|------|
| 1.0.0 | 2026-04-14 | Initial creation 應對 eft-editor-batch-image-panel-free-open .md 鏡像事故 |
