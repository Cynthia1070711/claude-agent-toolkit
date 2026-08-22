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

> **⚠️ Chrome MCP 能力判準(2026-08-03 新增 — bwu-12 事故;與上方 UI 行為驗證獨立性同節但問題不同,不可混用):**
>
> 上方規範的是「UI 元件是否已用 Chrome MCP 驗證」;本節規範的是**「Chrome MCP(或其他 MCP-only 能力)本身是否可用」**。該族 debt(`chrome-devtools-mcp` 連線能力)已**三次復發** —— 前兩次的 `fixed` 依據皆為「本次重試成功」,五天內即再度不可達。完整判準(能力判定禁 port/HTTP 探測、fixed 需 ≥2 次不同日期獨立觀察、三種誠實延後情境)之 **SSoT 在 `.claude/rules/tasks-backfill.md` §Chrome MCP 能力判準**,本節僅同步 CR 階段消費點,**不得**與該節矛盾。
>
> **FORBIDDEN(能力判準專屬):**
> - ❌ 以 port / HTTP 探測(如 9222)判定 MCP 可用性 —— `.mcp.json` 的 `chrome-devtools` 走 `--autoConnect`,Chrome 用隨機 port,port 探測必假陰性
> - ❌ CR 以「這次重試成功」單次直接調用觀察就把能力類 debt 標 `fixed`(需 ≥2 次、時間戳分屬不同日期的**獨立觀察**,`search_tech({tech_stack:'chrome-devtools-mcp', outcome:'success'})` 查詢確認)
> - ❌ 工具層不可達(server 在跑但 MCP tool 打不通)卻跳過三層替代驗證(端到端 API + 元件渲染 + 靜態樣式斷言),或未在 CR 報告具名列出未覆蓋面(視覺 / 版面)
> - ❌ 主張「server 未跑」與「工具層不可達」以外存在第四種誠實延後情境
> - ❌ pipeline 子視窗連真實 Chrome 驗證此能力(`memory/feedback_subwindow_chrome_mcp_sandbox_only.md`——子視窗僅沙盒,此類觀察須由主視窗執行)
>
> **MANDATORY:** 能力判定一律**直接調用 MCP tool**(如 `list_pages`);每次成功觀察落 `add_tech({tech_stack:'chrome-devtools-mcp', outcome:'success', ...})`(offset-aware `+08:00`);CR 標 fixed 前先 `search_tech` 複驗 ≥2 筆不同日期記錄。
>
> **根本理由:** 單次觀察無法區分「已修復」與「這次剛好通了」—— 這正是該族 debt 三次復發的根因。把一種單次觀察換成另一種單次觀察(如改探別的 port)依然回答不了這個根因;能回答它的判準必須是「需要幾次獨立觀察」,而非「該跑哪支探測」。
>
> **Incident:** `TD-TDB1-…` / `TD-WHP10-…` 於 2026-07-29 皆以單次重試成功標 `fixed`,五天後同能力再度不可達,觸發 bwu-12 建立本判準。

> **⚠️ CR 階段 API / Auth 行為驗證獨立性(2026-06-13 新增 — 違反 = auth/API 驗證失效,等同未測):**
>
> 當 CR scope 涉及 backend API 行為(diff 含 Controller `.cs` / `[Authorize]` / `[AdminPermission]` / policy / `IAuthorizationPolicyProvider` / `AddPolicy` / `CookieOptions` / `[Route]` / `AddAuthentication`),**單元測試與 runtime integration test 兩層都必須執行**,不可互相替代。
>
> | 階段 + 工具 | 角色 | 覆蓋範圍 |
> |------|------|---------|
> | dev-story + 單元測試(reflection) | **Implementer 自證** | attribute 宣告 / service 邏輯 / enum 值 |
> | **code-review + runtime integration test** | **Adversarial Reviewer 對抗 live check** | **真實 HTTP status(200/401/403/500)/ policy 能否解析 / cookie 是否送達 / route 是否命中** |
>
> **FORBIDDEN(等同未執行 API 審查):**
> - ❌ 「reflection 驗 `attr.Policy == "X"` 通過 → CR 可跳過 runtime」— reflection 測宣告非行為(policy 可能解析時 500、cookie 可能送不到 401)
> - ❌ 「auth 驗證留給 post-CR / 手動測試」— `CustomWebApplicationFactory` 在 + server 可跑 = 必須當場做
> - ❌ 把 auth/route ⬜ task 標「post-CR 驗證」就標 Story done
>
> **MANDATORY 流程:**
> 1. **integration test 優先**:用既有 `CustomWebApplicationFactory` + `HttpClient.CreateClient()` 對每個受影響 endpoint 斷言 status(至少:無 token → 401/403 非 500;有效 auth → 200)。範式 `JwtOnTokenValidatedIntegrationTests` / `SubscriptionRouteTests`
> 2. **或 server 在跑時**:curl / Chrome MCP 實打 endpoint 看 status(`curl -k https://localhost:7135/api/v1/mgmt/{endpoint}`)
> 3. **CR report MUST 含 marker**:`[API Runtime Verification @ {cr_ts} — {endpoints}, {status_codes}]`
> 4. **Server 未跑且無 integration test 時**:建立 verification Story 而非 ⬜ 帶過 — step-06 §7.5 Gate 8 API 腿會 HARD BLOCK
>
> **根本理由:** auth / policy / cookie / route 的正確性只在 runtime 顯現。reflection 驗 attribute 字串永遠測不到「policy 解析 500」「cookie 送不到 401」。CR 的 Adversarial 本質對 auth 行為一樣適用。
>
> **Incident:** 2026-06-13 admin 後台 client API 全壞 3 個月 — cookie path `/mgmt` 不 cover `/api/v1/mgmt`(RC-A 401)+ `AdminPermission_None` policy 回 null(RC-B 500)。`DashboardControllerRbacTests` 只 reflection 驗 `attr.Policy` 通過,CR 從未實打 endpoint → 漏網 3 個月,直到資訊校正任務用 Chrome MCP live 逐頁驗證才撞見。一行 `client.GetAsync(...)` integration test 即可擋下。

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
