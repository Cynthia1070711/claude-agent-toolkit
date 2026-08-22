# Spec-Lite — `{external_id}`

> 50-100 line lightweight spec for pilot phase. Tianji-Pavilion Phase 4 entry
> requirement (SDD+TDD compatibility).
> File path: `docs/specs/lite/{external_id}.md`

---

## Problem statement

What pain are we addressing? (single paragraph, concrete)

```
{problem}
```

## Goal

What does success look like at the end of pilot? (one sentence)

```
{goal}
```

## Non-goals

What we are explicitly NOT trying to achieve in this pilot:

- `{non_goal_1}`
- `{non_goal_2}`

## Scope boundary

### In scope (files / dirs)

- `{path_1}`
- `{path_2}`

### Out of scope

- `{path_3}` — touching this triggers scope-creep-detector
- `{path_4}`

## Acceptance criteria

Each criterion must be testable and includes an adversarial scenario (Principle 5.1).

| # | Given | When | Then | Adversarial counterpart |
|---|---|---|---|---|
| AC-1 | `{given_1}` | `{when_1}` | `{then_1}` | `{adversarial_1}` |
| AC-2 | `{given_2}` | `{when_2}` | `{then_2}` | `{adversarial_2}` |
| AC-3 | `{given_3}` | `{when_3}` | `{then_3}` | `{adversarial_3}` |

## Kill switch conditions

The pilot terminates immediately if ANY of:

1. Token usage per equivalent task rises > 20% over Phase 0 baseline
2. Any P0/P1 bug introduced and not fixed within 1 day
3. > 1 of 3 adversarial scenarios fail
4. Any file outside "in scope" is modified
5. Maintenance cost projection > 1.5× pre-pilot estimate
6. `{custom_kill_switch}`

## Rollback plan

```bash
git worktree remove --force ../pilot-{external_id}
git branch -D pilot/{external_id}
# Update DB:
# external_evaluations.decision = 'REJECT'
# external_evaluations.reject_reason = '...'
```

ADR is NOT deleted. Rollback = learning capital.

## Tests

| Test | Type | Location |
|---|---|---|
| `{test_1}` | unit / integration / e2e | `{path}` |
| `{test_2}` | | |

## Dependencies on other systems

- `{dep_1}` (e.g. `.context-db` schema for `baseline_snapshots`)
- `{dep_2}`

## Out-of-band risks

What could break that we did not test for?

- `{risk_1}` — mitigation: `{mitigation}`
- `{risk_2}` — mitigation: `{mitigation}`

---

**Sign-off**: spec-lite drafted `{YYYY-MM-DD}` for pilot `{external_id}`.
