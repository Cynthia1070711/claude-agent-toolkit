# Environment Variables (Complete Index)

## 1. API & Authentication

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API Key (overrides subscription) |
| `ANTHROPIC_AUTH_TOKEN` | Custom Authorization header (Bearer) |
| `ANTHROPIC_BASE_URL` | Override API endpoint (proxy/gateway) |
| `ANTHROPIC_CUSTOM_HEADERS` | Custom request headers (Name: Value format) |
| `ANTHROPIC_FOUNDRY_API_KEY` | Microsoft Foundry API key |
| `ANTHROPIC_FOUNDRY_BASE_URL` | Foundry resource URL |
| `ANTHROPIC_FOUNDRY_RESOURCE` | Foundry resource name |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock API key |
| `CLAUDE_CODE_USE_BEDROCK` | Set `1` for Amazon Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | Set `1` for Google Vertex AI |
| `CLAUDE_CODE_USE_FOUNDRY` | Set `1` for Microsoft Foundry |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | Skip AWS auth (gateway) |
| `CLAUDE_CODE_SKIP_VERTEX_AUTH` | Skip GCP auth (gateway) |
| `CLAUDE_CODE_SKIP_FOUNDRY_AUTH` | Skip Azure auth (gateway) |

## 2. Model & Reasoning

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_MODEL` | Override model name |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku alias model |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet alias model |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus alias model |
| `ANTHROPIC_CUSTOM_MODEL_OPTION` | Custom model in `/model` picker |
| `ANTHROPIC_CUSTOM_MODEL_OPTION_NAME` | Custom model display name |
| `ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION` | Custom model description |
| `ANTHROPIC_SMALL_FAST_MODEL` | [Deprecated] Use DEFAULT_HAIKU_MODEL |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Subagent model override |
| `CLAUDE_CODE_EFFORT_LEVEL` | Reasoning: low/medium/high/max/auto |
| `MAX_THINKING_TOKENS` | Thinking token budget |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | Set `1` for fixed thinking |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | Set `1` to disable 1M context |

### Capability Declaration (third-party)

`ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES` (comma-separated):
`effort`, `max_effort`, `thinking`, `adaptive_thinking`, `interleaved_thinking`

## 3. Context & Output

| Variable | Purpose |
|----------|---------|
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Auto-compaction trigger % (1-100, default 95) |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Custom compaction window (tokens) |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Max output tokens |
| `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | File read token limit |

## 4. Bash & Shell

| Variable | Purpose |
|----------|---------|
| `BASH_DEFAULT_TIMEOUT_MS` | Default command timeout |
| `BASH_MAX_TIMEOUT_MS` | Max timeout cap |
| `BASH_MAX_OUTPUT_LENGTH` | Max output chars (middle-truncated) |
| `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` | Reset CWD after each command |
| `CLAUDE_CODE_SHELL` | Override shell detection |
| `CLAUDE_CODE_SHELL_PREFIX` | Prefix for all Bash commands |
| `CLAUDE_CODE_USE_POWERSHELL_TOOL` | Set `1` for PowerShell (Windows) |
| `CLAUDE_ENV_FILE` | Environment persistence script path |

## 5. MCP

| Variable | Purpose |
|----------|---------|
| `MCP_TIMEOUT` | Server startup timeout |
| `MCP_TOOL_TIMEOUT` | Tool execution timeout |
| `MAX_MCP_OUTPUT_TOKENS` | Response cap (default 25000) |
| `ENABLE_TOOL_SEARCH` | Control: true/auto/auto:N/false |
| `ENABLE_CLAUDEAI_MCP_SERVERS` | Set `false` to disable claude.ai servers |
| `MCP_CLIENT_SECRET` | OAuth client secret |
| `MCP_OAUTH_CALLBACK_PORT` | OAuth redirect fixed port |

