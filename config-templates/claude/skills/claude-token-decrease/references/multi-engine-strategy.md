# Multi-Engine Collaboration Strategy

## Four-Engine Ecosystem

| Dimension | Claude Code | Gemini CLI | Antigravity IDE | Rovo Dev CLI |
|-----------|------------|------------|-----------------|-------------|
| Context Window | **1M tok** (Opus/Sonnet 4.6) | 1M tok | 200K~1M (model-dependent) | Undisclosed |
| Config Root | `.claude/` | `.gemini/` | `.agent/` | `.rovo/` |
| Instructions | `CLAUDE.md` | `GEMINI.md` | Shared `.gemini/` | `.rovo.md` |
| Rules | `.claude/rules/*.md` | `.gemini/rules/*.md` | N/A | N/A |
| Skills | `.claude/skills/*/SKILL.md` | `.gemini/skills/*/SKILL.md` | Same as Gemini | N/A |
| MCP | `.claude/settings.json` | `~/.gemini/settings.json` | Same as Claude | N/A |
| Models | Opus 4.6/Sonnet 4.6/Haiku 4.5 | Gemini 3.1 Pro | Multi-model | GPT-OSS 120B |

## Delegation Matrix

| Task Type | Delegate To | Examples |
|:---------:|------------|---------|
| Planning/Review/Architecture | Claude Code (Opus) | create-story, code-review, Party Mode, architecture decisions |
| General dev | Claude Code (Sonnet) or Antigravity | dev-story, routine bug fixes |
| Docs/Tracking/UI Design | Gemini CLI (Pro) | Tracking docs, UIUX design |
| Lightweight tasks | Rovo Dev CLI | Commit messages, non-mainline chores |
| Quick search | Claude Code (Haiku) Subagent | File exploration, formatting |
| Batch pipeline | claude-launcher Skill | 2+ Story automated pipeline |

## Agent ID Injection

| Engine | Agent ID | Usage |
|--------|----------|-------|
| Claude Code (Opus) | CC-OPUS | Main command + commit tag |
| Claude Code (Sonnet) | CC-SONNET | Dev + commit tag |
| Claude Code (Haiku) | CC-HAIKU | Subagent (automatic) |
| Gemini CLI (Pro) | GC-PRO | Dev/docs + commit tag |
| Antigravity (Opus) | AG-OPUS | Assist + commit tag |

## Dual-Engine SOP (Four-Phase Loop)

1. **Plan** — Claude Code (architecture decisions, Story creation)
2. **Implement** — Gemini CLI (development, tracking docs, leveraging 1M context)
3. **Review** — Claude Code (code-review, quality gate)
4. **Track** — Gemini CLI (sprint-status updates, archival)

## Unsolved Collaboration Issues

1. **Fragmented constitutions**: Four engines have independent Rules/Skills/MCP — how to unify core standards?
2. **Token strategy alignment**: TRS optimizations target Claude Code — how to bridge to other engines?
3. **Context loss prevention**: How to ensure seamless context handoff when switching agents?

## Token Transfer Benefit

By delegating dev-story and tracking updates to Gemini CLI (1M context), approximately **40% of Claude token consumption** can be transferred — reducing Claude-specific costs while maintaining quality through Claude-led review gates.

## Four Strategy Integration Audit (2026-03-12)

| Strategy | Source | Integration | Notes |
|----------|--------|:-----------:|-------|
| Memory DB Strategy (self-built) | Epic CMI | 95% | SQLite + FTS5 + ONNX fully deployed |
| claude-mem (open source) | GitHub | 70% | Not installed; self-built equivalent covers core. Missing: progress-disclosure search, Web Viewer |
| context-hub (open source) | GitHub | 5% | Not installed; Skills partially substitute "on-demand doc injection" |
| everything-claude-code (open source) | GitHub | 85% | 9/12 Agents + 6 Rules + 6 Hooks + 37 Skills |

## v3.0: Auto-Pilot Command Center Pattern

Derived from auto-pilot multi-agent research. Antigravity IDE operates as **orchestrator only** (sense → decide → delegate), NOT as executor.

```
Auto-Pilot (AG-OPUS/AG-PRO)
  ├─ Sense:    Read sprint-status.yaml + tracking/ + project-context.md
  ├─ Decide:   Analyze highest priority action
  └─ Delegate: Open PowerShell → correct engine
       ├─ code-review    → Claude Code (Opus): `claude --model opus`
       ├─ create-story   → Claude Code (Opus): `claude --model opus`
       ├─ dev-story      → Gemini CLI (Pro): `gemini --model gemini-3.1-pro-preview`
       └─ sprint-planning → Claude Code (Opus): `claude --model opus`
```

**Key principle**: Auto-pilot in Antigravity directly executing workflows **violates the delegation matrix**. Antigravity should only do status analysis + decision.

## v3.0: Pipeline Execution Mandate

**`-p` pipe mode is DEPRECATED** for all pipeline tasks. Reason: `-p` strips MCP, Hooks, and Skills, causing silent failures on complex Stories (context pressure hits 92%).

All pipelines must use **interactive launcher** (full MCP/Hooks/Skills access). Batch ≥2 Stories: each independent `run_in_background`, staggered by `Start-Sleep N*10`.

## Pending TRS Stories for Multi-Engine

| Story | Title | Status |
|-------|-------|:------:|
| TRS-13 | Dual-engine SOP standardization | Re-planning (Gemini CLI 55 docs ready) |
| TRS-14 | Unified three-engine constitution | Re-planning |
| TRS-32 | File Lock mechanism | ready-for-dev |
| TRS-33 | Worktree parallel SOP | ready-for-dev |
