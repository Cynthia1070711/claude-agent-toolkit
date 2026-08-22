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

## Pre-Existing Red Claims Require Tool Output(2026-08-03 新增 — bwu-12 事故)

任何 dev-story / code-review 階段對測試紅燈提出「這些是既有的、非本卡引入」類宣稱,**必須附 `node scripts/check-test-baseline.cjs`(或 `--suite <name>` 指定單一 suite)的實際輸出**作為證據,**不得**重述任何記憶中的數字(即使該數字來自本 rule、某張 Story 的 dev_notes、或先前 CR report)。

**理由**:該口述數字每口傳一次就掉一次精度(bwu-12 事故實測:同一批紅燈的口述數字經 4 張卡輾轉引用,從未對上過;且量測方式本身若不固定,同一 suite 因執行入口不同可得完全不同的答案 —— repo-root 形式與 suite-root 形式對 `.context-db/` 量出的失敗數可以相差一個數量級)。`check-test-baseline.cjs` 對兩個 suite(`.context-db/` / `tools/dev-console/`)的釘死入口執行雙向 diff(`new`/`resolved`),把「這條紅燈是否已處理」從口述變成可執行判定 —— 沒有消費端接線的工具,就是又一份沒人找得到的造冊,正是 bwu-12 診斷的病本身。

**FORBIDDEN**:
- ❌ 引用「N 個既有紅燈」但未附 `check-test-baseline.cjs` 的輸出
- ❌ 以「上一張卡的 dev_notes 說是 M 個」代替當場實跑

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
- 至少 Free(user1@example.com / ExamplePw123)+ 1 個付費(A4 Professional 建議)
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

### Chrome MCP 能力判準(2026-08-03 新增 — bwu-12 事故)

> 本節規範「Chrome MCP(或其他 MCP-only 能力)本身是否可用」的判定方式 —— 這與上方軌 2 的「UI 元件是否已用 Chrome MCP 驗證」是兩個不同問題,不可混用同一套邏輯。該族 debt(`chrome-devtools-mcp` 連線能力)已**三次復發**:前兩次的 `fixed` 依據皆為「本次重試成功」,五天內即再度不可達。

**(a) 能力判定一律直接調用 MCP tool,禁 port/HTTP 探測**

判定 MCP 能力是否可用,**必須直接調用該 MCP tool 本身**(如 `list_pages`),**明文禁止**以 raw port(如 9222)或 HTTP 探測推斷可用性。`.mcp.json` 的 `chrome-devtools` server 走 `--autoConnect`,Chrome 使用**隨機 port**,port 探測在此配置下必假陰性(`memory/feedback_probe_mcp_by_invoking_tool_not_raw_port.md` 已記載 2026-07-19 實際代價:探 9222 得 404 → 斷定不可用 → 差點放棄整批實機驗證,直接調用 `list_pages` 一次就連上)。獨立 Node 腳本結構上**無法調用 MCP tool**(MCP tool 只存在於 agent 的 tool 層),故**禁止**新建任何以 port / HTTP 探測判定 MCP 可用性的 `.cjs`/`.js` 腳本或等效 CLI 指令。

**(b) 能力類 debt 標 fixed 需 ≥2 次不同日期獨立觀察**

能力類 tech debt(MCP 連線 / 工具可用性)標記 `fixed` 前,**必須**有 **≥2 次、時間戳分屬不同日期**的直接調用成功**獨立觀察**記錄 —— **單次成功不足以標 fixed**(此即該族 debt 三次復發的根因:單次觀察無法區分「已修復」與「這次剛好通了」)。觀察記錄方式:

- 每次成功觀察 → `add_tech({tech_stack: 'chrome-devtools-mcp', outcome: 'success', ...})` 落 DB(offset-aware `+08:00` timestamp,對齊 `phycool-mcp-discipline`)
- 標記 fixed 前 → `search_tech({tech_stack: 'chrome-devtools-mcp', outcome: 'success'})` 查詢,確認 **≥2 筆、日期互異**的獨立觀察
- 少於 2 筆、或全落在同一天 → **不得**標 fixed,即使當下觀察成功

**(c) 「工具層不可達」為第三種合規結案情境**

除既有「server 未跑(需附 verification Story 已建立)」外,「**server 在跑但工具層(MCP tool)不可達**」為**第三種**誠實延後情境,結案方式:

1. **三層替代驗證**:端到端 API 斷言(HTTP status / response shape)+ 元件渲染測試(RTL / vitest)+ 靜態樣式斷言(CSS 規則存在性)
2. **CR 報告具名列出未覆蓋面**:三層替代驗證無法覆蓋「視覺呈現」與「版面(layout)」兩面,CR 報告**必須具名列出**這兩項為已知未覆蓋範圍,不得靜默略過

**允許的誠實延後情境(僅此三種,無第四種;偏離即 FORBIDDEN)**:

1. **Server 未跑** —— 需附 verification Story 已建立
2. **能力類 debt 尚未達 ≥2 次不同日期獨立觀察門檻** —— 單次成功不足以標 fixed(見上 (b)),持續累積 `add_tech` 觀察記錄直到達標前維持 open
3. **Server 在跑但工具層(MCP tool)不可達** —— 走三層替代驗證 + CR 報告具名列出未覆蓋面(視覺 / 版面,見上 (c))

**FORBIDDEN(能力判準專屬,補強上方軌 2 既有 FORBIDDEN 清單)**:

- ❌ 以 port / HTTP 探測(如 9222)判定 MCP 可用性(見上 (a),`--autoConnect` 下必假陰性)
- ❌ 以「這次重試成功」單次觀察標記能力類 debt fixed(必 ≥2 次不同日期獨立觀察,見上 (b))
- ❌ 工具層不可達卻跳過三層替代驗證,或未在 CR 報告具名列出未覆蓋面
- ❌ 主張存在「server 未跑」與「工具層不可達」以外的第四種誠實延後情境
- ❌ pipeline 子視窗連真實 Chrome 驗證此能力(`memory/feedback_subwindow_chrome_mcp_sandbox_only.md`——子視窗僅沙盒,此類觀察須由主視窗執行)

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
- **test_count 語意**(2026-08-04 生效,`bwu-13-bmad-mechanism-gap-closure`):`test_count` = **本卡新增或修改的測試案例數**(非模組/套件總測試數),分界日之前的既有卡不回填;完整定義 + 取數方式見 `.claude/skills/tasks-backfill-verify/SKILL.md` §test_count 語意定義
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
