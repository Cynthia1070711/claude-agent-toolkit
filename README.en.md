# PhyCool — A Claude Code Development Environment built on BMAD × ECC

> **Version** 3.3.0 ｜ **Updated** 2026-08-08 ｜ **Language** English ｜ [繁體中文](README.md)

A continuously evolving environment for AI development agents. One idea sits at its core:

> **You shouldn't have to tell an AI the same thing twice.**

What was said goes into a database. Mistakes become violation hotspots. Learned patterns settle
into instincts. Capabilities get packaged as Skills. Good ideas from other projects get distilled
into our own — and all of it is re-injected automatically before the next conversation begins.

---

## Table of Contents

- [Project Coverage](#project-coverage)
- [Philosophy](#philosophy)
- [Core Capabilities](#core-capabilities)
- [What Actually Happens in One Conversation](#what-actually-happens-in-one-conversation)
- [Quick Start](#quick-start)
- [Directory Structure](#directory-structure)
- [Deep Dive](#deep-dive)
- [Distillation Sources & Acknowledgements](#distillation-sources--acknowledgements)
- [License](#license)
- [Status & Known Limitations](#status--known-limitations)

---

## Project Coverage

Everything this environment covers — mechanisms, architecture, configuration and strategy.
The **Ref** column links to that item's deep-dive document (written in Traditional Chinese).

### 🧠 Memory & Knowledge

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **Context Memory DB** | Cross-window long-term memory | SQLite, 55 entity tables + 14 FTS5 indexes + 138 indexes — where everything settles | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |
| **Conversation Memory** | Remember what was said | Every turn persisted; queryable in natural language | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |
| **MCP Toolset** | Let the AI read/write memory directly | 36 tools: query / write / assemble / verify / cross-track / worker protocol | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |
| **Write Discipline** | Keep the store from becoming a dump | What to record and what not to; schema-first PRAGMA verification enforced | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |
| **DevConsole Web UI** | Human inspection and rulings | 22 pages / 25 API routes covering stories, debt, violations, instincts | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |
| **History Import** | Recover existing assets | Idempotent rebuild from native transcripts — no cold start | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |

### 🔍 Retrieval Architecture

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **CodeGraph** | *"What do I need to know?"* | tree-sitter AST symbol graph — context, definitions, call chains | [02](開發環境架構清單/02-檢索架構-深度補全.md) |
| **GitNexus** | *"What breaks if I change this?"* | Execution flows and blast radius; pre-commit change verification | [02](開發環境架構清單/02-檢索架構-深度補全.md) |
| **Fusion Ranking** | *"What is most relevant?"* | Vector + 2-hop dependency graph + FTS5 + PageRank, weighted | [02](開發環境架構清單/02-檢索架構-深度補全.md) |
| **12-Layer Injection** | Context before you type | session / violations / task / IDD / instincts / pipeline / skills / LSP / code / docs | [02](開發環境架構清單/02-檢索架構-深度補全.md) |
| **Graded Degradation** | Choosing what to cut | Drop only what Claude can re-fetch, replaced by a pointer; must-keep layers never dropped | [02](開發環境架構清單/02-檢索架構-深度補全.md) |
| **Rebuild Orchestrator** | One-command full rebuild | Harvest → infer deps → centrality → embeddings → doc index → health check | [02](開發環境架構清單/02-檢索架構-深度補全.md) |
| **Retrieval Health Advisor** | Stale index warning | SessionStart detection; advises, never blocks | [08](開發環境架構清單/08-橫切機制-深度補全.md) |

### 🛡️ Rule Enforcement

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **Rules System** | The carrier of discipline | 40 rules; only 2 always-on, the rest load conditionally by `paths` | [03](開發環境架構清單/03-規範執行-深度補全.md) |
| **Hook Interception** | Make rules actually hold | 67 mount points across 12 lifecycle events; can BLOCK with a reason | [03](開發環境架構清單/03-規範執行-深度補全.md) |
| **Violation Learning Loop** | Never fall in twice | Detect → persist → inject hotspots before next task → PreToolUse re-intercept | [03](開發環境架構清單/03-規範執行-深度補全.md) |
| **Rule-Load Audit** | Verify conditional loading works | `InstructionsLoaded` records which rules actually loaded each time | [08](開發環境架構清單/08-橫切機制-深度補全.md) |
| **Encoding Discipline** | Text correctness across platforms | UTF-8 / BOM / CRLF triple guard + character-drift detection with exemption registry | [03](開發環境架構清單/03-規範執行-深度補全.md) |

### 📐 Spec-Driven Development

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **SDD Spec Generator** | Precise spec before work starts | Mandatory for M/L/XL: business rules + API contract + DB schema + boundaries | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **ATDD Acceptance Criteria** | Requirements that can be verified | Given/When/Then + concrete values + `[Verifies: BR-XXX]` bidirectional mapping | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Named Test-Case Table** | Test design not left to the weakest link | 7-column table produced in create — **table, not files**; case name is a contract | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Three-Tier Test Split** | Who designs / implements / verifies | create produces → dev translates (4 decision rights removed) → review reconciles | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Depth Gate** | No work starts on a bad spec | 5-dimension formal gate + 7 substantive checks; WARN equals BLOCK | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Lifecycle Invariants** | The state machine can't be bypassed | I1–I9 invariants on status/timestamp consistency | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |

### 🔄 BMAD Customised Workflows

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **create-story (9 steps)** | Spec production | DB-first dedup → exhaustive analysis → verify against real code → spec → depth gate | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **dev-story (14 steps)** | Spec consumption | Read violation hotspots first → consume test table → coverage gate → backfill | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **code-review (15 steps)** | Spec verification | Six parallel layers (blind / edge / acceptance / security / perf / DB) + auto-fix all | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Step-File Architecture** | Fight lost-in-the-middle | Each step loads independently; the chain is declared in frontmatter, not improvised | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Workflow Entry Gate** | Violation learning becomes active | Must Read the top-3 hottest violated rules in full before starting | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Workflow Contract Tests** | The process needs guards too | 5 test files guarding step existence, triage source coverage, mechanism gaps | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |

### 🚀 Dispatch & Collaboration (thin-hand party-to-pipeline)

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **Thin-Hand Dispatch** | Main conversation is the controller | Dispatches phase by phase with no orchestrator in between (E2 is default) | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Three Task Sources** | Covers every scenario | Mode A discussion-to-pipeline / Mode B stub dispatch / Mode C general (non-BMAD) | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Six-State Lifecycle** | What goes out must come back | `dispatching → running ⇄ revising → reported → awaiting-review → approved → closed` | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Six-Evidence GATE** | *done* in the DB isn't proof | IPC status · empty error · workflow truly invoked · artifacts · DB status · timestamps | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Event-Driven Dispatch** | Polling forbidden | Woken by hooks and knocks — no heartbeat polling burning tokens | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Guardian Loop** | No zombie windows | `pipeline-guardian` heartbeat + 30/10/10 stall detection + mis-kill guard | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Multi-Track SOP-1~7** | Parallel tracks don't collide | Topology · task tree · dispatch loop · GATE · commit waves · contract · incidents | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Cross-Track Channel** | Windows can talk | 4 MCP tools + 4 tables + 3 hooks; reading is acknowledgement | [06](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) |
| **Worktree Isolation** | Parallel edits don't conflict | Each worker gets an independent git worktree; auto-removed when unchanged | [08](開發環境架構清單/08-橫切機制-深度補全.md) |
| **File Locks** | Concurrency inside one worktree | PreToolUse check + PostToolUse registration, keyed by Agent ID | [08](開發環境架構清單/08-橫切機制-深度補全.md) |

### 🧬 Self-Evolution & External Absorption

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **ECC Emergence Loop** | Grow instincts from own behaviour | Observe → consolidate → gate → adoption score → re-inject → measure → decay | [07](開發環境架構清單/07-自我演化-ECC-深度補全.md) |
| **Human Ruling & 4 Carriers** | Machines surface, humans institutionalise | You adopt / reject / institutionalise, choosing Skill｜Hook｜Rule｜Script | [07](開發環境架構清單/07-自我演化-ECC-深度補全.md) |
| **Tianji Pavilion** | Gate for adopting external solutions | 5-phase protocol + 8 guard hooks + 3-day cooldown + 7-day observation | [08](開發環境架構清單/08-橫切機制-深度補全.md) |
| **Pre-Audit Mandate** | Audit yourself before building | 6-step flow + alignment matrix; ≥60% alignment means upgrade, not rebuild | [03](開發環境架構清單/03-規範執行-深度補全.md) |
| **Skill Lifecycle** | Capabilities expire too | Create → index sync → use → code-change sync gate → retirement marker | [04](開發環境架構清單/04-能力封裝-深度補全.md) |

### 💰 Token Strategy & Management

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **Token Reduction Strategy** | Systematic cost control | 38+ research reports condensed into 11 enforceable categories (A~K) | [08](開發環境架構清單/08-橫切機制-深度補全.md) |
| **Injection Budget** | Maximise within the cap | 12 layers totalling 9,118 chars, aligned to the official hard limit with margin | [02](開發環境架構清單/02-檢索架構-深度補全.md) |
| **Progressive Disclosure** | Big Skills don't eat context | Core + `references/` split; loaded only when needed | [04](開發環境架構清單/04-能力封裝-深度補全.md) |
| **Conditional Rule Loading** | Irrelevant rules take no space | Only 2 of 41 rules are always-on | [03](開發環境架構清單/03-規範執行-深度補全.md) |
| **PreCompact Tool Pruning** | Keep conversation over definitions | Trim tool definitions before compaction, preserve actual content | [08](開發環境架構清單/08-橫切機制-深度補全.md) |
| **Model Tiering** | Right model for the right work | High tier for spec production and verification; efficient tier for routine implementation | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Token Observability** | See where it goes | OTel collector tracks token spend, duration and failure rate per workflow | [08](開發環境架構清單/08-橫切機制-深度補全.md) |

### 🧾 Quality Governance

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **Tech-Debt Framework v3.3** | Debt stays bounded | 6 categories × 5 severities × 4 dispositions + 5-minute rule + boy-scout rule | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |
| **Intentional Decision Debt** | Protect deliberate "looks like a bug" | Dedicated table + 4-layer annotation + a do-not-violate list injected into every conversation | [01](開發環境架構清單/01-知識與記憶-深度補全.md) |
| **Six-Layer Parallel Review** | One viewpoint has blind spots | Blind / edge / acceptance / security (12-dim) / perf / DB schema + SaaS 10-dim | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Review Trail** | Reviews get a route map | Concerns and stops generated from the diff, ordered by blast radius | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |
| **Task Backfill** | Completion is auditable | Each task verified with `file:line` evidence before being marked done | [05](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) |

### 🔌 External Integrations & Tools

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **ui-ux-pro-max** | UI/UX design intelligence | BM25-searchable database (50 styles / 21 palettes / 50 fonts / 20 charts) + 18 deep references | [04](開發環境架構清單/04-能力封裝-深度補全.md) |
| **chrome-connect** | Verify in a real browser | Drives the Chrome you already have open; handles authorisation and multiple profiles | [04](開發環境架構清單/04-能力封裝-深度補全.md) |
| **office-tools** | Document generation | docx / xlsx / pptx / pdf, with financial-model colour standards and visual QA loop | [04](開發環境架構清單/04-能力封裝-深度補全.md) |
| **cloud-backend-patterns** | Cloud backend methodology | 7 domains of vendor-agnostic architecture | [04](開發環境架構清單/04-能力封裝-深度補全.md) |
| **Subagents (10)** | Read-only exploration | architect / code-reviewer / security-reviewer / tdd-guide and more | [04](開發環境架構清單/04-能力封裝-深度補全.md) |
| **Slash Commands (13)** | One-key common flows | build-fix / code-review / e2e / tdd / verify / update-codemaps and more | [04](開發環境架構清單/04-能力封裝-深度補全.md) |

### 📦 Packaging & Deployment

| Capability | Purpose | Description | Ref |
|------------|---------|-------------|:---:|
| **Template Sync** | Config always reflects reality | Generated from the live `.claude/`; hand edits are overwritten next sync | [09](開發環境架構清單/09-打包與部署-深度補全.md) |
| **Install & Restore** | Your own project path | Placeholders restored from `--project-root`, including project-slug derivation | [09](開發環境架構清單/09-打包與部署-深度補全.md) |
| **Business-Content Gate** | Open source leaks no product data | Three-tier handling + independently implemented verifier; zero hits required to push | [09](開發環境架構清單/09-打包與部署-深度補全.md) |
| **Deployment Doc Verify** | Docs don't drift from reality | Sanitisation grep + link reachability + number drift + encoding checks | [09](開發環境架構清單/09-打包與部署-深度補全.md) |

---

## Philosophy

Three pillars hold this environment up.

### 1. BMAD Method × ECC Workflow

**BMAD** provides the structured backbone of the development process. **ECC** (Emergent Cognition
Cycle) lets the environment learn from its own behaviour. The former is discipline; the latter is
evolution.

```
BMAD: create-story (9 steps) → dev-story (14 steps) → code-review (15 steps)
       spec production           spec consumption        spec verification

ECC : observe behaviour → consolidate → emergence gate → adoption score
      → re-inject next conversation → measure effect
```

The two meet at SQLite: every BMAD step reads and writes the memory database, and ECC's instincts
grow out of exactly those reads and writes.

### 2. Distillation over Invention — Take the Spirit, Drop the Form

Capabilities here were not invented from scratch. They were **distilled** from open-source projects
under one rule: *take the spirit, drop the form*. Extract the methodology and design intent, then
rewrite it to fit this environment — never copy-paste.

See [Acknowledgements](#distillation-sources--acknowledgements) for what came from where. The
working loop:

> Read the external project → extract the "spirit" of how it solves the problem → compare against
> what we already have → fill only the genuinely missing piece → rewrite in our own terms

### 3. Evolve Continuously — But Behind a Gate

"Always adopt good things" without discipline becomes chasing novelty until the system bloats.
This environment turns that into a protocol: the **Tianji Pavilion external-solution evaluation gate**.

| Phase | Action | Mechanical Guard |
|:-----:|--------|------------------|
| **0** | Sovereignty 4-question + **Q4 latent-capability audit** (do we already have this?) | `tianji-q4-audit-gate` |
| **1-2** | Differential benchmarking (A/B/C/D quadrant + 8-item context match) | `tianji-baseline-snapshot-gate` |
| **3** | **MVE distillation** (Minimum Viable Essence) | — |
| **4** | Timeboxed pilot inside a worktree, with a kill switch | `tianji-concurrent-pilot-guard` |
| **5** | 7-day observation window, then write an ADR | `tianji-pilot-timebox-monitor` |

Plus a **3-day impulse cooldown** (`tianji-impulse-cooldown-guard`) and scope-creep detection
(`tianji-scope-creep-detector`) — eight hooks in total guard this protocol.

> The mechanism is itself a dogfood product: its first application revealed that our own graph
> retrieval capability was already 70% ready but had zero calls from the workflow. That finding
> produced the "capability ↔ consumption" mandatory-integration rule.

---

## Core Capabilities

### 📚 Knowledge & Memory

SQLite (**55 entity tables + 14 FTS5 full-text indexes + 138 indexes**) exposed through
**36 MCP tools**.

- Every conversation turn is persisted and queryable in natural language
- Stories, tech debt, architecture decisions and code-review findings are all structured records
- **DevConsole Web UI**: 22 pages / 25 API routes (Vite + React + Express)

### 🔍 Three Retrieval Engines + 12-Layer Injection

| Engine | Question it answers |
|--------|--------------------|
| **CodeGraph** | *"What do I need to know?"* — AST symbol graph, context before editing |
| **GitNexus** | *"What breaks if I change this?"* — execution flows and blast radius |
| **Internal RAG** | *"What is most relevant?"* — vector + dependency graph + FTS5 + PageRank fusion |

Their output feeds **12 layers of automatic prompt injection**: session memory, violation hotspots,
task context, intentional-design constraints, ECC instincts, pipeline state, Skill recommendations,
compiler diagnostics, code RAG, document RAG, and more.

Total budget is **9,118 characters**. When it overflows, layers degrade by one judgement:
*can Claude retrieve this on its own?* Recoverable layers (docs, code) are dropped first and
replaced by a pointer; non-recoverable layers (violation history, intentional-design prohibitions)
are never dropped.

### 🛡️ Rule Enforcement

**40 Rules + 56 hook implementations + 67 mount points.** Rules are not documents waiting to be
read — they hang off the tool lifecycle:

- **PreToolUse (20)** — edit-without-read · encoding anomalies · unchecked cross-references ·
  repeat violations · killing a live sub-window
- **PostToolUse (14)** — behaviour observation · Skill index drift · file locks · report format
- **Stop (12)** — session snapshot · embedding · tech-debt sweep · violation detection ·
  ECC emergence gate
- **Other 21** — UserPromptSubmit / SessionStart / PreCompact / FileChanged, etc.

### 📐 Spec-Driven Development (SDD + ATDD + TDD)

All specification artifacts are produced in the **create** phase. The dev phase only translates and
implements — it makes no design decisions:

| Artifact | Produced in | Stored as |
|----------|:-----------:|-----------|
| SDD Spec (business rules + API contract + DB schema + boundary conditions) | create | `specs/{story-id}-spec.md` |
| AC (Given/When/Then + concrete values + `[Verifies: BR-XXX]`) | create | DB column |
| **Named test-case table (7 columns)** | create | DB column — **table, not files** |
| Test implementation | dev | Row-by-row translation into failing tests |
| Table ↔ test reconciliation | review | Same criterion, mechanically compared |

The seven columns are `Case` / `BR` / `Level` / `Fixture` / `Input` / `Expected` / `RED→GREEN`.
**A case name is a contract once produced** — downstream consumption is byte-identical; renaming
or paraphrasing is forbidden.

> Why must test design live in create? Because once models are tiered, test design (coverage
> derivation, boundary enumeration) is among the highest cognitive-load activities in the chain —
> yet it was being assigned to the weakest link. The full argument, with two supporting papers,
> is in chapter 05.

### 🚀 Pipeline Sub-Window Dispatch

Work is dispatched to an independent Claude Code window; the controller handles handshake and
acceptance. Internally this is the **"thin hand"** — the main conversation *is* the controller,
dispatching phase by phase with no orchestrator layer in between.

#### Two Orthogonal Dimensions

Dispatch is defined by two independent dimensions that combine freely.

**Dimension 1 — task source**

| Mode | For | BMAD? | Worker script |
|:----:|-----|:-----:|---------------|
| **A** | Needs multi-role discussion before a card exists | ✅ | `worker-create` → `worker-dev` → `worker-review` |
| **B** | Backlog stub exists; skip discussion, dispatch directly | ✅ | same |
| **C** | General task (batch corrections, docs…) — not a story | ❌ | `worker-general` |

**Dimension 2 — execution control**

| Mode | Meaning | Status |
|:----:|---------|:------:|
| **E2 Main-Controlled** | Main conversation dispatches and accepts each phase — the "thin hand" | **Default** |
| E1 Orchestrator | An orchestrator script manages the whole run | Frozen |

E1 was frozen because every intermediary adds opacity. The thin hand lets the controller see the
real state of each phase and intervene directly, instead of waiting for an orchestrator to report.

#### Lifecycle

```
dispatching ──▶ running ⇄ revising ──▶ reported ──▶ awaiting-review ──▶ approved ──▶ closed
```

| Transition | Triggered by | Mechanism |
|------------|--------------|-----------|
| `dispatching → running` | `register-run.ps1 -Mode Confirm` | Backfills wrapper PID / command line / window ID — proof the window really came up |
| `running → reported` | **The worker's Stop hook** | `stop-report.ps1` fires when the turn ends normally — not dependent on the worker remembering |
| `reported → awaiting-review` | Controller `ack_worker_run` | CAS acknowledgement; a duplicate returns `ok:false` |
| `awaiting-review → approved` | Controller `gate_worker_run` | Passes only after the six-evidence chain; otherwise rules `revise` |
| `approved → closed` | Controller `close-worker.ps1` | **Whoever dispatched closes it** — windows never auto-close |
| `→ revising` | Controller rules revise | Returns to the worker with correction instructions — a loop, not a re-dispatch |

#### A Full Dispatch

```
Controller
 │
 ├─ preflight-dispatch.ps1     environment / locks / quota checks
 ├─ register-run.ps1           write worker_runs (dispatching)
 ├─ write pipeline_notes       parallel briefing: what other tracks are doing, what not to touch
 │
 ├─ dispatch-general.ps1 [-Worktree] ──▶ open a new Claude Code window
 │                                        │
 │                                        ├─ (optional) create an isolated git worktree
 │                                        ├─ inject controller instructions + story context
 │                                        ├─ run the workflow steps
 │                                        └─ Stop hook → stop-report.ps1
 │                                             └─ reports, moves to reported, window stays open
 ▼
Controller works other tracks meanwhile (no polling — woken by hooks)
 │
 ├─ search_worker_runs(pending_ack)   fetch the acknowledgement queue
 ├─ ack_worker_run                    CAS acknowledgement
 ├─ six-evidence verification         IPC · error · workflow_invoked · artifacts · DB · timestamps
 ├─ gate_worker_run(approved│revise)  ruling + advance + instruction message (one transaction)
 └─ close-worker.ps1                  close window + clean up worktree
```

#### Three Operating Disciplines

1. **Windows never auto-close** — the controller can always see where a worker is, or where it is
   stuck. Closing is an explicit act, not a timeout.
2. **A timeout is not a dead worker** — after a dispatch command times out the worker is usually
   still running. Completion is judged from DB and IPC state, never guessed from CPU or elapsed
   time. Stall detection uses 30/10/10 file-activity probing (the first check only records).
3. **`done` in the DB is not completion** — the wrap-up chain is still writing files. Wait for the
   window to close on its own before committing a worker's output.

#### Parallel Isolation

**Git worktree** is optional, letting multiple windows edit the same files without conflict
(auto-removed when unchanged). Multiple windows inside one worktree rely on **file locks**
instead (PreToolUse check, PostToolUse registration, keyed by Agent ID).

#### Why sub-windows instead of subagents / workflows?

This is the path this environment iterated on the longest. We use **both** — with a clear split:

| | Subagent (`Agent` tool) | Pipeline sub-window |
|---|---|---|
| **Best for** | Read-only exploration, broad search, independent assessment | Complete workflow phases with artifacts requiring acceptance |
| **Observability** | Black box; returns final text only | **Interactive TUI — a human can watch which step it is on** |
| **Hook lifecycle** | `SubagentStart` injection only | Full UserPromptSubmit → PreToolUse → PostToolUse → Stop |
| **Memory persistence** | Does not write session / turns | Writes fully; becomes injection material next time |
| **Acceptance** | Returns and ends; stateless | **Six-state handshake + six-evidence chain**; controller can rule revise / reject |
| **Crash recovery** | Lost on failure | Recorded in `worker_runs`; queryable and re-dispatchable |
| **Context cost** | Consumes main-conversation context | Fully independent |

Three boundaries we learned the hard way:

1. **Recursive delegation is explicitly blocked** (`subagent-blocked-tools.md`, N1) — a subagent
   spawning subagents causes depth explosion and exponential context growth. Subagents are
   **leaf nodes**, not orchestrators.
2. **One of the three primary signals for judging worker state is "look at the sub-window"**
   (`worker-lifecycle-judgment.md`). Sub-windows never auto-close, so the controller can see where
   one is stuck at any moment — impossible in a black box, and precisely what long tasks need most.
3. **Headless mode (`claude -p`) was explicitly rejected** — it bills against a separate quota and
   offers no TUI, forfeiting point 2. Technically cleaner, but it costs you control over long tasks.

In one line: **subagents look things up for you; sub-windows get things done for you.** Work that
gets done must be visible, acceptable and traceable — that is why sub-windows exist.

### 🎛️ Multi-Track Control & Cross-Track Channel

When several controller windows each drive a separate "track" (frontend / backend / infrastructure)
in parallel:

- **Multi-track SOP-1~7**: role topology determination · task-tree planning ·
  **event-driven dispatch (polling forbidden)** · GATE evidence chain · commit waves ·
  cross-window coordination contract · incident playbook
- **Cross-track channel**: 4 MCP tools + 4 tables + 3 hooks. Messages are injected on
  `UserPromptSubmit`, throttle-probed on `PostToolUse`, and knocked on `Stop` —
  **reading is acknowledgement**. This replaced the original markdown chat-room files.

### 🧬 Self-Evolution (ECC)

```
Edit/Write behaviour ──▶ pattern_observations (raw observations)
                             │ same domain + similar trigger + same action → group
                             ▼
                       observations_queue (candidate instincts)
                             │ Stop-hook emergence gate: evidence completeness
                             │ + confidence threshold + dedup
                             ▼
                          instincts (verified)
                             │ adoption-score ladder filter
                             ▼
                    injected next conversation ──▶ effect metrics
                                                    ──▶ high-value ones promoted to Skills
```

Instincts that stop matching **decay**. Rejected ones are recorded, so the same bad instinct is
never proposed twice.

#### Human in the Loop — Machines Surface, Humans Institutionalise

This is the crux of ECC: **the machine finds the pattern; the human decides whether it becomes
policy.**

DevConsole `/emergence` presents the full funnel (raw observations → candidates → verified
instincts → rejected, with conversion rates). You rule on each one:

- **Adopt** — the instinct stays in the pool; its adoption score determines injection scope
  (same session / same project type / all windows)
- **Reject** — written to the rejection table; that proposal never returns
- **Institutionalise** — when it is stable enough to become policy, pick a carrier and make it permanent

#### Four Carriers — How to Choose

An emerged instinct is only an *observed tendency*. Turning it into part of the environment means
choosing the right form:

| Carrier | Fits | Enforcement | Entry point |
|---------|------|:-----------:|-------------|
| **Skill** | Methodology needing **active guidance** — injects a full SOP when triggered | Advisory | `skill-builder` / `saas-to-skill` |
| **Hook** | Discipline needing **mechanical enforcement** — intercepts on the tool lifecycle | Can BLOCK | `hooks-mechanization` (21 lifecycle templates) |
| **Rule** | **Conditional norms** — discipline text loaded by `paths` | Injected constraint | `cc-config-author` |
| **Script** | A **repeatable check** — runnable from CLI, CI-friendly | Verifiable | Write directly into `scripts/` |

The deciding question is *what do I want to happen when this fails*:

- I want the AI to **know** → Skill
- I want the AI to **be unable to** → Hook
- I want the AI **reminded in a specific context** → Rule
- I want to **re-verify at any time** → Script

One instinct may need two carriers — for instance a Rule (explaining *why*) paired with a Hook
(making sure it actually holds). Most CRITICAL-level norms here use exactly that two-layer structure.

> **Audit before building**: whichever carrier you pick, run the 6-step `pre-audit-mandate` flow
> first — Glob existing hooks / skills / scripts, check ADRs and the memory database, and produce
> an alignment matrix. **At ≥ 60% alignment you upgrade rather than build from scratch.**
> This is the same discipline as Tianji Pavilion's "do we already have this?" — one points outward,
> the other inward.

### 💰 Token Economics

Tokens aren't saved by trimming — they're saved by design. Our reduction strategy synthesises 38+
research reports into **eleven enforceable categories (A~K)** (`claude-token-decrease`). In practice:

- **12-layer character budget** — total cap plus graded degradation (above)
- **Progressive disclosure** — Skills split into a core plus `references/`, loaded on demand
- **Conditional rule loading** — only 2 of 41 rules are always-on; the rest trigger by `paths`
- **PreCompact tool-definition pruning** — trim tool definitions before compaction, keep the conversation
- **Model tiering** — high-tier models for spec production and verification, efficient models for routine implementation
- **Sub-window isolation** — long tasks run in their own window and never touch the main context

### 🧾 Quality Governance

- **Tech-debt framework v3.3** — 6 categories × 5 severities × 4 dispositions, plus the
  5-minute rule, boy-scout rule, staleness detection, and zombie/orphan/phantom systemic flags
- **Intentional Decision Debt (IDD)** — "this looks like a bug but is deliberate" gets its own
  table and four-layer annotation, and a *do-not-violate* list is injected into every conversation
  so nobody (human or AI) helpfully breaks it later
- **Depth Gate** — after a story is created, a 5-dimension formal gate plus 7 substantive
  verifications run; a WARN is treated as a BLOCK
- **Observability** — a local OTel collector tracks token spend, duration and failure rate per workflow

---

## What Actually Happens in One Conversation

```
User submits a prompt
   │
   ├─[UserPromptSubmit ×5]  12-layer RAG injection · unread cross-track messages
   │                        · sub-window completion notices
   │                        and INSERT conversation_turns ★
   ▼
 AI works
   │
   ├─[PreToolUse ×20]   BLOCK on violation, with the reason fed back
   ├─[tool execution]
   ├─[PostToolUse ×14]  behaviour observation → pattern_observations ★
   ▼
 AI response completes
   │
   └─[Stop ×12]  session snapshot ★ · embedding ★ · tech-debt sweep
                 violation detection ★ · ECC emergence gate ★ · sub-window report
```

★ = written back to the database, becoming injection material for the next conversation.

All **six closed loops** follow the same shape — *behave → record → settle → auto-reinject* —
and none of them depend on someone remembering to look: conversation memory · retrieval index ·
violation learning · story governance · pipeline handshake · ECC evolution.

---

## Quick Start

### Prerequisites

| Tool | Minimum | Verified |
|------|---------|----------|
| Node.js | 20+ | 24.12.0 |
| npm / pnpm | — | 11.6.2 / 11.1.2 |
| PowerShell | 7+ | 7.6.4 |
| Git | 2.x | 2.53.0 |
| Claude Code CLI | 2.x | — |
| .NET SDK | 8+ | optional (symbol-indexer) |
| Docker | — | optional (github MCP) |

> Hooks and pipeline scripts are primarily verified on **Windows + PowerShell**.

### Install

```powershell
# 1. Preview (dry-run, writes nothing)
node scripts/install-devenv.cjs --project-root "D:/Work/my-project"

# 2. Confirm every entry under "placeholder restoration" shows ✓, then install
node scripts/install-devenv.cjs --project-root "D:/Work/my-project" --apply

# 3. Dependencies
cd .context-db          ; pnpm install
cd ../tools/dev-console ; npm install
cd ../..

# 4. Create the empty memory database
node .context-db/scripts/init-db.js
Get-ChildItem .context-db/migrations/*.sql |
  Where-Object { $_.Name -notlike '*-down.sql' } |
  ForEach-Object { node .context-db/scripts/apply-migration.js $_.FullName }

# 5. MCP configuration (fill in your own credentials)
Copy-Item .claude/mcp_config.example.json .mcp.json

# 6. Build indexes
npx codegraph init -i
npx gitnexus analyze
node .context-db/scripts/refresh-all-retrieval.cjs
```

> ### ⚠ Do not copy `config-templates/` by hand
> Paths in the templates are `${PROJECT_ROOT}` / `${USER_HOME}` / `${PROJECT_SLUG}` placeholders,
> because install paths differ per machine. Copy by hand and the placeholders stay literal —
> `settings.json` hook commands become a literal `cd "${PROJECT_ROOT}"`, and
> **all 67 mount points silently stop working. Nothing errors; they simply do nothing.**

### Verify

```powershell
# Should print 67
node -e "const s=require('./.claude/settings.json');console.log(Object.values(s.hooks).flat().reduce((n,g)=>n+(g.hooks||[]).length,0))"

# Should be 0
Select-String -Path .claude/settings.json -Pattern '\$\{PROJECT_ROOT\}' | Measure-Object

node scripts/verify-deployment-docs.cjs
cd tools/dev-console ; npm run dev        # http://localhost:5174
```

Open a fresh Claude Code window and send any prompt — if installed correctly, you'll see the
injected session summary and violation hotspots before the response.

---

## Directory Structure

```
├── README.md / README.en.md         this file (zh-TW / English)
├── 00-開發環境架構清單.md            master list: six subsystems + six closed loops
├── 開發前環境部署.md                 full deployment manual
├── worktree-quick-reference.md      Git worktree parallelism cheat sheet
│
├── 開發環境架構清單/                 9 chapters × base + deep-dive editions
├── agent-cli-guides/                manuals for 5 CLI tools
├── bmad-overlay/4-implementation/   BMAD customisation overlay (73 files)
│
└── config-templates/                ⚠ script-generated, do not hand-edit
    ├── claude/
    │   ├── rules/                   40 rules
    │   ├── hooks/                   56 hook implementations
    │   ├── skills/                  49 Skills
    │   ├── commands/                13 slash commands
    │   ├── agents/                  10 subagents
    │   └── settings.json.template   ★ 67 hook mount points
    ├── context-db/                  memory store (server.js 36 tools + 117 scripts + 55 contract tests)
    ├── dev-console/                 Web UI source
    ├── party-to-pipeline/scripts/   sub-window dispatch and Six-state handshake
    └── scripts/                     40 mechanism scripts
```

---

## Deep Dive

Chapter documents are written in Traditional Chinese. Each has two editions: a **base** edition
(architecture and flow) and a **deep-dive** edition (measured data, source line numbers,
dependency matrices).

| # | Chapter | Content | Related section above |
|:-:|---------|---------|----------------------|
| 01 | [Knowledge & Memory](開發環境架構清單/01-知識與記憶.md) ｜ [deep](開發環境架構清單/01-知識與記憶-深度補全.md) | 55-table schema + 36 MCP tools + DevConsole chain + conversation-retention loop | [📚 Knowledge & Memory](#-knowledge--memory) |
| 02 | [Retrieval](開發環境架構清單/02-檢索架構.md) ｜ [deep](開發環境架構清單/02-檢索架構-深度補全.md) | Three-engine split + per-layer budgets with source line references | [🔍 Retrieval Engines](#-three-retrieval-engines--12-layer-injection) |
| 03 | [Rule Enforcement](開發環境架構清單/03-規範執行.md) ｜ [deep](開發環境架構清單/03-規範執行-深度補全.md) | Rule index + per-mount-point interception logic + violation-learning loop | [🛡️ Rule Enforcement](#️-rule-enforcement) |
| 04 | [Capability Packaging](開發環境架構清單/04-能力封裝.md) ｜ [deep](開發環境架構清單/04-能力封裝-深度補全.md) | Skill grouping and lifecycle + commands + subagent permission table | [Four Carriers](#four-carriers--how-to-choose) |
| 05 | [**BMAD Workflows**](開發環境架構清單/05-工作流-BMAD三流程.md) ｜ [deep](開發環境架構清單/05-工作流-BMAD三流程-深度補全.md) | All 38 steps + **three-tier test responsibility split** (with academic support) | [📐 Spec-Driven Development](#-spec-driven-development-sdd--atdd--tdd) |
| 06 | [Pipeline & Cross-Track](開發環境架構清單/06-工作流-Pipeline與跨軌.md) ｜ [deep](開發環境架構清單/06-工作流-Pipeline與跨軌-深度補全.md) | Six-state handshake + six-evidence chain + cross-track channel | [🚀 Sub-Window Dispatch](#-pipeline-sub-window-dispatch) · [🎛️ Multi-Track](#️-multi-track-control--cross-track-channel) |
| 07 | [Self-Evolution (ECC)](開發環境架構清單/07-自我演化-ECC.md) ｜ [deep](開發環境架構清單/07-自我演化-ECC-深度補全.md) | Full schema of 5 tables + emergence-gate thresholds + human ruling path | [🧬 Self-Evolution](#-self-evolution-ecc) |
| 08 | [Cross-Cutting](開發環境架構清單/08-橫切機制.md) ｜ [deep](開發環境架構清單/08-橫切機制-深度補全.md) | OTel / token budget / status line / file locks / worktree / rule audit / Tianji Pavilion | [💰 Token Economics](#-token-economics) · [Pillar 3](#3-evolve-continuously--but-behind-a-gate) |
| 09 | [Packaging & Deployment](開發環境架構清單/09-打包與部署.md) ｜ [deep](開發環境架構清單/09-打包與部署-深度補全.md) | Package scope + business-content exclusion rules + restore order | [Quick Start](#quick-start) |

### Other Documents

| Document | Purpose |
|----------|---------|
| [00-開發環境架構清單.md](00-開發環境架構清單.md) | Master list: six subsystems + full conversation journey + six closed loops |
| [開發前環境部署.md](開發前環境部署.md) | Full deployment manual (greenfield / brownfield / migration modes) |
| [worktree-quick-reference.md](worktree-quick-reference.md) | Git worktree parallelism + merge-conflict playbook |
| [agent-cli-guides/](agent-cli-guides/) | Manuals for 5 CLI tools |
| [_EXCLUDED-SKILLS.md](config-templates/claude/skills/_EXCLUDED-SKILLS.md) | Which Skills were withheld for containing product information, and what to use instead |

### Reading the Mechanisms Directly

| To see | Location |
|--------|----------|
| How the 67 hook mount points are wired | [`config-templates/claude/settings.json.template`](config-templates/claude/settings.json.template) |
| The 12-layer injection implementation | [`config-templates/claude/hooks/pre-prompt-rag.js`](config-templates/claude/hooks/pre-prompt-rag.js) |
| The 36 MCP tools | [`config-templates/context-db/server.js`](config-templates/context-db/server.js) |
| Six-state handshake and dispatch | [`config-templates/party-to-pipeline/scripts/`](config-templates/party-to-pipeline/scripts/) |
| The ECC emergence gate | [`config-templates/claude/hooks/ecc-emergence-gate.cjs`](config-templates/claude/hooks/ecc-emergence-gate.cjs) |
| All 40 rules | [`config-templates/claude/rules/`](config-templates/claude/rules/) |

> The numbers above describe **this environment's scale**, not the contents of this package.
> The open-source package excludes product-specific Skills and rules under the business-content
> exclusion policy; see chapter 09 for the delta.

---

## Distillation Sources & Acknowledgements

This environment stands on the shoulders of many excellent open-source projects. Every distillation
follows the *take the spirit, drop the form* principle — extract methodology and design intent,
then rewrite to fit, rather than copy-paste.

### Core Dependencies

| Project | Author | Role |
|---------|--------|------|
| [**Claude Code**](https://claude.com/claude-code) | Anthropic | The host CLI |
| **BMAD Method** | BMad | Workflow foundation (`bmad-overlay/` is our customisation layer; install the base separately) |
| **CodeGraph** · **GitNexus** | — | Code-structure and execution-flow retrieval engines (external MCP tools) |

### Skill Distillations

| Source | License | Result |
|--------|:-------:|--------|
| **superpowers** — Jesse Vincent (2025) | MIT | `systematic-debugging` · `verification-before-completion` |
| **Anthropic skills-main** | — | `office-tools` (docx / xlsx / pptx / pdf generation) |
| **aws-agent-skills** | — | `cloud-backend-patterns` (IAM / secrets / queues / event bus and 3 more domains, with vendor-specific form removed) |
| **agent-toolkit-main** — design-system-starter | MIT | `ui-ux-pro-max` design-system checklist (95 items) + token templates |
| **agent-skills-main** — react-native-skills / view-transitions | MIT | `ui-ux-pro-max` reference material |

### UI Pattern Distillations (`ui-ux-pro-max` v3)

| Template | License | Copyright | Distilled |
|----------|:-------:|-----------|-----------|
| **Adminator** | MIT | © 2018 Aigars Silkalns | App-shell grid · tri-state sidebar · NAV manifest |
| **Materio** (MUI Next.js) | MIT | © 2022 ThemeSelection | Slot-injection app-shell contract · 5-level opacity scale |
| **deskapp** (Bootstrap) | MIT | © 2018 DeskApp | Error-page shell-stripping · auth split · invoice print pattern |

MIT requires retaining copyright and permission notices; the full list lives in
`ui-ux-pro-max/assets/SOURCE.md`.

### Academic References

The ruling that test design belongs to the create phase cites two papers:

- **TDAD** (arXiv 2603.17973) — weaker models benefit far more from *contextual* information than
  from *procedural* instruction
- **TDD Governance** (arXiv 2604.26615) — the planner layer encodes expected test outcomes

Full argument in chapter 05 §6.2.1.

### Thanks

To the authors of every project above. Special thanks to Jesse Vincent of **superpowers** — the
discipline of *"never claim done without evidence"* is the intellectual origin of many mechanical
gates in this environment.

---

## License

Configuration and documentation in this project are released under **MIT**.
Distilled third-party content retains its original license (see above); please honour both.

---

## Status & Known Limitations

Stated plainly, so you don't fall into holes we haven't filled:

| Item | Status |
|------|--------|
| **Install script** | ✅ Verified end-to-end: 1,362 files restored, all files referenced by the 67 mount points present, 0 leftover placeholders |
| **Dependency install & index build** | ⚠ **Not verified on a clean machine** — written from how the environment actually runs today. The most likely snag is `better-sqlite3` native-module compilation |
| **Platform** | Windows + PowerShell is the primary verified platform; hooks and pipeline scripts are unverified on Linux / macOS |
| **The MCP server name `phycool-context`** | Do not rename — every rule and Skill references those 36 tools as `mcp__phycool-context__*` |
| **BMAD base** | Not included; install it first, then apply `bmad-overlay/` |
| **Product-specific Skills** | Removed under the open-source exclusion policy; see `config-templates/claude/skills/_EXCLUDED-SKILLS.md` for what was removed and what to use instead |
| **Documentation language** | Primarily Traditional Chinese. This README is the main English entry point |

### For Maintainers

`config-templates/` is generated by `scripts/sync-config-templates.cjs` from the live project
configuration — **hand edits are overwritten on the next sync**. Change `.claude/` in the project
and re-run the sync.

Before pushing, the business-content exclusion gate must pass with zero hits:

```bash
node scripts/verify-package-sanitization.cjs
```

---

<sub>This is the actual development configuration of a real project, not a teaching demo.
All figures are measured, not estimated.</sub>
