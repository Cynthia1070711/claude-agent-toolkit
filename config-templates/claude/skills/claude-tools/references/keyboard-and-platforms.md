# Keyboard Shortcuts & Platforms

## 1. Keyboard Shortcuts

### General Controls

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Cancel/interrupt (hardcoded) |
| `Ctrl+D` | Exit Claude Code (hardcoded) |
| `Ctrl+O` | Toggle verbose/transcript mode |
| `Ctrl+T` | Toggle task list |
| `Ctrl+B` | Move task to background |
| `Ctrl+G` / `Ctrl+X Ctrl+E` | Open external editor |
| `Ctrl+R` | Reverse history search |
| `Ctrl+V` / `Alt+V` | Paste image from clipboard |
| `Esc+Esc` | Rewind/summarize menu |
| `Shift+Tab` / `Alt+M` | Cycle permission mode |
| `Alt+P` | Switch model (no clear prompt) |
| `Alt+T` | Toggle extended thinking |
| `Alt+O` | Toggle fast mode |

### Text Editing

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Delete to end of line |
| `Ctrl+U` | Delete entire line |
| `Ctrl+Y` | Paste deleted text |
| `Alt+Y` | Cycle paste history (after Ctrl+Y) |
| `Alt+B` / `Alt+F` | Move word backward/forward |
| `Ctrl+S` | Stash current prompt |
| `Ctrl+X Ctrl+K` | Kill all background agents (3s confirm) |

### Multi-line Input

| Method | Shortcut |
|--------|----------|
| Quick escape | `\` + `Enter` (all terminals) |
| macOS default | `Option+Enter` |
| Shift+Enter | iTerm2/WezTerm/Ghostty/Kitty native |
| Control sequence | `Ctrl+J` |

### Customization

Config: `~/.claude/keybindings.json`

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+e": "chat:externalEditor",
        "ctrl+u": null
      }
    }
  ]
}
```

Chord syntax: `ctrl+k ctrl+s` (space-separated sequence)

Contexts: Global, Chat, Autocomplete, Settings, Confirmation, Tabs, Help, Transcript, HistorySearch, Task, ThemePicker, Attachments, Footer, MessageSelector, DiffDialog, ModelPicker, Select, Plugin

Reserved (cannot rebind): `Ctrl+C`, `Ctrl+D`, `Ctrl+M`

Validate: `/doctor` checks for warnings.

### Vim Mode

Enable: `/vim` or `/config` → Editor Mode → vim

Supported: `h/j/k/l`, `w/e/b`, `0/$`, `gg/G`, `f/F/t/T`, `dd/D/cc/C`, `yy/p/P`, `iw/aw`, `>>/<<`, `J`, `.` (repeat), text objects (`i"/a"`, `i(/a(`, etc.)

---

## 2. Voice Dictation

**Requirements**: Claude.ai account, local microphone, v2.1.69+

Enable: `/voice` toggle (persists across sessions)

Usage: **Hold Space** → record → release → confirm

Features:
- Coding vocabulary optimized (regex, OAuth, JSON, localhost)
- Auto-adds project/branch names as recognition hints
- 20 languages supported

Custom push-to-talk key: modify `voice:pushToTalk` in keybindings.

---

## 3. Platform Comparison

| Platform | Best For | Key Feature |
|----------|----------|-------------|
| **CLI** | Terminal, scripting, remote | Full features, Agent SDK, third-party providers |
| **Desktop** | Visual review, parallel sessions | Diff viewer, App preview, Computer use, Dispatch |
| **VS Code** | VS Code workflows | Inline diff, @mention, conversation history |
| **JetBrains** | IntelliJ/PyCharm/WebStorm | Diff viewer, selection sharing, diagnostics |
| **Web** | Long-running, no local setup | Cloud VM, offline continuation, fresh clones |

### VS Code Extension

- `Cmd/Ctrl+Esc`: Toggle editor/Claude focus
- `Option/Alt+K`: Insert @mention with line numbers
- `Shift+Enter`: Multi-line input
- `@terminal:name`: Reference terminal output
- Checkpoints: hover message for restore button

### JetBrains Plugin

- `Cmd/Ctrl+Esc`: Quick open
- `Cmd+Option+K` / `Alt+Ctrl+K`: Insert file reference
- `/ide`: Connect from external terminal
- Remote dev: plugin on remote host

### Desktop App

Tabs: Chat (no file access), Cowork (background agent), Code (interactive)

Features: Diff View, App Preview, Computer Use (macOS), PR monitoring, parallel sessions (worktree), Dispatch (mobile), scheduled tasks

---

## 4. Remote Control

```bash
claude remote-control              # Server mode
claude --remote-control            # Interactive + remote
/remote-control My Project         # In-session
```

- Control via claude.ai or mobile app
- All local MCP/tools/settings available
- Press Space for QR code
- `--spawn worktree` for parallel sessions
- Requires Pro/Max/Team/Enterprise, claude.ai OAuth

Limitation: 1 remote session per process, terminal must stay open, moderate network timeout.

---

## 5. Chrome Extension

```bash
claude --chrome    # Enable at startup
/chrome            # In-session setup/reconnect
```

Requirements: Chrome/Edge, extension v1.0.36+, Claude Code v2.0.73+, direct Anthropic subscription

Capabilities: Live debugging, design verification (Figma), web app testing, authenticated apps, data extraction (CSV), multi-site workflows, GIF recording

---

## 6. GitHub Actions

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    prompt: "Review this PR"
    claude_args: "--max-turns 5 --model claude-sonnet-4-6"
```

Quick setup: `/install-github-app`

Trigger: `@claude` in PR comments. Supports Bedrock/Vertex via OIDC.

---

## 7. Code Review (Teams/Enterprise)

- Auto-triggers on PR open, push, or `@claude review`
- Multi-agent parallel analysis
- Severity: 🔴 Bug, 🟡 Nit, 🟣 Pre-existing
- Custom rules via `REVIEW.md` (repo root)
- Cost: ~$15-25 per review
- Not available with ZDR enabled

---

## 8. Security & Administration

### Security Architecture

- Default read-only, explicit authorization for writes
- Sandboxed Bash (OS-level isolation)
- Write restricted to working directory
- Command blocklist (curl, wget by default)
- Prompt injection detection + input sanitization

### Data Usage

| User Type | Training | Retention |
|-----------|:--------:|:---------:|
| Consumer (Free/Pro/Max) | Opt-in | 30 days |
| Commercial (Team/Enterprise/API) | Default no | 30 days |
| ZDR enabled | No | 0 (Enterprise) |

### Monitoring (OpenTelemetry)

Enable: `CLAUDE_CODE_ENABLE_TELEMETRY=1`

Metrics: session count, cost, tokens, lines changed, PRs, commits, active time

Privacy: prompts/tool inputs not logged by default (opt-in via `OTEL_LOG_USER_PROMPTS`/`OTEL_LOG_TOOL_DETAILS`)

### Server-Managed Settings (Beta)

Admin: Claude.ai → Admin Settings → Claude Code → Managed settings

Supports: Permission deny lists, hooks, auto mode environment, `disableBypassPermissionsMode`

Delivery: Every login + hourly poll, cached for offline

### Required Network URLs

| URL | Purpose |
|-----|---------|
| `api.anthropic.com` | Claude API |
| `claude.ai` | Account auth |
| `platform.claude.com` | Console auth |
| `downloads.claude.ai` | Updates |
