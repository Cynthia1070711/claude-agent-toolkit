# Benchmark Report — `{external_id}`

> Phase 1-2 mandatory deliverable. Produced after Phase 0 baseline.
> File path: `docs/tianji/benchmarks/{YYYY-MM-DD}-{external_id}.md`
> Prerequisite: `baseline-record.md` exists with verdict ≠ "Activate existing".

---

## 1. Quadrant classification (Principle 2.1)

Itemized comparison. Each feature/capability of the external resource maps to a quadrant.

| External feature | Our equivalent | Comparison verdict | Quadrant |
|---|---|---|---|
| `{ext_feature_1}` | `{our_feature_1}` | we better / we worse / we lack / we don't need | A / B / C / D |
| `{ext_feature_2}` | `{our_feature_2}` | | |
| `{ext_feature_3}` | `{our_feature_3}` | | |

**Aggregate quadrant** (the dominant category if mixed): `{dominant_quadrant}`

### Quadrant-specific actions

#### If Quadrant A (we are better overall)

Extract 1-2 detail wins to reverse-strengthen our system:

- Detail win 1: `{detail_1}` → reverse-strengthen by: `{action_1}`
- Detail win 2: `{detail_2}` → reverse-strengthen by: `{action_2}`

→ **END protocol here**. No further phases needed.

#### If Quadrant D (we don't need it)

- **Reject reason**: `{reject_reason}` (must be concrete, not "doesn't fit")
- **Cooldown end date**: `{YYYY-MM-DD}` (today + 15 days)
- **Re-evaluation trigger condition**: `{condition}` (e.g. "if new use case emerges
  requiring N-hop graph traversal in BMAD workflow")

→ **END protocol here**. Archive ADR.

#### If Quadrant B or C → proceed to evidence verification below

---

## 2. Evidence grading (Principle 5.2)

Categorize all evidence cited by the external resource or community:

| Evidence | Type | Credibility | Used in decision? |
|---|---|---|---|
| `{evidence_1}` | benchmark / empirical / community / marketing / popularity | H / M / M / L / Zero | yes / no |
| `{evidence_2}` | | | |
| `{evidence_3}` | | | |

**Decision principle**: only High and Medium evidence count. Low and Zero are
informational only.

**Aggregate evidence strength**: strong / medium / weak / none

## 3. Context match checklist (Principle 3.2, 8 items)

| # | Item | Match? | Notes |
|---|---|---|---|
| 1 | Team size match (solo + AI agents vs their N-person team) | yes / no | |
| 2 | Tech stack match (C# / ASP.NET Core / SQL Server / IIS / Win 11) | yes / no | |
| 3 | Project phase match | yes / no | |
| 4 | Cost structure match (NT$ sensitivity vs theirs) | yes / no | |
| 5 | Language / region match (zh-TW, Taiwan regulations) | yes / no | |
| 6 | AI engine match (Claude-Code-only) | yes / no | |
| 7 | Maintenance cost match (solo vs dedicated maintainer) | yes / no | |
| 8 | **Q4 latent capability ≥ 70% AND feature_match ≥ 70?** | yes / no | **single-vote veto if YES** |

**NO count**: `{no_count}`

**Verdict**:

- `no_count` ≥ 3 → **auto-REJECT**
- item 8 = yes → **single-vote veto → REJECT, switch to activate-existing path**
- `no_count` = 1-2 and item 8 = no → proceed to Phase 3 with explicit notes
- `no_count` = 0 and item 8 = no → proceed to Phase 3 directly

## 4. SUPREME mandate conflict check

Re-examine the SUPREME mandates flagged in Phase 0:

- `{supreme_mandate_1}`: confirmed conflict? yes / no / mitigatable
- `{supreme_mandate_2}`: confirmed conflict? yes / no / mitigatable

**Any confirmed conflict not mitigatable → REJECT**, cite the mandate.

## 5. Three deliverable lists

### Defend list (保優清單) — modules we keep

- `{our_module_1}`: superior on `{aspect}`, must guard against replacement
- ...

### Replace list (汰劣清單) — modules to be replaced

- `{our_module_1}` → replaced by `{ext_module_1}` because `{reason}`
- ...

### Fill list (補遺清單) — gaps filled

- `{ext_module_1}` fills missing capability of `{capability}`
- ...

## 6. Authority isolation check (Principle 1.3)

Have we lowered any standard because the source is authoritative? Check:

- [ ] Did we accept "Anthropic recommends" as evidence? (must be NO)
- [ ] Did we accept "Karpathy posts about it" as evidence? (must be NO)
- [ ] Did we accept popularity / star count as evidence? (must be NO)
- [ ] Did we run the same verification we would on an unknown contributor? (must be YES)

If any answer fails → **re-run sections 1-3 with stricter scrutiny**.

## 7. Next phase gate

- If REJECT (any criterion) → produce `adr-external-eval.md` with reject reason
  and 15-day cooldown, EXIT.
- If Quadrant A or D → END protocol (Section 1 covers both).
- Otherwise → proceed to Phase 3 (煉化 / Distill), produce `distillation-record.md`.

---

**Sign-off**: Phase 1-2 complete. Date: `{YYYY-MM-DD}`. Quadrant verdict:
`{quadrant_verdict}`. Next phase: `{next_phase}`.
