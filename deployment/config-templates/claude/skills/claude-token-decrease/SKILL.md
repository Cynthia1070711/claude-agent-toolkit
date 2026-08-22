---
name: claude-token-decrease
description: "Claude Code Token reduction normative framework (formerly ultrathink). Synthesizes 38+ research reports into enforceable A~K eleven-category reduction standards and regression monitoring rules. Establishes budget ceilings, anti-patterns, workflow gates, DMI policies, and prompt caching economics as binding specifications. Use when auditing token budgets, enforcing reduction standards, reviewing skill/rule proliferation, planning multi-agent cost strategy, or invoking ultrathink."
version: 3.2.1
updated: 2026-05-30
last_synced_epic: epic-td-paths-rollout
argument-hint: "[audit|decision-tree|baseline|roi|checklist|regression]"
effort: max
triggers:
  - token optimization
  - budget
  - reduction
  - context efficiency
author: CC-OPUS
created: 2026-03-28
---

# Claude Token Decrease — Token Reduction Normative Framework v3.0

> Formerly "ultrathink". This document IS the normative source of truth — all reduction standards, budget ceilings, and enforcement rules are self-contained here, distilled from 38+ research reports into binding specifications.
> Research basis: 2026-02-22 ~ 2026-03-28 | 4 engines | 25+ executed Stories | Provenance: [research-index.md](references/research-index.md)
> Note: "ultrathink" keyword in content triggers Claude's high-effort Extended Thinking mode.

---

## 1. Four-Layer Loading Architecture

Claude Code consumes tokens across five Always-On layers every new conversation:

> **Baseline recalibrated 2026-03-29** (ctx-2381 cross-verification audit)

| Layer | Content | Load Mode | Pre-Opt | v2.0 | v3.0 Actual (2026-03-29) |
|:-----:|---------|-----------|:-------:|:----:|:------------------------:|
| 1 | Global `~/.claude/CLAUDE.md` | Always-On 100% | ~3,640 | ~270 | ~270 (27L) |
| 2 | Project `CLAUDE.md` + `.claude/rules/*` | Always-On 100% | ~11,000 | ~3,500 | **~6,540** (157L + 497L) |
| 3 | Skills descriptions + MCP tool summaries | Always-On (summary) | ~800 | ~760 | **~10,600** (63 Skills × ~84 tok + MCP) |
| 4 | `CLAUDE.local.md` (Agent delegation matrix) | Always-On 100% | N/A | ~380 | ~380 (38L) |
| 5 | `MEMORY.md` (persistent cross-session memory) | Always-On 100% | N/A | N/A | **~1,300** |
| **Total** | | | **~15,440** | **~4,910** | **~19,090** |

**v3.0 Regression Alert**: Session cost rose ~289% from v2.0 (4,910→19,090). Root causes:
- Rules: 6 files/209L → **15 files/497L** (+138%). New: auto-skill-detection [retired 2026-05-05 → logic in skill-creation-discipline §8], compaction-recovery, context-memory-db, skill-sync-gate, tasks-backfill, spec-timeliness, verification-protocol
- Skills: 38 → **63** (+66%). Description tok was 8.4x underestimated (~1,260 claimed → ~10,600 measured; 68 BMAD items × 84 tok each, not 20)
- MEMORY.md: ~1,300 tok not previously accounted for
- Budget ceiling: **6,000 tok** (exceeded by ~13,090 tok)

**Key insight**: Skills full content is On-Demand (50-80% probabilistic), but description summaries are Always-On (~84 tok each, previously underestimated at ~20 tok).

## 2. Eleven-Category Optimization Framework (A~K)

### A: Session Static Tax — DONE (REGRESSION WARNING)

Achieved **-68%** in v2.0, regressed to **~+24%** (15,440→19,090) by v3.0. Cause: necessary rule/skill additions + previously unaccounted layers.

**Remediation**: Merge overlapping rules (context-memory.md + context-memory-db.md ~40% overlap), consolidate coding-style.md into code-quality.md.

