# phycool-debt-registry — Entry Lifecycle

> Complete lifecycle of a tech debt entry from creation to resolution.

## Entry State Machine

```
[code-review discovers issue]
          |
          | Cannot fix now?
          v
    +----------+
    |  pending  |  <- DEFERRED, written to DB by upsert-debt.js
    +----------+
          |
          | Target story starts dev?
          v
    Dev Notes injected (Pull mode)
          |
          | Fix implemented + verified?
          v
    +----------+
    |  fixed    |  <- upsert-debt.js --resolve TD-xxx --by {agent} --in {story}
    +----------+

    OR

    +------------+
    | wont_fix   |  <- terminal state, written with wont_fix_reason
    +------------+
```

## Push Protocol (code-review)

After code-review Step 4 auto-fix completes:

1. Collect all non-FIXED issues
2. For each issue, force-classify:
   - DEFERRED: write to DB with `status: pending`, must have `target_story`
   - WON'T FIX: write to DB with `status: wont_fix`, must have `wont_fix_reason`
3. Update source Story's `## Tech Debt` table with TD-xxx IDs
4. Update Story H1 emoji via `/story-status-emoji` Mode A

## Pull Protocol (dev-story / create-story)

Before starting implementation:

1. `search_debt({ target_story: "{current_story_id}", status: "pending" })`
2. Inject found entries into Story Dev Notes
3. Add debt fix tasks to Story task list

## Resolve Protocol

When target story code-review confirms debt is fixed:

```bash
node .context-db/scripts/upsert-debt.js \
  --resolve TD-031 \
  --by CC-SONNET \
  --in rev1-payment-subscription
```

This auto-sets: `status=fixed`, `resolved_at` (UTC+8), `resolved_by`, `resolved_in_story`

## Production Gate Check

```bash
# Check pending debt count before production
node .context-db/scripts/upsert-debt.js --stats --epic qgr

# Or via MCP
search_debt({ status: "pending", include_stats: true })
```

Gate thresholds:
- `pending <= 15` (tech-debt-limit gate)
- `pending + severity=CRITICAL == 0` (zero-critical-debt gate)
