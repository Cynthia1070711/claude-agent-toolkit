---
name: tianji-pavilion
version: 1.5.1
updated: 2026-08-02
description: |
  Use this skill when the user mentions integrating, adopting, or evaluating any
  external open-source resource — workflow, skill, hook, rule, agent, MCP server,
  methodology, prompt template, or third-party tool. Triggers include phrases like
  "想試試"、"升級"、"優化"、"進化"、"融合"、"看到一個"、"考慮採用"、"整合"、"導入"、"借鑒"、"參考"、"would like to try X"、
  "should I adopt"、"thinking about using"、"someone recommended"、"saw on GitHub"、
  "Anthropic recommends"、"this looks cool", or any conversation where the user
  describes an external resource and asks whether to incorporate it. The skill
  enforces the 5-phase Tianji-Pavilion protocol: Phase 0 Baseline (sovereignty
  4-question + Q4 latent-capability audit), Phase 1-2 Differential Benchmarking
  (A/B/C/D quadrant + 8-item context match), Phase 3 Essence Extraction (MVE
  distillation), Phase 4 Grafting (timeboxed pilot in worktree with kill switch),
  Phase 5 Validation (7-day observation + ADR). Provides templates for each
  mandatory deliverable, registers 8 mechanized hooks for forbidden patterns
  F2/F3/F5/F6/F7/F8/F11 plus impulse-cooldown, and writes structured records to
  baseline_snapshots / external_evaluations tables in .context-db. AI-agent
  timing variant: impulse-cooldown 3 days, pilot observation 7 days, REJECT
  cooldown 15 days. Do NOT use this skill for pure library version bumps,
  bug-fix patches, CVE security patches, or pure documentation translation.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Tianji-Pavilion v1.5.1 (AI-Agent Variant) — External Resource Integration Protocol

This skill operationalizes the Tianji-Pavilion methodology for evaluating whether
to integrate external open-source resources into a Claude Code project. It
combines the original 5-principle Charter and 5-phase Protocol with mechanized
enforcement via hooks and structured records in `.context-db`.

This variant is **tuned for AI-agent-driven development**: human-pace timing
parameters (7/30/90 days) are compressed to AI-pace (3/7/15 days) because the
underlying iteration loop is 10-100× faster.

---

## When to load this skill

**Strong triggers** (load immediately):

1. User mentions an external resource and asks "should I adopt it" / "想試試這個"
2. User pastes a GitHub link, blog post, or methodology document and asks for opinion
3. User says "integrate" / "import" / "incorporate" / "整合" / "導入" any external pattern
4. User starts comparing PhyCool's current approach to an external one
5. PreToolUse hook `q4-audit-gate.js` fires (worktree creation without recent audit)

**Do NOT load for**:

- Pure `npm`/NuGet version bumps (use semver judgment)
- Bug-fix patches with no architectural change
- CVE/security patches (handle via separate security workflow)
- Pure documentation translation
- Internal refactoring with no external influence

---

## Core mental model

```
Sovereignty First → Benchmark Differentially → Extract Essence (not form)
       ↓                    ↓                            ↓
   Phase 0 定境       Phase 1-2 較量              Phase 3 煉化
   "Is this really    "Where do we win,           "Take the soul,
    needed?"           where do we lose,           leave the body"
                       where do we lack?"
       ↓                    ↓                            ↓
                  Phase 4 嫁接 → Phase 5 驗真
                  Timeboxed pilot     7-day observation
                  Kill switch armed   ADR archived
```

**Anchor principle**: *守正出奇* — defend your sovereign ground; pillage external
treasures selectively. Never copy wholesale, never reject reflexively.

---

## The 5 Charter Principles (Heart Methods)

### Principle 1 — Sovereignty (主權原則)

> "以我為主，為我所用。" / "Make yourself the master, the rest are tools."

The existing project environment is the master. External resources are candidates,
never leaders. Authority does not lower verification standards — authority only
decides "is this worth evaluating".

**Mandatory pre-flight checklist (the Four Sovereignty Questions)**:

- **Q1**: What is my project's current corresponding module? (If "none" → enter
  Quadrant C path; if "I cannot answer" → I do not understand my own system,
  pause integration.)
- **Q2**: What specific pain point does integrating this solve? (If unspecific
  → impulse trigger, REJECT.)
- **Q3**: What happens if I do not integrate? (If "nothing" → do not integrate.)
- **Q4** (added v1.1.0): Have I fully audited my own existing capabilities,
  including **latent capabilities** (built but invoked 0 times by BMAD / pipelines
  / skills)?
  - **Verification method**: Run
    `node scripts/audit-capability-reachability.cjs --json` against
    `.context-db/server.js` MCP tools, `.context-db/scripts/init-db.js` schema,
    `.claude/hooks/pre-prompt-rag.js` Layers.
  - **If latent capability covers Q2 pain ≥ 70%** (BOTH `audit_score ≥ 0.70`
    AND human-rated `feature_match_pct ≥ 70`) → **force "activate existing"
    path, REJECT external integration before entering Phase 1**.

**Trigger source classification**:

| Trigger type | Example | Priority |
|---|---|---|
| Pain-driven | Existing module fails repeatedly | High |
| Quarterly review | Mandatory ecosystem scan every quarter | Medium |
| Active monitoring | Anthropic release / KOL post | Medium |
| Impulse | "This looks cool, I want to use it" | **Cold-storage 3 days** before re-evaluation |

### Principle 2 — Differential Benchmarking (差異化對標)

> "無比對，不整合。" / "No comparison, no integration."

Before integrating, run pairwise comparison and classify into 4 quadrants:

