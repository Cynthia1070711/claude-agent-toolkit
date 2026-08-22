# ADR-EXTERNAL-NNN — `{external_id}` Integration Decision

> Architecture Decision Record for external resource evaluation.
> File path: `docs/technical-decisions/ADR-EXTERNAL-{NNN}-{external_id}.md`
> Mandatory regardless of outcome (GO / PILOT / REJECT).
> Numbering: continue from existing ADR series.

---

## Status

`{status}` — one of:

- **GO + Integrated** — pilot succeeded, merged to main
- **PILOT-then-Integrated** — pilot started with shrunken scope, integrated
- **PILOT-then-Rollback** — pilot started, kill switch fired or scenarios failed
- **REJECT-baseline** — REJECTed in Phase 0 (Q4 latent ≥ 70%)
- **REJECT-benchmark** — REJECTed in Phase 1-2 (Quadrant D or context mismatch)
- **REJECT-distillation** — REJECTed in Phase 3 (gain < 30%, non-safety)
- **REJECT-pilot** — REJECTed at Phase 4 timebox

## Context

What triggered this evaluation?

- **Trigger type**: pain-driven / quarterly / active-monitoring / impulse
- **External resource**: `{external_id}` (`{url}`)
- **First seen**: `{YYYY-MM-DD}`
- **Phase 0 baseline record**: `docs/tianji/baselines/{file}`

What problem did we hope to address?

```
{pain_point}
```

## Decision

```
{decision_summary_one_paragraph}
```

## Process traversed

| Phase | Outcome | Deliverable | File |
|---|---|---|---|
| 0 Baseline | passed / EXIT-Q4 / EXIT-impulse | baseline-record | `{path}` |
| 1-2 Benchmark | passed / Quadrant A / Quadrant D / REJECT | benchmark-report | `{path}` |
| 3 Distillation | passed / REJECT | distillation-record | `{path}` |
| 4 Pilot | integrated / rollback | pilot-report | `{path}` |
| 5 Validation | observation in progress / complete | this ADR | (self) |

## Evidence considered

| Evidence | Type | Credibility | Counted? |
|---|---|---|---|
| `{ev_1}` | | H/M/L/Zero | yes/no |
| `{ev_2}` | | | |

## Alternatives considered

What else was on the table?

1. **`{alt_1}`** — `{why_not_chosen}`
2. **`{alt_2}`** — `{why_not_chosen}`
3. **Status quo** — `{why_not_kept}`

## Consequences

### Positive

- `{positive_1}`
- `{positive_2}`

### Negative / Trade-offs

- `{negative_1}`
- `{negative_2}`

### Neutral / Observations

- `{observation_1}`

## Quantitative outcome (post-7-day observation)

For Integrated decisions only. Fill at end of 7-day observation period.

| Indicator | Baseline | Estimated | Actual (D+7) | Delta vs estimate |
|---|---|---|---|---|
| Token / task | `{base_tok}` | `{est_tok}` | `{actual_tok}` | `{delta}%` |
| Time (sec) | `{base_time}` | `{est_time}` | `{actual_time}` | `{delta}%` |
| Success rate | `{base_succ}` | `{est_succ}` | `{actual_succ}` | `{delta}%` |
| Bug freq / wk | `{base_bug}` | `{est_bug}` | `{actual_bug}` | `{delta}%` |
| Maint hrs / mo | `{base_maint}` | `{est_maint}` | `{actual_maint}` | `{delta}%` |

**Estimate accuracy**: if any indicator delta > 20% → trigger archive-and-reflect
clause and log to `incident-archive.md`.

## Side effects observed

Unanticipated effects (positive or negative):

- `{side_effect_1}`
- `{side_effect_2}`

## Rollback / cooldown

- For REJECT: cooldown until `{cooldown_end_date}` (today + 15 days, AI-agent variant).
- Re-evaluation trigger condition: `{condition}`
- For Integrate: rollback procedure documented in pilot-report.md Section 8.2.

## DB row references

```sql
-- baseline_snapshots
SELECT * FROM baseline_snapshots WHERE external_id = '{external_id}';

-- external_evaluations
SELECT * FROM external_evaluations WHERE baseline_id IN
  (SELECT id FROM baseline_snapshots WHERE external_id = '{external_id}');
```

## References

- Tianji-Pavilion methodology: `.claude/skills/tianji-pavilion/SKILL.md` v1.2.0
- Q4 audit script: `1.專案部屬必讀/scripts/audit-capability-reachability.cjs`
- Capability-integration mandate: `.claude/rules/capability-integration-mandate.md`

---

**ADR sign-off**: `{YYYY-MM-DD}`. Status: `{final_status}`.
