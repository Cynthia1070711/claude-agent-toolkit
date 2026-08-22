# Hook Registry — 7 Mechanized Forbidden Patterns

Mapping of 11 Forbidden Patterns (F1-F11) to mechanized enforcement hooks.
7 of 11 are hook-enforceable. Remaining 4 (F1, F4, F9, F10) require manual
review and are handled via SKILL.md anti-pattern rebuttals.

---

## Coverage matrix

| F# | Forbidden | Hook | Event | Skill |
|---|---|---|---|---|
| F1 | Wholesale copy | (manual) | — | anti-patterns AP-18/19 |
| F2 | Skip baseline | `baseline-snapshot-gate.js` | PreToolUse on `Bash` matching `git worktree add` | tianji-baseline-guard |
| F3 | Concurrent pilots | `concurrent-pilot-guard.js` | PreToolUse on `Bash` matching `git worktree add` | tianji-baseline-guard |
| F4 | Authority worship | (manual) | — | anti-patterns AP-1/2/3 |
| F5 | Permanent pilot | `pilot-timebox-monitor.js` | SessionStart | tianji-pilot-orchestrator |
| F6 | Cooldown bypass | `reject-cooldown-check.js` | UserPromptSubmit | tianji-pilot-orchestrator |
| F7 | Skip SSoT update | `ssot-sync-checker.js` | PostToolUse on `Bash` matching `git commit` | tianji-pilot-orchestrator |
| F8 | Pilot scope creep | `scope-creep-detector.js` | PostToolUse on `Edit\|Write` | tianji-pilot-orchestrator |
| F9 | Marketing as evidence | (manual) | — | anti-patterns AP-4/5/6 |
| F10 | Skip ADR / DB | (manual) | — | Phase 5 template forces |
| F11 | Skip Q4 audit | `q4-audit-gate.js` | PreToolUse on `Bash` matching `git worktree add` | tianji-baseline-guard |

---

## Hook 1 — `baseline-snapshot-gate.js` (F2)

**Event**: PreToolUse on `Bash`
**Matcher**: `git worktree add`
**Purpose**: Block worktree creation if `baseline_snapshots` row does not exist
for the inferred `external_id` (derived from worktree branch name `pilot/<id>`).

**Logic**:
1. Read stdin tool input.
2. Parse command for `pilot/<external_id>` pattern.
3. Query DB: `SELECT id FROM baseline_snapshots WHERE external_id = ?`.
4. If 0 rows → exit code 2 with stderr message.
5. If 1+ rows → exit 0 (pass).

**Skill location**: `tianji-baseline-guard/scripts/baseline-snapshot-gate.js`

---

## Hook 2 — `concurrent-pilot-guard.js` (F3)

**Event**: PreToolUse on `Bash`
**Matcher**: `git worktree add`
**Purpose**: Block new worktree creation if any pilot already active in DB.

**Logic**:
1. Query DB: `SELECT COUNT(*) FROM external_evaluations WHERE decision = 'PILOT' AND pilot_end IS NULL`.
2. If count > 0 → exit 2 with message listing active pilots.
3. Else → exit 0.

**Skill location**: `tianji-baseline-guard/scripts/concurrent-pilot-guard.js`

---

## Hook 3 — `q4-audit-gate.js` (F11)

**Event**: PreToolUse on `Bash`
**Matcher**: `git worktree add`
**Purpose**: Block worktree creation if `baseline_snapshots.audit_json` is NULL
OR audit was run > 3 days ago for the inferred `external_id`.

**Logic**:
1. Parse `external_id` from worktree branch.
2. Query DB: `SELECT audit_json, created_at FROM baseline_snapshots WHERE external_id = ?`.
3. If `audit_json IS NULL` → exit 2 with "Q4 audit missing".
4. If `created_at < now - 3 days` → exit 2 with "Q4 audit stale, re-run".
5. Else → exit 0.

**Skill location**: `tianji-baseline-guard/scripts/q4-audit-gate.js`

---

## Hook 4 — `pilot-timebox-monitor.js` (F5)

**Event**: SessionStart (matcher: `startup|resume`)
**Purpose**: On session start, scan DB for pilots past their timebox and surface
warning via `additionalContext`.

**Logic**:
1. Query DB for pilots where `julianday('now') - julianday(pilot_start) > pilot_timebox_days`.
2. If any rows → emit `hookSpecificOutput.additionalContext` listing them.
3. Exit 0 (advisory, not blocking).

**Skill location**: `tianji-pilot-orchestrator/scripts/pilot-timebox-monitor.js`

---

## Hook 5 — `reject-cooldown-check.js` (F6)

**Event**: UserPromptSubmit
**Purpose**: Scan user's prompt for mentions of `external_id`s currently in
REJECT cooldown.

