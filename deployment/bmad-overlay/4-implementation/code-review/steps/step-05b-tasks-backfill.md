---
name: 'step-05b-tasks-backfill'
description: 'Mandatory tasks DB backfill verification — verify each task with file:line evidence'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-05b-tasks-backfill.md'
nextStepFile: '{workflow_path}/steps/step-06-report-archive.md'
---

# Step 5b: Mandatory Tasks DB Backfill

**Goal:** Verify every task with file:line evidence; backfill DB tasks field with ✅/⬜ markers.

---

## AVAILABLE STATE

- `{story_key}`, `{new_status}` — from Step 5

---

## EXECUTION SEQUENCE

> **⛔ HARD REQUIREMENT — 唯一合法執行方式:透過 Skill tool 調用 `/tasks-backfill-verify`**
>
> **FORBIDDEN paths(違反 = Step 6 §7.5 Memory Writeback Verification HARD BLOCK):**
> - ❌ `node .context-db/scripts/upsert-story.js --merge {id} --inline '{"tasks": "..."}'`(即使格式正確也違規 — 跳過 Skill SOP 逐項驗證 + self-check)
> - ❌ 直接 SQL `UPDATE stories SET tasks = ...`
> - ❌ 把 tasks 寫入合併到 Step 4 auto-fix 的 DB patch(常見誤區:Step 4 寫 AC/DoD/dev_notes 時「順手」一併寫 tasks → 跳過 Step 5b Skill 流程)
> - ❌ 假設 Skill 不存在直接 fallback 手動(過時 MEMORY 可能記錄「Skill 未安裝」,但 Skills 清單載入時可見 `tasks-backfill-verify` 即為已安裝)
>
> **Skill 調用成功 marker(MUST record in CR report 和 dev_notes):**
> `[tasks-backfill-verify invoked @ {timestamp} — Skill SOP 6-item self-check PASS]`
>
> Step 6 §7.5 Memory Writeback Verification 會檢查此 marker 存在 + `stories.test_count` 非 NULL(Skill Step 6 必產出的 side effect)。

> **⚠️ CR 角色獨立性(違反 = CR 審查失效,等同未審查):**
>
> `tasks-backfill-verify` Skill 在 **dev-story 和 code-review 兩階段都必須調用**。兩次調用的**目的不同、不可合併、不可替代**:
>
> | 階段 | 角色 | 動作本質 |
> |------|------|---------|
> | dev-story Step 9 | **Implementer(自證回填)** | 根據自己剛做的 implementation 回填 ✅/⬜ 到 DB — 夾帶主觀/偏向 |
> | **code-review Step 5b** | **Adversarial Reviewer(對抗審查)** | **獨立重新** Read 每個 task 涉及的 code、重新定位 file:line、驗證 dev 的 ✅ 是否有真證據;發現偽 ✅ → 翻 ⬜ + 建立新 finding |
>
> **FORBIDDEN(CR 審查本質違反):**
> - ❌ 「dev-story 已調用過 Skill + tasks 格式正確 → CR 可跳過」— dev 是自證,CR 是對抗,兩者不可互換
> - ❌ 「DB tasks 內容與 dev 回填相同所以不需再跑 Skill」— CR 必須獨立重跑,即使最終結論相同(這個「相同」本身是 CR 的獨立判斷產出)
> - ❌ 沿用 dev-story 的 file:line 證據不 Read code — CR 必須親自 Read(行號可能已漂移 / dev 可能盲勾)
> - ❌ 「tasks 已寫入 DB = Step 5b done」— 除非 CR 階段有 `[tasks-backfill-verify invoked @ {cr_ts} — code-review phase]` marker,否則視同未執行
>
> **MANDATORY:**
> - CR 階段 Skill 調用必須 Read 每個 task 涉及的 code,**即使 dev-story 已 Read 過**
> - CR 若發現 dev 的 ✅ 無真證據 / 行號漂移 / 實作與描述不符 → 翻轉為 ⬜ 並於 Step 3/4 建立新 finding
> - CR 若確認 dev 的 ✅ 正確 → 仍需重新寫入 DB(marker + `test_count` 更新是「CR 已獨立驗證」的訊號,非「tasks 內容變更」的訊號)
> - Skill marker 必須記錄**兩次**:dev_notes 含 dev-story 階段 marker + CR report 含 code-review 階段 marker
>
> **根本理由:** 如果 CR 因 dev 已回填就跳過 Skill,CR 等同未執行 tasks 審查 —「幹嘛審查」。
>
> **Incident:**
> - 2026-04-13 eft-editor-image-panel CR 新視窗因 dev 已 ✅ 跳過獨立驗證 → `memory/feedback_cr_must_independent_backfill.md`
> - 2026-04-14 eft-editor-batch-image-panel-free-open CR 把 tasks 寫入合併到 Step 4 auto-fix、未調用 Skill,等同沿用 dev 回填跳過審查 — 使用者三次追問才補救。

