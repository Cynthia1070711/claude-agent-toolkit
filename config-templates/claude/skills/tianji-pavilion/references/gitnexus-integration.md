# GitNexus Integration (v1.3.0+, PhyCool-PCPT-MVP)

The skill assumes PhyCool's GitNexus index is available (67944 symbols /
126289 relations / 300 execution flows). All 4 phase touchpoints are
**advisory not blocking** — if GitNexus tool returns stale-index warning,
agent must run `npx gitnexus analyze` before relying on output.

---

## Phase 0 — Q4 audit supplement

`audit-capability-reachability.cjs` checks `.context-db` MCP tools / schema
/ Hooks Layers. **GitNexus supplement** widens coverage to codebase:

```
mcp__gitnexus__query({query: "<Q2 pain keyword>"})
  → returns ranked execution flows + process-grouped results
  → parse: does any existing flow already address Q2 pain?
  → write to baseline_snapshots.audit_json under key `gitnexus_coverage`
```

Verdict combination:
- `audit_score ≥ 0.70` (audit-capability-reachability) **OR**
  `gitnexus_coverage.match_count ≥ 1 AND human-rated relevance ≥ 70%`
  → **force "activate existing" path, REJECT external integration**

---

## Phase 1-2 — 360° benchmark

For each existing PhyCool module that the external resource might replace:

```
mcp__gitnexus__context({name: "<existing module / service / hook>"})
  → returns callers, callees, execution flows participation
  → use as Quadrant A/B classification evidence (not feeling-based)
```

Eliminates grep-only surface comparison ("we have a payment service")
in favour of relationship-graph comparison ("payment service has 12
callers across 3 processes; external proposal would touch 8 of them").

---

## Phase 4 — pre-pilot blast radius

Before `git worktree add ../wt -b pilot/<id>`:

```
mcp__gitnexus__impact({target: "<primary symbol pilot will touch>",
                       direction: "upstream"})
  → returns risk level (LOW / MEDIUM / HIGH / CRITICAL)
       + direct callers + affected processes
  → persist to external_evaluations.estimated_blast_radius (JSON)
  → if HIGH/CRITICAL → warn user before proceeding
  → if blast radius > 15% of total system → reject pilot, ask to split
```

This **operationalises the existing "≤ 15% modular boundary" rule** from
Principle 4 — it was previously honour-system, now graph-measured.

---

## Phase 5 — actual vs estimated

At pilot end (timebox expiry) and during 7-day observation:

```
mcp__gitnexus__detect_changes()
  → returns actually-affected symbols + flows since baseline
  → persist to external_evaluations.actual_blast_radius (JSON)
  → compare estimated vs actual:
       delta > 20% → trigger archive-and-reflect (per Principle 5)
       delta ≤ 20% → ADR closed clean
```

Anchors Popper-style falsification to ground truth: the integration's
actual reach versus the agent's pre-pilot estimate.

---

## Stale index discipline

Per `.claude/rules/gitnexus-discipline.md`: any GitNexus tool result
warning "index is stale" → run `npx gitnexus analyze` before trusting
output. Stale-index decisions are not better than no-GitNexus decisions —
they are worse, because they imply false confidence.

---

## Future: hook-level GitNexus enforcement (deferred)

Candidates for next iteration:

1. `tianji-baseline-snapshot-gate.js` extended — on `git worktree add`,
   read `baseline_snapshots.audit_json.gitnexus_coverage`; if missing
   AND Q4 verdict ≠ `activate_existing`, block with F11-variant.
2. `tianji-q4-audit-gate.js` extended — emit stderr NOTE if GitNexus
   index `mtime` is older than 7 days (stale audit risk).
3. New `tianji-blast-radius-gate.js` — PreToolUse on `git worktree add`,
   read pilot's primary target from baseline row, run impact, block if
   risk = CRITICAL and no override flag.

These are intentionally not in v1.3.0 — install + observe Phase 0/1-2/4/5
manual GitNexus calls for one cycle before mechanising.
