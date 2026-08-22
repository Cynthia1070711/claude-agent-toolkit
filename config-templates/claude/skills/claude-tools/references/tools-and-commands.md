# Built-in Tools, Commands & CLI Flags

## 1. Built-in Tools

### Tools Requiring NO Permission

| Tool | Purpose |
|------|---------|
| `Agent` | Spawn subagent with isolated context |
| `AskUserQuestion` | Multi-choice clarification question |
| `CronCreate` | Create scheduled task (5-field cron) |
| `CronDelete` | Cancel scheduled task |
| `CronList` | List all scheduled tasks |
| `EnterPlanMode` | Switch to plan mode |
| `EnterWorktree` | Create & enter isolated git worktree |
| `ExitWorktree` | Exit worktree session |
| `Glob` | Find files by glob pattern |
| `Grep` | Search file contents (ripgrep) |
| `ListMcpResourcesTool` | List MCP server resources |
| `LSP` | Code intelligence (go-to-def, find refs) |
| `Read` | Read file contents |
| `ReadMcpResourceTool` | Read MCP resource by URI |
| `TaskCreate` | Create task in task list |
| `TaskGet` | Get task details |
| `TaskList` | List all tasks & status |
| `TaskOutput` | [Deprecated] Use Read instead |
| `TaskStop` | Terminate background task |
| `TaskUpdate` | Update task status/details |
| `TodoWrite` | Manage task list (non-interactive) |
| `ToolSearch` | Search & load deferred tools |

### Tools Requiring Permission

| Tool | Purpose |
|------|---------|
| `Bash` | Execute shell commands |
| `Edit` | Precise file editing |
| `ExitPlanMode` | Present plan & exit plan mode |
| `NotebookEdit` | Modify Jupyter notebook cells |
| `PowerShell` | PowerShell commands (Windows preview) |
| `Skill` | Execute a skill in main conversation |
| `WebFetch` | Fetch content from URL |
| `WebSearch` | Perform web search |
| `Write` | Create or overwrite files |

### Bash Tool Behavior

- Each command runs in **isolated process**
- **Working directory persists** across commands
- **Environment variables do NOT persist** — use `CLAUDE_ENV_FILE` for persistence
- `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1` resets CWD after each command
- `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` for timeout control
- `BASH_MAX_OUTPUT_LENGTH` for output truncation (middle-truncated)

### PowerShell Tool (Windows Preview)

- Enable: `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`
- Auto-detects `pwsh.exe` (7+), falls back to `powershell.exe` (5.1)
- Bash tool still available simultaneously
- Limitations: No auto mode, no PS profiles, no sandboxing, no WSL
- Hook shell: `"shell": "powershell"` in hook config
- Skill shell: `shell: powershell` in frontmatter

---

## 2. Built-in Commands (/ Commands)

### Essential

| Command | Purpose |
|---------|---------|
| `/clear` | Reset context (alias: `/reset`, `/new`) |
| `/compact [focus]` | Compress conversation with optional focus |
| `/context` | Visualize context usage |
| `/cost` | Show token usage stats |
| `/model [model]` | Switch model |
| `/effort [level]` | Set reasoning depth (low/medium/high/max/auto) |
| `/fast [on\|off]` | Toggle fast mode (2.5x speed, higher cost) |
| `/plan [desc]` | Enter plan mode |
| `/diff` | Interactive diff viewer |
| `/rewind` | Open restore menu (alias: `/checkpoint`) |
| `/doctor` | Diagnose installation & config |

### Session & Navigation

| Command | Purpose |
|---------|---------|
| `/resume [session]` | Resume conversation (alias: `/continue`) |
| `/branch [name]` | Fork conversation (alias: `/fork`) |
| `/rename [name]` | Rename session |
| `/export [filename]` | Export as plain text |
| `/copy [N]` | Copy last response to clipboard |
| `/btw <question>` | Side question (not in history, reuses prompt cache) |

### Configuration & Management

| Command | Purpose |
|---------|---------|
| `/config` | Open settings UI (alias: `/settings`) |
| `/permissions` | View/update permissions (alias: `/allowed-tools`) |
| `/memory` | Edit CLAUDE.md, toggle auto-memory |
| `/mcp` | Manage MCP server connections & OAuth |
| `/hooks` | View configured hooks (read-only) |
| `/agents` | Manage subagent settings |
| `/plugin` | Manage plugins |
| `/skills` | List available skills |
| `/sandbox` | Toggle sandbox mode |
| `/statusline` | Configure status line |
| `/keybindings` | Open keyboard shortcut settings |
| `/terminal-setup` | Configure terminal shortcuts |

### Integration & Automation

| Command | Purpose |
|---------|---------|
| `/chrome` | Setup Chrome integration |
| `/ide` | Manage IDE integration |
| `/remote-control` | Enable remote control (alias: `/rc`) |
| `/schedule [desc]` | Create scheduled task |
| `/loop [interval] <prompt>` | Recurring prompt execution |
| `/install-github-app` | Setup Claude GitHub Actions |
| `/pr-comments [PR]` | Get GitHub PR comments |
| `/security-review` | Analyze security vulnerabilities |
| `/desktop` | Continue in Desktop app (alias: `/app`) |

