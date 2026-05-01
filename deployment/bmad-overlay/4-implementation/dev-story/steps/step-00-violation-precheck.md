---
name: 'step-00-violation-precheck'
description: 'Workflow Entry Gate — Force Read top-3 hot violation rules before entering dev-story workflow'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-00-violation-precheck.md'
nextStepFile: '{workflow_path}/steps/step-00-db-first-query.md'
---

# Step 0 — Violation Pre-check Gate (Workflow Entry Gate)

**Goal:** Internalize the top-3 most-violated rules in the last 30 days **before** beginning dev-story work, by mandatory `Read` of each rule file.

**Why this gate exists:** Layer 11 of `pre-prompt-rag.js` (Story `td-rule-violation-rag-inject`) auto-injects the top-5 violation summary every prompt — but Agents may scan-without-Read, becoming habituated to the signal. This pre-check forces explicit Read evidence: `Read` tool_use blocks for each hot rule MUST appear in the assistant message before any other tool call. The injected summary tells you "hot rules exist"; this gate ensures you "actually read their content".

**Architecture role:** Workflow Entry Gate sits **outside** the L1-L5 anti-recidivism chain as the workflow-entry complement. Existing chain: L1 Observer (Stop hook auto-detect, `detect-rule-violation-hint.js`) → L2 Collector (`log-rule-violation.js`) → L3 Transmitter (`query-violations.js` / DevConsole / MCP) → L4 Consumer (`pre-prompt-rag.js` Layer 11 auto-inject) → L5 Exit-gate (workflow archive self-audit). The Entry Gate fires **before** L1 Observer can fire (no assistant message exists yet at workflow entry), forcing rule internalization at the moment of greatest plasticity. See `memory/reference_rule_violation_tracker.md`.

**Phase scope:** `dev-story`. Companion gate at `code-review/steps/step-00-violation-precheck.md` covers the CR phase.

---

## STATE VARIABLES (set in this step)

- `{precheck_phase}` = `dev-story` (hardcoded — phase identity is static per workflow)
- `{precheck_top_rules}` — array of top-3 hot rule paths from CLI output
- `{precheck_violation_count}` — `stats.total_30d_rolling` from CLI output

---

## EXECUTION SEQUENCE

### 1. Query top-3 dev-story violations (30d rolling)

Run from repo root:

```bash
cd .context-db && node scripts/query-violations.js --phase dev-story --since-days 30 --format json --limit 3
```

Parse the JSON output and capture:

- `stats.total_30d_rolling` → `{precheck_violation_count}`
- `stats.by_rule[]` → `{precheck_top_rules}` (each entry has `{rule, count, last_timestamp}`, sorted desc by count)

**Fail-open mode:** If the script exits non-zero (DB missing, parse error, schema mismatch), emit `⚠ Pre-check skipped (CLI error: <stderr>)` and proceed directly to `step-00-db-first-query.md`. The gate is a quality nudge, not a hard block — telemetry infrastructure unavailability must not block work.

### 2. Branch on violation count

**If `{precheck_violation_count} == 0`:**

Output exactly:
```
✅ Pre-check passed: no dev-story violations in 30d rolling window
```

Then proceed directly to `step-00-db-first-query.md`. No Read required.

**Else (≥ 1 violation):**

Continue to Step 3 (Mandatory Read).

### 3. Mandatory Read of top-3 hot rules

For each entry in `{precheck_top_rules}` (up to the first 3), invoke the `Read` tool with the rule path as `file_path`. Example:

```
Read({ file_path: "<repo-root>/<rule-1>" })
Read({ file_path: "<repo-root>/<rule-2>" })
Read({ file_path: "<repo-root>/<rule-3>" })
```

> **CRITICAL:** You MUST issue these `Read` tool calls **before any other tool call**. The Read evidence is required so the rule content actually enters your context window. Skim-without-Read defeats the L1 gate.

**Path resolution (`memory/*.md` semantic):** Rule paths starting with `memory/` (e.g., `memory/feedback_db_first_no_md_mirror.md`) resolve **not** to `<repo-root>/memory/` (which holds only 9 deprecated files) but to the Claude Code CLI user-profile auto-memory directory (`C:/Users/<user>/.claude/projects/<project-hash>/memory/` on Windows; `~/.claude/projects/<project-hash>/memory/` on Unix). Try this fallback when repo-relative Read fails. The user-profile auto-memory layer is also auto-injected via `MEMORY.md` into every session's system context — if repo-relative Read misses and user-profile Read also misses, check whether the content already entered context via MEMORY.md pointer before declaring missing.

**Missing file handling:** If a rule path resolves to a missing file in both locations (renamed/moved/deleted and absent from auto-memory), record the missing path in plain text and continue with the remaining rules. Do not block on a single missing path — orphan paths in the violation log indicate stale telemetry, not a workflow blocker.

### 4. Acknowledge

After all Reads are complete, emit a single plain-text acknowledgement line of the form:

```
✅ Pre-check passed: <rule1.basename>, <rule2.basename>, <rule3.basename> internalized
```

Where `<basename>` is the file's base filename (no directory prefix). Example:

```
✅ Pre-check passed: feedback_cr_must_try_fix_before_defer.md, skill-sync-gate.md, constitutional-standard.md internalized
```

Only after this acknowledgement may the workflow proceed to `step-00-db-first-query.md`.

---

## SUCCESS METRICS

- `query-violations.js` was invoked with `--phase dev-story --since-days 30 --format json --limit 3`
- `{precheck_violation_count}` and `{precheck_top_rules}` set from JSON output
- For each rule in `{precheck_top_rules}` (or `0`-violations short-circuit fired), a corresponding `Read` tool call was issued (or skipped per branch logic)
- An acknowledgement line of the form `✅ Pre-check passed: ...` was emitted

## FAILURE MODES

- Bypassing Read by claiming "I already know these rules" — defeats the L1 gate, since rule content does not enter the context window
- Reading only one rule when 3 are returned — partial Read still counts as bypass
- Issuing other tool calls (e.g., search_stories, Bash, Glob, Edit) before completing the Reads — the gate must be the first action sequence
- Modifying the JSON output (truncating, picking a "preferred" subset) — the CLI's `--limit 3` already enforces the bound
- Skipping the acknowledgement line — downstream auditing relies on the literal `✅ Pre-check passed:` marker

---

**NEXT:** Load `step-00-db-first-query.md`