### B: Workflow Execution Overhead — DONE (TRS-6~10)

~14,200 tok/Sprint cycle saved. TRS-6(checklist -1,200) + TRS-7(XML dedup -1,500) + TRS-8(CR XML -4,000+) + TRS-9(YAML multi-load -6,000) + TRS-10(dev-story -800).

### C: Defensive Protection — MOSTLY DONE

.claudeignore ✅ | Dynamic state decoupled ✅ | Timestamp removed ✅ | Session discipline ✅ | settings.json deny (TRS-18) ⏳ backlog

### D: Operational Flow Optimization — PARTIAL

TRS-11 (.debt.md) DEPRECATED → DB-first | TRS-12 (Story section tagging) ✅ -7,500/skeleton | TRS-17 (Epic README sync) ✅ -4,300~6,300/lifecycle

### E: Multi-Agent Parallel Strategy — FOUNDATION READY

Worktree + File Lock + Total Commit three-tier architecture. Four-engine delegation matrix.

**v3.0 — Auto-Pilot Command Center Pattern**: Antigravity as orchestrator (sense→decide→delegate), NOT executor. Claude Code (Opus) for create-story/code-review, Gemini CLI (Pro) for dev-story/tracking.

Pending: TRS-13(dual-engine SOP) ⏳ | TRS-14(unified constitution) ⏳ | TRS-32(File Lock) ⏳ | TRS-33(Worktree SOP) ⏳

### F: MCP Tool Search — MONITORING (Promoted from reference)

`ENABLE_TOOL_SEARCH=auto:10` can cut MCP tool descriptions -89% (77K→8.7K tok). With 63 Skills ~10,600 tok Always-On, this is NOW critical (not just at 80+ Skills).

### G: Development Methodology (SDD+ATDD+TDD) — DONE

`Spec → Test → Code` optimal loop. BDD downgrade -15~25% drift | ATDD format eliminates AC misread | SDD Spec Generator -10~15% sharding | TDD 3-Round Limit | VSDD code-review. **Compound: -20~35%**.

### H: Memory DB Strategy (Epic CMI) — DONE

SQLite + FTS5 + ONNX (all-MiniLM-L6-v2, 384D, $0.00). Session auto-record -90% query | Document ETL -90~95% blind scan | Hybrid Fusion (α=0.7 vector + β=0.3 FTS5) -80~95% doc search | Tech debt DB-first (tech_debt_items table).

**Accuracy**: EN 100% / ZH 80% / Mixed 100% / Doc Search 90% / Total Recall 93%

### I: Pipeline Orchestration — DONE (EVOLVED)

story-pipeline.ps1 + batch-runner.ps1 (5 parallel) + batch-audit.ps1 (7 checks, <1% failure) + 90% token safety valve.

**v3.0 Critical**: `-p` pipe mode DEPRECATED (no MCP/Hooks/Skills). All pipelines use **interactive launcher**. Batch ≥2: each `run_in_background`, staggered `Start-Sleep N*10`. Results from YAML, not exit codes.

### J: RAG Pre-Injection — DONE

`pre-prompt-rag.js` (UserPromptSubmit Hook): Session 2K + Task-aware + IDD 1.5K + Pipeline + Skill + LSP 1.5K + Violation 0.4K + Code RAG 3.5K + Doc RAG 3K = **~10K tok/prompt hard cap** (11-layer; DLA-07 added Layer 10 IDD, td-rule-violation-rag-inject added Layer 11 Violations). Local ONNX, readonly DB, silent failure, env var kill switches: `PHYCOOL_LSP_DIAG=false` / `PHYCOOL_IDD_INJECT=false` / `PHYCOOL_VIOLATION_INJECT_ENABLED=false`. intent=discussion skips Code RAG/LSP/IDD/Violation (≈6K token savings per discussion prompt).

### K: Skill DMI & Frontmatter Optimization — DONE (v3.0 NEW)