### Other Utilities

| Command | Purpose |
|---------|---------|
| `/init` | Initialize project CLAUDE.md |
| `/vim` | Toggle Vim editing mode |
| `/voice` | Toggle voice input |
| `/theme` | Change color theme |
| `/color [color]` | Set prompt bar color |
| `/stats` | Visualize daily usage |
| `/usage` | Show usage & rate limit status |
| `/status` | Open status UI (effective settings & sources) |
| `/login` / `/logout` | Auth management |
| `/feedback` | Report issues (alias: `/bug`) |
| `/insights` | Generate session analysis report |
| `/tasks` | List & manage background tasks |
| `/extra-usage` | Configure extra usage to avoid rate limits |
| `/release-notes` | View full changelog |
| `/stickers` | Order Claude Code stickers |

---

## 3. CLI Flags

### Core

| Flag | Purpose |
|------|---------|
| `-p`, `--print` | Non-interactive SDK mode |
| `-c`, `--continue` | Load most recent conversation |
| `-r`, `--resume <id>` | Resume specific session |
| `-n`, `--name <name>` | Set session display name |
| `-w`, `--worktree <name>` | Launch in isolated git worktree |
| `--model <name>` | Set model (sonnet/opus/haiku/full ID) |
| `--effort <level>` | Set reasoning depth |
| `--agent <name>` | Run session as specified agent |
| `--chrome` | Enable Chrome integration |
| `--ide` | Auto-connect to IDE |

### Automation

| Flag | Purpose |
|------|---------|
| `--bare` | Minimal: skip hooks/skills/plugins/MCP/CLAUDE.md |
| `--allowedTools <list>` | Auto-approve specified tools |
| `--disallowedTools <list>` | Remove tools from model context |
| `--tools <list>` | Limit available built-in tools |
| `--max-turns <N>` | Limit agentic turns (print mode) |
| `--max-budget-usd <N>` | Max API cost cap (print mode) |
| `--output-format <fmt>` | Output: text/json/stream-json |
| `--json-schema <schema>` | Structured JSON output |
| `--input-format <fmt>` | Input format: text/stream-json |
| `--include-partial-messages` | Include partial stream events |
| `--no-session-persistence` | Disable session persistence (print mode) |

### System Prompt

| Flag | Purpose |
|------|---------|
| `--system-prompt <text>` | Replace entire system prompt |
| `--system-prompt-file <path>` | Load system prompt from file |
| `--append-system-prompt <text>` | Append to system prompt |
| `--append-system-prompt-file <path>` | Append from file |

Rules: `--system-prompt` and `--system-prompt-file` mutually exclusive. Append flags combine with either.

### Permission

| Flag | Purpose |
|------|---------|
| `--permission-mode <mode>` | Set initial permission mode |
| `--enable-auto-mode` | Enable auto mode |
| `--dangerously-skip-permissions` | Skip ALL permission prompts |
| `--allow-dangerously-skip-permissions` | Allow skip (requires --permission-mode) |
| `--permission-prompt-tool <tool>` | Custom permission handler (non-interactive) |

### Extension

| Flag | Purpose |
|------|---------|
| `--agents <json>` | Dynamically define subagents |
| `--mcp-config <file-or-json>` | Load MCP servers from JSON |
| `--strict-mcp-config` | Only use --mcp-config servers |
| `--plugin-dir <path>` | Load plugin from directory |
| `--settings <file-or-json>` | Load additional settings |
| `--setting-sources <list>` | Specify setting sources |
| `--channels <spec>` | Specify channel MCP servers |
| `--add-dir <path>` | Add additional working directory |
| `--disable-slash-commands` | Disable all skills & commands |

### Session

| Flag | Purpose |
|------|---------|
| `--fork-session` | Create new session ID on resume |
| `--session-id <uuid>` | Use specified UUID |
| `--from-pr <pr>` | Resume sessions linked to PR |
| `--remote <task>` | Create web session on claude.ai |
| `--remote-control` / `--rc` | Enable remote control |
| `--teleport` | Resume web session locally |
| `--teammate-mode <mode>` | Agent team: auto/in-process/tmux |

### Debug & Misc

| Flag | Purpose |
|------|---------|
| `--debug [categories]` | Enable debug mode |
| `--verbose` | Verbose logging |
| `--version` / `-v` | Show version |
| `--init` / `--init-only` | Run initialization hooks |
| `--fallback-model <model>` | Fallback model (print mode) |
| `--betas <headers>` | Beta headers (API key only) |
| `--no-chrome` | Disable Chrome |

### Tool Approval Syntax

```bash
# All tools
--allowedTools "Read,Edit,Bash"

# Wildcard (word boundary)
--allowedTools "Bash(git diff *),Bash(git log *),Bash(git commit *)"

# MCP tools
--allowedTools "mcp__github__create_pull_request"
```
