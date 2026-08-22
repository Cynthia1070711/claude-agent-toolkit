---
name: 'step-07-run-validations'
description: 'Run full test suite, linting, and validate all acceptance criteria'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-07-run-validations.md'
nextStepFile: '{workflow_path}/steps/step-08-validate-complete.md'
---

# Step 7: Run Validations

**Goal:** Run all tests and linting to ensure no regressions and all ACs are satisfied.

---

## EXECUTION SEQUENCE

### 1. Determine Test Framework

Infer test framework from project structure (look for `.csproj`, `package.json`, test directories).

### 2. Run All Existing Tests

Run all existing tests to ensure no regressions.

**If regression tests fail:** STOP and fix before continuing — identify breaking changes immediately.

### 3. Run New Tests

Run the new tests to verify implementation correctness.

**If new tests fail:** STOP and fix before continuing — ensure implementation correctness.

### 4. Run Linting and Code Quality Checks

Run linting and code quality checks if configured in project.

### 5. Validate Acceptance Criteria

Validate implementation meets ALL story acceptance criteria; enforce quantitative thresholds explicitly.

### 6. 3-Round Debug Limit (v2.0 NEW — Path δ 微創)

> **Added 2026-05-10**: 對齊 PhyCool Memory `.claude/rules/testing.md` "3-round debug limit"。step-05 implementation 階段已有 HALT condition (3 consecutive implementation failures),本 §6 補強**驗證階段** debug limit (regression / new test / lint failure)。

**觸發條件**: §2 / §3 / §4 任一 fail

**3-Round Systematic Debug Protocol**:

#### Round 1 — KB Lookup + Quick Fix
1. Extract error fragment (error code / class / exception type, 2-4 words)
2. Search KB: `Grep` `docs/knowledge-base/troubleshooting/**/*.md` for `error_patterns`
3. 若 KB hit → 套用 KB "解決方案" 修復
4. 若 KB miss → systematic debug:
   - Read 失敗 test source code
   - Read 對應 implementation source code
   - Compare expected vs actual,定位 root cause
   - 提出 fix hypothesis
5. 套 fix → re-run test
6. Pass → 繼續 §5 / §7;Fail → Round 2

#### Round 2 — Search Memory + Cross-Story Pattern
1. `mcp__phycool-context__search_tech` for similar bug fix (category=bugfix)
2. `mcp__phycool-context__search_context` for similar issue (category=debug)
3. 若 hit → 套用既有 pattern
4. 若 miss → re-analyze:
   - 是否 test assertion 錯 (test 自己 bug)?
   - 是否 implementation logic 錯?
   - 是否 environment / config 錯 (e.g., DB connection / API key)?
5. 套 fix → re-run test
6. Pass → 繼續 §5 / §7;Fail → Round 3

#### Round 3 — Context Compress + Escalate
1. **Stop attempting fix immediately**
2. Compress context (write current state to dev-story tracking file)
3. **HALT and request guidance**:
   ```
   🚨 Debug Round Limit Reached (3 rounds, all failed)
   - Failed test: {test_name}
   - Failed assertion: {assertion}
   - Round 1 attempt: {fix} → {result}
   - Round 2 attempt: {fix} → {result}
   - Round 3 attempt: {fix} → {result}
   - Suspected root cause: {hypothesis}

   Recommended actions:
   - User intervene to verify root cause
   - Or split task into smaller scope (incremental implementation)
   - Or escalate to architect persona for design review
   - Or write tech_debt entry + revert change + create follow-up Story
   ```

**FORBIDDEN**:
- ❌ ≥ 4 round retry without HALT (infinite loop debug)
- ❌ Skip KB lookup at Round 1 (重複造輪子)
- ❌ Skip Memory search at Round 2 (失去 cross-Story 學習)
- ❌ Round 3 仍試圖 fix without escalate (累積污染 + 浪費 token)
- ❌ Round 1 直接套 fix without root cause 分析 (盲修,可能引新 bug)

**Round 計數重置時機**:
- 不同 test 失敗 → 各自 round counter (e.g., test A 3 round + test B 3 round = OK)
- 同一 test 經 fix pass 後又因新改動 fail → counter reset (新 fail 不繼承舊 round)

### 7. Build Error Minimal-Fix Constraint (NEW)

> **Principle:** 修 build / TypeScript 錯誤時，**只改最小必要行數**。不展開 scope。

**觸發條件**: §2 / §3 失敗原因為 build 錯誤（tsc 錯誤 / 編譯失敗 / 型別遺失）

**允許動作** ✅:
- 新增型別標註 / null check / 修 import 路徑
- 補 interface 缺少的成員 / 修正 return type
- 更新型別定義以符合已實作的邏輯

**禁止動作** ❌:
- 重構鄰近程式碼（scope creep）
- Rename 變數 / 函式（需要時走 `gitnexus_rename`，不是 find-replace）
- 趁機加新功能 / 新抽象層
- 改動 implementation 邏輯（只修 build 錯誤本身）

**規模門檻**: 單一 build 錯誤通常 ≤ 1–2 行修正。若發現自己要寫 >10 行才能修一個錯誤 → **立即停止**，走 §6 Round 3 escalate，勿繼續盲修。

---

## SUCCESS METRICS

- All existing tests pass (zero regressions)
- All new tests pass
- Linting passes (if configured)
- All story ACs validated
- **v2.0**: 任何 fail 走 §6 3-Round Debug Protocol,Round 3 escalate 而非無限 retry

## FAILURE MODES

- Running only new tests and not the full suite
- Skipping regression check
- Ignoring linting failures
- Moving on despite test failures
- **v2.0**: ≥ 4 round retry without HALT (infinite loop)
- **v2.0**: 跳過 KB lookup / Memory search 直接盲修

---

**NEXT:** Load `step-08-validate-complete.md`

## Version History

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **2.0.0** | **2026-05-10** | **加 §6 3-Round Debug Limit + Systematic Debug Protocol**。觸發: User audit "BMAD workflow 是否有資安/效能 expert persona" → Path δ 全套補強 G4。對齊 PhyCool Memory `.claude/rules/testing.md` 3-round limit + agent-skills-main `debugging-and-error-recovery`。Round 1 KB lookup → Round 2 Memory search → Round 3 escalate (HALT)。防 infinite loop debug。 |
| 1.0.0 | (initial) | Initial run-validations workflow |