DMI (Disable Model Invocation) reduces Always-On description to zero for user-invoked-only Skills. Mandatory `version` + `updated` frontmatter for lifecycle tracking.

**DMI Rule**: Skill that should auto-load via Claude's progressive disclosure (description-based matching) → do NOT set DMI. Only for explicit user-invoked Skills (`/start-servers`, `/save-to-memory`). [Note: original `auto-skill-detection` rule retired 2026-05-05 — Claude now natively triggers via SKILL.md description per official progressive disclosure spec; Domain Profile logic preserved in `skill-creation-discipline.md` §8.]

---

## 3. Five Absolute Defense Lines

1. **`constitutional-standard.md`** — zh-TW output + ultrathink schedule, Always-On
2. **Global CLAUDE.md timestamp rule** — Force `Get-Date`, no guessing
3. **Global CLAUDE.md no-time-estimate rule** — Use S/M/L/XL complexity
4. **Skill 50-80% load rate limit** — Must-execute rules stay in rules/
5. **context-memory.md** — Memory DB discipline, CANNOT slim

---

## 4. Prompt Caching Economics

- **Cache Write**: 1.25x (25% premium) | **Cache Read**: 0.10x (90% savings)
- **Multiplier**: Same session multi-call → higher hit rate → greater savings
- **Destruction**: Any cached prefix modification invalidates entire segment

All known cache killers resolved: Dynamic Sprint status ✅ | Last Updated ✅ | YAML multi-load ✅ | project-context.md → RAG ✅

---

## 5. Decision Tree

```
Always-On > 6,000 tok? (currently ~19,090) → Audit rules/ overlap + skills/ DMI (A+K+F)
BMAD workflow? → Check XML for duplicate/FULL_LOAD (B)
New rule/skill? → 100% required → rules/ | 50-80% OK → Skill | Knowledge → DB (H) | User-only → DMI (K)
Cross-session knowledge? → search_context/search_tech first (H)
Multi-agent? → Delegation matrix (E) | ≥2 Stories → interactive pipeline (I)
Skills > 60? → Evaluate ENABLE_TOOL_SEARCH (F) | Audit DMI quarterly (K)
```

---

## 6. ROI Ranking (v3.0)

| # | Category | Effect | Status |
|:-:|----------|--------|:------:|
| 1 | H: Memory DB | -90%+ query tok + $0 | DONE |
| 2 | A: Session Slimming | +24% regression (15,440→19,090), CRITICAL audit needed | NEEDS AUDIT |
| 3 | J: RAG Injection | Targeted 10K/prompt vs blind load | DONE |
| 4 | I: Pipeline | >95% failure elimination | DONE (evolved) |
| 5 | G: SDD+ATDD+TDD | -20~35% debug tok | DONE |
| 6 | K: Skill DMI | Reduce Always-On footprint | DONE (Phase 2) |
| 7 | B: Workflow Compression | ~14,200/Sprint | DONE |
| 8 | D: Operational | ~11,800/Story lifecycle | PARTIAL |
| 9 | E: Multi-Engine | ~40% Claude tok transfer | PLANNING |
| 10 | F: MCP Tool Search | -89% MCP descriptions | MONITORING |

---

## 7. Language Rule

| Type | Language | Reason |
|------|----------|--------|
| Workflow instructions (XML/YAML) | **English** | AI-consumed; EN 2-3x more efficient |
| Story, CR reports, docs | **Traditional Chinese** | Human-readable |
| Skills SKILL.md + Rules | **English** | AI-consumed, loaded every session |

---

