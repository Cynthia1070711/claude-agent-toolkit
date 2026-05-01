---
name: 'step-06.5-depth-gate'
description: 'Depth validation gate — 6 實質深度檢查 (D1-D6) 在 step-06 §9.5 5 維形式閘門通過後 / step-07 DB upsert 前執行'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/create-story'
thisStepFile: '{workflow_path}/steps/step-06.5-depth-gate.md'
nextStepFile: '{workflow_path}/steps/step-07-finalize.md'
---

# Step 6.5: Depth Validation Gate

**Goal:** 在 Story 5 維形式閘門通過後,執行 **7 項**深度實質驗證(Skill Read / ADR+IDD Cross-Ref / PRD Source / Chrome MCP Live / Iteration Pollution / Cross-Story / **Self-Write Verification** v1.1),確保 Story 不只形式合規,內容與當前 Skill/ADR/code/live state 交叉對齊,且 DB 寫入無 bash heredoc / template 損壞。

> **CRITICAL:** 🔒 DEPTH GATE — 形式閘門(Q1-Q5)驗「有沒有」,深度閘門驗「對不對」。跳過此 step 視同未驗證,Story 退回 backlog。

> **Incident**: 2026-04-14 `eft-gallery-templates-modal-wiring` Story 補全時,5 維形式閘門全過,但深度驗證發現 **8 個 issue**(誤讀 Controller/IDD 未同步 ADR/Skill 命名過時/auth fixture 缺 per-plan/tech_debt 流程錯/bf-3 父規格衝突/Chrome SSL 阻擋),觸發本 Step 建立。

---

## AVAILABLE STATE

- All variables from Step 0-6
- `{story_key}` — Target Story ID
- `{required_skills}` — Set in Step 6 §3
- Story file + DB row updated via step-06 §9.5 前

---

## EXECUTION SEQUENCE

### 1. Invoke Depth Gate Skill

**PROTOCOL:** Execute `pcpt-create-story-depth-gate` skill against the current Story.

```bash
node .claude/skills/pcpt-create-story-depth-gate/scripts/run-depth-gate.js {story_key}
```

> **CRITICAL:** ❌ FORBIDDEN — Skipping this invocation. Skipping == Story not validated → Story must return to backlog.

---

### 2. Parse Exit Code

| Exit | 意義 | Action |
|:---:|------|--------|
| 0 | All Gates PASS | Continue to step-07 |
| 1 | 有 WARN + `--accept-warn "reason"` 明確接受 | Continue, reason written to dev_notes as marker |
| 2 | 有 BLOCK **OR** 有 WARN 但無 `--accept-warn` | **HALT** — Story status revert to `backlog` |
| 3 | Script error | Troubleshoot `.claude/skills/pcpt-create-story-depth-gate/scripts/run-depth-gate.js` |

> **🚨 v1.3.0 WARN MANDATORY RESOLUTION POLICY**:
> - WARN 預設**等同 BLOCK**(exit=2),**不是**「軟性警告可繼續」
> - 使用者必須明確 `--accept-warn "reason"` 才能 exit=1 通過
> - 原因:Agent 若將 WARN 視可忽略 → 每次 create-story 累積相同 WARN → 迭代污染永久累積 → 工具失去信任
> - 本政策觸發事件: 2026-04-14 `eft-gallery-templates-modal-wiring` Wave 4 時 Agent 4 次 ultrathink 追問才校正 3 個 WARN
> - See: `.claude/rules/depth-gate-warn-mandatory-resolution.md` + `memory/feedback_depth_gate_warn_not_optional.md`

---

### 3. Handle BLOCK (Exit 2)

If exit code = 2, execute:

1. Update `stories.status` from `ready-for-dev` back to `backlog`:
   ```bash
   node .context-db/scripts/upsert-story.js --merge {story_key} --inline '{"status":"backlog","updated_at":"<taiwan-ts>"}'
   ```
2. Show user the Report output (printed by run-depth-gate.js)
3. Ask user:
   ```
   Depth Gate BLOCKED with N issues. Options:
     [a] Review BLOCK list and fix before continuing
     [b] Override (must provide written reason in dev_notes)
     [c] Abort create-story (Story remains backlog)
   ```
4. If user chooses [a]: user fixes issues → re-run step-06.5 → re-validate
5. If user chooses [b]: append user reason to `dev_notes`, re-mark `ready-for-dev`, continue
6. If user chooses [c]: exit workflow

---

### 4. Handle WARN without --accept-warn (Exit 2 視同 BLOCK,v1.3.0)

若 run-depth-gate.js 無 `--accept-warn` 但有 WARN → exit=2 (BLOCK 同流程):

1. HALT,Story status 退回 `backlog`
2. 對每個 WARN **逐項**決定:
   - **校正** (首選): 修 Skill 規則 or Story 內容,讓下次執行 PASS
   - **明確保留**: 重新執行 `--accept-warn "逐項說明保留理由,必須含 TD-xxx 或 scope justification"`
3. **禁止**: 靜默忽略 WARN 通過 (v1.3.0 政策已機制封鎖)

### 4b. Handle WARN with --accept-warn (Exit 1, informational)

若明確接受 WARN 通過:
1. `[WARN Retained @ {ts}] {reason}` marker 自動寫入 dev_notes
2. Continue to step-07
3. code-review 階段仍會看見 marker,reviewer 可質疑理由

---

### 5. Handle PASS (Exit 0)

If exit code = 0:

1. Show brief confirmation: `✅ Depth Gate 全 PASS (D1-D6)`
2. Continue to step-07

---

### 6. UI Story Manual Chrome MCP Confirmation (D4 follow-up)

**IF** Story is UI (D4 triggered) AND run-depth-gate.js reports server available:

1. Agent MUST manually invoke Chrome MCP tools in follow-up:
   - `mcp__chrome-devtools__list_pages`
   - `mcp__chrome-devtools__navigate_page url=<story-target-url>`
   - `mcp__chrome-devtools__evaluate_script` to verify main AC DOM state
   - `mcp__chrome-devtools__take_screenshot filePath=<report-path>`
2. If `navigate_page` returns `chrome-error://chromewebdata/`:
   - Tell user: "Chrome SSL blocked. Run `dotnet dev-certs https --clean && dotnet dev-certs https --trust` as admin, restart Chrome, then re-invoke step-06.5"
   - Mark D4 as PARTIAL in dev_notes + continue to step-07 (with warning)
3. Append screenshots path + live-verified status to `dev_notes` `## D4 Chrome MCP Live Evidence` section

---

## FORBIDDEN

- ❌ Skipping step-06.5 because "5 維閘門已過"
- ❌ 用 `--dry-run` 代替實際執行(dry-run 只供 testing)
- ❌ D4 Chrome MCP 標 PASS 但未實際 invoke tools(只憑 server probe 無法確認 AC 對齊)
- ❌ BLOCK 時不讓使用者看到 Report 就自動 override
- ❌ WARN 時清除 dev_notes report(必須保留供 dev-story / code-review 參考)

---

## Next Step

Continue to `step-07-finalize.md`.
