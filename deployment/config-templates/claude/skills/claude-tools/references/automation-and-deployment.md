# Automation & Deployment

## 1. Programmatic Usage (SDK Mode)

### Basic Usage

```bash
# One-shot query
claude -p "Find and fix bug" --allowedTools "Read,Edit,Bash"

# JSON output
claude -p "Extract functions" --output-format json --json-schema '{...}'

# Streaming
claude -p "Explain recursion" --output-format stream-json --verbose

# Tool approval with wildcards
claude -p "Create commit" --allowedTools "Bash(git diff *),Bash(git log *),Bash(git commit *)"

# Continue session
session_id=$(claude -p "Start review" --output-format json | jq -r '.session_id')
claude -p "Continue review" --resume "$session_id"

# Pipe input
cat error.log | claude -p "Explain root cause" > output.txt
```

### --bare Mode

Skip hooks/skills/plugins/MCP/CLAUDE.md auto-discovery. **Ideal for CI/CD.**

```bash
claude --bare -p "Summarize file" --allowedTools "Read"

# Inject resources explicitly:
claude --bare -p "task" \
  --append-system-prompt "Custom instructions" \
  --settings settings.json \
  --mcp-config mcp.json \
  --agents '[{...}]' \
  --plugin-dir ./plugin
```

Requires `ANTHROPIC_API_KEY` or `apiKeyHelper` in `--settings`.

### Output Formats

| Format | Use |
|--------|-----|
| `text` | Plain text (default) |
| `json` | `{ result, session_id, metadata }` |
| `stream-json` | Newline-delimited JSON events |

### Stream Events

```bash
# Extract text deltas
claude -p "..." --output-format stream-json | \
  jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'
```

API retry events include: `type: "system"`, `subtype: "api_retry"`, `attempt`, `retry_delay_ms`.

---

## 2. Scheduling

### Three Methods

| Method | Location | Survives Shutdown | Local Files | Min Interval |
|--------|----------|:-:|:-:|:--:|
| Cloud schedule | Anthropic cloud | Yes | No (fresh clone) | 1 hour |
| Desktop schedule | Local machine | No | Yes | 1 minute |
| `/loop` | Current CLI session | No | Yes | 1 minute |

### /loop Quick Scheduling

```text
/loop 5m check deployment status
/loop 20m /review-pr 1234
/loop check build every 2h
```

Interval formats: `s` (seconds), `m` (minutes), `h` (hours), `d` (days).

Single reminders:
```text
remind me at 3pm to push the release branch
in 45m check integration tests
```

### Cloud Scheduling

```bash
/schedule daily PR review at 9am
```

Or configure at `claude.ai/code/scheduled`.

Frequencies: Hourly, Daily, Weekdays, Weekly, Custom cron.

Default: can only push to `claude/` prefix branches.

### Cron Tools

| Tool | Purpose |
|------|---------|
| `CronCreate` | 5-field cron expression |
| `CronList` | List all tasks |
| `CronDelete` | Cancel by ID |

- Max 50 per session
- Local timezone
- Jitter: periodic ≤10% (max 15min), one-time ≤90s early
- Auto-expiry: see `CronCreate` tool schema for current value (use ToolSearch to verify)
- Disable: `CLAUDE_CODE_DISABLE_CRON=1`

---

## 3. Deployment Options

### Provider Comparison

| Provider | Auth | Billing | Best For |
|----------|------|---------|----------|
| Teams/Enterprise | SSO/email | $150/seat or custom | Most orgs (recommended) |
| Console API | API Key | PAYG | Individual devs |
| Amazon Bedrock | IAM/API Key | AWS | AWS ecosystem |
| Google Vertex AI | GCP creds | GCP | GCP ecosystem |
| Microsoft Foundry | API Key/Entra ID | Azure | Azure ecosystem |

### Amazon Bedrock

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1

# CRITICAL: Pin model versions
export ANTHROPIC_DEFAULT_OPUS_MODEL='us.anthropic.claude-opus-4-6-v1'
export ANTHROPIC_DEFAULT_SONNET_MODEL='us.anthropic.claude-sonnet-4-6'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='us.anthropic.claude-haiku-4-5-20251001-v1:0'
```

IAM permissions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `bedrock:ListInferenceProfiles`

Auto-refresh: `awsAuthRefresh` (modifies .aws/) or `awsCredentialExport` (returns JSON).

### Google Vertex AI

```bash
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=global
export ANTHROPIC_VERTEX_PROJECT_ID=YOUR-PROJECT-ID

export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-sonnet-4-6'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='claude-haiku-4-5@20251001'
```

Region override: `VERTEX_REGION_CLAUDE_4_0_OPUS=europe-west1`

IAM: `roles/aiplatform.user` or custom with `aiplatform.endpoints.predict`.

### Microsoft Foundry

```bash
export CLAUDE_CODE_USE_FOUNDRY=1
export ANTHROPIC_FOUNDRY_RESOURCE={resource}
# OR
export ANTHROPIC_FOUNDRY_BASE_URL=https://{resource}.services.ai.azure.com/anthropic

export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-6'
export ANTHROPIC_DEFAULT_SONNET_MODEL='claude-sonnet-4-6'
```

Auth: API Key (`ANTHROPIC_FOUNDRY_API_KEY`) or Entra ID (`az login`).

RBAC: `Azure AI User` or `Cognitive Services User`.

### LLM Gateway

```bash
export ANTHROPIC_BASE_URL=https://litellm-server:4000
```

Gateway must support:
- `/v1/messages` + `/v1/messages/count_tokens`
- Forward `anthropic-beta` and `anthropic-version` headers

Dynamic credentials: `apiKeyHelper` script + `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`.

**CRITICAL**: Always pin model versions with cloud providers.

---

## 4. Network Configuration

### Proxy

```bash
export HTTPS_PROXY=http://proxy:8080
export NO_PROXY=localhost,127.0.0.1
```

No SOCKS proxy support. NTLM/Kerberos: use LLM Gateway.

### Custom CA

```bash
export NODE_EXTRA_CA_CERTS=/path/to/ca-cert.pem
```

### mTLS

```bash
export CLAUDE_CODE_CLIENT_CERT=/path/to/cert.pem
export CLAUDE_CODE_CLIENT_KEY=/path/to/key.pem
export CLAUDE_CODE_CLIENT_KEY_PASSPHRASE=secret
```

### Required URLs

| URL | Purpose |
|-----|---------|
| `api.anthropic.com` | Claude API |
| `claude.ai` | Account auth |
| `platform.claude.com` | Console auth |
| `downloads.claude.ai` | Updates (optional) |
