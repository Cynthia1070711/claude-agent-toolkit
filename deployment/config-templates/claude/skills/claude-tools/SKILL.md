---
name: claude-tools
description: Claude Code CLI complete reference manual. Covers core architecture, 30+ built-in tools, 60+ commands, 50+ CLI flags, extension system (Skills/Subagents/Agent Teams/MCP/Plugins/Hooks/Channels), configuration (Settings/Permissions/Sandboxing), automation (scheduling/--bare mode), deployment (Bedrock/Vertex/Foundry), token optimization (12 strategies), 80+ environment variables, party-to-pipeline v5.0.0 self-contained orchestrator (4-Tuple + Conflict Matrix + Multi-Story batch). Use when asking about Claude Code features, tools, commands, configuration, extensions, or optimization.
argument-hint: "[topic] — e.g., hooks, mcp, subagents, env-vars, token-optimization, permissions, skills, deployment, pipeline, orchestrator"
version: 2.1.0
updated: 2026-05-04
disable-model-invocation: false
allowed-tools: Read, Grep, Glob
triggers:
  - Claude Code features
  - tools
  - commands
  - settings
  - permissions
  - hooks
  - MCP
author: CC-OPUS
created: 2026-03-27
watches:
  - glob: ".claude/skills/claude-tools/scripts/*.sh"
    domain: tools
---

# Claude Code CLI Complete Reference

> v2.1.84 (2026-03-26) | 66 official docs | Source: `claude token減量策略研究分析/Agent-User/Claude-Docs/`

## How to Use This Skill

This skill is a structured reference manual. Invoke with a topic to get targeted information:

```
/claude-tools hooks          → Hook events, handler types, exit codes
/claude-tools mcp            → MCP transport, scopes, OAuth, enterprise
/claude-tools subagents      → Built-in agents, custom definition, memory
/claude-tools env-vars       → 80+ environment variables index
/claude-tools token          → 12 optimization strategies + cost reference
/claude-tools permissions    → Modes, rule syntax, sandboxing
/claude-tools skills         → Frontmatter, invocation control, context fork
/claude-tools deployment     → Bedrock, Vertex, Foundry, LLM Gateway
/claude-tools commands       → 60+ built-in / commands
/claude-tools flags          → 50+ CLI flags
/claude-tools keyboard       → Shortcuts + customization
/claude-tools plugins        → Structure, marketplace, LSP
```

Without arguments, returns this overview. With `$ARGUMENTS`, read the matching reference file for details.

---

## Reference Files

For detailed information on each topic, see the supporting files in this skill directory:

- **Tools, Commands & Flags**: [tools-and-commands.md](references/tools-and-commands.md) — 30+ built-in tools (permission classification), 60+ slash commands (5 categories), 50+ CLI flags (7 categories), Bash/PowerShell behavior
- **Extension System**: [extension-system.md](references/extension-system.md) — Skills (frontmatter, invocation control, dynamic injection, context fork), Subagents (built-in + custom, memory scopes), Agent Teams, MCP (transport, scopes, OAuth, Tool Search), Plugins (structure, marketplace, LSP), Hooks (25 events, 4 handler types, exit codes, matchers), Channels
- **Configuration**: [configuration.md](references/configuration.md) — Settings (5-layer priority, key settings, array merging), Permission Modes (6 modes + rule syntax), Sandboxing (filesystem + network), Output Styles, Model Config (aliases, effort levels, fast mode, 1M context)
- **Automation & Deployment**: [automation-and-deployment.md](references/automation-and-deployment.md) — Programmatic usage (SDK mode, `--bare`), Scheduling (3 methods), Deployment (Bedrock/Vertex/Foundry/Gateway), Cloud provider setup, Model version pinning
- **Environment Variables**: [environment-vars.md](references/environment-vars.md) — 80+ variables in 9 categories (API, Model, Context, Bash, MCP, Feature Toggles, Network, Session, OTel)
- **Token Optimization**: [token-optimization.md](references/token-optimization.md) — 12 strategies in 5 categories (Context, Model, Instruction, Tool/MCP, Reasoning), Cost reference, Decision matrix
- **Keyboard & Platforms**: [keyboard-and-platforms.md](references/keyboard-and-platforms.md) — Keyboard shortcuts (3 categories), Vim mode, Keybinding customization, Platform comparison (CLI/Desktop/VS Code/JetBrains/Web), Remote Control, Chrome, GitHub Actions, Code Review, Security & Admin
- **PhyCool Cron Templates**: [phycool-cron-templates.md](references/phycool-cron-templates.md) — PhyCool 專屬排程模板(Weekly Tech Debt Sweep / Nightly Skill Sync Audit / OTel Token Report / Depth Gate Batch Check), CronCreate 參數速查, [SILENT] 語意規範

## v5.0.0 Pipeline Reference (party-to-pipeline)

party-to-pipeline v5.0.0 self-contained orchestrator skill (2026-05-04):
- **Architecture**: 7 self-contained scripts (orchestrator + 3 worker + shared-utils + stop-report + smoke-test)
- **4-Tuple Identity**: 防 Windows PID 重用 (story_id + ipc_dir + pid + cmd_line) + Quad-Confirm
- **Multi-Story Batch**: `-StoryIds A,B,C` + Conflict Matrix (5 軸) + Greedy Schedule-Batches + Decision Tree 列印
- **UTF-8 Discipline**: 對齊 `phycool-windows-ps-encoding` Skill (PS 5.1 繁中 BOM + Console init + 危險字元 ban)
- **MCP Discipline**: 對齊 `phycool-mcp-discipline` Skill (23 tools catalog + 6 式錯防範 + Invoke-PhycoolMcpSafe)
- **--chrome flag**: worker.ps1 啟動 `claude --dangerously-skip-permissions --chrome` (YOLO + Chrome MCP integration)

