# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
