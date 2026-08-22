# phycool-doc-sync — User Stories

> Source stories that define this Skill's requirements and patterns.

## Foundation Stories

| Story | Contribution |
|-------|-------------|
| TD-20 | Initial doc sync workflow + code-doc mapping table |
| TD-22 | database-schema.md v3 update (major schema sync) |
| TD-23 | project-context.md QGR comprehensive update |
| TD-24 | Architecture docs sync (platform-services, auth-payment) |
| TD-25 | Technical specs sync (error-codes, security-spec) |
| TD-26 | Testing strategy doc sync |
| TD-28 | Epic Closing Audit workflow (last_synced_epic scanning) |

## Key Sync Events

| Date | Event | Docs Updated |
|------|-------|-------------|
| 2026-03-07 | QGR Epic completion | project-context.md, 8 architecture docs |
| 2026-03-17 | Tech debt registry migration | architecture/platform-services.md |
| 2026-03-28 | Skill English rewrite batch | all phycool-* skills last_synced_epic |

## Common Sync Debt Patterns

Based on past TD stories, these are the most frequently missed syncs:

1. **New Migration without DB schema update** — P0, happens in nearly every Epic
2. **New Service without architecture doc update** — P1, often missed during dev
3. **Epic completion without project-context.md update** — P1, manual step forgotten
4. **Skill last_synced_epic not bumped** — Caught by TD-28 audit workflow
