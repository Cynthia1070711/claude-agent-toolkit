---
name: receiving-code-review
description: >
  Code review reception discipline 接受程式碼審查紀律 — Use when receiving code review feedback,
  reviewer comments, PR review suggestions, especially if feedback seems unclear or technically
  questionable. Forces technical evaluation over performative agreement; requires verification
  before any change. 收到 CR 時 / 拒絕無腦同意 / 反駁有依據 / 審查意見 / 技術反駁.
  Distilled from superpowers MIT (Jesse Vincent 2025) + PhyCool BMAD workflow integration (v1.1.0).
version: 1.1.0
updated: 2026-05-23
created: 2026-05-22
last-synced-epic: stage-alpha
last-synced-date: 2026-05-22
last-synced-story: stage-alpha-phase-2c-skill-builder-regularization
author: CC-OPUS (distilled from superpowers)
source: claude token減量策略研究分析/工作流/superpowers-main/skills/receiving-code-review/
license: MIT (Jesse Vincent 2025, see superpowers-main/LICENSE)
disable-model-invocation: false
user-invocable: true
triggers:
  - code review
  - review feedback
  - reviewer comment
  - PR review
  - questionable feedback
  - blind implementation
  - performative agreement
  - 程式碼審查
  - CR feedback
  - 收到審查
  - 審查意見
  - 反駁審查
  - technical rebuttal
  - CR reception
---

# Code Review Reception

## Overview

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Response Pattern

```
WHEN receiving code review feedback:

1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words (or ask)
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Forbidden Responses

**NEVER:**
- "You're absolutely right!" (explicit CLAUDE.md violation)
- "Great point!" / "Excellent feedback!" (performative)
- "Let me implement that now" (before verification)

**INSTEAD:**
- Restate the technical requirement
- Ask clarifying questions
- Push back with technical reasoning if wrong
- Just start working (actions > words)

## Handling Unclear Feedback

```
IF any item is unclear:
  STOP - do not implement anything yet
  ASK for clarification on unclear items

WHY: Items may be related. Partial understanding = wrong implementation.
```

**Example:**
```
your human partner: "Fix 1-6"
You understand 1,2,3,6. Unclear on 4,5.

❌ WRONG: Implement 1,2,3,6 now, ask about 4,5 later
✅ RIGHT: "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## Source-Specific Handling

### From your human partner
- **Trusted** - implement after understanding
- **Still ask** if scope unclear
- **No performative agreement**
- **Skip to action** or technical acknowledgment

### From External Reviewers
```
BEFORE implementing:
  1. Check: Technically correct for THIS codebase?
  2. Check: Breaks existing functionality?
  3. Check: Reason for current implementation?
  4. Check: Works on all platforms/versions?
  5. Check: Does reviewer understand full context?

IF suggestion seems wrong:
  Push back with technical reasoning

IF can't easily verify:
  Say so: "I can't verify this without [X]. Should I [investigate/ask/proceed]?"

IF conflicts with your human partner's prior decisions:
  Stop and discuss with your human partner first
```

**your human partner's rule:** "External feedback - be skeptical, but check carefully"

## YAGNI Check for "Professional" Features

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage

  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used: Then implement properly
```

**your human partner's rule:** "You and reviewer both report to me. If we don't need this feature, don't add it."

## Implementation Order

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports)
     - Complex fixes (refactoring, logic)
  3. Test each fix individually
  4. Verify no regressions
```

## When To Push Back

Push back when:
- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Legacy/compatibility reasons exist
- Conflicts with your human partner's architectural decisions

**How to push back:**
- Use technical reasoning, not defensiveness
- Ask specific questions
- Reference working tests/code
- Involve your human partner if architectural

**Signal if uncomfortable pushing back out loud:** "Strange things are afoot at the Circle K"

## Acknowledging Correct Feedback

When feedback IS correct:
```
✅ "Fixed. [Brief description of what changed]"
✅ "Good catch - [specific issue]. Fixed in [location]."
✅ [Just fix it and show in the code]

❌ "You're absolutely right!"
❌ "Great point!"
❌ "Thanks for catching that!"
❌ "Thanks for [anything]"
❌ ANY gratitude expression
```