| Quadrant | State (you vs them) | Path |
|---|---|---|
| **A** Defend Strength | You have + you are better | 0% replacement, but extract 1-2 detail wins from them and reverse-strengthen |
| **B** Replace Weakness | You have + you are worse | Enter Phase 3 protocol, conditional replacement |
| **C** Fill Gap | You don't have + they have something useful | Enter Phase 3 protocol, distinguish "really useful" vs "looks useful" |
| **D** Discard | You don't have + you don't need it | Archive immediately, but **record reject reason** to prevent re-evaluation |

**Quadrant A trap**: A does not mean "ignore them". Since they are worth evaluating
at all, there must be something to learn. Even when you win overall, deliberately
search for one detail they got more right than you. Missing Quadrant A means
missing free evolution.

**Mandatory baseline quantification**: Without baseline, all subsequent "comparison"
is feeling, not measurement. Record:

- token consumption, execution time, success rate, bug frequency, maintenance cost
- Write to `baseline_snapshots` table in `.context-db`
- For Quadrant C, still quantify "current manual cost to handle this need"

### Principle 3 — Essence Extraction (去蕪存菁)

> "取其神，捨其形。" / "Take the soul, leave the body."

Refuse wholesale copy-paste. Deconstruct external resources, extract the
underlying logic, transform into Minimum Viable Element (MVE) adapted to your
environment.

**The Three Distillation Questions**:

- **Underlying logic**: Why did they design it this way? What root problem does it solve?
- **Context assumptions**: What did they assume? (team size, tech stack, budget,
  AI engine, language, region)
- **Essential portability**: Which parts are *soul* (portable root wisdom)?
  Which are *body* (artifacts of their context)?

**Context match checklist (8 items, any single NO requires scrutiny, 3+ NOs
auto-REJECT, item 8 = veto)**:

- [ ] Team size match? (you solo vs them N-person team)
- [ ] Tech stack match? (C# / ASP.NET Core / SQL Server / IIS / Win 11)
- [ ] Project phase match? (your phase vs theirs)
- [ ] Cost structure match? (your NT$ sensitivity vs theirs)
- [ ] Language / region match? (zh-TW, Taiwan regulations)
- [ ] AI engine match? (you are Claude-Code-only; if they assume multi-engine
      coordination → MISMATCH)
- [ ] Maintenance cost match? (you alone vs they have dedicated maintainer)
- [ ] **Item 8 (single-vote veto)**: Latent capability audit — does
      `audit-capability-reachability` show ≥ 70% coverage of Q2 pain?
      If YES → veto external, switch to "activate existing" path.

**MVE extraction**: Decompose external resource into smallest units, evaluate
each individually. A 200-line SKILL.md may have only 30 lines of essence. A 14-hook
toolkit may have only 2 hooks applicable to your context.

### Principle 3.5 — Adaptation Depth Quantification (適配深度量化) v1.4.0

> **觸發背景**: Stage α 4 Phase 蒸餾深度 ultrathink 評估均值 ~56%(中等偏低)— 需固化量化標準防止「文檔聲稱優化適配但實際照搬」反模式。完整 spec 見 [`references/adaptation-depth.md`](references/adaptation-depth.md)。

**5 級量化評分**(Phase 3 蒸餾完成 + 裁決 GO/PILOT/REJECT 前必走):

| 等級 | % | 定義 | Stage α 案例 |
|:---:|:---:|:----|:----|
| **L0 · 照搬** | 0-20% | byte-for-byte 複製,無修改 | (無) |
| **L1 · 微調** | 20-40% | frontmatter / triggers 補強 + body 100% 照搬 | Phase 2C 3 superpowers skills(30%)|
| **L2 · 混合** | 40-60% | 架構整合 + 部分內容適配 | Phase 2B ECC governance(40%)|
| **L3 · 優化適配** | 60-80% | 跨語言重寫 + 演算法優化 + 整合本地架構 + 本地化 | Phase 2A deepagents(75%)|
| **L4 · 深度適配** | 80%+ | algorithm idea level + 完整環境特化 + 法務合規 + roadmap | Phase 3 Khoj(80%)|

**4 維度適配 Checklist**(每維度 ≥ 1 ✅ 才算啟動):
- **D1 跨語言/語法轉換** — Python → JS / Markdown idea-level reference
- **D2 演算法/實作優化** — 更精簡 / 更高性能 / 更精準邊界(fail-open / BOM strip / timeout ≥ 2000ms)
- **D3 架構整合** — 禁整 module 移植 · 融入既有 hook/skill/pipeline · 對齊 SUPREME mandate
- **D4 本地化補強(7 必補項)** — zh-TW / UTC+8 / UTF-8(.md/.json/.cjs No-BOM · .ps1/.cs 必含 BOM)/ PowerShell **7.6.1** + Node 18+ + Windows 11 / 業務 secret patterns(ECPay/SendGrid/Azure/Anthropic)/ workflow trigger(dev-story/code-review/sprint-status.yaml/IDD/tasks-backfill-verify)/ 法務合規(ADR + LICENSE)

**裁決基線**: 目標 ≥ L3(60%+);L2 需 architecture 適配彌補;L1 需 upstream maintainer 明示紀律支撐;**L0 = REJECT**。

詳細 5 級 spec + 4 維度展開 + 5 self-check + Stage α 4 Phase byte-level evidence + F12-F16 反模式三元素見 [`references/adaptation-depth.md`](references/adaptation-depth.md)。

### Principle 4 — Incremental Evolution (增量進化)

> "小步快跑，精準打擊。" / "Small steps, fast strides, precision strikes."

**Gain threshold**: estimated gain ≥ **30%** to allow integration.

- 30% is the buffer because switching cost (learning, docs, habit change)
  consumes 15-20% of gain.
- Gain must be measured against the same baseline indicators. Switching metrics
  is forbidden.

**Safety exception** (added v1.2.0): For integrations classified as
**security / compliance / data integrity** (CVE fix, GDPR, PCI-DSS, PII handling,
SQL injection defense, auth bypass mitigation), the 30% threshold does not apply.
Decision becomes binary: **known vulnerability or compliance gap exists → MUST integrate**.

**Three-way decision** (no "decide later" allowed):

| Decision | Condition | Action |
|---|---|---|
| **GO** | Evidence solid + context fully match + estimated gain ≥ 30% | Enter pilot |
| **PILOT** | Evidence partial or context partially matches with potential | Enter pilot, **shrink scope** + kill switch armed |
| **REJECT** | Evidence weak + context mismatch, or gain < 30% (non-safety) | Write ADR with reject reason, **cooldown 15 days** before re-evaluation |

**Pilot protocol**:

- **Isolation**: must run in `git worktree`, not main branch
- **Timebox**: small / medium / large = 3 / 7 / 14 days (AI-agent variant)
- **Single variable**: one pilot at a time. Concurrent pilots make causality
  unprovable.
- **Kill switch**: explicitly define when to abort (token usage rises / serious
  bug / steep learning / maintenance overrun).

**Modular boundary**: Each integration's blast radius must be ≤ **15%** of total
system size. Above 15% means destructive rewrite, not incremental evolution. Split.

### Principle 5 — Validation by Practice (實戰證偽)

> "實戰是檢驗真理的唯一標準。" / "Practice is the sole criterion of truth."

**Falsify, do not confirm**: Per Popper, the goal of pilot is to *prove it does
not work*, not to *prove it works*. Find the weakest scenario to test, not the
strongest. Design counterexamples deliberately.

**AI-agent counterexample design** (added v1.2.0): Since a solo developer with
AI agents lacks a QA team, augment falsification by:

1. Asking Claude Code to generate 3 adversarial scenarios for the integration
   before pilot starts.
2. Running the integration against `.context-db` historical bug records (search
   for past bugs in the affected domain and replay them).
3. Forcing one "intentional break" — try to violate the integration's assumptions
   and observe whether the failure mode is graceful.

**Evidence grading**:

| Evidence type | Credibility |
|---|---|
| Third-party independent benchmark | High |
| Reproducible empirical data from them | Medium |
| Multiple-user community feedback | Medium |
| Their own marketing post / blog | Low |
| "Everyone uses it" / "KOL recommends" / "trending" | **Zero**, no evidence |

**Pilot end forces binary decision** (no "permanent pilot" state allowed):

- **Integrate**: merge to main, update SSoT (Rules / Skills / Hooks /
  RELEASE-NOTES), bump toolkit version.
- **Rollback**: delete worktree branch, but **do not delete ADR**.

**7-day post-integration observation** (AI-agent variant, was 30 days):

- Actual gain vs estimated gain? (delta > 20% → review)
- Unexpected side effects?
- Maintenance cost beyond estimate?

Any anomaly → trigger archive-and-reflect.

---

## The 5-Phase Protocol (Sword Manual)

Each phase has mandatory deliverables. Skipping a deliverable = protocol violation.

| Phase | Charter principle | Core action | Mandatory deliverable | Template |
|---|---|---|---|---|
| **0 定境 Baseline** | P1 Sovereignty | Trigger classify + Baseline | `baseline-record.md` | `assets/templates/baseline-record.md` |
| **1-2 較量 Benchmark** | P2 Differential | 4-quadrant + 8-item check | `benchmark-report.md` | `assets/templates/benchmark-report.md` |
| **3 煉化 Distill** | P3 Essence | MVE + adaptation | `distillation-record.md` | `assets/templates/distillation-record.md` |
| **4 嫁接 Graft** | P4 Increment | Worktree pilot + decision | `pilot-report.md` | `assets/templates/pilot-report.md` |
| **5 驗真 Validate** | P5 Practice | 7-day observe + archive | ADR + Memory DB rows | `assets/templates/adr-external-eval.md` |

### Phase 0 — 定境 (Baseline)

```
Trigger source → Trigger classification → Impulse cold-storage 3 days
        ↓
       Sovereignty 4 Questions (Q1-Q4)
        ↓
       Run audit-capability-reachability → Q4 verdict
        ↓
       If latent ≥ 70% AND feature_match ≥ 70 → activate existing, EXIT
        ↓
       Identify existing corresponding module → 4-quadrant prediction
        ↓
       Baseline quantification (token / time / success rate / bug rate / maint cost)
        ↓
       Write to baseline_snapshots table
        ↓
       Deliverable: baseline-record.md
```

### Phase 1-2 — 較量 (Benchmark)

```
4-quadrant position → A/B/C/D
        ↓
       [Quadrant A] Extract 1-2 detail wins from them → reverse-strengthen → END
       [Quadrant D] Record reject reason → END
       [Quadrant B/C] Enter evidence verification
        ↓
       Evidence grading → 8-item context check → SUPREME-Mandate conflict check
        ↓
       Any SUPREME conflict → REJECT
       No conflict → enter Phase 3
        ↓
       Deliverable: benchmark-report.md
```

### Phase 3 — 煉化 (Distill)

```
Three Distillation Questions (underlying logic / context / soul-vs-body)
        ↓
       Decompose into MVE
        ↓
       Context adaptation rewrite (transform "body" to your environment)
        ↓
       Output integration plan (MVE list + adaptation + estimated gain)
        ↓
       Deliverable: distillation-record.md
```

### Phase 4 — 嫁接 (Graft)

```
Estimated gain ≥ 30% OR safety/compliance → GO / PILOT
Estimated gain < 30% (non-safety) → REJECT (cooldown 15 days)
        ↓
       Create git worktree isolation
        ↓
       Set timebox + kill switch (small 3d / medium 7d / large 14d)
        ↓
       Single-variable pilot (concurrent pilots forbidden)
        ↓
       Adversarial scenario design (3 counterexamples) — AI-agent variant
        ↓
       Timebox expiry → integrate OR rollback (no permanent pilot)
        ↓
       [Integrate] Update SSoT (Rules / Skills / Hooks / RELEASE-NOTES)
       [Rollback] Delete worktree, keep ADR
        ↓
       Deliverable: pilot-report.md
```

### Phase 5 — 驗真 (Validate)

```
7-day observation period (AI-agent variant, was 30)
        ↓
       Actual gain vs estimated gain comparison
        ↓
       Side-effect detection + maintenance cost tracking
        ↓
       Write ADR to docs/technical-decisions/
        ↓
       Write external_evaluations table in .context-db
        ↓
       If anomaly → archive-and-reflect clause
        ↓
       Deliverable: ADR-EXTERNAL-NNN-* + DB rows
```

---

## Forbidden Patterns (The 11 禁忌)

Violating any single one means the protocol has failed. Hooks F2/F3/F5/F6/F7/F8/F11
plus the impulse-cooldown gate are mechanized in `assets/hooks/` (see
Installation section below).

| # | Forbidden | Hook? | Detection |
|---|---|---|---|
| F1 | Wholesale copy of external resource regardless of authority | No | Manual review |
| F2 | Skip Phase 0 baseline | ✅ `baseline-snapshot-gate.js` | PreToolUse on `git worktree add` checks DB row |
| F3 | Concurrent pilots in same period | ✅ `concurrent-pilot-guard.js` | PreToolUse on `git worktree add` counts active pilots |
| F4 | Lower verification because "big name / official / KOL" | No | Manual review |
| F5 | Permanent pilot state (timebox expired without close) | ✅ `pilot-timebox-monitor.js` | SessionStart scans worktree mtime |
| F6 | Re-evaluating REJECTed item within 15 days without new evidence | ✅ `reject-cooldown-check.js` | UserPromptSubmit detects mention of REJECTed names |
| F7 | Post-integration skip SSoT update | ✅ `ssot-sync-checker.js` | PostToolUse on `.claude/**` checks RELEASE-NOTES diff |
| F8 | Pilot scope creep beyond original plan | ✅ `scope-creep-detector.js` | PostToolUse on Edit/Write counts touched dirs |
| F9 | Using their marketing post as evidence | No | Manual review |
| F10 | Skip ADR / Memory DB write | No (handled by Phase 5 checklist) | Manual review |
| F11 | Skip Q4 latent-capability audit | ✅ `q4-audit-gate.js` | PreToolUse on `git worktree add` checks audit recency |
| F12 | Wholesale copy with surface metadata only (body 100% 照搬 + 只補 frontmatter) | No | Manual review (對齊 `adaptation-depth.md` §5) |
| F13 | Generic patterns only, missing PhyCool business-specific (ECPay/SendGrid/Azure/Anthropic) | No | Manual review |
| F14 | Missing PhyCool workflow trigger integration (Real Examples 0 dev-story / sprint-status / IDD framework / tasks-backfill-verify) | No | Manual review |
| F15 | Pure syntax transform without optimization (0 regex/fail-open/BOM strip/timeout 補強) | No | Manual review |
| F16 | Inflated adaptation claims (聲稱「優化適配」實際 < L3 60%) | No | Manual review |
| F17 | Skip `Skill(saas-to-skill/skill-builder)` literal invocation when editing SKILL.md (v1.4.0) | ⚠ planned | 對齊 `skill-tool-invocation-mandatory.md` SUPREME |
| F18 | Skip `Skill(hooks-mechanization)` literal invocation when editing `.claude/hooks/*.js` (v1.4.0) | ⚠ planned (`hooks-skill-invocation-guard.js` 已部署) | 對齊 `hooks-creation-discipline.md` SUPREME |
| F19 | Skip `Skill(cc-config-author)` evaluation when editing `.claude/{rules,commands,agents,settings.json}` / `.mcp.json` / `CLAUDE.md` (v1.4.0) | No | Manual review per `cross-ref-discipline.md` SUPREME |

> **F12-F16 三元素強制**(對齊 saas-to-skill v3.3.0 §5.4 面向 8 FORBIDDEN Loophole Closure):每條含 Forbidden / Common Rationalization / Red Flag,完整見 [`references/adaptation-depth.md`](references/adaptation-depth.md) §5。
>
> **F17-F19**(v1.4.0 新增): Phase 3 動作觸及檔案類別 → Skill tool 字面調用閘門,完整矩陣見 [`references/skill-tool-invocation-matrix.md`](references/skill-tool-invocation-matrix.md) §1。

---

## Integration Points (with PhyCool toolkit)

| Phase | Integrates with | How |
|---|---|---|
| Phase 0 Baseline | `.context-db` | Write to `baseline_snapshots` table |
| Phase 0 Q4 audit | `audit-capability-reachability.cjs` + `capability-integration-mandate.md` | Run script, parse JSON, gate decision |
| **Phase 0 Q4 audit (v1.3.0)** | **GitNexus `mcp__gitnexus__query`** | **Codebase 端 capability 偵測 — `.context-db` MCP/Hooks Layers 之外補強 67944 symbols / 126289 relations / 300 execution flows 覆蓋** |
| **Phase 1-2 Benchmark (v1.3.0)** | **GitNexus `mcp__gitnexus__context`** | **取 PhyCool 對應 module 360° 視圖(callers / callees / processes)作 quadrant 對比依據,避免 grep-only surface comparison** |
| Phase 1-2 SUPREME conflict | `.claude/rules/` SUPREME mandates | Conflict → auto-REJECT |
| Phase 3 distillation | `cc-config-author` skill | If integration touches `.claude/`, verify spec compliance |
| Phase 3 distillation | `hooks-mechanization` skill | If integration contains rules, evaluate hook-ability |
| Phase 4 pilot isolation | `git worktree` | Mandatory isolation |
| **Phase 4 blast radius (v1.3.0)** | **GitNexus `mcp__gitnexus__impact`** | **`git worktree add` 前對 pilot 觸及 symbols 跑 upstream impact 分析,15% 修改半徑門檻自動 enforce,結果寫 `external_evaluations.estimated_blast_radius`** |
| **Phase 5 actual change (v1.3.0)** | **GitNexus `mcp__gitnexus__detect_changes`** | **7-day observation 期間 / pilot end 時對比 baseline snapshot,自動產出實際 affected symbols + execution flows,寫 `external_evaluations.actual_blast_radius` + 對比 estimated 觸發 anomaly archive-and-reflect** |
| Phase 4 SDD-lite | New `spec-lite-template.md` | Pilot still goes through SDD, but uses spec-lite (50-100 lines) |
| Phase 5 ADR | `docs/technical-decisions/` (existing 36 ADRs) | Append with continued numbering |
| Phase 5 Memory DB | `external_evaluations` table | All outcomes (GO / PILOT / REJECT) archived |
| **Phase 3 distill — SKILL.md edit (v1.4.0)** | **`Skill(skill="saas-to-skill")` Mode A/B/C** | **Edit/Write `.claude/skills/**/SKILL.md` (含 phycool-* 與既有 workflow/utility) MUST 字面調用,對齊 `skill-tool-invocation-mandatory.md` SUPREME** |
| **Phase 3 distill — new utility skill (v1.4.0)** | **`Skill(skill="skill-builder")`** | **新建 workflow/utility/tool skill 字面調用** |
| **Phase 3 distill — hooks edit (v1.4.0)** | **`Skill(skill="hooks-mechanization")` 7-step playbook** | **新建 / 修改 `.claude/hooks/*.js` (非 `_test.js`) MUST 字面調用,對齊 `hooks-creation-discipline.md` SUPREME (hooks-skill-invocation-guard.js hard-block 已部署)** |
| **Phase 3 distill — .claude/ config edit (v1.4.0)** | **`Skill(skill="cc-config-author")` 7-step audit** | **Edit `.claude/{rules,commands,agents,settings.json}` / `.mcp.json` / `CLAUDE.md` MUST 字面調用評估,對齊 `cross-ref-discipline.md` SUPREME** |
| All phases | `.claude/hooks/detect-rule-violation-hint.js` | Extend keyword patterns for protocol violation hints |

> **Phase 3 Skill Tool Invocation Matrix**(v1.4.0 新增):12 動作類別 → 4 個 Skill tool 對應,跳過違規補登流程,完整 spec 見 [`references/skill-tool-invocation-matrix.md`](references/skill-tool-invocation-matrix.md)。Memory id=4287 已記 Phase 2C 第 4 次重複犯錯(精神對齊 ≠ 字面調用),Phase 2A/2B/3 同質 under-reporting 需補 3 條 rule_violation。

---

## GitNexus integration (v1.3.0+) — Agent-Discipline Layer (NOT Hook-Mechanical)

**Important scope clarification (v1.3.1, 2026-05-18)**: GitNexus augmentation
operates at the **Agent-discipline layer**, not the Hook-mechanical layer.
The 8 mechanized hooks (`tianji-*.js`) **do not** call `mcp__gitnexus__*`
internally — Agent must load GitNexus tools via ToolSearch and invoke them
during the 5-phase Protocol. Hook-level GitNexus enforcement is a future
candidate (see references/gitnexus-integration.md §Future Hook Candidates).

PhyCool GitNexus index (67944 symbols / 126289 relations / 300 execution
flows) augments 4 phases — advisory, not blocking. Phase 0 Q4 +
`gitnexus_query`, Phase 1-2 + `gitnexus_context`, Phase 4 pre-pilot +
`gitnexus_impact` (Agent writes `estimated_blast_radius`), Phase 5 +
`gitnexus_detect_changes` (Agent writes `actual_blast_radius`, delta > 20%
triggers archive-and-reflect).

Full integration spec + stale-index discipline + future hook-level
enforcement candidates: [references/gitnexus-integration.md](references/gitnexus-integration.md).

---

## How to invoke this skill

When the trigger conditions match, this skill:

1. Loads the current phase template from `assets/templates/`
2. Runs `scripts/q4-audit.sh` to invoke `audit-capability-reachability.cjs`
3. Returns a phase-specific action plan, including:
   - Which mandatory deliverable to produce next
   - Which hooks should already be armed (and which need install)
   - Which DB rows to write
4. If Q4 verdict is "activate existing" → produces an "existing capability
   activation plan" instead, citing which MCP tools / tables / Layers cover
   the pain.
5. **(v1.4.0)** During Phase 3 Distillation / Phase 4 Graft / Phase 5 Validate,
   **主動偵測**整合動作預計觸及的檔案類別,對照
   [`references/skill-tool-invocation-matrix.md`](references/skill-tool-invocation-matrix.md) §1 矩陣強制
   字面調用對應 Skill tool 之後才執行 Edit/Write:
   - `.claude/skills/**/SKILL.md` 動作 → `Skill(skill="saas-to-skill")` Mode B(對齊 SUPREME)
   - `.claude/hooks/*.js` 動作 → `Skill(skill="hooks-mechanization")` 7-step(hard-block hook 已部署)
   - `.claude/{rules,commands,agents,settings.json}` / `.mcp.json` / `CLAUDE.md` 動作 → `Skill(skill="cc-config-author")` 評估
   - 新建 utility/tool skill → `Skill(skill="skill-builder")`
   - 若任何理由跳過 → 立即補登 `rule_violation`(對齊 Memory id=4287 範式 + matrix §4 流程)
6. **(v1.4.0)** Phase 3 蒸餾完成 + 寫 `distillation-record.md` 前,
   走 [`references/adaptation-depth.md`](references/adaptation-depth.md) §3 Self-Check 5 題,
   量化評分至 5 級 Tiers(L0 照搬 → L4 深度適配),裁決基線 ≥ L3(60%+)。
   評分 < L3 且 4 維度 ≤ 2 ✅ → 加深適配或撤回整合決策。

---

## Quick reference: AI-Agent timing parameters

| Original (human-pace) | AI-Agent variant (this file) | Reason |
|---|---|---|
| Impulse cold-storage 7 days | **3 days** | Iteration loop is ~10× faster |
| Pilot small/medium/large 2/4/6 weeks | **3 / 7 / 14 days** | Same reason |
| Post-integration observation 30 days | **7 days** | Bug surfacing accelerates with agent-density |
| REJECT cooldown 90 days | **15 days** | External ecosystem evolves fast |
| Self-iteration review trigger | **N=5 cases OR any single incident** (unchanged) | Count-based, not time-based |

---

## Anti-pattern signals (load `references/anti-patterns.md` for full list)

If you observe these phrases in the conversation, prompt the user with a
sovereignty challenge before proceeding:

- "Anthropic / official / Karpathy / [big name] recommended" → invoke F4 guard
- "Everyone uses it" / "trending on GitHub" → invoke F9 guard
- "Let's just try it real quick" / "我們直接試試看" → invoke F2 guard
- "We can run two pilots in parallel" → invoke F3 guard
- "Let's keep this in pilot for now" (more than timebox) → invoke F5 guard
- "We rejected this last week but I think it's worth another look" → invoke F6 cooldown check

---

## References (progressive disclosure)

Detailed specs and decision tables are split into `references/`:

- `references/installation.md` — full 5-step install guide + uninstall + pitfalls
- `references/principle-deep-dives.md` — extended commentary on the 5 principles
- `references/quadrant-decision-tree.md` — full A/B/C/D classification logic
- `references/anti-patterns.md` — 30+ anti-pattern phrases with rebuttal templates
- `references/db-schema-spec.md` — `baseline_snapshots` + `external_evaluations` schema
- `references/hook-registry.md` — 8 mechanized hooks, F# mapping table
- `references/hook-output-contracts.md` — what each hook emits, expected Claude reactions
- `references/hooks-troubleshooting.md` — diagnostic flow for blocked operations
- `references/incident-archive.md` — record of self-iteration triggers
- `references/version-history.md` — semver changelog

---

## Templates (`assets/templates/`)

- `baseline-record.md` — Phase 0 deliverable
- `benchmark-report.md` — Phase 1-2 deliverable
- `distillation-record.md` — Phase 3 deliverable
- `pilot-report.md` — Phase 4 deliverable
- `adr-external-eval.md` — Phase 5 ADR
- `spec-lite-template.md` — for SDD+TDD compatibility during pilot
- `existing-capability-activation-plan.md` — for Q4 ≥70% "activate existing" path

---

## Installation

This skill ships **8 deterministic hooks** in `assets/hooks/` plus a DB
schema patch in `scripts/db-patch-init-db.js`.

Quick start (5 steps):

1. **DB schema patch**: `node scripts/db-patch-init-db.js apply` against
   your project's main `.context-db/*.db` (PhyCool: `phycool.db`, per
   v1.3.1 patch). Patch is also auto-applied by `.context-db/scripts/init-db.js`
   on PhyCool when the Skill is installed.
