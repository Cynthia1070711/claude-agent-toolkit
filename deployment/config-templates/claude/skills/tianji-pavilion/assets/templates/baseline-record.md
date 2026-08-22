# Baseline Record — `{external_id}`

> Phase 0 mandatory deliverable. Produced before any benchmarking begins.
> Without this record, all subsequent comparison is subjective.
> File path convention: `docs/tianji/baselines/{YYYY-MM-DD}-{external_id}.md`
> Also writes a row to `.context-db` → `baseline_snapshots` table.

---

## 1. Identification

- **External resource ID**: `{external_id}` (e.g. `graphify-6`, `awesome-rules-2026`)
- **Resource type**: workflow | skill | hook | rule | agent | mcp_server | methodology | prompt_template | other
- **Source URL**: `{url}`
- **First-seen date**: `{YYYY-MM-DD}`
- **Evaluator**: `{ai_agent_session_id}` (Claude Code session)

## 2. Trigger classification (Principle 1.1)

- [ ] **Pain-driven** — Existing module fails repeatedly. Cite incident:
- [ ] **Quarterly review** — Mandatory ecosystem scan. Quarter:
- [ ] **Active monitoring** — Anthropic release / KOL post. Source:
- [ ] **Impulse** — "Looks cool" → **MUST cold-storage 3 days before re-evaluation**.
      Earliest re-evaluation date: `{YYYY-MM-DD}`

> ⚠️ If Impulse is checked, STOP HERE. Re-open this record on or after the
> cold-storage end date. Hook `impulse-cooldown-guard.js` will block worktree
> creation before that date.

## 3. Sovereignty Four Questions (Principle 1.2)

### Q1 — Existing corresponding module

What is the project's current module that handles this domain?

```
{q1_answer}
```

- If "none" → enter Quadrant C path, proceed.
- If "I cannot answer" → **STOP**. Pause integration until the existing system is
  re-understood. Output: `I do not currently understand our own system well enough
  to evaluate external alternatives. Need to study {affected_modules} first.`

### Q2 — Specific pain point

What specific pain does integrating this solve?

```
{q2_answer}
```

- If unspecific or hand-wavy → impulse trigger, **REJECT** at this point.

### Q3 — Inaction consequence

What happens if we do not integrate?

```
{q3_answer}
```

- If "nothing important" → **do not integrate**, record rationale and EXIT.

### Q4 — Latent capability audit

Have I fully audited my own existing capabilities, including latent ones?

**Run audit**: `node 1.專案部屬必讀/scripts/audit-capability-reachability.cjs --json > /tmp/audit-{external_id}.json`

- **Audit score** (audit_score, range 0.0-1.0): `{audit_score}`
- **Feature match percentage** (human-rated, 0-100, "does our existing capability
  functionally satisfy Q2 pain?"): `{feature_match_pct}`

**Verdict logic** (BOTH must hold for "activate existing"):

| audit_score | feature_match_pct | Verdict |
|---|---|---|
| ≥ 0.70 | ≥ 70 | **Activate existing — REJECT external. Switch to `existing-capability-activation-plan.md`** |
| ≥ 0.70 | < 70 | Partial coverage. Consider integration of incremental piece only. |
| < 0.70 | ≥ 70 | Capability exists but underused. Consider invocation-density fix first. |
| < 0.70 | < 70 | Proceed to Phase 1-2 benchmarking. |

**Q4 verdict**: `{verdict}`

## 4. Baseline quantification (Principle 2.2)

Measure the existing module on these indicators. Even for Quadrant C (no existing
module), quantify "current manual cost to handle this need".

| Indicator | Value | Measurement method | Reference snapshot |
|---|---|---|---|
| Token consumption (per task) | `{baseline_tokens}` | `/context` before/after sample task | |
| Execution time (sec) | `{baseline_time_sec}` | wall clock on 3 reference tasks | |
| Success rate (%) | `{baseline_success_rate}` | passed / total on 10 reference tasks | |
| Bug frequency (/week) | `{baseline_bug_freq}` | git log + issue tracker last 4 weeks | |
| Maintenance cost (hrs/month) | `{baseline_maint_cost_hrs}` | est. from time tracking | |

**Note**: If Quadrant C, set Q1 = "none" and replace baseline values with
"current manual cost" estimates.

## 5. Predicted quadrant

Based on Q1-Q4 and baseline, predict (before formal benchmarking):

- [ ] **A** Defend Strength — we have + we are better
- [ ] **B** Replace Weakness — we have + we are worse
- [ ] **C** Fill Gap — we don't have + they have something useful
- [ ] **D** Discard — we don't have + we don't need it

Predicted quadrant: `{predicted_quadrant}`

## 6. SUPREME mandate conflict pre-check

List any SUPREME mandates that might conflict:

- `{supreme_mandate_1}` — predicted conflict: yes / no / unknown
- `{supreme_mandate_2}` — predicted conflict: yes / no / unknown

If any "yes" → mark this evaluation as **high-risk**, require explicit
SUPREME-override approval in Phase 2.

## 7. DB write confirmation

Confirm row written to `.context-db` `baseline_snapshots`:

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('.context-db/phycool.db');
const row = db.prepare('SELECT * FROM baseline_snapshots WHERE external_id = ?').get('{external_id}');
console.log(JSON.stringify(row, null, 2));
"
```

- [ ] Row exists with matching `external_id`
- [ ] `audit_json` field populated with full audit output
- [ ] `created_at` within last 24 hours

## 8. Next phase gate

- If Q4 verdict = "Activate existing" → switch to
  `existing-capability-activation-plan.md`, **do NOT proceed to Phase 1-2**.
- If Q3 answer = "nothing important" → EXIT, archive this record.
- If Impulse trigger and cold-storage not elapsed → PAUSE, set reminder for
  `{earliest_re_eval_date}`.
- Otherwise → proceed to Phase 1-2, produce `benchmark-report.md`.

---

**Sign-off**: Phase 0 complete. Date: `{YYYY-MM-DD}`. Next phase: `{next_phase}`.
