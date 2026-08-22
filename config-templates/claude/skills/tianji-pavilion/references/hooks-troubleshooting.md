# Troubleshooting — tianji-baseline-guard

When a `git worktree add -b pilot/<id>` command is blocked or behaves
unexpectedly, work through this flow.

## Symptom: hook never fires

Run `/hooks` inside Claude Code. Expected output includes four `tianji-*`
commands under `PreToolUse → Bash`.

If missing:
1. Verify `.claude/settings.json` has the entries from
   `assets/settings-snippet.json`.
2. JSON must be valid — run `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`.
3. Run `/clear` or restart CLI. Hooks are snapshotted at session start
   (Claude Code Bug #8).
4. Verify the hook files exist at the path used in settings.json.
   Default: `.claude/hooks/tianji-*.js`.

## Symptom: hook fires but always soft-skips

Each hook prints to stderr when it skips. Look for:

```
[tianji-hook] better-sqlite3 unavailable or DB corrupt: ...
```

→ `better-sqlite3` is not installed in the project's node_modules.
Run `npm install better-sqlite3` in the project root.

```
[tianji] skipped (context-db unavailable; cannot enforce F2)
```

→ `.context-db/context.db` does not exist or `$CLAUDE_PROJECT_DIR` is not
set. Verify the env var, then ensure the DB has been initialised:

```
node .claude/skills/tianji-pavilion/scripts/db-patch-init-db.js apply
```

## Symptom: F2 blocks but baseline DOES exist

The baseline external_id must match exactly. The hook extracts the id from
the branch name:

| Command | Extracted external_id |
|---|---|
| `git worktree add ../wt -b pilot/awesome-rules` | `awesome-rules` |
| `git worktree add ../wt -B pilot/foo-bar` | `foo-bar` |
| `git worktree add ../wt -b feature/x` | (none — hook skips) |

If your baseline row has a different `external_id`, either rename the
branch or update the row:

```sql
UPDATE baseline_snapshots SET external_id = 'awesome-rules' WHERE id = 42;
```

## Symptom: F3 blocks but no pilot is "really" active

Check what the DB thinks:

```sql
SELECT bs.external_id, ee.pilot_start, ee.pilot_timebox_days, ee.pilot_worktree
  FROM external_evaluations ee
  JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
 WHERE ee.decision='PILOT' AND ee.pilot_end IS NULL;
```

If a stale "active" pilot is listed (e.g., the worktree was deleted
manually), close it properly:

```sql
UPDATE external_evaluations
   SET pilot_end = date('now'),
       updated_at = CURRENT_TIMESTAMP
 WHERE id = <stale_id>;
```

Document the closure in Phase 5 ADR — even an abandoned pilot is a data
point per Principle 5.

## Symptom: F11 blocks claiming Q4 audit is stale

The threshold is 3 days. To re-run the audit:

```
node .claude/skills/tianji-pavilion/scripts/audit-capability-reachability.cjs \
     --external-id <id>
```

Then update the row:

```sql
UPDATE baseline_snapshots
   SET audit_json = '<new JSON>',
       q4_audit_score = <score>,
       q4_feature_match_pct = <pct>,
       q4_verdict = '<verdict>',
       updated_at = CURRENT_TIMESTAMP
 WHERE external_id = '<id>';
```

## Symptom: impulse-cooldown blocks but I have new evidence

The cold-storage window is 3 days from `first_seen_date`. If you genuinely
have new structural evidence (not just renewed enthusiasm), reset the
trigger type and start a new evaluation:

```sql
UPDATE baseline_snapshots
   SET trigger_type = 'pain',         -- or 'quarterly' / 'active_monitor'
       cold_storage_until = NULL,
       updated_at = CURRENT_TIMESTAMP
 WHERE external_id = '<id>';
```

Record in Phase 5 ADR why the trigger reclassification was warranted. If
this happens more than once for the same resource, it is itself a signal
that the user's evaluation discipline needs review (see anti-pattern
AP-7 in tianji-pavilion).

## Bypass for genuine emergencies

There is no built-in bypass flag. Bypass is intentional friction.

If a true emergency requires bypassing F3 (e.g., a production fire requires
a hot-fix pilot while another pilot is open), comment out the offending
hook in `.claude/settings.json`, document the override in a commit message
tagged `tianji-override:`, then restore the hook in the same session.

The override commit shows up in `git log --grep='tianji-override'`, making
audit straightforward.