**Why no thanks:** Actions speak. Just fix it. The code itself shows you heard the feedback.

**If you catch yourself about to write "Thanks":** DELETE IT. State the fix instead.

## Gracefully Correcting Your Pushback

If you pushed back and were wrong:
```
✅ "You were right - I checked [X] and it does [Y]. Implementing now."
✅ "Verified this and you're correct. My initial understanding was wrong because [reason]. Fixing."

❌ Long apology
❌ Defending why you pushed back
❌ Over-explaining
```

State the correction factually and move on.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Performative agreement | State requirement or just act |
| Blind implementation | Verify against codebase first |
| Batch without testing | One at a time, test each |
| Assuming reviewer is right | Check if breaks things |
| Avoiding pushback | Technical correctness > comfort |
| Partial implementation | Clarify all items first |
| Can't verify, proceed anyway | State limitation, ask for direction |

## Real Examples

**Performative Agreement (Bad):**
```
Reviewer: "Remove legacy code"
❌ "You're absolutely right! Let me remove that..."
```

**Technical Verification (Good):**
```
Reviewer: "Remove legacy code"
✅ "Checking... build target is 10.15+, this API needs 13+. Need legacy for backward compat. Current impl has wrong bundle ID - fix it or drop pre-13 support?"
```

**YAGNI (Good):**
```
Reviewer: "Implement proper metrics tracking with database, date filters, CSV export"
✅ "Grepped codebase - nothing calls this endpoint. Remove it (YAGNI)? Or is there usage I'm missing?"
```

**Unclear Item (Good):**
```
your human partner: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.
✅ "Understand 1,2,3,6. Need clarification on 4 and 5 before implementing."
```

## GitHub Thread Replies

When replying to inline review comments on GitHub, reply in the comment thread (`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`), not as a top-level PR comment.

## The Bottom Line

**External feedback = suggestions to evaluate, not orders to follow.**

Verify. Question. Then implement.

No performative agreement. Technical rigor always.

---

## PhyCool Workflow Integration (v1.1.0 · D15-v2-C 2026-05-23)

> 對齊 tianji-pavilion v1.4.0 §Principle 3.5 適配深度 D4-6(PhyCool workflow trigger)。本章節將原版「CR reception 6 steps」方法論落地至 PhyCool BMAD workflow 具體 trigger points。

### Trigger Points in PhyCool BMAD Workflow

**code-review Step 5b(Tasks Backfill)觸發**: CR Agent 收到 reviewer comments 走本 skill 6 steps(READ → UNDERSTAND → VERIFY → EVALUATE → RESPOND → IMPLEMENT),對齊 `.claude/rules/tasks-backfill.md` §CR Phase Independence(Reviewer 對抗審查,非 dev 自證)。

