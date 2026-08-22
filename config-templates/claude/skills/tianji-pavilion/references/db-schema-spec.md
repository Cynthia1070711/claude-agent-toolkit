# DB Schema Spec — `baseline_snapshots` + `external_evaluations`

Tables added to `.context-db/context.db` (PhyCool memory DB) to record the
Tianji-Pavilion protocol traversal for each external resource evaluation.

The patch to `.context-db/scripts/init-db.js` is in `scripts/db-patch-init-db.js`
(applied via `node scripts/db-patch-init-db.js apply`).

---

## Table 1: `baseline_snapshots`

Records Phase 0 baseline per external resource evaluation.

```sql
CREATE TABLE IF NOT EXISTS baseline_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'workflow', 'skill', 'hook', 'rule', 'agent',
    'mcp_server', 'methodology', 'prompt_template', 'other'
  )),
  source_url TEXT,
  first_seen_date TEXT NOT NULL,
  evaluator_session TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'pain', 'quarterly', 'active_monitor', 'impulse'
  )),
  cold_storage_until TEXT,
  q1_answer TEXT,
  q2_answer TEXT,
  q3_answer TEXT,
  q4_audit_score REAL,
  q4_feature_match_pct INTEGER,
  q4_verdict TEXT CHECK (q4_verdict IN (
    'activate_existing', 'partial_coverage', 'invocation_fix', 'proceed'
  )),
  audit_json TEXT,
  baseline_tokens INTEGER,
  baseline_time_sec REAL,
  baseline_success_rate REAL,
  baseline_bug_freq REAL,
  baseline_maint_cost_hrs REAL,
  predicted_quadrant TEXT CHECK (predicted_quadrant IN ('A', 'B', 'C', 'D')),
  supreme_conflicts TEXT,
  baseline_record_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_baseline_external_id
  ON baseline_snapshots(external_id);
CREATE INDEX IF NOT EXISTS idx_baseline_q4_verdict
  ON baseline_snapshots(q4_verdict);
CREATE INDEX IF NOT EXISTS idx_baseline_created_at
  ON baseline_snapshots(created_at);
```

### Field semantics

- `external_id` — unique identifier for the external resource, e.g. `graphify-6`,
  `awesome-rules-2026`. UNIQUE constraint prevents duplicate evaluations.
- `resource_type` — enum, controls which Phase 0 questions apply.
- `cold_storage_until` — ISO date. If non-null, hook `impulse-cooldown-guard.js`
  blocks worktree creation before this date.
- `q4_audit_score` — float 0.0-1.0 from `audit-capability-reachability.cjs`.
- `q4_feature_match_pct` — integer 0-100, human-rated.
- `q4_verdict` — derived from `(q4_audit_score, q4_feature_match_pct)` per Quadrant
  + Q4 interaction matrix.
- `audit_json` — full JSON output from audit script, for forensics.
- `baseline_*` — 5 quantitative indicators required by Principle 2.2.
- `supreme_conflicts` — comma-separated list of SUPREME mandate filenames that
  might conflict.

---

## Table 2: `external_evaluations`

Records each Phase 1-5 outcome per baseline. One baseline can have multiple
evaluations (e.g. REJECT in Phase 0, then re-evaluated after cooldown).

```sql
CREATE TABLE IF NOT EXISTS external_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baseline_id INTEGER NOT NULL REFERENCES baseline_snapshots(id),
  evaluation_round INTEGER NOT NULL DEFAULT 1,
  exit_phase TEXT NOT NULL CHECK (exit_phase IN (
    'phase0', 'phase1_2', 'phase3', 'phase4', 'phase5'
  )),
  decision TEXT NOT NULL CHECK (decision IN (
    'GO', 'PILOT', 'REJECT', 'ACTIVATE_EXISTING'
  )),
  quadrant TEXT CHECK (quadrant IN ('A', 'B', 'B-prime', 'C', 'D')),
  estimated_gain_pct REAL,
  is_safety_exception INTEGER DEFAULT 0,
  reject_reason TEXT,
  cooldown_until TEXT,
  re_eval_trigger_condition TEXT,
  pilot_size TEXT CHECK (pilot_size IN ('small', 'medium', 'large')),
  pilot_worktree TEXT,
  pilot_start TEXT,
  pilot_end TEXT,
  pilot_timebox_days INTEGER,
  kill_switch_triggered TEXT,
  adversarial_pass_count INTEGER,
  adversarial_total INTEGER DEFAULT 3,
  scope_creep_detected INTEGER DEFAULT 0,
  scope_in_scope_paths TEXT,
  ssot_updates_json TEXT,
  actual_tokens INTEGER,
  actual_time_sec REAL,
  actual_success_rate REAL,
  actual_bug_freq REAL,
  actual_maint_cost_hrs REAL,
  estimate_accuracy_delta_pct REAL,
  side_effects TEXT,
  adr_path TEXT,
  observation_end_date TEXT,
  -- v1.3.0 GitNexus integration (added 2026-05-18)
  estimated_blast_radius TEXT,    -- JSON: {risk_level, direct_callers, affected_processes, gitnexus_query_ts}
  actual_blast_radius TEXT,       -- JSON: {affected_symbols, affected_flows, detect_changes_ts}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eval_baseline_id
  ON external_evaluations(baseline_id);
CREATE INDEX IF NOT EXISTS idx_eval_decision
  ON external_evaluations(decision);
CREATE INDEX IF NOT EXISTS idx_eval_cooldown
  ON external_evaluations(cooldown_until);
CREATE INDEX IF NOT EXISTS idx_eval_pilot_end
  ON external_evaluations(pilot_end);
```

