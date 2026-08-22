# Distillation Record — `{external_id}`

> Phase 3 mandatory deliverable. Produced after Phase 1-2 benchmark with verdict
> in {B, C} (not A/D, not REJECT).
> File path: `docs/tianji/distillations/{YYYY-MM-DD}-{external_id}.md`

---

## 1. Three Distillation Questions (Principle 3.1)

### Q1 — Underlying logic

What root problem does this external resource solve, and why did its authors
choose this specific design?

```
{underlying_logic}
```

### Q2 — Context assumptions

What did the authors assume about their environment?

| Assumption category | Their assumption | Our reality | Match? |
|---|---|---|---|
| Team size | `{their_team_size}` | solo + AI agents | yes / no |
| Tech stack | `{their_stack}` | C# / ASP.NET Core / SQL Server | yes / no |
| Project scale | `{their_scale}` | `{our_scale}` | yes / no |
| AI orchestration | `{their_ai}` | Claude Code only | yes / no |
| Operating system | `{their_os}` | Windows 11 | yes / no |
| Maintenance model | `{their_maint}` | solo | yes / no |
| Language | `{their_lang}` | zh-TW first, en docs | yes / no |

### Q3 — Soul vs Body distinction

For each component of the external resource, classify:

| Component | Soul (portable) | Body (context-bound) |
|---|---|---|
| `{component_1}` | `{soul_aspect}` | `{body_aspect}` |
| `{component_2}` | | |
| `{component_3}` | | |

## 2. MVE (Minimum Viable Element) decomposition

Decompose the external resource into smallest units. Evaluate each individually.

| MVE # | Description | Lines/Files | Quadrant | Take? | Adaptation needed |
|---|---|---|---|---|---|
| MVE-1 | `{description}` | `{n_lines}` | A/B/C/D | yes / no | `{adaptation}` |
| MVE-2 | | | | | |
| MVE-3 | | | | | |
| MVE-4 | | | | | |

**Take count**: `{take_count}` out of `{total_mve}` MVEs.

**Take-rate**: `{take_rate_pct}%`

> **Heuristic check**: If take-rate < 20%, ask: is it worth the integration
> overhead? Consider deferring or switching to Quadrant D archive.

## 3. Form-vs-soul rewrite mapping

For each MVE marked "take", document how the body is rewritten:

| MVE | Their form | Our form | Rewrite type |
|---|---|---|---|
| MVE-1 | `{their_form}` | `{our_form}` | direct port / adapt / reimplement |
| MVE-2 | | | |

**Rewrite examples** (for reference):

| Their form (body) | Underlying need (soul) | Our adaptation |
|---|---|---|
| Python + LangChain | LLM orchestration | Semantic Kernel + C# |
| GitHub Actions CI | Automated verification | Local PowerShell + Claude Code hooks |
| 50 always-on rules | Clear boundaries | 20 rules + 5 SUPREME + paths-scoped lazy loading |
| Multi-engine fallback | Reliability | Single Claude Code + retry policy in hooks |

## 4. Integration plan

### 4.1 MVE list (final, after distillation)

```
MVE-1: {description} → file path: {target_path} → est. LOC: {loc}
MVE-2: {description} → file path: {target_path} → est. LOC: {loc}
```

**Total estimated LOC change**: `{total_loc}`

### 4.2 Modular boundary check (Principle 4.4)

- System total size (LOC of `.claude/` + related): `{total_system_loc}`
- This integration's blast radius: `{total_loc / total_system_loc * 100}%`
- **≤ 15%?** yes / no

If > 15% → **STOP**. Split this integration into smaller chunks. Each chunk
becomes its own Phase 0-5 cycle.

### 4.3 Adaptation tasks

List concrete adaptation work needed before pilot:

- [ ] Adaptation task 1: `{description}` (est. `{hrs}` hours)
- [ ] Adaptation task 2: `{description}` (est. `{hrs}` hours)
- [ ] Adaptation task 3: `{description}` (est. `{hrs}` hours)

### 4.4 Estimated gain

For each baseline indicator (from Phase 0), project the post-integration value:

| Indicator | Baseline | Projected | Gain % |
|---|---|---|---|
| Token consumption (per task) | `{baseline_tok}` | `{projected_tok}` | `{gain_pct}` |
| Execution time (sec) | `{baseline_time}` | `{projected_time}` | `{gain_pct}` |
| Success rate (%) | `{baseline_succ}` | `{projected_succ}` | `{gain_pct}` |
| Bug frequency (/wk) | `{baseline_bug}` | `{projected_bug}` | `{gain_pct}` |
| Maintenance cost (hrs/mo) | `{baseline_maint}` | `{projected_maint}` | `{gain_pct}` |

**Aggregate gain estimate**: `{aggregate_gain_pct}%`

**Decision gate** (Principle 4.1, 4.2):

| Aggregate gain | Resource type | Decision |
|---|---|---|
| ≥ 30% | any | GO or PILOT |
| < 30% | security / compliance / data integrity | GO (safety exception) |
| < 30% | other | REJECT (cooldown 15 days) |
| evidence partial | any | PILOT (shrink scope + kill switch) |

**Decision**: `{decision}` (GO / PILOT / REJECT)

## 5. SDD-lite specification (if pilot proceeds)

Even pilots go through SDD. Use `spec-lite-template.md` (50-100 lines).

- [ ] Spec-lite drafted at: `docs/specs/lite/{external_id}.md`
- [ ] Problem statement included
- [ ] Acceptance criteria include adversarial scenarios (Principle 5.1)
- [ ] Kill switch conditions enumerated
- [ ] Rollback plan documented

## 6. Adversarial scenario design (Principle 5.1, AI-Agent variant)

Since solo + AI does not have a QA team, design 3 counterexamples now:

1. **Weakest scenario**: `{scenario_1}` — expected behavior: `{expected}`
2. **Edge case**: `{scenario_2}` — expected behavior: `{expected}`
3. **Intentional break**: `{scenario_3}` — expected failure mode: graceful / verbose / silent (must be graceful)

These scenarios become acceptance tests in the pilot.

## 7. Historical bug replay (AI-Agent variant)

Query `.context-db` for past bugs in the affected domain:

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('.context-db/phycool.db');
const bugs = db.prepare(\`SELECT * FROM bug_records WHERE domain LIKE ? ORDER BY created_at DESC LIMIT 5\`).all('%{domain}%');
console.log(JSON.stringify(bugs, null, 2));
"
```

For each retrieved bug, predict: would the new integration prevent it, ignore it,
or worsen it?

| Past bug | New integration impact |
|---|---|
| `{bug_1}` | prevents / ignores / worsens |
| `{bug_2}` | |
| `{bug_3}` | |

## 8. Next phase gate

- If decision = REJECT → produce `adr-external-eval.md` with reject reason, EXIT.
- If decision = GO or PILOT → proceed to Phase 4, produce `pilot-report.md`.

---

**Sign-off**: Phase 3 complete. Date: `{YYYY-MM-DD}`. Decision: `{decision}`.
Next phase: `{next_phase}`.
