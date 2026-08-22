---
name: phycool-doc-sync
description: >
  PhyCool Platform document synchronization standard. Covers code-change to doc
  impact mapping, update checklists (DB Schema/Architecture/Tech Specs), doc
  freshness threshold (2-week rule), last-updated source recording, and Skill
  last_synced_epic tracking.
  Trigger keywords: doc sync, document sync, schema update, architecture docs,
  spec update, outdated docs, doc freshness, TD-22, TD-24, TD-25, last_synced_epic,
  doc_index, scan-doc-index, document_chunks, document_embeddings, FTS5
version: 1.2.1
updated: 2026-04-05
disable-model-invocation: true
last_synced_epic: epic-pcpt-ca
last_synced_date: 2026-04-05
watches:
  - glob: "docs/project-planning-artifacts/**/*.md"
    domain: docs
  - glob: "docs/implementation-artifacts/**/*.md"
    domain: docs
triggers:
  - doc sync
  - schema update
  - architecture doc
  - last_synced_epic
author: CC-OPUS
created: 2026-03-11
---

# PhyCool Document Sync Standard

**Source**: TD-22~26 document sync work experience

## Not For
- Skill content sync updates (use `/saas-to-skill` Mode B)
- Tech debt tracking (use `/phycool-debt-registry`)
- Code quality review (use `/phycool-review-analyst`)

---

## 1. Code Change → Doc Impact Mapping

| Code Change | Docs to Update | Priority |
|-------------|---------------|----------|
| New EF Migration | `database-schema.md` | P0 |
| New Model / Entity | `database-schema.md` + `architecture/*.md` | P0 |
| New API endpoint | `architecture/platform-services.md` | P1 |
| New BackgroundService | `architecture/platform-services.md` | P1 |
| New SignalR Hub | `architecture/platform-services.md` | P1 |
| New Auth/Identity logic | `architecture/auth-payment.md` | P1 |
| New Payment/Webhook logic | `architecture/auth-payment.md` | P1 |
| New PDF generation logic | `architecture/pdf-worker.md` | P1 |
| New Canvas/Editor logic | `architecture/editor-canvas.md` | P1 |
| New Error Code | `technical-specs/error-codes.md` | P1 |
| Security config change | `technical-specs/security-spec.md` | P1 |
| Test strategy change | `technical-specs/testing-strategy.md` | P2 |
| Epic completion | `project-context.md` | P1 |
| New frontend telemetry (App Insights SDK) | `architecture/*.md` (relevant module) | P2 |
| New Middleware (RequestTiming, SecurityHeaders, etc.) | `architecture/platform-services.md` | P1 |
| RBAC rule change (AdminPermission, role matrix) | `architecture/auth-payment.md` | P1 |

---

## 2. Doc Location Reference

| Document | Path |
|----------|------|
| DB Schema | `docs/project-planning-artifacts/technical-specs/database-schema.md` |
| Architecture — Platform Services | `docs/project-planning-artifacts/architecture/platform-services.md` |
| Architecture — Auth & Payment | `docs/project-planning-artifacts/architecture/auth-payment.md` |
| Architecture — PDF Worker | `docs/project-planning-artifacts/architecture/pdf-worker.md` |
| Architecture — Editor | `docs/project-planning-artifacts/architecture/editor-canvas.md` |
| Error Codes | `docs/project-planning-artifacts/technical-specs/error-codes.md` |
| Security Spec | `docs/project-planning-artifacts/technical-specs/security-spec.md` |
| Testing Strategy | `docs/project-planning-artifacts/technical-specs/testing-strategy.md` |
| Project Context | `docs/project-context.md` |

---

## 3. Context Memory Document Infrastructure (Phase 4+5)

The document sync target has expanded significantly beyond static Markdown files. Context Memory DB now holds **42 tables** across 5 Phases (was ~30 in Phase 1-3), with **12 FTS5 indexes** and **19 MCP Tools**.

### Document-Specific Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `doc_index` | Document metadata registry | `file_path`, `category`, `checksum`, `last_indexed_at` |
| `document_chunks` | H2-level chunking for RAG retrieval | `heading_path` breadcrumb, `is_stale` marker, `chunk_text` |
| `document_embeddings` | ONNX local embedding vectors | all-MiniLM-L6-v2 model, 384-dimension vectors |

### Phase 4 Tables (Auto-Managed by Hooks)

| Table | Write Mechanism | Read Mechanism |
|-------|----------------|----------------|
| `embedding_queue` | PostToolUse `observe-pattern.js` (auto) | Stop `incremental-embed.js` (auto) |
| `pattern_observations` | PostToolUse `observe-pattern.js` (auto) | `get_patterns` MCP Tool / DevConsole |

