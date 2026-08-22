# Pilot Report — `{external_id}`

> Phase 4 mandatory deliverable. Produced during and at the end of pilot.
> File path: `docs/tianji/pilots/{YYYY-MM-DD}-{external_id}.md`
> Prerequisite: `distillation-record.md` with decision in {GO, PILOT}.

---

## 1. Pilot setup

- **Worktree path**: `{worktree_path}`
- **Worktree branch**: `pilot/{external_id}`
- **Setup command**:
  ```bash
  git worktree add ../pilot-{external_id} -b pilot/{external_id}
  ```
- **Setup date**: `{YYYY-MM-DD HH:MM}`
- **Pilot size**: small / medium / large
- **Timebox**:

  | Size | Timebox (AI-agent variant) |
  |---|---|
  | small | 3 days |
  | medium | 7 days |
  | large | 14 days |

- **Timebox end date**: `{YYYY-MM-DD}` (created date + timebox days)
- **Hook `pilot-timebox-monitor.js`**: armed? yes / no (must be yes)

## 2. Kill switch conditions

Define explicit abort triggers BEFORE starting pilot work. Any single condition
firing → immediate rollback.

- [ ] Token usage rises > 20% over baseline on equivalent task
- [ ] Any P0/P1 bug introduced and not fixed within 1 day
- [ ] Maintenance cost projection > 1.5× pre-pilot estimate
- [ ] Spec-lite acceptance criteria fail on > 1 of 3 adversarial scenarios
- [ ] Scope creep: pilot touches modules not listed in `distillation-record.md` Section 4
- [ ] Custom condition: `{custom_kill_switch}`

## 3. Single-variable enforcement

- [ ] No other pilot is active in this period. Verify via:
  ```bash
  git worktree list | grep -c "^.*pilot/"
  ```
- [ ] Result must be 1 (this pilot only).
- [ ] Hook `concurrent-pilot-guard.js` enforced this at worktree creation.

## 4. Adversarial scenarios (from Phase 3 distillation)

Run each scenario, record actual behavior:

| # | Scenario | Expected | Actual | Pass? |
|---|---|---|---|---|
| 1 | Weakest: `{scenario_1}` | `{expected_1}` | `{actual_1}` | yes / no |
| 2 | Edge: `{scenario_2}` | `{expected_2}` | `{actual_2}` | yes / no |
| 3 | Intentional break: `{scenario_3}` | graceful failure | `{actual_3}` | graceful / verbose / silent |

**Pass count**: `{pass_count}` out of 3.

> Per Principle 5.1, **all 3 must pass**. The goal of pilot is to **prove
> it does NOT work**. Any failure → strong rollback signal.

## 5. Daily observation log

Track per-day. AI-agent variant uses days, not weeks.

| Day | Date | Token use vs baseline | Bugs introduced | Bugs fixed | Notes |
|---|---|---|---|---|---|
| D+0 | `{date}` | `{tok_pct}` | `{bugs_new}` | `{bugs_fixed}` | setup |
| D+1 | | | | | |
| D+2 | | | | | |
| D+3 | | | | | |
| ... | | | | | |

## 6. Scope guard

Track files / dirs touched. Any new directory not in Phase 3 plan = scope creep.

```bash
git diff --name-only main..pilot/{external_id} | cut -d/ -f1-2 | sort -u
```

**Allowed dirs** (from Phase 3 plan):
- `{allowed_dir_1}`
- `{allowed_dir_2}`

**Touched dirs** (actual):
- `{actual_dir_1}`
- `{actual_dir_2}`

**Diff** (must be empty or justified):
- `{diff_1}` — justification: `{justification}`

> Hook `scope-creep-detector.js` fires PostToolUse on Edit/Write and alerts
> when actual touches diverge from `distillation-record.md` Section 4 plan.

## 7. Mid-pilot kill-switch check

Run daily. Any "yes" → halt pilot and rollback today.

- [ ] Token usage rise > 20%? yes / no
- [ ] P0/P1 bug stuck > 1 day? yes / no
- [ ] Maintenance cost projection > 1.5× estimate? yes / no
- [ ] Adversarial scenario failure? yes / no
- [ ] Scope creep beyond plan? yes / no
- [ ] Custom kill switch fired? yes / no

If all "no" → continue.

## 8. Timebox expiry decision

At timebox end, **binary choice required**. Permanent pilot state is forbidden
(F5).

### 8.1 Integrate

If choosing integrate, complete this checklist BEFORE merging to main:

- [ ] All 3 adversarial scenarios pass
- [ ] Scope matches `distillation-record.md` Section 4 plan
- [ ] No kill switch ever fired
- [ ] Spec-lite acceptance criteria met
- [ ] SSoT update plan:
  - [ ] `.claude/rules/` updates: `{rule_files}`
  - [ ] `.claude/skills/` updates: `{skill_dirs}`
  - [ ] `.claude/hooks/` updates: `{hook_files}`
  - [ ] `RELEASE-NOTES.md` entry drafted
  - [ ] Toolkit version bump: `{old_version}` → `{new_version}`
  - [ ] `init-db.js` updates (if Memory DB schema affected)
- [ ] Hook `ssot-sync-checker.js` will verify these on merge commit
- [ ] Merge command:
  ```bash
  git checkout main
  git merge --no-ff pilot/{external_id}
  git worktree remove ../pilot-{external_id}
  ```

### 8.2 Rollback

If choosing rollback, complete this checklist:

- [ ] Document rollback reason: `{reason}`
- [ ] **DO NOT delete ADR** — rejection is learning capital
- [ ] Delete worktree:
  ```bash
  git worktree remove --force ../pilot-{external_id}
  git branch -D pilot/{external_id}
  ```
- [ ] Update `external_evaluations` table:
  - `decision = 'REJECT'`
  - `reject_reason = '{reason}'`
  - `cooldown_until = {today + 15 days}`
  - `kill_switch_triggered` = which condition (if applicable)

## 9. Next phase gate

- If Integrate → proceed to Phase 5 (驗真 / Validate), 7-day observation begins.
- If Rollback → produce `adr-external-eval.md` with REJECT verdict, EXIT.

---

**Sign-off**: Phase 4 complete. Date: `{YYYY-MM-DD}`. Decision: `{integrate/rollback}`.
Next phase: `{next_phase}`.
