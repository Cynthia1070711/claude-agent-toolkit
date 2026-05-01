# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2026-05-01

### Added — Major Upgrade: documentation-only → fully deployable

- **14 hooks templates** (was 1) — config-protection / debt-discovery / detect-rule-violation-hint / mcp-health-check / pipeline-auto-exit / pipeline-heartbeat / pipeline-permission / pre-commit-quality / pre-prompt-rag / precompact-tool-preprune / session-recovery / skill-change-detector / subagent-context-inject / suggest-compact
- **25 rules templates** (was 7) — 18 new including Constitutional Standard / Verification Protocol / Skill Sync Gates (3-layer) / Story Lifecycle Invariants (I1-I9) / Subagent 3-Tier Boundary / Deployment Doc Freshness
- **10 subagent templates** (was 0) — Architect / Build-Error-Resolver / Code-Reviewer / Database-Reviewer / Doc-Updater / E2E-Runner / Planner / Refactor-Cleaner / Security-Reviewer / TDD-Guide
- **13 slash command templates** (was 0)
- **82 Context-DB scripts** (was 1) + 2 schema migrations
- **75 BMAD overlay step files** (Markdown format, was 10 XML) — v6.2.2 concept upgrade
- **9 deep-dive documents** — SANITIZATION-POLICY / skills / rules / idd-framework / hooks-events / memory-system / mcp-ecosystem / bmad-workflows-evolution / commands-reference
- **global-claude-config.md** — `~/.claude/` global layer complete guide
- **RELEASE-NOTES_v1.8.0.md** — detailed changelog
- **Maintenance mechanism** — `deployment-doc-freshness.md` rule + `verify-deployment-docs.cjs` 5-phase CI script (8 sanitization grep + Markdown link + 5-axis number drift + UTF-8 BOM + V-9 template completeness)
- **Snapshot 2026-05-01** — research/snapshot SSoT

### Changed

- **Bilingual README** updated to v1.8.0 with full feature parity (EN + zh-TW aligned)
- **BMAD overlay format** migrated XML → Markdown step files (instructions.xml deprecated)
- **Heavy sanitization** — 100% generic templates, no hardcoded brand strings (V-8 driven by `BRAND_NAME` env var, optional)
- **CHANGELOG.md** — added v1.8.0 entry

### Removed

- **`research/`** directory (14 MB obsolete research papers, theory reports, multi-engine analysis drafts) — superseded by deployment/ docs
- **`stories/`** directory (TRS-* internal story records) — irrelevant to deployable toolkit
- **`deployment/BMAD-METHOD-main/`** — upstream source clone, refer to https://github.com/bmadcode/BMAD-METHOD instead
- **`deployment/everything-claude-code-main/`** — external reference fork, refer to https://github.com/anthropics/everything-claude-code instead

### Verification

- ✓ verify-deployment-docs.cjs 5-phase ALL PASS (Sanitization 8 / Markdown links / Number drift 5-axis / UTF-8 BOM / V-9 template completeness)
- ✓ 0 brand literals across full toolkit (243 → 0 sanitized)
- ✓ UTF-8 NoBOM encoding preserved

### Migration from 1.7.1

- Drop `instructions.xml` (deprecated), apply new `workflow.md` + `steps/*.md` files
- Pull new hooks (was 1 → now 14) + rules (was 7 → now 25 including SUPREME mandates) + agents (10 new) + commands (13 new)
- Run `node deployment/scripts/verify-deployment-docs.cjs` to validate template integrity

[1.8.0]: https://github.com/Cynthia1070711/claude-agent-toolkit/releases/tag/v1.8.0

---

## [1.7.1] - 2026-04-04

### Added
- Epic WFQ Pipeline quota management
- Pipeline Heartbeat (L5) + 429/Model Purity detection (L6)
- OTel Token tracking + Quota Prediction (GO/WARN/BLOCK)
- Phase Timeout tiering + ModelPricing config
- Model Purity Rule (no Opus→Sonnet auto-degrade)
- -p mode Truth Table (v2.1.92 verified)
- DB Schema +4 columns (workflow_executions)
- BMAD Workflow definition reinforcement (4 GAP fixes)

[1.7.1]: https://github.com/Cynthia1070711/claude-agent-toolkit/releases/tag/v1.7.1

---

## [1.0.0] - 2026-03-07

### Added
- **Claude Token Reduction Strategy** — static consumption 15.4K → 3.6K tokens (-76.5%), validated across 41 TRS stories
- **Multi-Agent Collaboration** — 4-engine task matrix (Claude Code CLI, Gemini CLI, Antigravity IDE, Rovo Dev CLI) + unified charter `AGENTS.md` + Agent ID system + handoff SOP
- **Everything Claude Code Integration** — Token economics, Event-driven Hooks, Continuous Learning v2, AgentShield audit (Anthropic Hackathon Winner)
- **Context Memory DB** — SQLite + FTS5 + MCP Server with 4-layer progressive architecture (L0 Knowledge → L1 Code Semantic → L2 Vector → L3 Dynamic Injection)
- **Semi-Automated Sprint Pipeline** — batch-runner, story-pipeline, epic-auto-pilot, batch-audit with Token safety valve
- **Telegram Bridge v2.0** — stream-json persistent process mode for remote Claude CLI control, message queue, auto-reconnect, model switching
- **TDD/BDD Strategy** — RED → GREEN → IMPROVE + Context Memory TDD integration
- **BMAD Method v6 Overlay** — enhanced dev-story (dual status update + 5-point sync), code-review (useState/Zustand duplication detection), create-story (auto skills analysis)
- **Multi-Agent Parallel Execution** — 3-layer strategy (Worktree isolation + File Lock + Total Commit)
- **One-Click Deployment** — config templates, automation scripts, rules, .claudeignore for all 4 engines
- **AI CLI Usage Guides** — Claude Code, Gemini CLI, Antigravity IDE, Rovo Dev CLI, Copilot CLI
- **41 TRS Execution Stories** — full problem-to-solution records across 5 phases
- **Research Reports** — token reduction, multi-engine collaboration, BMAD vs ECC comparison, Context Memory DB analysis (multi-agent + multi-model cross-validation)
- **Bilingual README** — English (primary) + Traditional Chinese (README.zh-TW.md)

[1.0.0]: https://github.com/Cynthia1070711/claude-agent-toolkit/releases/tag/v1.0.0
