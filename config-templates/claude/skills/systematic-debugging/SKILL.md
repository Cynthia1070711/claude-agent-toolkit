---
name: systematic-debugging
description: >
  Systematic root-cause debugging discipline 系統化根因除錯紀律 — Use when encountering any bug,
  test failure, unexpected behavior, performance problem, build failure, or integration issue.
  Forces 4-Phase investigation (Root Cause → Pattern → Hypothesis → Implementation) before any fix.
  Iron Law NO FIXES WITHOUT ROOT CAUSE / 零猜測 / 紅旗偵測 / 三次失敗後質疑架構 / 除錯 / 根因 / 修 bug.
  Distilled from superpowers MIT (Jesse Vincent 2025) + PhyCool BMAD workflow integration (v1.1.0).
version: 1.2.0
updated: 2026-06-10
created: 2026-05-22
last-synced-epic: stage-alpha
last-synced-date: 2026-06-10
last-synced-story: stage-alpha-phase-2c-skill-builder-regularization
author: CC-OPUS (distilled from superpowers)
source: claude token減量策略研究分析/工作流/superpowers-main/skills/systematic-debugging/
license: MIT (Jesse Vincent 2025, see superpowers-main/LICENSE)
disable-model-invocation: false
user-invocable: true
triggers:
  - bug fix
  - test failure
  - debugging
  - root cause
  - unexpected behavior
  - integration issue
  - performance issue
  - build failure
  - 除錯
  - 根因
  - 找問題
  - 修 bug
  - 系統化除錯
  - root-cause investigation
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:
- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

**Don't skip when:**
- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Manager wants it fixed NOW (systematic is faster than thrashing)

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - They often contain the exact solution
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. **Reproduce Consistently**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible → gather more data, don't guess

3. **Check Recent Changes**
   - What changed that could cause this?
   - Git diff, recent commits
   - New dependencies, config changes
   - Environmental differences

4. **Gather Evidence in Multi-Component Systems**

   **WHEN system has multiple components (CI → build → signing, API → service → database):**

   **BEFORE proposing fixes, add diagnostic instrumentation:**
   ```
   For EACH component boundary:
     - Log what data enters component
     - Log what data exits component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks
   THEN analyze evidence to identify failing component
   THEN investigate that specific component
   ```

   **Example (multi-layer system):**
   ```bash
   # Layer 1: Workflow
   echo "=== Secrets available in workflow: ==="
   echo "IDENTITY: ${IDENTITY:+SET}${IDENTITY:-UNSET}"

   # Layer 2: Build script
   echo "=== Env vars in build script: ==="
   env | grep IDENTITY || echo "IDENTITY not in environment"

   # Layer 3: Signing script
   echo "=== Keychain state: ==="
   security list-keychains
   security find-identity -v

   # Layer 4: Actual signing
   codesign --sign "$IDENTITY" --verbose=4 "$APP"
   ```

   **This reveals:** Which layer fails (secrets → workflow ✓, workflow → build ✗)

5. **Trace Data Flow**

   **WHEN error is deep in call stack:**

   See `root-cause-tracing.md` in this directory for the complete backward tracing technique.

   **Quick version:**
   - Where does bad value originate?
   - What called this with bad value?
   - Keep tracing up until you find the source
   - Fix at source, not at symptom

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**
   - Locate similar working code in same codebase
   - What works that's similar to what's broken?

2. **Compare Against References**
   - If implementing pattern, read reference implementation COMPLETELY
   - Don't skim - read every line
   - Understand the pattern fully before applying

3. **Identify Differences**
   - What's different between working and broken?
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - What other components does this need?
   - What settings, config, environment?
   - What assumptions does it make?

### Phase 3: Hypothesis and Testing

**Scientific method:**

1. **Form Single Hypothesis**
   - State clearly: "I think X is the root cause because Y"
   - Write it down
   - Be specific, not vague

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Don't fix multiple things at once

3. **Verify Before Continuing**
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis
   - DON'T add more fixes on top

4. **When You Don't Know**
   - Say "I don't understand X"
   - Don't pretend to know
   - Ask for help
   - Research more

