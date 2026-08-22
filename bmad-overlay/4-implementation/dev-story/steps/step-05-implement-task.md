---
name: 'step-05-implement-task'
description: 'Implement task following red-green-refactor TDD cycle; KB error lookup; tech debt consumption'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-05-implement-task.md'
nextStepFile: '{workflow_path}/steps/step-05b-apply-migrations.md'
---

# Step 5: Implement Task (TDD)

**Goal:** Implement the current task/subtask following red-green-refactor cycle.

---

## AVAILABLE STATE

- `{story_key}`, `{story_path}` — from Step 1
- `{story_required_skills}`, `{incoming_tech_debt}`, `{staleness_hits}` — from Step 2
- `{kb_relevant_entries}` — from Step 2b
- `{tracking_active_path}` — from Step 4

---

## EXECUTION SEQUENCE

> **CRITICAL:** FOLLOW THE STORY FILE TASKS/SUBTASKS SEQUENCE EXACTLY AS WRITTEN — NO DEVIATION.

### 0.4 Story-Level ATDD Red Gate (M/L/XL — W2 蒸餾 + P0-2 消費升級，story 首個 task 編碼前執行一次)

> **Added (W2 蒸餾)**: 對齊 SDD L2「ATDD 紅燈當 story 進入編碼的硬性閘門」。
> **Upgraded (bwu-3-dev-consume-review-audit, BR-001~009)**: create-story `step-06` §7.5 現已產出具名測試案例表(`stories.testing_strategy`)。本 gate 從「自行推導測試」升級為「先分類、能消費就消費、不能才 fallback」——dev **不再自行選層級 / 設計斷言 / 挑 fixture / 命名**,四項全由表提供。共用判定函式 `.context-db/scripts/testing-strategy-structure.js` 的 `checkTestingStrategyStructure()` 與唯讀分類 CLI `.context-db/scripts/test-spec-audit.js` 是 dev / code-review / `tasks-backfill-verify` 三處共用的單一真相來源,「合格表」不可能在建立端與消費端漂移。

