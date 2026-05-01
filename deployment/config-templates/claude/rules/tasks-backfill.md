---
paths:
  - "_bmad/bmm/workflows/**/dev-story/**"
  - "_bmad/bmm/workflows/**/code-review/**"
  - "src/**"
  - ".context-db/scripts/upsert-story.js"
  - "tools/dev-console/**"
  - "docs/implementation-artifacts/stories/**"
---

# Tasks Backfill Mandatory Rules

## Applies When

Before completing dev-story or code-review workflow (pipeline or conversation mode), must run `/tasks-backfill-verify {story-id}`.

## Web UI Data Source Resolution (2026-04-11 Hybrid Architecture)

DevConsole Web UI (`tools/dev-console`) uses **per-section hybrid resolution** — DB is primary, `.md` file is fallback:

| Condition | UI behavior |
|-----------|-------------|
| DB 欄位非 NULL/空 | 顯示 DB 資料(無 badge, primary source) |
| DB 欄位為 NULL/空 + `.md` 有對應 `## Section` | 顯示 .md 段落內容 + `[md]` badge(fallback) |
| 兩者皆空 | 區塊不渲染 |

**Section mapping** (DB column → Markdown heading):
- `user_story` → `## Story`
- `background` → `## Background`
- `acceptance_criteria` → `## Acceptance Criteria`
- `tasks` → `## Tasks / Subtasks`
- `dev_notes` → `## Dev Notes`
- `required_skills` → `## Required Skills`
- `implementation_approach` → `## Implementation Approach`
- `testing_strategy` → `## Testing Strategy`
- `file_list` → `## File List`

**Implication for dev-story/code-review backfill**:
- 寫 DB `tasks`/`file_list`/`dev_notes` 欄位即可(Web UI 優先讀 DB)
- **不需要**額外同步 .md 檔案 checkboxes,DB 寫入 alone 即可讓 UI 顯示最新 tasks
- 若 DB 欄位為空,Web UI 會自動 fallback 到 .md 並標註 `[md]` badge,提醒資料來源

**Source files**:
- Backend: `tools/dev-console/server/services/storyDetailService.ts` → `parseMdSection()` + `resolveField()`
- Frontend: `tools/dev-console/src/pages/StoryDetail.tsx` → `<SourceBadge source={...}>`

## Core Principle: Verify Each Item — No Blind Checkmarks

Each task/subtask must be **independently verified** before marking ✅:

1. **Read actual code** — open file mentioned in task description, locate specific line
2. **Confirm implementation exists** — code logic matches task requirements
3. **Record file:line evidence** — every ✅ must cite `(filepath:line)` or equivalent
4. **No evidence → ⬜** — attach reason, never assume "it was probably done"

## Verification Standards by Task Type

| Task Type | Required Evidence | If Not Found |
|-----------|------------------|-------------|
| Code implementation | Read file + file:line exists and logic correct | ⬜ "implementation not found at {expected path}" |
| Test | Read test file + confirm non-empty Assert method | ⬜ "test missing/no valid assertion" |
| Migration | Confirm .cs file exists + contains expected Schema change | ⬜ "Migration not created" |
| ADR/Document | Read target doc + confirm relevant section | ⬜ "doc missing/section absent" |
| YAML update | Read YAML + confirm field values correct | ⬜ "item not found in YAML" |
| DB field writeback | query-stories.js + confirm target field non-empty | ⬜ "DB field still empty" |
| **UI component(.tsx/.css)— CR 階段**(2026-04-14 新增) | Vitest 單元測試 + **Chrome MCP Live**(`evaluate_script` 讀 DOM class/computed style + `take_screenshot` 存圖 + `click` 驗 interaction + 跨 plan 至少 2 個) | ⬜ 僅允許「server 未跑 + verification Story 已建立」;「post-CR QA」= 規避,HARD BLOCK |

## UI Task Chrome MCP Live Check(2026-04-14 新增 — eft-editor-batch-image-panel-free-open 事故)

當 Story 涉及 UI(diff 含 `.tsx` / `.css` / DOM / layout / gating),**CR 階段 tasks-backfill-verify 必須完成雙軌驗證**:

### 軌 1 — Vitest 單元測試(dev-story 自證層)

- 覆蓋:組件渲染 / prop 傳遞 / 單元邏輯 / accessible name
- 測**不到**:DOM computed style / visual layout / interaction timing / cross-plan

### 軌 2 — Chrome MCP Live Verification(CR 對抗層 — 不可省)

**前置:**
```
curl -k -s -o /dev/null -w "%{http_code}" https://localhost:7135   # backend
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173       # vite
list_pages                                                          # Chrome ready?
```

**至少執行:**
1. `evaluate_script` 讀 DOM class / computed style(`getComputedStyle`)/ aria attrs 對照每個 UI 類 AC
2. `click` 驗關鍵互動(toggle / dropdown / modal state transitions)
3. `take_screenshot` 存圖至 `docs/implementation-artifacts/reviews/epic-{X}/{story-id}-{plan}-verification.png`

**跨 plan 矩陣(涉及 plan gating Story):**
- 至少 Free(user-tier-1@example.local / ChangeMe123!)+ 1 個付費(A4 Professional 建議)
- A2 Basic / A5 Business 若 code 無 plan 條件分支可省(scope 決策須於 CR report 明示)

