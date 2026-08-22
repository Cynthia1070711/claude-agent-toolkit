# Token Optimization Strategies

## 1. Context Management

| Strategy | How | Impact |
|----------|-----|--------|
| Clear unrelated context | `/clear` between unrelated tasks | High |
| Targeted compaction | `/compact focus on API changes` | Medium |
| Early compaction | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` | Medium |
| Side questions | `/btw` — reuses prompt cache, minimal cost | High |
| Subagent isolation | Delegate research, get summary back | High |
| Summarize from checkpoint | `Esc+Esc` → Summarize from here | Medium |
| Custom compaction window | `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | Low |

## 2. Model Selection

| Task Type | Recommended | Cost Impact |
|-----------|-------------|-------------|
| Simple search/analysis | Haiku (subagent) | Lowest |
| General coding | Sonnet | Medium |
| Complex architecture | Opus | Highest |
| Subagent tasks | `CLAUDE_CODE_SUBAGENT_MODEL=haiku` | Lowest |
| Plan → Execute | `opusplan` (Opus plan, Sonnet execute) | Balanced |

## 3. Instruction Optimization

| Strategy | How | Impact |
|----------|-----|--------|
| Move workflows to Skills | `disable-model-invocation: true` = zero context until invoked | High |
| Keep CLAUDE.md < 500 lines | Move to `.claude/rules/` with `paths:` filter | Medium |
| Path-scoped rules | `paths: ["src/api/**/*.ts"]` = load only on match | Medium |
| Use subagent skills preload | `skills` field in agent, not main CLAUDE.md | Medium |
| Supporting files in skills | Large docs in references/, load on demand | High |

## 4. Tool & MCP Optimization

| Strategy | How | Impact |
|----------|-----|--------|
| Prefer CLI over MCP | `gh`, `aws` CLI vs MCP servers | High |
| Disable idle MCP servers | `/mcp` to check per-server cost | Medium |
| Use MCP Tool Search | Auto-defers schemas >10% context (`ENABLE_TOOL_SEARCH`) | High |
| Hooks for preprocessing | Filter data before Claude reads (e.g., grep ERROR only) | Medium |
| Limit MCP output | `MAX_MCP_OUTPUT_TOKENS=10000` | Medium |

## 5. Reasoning Optimization

| Strategy | How | Impact |
|----------|-----|--------|
| Lower effort level | `/effort low` for simple tasks | Medium |
| Set thinking budget | `MAX_THINKING_TOKENS=8000` | Medium |
| Disable adaptive thinking | `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` | Low |
| Plan mode first | Plan → approve → execute (avoid wrong-direction waste) | High |
| Fast Mode | 2.5x speed, same quality, higher cost per token | Speed (not cost) |

---

## 6. Cost Reference

| Item | Typical Cost |
|------|-------------|
| Average daily per developer | ~$6 USD |
| 90th percentile daily | ~$12 USD |
| Monthly with Sonnet | ~$100-200 |
| Background operations | <$0.04/session |
| Agent Teams | ~7x single agent |
| Code Review (Teams) | ~$15-25 per review |

### Pricing (per Million Tokens)

| Model | Input | Output |
|-------|:-----:|:------:|
| Sonnet 4.6 | $3 | $15 |
| Opus 4.6 | $15 | $75 |
| Haiku 4.5 | $0.80 | $4 |
| Fast Mode (Opus) | $30 | $150 |

### Rate Limit Recommendations (TPM per user)

| Team Size | TPM/user | RPM/user |
|-----------|:--------:|:--------:|
| 1-5 | 200k-300k | 5-7 |
| 5-20 | 100k-150k | 2.5-3.5 |
| 20-50 | 50k-75k | 1.25-1.75 |
| 50-100 | 25k-35k | 0.62-0.87 |
| 100-500 | 15k-20k | 0.37-0.47 |
| 500+ | 10k-15k | 0.25-0.35 |

---

## 7. Context Cost Comparison

| Feature | Context Cost | When Loaded |
|---------|:-----------:|-------------|
| CLAUDE.md | Every request | Session start |
| Rules (no paths) | Every request | Session start |
| Rules (with paths) | On file match | When operating on matching files |
| Skill description | Always (2% budget) | Session start |
| Skill full content | On invocation | When invoked |
| Skill (disable-model-invocation) | Zero | Only when user invokes |
| MCP tool schemas | Every request | Session start (or deferred via ToolSearch) |
| Subagent | Isolated | When spawned |
| Hook output (stdout) | Only when injected | On event trigger |
| `/btw` side question | Reuses prompt cache | On use |
| Agent Teams | ~7x main | Each teammate independent |

---

## 8. Decision Matrix: What to Use When

| Need | Best Choice | Why |
|------|-------------|-----|
| Persistent rules | CLAUDE.md | Always loaded |
| File-specific rules | `.claude/rules/` with `paths:` | Conditional loading |
| Reusable workflow | Skill + `disable-model-invocation` | Zero cost until needed |
| One-off knowledge | `/btw` side question | Reuses cache |
| Research task | Explore subagent | Isolated context |
| Multi-file changes | Agent Teams (if complex) | Parallel isolation |
| External tools | CLI > MCP (lower overhead) | Less context consumed |
| CI/CD | `claude -p --bare` | Minimal system prompt |
| Periodic checks | `/loop` (session) or cloud schedule | Automated |
| Large reference docs | Skill supporting files | On-demand loading |
