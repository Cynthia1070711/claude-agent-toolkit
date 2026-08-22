# Configuration System

## 1. Settings Scope & Priority

| Priority | Scope | Location | Shared |
|:--------:|-------|----------|:------:|
| 1 (highest) | Managed | Server/plist/registry/managed-settings.json | Yes (IT) |
| 2 | CLI args | Command-line flags | No |
| 3 | Local | `.claude/settings.local.json` | No |
| 4 | Project | `.claude/settings.json` | Yes (git) |
| 5 (lowest) | User | `~/.claude/settings.json` | No |

**Array Merging**: Array settings (`permissions.allow`, `sandbox.filesystem.allowWrite`) **concatenate & deduplicate** across scopes — they do NOT override.

### Managed Settings Delivery

1. **Server-managed** (Beta): via Claude.ai admin console (Teams/Enterprise)
2. **MDM/OS-level**: macOS plist, Windows registry (HKLM\SOFTWARE\Policies\ClaudeCode)
3. **File-based**: `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS), `/etc/claude-code/managed-settings.json` (Linux), `C:\Program Files\ClaudeCode\managed-settings.json` (Windows)
4. **Drop-in directory**: `managed-settings.d/` — multiple policy fragments merged alphabetically

### Verify Effective Settings

Run `/status` to see all settings with their source (managed/user/project/local).

---

## 2. Key Settings

| Setting | Purpose |
|---------|---------|
| `model` | Override default model |
| `effortLevel` | Persistent effort level |
| `permissions.defaultMode` | Default permission mode |
| `permissions.allow/deny/ask` | Permission rules |
| `autoMemoryEnabled` | Toggle auto memory |
| `hooks` | Lifecycle event handlers |
| `env` | Environment variables per session |
| `statusLine` | Custom status line |
| `outputStyle` | Output style selection |
| `agent` | Run main thread as specified subagent |
| `sandbox.enabled` | Enable sandboxing |
| `language` | Response language & voice recognition |
| `availableModels` | Restrict model choices (managed) |
| `apiKeyHelper` | Dynamic credential script (5min TTL) |
| `cleanupPeriodDays` | Session cleanup (default 30, 0=disable) |
| `attribution` | Custom git commit/PR attribution |
| `worktree.symlinkDirectories` | Symlink dirs in worktrees |
| `worktree.sparsePaths` | Sparse-checkout paths in worktrees |
| `claudeMdExcludes` | Exclude CLAUDE.md patterns (monorepo) |

---

## 3. Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Prompt for edits & commands |
| `acceptEdits` | Auto-accept edits, prompt for commands |
| `plan` | Read-only analysis, no modifications |
| `auto` | Classifier auto-approves (Team+ plans) |
| `dontAsk` | Auto-deny unless pre-approved |
| `bypassPermissions` | Skip all prompts (isolated env only) |

**Switch**: `Shift+Tab` cycle / `--permission-mode <mode>` / settings

**Disable dangerous modes**: `permissions.disableBypassPermissionsMode: "disable"`, `disableAutoMode: "disable"`

### Permission Rule Syntax

| Pattern | Matches |
|---------|---------|
| `Bash` | All bash commands |
| `Bash(npm run build)` | Exact command |
| `Bash(npm run *)` | Wildcard with word boundary |
| `Bash(npm*)` | Wildcard without word boundary |
| `Read(./.env)` | Specific file |
| `Read(./secrets/**)` | Glob pattern |
| `WebFetch(domain:example.com)` | Specific domain |
| `mcp__puppeteer` | All MCP server tools |
| `Agent(Explore)` | Specific subagent |
| `Skill(commit)` | Specific skill |
| `Skill(deploy *)` | Skill prefix match |

**Evaluation order**: deny → ask → allow (first match wins)

**Path patterns** (gitignore syntax): `//path` (filesystem root), `~/path` (home), `/path` (project root), `path` (current dir)

**Note**: Read/Edit deny rules only block Claude's tools, NOT Bash subprocess reads (use sandbox for OS-level).

### Auto Mode Classifier

```json
{
  "autoMode": {
    "environment": ["Source control: github.example.com/acme-corp"],
    "allow": ["Deploy to staging is allowed"],
    "soft_deny": ["Never run DB migrations outside CLI"]
  }
}
```

**WARNING**: Setting `allow` or `soft_deny` REPLACES entire default list. Run `claude auto-mode defaults` first.

Debug commands: `claude auto-mode defaults`, `claude auto-mode config`, `claude auto-mode critique`

---

## 4. Sandboxing

### OS-Level Support

- **macOS**: Seatbelt
- **Linux**: bubblewrap (install `bubblewrap socat`)
- **WSL2**: bubblewrap (WSL1 not supported)
- **Windows native**: planned

### Enable

`/sandbox` or settings:
```json
{
  "sandbox": {
    "enabled": true,
    "filesystem": {
      "allowWrite": ["~/.kube", "/tmp/build"]
    }
  }
}
```

### Modes

1. **Auto-allow**: Sandboxed Bash auto-approved, unsandboxable commands fall back to standard permissions
2. **Regular**: All Bash still requires standard permissions even inside sandbox

### Network Isolation

- Proxy-controlled domain allowlist
- New domains trigger permission prompt
- `sandbox.network.allowedDomains` for pre-approved domains
- `allowManagedDomainsOnly` for managed-only control

### Escape Hatch

`dangerouslyDisableSandbox` parameter for retrying outside sandbox (user confirmation required). Disable: `allowUnsandboxedCommands: false`.

### Security Benefits

Prevents: system file modification, data exfiltration, malicious downloads, unauthorized domain contact.

### Limitations

- Network: domain filtering only (no content inspection)
- `allowUnixSockets` may bypass sandbox
- Built-in tools (Read/Edit/Write) use permission system, not sandbox

---

## 5. Output Styles

| Style | Behavior |
|-------|----------|
| Default | Standard software engineering |
| Explanatory | Educational "Insights" between tasks |
| Learning | Collaborative, `TODO(human)` markers |
| Custom | `~/.claude/output-styles/` or `.claude/output-styles/` |

**vs CLAUDE.md**: Output Styles **modify** system prompt (can disable coding instructions). CLAUDE.md **appends** as user message.

Custom style format: YAML frontmatter (`name`, `description`, `keep-coding-instructions`) + Markdown body.

Set: `/config` → Output style, or `"outputStyle": "Explanatory"` in settings.

---

## 6. Model Configuration

### Aliases

| Alias | Description |
|-------|-------------|
| `default` | Best for account type |
| `sonnet` | Latest Sonnet (4.6), daily coding |
| `opus` | Latest Opus (4.6), complex reasoning |
| `haiku` | Fast lightweight |
| `sonnet[1m]` | Sonnet + 1M context |
| `opus[1m]` | Opus + 1M context |
| `opusplan` | Opus for planning, auto-switch Sonnet for execution |

### Effort Levels

| Level | Best For |
|-------|----------|
| `low` | Simple tasks, fast |
| `medium` | Default, balanced |
| `high` | Complex reasoning |
| `max` | Deepest, Opus 4.6 only |

Set: `/effort`, `--effort`, `CLAUDE_CODE_EFFORT_LEVEL`, `effortLevel` setting, frontmatter.

**"ultrathink"** in prompt → high effort for single request.

### Fast Mode

- 2.5x speed on Opus 4.6, same quality, higher cost
- $30/$150 per MTok (input/output)
- Toggle: `/fast`, `"fastMode": true`
- `↯` icon when active, grays during rate limit cooldown
- Not available on Bedrock/Vertex/Foundry
- Teams/Enterprise: admin must enable

### Extended Context (1M)

- Opus 4.6 + Sonnet 4.6 support
- Max/Team/Enterprise: Opus auto-1M (included), Sonnet needs extra usage
- Pro: both need extra usage
- Disable: `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`

### Model Overrides

`modelOverrides` in settings maps Anthropic IDs to provider-specific IDs (Bedrock ARN, Vertex version).

### Prompt Caching

Disable per-model: `DISABLE_PROMPT_CACHING_HAIKU/SONNET/OPUS`
