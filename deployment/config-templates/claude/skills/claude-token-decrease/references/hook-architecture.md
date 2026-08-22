# Hook Architecture Evolution

## v1.0 Architecture (2026-02-25)

```
PreCompact Hook  → Save session before context compaction
Stop Hook        → Save session after each response
SessionEnd Hook  → Save session on conversation end
PostToolUse Hook → Epic README auto-sync (sync-epic-readme.ps1)
```

**Characteristics**: Multiple independent hooks, each saving session state separately. Risk of duplicate writes and timing conflicts.

## v2.0 Architecture (2026-03-12, extended 2026-04 with DLA-07 IDD + td-rule-violation-rag-inject)

```
UserPromptSubmit → pre-prompt-rag.js — 11-layer injection
                   ├─ Session memory injection (2,000 tok budget)
                   ├─ Rule Violation Hot Zones (400 tok cap) [td-rule-violation-rag-inject]
                   ├─ Task-Aware Context (debt + decisions + stories)
                   ├─ IDD Injection (1,500 tok budget, intent=code only) [DLA-07]
                   ├─ Pipeline State (stale pipeline warning)
                   ├─ Skill Recommendation (keyword match)
                   ├─ LSP Diagnostics (1,500 tok budget, intent=code only) [ecc-06]
                   ├─ Code RAG - Symbol embedding similarity (3,500 tok budget, intent=code only)
                   └─ Document RAG - FTS5 document search (3,000 tok budget)

Stop/SessionEnd  → log-session.js (automatic, Node.js layer, zero Claude context)
Stop             → log-turn.js (automatic, Node.js layer)
```

**Key transformation**: From "many hooks independently triggered" to "RAG centralized injection + background auto-recording". RAG Hook uses ~10K tok/prompt hard cap but replaces massive blind Read operations.

## Hook Budget Allocation

| Pool | Budget | Source | Fallback |
|------|:------:|--------|----------|
| Session memory | 2,000 tok | Latest 3 session records from context_entries | Skip if DB unavailable |
| Rule Violation Hot Zones | 400 tok | context_entries category='rule_violation' (30-day GROUP BY rule+phase, top-5) | Skip / cascade 5→3→1 |
| Task-Aware Context | dynamic | tech_debt_items + context_entries (decision) + stories (Story ID detection) | Skip |
| IDD Layer 10 | 1,500 tok | intentional_decisions active (intent=code gated) | Skip |
| Pipeline State | small | pipeline_checkpoints running/paused | Skip if table absent |
| Skill Recommendation | small | skill-keywords.json keyword match | Skip if index missing |
| LSP Diagnostics | 1,500 tok | dotnet build + npx tsc --noEmit (intent=code gated) | Skip on timeout 3s |
| Code RAG | 3,500 tok | symbol_embeddings (cosine similarity, intent=code gated) | FTS5 LIKE fallback |
| Document RAG | 3,000 tok | document_chunks_fts MATCH (FTS5-only, hook latency < 3s) | Skip |
| **Total per prompt (hard cap)** | **10,000 tok** | Dynamic budget adjustment per layer | All pools fail gracefully |

## Safety Mechanisms

1. **Local ONNX inference** — No API key required, zero external dependency
2. **Read-only DB access** — Hook opens DB in readonly mode
3. **Silent failure** — Any exception exits silently, never blocks user
4. **Environment variable kill switch** — Set `{PROJECT}_RAG_HOOK=false` to disable

## Session Recording Triple Insurance

| Hook | Trigger | Behavior |
|------|---------|----------|
| Stop | After each Claude response | UPDATE if <2min since last record, else INSERT new |
| SessionEnd | Conversation end | Unconditional INSERT (last-resort write) |
| PreCompact | Before context compaction | Shares dedup logic with Stop |

> Agent does NOT need to manually write session records (Stop Hook handles it automatically), but important milestones should still be manually supplemented with detailed summaries.

## Memory DB Schema (CMI-6 Final)

| Table | Records | Purpose |
|-------|:-------:|---------|
| symbol_embeddings | 5,294 | Code-level symbol vectors (384D ONNX) |
| document_embeddings | 14,114 | Document chunk vectors (384D ONNX) |
| document_chunks | 14,114 | Document text chunks for retrieval |
| context_entries | 453+ | Decisions, debugging lessons, architecture patterns |
| tech_entries | 127+ | Technical solutions (success/failure) |
| conversation_sessions | N/A | Session lifecycle records |
| conversation_turns | N/A | Per-turn interaction records |

## Search Engine Evolution

```
Phase 0:   FTS5 trigram pure text search
Phase 1-3: FTS5 + Symbol Embedding (OpenAI 1536D)
CMI-5:     FTS5 + Document Embedding (OpenAI 1536D) + Hybrid Fusion
CMI-6:     FTS5 + Local ONNX Embedding (all-MiniLM-L6-v2 384D) + Hybrid Fusion
           → Zero external dependency, $0.00 inference cost
```

## v3.0 Hook Additions (2026-03-28)

| Hook/Script | Type | Purpose |
|-------------|------|---------|
| `check-hygiene.ps1` | Pre-commit gate | Runs before git commit, validates code quality |
| ~~Auto-skill-detection~~ | [RETIRED 2026-05-05] | Replaced by Claude native progressive disclosure (SKILL.md description matching). Domain Profile logic preserved in `rules/skill-creation-discipline.md` §8. |
| Skill Sync Gate | Workflow gate (rules/skill-sync-gate.md) | After dev-story: Grep reverse-search affected Skills, enforce sync |
| Tasks Backfill | Workflow gate (rules/tasks-backfill.md) | After dev-story/code-review: verify all tasks with file:line evidence |

**v3.0 Critical Change**: All pipeline hooks use **interactive launcher** (full MCP/Hooks/Skills). `-p` pipe mode deprecated — it strips MCP and Skills access, causing silent failures on complex Stories.

## Context Window Update

| Engine | v2.0 | v3.0 (2026-03-28) |
|--------|:----:|:------------------:|
| Claude Code (Opus 4.6) | 200K tok | **1M tok** |
| Claude Code (Sonnet 4.6) | 200K tok | **1M tok** |
| Claude Code (Haiku 4.5) | 200K tok | 200K tok |

> Opus/Sonnet 4.6 1M context available since early 2026. Budget ceilings and Always-On percentages should be recalculated against 1M base.