### Phase 4: Implementation

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**
   - Simplest possible reproduction
   - Automated test if possible
   - One-off test script if no framework
   - MUST have before fixing
   - Use the `superpowers:test-driven-development` skill for writing proper failing tests

2. **Implement Single Fix**
   - Address the root cause identified
   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix**
   - Test passes now?
   - No other tests broken?
   - Issue actually resolved?

4. **If Fix Doesn't Work**
   - STOP
   - Count: How many fixes have you tried?
   - If < 3: Return to Phase 1, re-analyze with new information
   - **If ≥ 3: STOP and question the architecture (step 5 below)**
   - DON'T attempt Fix #4 without architectural discussion

5. **If 3+ Fixes Failed: Question Architecture**

   **Pattern indicating architectural problem:**
   - Each fix reveals new shared state/coupling/problem in different place
   - Fixes require "massive refactoring" to implement
   - Each fix creates new symptoms elsewhere

   **STOP and question fundamentals:**
   - Is this pattern fundamentally sound?
   - Are we "sticking with it through sheer inertia"?
   - Should we refactor architecture vs. continue fixing symptoms?

   **Discuss with your human partner before attempting more fixes**

   This is NOT a failed hypothesis - this is a wrong architecture.

## Evidence Grade — Forensic 三級證據 (v1.2.0 · ③ 蒸餾)

> 蒸餾自 BMAD Forensic Investigation 三級證據體系，與 `.claude/rules/constitutional-external-citation.md` §Anti-Speculation Mandate **同源正交**：Anti-Speculation 禁模糊投機詞（可能/應該/似乎...）；Evidence Grade 要求每個 debug conclusion 標明證據等級，讓讀者評估信心度。`[H]` 級正是「明確標記未驗證」，取代模糊投機詞。

每個 debug conclusion / root cause 陳述 **MUST 前綴 Evidence Grade `[C]` / `[D]` / `[H]`**：

| Grade | 定義 | 證據要求 | 對齊 Mandate |
|:-:|------|---------|------|
| **C** Confirmed | file:line 直接證據，實際 Read / 執行驗證 | 必附 `file:line` 或執行輸出 | Code Verification |
| **D** Deduced | 推論鏈可追溯（從 C 級證據邏輯推導） | 必列推論鏈每一步依據 | Depth-First Verification |
| **H** Hypothesized | 有明確確認標準但尚未驗證 | 必附「如何確認」的驗證步驟 | Anti-Speculation（明確標未驗證，取代模糊投機詞） |

**格式範例**（admin login TZ regression 案例）:
- `[C]` 根因 = cookie Expires 設為「現在」（`Login.cshtml.cs:173` `Expires = _taiwanTime.Now()`），實測 `document.cookie` 為空
- `[D]` 此 regression 始於 W1 TZ 改造 — 推論鏈：`[C]` git blame `:173` 從舊版改為 `_taiwanTime.Now()`（commit e39013a2）+ `[C]` e39013a2 是 TZ 收斂 commit → 邏輯推導
- `[H]` 假設可能涉 SignalR 重連 — 確認標準：加 reconnect 計數 log 跑一輪觀察

**Phase 對應**：Phase 1 gather 的證據標 `[C]`；Phase 2-3 推導標 `[D]`、未驗證假設標 `[H]`；Phase 4 fix 後 conclusion 必升 `[C]`（test pass 證據）。

**Investigation Output Path**（複雜 multi-component 調查，對齊 Phase 1 step 4）:
- 統一至 `docs/implementation-artifacts/investigations/{issue-id}-investigation.md`
- 記錄 4-Phase 過程 + 各 conclusion 的 Evidence Grade + 升級軌跡（H→D→C）

**FORBIDDEN**:
- ❌ debug conclusion 不標 Grade（讀者無法評估信心度）
- ❌ 把 `[H]` 當 `[C]` 陳述（假設偽裝成確認 = Anti-Speculation 違規）
- ❌ `[C]` 無 file:line / 執行輸出（Confirmed 必有直接證據）
- ❌ `[D]` 推論鏈跳步（Deduced 必可追溯每一步依據）

