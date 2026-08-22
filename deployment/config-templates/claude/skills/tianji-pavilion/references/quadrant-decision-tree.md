# Quadrant Decision Tree — A/B/C/D Full Classification Logic

Detailed decision tree for classifying any external resource into A/B/C/D.

---

## Top-level question

**Does PhyCool currently have a module that addresses the same domain?**

```
YES → branch to "Have-equivalent" (A or B)
NO  → branch to "No-equivalent" (C or D)
```

## Have-equivalent branch: A or B

**Question**: Is our module better than theirs?

For each comparison criterion, score Win / Tie / Lose:

| Criterion | Ours | Theirs | Verdict |
|---|---|---|---|
| Token efficiency | | | |
| Execution speed | | | |
| Maintenance cost | | | |
| Test coverage | | | |
| Integration with .context-db | | | |
| Integration with BMAD workflows | | | |
| Compatibility with Claude Code | | | |
| zh-TW support | | | |
| Documentation quality | | | |
| Bug rate (historical) | | | |

**Tally**:
- Wins > Losses → **Quadrant A** (we are better overall)
- Wins < Losses → **Quadrant B** (we are worse)
- Wins ≈ Losses → **Quadrant B-prime** (mixed; treat as B with conditional
  replacement scope shrunk to specific Lose dimensions)

### Quadrant A action

1. Stop wholesale replacement consideration.
2. Identify 1-2 detail wins for them — the criteria where they beat us
   despite our overall lead.
3. Reverse-engineer those details into our system as small fixes.
4. Document in benchmark-report Section 1 / Quadrant A subsection.
5. **No Phase 3-5**. Protocol ends here.

### Quadrant B action

1. Identify the specific dimensions where they win.
2. Constrain integration scope to those dimensions only (do not replace the
   entire module).
3. Proceed to Phase 3 (distillation) for the constrained scope.
4. Phase 3 distillation must respect modular boundary ≤ 15%.

---

## No-equivalent branch: C or D

**Question**: Do we actually need this capability?

Apply the Q3 test from Phase 0: "What happens if we don't have this?"

| Q3 answer | Quadrant |
|---|---|
| "Project blocked" / "Customer impact" / "Compliance gap" | **C** with high priority |
| "Workaround exists but tedious" | **C** with medium priority |
| "Slight inconvenience occasionally" | **C** with low priority — consider deferring |
| "Nothing meaningful" | **D** archive |
| "We could do it but never have" | **D** unless workflow change is coming |

### Quadrant C action

1. Validate that no latent capability exists (Q4 audit).
2. If Q4 audit_score ≥ 0.70 → switch to activate-existing path, not C-integration.
3. If audit_score < 0.70, proceed to Phase 1-2 evidence verification.
4. Estimate gain against "current manual cost" baseline.
5. Proceed to Phase 3 if context match passes.

### Quadrant D action

1. Document reject reason concretely (not just "doesn't fit").
2. Document re-evaluation trigger conditions (what change in our state would
   make this Quadrant C in the future?).
3. Set cooldown end date = today + 15 days.
4. Write ADR with status `REJECT-benchmark` (Quadrant D).
5. Write external_evaluations DB row.
6. **No Phase 3-5**. Protocol ends here.

---

## Boundary cases

### Case 1: We have it but only partially

"We have a CSV parser but theirs handles streaming"

Decision: **Quadrant B-prime**. Constrain scope to streaming capability only.
Do not replace base CSV parser.

### Case 2: We had it but deprecated it

"We had X but removed it 6 months ago"

Decision: Treat as **Quadrant C** for new evaluation, but include in baseline:
"why was X removed?" If the original reason still holds (security, compliance,
performance), this is **Quadrant D-prime** — was C, now D for our context.

### Case 3: We have it for one use case, they have it for another

"We have rate limiting in API gateway, they have rate limiting in MCP server"

Decision: **Quadrant C** for MCP server scope. Both can coexist.

### Case 4: They have it but their version is incompatible

"They have type stubs but for Python, we are C#"

Decision: **Quadrant D-form / Quadrant C-soul** — the body (Python types) does
not apply, but the soul (type stubs as documentation) might. Per Principle 3.3,
extract soul, write our own form.

### Case 5: Multi-feature resource

"Their package has 8 features; we have 3, they have 5 unique"

Decision: Decompose into 8 MVE-1 evaluations. Each MVE gets its own quadrant
classification. Aggregate quadrant is the dominant one.

---

## Quadrant verdict syntax (for benchmark-report.md)

When writing benchmark-report Section 1, use this syntax:

```
Aggregate quadrant: B-prime
Reason: 4 features Quadrant A (we win), 3 features Quadrant B (we lose),
        1 feature Quadrant D (we don't need)
Action: Replace only the 3 Quadrant B features, retaining our Quadrant A
        implementations. Modular boundary check: 3 features × ~50 LOC ≈ 150 LOC
        out of 12,000 total = 1.25%. Well under 15% ceiling.
```

This format makes both human review and DB query straightforward.

---

## Quadrant + Q4 interaction matrix

| Quadrant | Q4 audit_score | Q4 feature_match | Action |
|---|---|---|---|
| A | (any) | (any) | Extract 1-2 details, end |
| B | < 0.70 | < 70 | Phase 3 distill, partial replacement |
| B | ≥ 0.70 | ≥ 70 | **Activate existing** (latent capability already does this) |
| B | ≥ 0.70 | < 70 | Activate existing first, re-evaluate after |
| B | < 0.70 | ≥ 70 | We have it but underused — invocation fix, not replacement |
| C | < 0.70 | < 70 | Phase 1-3 normal C path |
| C | ≥ 0.70 | ≥ 70 | **Activate existing** (we already have it built) |
| C | ≥ 0.70 | < 70 | Activate existing for partial coverage |
| C | < 0.70 | ≥ 70 | Anomaly — audit script may have missed something, manual review |
| D | (any) | (any) | Archive, no Phase 1+ |

Most "activate existing" outcomes are in B / C with high Q4 scores. The
Quadrant + Q4 matrix is the central decision point of Phase 0-2.
