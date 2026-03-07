# Claude Agent Toolkit

**Multi-Agent Collaboration · Semi-Automated Pipeline · Spec-Driven Development · Cross-Session Knowledge**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![繁體中文](https://img.shields.io/badge/lang-繁體中文-green)](README.md)

> 📖 [繁體中文版 →](README.md)

---

## What Is This?

A **ready-to-deploy AI Agent development methodology toolkit** that moves teams from "Vibe Coding" to **Spec-Driven Development (SDD)**.

### Primary Development Strategy

```
Antigravity IDE  +  Claude Code CLI (Primary)  +  BMAD Method v6
      ↓                      ↓                         ↓
   E2E Testing          Architecture / CR         4-Phase SDLC
   UI Dev Assist        Sprint Commander          34+ Workflows
```

### Three Integrated Systems

| # | Integration | Description |
|:-:|------------|-------------|
| 1 | **Claude Token Reduction** | Static cost 15.4K → 3.6K tokens (-76.5%), MEMORY.md 90%+ slimmer, Prompt Cache killer elimination |
| 2 | **Multi-Agent Collaboration** | Gemini CLI · Rovo Dev CLI · Antigravity IDE task matrix + handoff SOP + parallel file locks |
| 3 | **[Everything Claude Code](https://github.com/anthropics/courses)** (Anthropic Hackathon Winner) | Token economics · Event-driven Hooks · Continuous Learning v2 · AgentShield audit |

### Extending with Other CLI Agents

This toolkit provides an **open extension architecture** for adding new AI CLI tools:

1. **Compile a CLI usage guide** — follow the format in `guides/`
2. **Prepare code examples** — Hook scripts, config templates, command mappings
3. **Deploy via Claude Opus 4.6** — read `deployment/` deployment manual for automated setup

```
guides/
├── Claude Code Guide.md           ← provided
├── Gemini CLI Guide.md            ← provided
├── Antigravity Guide.md           ← provided
├── Rovo Dev CLI Guide.md          ← provided
├── Copilot CLI Guide.md           ← provided
└── <your-cli-guide>.md            ← extend yourself
```

### Key Advantages

| Advantage | Description |
|-----------|-------------|
| 🤖 **Semi-Automated Sprint Pipeline** | Pipeline automation + Token safety valve + Telegram remote control |
| 📋 **Spec-Driven Development** | BMAD Method 4-phase SDLC (Analysis → Planning → Architecture → Implementation) with quality gates |
| 🧠 **Cross-Session Knowledge** | Context Memory DB (SQLite + MCP Server) — agents never start from zero |
| 💰 **Extreme Token Efficiency** | Static tax reduced 76.5%, workflow overhead reduced 30%+, every token counts |
| 🔄 **Seamless Multi-Engine Collaboration** | Unified charter + Agent ID system + handoff SOP, four engines working in sync |
| 📡 **Telegram Remote Control** | Monitor and command Claude CLI from your phone |
| 📦 **One-Click Deployable** | All config templates, scripts, and rules packaged — 5 min setup for new projects |
| 🔧 **Open Extension** | CLI guide templates + config framework for adding any new AI CLI tool |

---

## Table of Contents

- [Framework Integration: BMAD Method × Everything Claude Code](#framework-integration-bmad-method--everything-claude-code)
- [Problems Solved](#problems-solved)
- [Architecture Overview](#architecture-overview)
- [Directory Structure](#directory-structure)
- [Quick Start](#quick-start)
- [Module Details](#module-details)
  - [1. Multi-Engine Collaboration](#1-multi-engine-collaboration)
  - [2. Context Memory DB](#2-context-memory-db)
  - [3. BMAD Method Integration](#3-bmad-method-integration)
  - [4. Token Reduction Strategy](#4-token-reduction-strategy)
  - [5. Pipeline Automation](#5-pipeline-automation)
  - [6. Multi-Agent Parallel Execution](#6-multi-agent-parallel-execution)
  - [7. Telegram Remote Control](#7-telegram-remote-control)
- [Research Reports Index](#research-reports-index)
- [TRS Execution Stories](#trs-execution-stories)
- [Requirements](#requirements)
- [License](#license)

---

## Framework Integration: BMAD Method × Everything Claude Code

This toolkit stands on the shoulders of two major open-source frameworks:

### BMAD Method — Spec-Driven Agile Team Simulation

[BMAD Method](https://github.com/bmadcode/BMAD-METHOD) (Build More Architect Dreams) treats AI as a full agile development team with "Agent-as-Code":

- **12+ Specialized Roles**: Business analyst, PM, architect, Scrum Master, developer, QA — each defined as independent YAML/Markdown files
- **34+ Standardized Workflows**: Four-phase lifecycle from analysis to implementation, each phase with strict gate checks
- **Scale-Adaptive**: Auto-adjusts from L0 single fix to L4 enterprise systems
- **Context Sharding**: Forces large PRDs into atomic user stories for clean context windows

### Everything Claude Code — Anthropic Hackathon Winner's Token Economics

[Everything Claude Code](https://github.com/anthropics/courses) (ECC) comes from the Anthropic Hackathon winning team, validated over 10+ months of production use:

- **Token Economics**: Treats 200K context window as precious — static consumption from 18K down to ~10K tokens
- **Event-Driven Hooks**: PreToolUse / PostToolUse / SessionStart lifecycle events for background formatting and security scanning
- **Continuous Learning v2**: Auto-observes coding habits, extracts "instincts" with confidence scores, evolves into permanent skills
- **AgentShield**: Opus-based red/blue team audit — scans for hardcoded keys and overly permissive settings

### Our Integration Strategy — Best of Both Worlds

| Aspect | From BMAD | From ECC | Our Enhancement |
|--------|----------|---------|----------------|
| **Process** | ✅ 4-phase SDLC + Gate Check | — | + Dual status update + 5-point sync |
| **Roles** | ✅ Agent-as-Code system | — | + Multi-engine Agent ID system |
| **Token Control** | — | ✅ Token economics | + Quantified baselines + cache killer elimination |
| **Hooks** | — | ✅ Event-driven architecture | + File Lock + Hygiene Check |
| **Knowledge** | — | ✅ Continuous learning concept | + Context Memory DB (SQLite + MCP) |
| **Security** | — | ✅ AgentShield concept | + check-hygiene.ps1 |
| **Quality Gates** | ✅ Code review workflow | — | + useState/Zustand duplication detection |
| **Automation** | ✅ Sprint Planning | — | + Pipeline + Auto-Pilot + Telegram |

> **Design Principle**: BMAD handles "What to do", ECC handles "How to save", this toolkit handles "How to collaborate".

---

## Problems Solved

| Challenge | Symptom | Solution |
|-----------|---------|----------|
| **Context Loss** | Every new conversation starts from zero — bug patterns, architecture decisions, CR lessons forgotten | Context Memory DB — SQLite + MCP Server on-demand queries |
| **Token Waste** | Bloated static configs consume context window, workflow overhead ~31K tokens/sprint | 4-layer token reduction, MEMORY.md 90%+ slimmer |
| **Multi-Engine Conflicts** | Claude Code, Gemini CLI, Antigravity IDE operating simultaneously → commit conflicts, file overwrites | 3-layer parallel strategy (Worktree + File Lock + Total Commit) |
| **Fragmented Workflow** | create-story → dev-story → code-review requires manual chaining | Pipeline automation + Token safety valve + Telegram remote |
| **Remote Control** | Cannot monitor or command agents after leaving the computer | Telegram Bot Bridge — operate Claude CLI from mobile |

---

## Architecture Overview

### Token Consumption 3-Layer Architecture

| Layer | Content | Load Mode | Before | After |
|:-----:|---------|-----------|:------:|:-----:|
| 1 | Global `~/.claude/CLAUDE.md` | Always-On | ~3,640 | ~220 |
| 2 | Project `CLAUDE.md` + `.claude/rules/*` | Always-On | ~11,000 | ~2,600 |
| 3 | Skills descriptions + MCP tools | On-Demand | ~800 | ~800 |
| **Total** | | | **~15,440** | **~3,620** |

> Static consumption reduced **76.5%** — ~12K tokens freed for actual work.

### Context Memory DB 4-Layer Progressive Architecture

```
L0 Knowledge Memory Layer (Required — zero external deps)
  ├── context_entries: decisions, patterns, debug findings, incidents
  ├── tech_entries: technical solutions (success/fail), bug fixes, architecture decisions
  ├── FTS5 trigram: full-text search (CJK + English)
  └── MCP Tools: search_context / search_tech / add_context / add_tech / add_cr_issue / trace_context

L1 Code Semantic Layer (Optional — requires .NET SDK)
  ├── symbol_index: class / method / interface / enum (Roslyn AST extraction)
  ├── symbol_dependencies: calls / inherits / implements / uses
  └── MCP Tools: search_symbols / get_symbol_context

L2 Vector Semantic Layer (Optional — requires OpenAI API Key)
  ├── symbol_embeddings: text-embedding-3-small (1536 dimensions)
  ├── Cosine Similarity semantic search
  └── MCP Tool: semantic_search

L3 Dynamic Injection Layer (Optional — requires L2)
  ├── UserPromptSubmit Hook
  ├── Auto-injects relevant code context per user prompt
  └── S_final = 0.6×vec + 0.2×graph + 0.2×fts
```

### Multi-Engine Collaboration Architecture

```
┌─────────────────────────────────────────────────┐
│           AGENTS.md Unified Charter              │
│  (Shared by 4 engines: language, structure,      │
│   trigger rules)                                 │
└──────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │
  ┌────▼────┐ ┌───▼────┐ ┌──▼───────┐ ┌▼─────────┐
  │ Claude  │ │ Gemini │ │Antigrav- │ │ Rovo Dev │
  │ Code    │ │ CLI    │ │ity IDE   │ │ CLI      │
  │ CLI     │ │        │ │          │ │          │
  ├─────────┤ ├────────┤ ├──────────┤ ├──────────┤
  │CLAUDE.md│ │GEMINI  │ │.agent/   │ │config.yml│
  │.claude/ │ │.md     │ │rules/    │ │Charter   │
  │rules/   │ │.gemini/│ │workflows/│ │System    │
  │hooks/   │ │settings│ │          │ │Prompt    │
  └─────────┘ └────────┘ └──────────┘ └──────────┘
       │          │          │          │
  ┌────▼──────────▼──────────▼──────────▼──────────┐
  │         Context Memory DB (MCP Server)          │
  │    search_context / search_tech / add_context   │
  └─────────────────────────────────────────────────┘
```

---

## Directory Structure

```
claude-agent-toolkit/
│
├── 📦 deployment/                          # One-click deployment package
│   ├── config-templates/                   # Engine-specific config templates
│   │   ├── claude/                         # Claude Code CLI
│   │   │   ├── CLAUDE.md.template          #   Project-level instructions
│   │   │   ├── MEMORY.md.template          #   Minimized auto-memory (~380 tokens)
│   │   │   ├── hooks/pre-prompt-rag.js     #   L3 Code RAG auto-injection hook
│   │   │   └── rules/*.md                  #   Behavioral rules (7 files)
│   │   ├── context-db/                     # Context Memory DB (MCP Server + SQLite)
│   │   ├── gemini/                         # Gemini CLI templates
│   │   ├── antigravity/                    # Antigravity IDE templates
│   │   └── rovodev/                        # Rovo Dev CLI templates
│   ├── scripts/                            # Automation scripts (PowerShell)
│   │   ├── deploy-context-db.ps1           #   Context Memory DB one-click deploy
│   │   ├── batch-runner.ps1                #   Batch story executor
│   │   ├── epic-auto-pilot.ps1             #   Sprint auto-execution engine
│   │   ├── check-hygiene.ps1               #   Pre-commit hygiene check
│   │   └── file-lock-*.ps1                 #   Multi-agent file locking (3 scripts)
│   ├── bmad-overlay/                       # BMAD workflow enhancement overlay
│   ├── agent-cli-guides/                   # Engine-specific usage guides
│   ├── BMAD-METHOD-main/                   # BMAD Method source (3rd party, MIT)
│   └── everything-claude-code-main/        # Everything Claude Code (3rd party)
│
├── 📊 research/                            # Strategy research reports
│   ├── token-reduction-final-report.md     # Token reduction final report (16 reports consolidated)
│   ├── multi-engine-collaboration-strategy.md  # 4-engine specs + task matrix
│   ├── bmad-vs-everything-claude-code.md   # BMAD vs ECC deep comparison
│   ├── context-memory-db/                  # Memory DB analysis (multi-agent + multi-model)
│   ├── pipeline-automation/                # Pipeline + Token safety valve
│   └── claude-mem-reference/               # claude-mem open source reference
│
├── 📖 guides/                              # AI CLI usage guides
│   ├── Claude Code Guide.md
│   ├── Gemini CLI Guide.md
│   ├── Antigravity Guide.md
│   ├── Rovo Dev CLI Guide.md
│   └── Copilot CLI Guide.md
│
├── 📡 telegram-bridge/                     # Telegram remote control for Claude CLI
│   ├── src/                                # TypeScript source
│   │   ├── telegram-bot.ts                 #   Telegram Bot UI layer
│   │   ├── claude-manager.ts               #   Claude CLI persistent process manager
│   │   ├── stream-json-parser.ts           #   NDJSON event stream parser
│   │   └── session-store.ts                #   SQLite session persistence
│   ├── PRD.md                              # Product requirements (v2.0 persistent mode)
│   ├── technical-spec.md                   # Technical spec (3-layer architecture)
│   └── SETUP.md                            # Setup guide (BotFather + env vars)
│
└── 📝 stories/                             # TRS execution stories (41, battle-tested)
    ├── TRS-0  ~ TRS-9                      # Phase 1: Basic token reduction
    ├── TRS-10 ~ TRS-19                     # Phase 2: Workflow compression
    ├── TRS-20 ~ TRS-29                     # Phase 3: 4-engine unification
    ├── TRS-30 ~ TRS-33                     # Phase 4: Parallel execution
    └── TRS-34 ~ TRS-40                     # Phase 5: Advanced optimization
```

---

## Quick Start

### Prerequisites

```bash
# Required
node --version    # Node.js 18+
claude --version  # Claude Code CLI

# Optional
gemini --version  # Gemini CLI (large context)
dotnet --version  # .NET SDK 8+ (L1 Code RAG)
```

### Step 1: Deploy Context Memory DB

```powershell
cd <your-project-root>
powershell -ExecutionPolicy Bypass -File <toolkit-path>/deployment/scripts/deploy-context-db.ps1
```

Automatically completes 6 steps: directory creation → MCP Server copy → npm install → DB init → .mcp.json registration → rules deployment.

### Step 2: Configure CLAUDE.md

```bash
cp <toolkit-path>/deployment/config-templates/claude/CLAUDE.md.template ./CLAUDE.md
# Edit: replace {{PROJECT_NAME}}, add skills index, set up project-specific rules
```

### Step 3: Deploy Rules

```bash
mkdir -p .claude/rules
cp <toolkit-path>/deployment/config-templates/claude/rules/*.md .claude/rules/
```

### Step 4: Install BMAD Overlay (Optional)

```bash
cp -r <toolkit-path>/deployment/bmad-overlay/4-implementation/* \
  _bmad/bmm/workflows/4-implementation/
```

### Step 5: Verify

```bash
claude mcp list  # Confirm MCP Server registered
# Restart Claude Code, then test: "Search memory DB for token reduction records"
```

---

## Module Details

### 1. Multi-Engine Collaboration

**Core file**: `research/multi-engine-collaboration-strategy.md`

| Engine | Type | Best For | Agent ID |
|--------|------|----------|:--------:|
| **Claude Code CLI** | Terminal CLI | Primary commander, architecture, CR | `CC-` |
| **Gemini CLI** | Terminal CLI | Large context analysis, bulk tasks | `GC-` |
| **Antigravity IDE** | Agent-First IDE | E2E testing, UI development | `AG-` |
| **Rovo Dev CLI** | Terminal CLI + IDE | Non-mainline tasks, quick fixes | `RD-` |

Key designs:
- **Unified Charter** (`AGENTS.md`) — shared language rules, directory structure, triggers
- **Handoff SOP** — 3-step verification on agent switch (Sprint Status → Tracking → Last Log)
- **Model Task Matrix** — each engine selects optimal model per task type

### 2. Context Memory DB

**Core file**: `deployment/context-memory-db-strategy.md`

Solves the fundamental problem of AI agents "starting from zero every conversation."

| Level | Name | Function | Dependency |
|:-----:|------|----------|-----------|
| **L0** | Knowledge Memory | FTS5 full-text search + 6 MCP Tools | Node.js 18+ |
| **L1** | Code Semantic | Roslyn AST symbol extraction + dependency graph | .NET SDK 8+ |
| **L2** | Vector Semantic | OpenAI Embedding + Cosine Similarity | OpenAI API Key |
| **L3** | Dynamic Injection | UserPromptSubmit Hook auto-injects context | L2 complete |

**MCP Tools (L0 Base)**:

| Tool | Function | Use Case |
|------|----------|----------|
| `search_context` | Search context memory | Query historical decisions before tasks |
| `search_tech` | Search technical knowledge | Check known solutions before bug fixes |
| `add_context` | Write context memory | New architecture decisions, pattern confirmations |
| `add_tech` | Write technical findings | Technical solution validation results |
| `add_cr_issue` | Write CR findings | Issues discovered during code review |
| `trace_context` | Trace related context | Expand story_id + related_files |

### 3. BMAD Method Integration

**Core file**: `deployment/bmad-overlay/` + `deployment/BMAD Architecture Evolution.md`

Production-grade enhancements on top of [BMAD Method](https://github.com/bmadcode/BMAD-METHOD) v6.0:

| Workflow | Original | Overlay Enhancement |
|----------|----------|-------------------|
| **dev-story** | Basic task execution | + Dual status update (Story file + YAML) + 5-point sync + Auto skills loading |
| **code-review** | Basic code review | + useState/Zustand duplication detection + Full-fix tech debt policy + CR deferred routing |
| **create-story** | Basic story creation | + Auto-analyze skills_list.md + Auto-create tracking file + Auto-update sprint status |

**BMAD 4-Phase Development Lifecycle**:

```
Phase 1: Analysis    →  /product-brief
Phase 2: Planning    →  /create-prd
Phase 3: Architecture →  /create-architecture (+ Gate Check)
Phase 4: Implementation →  /create-story → /dev-story → /code-review (Sprint cycle)
```

### 4. Token Reduction Strategy

**Core file**: `research/token-reduction-final-report.md`

Systematic optimization across 41 TRS Stories:

| Strategy | Approach | Result |
|----------|----------|--------|
| **Static Slimming** | CLAUDE.md rewrite, Rules split, Auto-memory minimization | Static tax 15.4K → 3.6K tokens |
| **Cache Killer Elimination** | Remove dynamic content (sprint status, timestamps) | Prompt Caching hit rate restored |
| **Workflow Compression** | XML instruction trimming, checklist merging | Sprint cycle 31.2K → ~22K tokens |
| **On-Demand Queries** | MEMORY.md → Context Memory DB, 8.8KB → 723B | Auto-memory fixed cost -90% |
| **Skills On-Demand** | Full Skill content loaded on-demand, only summaries Always-On | Prevents 15+ Skills full-load |

### 5. Pipeline Automation

**Core files**: `deployment/scripts/`

| Script | Function | Use Case |
|--------|----------|----------|
| `batch-runner.ps1` | Batch story executor | ≥2 stories in parallel |
| `batch-audit.ps1` | Batch code review | Multi-story review in one pass |
| `story-pipeline.ps1` | Full pipeline (create → dev → review) | Single story end-to-end |
| `epic-auto-pilot.ps1` | Sprint auto-execution engine | Push entire epic automatically |
| `check-hygiene.ps1` | Pre-commit hygiene check | Sensitive data scanning |

**Token Safety Valve**: Auto-detects abnormal token consumption during batch execution, pauses and notifies when threshold exceeded.

### 6. Multi-Agent Parallel Execution

**Core file**: `deployment/multi-agent-parallel-execution-strategy.md`

Three-layer architecture, choose per scenario:

| Layer | Strategy | Problem Solved | Scenario |
|:-----:|----------|---------------|----------|
| 1 | **Worktree Isolation** | Same-engine multi-instance file conflicts | 5×CC-OPUS parallel sprint |
| 2 | **File Lock** | Cross-engine same-directory file overwrites | CC + GC working different features |
| 3 | **Total Commit** | Commit conflicts + token waste | Agents don't commit, human decides timing |

### 7. Telegram Remote Control

**Core directory**: `telegram-bridge/`

Control Claude Code CLI from your phone via Telegram Bot.

#### Architecture

```
Telegram Bot Layer     →  Command routing + output formatting
Claude Manager Layer   →  Stream-JSON persistent process management
Stream-JSON Parser     →  NDJSON event stream parsing
Session Store (SQLite) →  Session persistence + message history
```

#### v2.0 Key Features (Persistent Process Mode)

| Feature | Description |
|---------|-------------|
| **Stream-JSON Persistent Process** | Context loaded once, multi-turn with memory |
| **Message Queue** | Rapid-fire messages won't be lost, processed in order |
| **Auto-Reconnect** | Process death → auto-restart on next message |
| **Typing Heartbeat** | Telegram shows "typing..." while Claude thinks |
| **Zombie Cleanup** | Auto-cleans residual processes on start/stop |

#### Commands

| Command | Function |
|---------|----------|
| `/new [path]` | Start new session |
| `/stop` | Stop Claude process |
| `/clear` | Clear conversation context |
| `/status` | Show status, model, working dir, token count |
| `/model <name>` | Switch model (haiku/sonnet/opus) |
| `/cd <path>` | Change working directory |
| `/bookmark add <name> <path>` | Save path bookmark |

#### Quick Deploy

```bash
cd telegram-bridge && cp .env.example .env
# Edit .env: fill TELEGRAM_BOT_TOKEN + ALLOWED_USER_IDS
npm install && npm run dev
```

---

## Research Reports Index

All strategies were cross-validated across multiple engines and models:

| Report | Topic | Models Involved |
|--------|-------|----------------|
| `token-reduction-final-report.md` | Token reduction consolidated | Opus 4.6, Sonnet 4.6, Gemini Pro |
| `multi-engine-collaboration-strategy.md` | 4-engine specs + task matrix | BMAD Party Mode (5 roles) |
| `auto-pilot-multi-agent-research.md` | Auto-Pilot workflow improvement | AG-OPUS (Antigravity) |
| `bmad-vs-everything-claude-code.md` | BMAD vs ECC architecture integration | Web AI deep research |
| `context-memory-db/*.md` | Memory DB strategy (multi-perspective) | CC + AC + GC + RC + ChatGPT |

---

## TRS Execution Stories

41 TRS (Token Reduction Strategy) stories documenting the full problem-to-solution journey:

| Phase | Stories | Theme |
|:-----:|:-------:|-------|
| **1** | TRS-0 ~ TRS-9 | Basic token reduction: .claudeignore, CLAUDE.md slimming, Rules split |
| **2** | TRS-10 ~ TRS-19 | Workflow compression: XML optimization, code-review audit |
| **3** | TRS-20 ~ TRS-29 | 4-engine unification: Gemini MD alignment, Antigravity Skills |
| **4** | TRS-30 ~ TRS-33 | Parallel execution: File Lock mechanism, Worktree SOP |
| **5** | TRS-34 ~ TRS-40 | Advanced: Tech debt registry, YAML index optimization |

> Each story contains: problem definition, execution details, file change list, quantified benefits.

---

## Requirements

| Item | Version | Required | Purpose |
|------|---------|:--------:|---------|
| **Node.js** | 18+ | Yes | MCP Server runtime |
| **PowerShell** | 5.1+ | Yes | Deployment scripts, pipeline automation |
| **Claude Code CLI** | Latest | Yes | Primary AI agent engine |
| **Git** | 2.30+ | Recommended | Version control, Worktree support |
| **Gemini CLI** | Latest | Optional | Large context development |
| **Antigravity IDE** | Latest | Optional | E2E testing, UI development |
| **Rovo Dev CLI** | Latest | Optional | Non-mainline tasks |
| **.NET SDK** | 8+ | Optional | L1 Code RAG (Roslyn AST) |
| **OpenAI API Key** | — | Optional | L2 vector semantic search |

---

## Deployment Scenarios

| Scenario | Recommended Level |
|----------|------------------|
| **Solo developer + Claude Code** | L0 Context Memory DB + Rules + Token reduction |
| **Small team + dual engine** | Above + BMAD Overlay + batch-runner |
| **Multi-engine parallel development** | Above + File Lock + Worktree + Pipeline automation |
| **Enterprise sprint management** | Full deployment + L1/L2 Code RAG + Auto-Pilot |

---

## License

| Component | License | Source |
|-----------|---------|--------|
| BMAD Method | MIT | [bmadcode/BMAD-METHOD](https://github.com/bmadcode/BMAD-METHOD) |
| Everything Claude Code | Original | [anthropics/courses](https://github.com/anthropics/courses) |
| claude-mem | Reference | Open source community |
| **Custom parts** | **MIT** | This repository |

---

## Acknowledgments

- [BMAD Method](https://github.com/bmadcode/BMAD-METHOD) — Spec-driven "Agent-as-Code" framework
- [Everything Claude Code](https://github.com/anthropics/courses) — Token economics and continuous learning
- [claude-mem](https://github.com/anthropics/claude-mem) — MCP-based memory persistence reference
- Anthropic Claude — Opus / Sonnet / Haiku models powering the entire workflow
