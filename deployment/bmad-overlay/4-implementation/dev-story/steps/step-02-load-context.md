---
name: 'step-02-load-context'
description: 'Load project context, required skills, skill staleness detection, and debt registry pull'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-02-load-context.md'
nextStepFile: '{workflow_path}/steps/step-02b-kb-precheck.md'
---

# Step 2: Load Context

**Goal:** Load all available context — project patterns, required skills (with staleness detection), and incoming tech debt.

---

## AVAILABLE STATE

- `{story_key}`, `{story_path}`, `{sprint_status_cache}` — from Step 1

---

## STATE VARIABLES (set in this step)

- `{story_required_skills}` — 已載入的 Skills 列表
- `{staleness_hits}` — Skill 過時偵測結果
- `{domain_fallback_candidates}` — 僅 domain 匹配的 fallback 候選
- `{incoming_tech_debt}` — 前置技術債 items

---

## EXECUTION SEQUENCE

### 1. Load Project Context

Load `{project_context}` for coding standards and project-wide patterns (if exists).

> **CRITICAL:** Context already parsed in Step 1 (Task Check). Only load project-wide patterns here.

---

### 2. Required Skills Loading

> **CRITICAL:** 🔧 LOAD REQUIRED SKILLS — Read and load all skills listed in story!

1. Search story file for `## Required Skills` section

**If Required Skills section exists:**
1. Extract all skill names (format: `/skill-name`)
2. Store as `{story_required_skills}` list
3. For EACH skill in `{story_required_skills}`: invoke the Skill tool to load it

**Output:**
```
📚 Required Skills Loaded:
- ✅ {skill_name} loaded
```

**If Required Skills section does NOT exist:**
- Output: ℹ️ No Required Skills section found — proceeding without skill loading
- Consider referencing `{project-root}/.claude/skills/skills_list.md` for relevant skills

---

### 3. Skill Staleness Detection

> **CRITICAL:** 🔍 SKILL STALENESS CHECK: Compare file_list against loaded Skills' `watches` patterns.

**Only execute if `{story_required_skills}` is not empty AND story has file_list:**

1. Extract `{file_list}` from story (files changed/added in this story's implementation scope)
2. Set `{staleness_hits}` = empty list
3. Set `{domain_fallback_candidates}` = empty list
4. Extract `{story_domain}` from story metadata (e.g., auth, editor, payment, admin)
5. For EACH skill in `{story_required_skills}`:
   a. Read the skill's SKILL.md frontmatter to extract the `watches` field (YAML list of `{glob, domain?}`)
   b. If `watches` field is absent or empty → skip this skill (no error)
   c. Set `{skill_glob_matched}` = false
   d. For EACH entry in watches:
      - Extract `entry.glob` (required) and `entry.domain` (optional)
      - For EACH file in `{file_list}`:
        - Test if file path matches `entry.glob` pattern (minimatch-style glob)
        - If match: append to `{staleness_hits}` → `{skill, file, glob}`; set `{skill_glob_matched}` = true
      - If `entry.domain` is set AND `entry.domain == {story_domain}`: add to `{domain_fallback_candidates}`
   e. If `{skill_glob_matched}` is false AND skill in `{domain_fallback_candidates}`:
      - Domain-only match → record as fallback (severity=INFO, NOT a tech_debt_items entry)

**If `{staleness_hits}` is not empty:**
- For EACH unique skill in `{staleness_hits}`:
  - Append to tracking file: `skill-staleness({skill_name}): {matched_files}`
- Output: ⚠️ Skill Staleness Detected (list per skill)

**If domain fallback only (no glob match):**
- Append to tracking file: `skill-staleness-fallback({skill_name}): domain match only, severity=INFO`
- Output: ℹ️ Skill Domain Fallback (INFO only, no tech_debt_items)

**If no hits:** Output: ✅ No skill staleness detected

---

### 4. Debt Registry Pull

> **CRITICAL:** 📋 DEBT REGISTRY PULL: Check registry for pending debt assigned to this story.

Set `{registry_path}` = `{implementation_artifacts}/tech-debt/registry.yaml`

**If `{registry_path}` exists:**
1. Read `{registry_path}`
2. Filter entries where: `status == "pending"` AND `target_story == "{story_key}"`
3. If matching entries found:
   - For EACH matching entry: read sidecar file, extract fix_guidance, problem_location, severity
   - Accumulate into `{incoming_tech_debt}` list
   - Output: ⚠️ **前置技術債 (Registry Pull):** [list] — These MUST be addressed during task implementation
4. If no matching entries: set `{incoming_tech_debt}` = empty

**If `{registry_path}` does NOT exist (legacy fallback):**
1. Set `{sidecar_path}` = `{implementation_artifacts}/tech-debt/{story_key}.debt.md`
2. If exists: read and extract items → store as `{incoming_tech_debt}`
3. If not exists: set `{incoming_tech_debt}` = empty

---

## SUCCESS METRICS

- `{story_required_skills}` set (empty if no Required Skills section)
- All skills loaded via Skill tool
- `{staleness_hits}` evaluated and tracking file appended
- `{incoming_tech_debt}` loaded (empty or with items)

## FAILURE MODES

- Skipping skill loading when Required Skills section exists
- Not reading each skill's SKILL.md frontmatter for `watches` field
- Skipping Debt Registry Pull
- Not appending staleness entries to tracking file

---

**NEXT:** Load `step-02b-kb-precheck.md`
