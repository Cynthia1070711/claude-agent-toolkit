# Hook Output Contracts — tianji-pilot-orchestrator

Spec for what each in-flight hook emits and how Claude is expected to react.

These hooks are advisory. They never exit 2 (block). They emit
`hookSpecificOutput.additionalContext` so Claude receives diagnostics
inline and can surface them to the user proactively.

---

## pilot-timebox-monitor (F5)

**Fires on**: SessionStart, matcher `startup|resume`

**Stdin**: minimal session metadata.

**Output (no active pilots)**: silent exit 0. Nothing emitted.

**Output (active pilots exist)**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "[tianji] N active pilot(s):\n  - <id>: X.Yd elapsed / Zd timebox  (on track | ⚠ OVERDUE)\n  ...\n\nM pilot(s) past timebox — Phase 4 requires integrate-or-rollback decision NOW. F5 violation if left unresolved."
  }
}
```

**Expected Claude behaviour**:
1. In the first turn of the session, mention overdue pilots before
   responding to whatever the user asks.
2. If the user is mid-flow on a different task, ask whether to switch
   focus to closing the overdue pilot first.
3. Do NOT silently accept an overdue pilot. Per Principle 5, even a
   "let it run another week" decision must be recorded as a deliberate
   choice with rationale.

---

## reject-cooldown-check (F6)

**Fires on**: UserPromptSubmit

**Stdin**: `{ prompt: "<user's message>", ... }`

**Output (no match)**: silent exit 0.

**Output (cooldown match)**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[tianji] F6 cooldown warning — user prompt references N REJECTed resource(s):\n\n  • <id> (<type>)\n    Rejected reason: <reason>\n    Cooldown until: <date>\n    Re-eval allowed only if: <condition>\n\nClaude: surface this to the user before proceeding..."
  }
}
```

**Expected Claude behaviour**:
1. Before answering the user's actual question, surface the cooldown.
   Format: brief restatement of what was rejected + when + why.
2. Ask the user whether the re-eval trigger condition is met.
3. If yes, instruct user to clear cooldown via DB UPDATE and proceed.
4. If no, refuse the implicit ask and propose alternative paths.

Tone: collaborative, not gatekeeping. The user may have legitimately
forgotten the prior decision; the hook is a memory aid.

---

## ssot-sync-checker (F7)

**Fires on**: PostToolUse, matcher `Bash`, command contains `git commit`

**Stdin**: `{ tool_input: { command: "git commit ..." }, cwd: "...", ... }`

**Output (not tianji-tagged commit)**: silent exit 0.

**Output (no plan recorded)**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[tianji] F7 advisory — commit references \"<id>\" but no ssot_updates_json recorded. Confirm ADR + CHANGELOG + dependency manifest were updated."
  }
}
```

**Output (planned files missing from commit)**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[tianji] F7 violation — pilot \"<id>\" integration commit is missing planned SSoT updates:\n  - <path>\n  - <path>\n\nAction: amend or add follow-up commit to update these files..."
  }
}
```

**Expected Claude behaviour**:
1. After the commit completes, surface the missing SSoT files in the
   next response.
2. Offer to draft a follow-up commit updating them (or to amend if
   the commit hasn't been pushed).
3. Do NOT proceed to the next task until the user confirms the SSoT
   gap will be closed.

---

## scope-creep-detector (F8)

**Fires on**: PostToolUse, matcher `Edit|Write|MultiEdit`

**Stdin**: `{ tool_input: { file_path: "..." }, cwd: "...", ... }`

**Output (cwd not a pilot worktree, OR file in-scope)**: silent exit 0.

**Output (out-of-scope edit inside pilot worktree)**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[tianji] F8 advisory — edit to \"<path>\" is outside declared scope for pilot \"<id>\".\nIn-scope paths: <list>\nscope_creep_detected has been flagged in DB. Phase 5 ADR must explain why the scope widened, or this pilot's outcome attribution is suspect."
  }
}
```

**Side-effect**: `external_evaluations.scope_creep_detected = 1` is set in
DB. This persists even if Claude ignores the advisory.

**Expected Claude behaviour**:
1. In the next response, acknowledge the scope expansion.
2. Ask the user one of:
   - "Should we revert this edit and stay in scope?"
   - "Should we expand the spec-lite scope and re-baseline?"
   - "Was this incidental (e.g. fixing a related typo)?"
3. Persist the user's answer in the spec-lite scope or via a Phase 5
   ADR addendum.

Important: scope_creep_detected stays at 1 even after acknowledgement.
The flag's purpose is to make Phase 5 review aware that this pilot's
post-pilot indicator delta may have incidental causes. Resetting it
should require deliberate DB UPDATE with rationale logged.

---

## Common gotchas

### Hooks fire but additionalContext doesn't reach Claude
The output JSON must be on stdout (not stderr), must be a single JSON
object, and must NOT be wrapped in markdown code fences. Test with:

```powershell
echo '{"tool_input":{"command":"git commit -m \"tianji: integrate test\""},"cwd":"."}' | node .claude/hooks/tianji-ssot-sync-checker.js
```

Expected: either empty output or a single JSON object printed to stdout.

### F5 surfaces an old pilot that I "rolled back"
"Rolled back" likely means the worktree was deleted but `pilot_end` was
never set. Use the UPDATE in troubleshooting (tianji-baseline-guard) to
properly close the row.

### F8 fires on files I expected to be in scope
Check `scope_in_scope_paths` for the pilot:

```sql
SELECT scope_in_scope_paths FROM external_evaluations
 WHERE pilot_worktree = '<path>' AND pilot_end IS NULL;
```

The hook matches against this list with path-prefix semantics. If `src/foo`
is listed and you edit `src/foo/bar.ts`, that's in-scope. If you edit
`src/baz.ts`, that's out-of-scope. To widen scope, UPDATE the column
deliberately and log the widening in a Phase 5 ADR addendum.