### Phase 5 Extended Tables

| Table | Purpose | Write | Read |
|-------|---------|-------|------|
| `glossary` | Unified terminology | Direct script / future MCP | `search_glossary` MCP Tool |
| `workflow_executions` | Workflow tracking | `log_workflow` MCP Tool | DevConsole `/schema` |
| `benchmarks` | Performance baselines | `upsert_benchmark` MCP Tool | DevConsole `/schema` |
| `test_journeys` | E2E test routes | E2E workflow | DevConsole `/schema` |
| `test_traceability` | AC-to-Test mapping | `testarch-trace` workflow | DevConsole `/schema` |

### Scheduled Maintenance (Document Index Freshness)

| Script | Schedule | Purpose |
|--------|----------|---------|
| `scan-doc-index.js` | Daily 03:00 | Re-index new/modified documents, update `doc_index` checksums, mark stale `document_chunks` |
| `validate-data.js` | Weekly Sun 04:00 | Cross-validate DB integrity (orphan references, FTS5 consistency) |
| `cleanup-orphans.js` | Monthly 1st 05:00 | Remove orphan chunks/embeddings where source doc no longer exists |

### Doc Sync Implications

When updating Markdown documents (Section 1 mapping), the `scan-doc-index.js` pipeline will auto-detect changes within 24 hours. For immediate re-indexing after a major doc update:

```bash
node .context-db/scripts/scan-doc-index.js --path "docs/project-planning-artifacts/"
```

> **Cross-reference**: Full DB schema and MCP Tool specs in `phycool-context-memory` Skill.

---

## 4. Update Checklists

When a Story involves the following, update the corresponding docs:

```yaml
DB_SCHEMA_UPDATE:
  trigger: New/modified EF Core Migration or Entity
  checklist:
    - [ ] Update database-schema.md entity definition table
    - [ ] Update ER diagram (if visualized)
    - [ ] Record last update source: Migration name + Story ID

ARCHITECTURE_UPDATE:
  trigger: New service, Hub, Controller, or architectural pattern change
  checklist:
    - [ ] Update relevant architecture/*.md service description
    - [ ] Update interface diagram (if present)
    - [ ] Record last update source: Story ID + date

PROJECT_CONTEXT_UPDATE:
  trigger: Epic completion or major architectural decision
  checklist:
    - [ ] Update project-context.md Epic progress section
    - [ ] Update "current work" description
    - [ ] Record major architectural decision summary
```

---

## 5. Last-Updated Source Recording Format

Each document top or section end should record:

```markdown
<!-- Last updated: v3.0 | 2026-03-07 | Source: TD-22 database-schema-v3-update -->
```

Format: `version | date | source Story`

---

## 6. Doc Freshness Threshold

### Decision Logic

```
Freshness threshold: 2 weeks (14 days)

If Migration date > Doc last-updated date + 14 days
  -> Mark as "doc outdated", needs sync
```

### Manual Scan

```bash
# Find recent Migration dates
ls docs/implementation-artifacts/stories/epic-*/  # recently completed Stories

# Compare with doc last-updated dates
grep -r "Last updated" docs/project-planning-artifacts/
```

---

## 7. Skill Freshness Management (last_synced_epic)

Every `phycool-*` Skill frontmatter records:

```yaml
last_synced_epic: epic-pcpt-ca
last_synced_date: 2026-04-05
```

- Epic Closing Audit (TD-28) scans this field to identify Skills needing updates
- After a new Epic completes, related Skills must update `last_synced_epic`

---

## 8. KB Upgrade Scan (Epic Audit Integration)

During Epic audit (TD-28 Workflow), scan KB entries with `occurrences >= 3`:

```bash
grep -r "occurrences: [3-9]\|occurrences: [0-9][0-9]" docs/knowledge-base/troubleshooting/
```

Matched entries should be promoted to Skill FORBIDDEN rules or references/ documents.
After promotion, update entry status:
```yaml
status: resolved-by-skill
resolved_in: phycool-doc-sync v{version} FORBIDDEN rule #{n}
```

---

## 9. FORBIDDEN

```yaml
FORBIDDEN:
  - Adding Migration without updating database-schema.md
  - Doc top missing last-updated source record
  - Epic completion without updating project-context.md
  - Closing Epic without updating Skill last_synced_epic
  - Doc freshness exceeding 2 weeks without action
```

---

## Troubleshooting Reference

Scan `docs/knowledge-base/troubleshooting/workflow/` before starting any task.
Search by: frontmatter `related_skills` containing `phycool-doc-sync`.