2. **Copy 8 hooks** from `assets/hooks/` to `.claude/hooks/` with
   `tianji-` filename prefix. `_lib.js` is shared and must sit in the
   same directory.
3. **Merge** `assets/settings-snippet.json` into `.claude/settings.json`.
4. **Reload** Claude Code (`/clear` or restart).
5. **Verify** with `/hooks` — expect 8 `tianji-*` commands across 4 events.

> **PhyCool-specific (v1.3.1)**: hook DB path constant `CONTEXT_DB_RELATIVE` in
> `_lib.js` and the equivalent DB-path resolution inside `scope-creep-detector.js`'s
> `openWritableDb` function are aligned to `.context-db/phycool.db`
> (project SSoT per `init-db.js` `DB_PATH` + `server.js`'s MCP DB binding). Records are visible
> to `mcp__phycool-context__search_*` tools. Original Tianji default
> `context.db` would write to an orphan DB invisible to MCP.

Full installation guide with PowerShell commands, verification scripts,
and pitfall remediation: `references/installation.md`.

For hook-specific behaviour (what each emits, when it fires, what Claude
should do with the output): `references/hook-output-contracts.md`.

## Related skills

- `cc-config-author` — invoked from Phase 3 when integration touches `.claude/`.
- `hooks-mechanization` — invoked from Phase 3 when integration contains rules.

---

## Do NOT

1. Do NOT enter the 5-phase protocol for pure version bumps or CVE patches.
2. Do NOT treat "Anthropic recommends" or "Karpathy posts about it" as evidence.
3. Do NOT skip baseline; without baseline, all comparison is feeling.
4. Do NOT run two pilots in parallel (causality becomes unprovable).
5. Do NOT leave a pilot open past its timebox.
6. Do NOT re-evaluate a REJECTed item within 15 days without new evidence.
7. Do NOT skip the ADR + DB row even for REJECT decisions — REJECTs are learning capital.
8. Do NOT redesign the principles to fit a specific case. The principles
   are the constants; cases are the variables.
9. **(v1.4.0)** Do NOT 跳過 SKILL.md 編輯時的 `Skill(skill="saas-to-skill")` /
   `Skill(skill="skill-builder")` 字面調用(對齊 `.claude/rules/skill-tool-invocation-mandatory.md` SUPREME +
   Memory id=4287 第 4 次重複犯錯紀錄)。
10. **(v1.4.0)** Do NOT 跳過 `.claude/hooks/*.js` 編輯時的 `Skill(skill="hooks-mechanization")`
    7-step playbook 字面調用(對齊 `.claude/rules/hooks-creation-discipline.md` SUPREME · 配套
    `hooks-skill-invocation-guard.js` hard-block 已部署)。
11. **(v1.4.0)** Do NOT 編輯 `.claude/{rules,commands,agents,settings.json}` /
    `.mcp.json` / `CLAUDE.md` 時跳過 `Skill(skill="cc-config-author")` 評估
    (對齊 `.claude/rules/cross-ref-discipline.md` SUPREME)。
12. **(v1.4.0)** Do NOT 在 `distillation-record.md` 聲稱「優化適配」但實際適配深度 < L3(60%)
    (對齊 `references/adaptation-depth.md` §5 F12-F16 三元素強制)。

---

## Version

**Tianji-Pavilion v1.5.1 (AI-Agent Variant + GitNexus Integration + Adaptation Depth + Skill Tool Invocation Matrix + emitAdditionalContext eventName Sync + Live-Mirror cwd-fallback Convergence)** — see
`references/version-history.md` for full changelog.

| 版本 | 日期 | 變更 |
|:---:|:---:|------|
| **1.5.1** | **2026-08-02** | **`bwu-10` code-review 修復 —— `resolveDbPath()` 的 JSDoc 未隨 v1.5.0 的行為變更同步**。v1.5.0 為 assets/dist 兩份鏡像補上 `CLAUDE_PROJECT_DIR \|\| process.cwd()` fallback,但其正上方兩行的 JSDoc 仍寫 `Returns null if env var unset or DB file missing` —— 加了 fallback 之後「env var unset」已不再 return null(改用 cwd),該句對讀者與未來 adopter 皆為錯誤陳述,且緊鄰新增的 fallback 註解形成自相矛盾的一段。此為本卡主題(「一份文檔宣稱 X,實作是 Y,而兩者之間沒有機械檢查」)的**自我違反** —— 修 code 分歧時未回頭看緊鄰的文檔宣稱。CR 依 5-Min Rule inline 修復兩份鏡像的 JSDoc(改述為「project dir 解析自 CLAUDE_PROJECT_DIR 或 cwd;僅在解析後的 DB 檔不存在時回 null」),dist 副本維持脫敏措辭不引入專案字面。live 端 `.claude/hooks/_lib.js` 同型過時(其 fallback 早於 2026-05-18 即存在),但 AC1 明訂 live 為唯讀對照且 `BR001_LiveLibCopy_ByteUnchangedVsBaseline` 斷言其 byte-unchanged,故不於本卡修改,另立 debt `TD-TIANJI-LIVE-LIB-RESOLVEDBPATH-JSDOC-STALE`。走 `Skill(skill="skill-builder")` Mode B 字面調用。 |
| **1.5.0** | **2026-08-02** | **live ↔ assets ↔ dist 鏡像收斂 + 分歧台帳 + 行號斷言解除(bwu-10-doc-mirror-and-workflow-drift)**。三份 `_lib.js`(live / assets / dist)`resolveDbPath()` 的 `CLAUDE_PROJECT_DIR \|\| process.cwd()` fallback 表達式收斂一致(assets/dist 原缺席,為行為變更非衛生同步);兩份鏡像的 `emitAdditionalContext` 上方單行壓縮註解展開為與 live 同義的 root-cause 說明(dist 副本維持 `ADAPTATION POINT` 脫敏措辭,不引入 `PhyCool` 字面)。`references/installation.md`(僅 live)新增「live ↔ assets ↔ dist 刻意分歧台帳」章節,列舉四項刻意分歧(hook 檔名 prefix / dist 脫敏佔位符 / 程式碼結構檢索文檔改名 / dist 端不同步本台帳)並記錄本次 cwd 消除的行為變更性質與 dist 生效條件。PhyCool-specific 安裝註記的兩處已 stale 行號斷言(`_lib.js` 常數位置 / `scope-creep-detector.js` 函式位置)改為符號名定位(`CONTEXT_DB_RELATIVE` / `openWritableDb`),Version History 表格內既有歷史條目不回改。走 `Skill(skill="skill-builder")` Mode B 字面調用。 |
| **1.4.1** | **2026-07-29** | **assets/hooks 鏡像追上 live 端 C2 修法(bwu-6 承接 bwu-5 CR §7 debt `TD-TIANJI-ASSETS-EMITCONTEXT-EVENTNAME-DRIFT`)**。live 端 `.claude/hooks/_lib.js`(bwu-5 CR)已將 `emitAdditionalContext(text)` 改為 `emitAdditionalContext(text, eventName)`,但可攜出 assets 鏡像副本與 `dist/portable-skills/` 對應副本未同步,`hookEventName` 恆走 `process.env.CLAUDE_HOOK_EVENT_NAME`(官方 hook 環境無此變數,恆為 `unknown`)。本次平移同一修法至 `assets/hooks/_lib.js:111` + `dist/portable-skills/skills/tianji-pavilion/assets/hooks/_lib.js:111`(env fallback 保留,向後相容未遷移呼叫端),並讓 4 支 assets hook 共 5 個呼叫點(`ssot-sync-checker.js` ×2 / `scope-creep-detector.js` / `reject-cooldown-check.js` / `pilot-timebox-monitor.js`)顯式傳入各自註冊事件名(`PostToolUse` / `UserPromptSubmit` / `SessionStart`,對齊 `references/hook-output-contracts.md` L23/L52/L82/L92/L120 既有契約)。零功能回歸,零行為變更(僅修正診斷用 `hookEventName` 欄位準確度)。dist 副本走 surgical Edit(非整檔複製)以保留既有脫敏差異(`.context-db/phycool.db` → `{{CONTEXT_DB}}/memory.db` 等)。走 `Skill(skill="skill-builder")` Mode B 字面調用。**+CR F2**:本檔 H1 標題自 v1.3.0 起即停留在 `v1.2.0`(與 frontmatter `version` 兩個 minor 版落差),bwu-6 code-review 依 5-Min Rule 就地校正為 `v1.4.1`,使 H1 / frontmatter / 本沿革表三處一致。 |
| **1.4.0** | **2026-05-23** | **Adaptation Depth Quantification + Skill Tool Invocation Matrix**。觸發:Stage α 4 Phase 蒸餾深度 ultrathink 評估均值 ~56%(中等偏低)+ Memory id=4287 揭露 Phase 2C 第 4 次跳過 Skill 字面調用(精神對齊 ≠ 字面 invoke)。新增:(1) §Principle 3.5 Adaptation Depth Quantification 摘要(5 級 Tiers L0-L4 + 4 維度 D1-D4 含 zh-TW/UTC+8/UTF-8/PowerShell 7.6.1 7 必補項)指向 `references/adaptation-depth.md`;(2) §Forbidden Patterns F12-F16(三元素強制)+ F17-F19(Skill 字面調用閘門);(3) §Integration Points 4 rows Phase 3 Skill Tool Invocation Matrix 指向 `references/skill-tool-invocation-matrix.md`;(4) §How to invoke Step 5+6 主動偵測檔案類別 → Skill tool 字面調用 + 蒸餾深度 self-check;(5) §Do NOT 9-12 條(SKILL.md / hooks / .claude config / adaptation claims);(6) 2 個新 references 子檔 `adaptation-depth.md`(5 級 + 4 維度 + 5 self-check + Stage α 4 Phase 案例 + F12-F16) + `skill-tool-invocation-matrix.md`(12 動作 → 4 Skill tool 矩陣 + 補登流程 + Bootstrap exemption)。對齊 3 SUPREME mandate(`skill-tool-invocation-mandatory.md` v1.2.0 + `hooks-creation-discipline.md` v1.0.0 + `cross-ref-discipline.md` v1.0.0)+ saas-to-skill v3.3.0 §5.4 八面向驗證。本次走 `Skill(skill="saas-to-skill")` Mode B 字面調用(對齊自身規範,避 Memory id=4287 第 5 次)。 |
| **1.3.1** | **2026-05-18** | PhyCool deployment hotfix (post-install audit findings). **Path alignment**: `_lib.js:22` + `scope-creep-detector.js:50` + `db-patch-init-db.js:36` DB constant changed from `.context-db/context.db` → `.context-db/phycool.db` to align with PhyCool SSoT (`init-db.js:21` + `server.js:33` + MCP `phycool-context`). **Schema integration**: `.context-db/scripts/init-db.js` now auto-invokes `applyTianjiSchema(db)` via try/require (idempotent, safe-skip if Skill not present). **GitNexus scope clarification**: §GitNexus integration explicitly labels itself Agent-discipline layer (NOT Hook-mechanical) — 8 hooks contain 0 `mcp__gitnexus__*` calls; Agent must load tools via ToolSearch and invoke during 5-phase Protocol. No SOP / Charter / 5-phase / hook contract changes. Records previously written to `context.db` (49KB orphan) should be migrated or considered deprecated. |
| **1.3.0** | **2026-05-18** | GitNexus integration — Phase 0 Q4 audit + `mcp__gitnexus__query` 補強既有 execution flow 偵測;Phase 1-2 Benchmark + `mcp__gitnexus__context` 取 360° module 視圖作 quadrant 對標證據;Phase 4 pre-pilot + `mcp__gitnexus__impact` 自動 blast radius 估算寫 `external_evaluations.estimated_blast_radius`(operationalise 15% modular boundary rule);Phase 5 Validate + `mcp__gitnexus__detect_changes` actual vs estimated 對比觸發 archive-and-reflect;新增 §GitNexus Integration 章節 + 4 Integration Points table rows + stale index discipline 對齊 `.claude/rules/gitnexus-discipline.md`。對齊 PhyCool 既有 GitNexus 配置(67944 symbols / 126289 relations / 300 execution flows)。 |
| 1.2.0 | (prev) | AI-Agent variant + Q4 latent-capability audit + impulse cold-storage 3 days + 8 mechanized hooks。 |
