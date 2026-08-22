---
name: verification-before-completion
description: >
  Verification before completion discipline 完成前驗證紀律 — Use when about to claim work is complete,
  fixed, or passing; before committing, creating PRs, or marking tasks done. Forces running
  verification commands and confirming output before any success claims. 完成前驗證 / 證據優先 /
  禁謊報完成 / 宣告完成 / Evidence-based gate / 跑測試確認 / 證據先於斷言.
  Distilled from superpowers MIT (Jesse Vincent 2025) + PhyCool BMAD workflow integration (v1.1.0).
version: 1.1.0
updated: 2026-05-23
created: 2026-05-22
last-synced-epic: stage-alpha
last-synced-date: 2026-05-22
last-synced-story: stage-alpha-phase-2c-skill-builder-regularization
author: CC-OPUS (distilled from superpowers)
source: claude token減量策略研究分析/工作流/superpowers-main/skills/verification-before-completion/
license: MIT (Jesse Vincent 2025, see superpowers-main/LICENSE)
disable-model-invocation: false
user-invocable: true
triggers:
  - verify completion
  - claim done
  - claim fixed
  - claim passing
  - PR creation
  - commit verification
  - evidence-based
  - run tests
  - check output
  - 完成驗證
  - 宣告完成
  - 證據優先
  - 跑測試確認
  - 禁謊報完成
---

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Why This Matters

From 24 failure memories:
- your human partner said "I don't believe you" - trust broken
- Undefined functions shipped - would crash
- Missing requirements shipped - incomplete features
- Time wasted on false completion → redirect → rework
- Violates: "Honesty is a core value. If you lie, you'll be replaced."

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

This is non-negotiable.

---

## PhyCool Workflow Integration (v1.1.0 · D15-v2-C 2026-05-23)

> 對齊 tianji-pavilion v1.4.0 §Principle 3.5 適配深度 D4-6(PhyCool workflow trigger)。本章節將原版「verify before claim」方法論落地至 PhyCool BMAD workflow 具體 trigger points。

### Trigger Points in PhyCool BMAD Workflow

**dev-story Step 9(Pre-Archive)觸發**: 標 Story `review` 前必走本 skill Gate Function 5 steps(IDENTIFY → RUN → READ → VERIFY → CLAIM),對齊 `.claude/rules/tasks-backfill.md` Step 9 driver(tasks 必 file:line evidence)。

**code-review Step 4-5(Auto-fix Verification)觸發**: 每 FIXED finding 必跑對應 verification command(`npm test` / `dotnet test` / Chrome MCP `evaluate_script` / `sqlcmd`),對齊 `.claude/rules/cr-debt-doc-audit.md` Phase A2.2「FixCost ≥ M=5 必 spike 實測」。

**commit / PR 前觸發**: 走 `node scripts/check-hygiene.ps1`(PowerShell 7.6.1 環境)+ verification command,對齊 `.claude/rules/pre-audit-mandate.md` §3.5 Commit Pre-Check 5 題。

### PhyCool 失敗案例對照

| 案例 | PhyCool 案例 | Lesson |
|:----|:----|:----|
| Claim done without test | 2026-04-21 td-testcontainers R1 標 5 drift「INFO 不計 score」未 update tasks/dev_notes/file_list,A4 PASS 但 A5 不做 | RUN command, READ output, THEN claim |
| Mock-only verify | 2026-04-14 eft-editor-batch-image-panel-free-open CR Vitest 22/22 通過標 done,Chrome MCP UI live verify 留「post-CR QA」 | Mock 過 ≠ 真實過,UI live verify 必 CR 階段做 |
| Trust agent report | 2026-04-28 Session 55 直接 Edit SKILL.md 跳過 Skill tool 字面調用「technically aligned with SOP」 | Verify independently — transcript 必含 `Skill(...)` literal invoke |
| Paraphrased success | 多次「應該通過」「looks correct」claim 但無 command output evidence | Spirit over letter — 任何「likely / should / 應該」without data 禁用 |