## Red Flags - STOP and Follow Process

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow
- **"One more fix attempt" (when already tried 2+)**
- **Each fix reveals new problem in different place**

**ALL of these mean: STOP. Return to Phase 1.**

**If 3+ fixes failed:** Question the architecture (see Phase 4.5)

## your human partner's Signals You're Doing It Wrong

**Watch for these redirections:**
- "Is that not happening?" - You assumed without verifying
- "Will it show us...?" - You should have added evidence gathering
- "Stop guessing" - You're proposing fixes without understanding
- "Ultrathink this" - Question fundamentals, not just symptoms
- "We're stuck?" (frustrated) - Your approach isn't working

**When you see these:** STOP. Return to Phase 1.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## When Process Reveals "No Root Cause"

If systematic investigation reveals issue is truly environmental, timing-dependent, or external:

1. You've completed the process
2. Document what you investigated
3. Implement appropriate handling (retry, timeout, error message)
4. Add monitoring/logging for future investigation

**But:** 95% of "no root cause" cases are incomplete investigation.

## Supporting Techniques

These techniques are part of systematic debugging and available in this directory:

- **`root-cause-tracing.md`** - Trace bugs backward through call stack to find original trigger
- **`defense-in-depth.md`** - Add validation at multiple layers after finding root cause
- **`condition-based-waiting.md`** - Replace arbitrary timeouts with condition polling

**Related skills:**
- **superpowers:test-driven-development** - For creating failing test case (Phase 4, Step 1)
- **superpowers:verification-before-completion** - Verify fix worked before claiming success

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common

---

## PhyCool Workflow Integration (v1.1.0 · D15-v2-C 2026-05-23)

> 對齊 tianji-pavilion v1.4.0 §Principle 3.5 適配深度 D4-6(PhyCool workflow trigger)。本章節將原版「4-Phase debugging」方法論落地至 PhyCool BMAD workflow 具體 trigger points。

### Trigger Points in PhyCool BMAD Workflow

**dev-story Step 3(Investigate)觸發**: bug fix Story 啟動本 skill 4 phases(Root Cause → Pattern → Hypothesis → Implementation),對齊 `.claude/rules/tasks-backfill.md` Step 3(read code + reproduce)driver。

**code-review Step 4(Auto-fix Triage)觸發**: CR 發現新 bug 走本 skill 4 phases 而非「打補丁」,對齊 `.claude/rules/cr-debt-doc-audit.md` Phase A2 「實際試修挑戰」(對應本 skill Phase 4 step 1)。

**「3+ fix failures」自我挑戰(Phase 4 step 5)**: 對應 PhyCool 「Architecture Discussion Trigger」紀律(同 bug 已試 ≥ 3 次仍未解 → STOP 討論架構),對齊 `.claude/rules/constitutional-depth-first.md` 反「Effort Theater」精神。

### PhyCool 失敗案例對照

| 案例 | PhyCool 案例 | Lesson |
|:----|:----|:----|
| Quick fix 跳 Phase 1 | 2026-04-11 V2-01 schema 假設違規 — `embedding_queue.status`(實 `processed`)未 PRAGMA verify 即下手 | PRAGMA-first / Phase 1 root cause 不可省 |
| 估計 vs 試修 | 2026-04-13 eft-imagepanel-gallery-unified CR Step 4 將 act() warnings 標 ACCEPTED(估計 7+ tests 要改,實測只 5 個 await waitFor)| 對齊 cr-debt-doc-audit Phase A 「實際嘗試修復」 |
| Symptom fix 而非 root | 2026-04-14 eft-editor-batch-image-panel-free-open CR 跳 Chrome MCP UI live verify 標「post-CR QA」 | verify ≠ post-fix QA · 本 skill Phase 4 step 3 |

### Cross-Ref SUPREME Mandates