## 8. Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Emotional filler in prompts | Zero benefit, ~1,200 tok waste | Remove |
| Duplicate logic in workflow XML | 2x tokens | Merge |
| Multiple YAML FULL_LOAD | Up to 6,000 waste | 1 read + pass |
| Dynamic state in Always-On | Destroys KV cache | Decouple |
| Irrelevant Skills | Pollutes decision tree | Delete |
| `useState` duplicating Zustand | Architecture bug | Fix now |
| Thinking Protocol in CLAUDE.md | Native Extended Thinking | Delete |
| **Rules proliferation** (v3.0) | 209→497L (+138%) silent | Monthly audit |
| **Duplicate rule files** (v3.0) | context-memory x2 ~40% overlap | Merge |
| **Skills without DMI** (v3.0) | 63 all Always-On desc | Quarterly audit |
| **`-p` pipe mode** (v3.0) | No MCP/Hooks/Skills | Interactive launcher |

---

## 9. Workflow Gates (v3.0)

| Gate | Purpose | When |
|------|---------|------|
| **Skill Sync Gate** | Skills reflect code changes | dev-story/code-review |
| **Tasks Backfill** | All tasks have file:line evidence | dev-story/code-review |

Order: dev-story → Skill Sync Gate → Tasks Backfill → Archive

---

## 10. ECC Integration Insights (v3.0)

| Concept | ECC | PhyCool Status |
|---------|-----|:-:|
| Continuous Learning v2 (instincts + confidence) | Auto-observe → Skills | NOT ADOPTED |
| AgentShield (red-blue team) | Opus-powered audit | PARTIAL (security-review) |
| Token Economics (18K→10K) | System prompt slimming | DONE (equivalent) |
| SessionStart memory load | Auto-load 7-day | DONE (pre-prompt-rag.js) |

---

## 11. Monitoring Checklist (`/claude-token-decrease audit`)

- [ ] Always-On < 6,000 tok — **baseline drift 校正 2026-05-30:真實 always-on 見 §15 Phase 3 實測(rules 36/38 已 paths-scoped + skills ~17 已設 DMI 後);原標「~19,090」係 stale 早期快照**
- [ ] Rules ≤10 files, ≤350L — **實測 38 檔,但 36 已 paths-scoped → ~2-5 真正 always-on(對齊 §3 Defense Lines 5 條);原標「15」已 stale**
- [ ] Skills ≤50, descriptions ≤1,000 tok — **實測 97 dirs · ~17 已設 `disable-model-invocation`(零 always-on · 含 start-servers/save-to-memory/claude-launcher*/autorun-e2e/branch-merge/worktree-manager 等 user-only)· 餘 ~80 desc always-on(多 phycool-* 自動載入不可設)· 原標「63 / 0 DMI」已 stale**
- [ ] No dynamic content in CLAUDE.md/rules/
- [ ] No emotional filler in workflows
- [ ] YAML reads per workflow ≤ 1
- [ ] Memory DB hooks active (Stop + SessionEnd)
- [ ] RAG Hook functioning
- [ ] Skill Sync Gate + Tasks Backfill enforced
- [ ] Pipeline using interactive launcher
- [ ] DMI set for user-invoked-only Skills

### Regression Actions

1. Merge context-memory.md + context-memory-db.md (save ~400 tok)
2. Merge coding-style.md into code-quality.md (save ~70 tok)
3. Audit 63 Skills for DMI (target: 15-20 set DMI)
4. Evaluate compaction-recovery.md merge
5. Evaluate ENABLE_TOOL_SEARCH at 70+ Skills

---

## 12. Strategy Integration Audit

| Strategy | Integration | Gap |
|----------|:-----------:|-----|
| Memory DB (self-built) | 95% | — |
| claude-mem (OSS) | 70% | Progress-disclosure search |
| context-hub (OSS) | 5% | Skills partially substitute |
| everything-claude-code (OSS) | 85% | Continuous Learning v2 |

---

## 13. Claude Code Harness Internal Constants (claw-code Reverse Engineering)

> Source: `claw-code-main` (instructkr/claw-code v0.1.0, 2026-03-31 clean-room Rust rewrite)
> Caveat: These are from reverse-engineered code, NOT official Anthropic docs. Actual Claude Code CLI may differ.
> Audit date: 2026-04-02 | Verified: 145+ source files fully read