> **⚠️ CR 階段 UI 行為驗證獨立性(2026-04-14 新增 — 違反 = UI 驗證失效,等同未測):**
>
> 當 CR scope 涉及 UI(diff 含 `.tsx` / `.css` / DOM 結構 / layout / gating / tier label 類變更),**Vitest 與 Chrome MCP 兩層驗證都必須執行**,不可互相替代。
>
> | 階段 + 工具 | 角色 | 覆蓋範圍 |
> |------|------|---------|
> | dev-story + Vitest | **Implementer 自證** | 組件渲染 / prop 傳遞 / 單元邏輯 / accessible name |
> | **code-review + Chrome MCP** | **Adversarial Reviewer 對抗 live check** | **DOM computed style(flex-direction / align-items)/ visual layout / interaction timing / 跨 plan 一致性 / class 遷移落實** |
>
> **FORBIDDEN(等同未執行 UI 審查):**
> - ❌ 「Vitest N/N 通過 → CR 可跳過 Chrome MCP」— Vitest 測不到 computed style / visual layout / click timing / cross-plan 行為
> - ❌ 「UI 驗證留給 post-CR QA / 手動測試」— server 在跑 + Chrome MCP 在 tool list = 必須當場做
> - ❌ 單 plan 驗證代替跨 plan(涉及 plan gating 的 Story 至少 Free + 1 個付費 plan)
> - ❌ 依賴 accessibility snapshot 判 layout(snapshot 不含 computed style,必須 `evaluate_script` 讀 `getComputedStyle`)
> - ❌ 把 UI ⬜ tasks 標「post-CR live 驗證」就標 Story done(Production Gate §5.3 acs_incomplete 應計入 UI 驗證缺口)
>
> **MANDATORY 流程(與 step-03 §10 UI Behavioral 同步):**
> 1. **前置檢查**:`curl -k -s -o /dev/null -w "%{http_code}" https://localhost:7135` + vite 5173 → server 活著 → `list_pages` 確認 Chrome 可用
> 2. **至少驗**:
>    - `evaluate_script` 讀 DOM class / computed style 對照每個 UI 類 AC(file:line 等級證據)
>    - `take_screenshot` 存圖至 `docs/implementation-artifacts/reviews/epic-{X}/{story-id}-{plan}-verification.png` 供視覺比對
>    - `click` 關鍵互動驗 state transitions(toggle / dropdown / modal)
> 3. **跨 plan 矩陣**:涉及 plan gating → 至少 Free(A1) + 1 個付費(A4 Pro 或 A5 Business)
> 4. **CR report MUST 含 marker**:`[Chrome MCP Live Verification @ {cr_ts} — {plan_list}, {N} AC PASS]`
> 5. **Server 未跑時**:建立 verification Story 而非 ⬜ 帶過 — step-06 §7.5 Gate 8 Defer Audit 會 HARD BLOCK 未驗 UI Story
>
> **根本理由:** 如果 CR 因 Vitest 通過就跳過 Chrome MCP,DOM computed style + visual layout + interaction timing + cross-plan 一致性永遠沒人驗 — 上線後出 bug 才抓到。CR 的 Adversarial 本質不只對 code / tasks,也對 UI 行為。
>
> **Incident:** 2026-04-14 `eft-editor-batch-image-panel-free-open` CR 依 Vitest 22/22 通過標 done,⬜ tasks 5.4/5.5/5.6 全寫「post-CR QA」;使用者質疑後補做 Chrome MCP A1+A4 驗證,才確認 7 項 AC 實際全通過 + cross-plan DOM 一致 → `context_entries` id=3288。耗時多 20 分鐘補做 + 2 次 user 追問,遠超一次到位成本。

> **CRITICAL:** 🔴 MANDATORY BACKFILL — 此步驟不可跳過,不可延後!
>
> **CRITICAL:** 完成 Code Review 報告和所有修復後,必須呼叫 /tasks-backfill-verify

**PROTOCOL:** Invoke the Skill tool: `/tasks-backfill-verify {story_key}`

---

### Verification Standards (Violations = Backfill Failure)

1. Each ✅ MUST have actual Read code file:line evidence
2. Each ⬜ MUST have reason for incompletion
3. FORBIDDEN: `[x]/[ ]` format (must use ✅/⬜ emoji)
4. `tasks` field must be Markdown string (NOT JSON array)
5. Cannot mark all ✅ because "looks done" — each task independently verified

---

### For any status:

**If `{new_status}` == "done":**
- Backfill tasks + file_list + test_count to DB via `/tasks-backfill-verify`
- Confirm DB write completed by querying story tasks field

**If `{new_status}` != "done":**
- Still run `/tasks-backfill-verify` to record partial completion state
- Output: ⬜ Tasks backfill recorded with partial completion state

---

**Output:** Tasks 回填驗證完成 — DB tasks 欄位已更新為 ✅/⬜ 格式

---

## SUCCESS METRICS

- `/tasks-backfill-verify` invoked and completed
- DB tasks field updated with ✅/⬜ markers
- All ✅ backed by file:line evidence
- All ⬜ have stated reason

## FAILURE MODES

- Skipping backfill (CRITICAL violation)
- Using `[x]/[ ]` format instead of ✅/⬜
- Marking all ✅ without per-task verification
- Not confirming DB write

---

**NEXT:** Load `step-06-report-archive.md`
