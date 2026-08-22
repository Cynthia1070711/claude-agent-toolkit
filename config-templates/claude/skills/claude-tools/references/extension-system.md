# Extension System

## 1. Skills

### SKILL.md Structure

```
my-skill/
├── SKILL.md           # Main instructions (required, keep < 500 lines)
├── template.md        # Template for Claude to fill in
├── examples/          # Example outputs
├── scripts/           # Utility scripts Claude can execute
└── references/        # Detailed docs loaded on demand
```

### Frontmatter Fields

| Field | Required | Description |
|-------|:--------:|-------------|
| `name` | No | Display name (lowercase, hyphens, max 64 chars) |
| `description` | Recommended | When to use — Claude uses this for auto-loading |
| `argument-hint` | No | Autocomplete hint: `[issue-number]` |
| `disable-model-invocation` | No | `true` = only user via `/name` |
| `user-invocable` | No | `false` = hidden from `/` menu |
| `allowed-tools` | No | Tools auto-approved when active |
| `model` | No | Model override |
| `effort` | No | `low`/`medium`/`high`/`max` |
| `context` | No | `fork` = run in isolated subagent |
| `agent` | No | Subagent type when `context: fork` |
| `hooks` | No | Skill-scoped lifecycle hooks |
| `shell` | No | `bash` (default) or `powershell` |

### String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed to skill |
| `$ARGUMENTS[N]` / `$N` | Nth argument (0-based) |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Directory containing SKILL.md |

### Dynamic Context Injection

`` !`<command>` `` runs shell commands BEFORE sending to Claude:

```yaml
## PR context
- PR diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`
```

This is **preprocessing** — Claude only sees the output, not the command.

### Invocation Control

| Setting | User | Claude | Context Loading |
|---------|:----:|:------:|-----------------|
| Default | Yes | Yes | Description always, full on invoke |
| `disable-model-invocation: true` | Yes | No | Nothing until user invokes |
| `user-invocable: false` | No | Yes | Description always, full on invoke |

### Storage Locations (priority)

1. Enterprise managed settings (org-wide)
2. `~/.claude/skills/<name>/SKILL.md` (personal)
3. `.claude/skills/<name>/SKILL.md` (project)
4. `<plugin>/skills/<name>/SKILL.md` (plugin-scoped)

### Character Budget

Descriptions occupy 2% of context window (fallback 16,000 chars). Override: `SLASH_COMMAND_TOOL_CHAR_BUDGET`.

### Built-in Skills

| Skill | Purpose |
|-------|---------|
| `/batch <instruction>` | Parallel codebase changes (worktree per unit, PR per unit) |
| `/claude-api` | Claude API reference for Python/TS/etc |
| `/debug [description]` | Enable debug logging + analyze log |
| `/loop [interval] <prompt>` | Recurring prompt execution |
| `/simplify [focus]` | 3 parallel review agents → fix issues |

---

## 2. Subagents

### Built-in Subagents

| Agent | Model | Purpose |
|-------|-------|---------|
| Explore | Haiku | Read-only code search & analysis |
| Plan | Inherit | Code research in Plan Mode |
| General-purpose | Inherit | Complex multi-step tasks (read/write) |
| Bash | Inherit | Terminal commands in isolated context |
| statusline-setup | Sonnet | `/statusline` configuration |
| Claude Code Guide | Haiku | Answer Claude Code questions |

### Custom Subagent Definition

```yaml
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep, Bash
disallowedTools: Write, Edit
model: sonnet
permissionMode: default
maxTurns: 50
skills: [security-review]
memory: project
effort: high
isolation: worktree
background: false
initialPrompt: "Review the latest changes"
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"
mcpServers:
  my-server:
    command: npx
    args: ["-y", "my-mcp-server"]
---
You are a code reviewer specializing in...
```

### Storage (priority)

1. `--agents` CLI flag (JSON) — highest
2. `.claude/agents/` — project
3. `~/.claude/agents/` — personal
4. Plugin `agents/` — lowest

### Model Resolution Order

1. `CLAUDE_CODE_SUBAGENT_MODEL` env var
2. Claude call-time `model` parameter
3. Subagent frontmatter `model`
4. Main conversation model

### Invocation Methods

- **Auto-delegation**: Based on description keywords
- **Natural language**: "Use the code-reviewer subagent"
- **@-mention**: `@"code-reviewer (agent)"`
- **Full session**: `claude --agent code-reviewer`
- **Background**: `Ctrl+B` to move to background

### Memory Scopes

| Scope | Path |
|-------|------|
| `user` | `~/.claude/agent-memory/<name>/` |
| `project` | `.claude/agent-memory/<name>/` |
| `local` | `.claude/agent-memory-local/<name>/` |

Contains `MEMORY.md` (first 200 lines loaded). Read/Write/Edit tools auto-enabled.

### Auto-compaction

Triggers at ~95% capacity. Override: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`.

### Transcript

`~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`

---

## 3. Agent Teams (Experimental)

**Enable**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (v2.1.32+)

### Architecture

