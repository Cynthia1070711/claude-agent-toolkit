# Quantitative Baseline Data

## Session Static Cost Evolution

| Metric | Pre-Opt | v1.0 (2026-02-25) | v2.0 (2026-03-12) | v3.0 (2026-03-28) |
|--------|:-------:|:------------------:|:------------------:|:------------------:|
| Global CLAUDE.md | ~3,640 tok | ~250 tok | ~270 tok | ~270 tok |
| Project CLAUDE.md | ~8,000 tok | ~1,200 tok | ~1,410 tok | ~1,570 tok (157L) |
| .claude/rules/ | ~3,000 tok (9/397L) | ~300 tok (6/37L) | ~2,090 tok (6/209L) | **~4,970 tok (15/497L)** |
| Skills summaries | ~800 tok (42) | ~400 tok (20) | ~760 tok (38) | **~1,260 tok (63)** |
| CLAUDE.local.md | N/A | N/A | ~380 tok | ~380 tok |
| **Total** | **~15,440** | **~2,150** | **~4,910** | **~8,450** |
| **Reduction** | baseline | **-86%** | **-68%** | **-45% (REGRESSED)** |

> v3.0: Rules +138%, Skills +66%. Necessary additions but exceeds 6,000 tok budget by ~2,450.

## Daily Impact (5 new windows)

| Metric | Pre-Opt | v2.0 | v3.0 |
|--------|:-------:|:----:|:----:|
| Daily startup tax | 77,200 tok | 24,550 tok | **42,250 tok** |
| Daily savings vs Pre-Opt | — | ~52,650 tok | **~34,950 tok** |
| Weekly savings vs Pre-Opt | — | ~263,250 tok | **~174,750 tok** |

> v3.0 regression: daily savings decreased 33% from v2.0 due to rules/skills growth.

## Token Estimation Formula

**Rule of thumb**: ~10 tokens per line of Always-On content (CLAUDE.md, rules/, CLAUDE.local.md). Skills descriptions average ~20 tok each. ZH characters cost ~2.5 tok/char vs EN ~1.3 tok/word — this drives the Language Rule (§7 in SKILL.md).

## Workflow Execution Cost per Sprint Cycle

| Workflow | Files | Lines | Est. Token/exec |
|----------|-------|:-----:|:---------------:|
| code-review | instructions.xml + checklist.md | ~1,115 | ~12,000 |
| create-story | instructions.xml + checklist.md | ~1,006 | ~10,200 |
| dev-story | instructions.xml | ~624 | ~7,000 |
| **Sprint cycle total** | | | **~31,200** |

## Category B Workflow Compression Savings

| TRS Story | Compression Target | Savings per Execution |
|-----------|-------------------|:---------------------:|
| TRS-6 | checklist.md emotional filler | -1,200 tok |
| TRS-7 | instructions.xml dedup (create-story) | -1,500 tok |
| TRS-8 | code-review instructions.xml | -4,000+ tok |
| TRS-9 | sprint-status.yaml multi-FULL_LOAD | -6,000 tok |
| TRS-10 | dev-story instructions.xml | -800 tok |
| **Total per Sprint cycle** | | **~14,200 tok** |

## Category D Operational Savings

| Item | Savings |
|------|:-------:|
| Story template section tagging (TRS-12) | -7,500 tok/skeleton Story |
| Epic README auto-sync (TRS-17) | -4,300~6,300 tok/Story lifecycle |

## Category H Memory DB Query Savings

| Scenario | Before | After | Reduction |
|----------|:------:|:-----:|:---------:|
| Project status query | ~2,000 tok | ~200 tok (RAG) | **-90%** |
| Story history/decision query | ~3,000-5,000 tok | ~300 tok (DB) | **-90~95%** |
| Document semantic search | ~500-2,000 tok/file | ~200-500 tok (Hybrid) | **-80~95%** |
| Embedding API cost | $0.02/1M tokens | $0.00 (local ONNX) | **-100%** |
| Pipeline silent failure | 15-20% rate | <1% (triple guard) | **>95%** |

## Full Project Estimated Savings (for 65 Stories in Epic QGR)

| Category | Estimated Savings | Applicable Scope |
|----------|:-----------------:|-----------------|
| B: Workflow compression | ~533,000 tok | 65 Sprint cycles |
| D: Operational optimization | ~1,042,975 tok | 65 Story lifecycles |
| E: Multi-engine collaboration | ~40% Claude token transfer | Qualitative |
| G: SDD+ATDD+TDD methodology | ~500,000~900,000 tok | Debug/refactor reduction |
| **Total estimate** | **~3,067,175~3,467,175 tok** | |

## Rules Content Distribution (v3.0)

| File | Lines | Slim Action |
|------|:-----:|------------|
| context-memory.md | 86 | **MERGE** with context-memory-db.md |
| skill-sync-gate.md | 67 | Core gate, keep |
| constitutional-standard.md | 58 | NEVER TOUCH |
| context-memory-db.md | 54 | **MERGE** into context-memory.md |
| tasks-backfill.md | 47 | Core gate, keep |
| spec-timeliness.md | 32 | Consider merge |
| code-quality.md | 31 | Absorb coding-style.md |
| verification-protocol.md | 27 | Consider slimming |
| testing.md | 24 | Already slim |
| ~~auto-skill-detection.md~~ | 23 | [RETIRED 2026-05-05 → skill-creation-discipline §8] |
| compaction-recovery.md | 22 | Merge into context-memory |
| security.md | 9 | Already slim |
| coding-style.md | 7 | **MERGE** into code-quality |
| performance.md | 5 | Already slim |
| git-workflow.md | 5 | Already slim |
| **Total** | **497** | Mergeable: ~80-100 lines → target **~400L** |

## Category I/J/K Savings (v3.0 NEW)

| Category | Metric | Before | After | Reduction |
|----------|--------|:------:|:-----:|:---------:|
| I: Pipeline | Silent failure rate | 15-20% | <1% | >95% quality |
| I: Pipeline | `-p` mode context pressure | 92% at complex Story | N/A (interactive) | Eliminated |
| J: RAG | Blind Read per query | ~2,000-5,000 tok | ~200-500 tok (targeted) | -90% |
| J: RAG | Per-prompt injection budget | N/A (manual Read) | 10,000 tok (capped) | Predictable |
| K: DMI | Always-On desc per DMI Skill | ~20 tok each | 0 tok | -100% per Skill |
| K: DMI | Est. savings (15 DMI Skills) | ~300 tok | 0 tok | -300 tok total |

## Skills Audit Summary (v3.0)

| Category | Count | Examples |
|----------|:-----:|---------|
| Deleted (v1.0) | 22 | golang-*, springboot-*, java-*, jpa-*, postgres-*, webgpu-* |
| Constitutional | 1 | constitutional-standard |
| PhyCool domain | 33 | phycool-admin-*, -auth-identity, -editor-arch, -pdf-engine, etc. |
| Workflow/automation | 11 | claude-launcher(-interactive/-memory), party-to-pipeline, smart-review-fix, etc. |
| Methodology/tools | 8 | sdd-spec-generator, tdd-workflow, security-review, skill-builder, ui-ux-pro-max, etc. |
| Management | 6 | story-status-emoji, tasks-backfill-verify, epic-config-sync, etc. |
| Platform reference | 4 | claude-tools, claude-token-decrease, claude-max, save-to-memory |
| **Active total** | **63** | Up from 38 in v2.0 (+66%) |
