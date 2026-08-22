# Incident Archive — Self-Iteration Triggers

Record of cases that caused the Tianji-Pavilion methodology itself to be
revised. Per the self-iteration clause, revision happens at:

- N = 5 completed protocol cycles (count-based)
- OR any single incident (incident-based, whichever first)

---

## 2026-05-02 — v1.0.0 → v1.1.0 (first-application incident)

### Context

First application of the Tianji-Pavilion protocol on two simultaneous candidates:

- `graphify-6` — external graph-traversal MCP server
- `Yuxi-main` — external knowledge graph framework

Both intended to address the same pain: "BMAD workflows lack graph traversal
for symbol dependencies".

### Trigger

During Phase 0 baseline of `graphify-6`, the evaluator ran a 4-perspective
sub-agent analysis (graphify capability / Yuxi capability / PCPT baseline /
Memory DB MCP deep read) and discovered:

- PCPT (PhyCool Context Pre-Trained) already has `symbol_dependencies` graph
- `expandDependencies` MCP tool supports 2-hop traversal
- `RELATION_WEIGHTS` table provides weighted edges
- `S_final` triple-axis fusion combines structural + semantic + recency signals
- 8063 symbols at 100% embedding coverage

But: `grep -r "search_symbols|get_symbol_context|trace_context" _bmad/`
returned **0 hits** — BMAD workflows never invoked these existing capabilities.

### Discovery

Three gaps in v1.0.0:

1. §1.2 Sovereignty had Q1-Q3 but no Q4 "self-audit" question. Without Q4,
   evaluator would have completed all 5 phases before discovering "we already
   have 70% of this".
2. §3.2 Context match had 7 items but no "latent capability coverage" axis.
3. §禁忌篇 had F1-F10 but no forbidden pattern for "skip self-audit".

### Outcome (v1.1.0, same-day upgrade)

6 changes:

1. §1.2 — added Q4 (latent capability audit) with verdict logic
2. §3.2 — added item 8 (latent ≥ 70% = single-vote veto)
3. §禁忌篇 — added F11 (skip Q4 = forbidden)
4. §銜接篇 — added connection 10 (`audit-capability-reachability.cjs` +
   `capability-integration-mandate.md`)
5. §自我迭代條款 — incident records section created (this section)
6. version bump 1.0.0 → 1.1.0

### Quantitative outcome

| Without v1.1.0 (counterfactual) | With v1.1.0 (actual) |
|---|---|
| ~530 LOC port of graphify-6 | ~150 LOC activation + ~380 LOC framework integration |
| 5-phase protocol completed | Phase 0 Q4 → activate-existing path |
| Discover at Phase 5 (D+30) | Discover at Phase 0 (D+0) |

ROI saved: -72% port effort + permanent methodology improvement.

### ADR reference

`docs/technical-decisions/ADR-GOVERNANCE-001-capability-integration-and-skill-governance-systemic-audit.md`

### Lesson

> The methodology itself is a latent capability. First application is when
> first-order gaps surface. Plan for upgrade-on-first-use.

---

## 2026-05-18 — v1.1.0 → v1.2.0 (AI-agent variant)

### Context

Methodology review after deeper integration with PhyCool's Claude Code workflow.
Identified several gaps in the human-pace v1.1.0 when applied to AI-agent
development.

### Trigger

External analysis by an AI agent (this skill's first author session) identified:

1. Timing parameters (7d cold-storage, 30d observation, 90d cooldown) were
   calibrated for human-pace teams. AI-agent iteration is 10-100× faster.
2. No safety/compliance exception to 30% gain threshold — CVE patches with
   < 30% gain would be wrongly REJECTed.
3. No adversarial scenario design protocol — solo + AI lacks QA team.
4. Q4 audit_score vs feature_match_pct were conflated as a single 70% threshold.
5. No SDD+TDD compatibility path during pilot.
6. Mandatory deliverables had no templates (only ADR did).
7. Multi-engine assumptions in v1.1.0 (§3.2 item 6) needed simplification to
   Claude-Code-only.

### Outcome (v1.2.0)

7 changes:

1. **AI-agent timing variant**: 7d → 3d cold-storage, 30d → 7d observation,
   90d → 15d cooldown. Document as variant alongside human-pace original.
2. **Safety exception**: §4.1 added — security/compliance/data integrity
   override 30% threshold.
3. **Adversarial scenario design**: §5.1 expanded with 3-counterexample
   pre-pilot protocol + historical bug replay.
4. **Q4 threshold disambiguation**: §1.2 split into `audit_score ≥ 0.70` AND
   `feature_match_pct ≥ 70` (both required).
5. **SDD-lite template**: new template in `assets/templates/spec-lite-template.md`.
6. **All deliverables templated**: 5 templates added under `assets/templates/`.
7. **Claude-Code-only**: §3.2 item 6 simplified, multi-engine assumption
   removed. Single-engine mode is the PhyCool invariant.

### Mechanization

v1.2.0 also operationalized the methodology by adding 7 mechanized hooks for
F2/F3/F5/F6/F7/F8/F11. Pre-v1.2.0, all 11 forbidden patterns were enforced
manually (effective compliance ≈ 70% per Claude Code best-practice surveys).
Post-v1.2.0 mechanization expected to lift compliance to 90-95% on the 7
hookable patterns.

### Lesson

> Methodology + Hook + DB schema + Templates form a stack. Each layer alone
> is insufficient. Methodology alone is 70% compliance ceiling. Add hooks
> for 90-95%. Add templates to make deliverables consistent. Add DB schema
> to make the protocol queryable.

---

## How to add new incident records

When the methodology requires revision:

1. Add new entry under this file with structure:
   - **Context** (what triggered evaluation)
   - **Trigger** (the specific observation that revealed gap)
   - **Discovery** (the gap itself)
   - **Outcome** (version bump + concrete changes)
   - **Quantitative outcome** (LOC saved / time saved / risk avoided)
   - **ADR reference**
   - **Lesson** (one-line takeaway)
2. Bump `version-history.md` semver.
3. Update SKILL.md version footer.
4. Write external_evaluations row with `evaluator_session = 'methodology-self'`.
5. If incident-based (not N=5 based), document the incident category for
   future pattern-spotting.

---

## Pattern-spotting across incidents

If we accumulate N≥3 incidents in the same category, that category itself
becomes a stable principle worth promoting.

Current incident categories:

| Category | Count | Pattern |
|---|---|---|
| First-application gap | 1 | v1.0→v1.1 |
| Mechanization deficit | 1 | v1.1→v1.2 |

Watch for: timing-parameter regression, evidence-grade abuse, cooldown-bypass
attempts, scope-creep recurrences.