| Component | Role |
|-----------|------|
| Team Lead | Creates team, spawns teammates, coordinates |
| Teammates | Independent Claude Code instances |
| Task List | Shared work list (file locking) |
| Mailbox | Inter-agent messaging |

### vs Subagents

| Aspect | Subagents | Agent Teams |
|--------|-----------|-------------|
| Context | Isolated, results return | Fully independent |
| Communication | Report to main only | Can message each other |
| Coordination | Main manages all | Self-coordinate via tasks |
| Token cost | Lower | ~7x higher |

### Best Practices

- 3-5 teammates, 5-6 tasks each
- Avoid editing same file
- Use Sonnet for teammates (cost)
- Hooks: `TeammateIdle`, `TaskCompleted`
- Display modes: `in-process` (Shift+Down switch) or `tmux`

---

## 4. MCP (Model Context Protocol)

### Transport Types

```bash
# HTTP (recommended)
claude mcp add --transport http notion https://mcp.notion.com/mcp

# HTTP with auth
claude mcp add --transport http api https://api.example.com/mcp \
  --header "Authorization: Bearer token"

# SSE (deprecated, use HTTP)
claude mcp add --transport sse asana https://mcp.asana.com/sse

# Stdio (local)
claude mcp add --transport stdio my-server -- npx -y my-mcp-server

# Windows stdio (needs cmd /c wrapper)
claude mcp add --transport stdio my-server -- cmd /c npx -y @some/package
```

### Scopes

| Scope | Storage | Sharing |
|-------|---------|---------|
| `local` (default) | `~/.claude.json` | Personal, this project |
| `project` | `.mcp.json` (version control) | Team-shared |
| `user` | `~/.claude.json` | Personal, all projects |

Priority: local > project > user

### Management

```bash
claude mcp add/list/get/remove
claude mcp add-from-claude-desktop   # Import from Claude Desktop
claude mcp serve                     # Claude Code AS MCP server
/mcp                                 # In-session status & cost
```

### OAuth

- Dynamic client registration (auto)
- Fixed callback port: `--callback-port 8080`
- Pre-configured: `--client-id <id> --client-secret`
- CI: `MCP_CLIENT_SECRET=secret claude mcp add ...`
- Non-OAuth: `headersHelper` script for dynamic headers

### Tool Search

Auto-activates when tool descriptions exceed 10% of context. Defers schemas until needed.

Control: `ENABLE_TOOL_SEARCH=auto:5` (5% threshold). Requires Sonnet 4+ or Opus 4+.

### Output Limits

- Warning: 10,000 tokens
- Default cap: 25,000 (`MAX_MCP_OUTPUT_TOKENS`)

### Enterprise Control

