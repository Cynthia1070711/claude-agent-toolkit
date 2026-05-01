---
name: 'step-04b-skill-sync-gate-and-staleness'
description: 'Skill Sync Gate verification + Skill staleness validation; write SKILL_STALE to tech_debt_items DB'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/code-review'
thisStepFile: '{workflow_path}/steps/step-04b-skill-staleness.md'
nextStepFile: '{workflow_path}/steps/step-05-production-gate.md'
---

# Step 4b: Skill Sync Gate & Staleness Validation

**Goal:** Verify Skill Sync Gate compliance (mandatory per `.claude/rules/skill-sync-gate.md`), then validate skill-staleness entries and write SKILL_STALE records to tech_debt_items DB.

---

## AVAILABLE STATE

- `{story_key}` — from Step 1
- `{diff_output}` — from Step 1b

---

## STATE VARIABLES (set in this step)

- `{skill_sync_report}` — Skill Impact Report from dev-story (if produced)
- `{stale_skill_entries}` — Parsed skill-staleness entries from tracking file

---

## EXECUTION SEQUENCE

### 0. Skill Sync Gate Verification (Mandatory)

> **CRITICAL:** 🔒 SKILL SYNC GATE — Mandatory compliance check per `.claude/rules/skill-sync-gate.md`
>
> Code changed but Skill not synced = next conversation uses stale SOP producing incorrect code.

**PROTOCOL:**

1. **Check dev-story Skill Impact Report**: Read tracking file at `docs/tracking/active/{story_key}.track.md`, search for "## Skill Sync Check" or "Skill Impact Report" section
2. **If report found:**
   - Parse affected Skills table
   - For each affected Skill marked ⬜ (not synced): create a **MUST FIX** issue — Skill sync cannot be deferred
   - For each affected Skill marked ✅ (synced): **Read the updated Skill** to verify content matches current code (file:line evidence required)
3. **If no report found but `{diff_output}` contains changes to files matching Skill Sync Gate triggers** (Migration, Model, Service, Controller, Route, Component):
   - Flag as **HIGH** issue: "dev-story 未產出 Skill Impact Report，但 diff 包含觸發條件檔案"
   - Run independent Skill impact scan: `Grep pattern="{changed_concept}" path=".claude/skills/pcpt-*"` to identify affected Skills
4. **If no report found and no trigger files in diff:**
   - Output: ✅ Skill Sync Gate: No trigger files in diff — gate passed

**Reference:** Full gate specification at `.claude/rules/skill-sync-gate.md`

---

> **CRITICAL:** 🔍 SKILL STALENESS VALIDATION: Read tracking file for skill-staleness entries, then write to tech_debt_items DB.

### 1. Read Tracking File

Read the story tracking file at `docs/tracking/active/{story_key}.track.md` (or archived path).

Grep for lines matching pattern: `skill-staleness(` in the tracking file.

Set `{stale_skill_entries}` = list of parsed entries:
- Format 1 (glob match): `skill-staleness({skill_name}): {files}` → severity eligible for escalation
- Format 2 (domain fallback): `skill-staleness-fallback({skill_name}): domain match only, severity=INFO` → skip (INFO only, no DB write)

---

### 2. Process Glob-Match Entries

**If `{stale_skill_entries}` has glob-match entries (Format 1):**

For EACH unique skill in glob-match entries:
1. Call search_debt MCP Tool:
   ```
   Tool: mcp__pcpt-context__search_debt
   query: "SKILL_STALE {skill_name}"
   filters: { status: "pending" }
   ```
   Count existing SKILL_STALE records for this skill across ALL source_stories.
   Set `{existing_count}` = number of matching records.

2. Determine severity per BR-05:
   - If `{existing_count}` >= 3 → severity = "MEDIUM"
   - Otherwise → severity = "LOW"

3. Set `{matched_files}` = comma-joined file list from tracking entry

4. Run upsert-debt.js to write to tech_debt_items:
   ```bash
   node .context-db/scripts/upsert-debt.js --inline '{"type":"SKILL_STALE","severity":"{severity}","source_story":"{story_key}","summary":"Skill {skill_name} may be stale: {matched_files}","target_story":null,"status":"pending"}'
   ```

**Output:**
```
📋 Skill Staleness → tech_debt_items:
- SKILL_STALE | {skill_name} | {severity} (existing: {existing_count}) | {matched_files}
```

---

### 3. Handle Empty Entries

**If `{stale_skill_entries}` is empty:**
- Output: ✅ No skill-staleness entries found in tracking file — skipping SKILL_STALE DB write

---

### 4. Add Staleness Summary to CR Report

**If `{stale_skill_entries}` has any entries:**

Append to CR report (tech_debt_items section):
```markdown
### Skill Staleness (SKILL_STALE)
| Skill | Severity | Matched Files | Existing Count |
|-------|----------|---------------|---------------|
| {skill_name} | {severity} | {matched_files} | {existing_count} |
```

---

## SUCCESS METRICS

- Tracking file read for skill-staleness patterns
- Glob-match entries written to tech_debt_items DB
- Domain-fallback entries noted (INFO only, no DB write)
- CR report updated with staleness table

## FAILURE MODES

- Writing domain-fallback (INFO) entries to DB (should skip)
- Not checking existing count before setting severity
- Missing CR report update

---

**NEXT:** Load `step-05-production-gate.md`