### Field semantics

- `evaluation_round` — 1 for first eval, 2+ for post-cooldown re-eval.
- `exit_phase` — which phase the evaluation exited at.
- `is_safety_exception` — boolean. `1` means 30% gain threshold did not apply
  (CVE / GDPR / etc.).
- `kill_switch_triggered` — which kill switch condition fired, if any.
- `adversarial_pass_count` / `adversarial_total` — required for pilot
  acceptance. Both must equal at integration time (usually 3/3).
- `scope_creep_detected` — boolean. Hook `scope-creep-detector.js` writes here.
- `scope_in_scope_paths` — comma-separated list of path prefixes declared in-scope
  at pilot start. Hook `scope-creep-detector.js` reads this; Edit/Write to files
  whose paths fall outside any listed prefix → `scope_creep_detected = 1`.
- `ssot_updates_json` — list of files updated post-integration (RELEASE-NOTES,
  .claude/**, etc.). Hook `ssot-sync-checker.js` validates.
- `actual_*` — measured at end of 7-day observation, for Integrate decisions.
- `estimate_accuracy_delta_pct` — `(actual - estimate) / estimate * 100`. If any
  baseline indicator has |delta| > 20%, triggers archive-and-reflect.
- `estimated_blast_radius` (v1.3.0 GitNexus) — JSON output from
  `mcp__gitnexus__impact({target, direction: "upstream"})` at pre-pilot. Schema:
  `{risk_level: "LOW|MEDIUM|HIGH|CRITICAL", direct_callers: number,
  affected_processes: string[], gitnexus_query_ts: ISO8601}`. Operationalises the
  "≤ 15% modular boundary" rule of Principle 4 — graph-measured not honour-system.
- `actual_blast_radius` (v1.3.0 GitNexus) — JSON output from
  `mcp__gitnexus__detect_changes()` at pilot end / observation window. Schema:
  `{affected_symbols: string[], affected_flows: string[], detect_changes_ts: ISO8601}`.
  Compared against `estimated_blast_radius`; delta > 20% triggers
  archive-and-reflect.

---

## Common queries

### Active pilots (for `concurrent-pilot-guard.js`)

```sql
SELECT * FROM external_evaluations
WHERE decision = 'PILOT'
  AND pilot_end IS NULL
  AND pilot_start IS NOT NULL;
```

If count > 0 and a new worktree creation is attempted → block (F3).

### REJECTed items in cooldown (for `reject-cooldown-check.js`)

```sql
SELECT bs.external_id, ee.cooldown_until, ee.reject_reason
FROM external_evaluations ee
JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
WHERE ee.decision = 'REJECT'
  AND ee.cooldown_until > date('now');
```

When user prompt mentions any `external_id` from this list → flag (F6).

### Pilots past timebox (for `pilot-timebox-monitor.js`)

```sql
SELECT bs.external_id, ee.pilot_worktree, ee.pilot_start,
       ee.pilot_timebox_days,
       julianday('now') - julianday(ee.pilot_start) AS days_elapsed
FROM external_evaluations ee
JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
WHERE ee.decision = 'PILOT'
  AND ee.pilot_end IS NULL
  AND julianday('now') - julianday(ee.pilot_start) > ee.pilot_timebox_days;
```

Any row → trigger SessionStart warning (F5).

### Observation-in-progress integrations

```sql
SELECT bs.external_id, ee.observation_end_date
FROM external_evaluations ee
JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
WHERE ee.decision IN ('GO', 'PILOT')
  AND ee.pilot_end IS NOT NULL
  AND ee.observation_end_date > date('now')
  AND ee.actual_tokens IS NULL;  -- not yet measured
```

Surface daily until D+7 fill in actuals.

### Quarterly review of REJECT decisions

```sql
SELECT bs.external_id, ee.exit_phase, ee.reject_reason, ee.re_eval_trigger_condition,
       ee.created_at
FROM external_evaluations ee
JOIN baseline_snapshots bs ON bs.id = ee.baseline_id
WHERE ee.decision = 'REJECT'
  AND ee.created_at > date('now', '-90 days')
ORDER BY ee.created_at DESC;
```

For periodic self-iteration review (every 5 cases or incident-driven).

---

## Migration safety

The patch script in `scripts/db-patch-init-db.js`:

- Uses `CREATE TABLE IF NOT EXISTS` — idempotent
- Does NOT drop existing tables
- Adds two new tables, two FOREIGN KEY relationship (baseline_id), several indexes
- Compatible with `better-sqlite3` (PhyCool's existing driver per init-db.js)
- Backwards compatible: existing PhyCool tables untouched

### Apply

```bash
node .claude/skills/tianji-pavilion/scripts/db-patch-init-db.js apply
```

### Verify

```bash
node .claude/skills/tianji-pavilion/scripts/db-patch-init-db.js verify
```

Expected: prints `baseline_snapshots schema: 25 columns` and
`external_evaluations schema: 35 columns` (v1.3.0+; was 33 before GitNexus).

### Rollback (if ever needed)

```sql
DROP TABLE IF EXISTS external_evaluations;
DROP TABLE IF EXISTS baseline_snapshots;
```

But rollback loses evaluation history — prefer to keep tables.