- `allowedMcpServers` / `deniedMcpServers` in managed settings
- `managed-mcp.json` for exclusive control (users can't add others)
- `serverCommand` must **exactly** match array content

### Resources & Prompts

```text
@github:issue://123               # MCP Resource via @ mention
/mcp__github__list_prs             # MCP Prompt as command
```

### .mcp.json Environment Variables

Supports `${VAR}` and `${VAR:-default}` in command/args/env/url/headers.

---

## 5. Plugins

### Structure

```
my-plugin/
├── .claude-plugin/plugin.json  # Manifest (required, only file inside .claude-plugin/)
├── commands/                   # Legacy markdown skills
├── agents/                     # Subagent definitions
├── skills/                     # name/SKILL.md structure
├── hooks/hooks.json            # Event handlers
├── output-styles/              # Custom output styles
├── .mcp.json                   # MCP server config
├── .lsp.json                   # LSP server config
└── settings.json               # Plugin defaults (agent key only)
```

**CRITICAL**: Element directories MUST be at plugin **root**, NOT inside `.claude-plugin/`.

### Plugin Manifest (plugin.json)

Only `name` is required (kebab-case). Other fields: version, description, author, homepage, repository, license, keywords, userConfig.

### Installation Scopes

| Scope | Storage | Use |
|-------|---------|-----|
| `user` (default) | `~/.claude/settings.json` | Personal, all projects |
| `project` | `.claude/settings.json` | Team-shared (git) |
| `local` | `.claude/settings.local.json` | Personal, this repo |
| `managed` | Managed settings | Org-wide (read-only) |

### Management

```bash
/plugin install plugin@marketplace
/plugin disable/enable/uninstall plugin@marketplace
/reload-plugins   # Hot-reload without restart
claude --plugin-dir ./my-plugin   # Test local plugin
```

### Official LSP Plugins

| Plugin | Language |
|--------|----------|
| `typescript-lsp` | TypeScript |
| `pyright-lsp` | Python |
| `gopls-lsp` | Go |
| `csharp-lsp` | C# |
| `rust-analyzer-lsp` | Rust |

### User Configuration (userConfig)

Prompt user for values on plugin enable. Sensitive values stored in system keychain.

Available as `${user_config.KEY}` in configs and `CLAUDE_PLUGIN_OPTION_<KEY>` env var.

### Plugin Environment Variables

- `${CLAUDE_PLUGIN_ROOT}` — install dir (changes on update)
- `${CLAUDE_PLUGIN_DATA}` — persistent data dir (survives updates)

---

## 6. Hooks

### All 25 Hook Events

| Event | Trigger | Can Block |
|-------|---------|:---------:|
| `SessionStart` | Session begins/resumes | No |
| `InstructionsLoaded` | CLAUDE.md/rules loaded | No |
| `UserPromptSubmit` | Before Claude processes prompt | Yes |
| `PreToolUse` | Before tool execution | Yes |
| `PermissionRequest` | Permission dialog appears | Yes |
| `PostToolUse` | After successful tool execution | No (feedback) |
| `PostToolUseFailure` | After failed tool execution | No |
| `Notification` | Claude sends notification | No |
| `SubagentStart` | Subagent spawned | No (inject context) |
| `SubagentStop` | Subagent finished | Yes |
| `Stop` | Claude finishes response | Yes |
| `StopFailure` | API error ends turn | No |
| `TeammateIdle` | Teammate about to idle | Yes |
| `TaskCompleted` | Task marked complete | Yes |
| `ConfigChange` | Config file modified | Yes |
| `CwdChanged` | Working directory changed | No |
| `FileChanged` | Watched file changed | No |
| `WorktreeCreate` | Worktree being created | Yes (replaces git) |
| `WorktreeRemove` | Worktree being removed | No |
| `PreCompact` | Before context compaction | No |
| `PostCompact` | After context compaction | No |
| `Elicitation` | MCP requests user input | Yes |
| `ElicitationResult` | User responds to MCP | Yes |
| `SessionEnd` | Session ends | No |
| `TaskCreated` | Task created | No |

### Handler Types

| Type | Description | Default Timeout |
|------|-------------|:-------:|
| `command` | Shell command (most common) | 600s |
| `http` | POST to URL | — |
| `prompt` | Single-turn LLM evaluation (Haiku) | 30s |
| `agent` | Multi-turn with tools (Read/Grep/Glob) | 60s |

### Exit Code Semantics

- **Exit 0**: Continue, parse stdout JSON
- **Exit 2**: Block action, stderr as feedback to Claude
- **Other**: Non-blocking error, continue

### Hook Locations (scope)

| Location | Scope |
|----------|-------|
| `~/.claude/settings.json` | All projects |
| `.claude/settings.json` | This project (shared) |
| `.claude/settings.local.json` | This project (local) |
| Managed policy | Org-wide |
| Plugin `hooks/hooks.json` | When plugin active |
| Skill/Agent frontmatter | When element active |

### Matcher Patterns

| Event | Matcher Field |
|-------|--------------|
| `PreToolUse`/`PostToolUse` etc | Tool name (regex) |
| `SessionStart` | `startup`/`resume`/`clear`/`compact` |
| `SessionEnd` | `clear`/`resume`/`logout`/`prompt_input_exit` |
| `SubagentStart`/`Stop` | Agent type name |
| `ConfigChange` | Config source name |
| `FileChanged` | File basename |

MCP tools: `mcp__<server>__<tool>` (e.g., `mcp__github__.*`)

### PreToolUse Decision Output

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "Use rg instead of grep",
    "updatedInput": { "command": "rg pattern" },
    "additionalContext": "Remember to use ripgrep"
  }
}
```

### PermissionRequest Auto-Approve

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedPermissions": [
        { "type": "setMode", "mode": "acceptEdits", "destination": "session" }
      ]
    }
  }
}
```

### Async Hooks

`"async": true` (command only) — background execution, cannot block decisions.

### Stop Hook Infinite Loop Prevention

Check `stop_hook_active` field:
```bash
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then exit 0; fi
```

### Common Patterns

- **Desktop notification**: Notification event → osascript/notify-send
- **Auto-format**: PostToolUse matcher `Edit|Write` → prettier
- **Protected files**: PreToolUse → check path → exit 2 to block
- **Context re-injection**: SessionStart matcher `compact` → echo reminders
- **Environment reload**: CwdChanged → direnv export → `CLAUDE_ENV_FILE`

---

## 7. Channels (Research Preview)

**Requirements**: v2.1.80+, claude.ai login (not API key)

### Built-in Channel Plugins

Telegram, Discord, iMessage (macOS), Fakechat (demo)

### Setup

```bash
/plugin install telegram@claude-plugins-official
/telegram:configure <bot-token>
claude --channels plugin:telegram@claude-plugins-official
/telegram:access pair <code>
/telegram:access policy allowlist
```

### Security

- Sender allowlist per channel (pairing flow)
- Enterprise: `channelsEnabled` (master switch), `allowedChannelPlugins` (whitelist)

### Channel vs Other Features

| Feature | Best For |
|---------|----------|
| Channels | Push events into **existing local session** |
| Claude Code on Web | Async self-contained tasks (cloud sandbox) |
| Claude in Slack | Team conversation-triggered tasks |
| Standard MCP | Claude queries external resources on demand |
| Remote Control | Drive local session from mobile |
