# Existing-Capability Activation Plan — `{external_id}`

> Produced when Phase 0 Q4 verdict = "Activate existing — REJECT external".
> Replaces `benchmark-report.md` and subsequent phases for this evaluation.
> File path: `docs/tianji/activations/{YYYY-MM-DD}-{external_id}.md`

---

## Context

Phase 0 Q4 audit determined existing capability already covers ≥70% of the pain
addressed by `{external_id}`. This document specifies how to **activate** that
latent capability rather than integrate the external resource.

- **Pain (Q2)**: `{q2_pain}`
- **audit_score**: `{audit_score}` (≥ 0.70 threshold met)
- **feature_match_pct**: `{feature_match_pct}` (≥ 70 threshold met)

## Latent capability inventory

Capabilities currently underused that solve the pain. Pulled from
`audit-capability-reachability.cjs` output.

| Capability type | Name | Current invocation hits | Coverage of pain |
|---|---|---|---|
| MCP tool | `{tool_1}` | skill=`{n}` bmad=`{n}` deploy=`{n}` infra=`{n}` | `{pct}%` |
| DB table | `{table_1}` | skill=`{n}` bmad=`{n}` deploy=`{n}` infra=`{n}` | `{pct}%` |
| RAG Layer | `{layer_1}` | skill=`{n}` bmad=`{n}` deploy=`{n}` infra=`{n}` | `{pct}%` |

## Activation plan

What changes are needed to **invoke** these latent capabilities from production
workflows?

### Changes to BMAD workflows (`_bmad/bmm/workflows/4-implementation/**`)

- [ ] File `{workflow_file}` — add reference to `{capability}` because `{reason}`
- [ ] File `{workflow_file_2}` — add reference to `{capability}` because `{reason}`

### Changes to `.claude/skills/`

- [ ] SKILL.md `{skill_name}` — add trigger for `{capability}` because `{reason}`
- [ ] SKILL.md `{skill_name_2}` — extend description to surface `{capability}`

### Changes to `.claude/hooks/`

- [ ] Hook `{hook_file}` — add `additionalContext` injection mentioning `{capability}`

### Changes to `1.專案部屬必讀/` (deployment docs)

- [ ] Doc `{doc_file}` — add capability invocation example

## Estimated effort

| Task | Est. LOC | Est. time |
|---|---|---|
| BMAD workflow edits | `{loc}` | `{hrs}` |
| SKILL.md updates | `{loc}` | `{hrs}` |
| Hook updates | `{loc}` | `{hrs}` |
| Deploy doc updates | `{loc}` | `{hrs}` |
| **Total** | `{total_loc}` | `{total_hrs}` |

**Comparison vs external integration**:

| Path | Est. LOC | Est. time |
|---|---|---|
| Integrate external | `{ext_loc}` | `{ext_hrs}` |
| Activate existing (this plan) | `{total_loc}` | `{total_hrs}` |
| **Saving** | `{ext_loc - total_loc}` (-`{pct}%`) | `{ext_hrs - total_hrs}` |

> Reference case: 2026-05-02 graphify-6 + Yuxi-main evaluation activated existing
> graph capability at ~150 LOC vs ~530 LOC external port (-72%).

## Verification

After activation, re-run audit:

```bash
node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --json > /tmp/post-activation-audit.json
```

Expected: the previously-latent capabilities now show reachability_score
≥ 0.5 (i.e. promoted from LATENT to reachable in at least 2 sub-systems).

## DB record

```sql
INSERT INTO external_evaluations (
  baseline_id, decision, reject_reason, cooldown_until, adr_path
) VALUES (
  (SELECT id FROM baseline_snapshots WHERE external_id = '{external_id}'),
  'REJECT',
  'activate-existing: latent capability covers {feature_match_pct}% of pain',
  date('now', '+15 days'),
  'docs/technical-decisions/ADR-EXTERNAL-{NNN}-{external_id}.md'
);
```

## ADR

Still write the ADR (Status: `REJECT-baseline (activate-existing)`) to capture
the lesson that latent capability was sufficient. This becomes evidence in the
incident archive.

---

**Sign-off**: Activation plan `{YYYY-MM-DD}`. Expected completion: `{YYYY-MM-DD}`.
