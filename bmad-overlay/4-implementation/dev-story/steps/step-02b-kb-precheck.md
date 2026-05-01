---
name: 'step-02b-kb-precheck'
description: 'Knowledge Base pre-check — scan for known issues before implementation (TD-31)'
workflow_path: '{project-root}/_bmad/bmm/workflows/4-implementation/dev-story'
thisStepFile: '{workflow_path}/steps/step-02b-kb-precheck.md'
nextStepFile: '{workflow_path}/steps/step-03-review-continuation.md'
---

# Step 2b: Knowledge Base Pre-Check

**Goal:** Scan knowledge-base for known issues matching this story's domain/skills before implementation.

---

## AVAILABLE STATE

- `{story_required_skills}` — from Step 2
- `{story_key}`, `{story_path}` — from Step 1

---

## STATE VARIABLES (set in this step)

- `{kb_relevant_entries}` — KB 已知問題列表

---

## EXECUTION SEQUENCE

> **CRITICAL:** TD-31: Scan knowledge-base for known problems matching this story's domain/skills.

### 1. Map Skills to KB Domains

Map `{story_required_skills}` to KB domains using this table:

| Skill | KB Domain |
|-------|-----------|
| `/pcpt-editor-arch` | frontend/, database/ |
| `/pcpt-admin-module` | backend/ |
| `/pcpt-sqlserver` | database/ |
| `/pcpt-pdf-engine` | backend/ |
| `/pcpt-zustand-patterns` | frontend/ |
| `/pcpt-testing-patterns` | frontend/ backend/ database/ devops/ workflow/ |
| `/pcpt-auth-identity` | backend/ |
| `/pcpt-payment-subscription` | backend/ |
| `/pcpt-business-api` | backend/ |
| `/pcpt-i18n-seo` | frontend/ backend/ |
| `/pcpt-signalr-realtime` | backend/ |
| `/pcpt-background-services` | backend/ |
| (default, no skills) | all domains |

### 2. Scan KB Directory

Set `{kb_base_path}` = `{project-root}/docs/knowledge-base/troubleshooting`

**If `{kb_base_path}` directory exists:**
1. For EACH mapped domain:
   - Use Glob to find all `*.md` files in `docs/knowledge-base/troubleshooting/{domain}/`
   - Exclude `_template.md`
   - Read frontmatter (title, keywords, error_patterns, related_skills, status, occurrences, severity)
   - Compare keywords against current story's AC/Tasks text
   - If ≥2 keyword matches AND status != "resolved-by-skill" → mark as relevant
2. If relevant entries found:
   - Read full content of each relevant entry
   - Store as `{kb_relevant_entries}` list
   - Output: 📚 **Knowledge Base Pre-Check Results:** [list with severity/id/title/occurrences]
   - ⚠️ Review these known issues BEFORE implementing related tasks
3. If no relevant entries found:
   - Set `{kb_relevant_entries}` = empty
   - Output: ✅ No relevant KB entries found — proceeding with implementation

**If `{kb_base_path}` does NOT exist:**
- Set `{kb_relevant_entries}` = empty
- Output: ℹ️ Knowledge base not yet initialized — skipping KB pre-check

---

## SUCCESS METRICS

- `{kb_relevant_entries}` set (empty or with items)
- Relevant entries read in full
- Known issues surfaced before implementation

## FAILURE MODES

- Skipping KB scan when directory exists
- Not reading full content of relevant entries
- Using keyword match without reading frontmatter

---

**NEXT:** Load `step-03-review-continuation.md`