## 6. Feature Toggles

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Set `1` to disable |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | Set `1` to disable |
| `CLAUDE_CODE_DISABLE_CRON` | Set `1` to disable scheduling |
| `CLAUDE_CODE_DISABLE_FAST_MODE` | Set `1` to disable |
| `CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY` | Disable session survey |
| `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS` | Disable git workflow help |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Disable all non-essential |
| `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK` | Disable non-stream fallback |
| `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` | Disable terminal title update |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | Disable beta headers |
| `DISABLE_AUTOUPDATER` | Disable auto-updates |
| `DISABLE_COST_WARNINGS` | Disable cost warnings |
| `DISABLE_ERROR_REPORTING` | Disable Sentry |
| `DISABLE_FEEDBACK_COMMAND` | Disable `/feedback` |
| `DISABLE_INSTALLATION_CHECKS` | Disable install warnings |
| `DISABLE_PROMPT_CACHING` | Disable all caching |
| `DISABLE_PROMPT_CACHING_HAIKU` | Disable Haiku cache |
| `DISABLE_PROMPT_CACHING_SONNET` | Disable Sonnet cache |
| `DISABLE_PROMPT_CACHING_OPUS` | Disable Opus cache |
| `DISABLE_TELEMETRY` | Disable Statsig |
| `FORCE_AUTOUPDATE_PLUGINS` | Force plugin auto-update |

## 7. Network & Proxy

| Variable | Purpose |
|----------|---------|
| `HTTP_PROXY` / `HTTPS_PROXY` | Proxy server |
| `NO_PROXY` | Bypass proxy (space/comma separated) |
| `NODE_EXTRA_CA_CERTS` | Custom CA cert path |
| `CLAUDE_CODE_CLIENT_CERT` | mTLS client cert |
| `CLAUDE_CODE_CLIENT_KEY` | mTLS private key |
| `CLAUDE_CODE_CLIENT_KEY_PASSPHRASE` | Encrypted key passphrase |
| `CLAUDE_CODE_PROXY_RESOLVES_HOSTS` | Proxy handles DNS |

## 8. Session & Misc

| Variable | Purpose |
|----------|---------|
| `CLAUDECODE` | Set `1` in Claude-spawned shells |
| `CLAUDE_CONFIG_DIR` | Custom config directory |
| `CLAUDE_CODE_TMPDIR` | Override temp directory |
| `CLAUDE_CODE_EXIT_AFTER_STOP_DELAY` | Auto-exit delay (ms) |
| `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` | SessionEnd timeout (default 1500ms) |
| `CLAUDE_CODE_TASK_LIST_ID` | Shared task list across sessions |
| `CLAUDE_STREAM_IDLE_TIMEOUT_MS` | Stream idle timeout (default 90s) |
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` | Set `1` to remove cloud creds from subprocesses |
| `CLAUDE_CODE_SIMPLE` | Minimal system prompt (--bare sets this) |
| `CLAUDE_CODE_NEW_INIT` | Set `true` for interactive `/init` |
| `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION` | Set `false` to disable suggestions |
| `CLAUDE_CODE_ENABLE_TASKS` | Set `true` for tasks in print mode |
| `CLAUDE_CODE_REMOTE` | Set `true` in remote environments |
| `IS_DEMO` | Demo mode (hide email/org) |
| `SLASH_COMMAND_TOOL_CHAR_BUDGET` | Skill metadata char budget |
| `USE_BUILTIN_RIPGREP` | Set `0` for system rg |
| `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS` | Plugin git timeout (default 120000) |
| `CLAUDE_CODE_PLUGIN_SEED_DIR` | Plugin seed directory (containers) |

### Agent Teams

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Set `1` to enable |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | Require plan approval for teammates |
| `CLAUDE_CODE_TEAM_NAME` | Teammate's team name |

## 9. OpenTelemetry Monitoring

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | Set `1` to enable OTel |
| `OTEL_METRICS_EXPORTER` | otlp/prometheus/console |
| `OTEL_LOGS_EXPORTER` | otlp/console |
| `OTEL_LOG_USER_PROMPTS` | Set `1` to include prompts |
| `OTEL_LOG_TOOL_DETAILS` | Set `1` to include tool inputs |
| `OTEL_METRICS_INCLUDE_SESSION_ID` | Default true |
| `OTEL_METRICS_INCLUDE_VERSION` | Default false |
| `OTEL_METRICS_INCLUDE_ACCOUNT_UUID` | Default true |
| `CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS` | Header refresh (default 29min) |

### Key OTel Metrics

| Metric | Unit |
|--------|------|
| `claude_code.session.count` | count |
| `claude_code.lines_of_code.count` | count |
| `claude_code.pull_request.count` | count |
| `claude_code.commit.count` | count |
| `claude_code.cost.usage` | USD |
| `claude_code.token.usage` | tokens |
| `claude_code.active_time.total` | seconds |

### Vertex Region Overrides

`VERTEX_REGION_CLAUDE_3_5_HAIKU`, `VERTEX_REGION_CLAUDE_4_0_OPUS`, etc.