### 13.1 System Prompt Instruction Limits (prompt.rs)

| Constant | Value | Impact |
|----------|:-----:|--------|
| `MAX_INSTRUCTION_FILE_CHARS` | **4,000** | Single CLAUDE.md/rules file truncation threshold |
| `MAX_TOTAL_INSTRUCTION_CHARS` | **12,000** | All instruction files combined truncation threshold |

**PhyCool Audit (2026-04-02):**
| File | Chars | vs 4K Limit |
|------|:-----:|:-----------:|
| CLAUDE.md (project) | 6,676 | ⛔ 167% |
| context-memory.md | 9,408 | ⛔ 235% |
| skill-sync-gate.md | 3,819 | ⚠️ 95% |
| **Total 12 files** | **33,592** | **⛔ 280% of 12K** |

**Caveat**: Current conversation system prompt shows ALL files loaded untruncated — actual Claude Code CLI limits may be higher than claw-code's constants. But 33K chars of instruction still consumes significant context window regardless.

### 13.2 Context Compaction Algorithm (compact.rs)

```
Trigger: message_count > preserve_recent AND total_tokens >= max_estimated_tokens
Token estimation: text.len() / 4 + 1  (EN accurate, ZH underestimates ~50%)

CompactionConfig defaults:
  preserve_recent_messages = 4      // Only last 4 messages kept verbatim
  max_estimated_tokens     = 10,000 // Summary token budget

Summary structure (XML-like tags):
  <summary>
    scope: message counts by role (user/assistant/tool)
    tools_used: deduplicated list
    recent_requests: last 3 user messages (160 char truncated)
    pending_work: inferred from TODO/Next/Pending keywords
    key_files: extracted file paths (max 8, extensions: rs/ts/tsx/js/json/md)
    current_work: most recent non-empty message
    key_timeline: per-message summary with role labels
  </summary>

Multi-compaction: merges "Previously compacted" + "Newly compacted" sections
Post-compaction instruction: "continue from where you left off"
```

**Actionable**: Our `PreCompact` hook + `session-recovery.js` compensates for the 4-message limit. Pipeline checkpoint is critical because compaction only keeps 4 messages + 8 file paths.

**Hermes Conceptual Transplant (epic-td, 2026-04-16)**:
- **td-37** `precompact-tool-preprune.js`: PreCompact hook 19+ tool 分支 1 行摘要,相同 5K budget 可容納 6× tool call 歷史 (CR:79, 66 tests → **91 tests** via td-hook-test-enhancement: writeToDb DI + SQLITE_BUSY retry + boundary, CR:**100**)
- **td-38** `session-recovery.js` HANDOFF_PREFIX: Compaction 後注入中英雙語「REFERENCE ONLY / Do NOT re-execute」語意強制 (396ch ≈ 99 tok),防止 Agent 重複執行已完成任務 (CR:91, 14 tests)
- **td-39** (planned) subagent-blocked-tools: MAX_DEPTH=2 + 4 blocked tools 防子代理遞迴/MEMORY 寫入

### 13.3 Output Token Limits (main.rs)

| Model | max_output_tokens |
|-------|:-----------------:|
| Opus | 32,000 |
| Sonnet / Others | 64,000 |

### 13.4 Hook Pipeline Architecture (hooks.rs)

```
Execution order: Pre-hook → Permission check → Tool exec → Post-hook

Exit code semantics:
  0 → Allow (optional stdout message appended)
  2 → Deny (blocks tool execution)
  * → Warn (log + allow)

Environment variables injected:
  HOOK_EVENT, HOOK_TOOL_NAME, HOOK_TOOL_INPUT, HOOK_TOOL_OUTPUT, HOOK_TOOL_IS_ERROR

JSON payload on stdin:
  { hook_event_name, tool_name, tool_input (parsed), tool_input_json (raw),
    tool_output, tool_result_is_error }

Cross-platform: Windows=cmd /C | Unix=sh -lc
```