**觸發**: M/L/XL complexity Story(S 跳過 — per-task §4 RED 已足）。**僅在 story 第一個 task 編碼前執行一次**。

#### §0.4.0 分級 Gate（不變）

依 `{story.complexity}`：S/XS 跳過本節全部子步；M/L/XL 繼續 §0.4.1。

#### §0.4.1 執行分類 CLI，取得 verdict

```bash
node .context-db/scripts/test-spec-audit.js {story_key} --json
```

依 `.verdict` 分流：`consume` → §0.4.2；`fallback` → §0.4.3。`skip` 理論上不會出現於此（S/XS 已在 §0.4.0 排除），出現視同 `fallback` 處理。

#### §0.4.2 consume 模式 — 逐列翻譯，四項來源全部照表，dev 不做任何設計決策

**Case 名稱 byte-identical，禁自創**：每個新建的測試方法名，必須與該列 `Case` cell 的值**逐字相同（byte-identical）**——不得重新命名、不得意譯、不得為了「更好懂」而調整。案例名一經 create 端產出即為契約。

**四項來源逐一釘住，dev 不自行決定**：

| 表欄位 | 對應 dev 決策 | dev 不得自行選擇 |
|--------|--------------|------------------|
| `Level` | 測試層級（`unit`/`integration`/`E2E`） | 不得因為「這個比較好測」改用其他層級 |
| `Fixture` | 具體 fixture 類別（如 `IClassFixture<CustomWebApplicationFactory>`） | 不得改用 mock 取代 `Level=integration` 要求的真實 fixture |
| `Input` | arrange 區塊的具體輸入 | 不得憑印象改用其他輸入值 |
| `Expected` | assert 區塊的具體斷言 | 不得放寬或改變預期結果 |

**RED 依該列 `RED→GREEN` 欄的 RED 側判定**：首次執行必須觀察到 RED 側描述的現象（如「回 200（無版本檢查）」）；若觀察到的是編譯錯誤或 `NullReferenceException` 等，判定為**測試寫錯而非實作缺失**，須先修正測試再重跑。

**重入（`dev-story-fix-Rn`）只補漏，不重寫**：CLI 回傳每列的 `testHit`（`file:line` 或 `null`）。`testHit` 非 `null` 的列**跳過不重寫**；只為 `testHit === null` 的列補寫測試。完成後輸出格式：`consume: {N} new, {M} existing`。

**`atdd-checklist-{story_key}.md` 為補充，不與表並列權威**：若同時存在 `testarch/atdd` 產出的 checklist，**表為權威**，checklist 僅用於補表未覆蓋的項目，不得對同一案例產生重複測試。

**此刻命名即與表一致，可省掉收尾返工**：`step-09-completion.md` §1.5 於標記 review 前會跑 `--dev-advisory` 機械回饋，對照 code-review `step-03c-acceptance-auditor.md` §6.2 軸 (a) 同一判準（whole-word byte-identical）；此刻逐列翻譯時即確保案例名逐字相同，可避免 Step 9 才發現漂移的返工。

#### §0.4.3 fallback 模式 — 升級前行為逐字保留

verdict = `fallback`（`testing_strategy` 為散文或空）時，§0.4 行為與升級前**完全相同**：依 Story AC（Given-When-Then）自行寫 story 級 acceptance test 紅燈：

1. 檢查是否已有 story 級 ATDD 驗收測試：
   - Glob `{output_folder}/atdd-checklist-{story_key}.md` 或 Story File List 標註的 acceptance test 檔（`tests/e2e/` / `tests/api/` / xUnit integration）
2. **若已有** → 跑一次確認 RED（failing due to missing implementation）→ 記為「story 完成客觀基準」；per-task GREEN 累積後此 story 級測試須全綠
3. **若無** → 依 Story AC（Given-When-Then，對應 SPEC Kernel Success signal）寫 story 級 acceptance test 紅燈：
   - 每條 AC 至少 1 個 failing acceptance test（E2E/API/Component 擇 level，對齊 `testarch/atdd` Step 2 test-level selection）
   - 確認 RED（失敗原因 = missing implementation，非 test bug）
   - 複雜 UI workflow 可改跑完整 `testarch/atdd` workflow 產出

並於 `docs/tracking/active/{story_key}.track.md` 追加一行 WARN marker：

```
[ATDD Fallback WARN @ {ISO8601 timestamp}] testing_strategy=prose({N} chars, no table) — story-level ATDD self-authored from AC; consume mode unavailable
```

**Fallback 分支的 fallback**：純後端 infra / 無 UI 且無 API contract → story 級 ATDD 可為 xUnit integration test 紅燈（對齊 `phycool-testing-patterns`）。

#### §0.4.4 閘門（不變）

M/L/XL Story 進入 §1+ per-task 編碼前，story 級 ATDD 測試必須存在且 RED（consume 模式來自逐列翻譯、fallback 模式來自自寫）；Success signal（§0.5 D0 Kernel）達成 = 此 story 級測試全綠。

**§0.4 全程不寫 `stories.testing_strategy`**——該欄位是 create 的產出，dev 唯讀。跑完 dev-story，`testing_strategy` 的值必須與跑之前 byte-identical。

**FORBIDDEN**:
- ❌ M/L/XL Story 跳過 story 級 ATDD 紅燈直接 per-task 編碼（失去客觀完成標準）
- ❌ ATDD test 起手即 green（acceptance test 必先 RED，對齊 `testarch/atdd/instructions.md:384`）
- ❌ **consume 模式下自創測試名**（必須與 `Case` cell byte-identical，重新命名視為違反契約）
- ❌ **刪除 fallback 分支**（44/60 存量卡的 `testing_strategy` 為純散文，刪除等於讓多數存量卡在 dev 階段失效）
- ❌ consume 模式下自行改選 `Level`/`Fixture`（表已提供，dev 不做這四項設計決策）
- ❌ §0.4 對 `stories.testing_strategy` 執行任何寫入

---

### 0.5 God Node Awareness Pre-Check (ADR-GOVERNANCE-001 + Tianji v1.1.0)

> **Added 2026-05-02**: 啟動 task 實作前,先取本 Story domain 的 god node Top-N。對齊 `capability-integration-mandate.md` Step 2 BMAD 整合 + `補全計畫.md` §6.5。

從 Story `domain` 欄位推斷 namespace:

```
mcp__phycool-context__search_god_nodes({
  domain: "<story.domain>" or "<inferred-from-keywords>",
  limit: 5
})
```

**Output 用途**:
- 注入 mental model:「本 Story 修改前必先 Read 的核心檔」
- 替代多輪 grep + Read(每 god node 含 `file_path / start_line / end_line`)
- 識別高 BlastRadius symbol → 修改前必走 `get_symbol_context(symbol_id, depth=2)` 展開影響鏈

**Fallback**: 若 search_god_nodes 回 0 hit(centrality 未計算 / 非 production code domain)→ 走既有 §1 Story tasks file_list 路徑

### 0.6 IDD Pre-Edit Awareness Check (Capability-Integration Mandate Step 2 + ADR-GOVERNANCE-001)

> **Added 2026-05-03**: 對齊 `.claude/rules/capability-integration-mandate.md` v1.0.0 §3 Mandatory 5 步 Step 2 BMAD 整合 + ADR-GOVERNANCE-001 + 補全計畫.md §6.5。Pattern reuse 自 create-story step-06 §8.5 IDD Warning + dev-story §0.5 God Node 範本。Story: `td-bmad-search-idd-pre-edit-dev-story`(epic-devcons P3/S)。

從 Story `file_list` 提取所有檔案路徑,對每檔 query active IDDs:

```
For each file in file_list:
  mcp__phycool-context__search_intentional_decisions({
    file_path: "{file}",
    status: "active",
    limit: 5
  })
```

**合併命中**: 以 `idd_id` dedupe,取 union of all forbidden_changes(避免同 IDD 在多 file 命中時重複輸出)。

**Output 用途**:
- 注入 mental model:「本 Story 修改前必意識的 IDD 約束」
- 主動補強 Hook Layer 6 IDD 注入(被動消費 → 主動 query 雙保險)
- 對 critical IDD 命中觸發 advisory HALT(non-blocking)讓 Agent 確認不違反 `forbidden_changes`
- 與 code-review `skill-idd-sync-gate.md` retrospective 後置兜底互補(本 §0.6 = pre-edit 前置阻擋)

**Output format**(若命中 ≥ 1 IDD,對齊 step-06 §8.5 範式):

```
🛡️ IDD Pre-Edit Check: 對 {N} files 完成 query,命中 {M} active IDDs
  ⚠️ {idd_id} ({title}) — criticality: {criticality}
    - Forbidden: {forbidden_change_1}
    - Forbidden: {forbidden_change_2}
    ...
  Decision: {decision 摘要}
```

**Critical IDD 命中額外 advisory HALT**(non-blocking,對齊 BR-IDD-2):

```
🚨 CRITICAL IDD HIT — proceed only if proposed edits do NOT violate any forbidden_changes:
   {IDD details}
   Confirm understanding before continuing.
```

寫入 dev-story tracking file `docs/tracking/active/{story-id}.track.md` 加 `[IDD Awareness Confirmed @ {ts}] {idd_ids comma-separated}` marker。

**Fallback**:
- 0 hit(file_list 不涉 active IDD related_files)→ silent skip(對齊 step-06 §8.5,不留空標題)
- `search_intentional_decisions` 連線失敗 → log warning + continue(non-fatal,advisory 設計確保 dev-story 不卡死)

**Token budget 對抗**:
- file_list 5-15 files × `search_intentional_decisions` 每 query ~500-1500 tokens
- `idd_id` dedupe 後通常 0-3 unique critical IDDs
- Total 增量 ~3K-15K tokens(與 §0.5 god_node 5-call ~5K 同量級)

### 0.7 4-Persona Parallel Implementation Pattern (v2.0 NEW — Path δ 微創)

> **Added 2026-05-10**: 對齊 step-03 review 5-Layer Dispatch 升級範式,dev 階段 spawn 4 specialized sub-agents in parallel via Claude Task tool。對應 ruflo `architect + coder + tester + security` parallel pattern。**不引入 ruflo daemon**,只用 Claude 內建 Task tool。

**觸發條件**: M/L/XL complexity Story (S 跳過,直接走 §1+ 既有 sequential flow)

**4-Persona spawn pattern**:

```javascript
// Spawn 4 named sub-agents in 1 message (per Claude Task tool best practice)
Task({
  prompt: `你是 Architect Persona。Quick design 本 task 的 schema/DI/Service interface (~5 min):
    - 對 task file_list 提出 minimal viable interface design
    - 指出潛在 abstraction reuse 點 (對應 G6 god_node)
    - 識別 cross-cutting concerns (logging/auth/error handling)
    Output: 簡短 design notes,SendMessage to 'coder' + 'tester'`,
  subagent_type: "system-architect", name: "architect", run_in_background: true
})
Task({
  prompt: `你是 Coder Persona。Wait for design from 'architect' via SendMessage.
    依 §3 Plan + §4 RED → §5 GREEN → §7 REFACTOR cycle 實作 task minimal slice。
    遵守 Skill FORBIDDEN + IDD forbidden_changes (per §0.6)。
    Output: implementation evidence file:line list,SendMessage to 'tester'`,
  subagent_type: "coder", name: "coder", run_in_background: true
})
Task({
  prompt: `你是 Tester Persona (RED-first)。
    依 task AC 寫 FAILING tests FIRST (§4 RED Phase),涵蓋 unit + integration。
    Coder 完成 GREEN 後 verify tests pass,加 edge case + happy path coverage。
    Output: test file:line list + coverage report,SendMessage to 'security'`,
  subagent_type: "tester", name: "tester", run_in_background: true
})
Task({
  prompt: `你是 Security-During-Coding Persona (prevent vs fix)。
    Wait for code from 'coder' via SendMessage。即時 OWASP secure-by-design 審查 (per step-03 Layer D 12 維度):
    Injection / XSS / Auth / Crypto / Misconfig / SSRF / Path Traversal / etc.
    若發現 issue → SendMessage to 'coder' 立即修 (不留到 review 階段)。
    Output: security checklist 通過項目 + inline fix 紀錄`,
  subagent_type: "security-reviewer", name: "security", run_in_background: true
})
```

**Coordination Pattern**: Pipeline `architect → coder ← tester ← security`
- architect 設計 → coder + tester 並行 (RED test 同時寫)
- coder 實作 → security 即時審查 (prevent issues vs review fix)
- tester verify GREEN → REFACTOR

**Fallback**: 若 sub-agent failed (timeout / error) → main thread 接管該 persona 職責。Failed persona 名稱寫入 `{failed_personas}` 列表,step-09 completion 時 escalate 提示。

**S complexity opt-out**: S 級 Story (Bug fix / typo / config) **不需 4-persona** — sequential 既有 flow 較快。

**FORBIDDEN**:
- ❌ 跳過 §0.7 對 M/L/XL Story 直接走 sequential (放棄 parallel 加速)
- ❌ Sub-agents 不 SendMessage 互通 (失去 inter-agent comms)
- ❌ Security persona 留到 review 才檢 (違反 secure-by-design,prevent > fix)
- ❌ Tester persona 在 implementation 後才寫 test (違反 RED-first / TDD)

**預期效益**:
- dev throughput +50% (4-persona parallel)
- Security-during-coding 即時 prevent (review 階段 finding -30%)
- TDD RED-first 合規率 +80% (tester persona 強制寫 RED)
- Architecture coherence +30% (architect persona 預檢 abstraction)

### 1. Review Current Task

Review the current task/subtask from the story file — this is the authoritative implementation guide.

### 2. Tech Debt Consumption

**If `{incoming_tech_debt}` is not empty:**
- For EACH item in `{incoming_tech_debt}.items`:
  - Check if `item.problem_location` or `item.related_modules` overlap with the current task's target files
  - If overlap found → incorporate `item.fix_guidance` into implementation plan

### 3. Plan Implementation

Plan implementation following red-green-refactor cycle.

---

### 4. RED Phase — Write Failing Tests First

1. Write FAILING tests first for the task/subtask functionality
2. Confirm tests fail before implementation — this validates test correctness

---

### 5. GREEN Phase — Minimal Implementation

1. Implement MINIMAL code to make tests pass
2. Run tests to confirm they now pass
3. Handle error conditions and edge cases as specified in task/subtask

---

### 6. KB Error Lookup (on Build/Test Failure)

> **CRITICAL:** TD-31 — Consult Knowledge Base on build/test failure BEFORE attempting fix.

**If Build or Test fails:**
1. BEFORE attempting to fix, consult Knowledge Base:
   a. Extract key fragment from error message (error code, class name, exception type, 2-4 words)
   b. Set `{kb_troubleshooting_path}` = `{project-root}/docs/knowledge-base/troubleshooting`
   c. If directory exists: use Grep to search for error fragment in `{kb_troubleshooting_path}/**/*.md` (search `error_patterns` fields)
   d. If KB entry found → read full entry, prioritize the "解決方案" section approach
   e. If not found → proceed with normal debugging
   f. After successful fix → trigger KB write-back check (see Step 8)

---

### 7. REFACTOR Phase

1. Improve code structure while keeping tests green
2. Ensure code follows architecture patterns and coding standards from Dev Notes

### 8. Document Technical Approach

Document technical approach and decisions in Dev Agent Record → Implementation Plan.

---

## HALT CONDITIONS

- **Additional dependencies required beyond story specifications:** HALT — "Additional dependencies need user approval"
- **3 consecutive implementation failures:** HALT and request guidance
- **Required configuration is missing:** HALT — "Cannot proceed without necessary configuration files"

---

## CRITICAL CONSTRAINTS

> **CRITICAL:** NEVER implement anything not mapped to a specific task/subtask in the story file.
>
> **CRITICAL:** NEVER proceed to next task until current task/subtask is complete AND tests pass.
>
> **CRITICAL:** Execute continuously without pausing until all tasks/subtasks are complete or explicit HALT condition.
>
> **CRITICAL:** Do NOT propose to pause for review until Step 9 completion gates are satisfied.

---

## SUCCESS METRICS

- Failing tests written BEFORE implementation (RED phase)
- Tests pass after minimal implementation (GREEN phase)
- Code refactored maintaining green tests (REFACTOR phase)
- KB consulted on any build/test failure
- Implementation plan documented in Dev Agent Record

## FAILURE MODES

- Writing tests after implementation (skipping RED phase)
- Implementing more than task requires (over-engineering)
- Not consulting KB on build failure before attempting fix
- Pausing mid-task for non-HALT reasons
- Adding features not in story tasks

---

**NEXT:** Load `step-05b-apply-migrations.md` (if new migrations created), otherwise proceed to `step-06-author-tests.md`
