# phycool-debt-registry — User Stories

> Source stories that define this Skill's requirements and patterns.

## Foundation

**Architecture migration date**: 2026-03-17
- Migrated from `registry.yaml` + `.debt.md` sidecar to DB-first `tech_debt_items` table
- Current DB: `.context-db/phycool.db` with 480+ entries

## Related Stories

| Story/Task | Contribution |
|-----------|-------------|
| TD-20 | Initial debt registry design + upsert-debt.js CLI creation |
| TD-22~26 | Doc sync workflow integration, Pull mode automation |
| TD-28 | Epic Closing Audit workflow integration |

## Workflow Integration Points

All three modes (Push/Pull/Audit) are embedded in the BMAD workflows:

| Workflow | Mode | Step |
|----------|------|------|
| `code-review` | Push | Step 4 — after auto-fix, classify and write remaining issues |
| `create-story` | Pull | Step 1 — inject prior debt into Dev Notes |
| `dev-story` | Pull | Step 1 — show prior debt before implementation |
| `retrospective` | Audit | Epic closing — full debt audit report |
| `party-mode` | Audit | On-demand debt discussion |

## Known Issue Patterns (from KB)

| KB ID | Pattern | Prevention |
|-------|---------|-----------|
| KB-workflow-003 | WON'T FIX misclassification | Items "out of scope" = DEFERRED, not WON'T FIX |
| KB-workflow-005 | Wrong Epic routing | Debt must stay in original Epic, not routed to TD |