- `.claude/rules/constitutional-standard.md` §Code Verification — Phase 1 必 Read 實際 code,禁記憶推測
- `.claude/rules/constitutional-depth-first.md` — Phase 2 Pattern Analysis 深度路徑,禁淺層 grep
- `.claude/rules/constitutional-external-citation.md` §Anti-Speculation — Evidence Grade `[H]` 級明確標未驗證,取代 30 詞模糊投機詞(可能/應該/似乎...);與 §Evidence Grade 同源正交
- `.claude/rules/depth-gate-warn-mandatory-resolution.md` — Phase 4 fix 失敗 WARN 必 resolve
- `.claude/rules/cr-debt-doc-audit.md` Phase A — CR「DEFERRED」前必走本 skill Phase 4 step 1 試修

### Tools Integration

- **PhyCool 偵測**: `mcp__phycool-context__search_debt` / `search_tech` / `search_context` 查歷史相似 bug(Phase 1 step 3「Check Recent Changes」)
- **Chrome MCP**: UI 類 bug 跑 `mcp__chrome-devtools__evaluate_script` + `take_screenshot`(Phase 1 step 4「Gather Evidence」)
- **PowerShell 7.6.1**: 系統呼叫對齊 `phycool-windows-ps-encoding` skill,避中文路徑 quoting 衝突
- **SQLite PRAGMA-first**: DB query 前對齊 `.claude/rules/context-memory.md` §DB Schema-First Mandate

---

## Source & Attribution

This skill is distilled from **superpowers-main** (MIT License, Copyright 2025 Jesse Vincent).

- **Source**: `claude token減量策略研究分析/工作流/superpowers-main/skills/systematic-debugging/`
- **License**: MIT — 0 line code copy · attribution 保留
- **PhyCool 適配**: 補 14 frontmatter 欄位 + 15 中英觸發詞(含 zh-TW)+ Pressure Test 5 區塊
- **Distillation date**: 2026-05-22 (Stage α Phase 2C skill-builder regularization)

License compliance: 0 line direct copy + MIT attribution 保留 + Apache 2.0 兼容(對齊 ADR-EXTERNAL-001/002 範式)。

## PhyCool Pressure Test (Discipline Level · skill-builder v3.2.0 §6)

### Iron Laws (3 條)

1. **NO FIXES WITHOUT ROOT CAUSE INVESTIGATION** — Phase 1 required before any fix
2. **ONE FIX AT A TIME** — No bundled refactoring during debug session
3. **3+ FAILED FIXES → QUESTION ARCHITECTURE** — STOP and challenge fundamentals(非 hypothesis fail,是 wrong architecture)

### Pressure Scenarios

| 維度 | 範例情境 | 違反輸出 |
|:----|:----|:----|
| 時間壓力 | 「Prod down · PM 催 hot-fix」 | 跳過 Phase 1,直接 propose fix |
| 路徑依賴 | 「已試 3 fixes · 試第 4 個」 | 不質疑架構,繼續 thrash |
| 合理化動機 | 「Simple bug 不用 systematic」 | Skip Phase 1 + 4 |

### Combined Pressure Test(三維交叉)

「Prod 5 min 前 down + 我已試 3 fixes + 第 4 個感覺對」→ **必 STOP**,即使三軸全壓仍走 Iron Law #3 質疑架構。

### Rationalization Table(對齊 saas-to-skill v3.3.0 §5.4 面向 8)

| Forbidden | Common Rationalization | Red Flag |
|:----|:----|:----|
| Phase 1 跳過 | 「Simple bug 一看就知道」 | output 缺 stack trace 完整分析 + reproduce steps |
| 第 4 fix 不質疑架構 | 「再試一個就好」/「one more attempt」 | 已記錄 3+ 失敗仍 propose fix #4 |
| Symptom fix | 「先 patch 再說」 | 不 trace data flow 至 source |
| Mock + skip verify | 「Test 跑過就 ok」 | 不檢查 mock 是否反映 prod path |

### Red Flags(可偵測訊號)

- output 含「probably」/「likely」/「應該」 → 未驗證 root cause
- 直接 propose fix 不附 stack trace / call chain 分析
- 3+ fixes 後 output 仍含「one more attempt」
- 各 fix 揭示新 problem(連鎖 cascade)→ 必走 Phase 4 step 5
- 缺 reproduce steps 直接改 code