**code-review Step 4(Auto-fix Triage)觸發**: DEFERRED / ACCEPTED 分類前必走「VERIFY」step(本 skill Response Pattern step 3),對齊 `.claude/rules/cr-debt-doc-audit.md` Phase A2 「實際試修挑戰」(對應本 skill「IF can't easily verify: state limitation」)。

**dev-story Step 9(Pre-Archive)觸發**: dev 收到 reviewer feedback 走本 skill 6 steps,禁「performative agreement」(對齊 CLAUDE.md「You're absolutely right!」CLAUDE.md violation 紀律)。

### PhyCool 失敗案例對照

| 案例 | PhyCool 案例 | Lesson |
|:----|:----|:----|
| Performative agreement | 2026-04-13 eft-editor-image-panel-free-open CR 新視窗因 dev 已 ✅ 跳過獨立驗證 → `memory/feedback_cr_must_independent_backfill.md` | CR 必 ADVERSARIAL,禁「dev 標 ✅ 就跳過」 |
| Blind implementation | 2026-04-16 td-hook-test-enhancement 直接 Edit 3 SKILL.md 繞過 SOP 被當場指出 | VERIFY against codebase reality before implementing |
| Skip YAGNI check | 2026-04-21 td-testcontainers R1 標 5 項 drift「INFO 不計 score」實際未 update tasks/dev_notes/file_list | YAGNI check 對齊本 skill「IF unused: Remove it」精神 |

### Cross-Ref SUPREME Mandates

- `.claude/rules/constitutional-standard.md` §Code Verification — VERIFY step 必 Read 實際 code
- `.claude/rules/cr-debt-doc-audit.md` Phase A — 對 reviewer「DEFERRED」前必走 step 3 試修挑戰
- `.claude/rules/tasks-backfill.md` §CR Phase Independence — CR adversarial reception(本 skill「External Reviewers」精神)
- `.claude/rules/skill-tool-invocation-mandatory.md` — reviewer 建議改 SKILL.md 前必走字面 Skill tool

### Tools Integration

- **`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`** — GitHub inline thread reply(本 skill §GitHub Thread Replies)
- **`mcp__phycool-context__search_debt`** — 查 reviewer 提的問題是否已有相似 debt 紀錄
- **PowerShell 7.6.1**: `gh` CLI 對齊 `phycool-windows-ps-encoding` skill(避中文路徑 quoting 衝突)
- **UTF-8 No-BOM**: PR reply markdown 用 UTF-8 No-BOM(對齊 `.claude/rules/crlf-normalize-discipline.md` §8.3)

---

## Source & Attribution

This skill is distilled from **superpowers-main** (MIT License, Copyright 2025 Jesse Vincent).

- **Source**: `claude token減量策略研究分析/工作流/superpowers-main/skills/receiving-code-review/`
- **License**: MIT — 0 line code copy · attribution 保留
- **PhyCool 適配**: 補 14 frontmatter 欄位 + 14 中英觸發詞(含 zh-TW)+ Pressure Test 5 區塊
- **Distillation date**: 2026-05-22 (Stage α Phase 2C skill-builder regularization)

License compliance: 0 line direct copy + MIT attribution 保留 + Apache 2.0 兼容(對齊 ADR-EXTERNAL-001/002 範式)。

## PhyCool Pressure Test (Discipline Level · skill-builder v3.2.0 §6)

### Iron Laws (3 條)

1. **TECHNICAL EVALUATION BEFORE AGREEMENT** — 評估 reviewer claim 真假再 implement
2. **VERIFY CLAIMS BEFORE IMPLEMENTING** — Reviewer 說「X 不安全」必先 grep / Read 驗證
3. **PUSH BACK ON UNCLEAR FEEDBACK** — 不懂的 feedback 不直接做,要 clarification

### Pressure Scenarios

| 維度 | 範例情境 | 違反輸出 |
|:----|:----|:----|
| 時間壓力 | 「Sprint 結束前 CR 必過」 | 全 ACCEPT 不驗證 |
| 權威壓力 | 「Senior 提的 CR comment」 | 無腦同意 |
| 合理化動機 | 「Reviewer 一定對」 | 跳過 verification |

### Combined Pressure Test(三維交叉)

「Sprint 結束 + Senior 提 + 看起來合理 + 沒時間驗」→ **必 PUSH BACK** + 要 reviewer clarify。

### Rationalization Table(對齊 saas-to-skill v3.3.0 §5.4 面向 8)

| Forbidden | Common Rationalization | Red Flag |
|:----|:----|:----|
| 無腦 implement reviewer suggestion | 「Reviewer 一定對」 | 沒 grep / 沒 verify 就改 |
| 模糊 feedback 直接做 | 「Senior 看得懂就好」 | output 沒「我理解 X 是 Y」確認句 |
| Performative agreement | 「先答 OK 再說」 | output 含「Good catch, fixing」無實際驗證 |
| Skip YAGNI 評估 | 「Reviewer 要做就做」 | grep 既有用法即可省的 work 仍做 |

### Red Flags(可偵測訊號)

- output 不含 file:line evidence 就 ACCEPT reviewer claim
- 無「我先驗證 X 才實作」步驟
- 全部 6+ comments 一致 ACCEPT 無一 PUSH BACK
- Reply 含「Good catch」/「You're right」但 transcript 無 verification log
- 模糊 feedback(只 1-2 字)直接 implement 不要 clarification