**Logic**:
1. Read stdin (user prompt).
2. Query DB for all `external_id` with active cooldown:
   `SELECT bs.external_id FROM external_evaluations ee JOIN baseline_snapshots bs ON bs.id = ee.baseline_id WHERE ee.decision = 'REJECT' AND ee.cooldown_until > date('now')`.
3. For each `external_id`, case-insensitive substring match against prompt.
4. If match → emit `additionalContext` with reject_reason + cooldown_until.
5. Exit 0 (advisory).

**Skill location**: `tianji-pilot-orchestrator/scripts/reject-cooldown-check.js`

---

## Hook 6 — `ssot-sync-checker.js` (F7)

**Event**: PostToolUse on `Bash`
**Matcher**: `git commit`
**Purpose**: On a commit that completes pilot integration, verify SSoT files
were updated in the same commit.

**Logic**:
1. Detect "integration completion" commit: commit message contains `tianji:`
   tag OR pilot worktree merge.
2. Query DB for the corresponding `ssot_updates_json` (planned updates).
3. Get `git diff --name-only HEAD~1..HEAD` for actual changes.
4. Compare: planned files ∈ actual files?
5. If any planned file missing from actual → emit `additionalContext` warning
   listing them.
6. Exit 0 (advisory).

**Skill location**: `tianji-pilot-orchestrator/scripts/ssot-sync-checker.js`

---

## Hook 7 — `scope-creep-detector.js` (F8)

**Event**: PostToolUse on `Edit|Write`
**Purpose**: When Edit/Write happens inside a `pilot/*` worktree, verify the
target file is within the pilot's spec-lite scope.

**Logic**:
1. Read stdin, parse `tool_input.file_path`.
2. Check if current working directory is a `pilot/*` worktree (via
   `git worktree list`).
3. If yes, lookup spec-lite scope for that pilot in DB:
   `SELECT scope_in_scope_paths FROM external_evaluations WHERE pilot_worktree = ?`.
4. If file_path is OUTSIDE any in-scope path → emit `additionalContext`
   warning with the in-scope list.
5. Update DB: `scope_creep_detected = 1` if outside-scope edit occurred.
6. Exit 0 (advisory).

**Skill location**: `tianji-pilot-orchestrator/scripts/scope-creep-detector.js`

---

## Bonus hook — `impulse-cooldown-guard.js` (Principle 1.1)

**Event**: PreToolUse on `Bash`
**Matcher**: `git worktree add`
**Purpose**: Block worktree creation if baseline is impulse-triggered and
3-day cold-storage has not elapsed.

**Logic**:
1. Parse `external_id` from worktree branch.
2. Query DB:
   `SELECT trigger_type, cold_storage_until FROM baseline_snapshots WHERE external_id = ?`.
3. If `trigger_type = 'impulse' AND cold_storage_until > date('now')` → exit 2.
4. Else → exit 0.

**Skill location**: `tianji-baseline-guard/scripts/impulse-cooldown-guard.js`

---

## Installation (settings.json)

Add this block to `.claude/settings.json` after applying all skills:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-baseline-snapshot-gate.js\"", "timeout": 3000 },
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-concurrent-pilot-guard.js\"", "timeout": 3000 },
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-q4-audit-gate.js\"", "timeout": 3000 },
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-impulse-cooldown-guard.js\"", "timeout": 3000 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-scope-creep-detector.js\"", "timeout": 3000 }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-ssot-sync-checker.js\"", "timeout": 5000 }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-pilot-timebox-monitor.js\"", "timeout": 5000 }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/tianji-reject-cooldown-check.js\"", "timeout": 3000 }
        ]
      }
    ]
  }
}
```

Hook file names prefixed `tianji-` to namespace and avoid collision with
existing hooks.

After updating settings.json, run `/clear` or restart CLI for hooks to take
effect (per Claude Code Bug #8 — hooks are snapshot at session start).

---

## Verification

Each hook's installation can be verified by:

```bash
# Inside Claude Code
/hooks

# Should list each tianji-* hook under its event with count = 1
```

Run a known-failing scenario:

```bash
# This should be blocked because no baseline exists yet
git worktree add ../pilot-test -b pilot/nonexistent-test
# Expected: stderr from baseline-snapshot-gate.js, exit code 2
```

---

## Hook output format conventions

All Tianji hooks follow these conventions:

1. **stdin**: Standard Claude Code hook stdin format (JSON with `tool_name`,
   `tool_input`, `hook_event_name`, etc.).
2. **stdout**: Either empty (silent pass) or JSON with
   `hookSpecificOutput.additionalContext`.
3. **stderr**: Human-readable diagnostic for exit code 2 (blocking).
4. **Exit codes**:
   - `0` = pass (allow tool call) or advisory complete
   - `2` = block (only PreToolUse hooks should use this)
5. **additionalContext format**: factual statements, not commands. Per
   Claude Code Bug #7, command-form context gets surfaced to user.
6. **Graceful DB failures**: If DB unavailable, hook logs warning to stderr
   and exits 0 (do not block on infrastructure issue).