### 13.5 Sub-agent Tool Permission Matrix (tools/lib.rs)

| Sub-agent Type | Available Tools |
|----------------|----------------|
| **Explore** | read_file, glob_search, grep_search, WebFetch, WebSearch |
| **Plan** | Explore + TodoWrite + SendUserMessage |
| **Verification** | Plan + bash + PowerShell |
| **general-purpose** | All tools |
| **claw-guide** | Explore + Skill + SendUserMessage |

**PhyCool gap**: Our Explore agents include Bash/Skill — broader than claw-code's definition. Evaluate if tightening improves token efficiency (fewer tool descriptions in sub-agent context).

### 13.6 Token Usage Pricing (usage.rs)

| Model | Input $/M | Output $/M |
|-------|:---------:|:----------:|
| Haiku | $1 | $5 |
| Sonnet | $15 | $75 |
| Opus | $15 | $75 |

Cache tokens tracked separately: `cache_creation_input_tokens` + `cache_read_input_tokens`

### 13.7 Config 3-Layer Merge (config.rs)

```
Priority (later overrides earlier):
  1. User:    ~/.claude/settings.json (or legacy ~/.claude.json)
  2. Project: .claude/settings.json (or .claude.json)
  3. Local:   .claude/settings.local.json

MCP servers: same-name → Local wins, scope tracked per server
Hooks: pre_tool_use/post_tool_use arrays merged across layers
```

### 13.8 Provider Abstraction (api/providers/)

Supports: Anthropic (ClawApi) | xAI/Grok (OpenAI-compat) | OpenAI (OpenAI-compat)
Retry: 2 attempts, 200ms initial backoff, 2s max, exponential
Retryable status: 408, 409, 429, 500-504
Model aliases: "opus" → claude-opus-4-6, "sonnet" → claude-sonnet-4-6, "grok" → grok-3

---

## 14. Supporting Data (internalized, not external references)

- Quantitative baseline data: [quantitative-baseline.md](references/quantitative-baseline.md)
- Hook architecture evolution: [hook-architecture.md](references/hook-architecture.md)
- Multi-engine strategy details: [multi-engine-strategy.md](references/multi-engine-strategy.md)
- Research provenance (audit trail only): [research-index.md](references/research-index.md)

---

## 15. Phase 3 Rollout — Rules paths Conditional Loading + Hook Upgrade (v3.2.0, 2026-04-25)

> **觸發**: Party Mode ultrathink R1→R4 四輪深度分析,使用者執行 A/B/C/D 四階段
> **依據**: 本文件 v3.1.4 §11 Regression Actions(規範自我列出的待辦)
> **完整紀錄**: `claude token減量策略研究分析/專案優化項目計畫.md` §15-21
> **執行原則**: 不影響專案開發流程 + 不導致降智 + 三引擎同步(僅 H4) + Edit-only(0 新檔)

### 15.1 H 系列 4 動作

| # | 項目 | 修改 | 三引擎 | 省 always-on |
|:-:|------|------|:------:|:-----------:|
| **H1** | canvas-layout-invariants.md 加 paths(9 條) | `.claude/rules/` only | ❌ | **-3.7k** |
| **H2** | cr-debt-doc-audit.md 加 paths(9 條) | `.claude/rules/` only | ❌ | **-5.7k** |
| **H3** | subagent-context-inject.js 升級為動態 readFileSync 全文注入 | `.claude/hooks/` only | ❌ | 子代理 +3K(反降智),主視窗 N/A |
| **H4** | subagent-blocked-tools.md 加 paths(4 條)+ Version v1.2.0 | `.claude/.gemini/.agent` | ✅ md5 `1b299d018e32e8d2b71117f645b3551e` | **-3.0k** |

**合計**: -12.4k always-on(72.7k → 60.3k, **-17%**)。子代理反降智 +2.9K(99 token → ~3K 完整 3-Tier 矩陣)。

