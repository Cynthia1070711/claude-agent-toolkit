# phycool-doc-sync — Sync Lifecycle

> Complete document synchronization lifecycle within a Story and Epic context.

## Per-Story Sync Lifecycle

```
Story Development (dev-story)
          |
          | Code changes detected?
          v
  Skill triggers code-doc mapping table
          |
          +-- P0: Migration/Entity change
          |       -> database-schema.md MUST update
          |
          +-- P1: Service/Hub/Controller change
          |       -> architecture/*.md MUST update
          |
          +-- P2: Test/Config change
                  -> technical-specs/*.md SHOULD update
          |
          v
  Update doc with last-updated tag:
  <!-- Last updated: v{ver} | {date} | Source: {story_id} -->
```

## Per-Epic Sync Lifecycle (TD-28 Audit)

```
Epic completion signal
          |
          v
  Scan all phycool-* Skills
          |
          +-- last_synced_epic != current epic?
          |       -> Flag for update
          |
          +-- last_synced_date > 14 days before most recent Migration?
                  -> Flag as "doc outdated"
          |
          v
  Generate Skill Impact Report
          |
          v
  Execute /saas-to-skill Mode B for each outdated Skill
          |
          v
  Update last_synced_epic + last_synced_date
```

## Freshness Check Commands

```bash
# Check most recent Migration date
ls -lt src/YourApp/Web/Data/Migrations/ | head -5

# Find docs with old last-updated dates
grep -rn "Last updated" docs/project-planning-artifacts/ | sort -t'|' -k2

# Scan Skills with old last_synced_date
grep -r "last_synced_date" .claude/skills/phycool-*/SKILL.md | sort -t':' -k3
```

## Doc Staleness Severity

| Staleness | Action |
|-----------|--------|
| 0-7 days | Acceptable |
| 7-14 days | Warning, plan update |
| 14+ days | P0 — must update before Epic close |
| Epic not recorded | P0 — structural gap |