**CR report MUST 含 marker:**
```
[Chrome MCP Live Verification @ {cr_ts} — {plan_list}, {N} AC PASS]
```

### FORBIDDEN(等同未驗 UI)

- ❌「Vitest 通過 → CR 跳 Chrome MCP」— 兩軌獨立不可替代
- ❌「UI 驗證留給 post-CR QA」— server 在跑 + 工具可用 = 當場做
- ❌ 單 plan 驗證代替跨 plan
- ❌ 依賴 accessibility snapshot 判 layout(snapshot 無 computed style)
- ❌ 把 UI ⬜ 標「post-CR live 驗證」就標 Story done

### 落地層(機制性強制)

- `_bmad/bmm/workflows/4-implementation/code-review/steps/step-03-triple-layer-dispatch.md` SaaS 第 10 維「UI Behavioral」
- `step-05b-tasks-backfill.md` Block 3「CR 階段 UI 行為驗證獨立性」
- `step-06-report-archive.md` §7.5 **Gate 8 Defer Audit**(Q1-Q4 自檢)

### Incident

2026-04-14 `eft-editor-batch-image-panel-free-open` CR 依 Vitest 22/22 通過標 done,⬜ tasks 寫「post-CR QA」;使用者質疑後補做 Chrome MCP A1+A4 驗證,才確認 7 項 AC 全通過 + cross-plan DOM 一致 → Memory `context_entries` id=3288。額外耗時 20 分鐘 + 2 次 user 追問。

## FORBIDDEN

- ❌ Marking ✅ without reading code (blind check)
- ❌ Checking all ✅ because "looks like it's all done"
- ❌ Using `[x]/[ ]` format (must use ✅/⬜ emoji)
- ❌ Writing tasks field as JSON array (must be Markdown string)
- ❌ Skipping `/tasks-backfill-verify` at dev-story/code-review end

## CR Phase Independence (2026-04-14 新增 — eft-editor-batch-image-panel-free-open 事故)

`/tasks-backfill-verify` Skill 必須在 dev-story 和 code-review 兩階段**各自獨立調用**,不可因 dev-story 已調用就跳過 CR 階段。

| 階段 | 角色 | 動作本質 |
|------|------|---------|
| dev-story Step 9 | **Implementer 自證回填** | 根據自身 implementation 寫 ✅/⬜ — 夾帶主觀 |
| code-review Step 5b | **Adversarial Reviewer 對抗審查** | 獨立 Read 每個 task 涉及的 code,重新驗證 file:line,翻轉偽 ✅ |

### FORBIDDEN(違反 = CR 審查失效,等同未審查)

- ❌ 「dev 已調用過 Skill + tasks 格式正確 → CR 跳過」— dev 是自證,CR 是對抗,兩者不可互換
- ❌ 「DB tasks 內容與 dev 回填相同 → 不需再跑 Skill」— CR 必須獨立重跑,即使結論相同(這個「相同」本身是 CR 的獨立判斷產出)
- ❌ 沿用 dev-story 的 file:line 證據不 Read code — CR 必須親自 Read(行號可能漂移 / dev 可能盲勾)
- ❌ 「tasks 已寫入 DB = Step 5b done」— 除非 CR 階段有 `[tasks-backfill-verify invoked @ {cr_ts}]` marker,否則視同未執行
- ❌ 把 tasks 寫入合併到 CR Step 4 auto-fix 的 `upsert-story.js --merge` patch(常見誤區 — 2026-04-14 eft-editor-batch-image-panel-free-open 事故根因)

### Implementation Layer(永久機制性強制)

- **BMM Workflow**: `_bmad/bmm/workflows/4-implementation/code-review/steps/step-05b-tasks-backfill.md` Block 2(CR 角色獨立性 HARD REQUIREMENT)
- **Memory Writeback Gate**: `step-06-report-archive.md` §7.5 Gate 6 檢查 Skill marker 存在 + `stories.test_count` 非 NULL
- **根本理由**: 「如果 CR 因 dev 已回填就跳過 Skill,CR 等同未執行 — 幹嘛審查」

### Incident Records

- 2026-04-13 `eft-editor-image-panel-free-open` CR 新視窗因 dev 已 ✅ 跳過獨立驗證 → `memory/feedback_cr_must_independent_backfill.md`
- 2026-04-14 `eft-editor-batch-image-panel-free-open` CR 把 tasks 寫入合併到 Step 4 auto-fix 跳過 Skill → `context_entries` id=3287(decision)+ `tech_entries` id=876(failure,5 lessons)

## Pipeline Enforcement (2026-03-18)

Pipeline script `Test-TasksBackfill` validates tasks field after code-review:
- tasks contains `[ ]` or no ✅ → **status reverts from done to review**, pipeline report shows failure
- Re-run pipeline to recover (re-executes code-review + backfill verification)
- Exception returns $false (fail-safe, no pass-through)

## Trigger Timing

- **dev-story**: Step 9, after all task verification, before archival
- **code-review**: Step 5, after Production Gate passes, before Step 6 archival
- **Pipeline fallback**: `Test-TasksBackfill` post-verification, reverts status on failure
- **Direct conversation**: Before any workflow declares completion