### Cross-Ref SUPREME Mandates

- `.claude/rules/constitutional-standard.md` §Code Verification — claim 必 file:line evidence
- `.claude/rules/constitutional-external-citation.md` §Anti-Speculation — 30 詞投機表禁用(「應該 / 估計 / 可能」等)
- `.claude/rules/depth-gate-warn-mandatory-resolution.md` — verify 結果 WARN 必 resolve
- `.claude/rules/pre-audit-mandate.md` §3.5 Commit Pre-Check 5 題 — commit 前 5 題自答

### Tools Integration

- **`node scripts/check-hygiene.ps1`** — commit pre-check(PowerShell 7.6.1 環境)
- **`node scripts/check-traditional-chinese.cjs`** — zh-TW 紀律驗證
- **`mcp__phycool-context__search_context`** + `include_content: true` — verify 既有 incident 對照
- **Chrome MCP**: `evaluate_script` + `take_screenshot` UI live verify
- **`git show --stat <hash>`** — commit verify(file 範圍 + insertion/deletion count)
- **UTF-8 No-BOM**: verify output / commit message 用 UTF-8 No-BOM(對齊 `phycool-windows-ps-encoding`)

---

## Source & Attribution

This skill is distilled from **superpowers-main** (MIT License, Copyright 2025 Jesse Vincent).

- **Source**: `claude token減量策略研究分析/工作流/superpowers-main/skills/verification-before-completion/`
- **License**: MIT — 0 line code copy · attribution 保留
- **PhyCool 適配**: 補 14 frontmatter 欄位 + 15 中英觸發詞(含 zh-TW)+ Pressure Test 5 區塊
- **Distillation date**: 2026-05-22 (Stage α Phase 2C skill-builder regularization)

License compliance: 0 line direct copy + MIT attribution 保留 + Apache 2.0 兼容(對齊 ADR-EXTERNAL-001/002 範式)。

## PhyCool Pressure Test (Discipline Level · skill-builder v3.2.0 §6)

### Iron Laws (3 條)

1. **RUN COMMAND, READ OUTPUT, THEN CLAIM** — 三步序列不可省
2. **NO PARAPHRASED SUCCESS WITHOUT EVIDENCE** — 「應該 OK」「大概通過」「likely」禁用
3. **APPLIES TO ALL SUCCESS VARIATIONS** — 含 commit / PR / claim 完成 / 滿意陳述 等所有正向

### Pressure Scenarios

| 維度 | 範例情境 | 違反輸出 |
|:----|:----|:----|
| 時間壓力 | 「Stage end 前 commit」 | claim 完成不跑 test |
| 樂觀偏誤 | 「之前都通過」 | skip verification |
| 合理化動機 | 「Trivial change 不用驗」 | output 無 command + output |

### Combined Pressure Test(三維交叉)

「Stage 結束 + 上次 commit 過 + 只改 1 行」→ **必跑 verification command 確認 output**。

### Rationalization Table(對齊 saas-to-skill v3.3.0 §5.4 面向 8)

| Forbidden | Common Rationalization | Red Flag |
|:----|:----|:----|
| 不跑 test 就 claim done | 「Trivial change」 | output 無 `npm test ✓` / `dotnet test` evidence |
| Paraphrased success | 「大概 OK」「應該通過」 | output 含「likely」/「should」/「應該」without data |
| 跳過 verify before PR | 「Sprint end 來不及」 | git commit + push 無 test run log |
| Mock-only verify | 「Mock 過了 = 真實過」 | 不跑 integration / E2E 仍 claim 完成 |

### Red Flags(可偵測訊號)

- claim「完成」/「fixed」/「通過」前 5 行 output 無 command execution log
- output 含 paraphrased success(「likely working」/「應該」/「大概」)
- 跳過 build verify(對齊 `verification-before-completion` + PhyCool depth-gate 概念)
- commit message 含「fixes #N」但 commit body / PR description 無 test passing evidence
- delegate agent 後 直接 claim「Agent 完成」without read agent output