### 15.2 §11 Audit 實測對照(Phase 3 前 vs 後)

| 規範項目 | ceiling | Phase 3 前 | Phase 3 後 | 改善 |
|---|:-:|:-:|:-:|:-:|
| #1 Always-On tok | 6K | ~25.3K (4.2x) | ~16.6K (2.8x) | **-34% 仍超** |
| #2 Rules ≤10 files | 10 | 17(6 always-on) | 17(**5 真正 always-on**) | -1 always-on |
| #3 Skills ≤50 | 50 | 137 | 同(待 Phase 4 DMI) | - |
| #4-#10 Workflow / Hook / Pipeline | active | PASS ✅ | PASS ✅ | 維持 |
| #11 DMI set | set | NEEDS AUDIT ⛔ | NEEDS AUDIT(候選清單已產出) | Phase 4 |

**§11 PASS 6/11 → 6/11**(項目 5/6/7/8/9/10),**OVER 4/11 → 4/11**(項目 1/2/3/11 數字改善但仍超 ceiling)。

### 15.3 Phase 4 候選(待 user 親審)

#### MEMORY.md 132 條 → 60 條(預估 -7k)
- Class A 必留 76 條(2026-04-XX CRITICAL + IDD-REG/COM + Constitutional)
- Class B 可歸檔 ~30 條(Pipeline 修復 / Epic done / Bug fix / Skill audit / Claude Max reference)
- Class C 可合併 ~26 條 → 8 條(create-story 5 / CR rules 8 / Skill 更新 5 / dev-story 4 / Pipeline 7 / SDD Spec 3)

#### 137 Skills DMI 審計(預估 -4.6k)
- Class A NOT DMI ~50 個(phycool-* domain skill 不動)
- Class B 建議 DMI ~25 個(start-servers / save-to-memory / skill-builder / 啟動電報 / init / checkpoint / 等 user-only invoked + 10 BMAD agents)
- Class C BMAD workflows DMI ~30 個(`/bmad:bmm:workflows:*` command-only)

**Phase 4 全做完總優化潛力 -23.4k(72.7k → 49.3k, **-32%**)**。

### 15.4 矛盾診斷與解決

**矛盾**: v3.1.4 §11 警告超 ceiling 3.2x,**同時** F+G 系列加 ~1700 行融入內容。

**Phase 3 解決方案**: paths/hook upgrade 是「**只改載入時機,不改規範內容**」 — 既不違反「不影響流程」也不「降智」。**真正 always-on rules 從 17 降到 5(對齊規範 §3 Defense Lines 5 條)**。

### 15.5 ROI 評估

- 內容量(SSoT)不變,降智零風險
- 主視窗 always-on -12.4k = 對應 cache write 成本 **-1.55k token**(節省 prompt cache 寫入)
- 子代理拿到完整 3-Tier(99 → ~3K) = **反降智** +2.9K
- 總體 prompt cache 友善度上升(less invalidation)

### 15.6 文檔同步清單(本 Phase 3 完成)

- [x] `.claude/rules/canvas-layout-invariants.md` 加 paths(H1)
- [x] `.claude/rules/cr-debt-doc-audit.md` 加 paths(H2)
- [x] `.claude/hooks/subagent-context-inject.js` 升級(H3)
- [x] `.claude/.gemini/.agent/rules/subagent-blocked-tools.md` 加 paths + 三引擎 md5(H4)
- [x] 本 SKILL.md v3.1.4 → **v3.2.0** + §15 Phase 3 新章
- [x] `.gemini/.agent/skills/claude-token-decrease/SKILL.md` 三引擎同步
- [x] `MEMORY.md` 加 Phase 3 entry(置頂 Class A)
- [x] `memory/reference_rules_paths_mechanism_verified.md` EXTEND Phase 2 Rollout 結果
- [x] `claude token減量策略研究分析/專案優化項目計畫.md` 加 §15-21 Phase 3