完整文檔: `claude token減量策略研究分析/party-to-pipeline改版/story/` (README + 6 detail 檔: architecture / principles / configuration / usage / troubleshooting / followup-stories)

4 SUPREME rules 加入 (v5.0.0):
- `parallel-batch-conflict-isolation.md` (5 軸 Conflict Matrix + 4-Layer Defense)
- `mcp-payload-discipline.md` (Mandatory action 矩陣 + 8 FORBIDDEN + 5 步 Pre-Write)
- `encoding-discipline.md` (pointer to phycool-windows-ps-encoding)
- ~~`parallel-worker-identity.md`~~ [RETIRED — 4-Tuple Quad-Confirm mechanism integrated into `party-to-pipeline/scripts/shared-utils.ps1` + `single-engine-mode.md`]

## Utility Scripts

- **Session Info**: [scripts/show-session-info.sh](scripts/show-session-info.sh) — Display current Claude Code version and installed plugins/MCP servers

---

## Quick Reference: Core Architecture

### Agentic Loop (Three Phases)

```
1. Gather Context → Read files, search code, query MCP
2. Take Action    → Edit files, execute commands
3. Verify Results → Run tests, compare output
```

### Context Window Key Facts

| Concept | Details |
|---------|---------|
| Auto-compact | ~95% capacity (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` to adjust) |
| Manual compact | `/compact [focus instructions]` |
| Check usage | `/context` visual breakdown |
| MCP overhead | `/mcp` shows per-server token cost |
| CLAUDE.md budget | Keep under 500 lines |
| Extended context | `opus[1m]`, `sonnet[1m]` for 1M token window |

### Session Management

| Action | Command |
|--------|---------|
| Continue latest | `claude -c` |
| Resume specific | `claude -r <id>` |
| Fork session | `claude -c --fork-session` |
| Named session | `claude -n name` |
| Worktree | `claude -w feature-x` |

### Checkpointing

- `Esc+Esc` or `/rewind` → Restore code+conversation / conversation only / code only / Summarize
- Auto-snapshot before every file edit, 30-day persistence
- Bash changes (rm/mv/cp) NOT tracked

---

## Quick Reference: Extension Decision Matrix

| Need | Use | Context Cost |
|------|-----|:------------:|
| Persistent project instructions | `CLAUDE.md` | Every request |
| File-type-specific rules | `.claude/rules/` with `paths:` | On file match |
| Reusable workflow | Skill + `disable-model-invocation` | Zero until invoked |
| Isolated research | Subagent (Explore) | Isolated |
| Multi-agent collaboration | Agent Teams | High (~7x) |
| External tool integration | MCP server | Every request (or deferred) |
| Deterministic automation | Hook (command type) | Zero (unless stdout injected) |
| Shareable extension bundle | Plugin | Varies |
| External event notification | Channel | On event |
| CI/CD pipeline | `claude -p --bare` | Minimal |
| Recurring checks | `/loop` or cloud schedule | Per-run |
| Side question | `/btw` | Reuses prompt cache |

---

## Quick Reference: Top 20 Most-Used Commands

| Command | Purpose |
|---------|---------|
| `/clear` | Reset context |
| `/compact [focus]` | Compress conversation |
| `/context` | Context usage visual |
| `/model [name]` | Switch model |
| `/effort [level]` | Reasoning depth |
| `/fast` | Toggle fast mode |
| `/plan` | Enter plan mode |
| `/rewind` | Restore checkpoint |
| `/resume` | Continue session |
| `/btw <q>` | Side question |
| `/mcp` | MCP server status |
| `/permissions` | Manage permissions |
| `/agents` | Manage subagents |
| `/plugin` | Manage plugins |
| `/hooks` | View hooks |
| `/sandbox` | Toggle sandbox |
| `/doctor` | Diagnose issues |
| `/init` | Initialize CLAUDE.md |
| `/chrome` | Chrome integration |
| `/schedule` | Create scheduled task |

---

## Quick Reference: Top 15 Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key (overrides subscription) |
| `ANTHROPIC_MODEL` | Override model |
| `CLAUDE_CODE_EFFORT_LEVEL` | Reasoning depth |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Subagent model |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Early compaction trigger |
| `MAX_THINKING_TOKENS` | Thinking budget |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | Fixed thinking |
| `MAX_MCP_OUTPUT_TOKENS` | MCP response cap |
| `ENABLE_TOOL_SEARCH` | MCP tool deferral |
| `BASH_DEFAULT_TIMEOUT_MS` | Command timeout |
| `CLAUDE_ENV_FILE` | Env var persistence |
| `CLAUDE_CODE_USE_BEDROCK` | AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | GCP Vertex |
| `CLAUDE_CODE_USE_FOUNDRY` | Azure Foundry |
| `DISABLE_PROMPT_CACHING` | Disable caching |

---

## Session Info

To check Claude Code environment, run: `claude --version` and read `~/.claude.json` for MCP servers.
